/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { 
  Truck, 
  RotateCcw, 
  Trash2, 
  FileText, 
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Printer,
  Download,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { packCargo } from './utils/packing';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Types ---
interface CargoItem {
  id: string;
  type: string;
  serialNumber: string;
  length: number;
  width: number;
  rig?: string;
  segment?: string;
  x?: number;
  y?: number;
}

export default function App() {
  const [projectName, setProjectName] = useState('DECK_LOAD_PLAN');
  const [cargo, setCargo] = useState<CargoItem[]>([]);
  const [trailerWidth, setTrailerWidth] = useState(250);
  const [trailerLength, setTrailerLength] = useState(1200);
  const [pasteValue, setPasteValue] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [allowOverhang, setAllowOverhang] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number, y: number }>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [trailerMetadata, setTrailerMetadata] = useState<Record<string, { license: string, driverName: string, driverPhone: string }>>({});
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const [newItem, setNewItem] = useState<Partial<CargoItem>>({
    type: '',
    serialNumber: '',
    length: 0,
    width: 0
  });

  const trailers = useMemo(() => {
    return packCargo(cargo, trailerWidth, trailerLength, allowOverhang);
  }, [cargo, trailerWidth, trailerLength, allowOverhang]);

  const handleAddItem = () => {
    if (newItem.type && newItem.length && newItem.width) {
      setCargo([...cargo, { 
        ...newItem, 
        id: Math.random().toString(36).substr(2, 9)
      } as CargoItem]);
      setNewItem({ type: '', serialNumber: '', length: 0, width: 0 });
    }
  };

  const handleRemoveItem = (id: string) => {
    setCargo(cargo.filter(item => item.id !== id));
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all items?')) {
      setCargo([]);
      setManualPositions({});
    }
  };

  const handlePasteData = () => {
    const lines = pasteValue.split('\n');
    const newItems: CargoItem[] = [];
    lines.forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const [type, serial, l, w] = parts;
        const length = parseInt(l);
        const width = parseInt(w);
        if (!isNaN(length) && !isNaN(width)) {
          newItems.push({
            id: Math.random().toString(36).substr(2, 9),
            type: type || 'Unknown',
            serialNumber: serial || '-',
            length,
            width
          });
        }
      }
    });
    if (newItems.length > 0) {
      setCargo([...cargo, ...newItems]);
      setPasteValue('');
      setShowPasteModal(false);
    }
  };

  const generateAIInsights = async () => {
    if (cargo.length === 0) return;
    setIsAnalyzing(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY || "";
      if (!apiKey) throw new Error("API Key Missing");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `Analyze Oil & Gas cargo: Project ${projectName}, Items: ${cargo.length}. Efficiency: ${trailers[0]?.fillPercentage || 0}%. Provide 3 short technical bullet points for loading safety.`;
      const result = await model.generateContent(prompt);
      setAiAnalysis(result.response.text());
    } catch (error: any) {
      setAiAnalysis("AI Insights available after setting API Key.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current || cargo.length === 0) return;
    setIsExporting(true);
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const trailersList = reportRef.current.querySelectorAll('.trailer-card');
      
      for (let i = 0; i < trailersList.length; i++) {
        const element = trailersList[i] as HTMLElement;
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#FFFFFF',
          onclone: (doc) => {
            const elms = doc.getElementsByTagName('*');
            for(let j=0; j<elms.length; j++) {
                (elms[j] as HTMLElement).style.color = '#1e293b';
                if ((elms[j] as HTMLElement).style.backgroundColor.includes('okl')) {
                    (elms[j] as HTMLElement).style.backgroundColor = '#3b82f6';
                }
            }
          }
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdf.addPage('a4', 'l');
        pdf.setFontSize(16);
        pdf.text(`PROJECT: ${projectName}`, 15, 15);
        pdf.addImage(imgData, 'JPEG', 10, 25, 277, (canvas.height * 277) / canvas.width);
      }
      pdf.save(`${projectName}_PLAN.pdf`);
    } catch (e) {
      alert("PDF Error. Try 'Print Layout' instead.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen w-full flex bg-[#F0F2F5] font-sans">
      <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-80'} bg-slate-900 transition-all p-6 text-white flex flex-col no-print`}>
        <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center font-bold text-slate-900">TL</div>
            {!isSidebarCollapsed && <h1 className="font-black text-lg">TrailerLoad</h1>}
        </div>
        
        {!isSidebarCollapsed && (
          <div className="space-y-6 overflow-y-auto">
            <section>
                <label className="text-[10px] text-slate-400 uppercase font-bold">Project Name</label>
                <input className="w-full bg-slate-800 p-2 rounded mt-1 text-sm outline-none" value={projectName} onChange={e=>setProjectName(e.target.value)} />
            </section>
            <button onClick={() => setShowPasteModal(true)} className="w-full bg-slate-800 border border-slate-700 p-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                <FileText size={16} /> Import Excel
            </button>
            <section className="space-y-2">
                <label className="text-[10px] text-slate-400 uppercase font-bold">Add Item</label>
                <input placeholder="Type" className="w-full bg-slate-800 p-2 rounded text-sm" value={newItem.type} onChange={e=>setNewItem({...newItem, type:e.target.value})} />
                <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="L" className="bg-slate-800 p-2 rounded text-sm" value={newItem.length || ''} onChange={e=>setNewItem({...newItem, length:Number(e.target.value)})} />
                    <input type="number" placeholder="W" className="bg-slate-800 p-2 rounded text-sm" value={newItem.width || ''} onChange={e=>setNewItem({...newItem, width:Number(e.target.value)})} />
                </div>
                <button onClick={handleAddItem} className="w-full bg-amber-500 text-slate-900 font-bold p-2 rounded text-sm">Add</button>
            </section>
            <button onClick={handleClearAll} className="text-red-400 text-[10px] font-bold uppercase hover:underline">Clear Manifest</button>
          </div>
        )}
        <button onClick={()=>setIsSidebarCollapsed(!isSidebarCollapsed)} className="mt-auto self-center p-2 bg-slate-800 rounded-full text-amber-500">
            {isSidebarCollapsed ? <ChevronRight size={20}/> : <ChevronLeft size={20}/>}
        </button>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
            <div>
                <h2 className="text-4xl font-black text-slate-900">Deck Master Plan</h2>
                <div className="flex gap-4 mt-2 text-slate-500 font-bold text-sm">
                    <span>L: {trailerLength}cm</span>
                    <span>W: {trailerWidth}cm</span>
                </div>
            </div>
            <div className="flex gap-3 no-print">
                <button onClick={() => window.print()} className="bg-white border p-3 px-6 rounded-xl font-bold flex items-center gap-2 shadow-sm"><Printer size={18}/> Print</button>
                <button onClick={handleDownloadPDF} disabled={isExporting} className="bg-blue-600 text-white p-3 px-6 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200">
                    {isExporting ? <Loader2 className="animate-spin"/> : <Download size={18}/>} Export PDF
                </button>
            </div>
        </header>

        <div ref={reportRef} className="space-y-10">
            {trailers.map(t => (
                <div key={t.id} className="trailer-card bg-white rounded-3xl p-8 border border-slate-200 shadow-xl overflow-hidden">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400"><Truck size={28}/></div>
                            <div>
                                <h3 className="text-xl font-black">{t.id}</h3>
                                <p className="text-slate-400 text-xs font-bold uppercase">{t.items.length} Units on board</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-blue-600 font-black text-2xl">{t.fillPercentage.toFixed(1)}%</span>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Space Utilization</p>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-2xl p-6 flex justify-center items-center overflow-x-auto min-h-[300px]">
                        <div className="relative bg-slate-800 border-2 border-slate-700 rounded shadow-2xl" style={{width: `${t.length*0.6}px`, height: `${t.width*0.6}px`}}>
                            {t.items.map(item => (
                                <div key={item.id} className="absolute border bg-blue-500/90 border-blue-400 text-white flex flex-col items-center justify-center p-1 text-[8px] font-bold overflow-hidden" 
                                     style={{left:`${item.y*0.6}px`, top:`${item.x*0.6}px`, width:`${item.length*0.6}px`, height:`${item.width*0.6}px`}}>
                                    <span className="truncate w-full text-center">{item.serialNumber}</span>
                                    <span className="opacity-60">{item.length}x{item.width}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </main>

      <AnimatePresence>
        {showPasteModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-md">
                <div className="bg-white rounded-3xl w-full max-w-xl p-8 shadow-2xl">
                    <h3 className="text-2xl font-black mb-4">Paste Manifest</h3>
                    <textarea className="w-full h-60 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-mono text-xs outline-none focus:border-blue-500" 
                              placeholder="Container	SN123	120	120" value={pasteValue} onChange={e=>setPasteValue(e.target.value)} />
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={()=>setShowPasteModal(false)} className="font-bold text-slate-400">Cancel</button>
                        <button onClick={handlePasteData} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Import</button>
                    </div>
                </div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
}
