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
  Info,
  Maximize2,
  Box,
  Printer,
  Download,
  Phone,
  User,
  Hash,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { CargoItem, TrailerPlan } from './types';
import { packCargo } from './utils/packing';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
    width: 0,
    rig: 'RIG_DEFAULT',
    segment: 'OIL_GAS'
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
      setNewItem({ type: '', serialNumber: '', length: 0, width: 0, rig: 'RIG_DEFAULT', segment: 'OIL_GAS' });
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
            segment: '-',
            rig: '-',
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
      // Vercel/Vite Ready API Key detection
      const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Missing API Key");

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Logistics Expert Analysis for "${projectName}": Manifest: ${JSON.stringify(cargo.map(i => ({ type: i.type, sn: i.serialNumber, dim: `${i.length}x${i.width}` })))}, Efficiency: ${(trailers.reduce((acc, t) => acc + t.fillPercentage, 0) / (trailers.length || 1)).toFixed(1)}%. Brief tech summary (2 bullet points) + 1 safety tip.`;
      const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt });
      setAiAnalysis(response.text);
    } catch (error: any) {
      setAiAnalysis(`Info: ${error.message}`);
    } finally { setIsAnalyzing(false); }
  };

  const handleDownloadPDF = async () => {
    if (cargo.length === 0 || !reportRef.current) return;
    setIsExporting(true);
    try {
      await new Promise(r => setTimeout(r, 600));
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const trailersList = reportRef.current.querySelectorAll('.trailer-card');
      
      for (let i = 0; i < trailersList.length; i++) {
        const element = trailersList[i] as HTMLElement;
        const canvas = await html2canvas(element, {
          scale: 1.5,
          useCORS: true,
          backgroundColor: '#FFFFFF',
          onclone: (clonedDoc) => {
            const allElements = clonedDoc.getElementsByTagName('*');
            for (let j = 0; j < allElements.length; j++) {
              const el = allElements[j] as HTMLElement;
              const style = window.getComputedStyle(el);
              const isModern = (v: string) => v.includes('oklch') || v.includes('oklab');
              if (isModern(style.color)) el.style.color = '#1e293b';
              if (isModern(style.backgroundColor)) el.style.backgroundColor = '#ffffff';
              if (isModern(style.borderColor)) el.style.borderColor = '#e2e8f0';
              if (isModern(style.boxShadow)) el.style.boxShadow = 'none';
            }
          }
        });
        if (i > 0) pdf.addPage('a4', 'l');
        pdf.setFontSize(14);
        pdf.text(`PROJECT: ${projectName.toUpperCase()}`, 15, 12);
        pdf.setFontSize(9);
        pdf.text(`Loading Plan Page ${i + 1}/${trailersList.length}`, 15, 17);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 10, 22, 277, (canvas.height * 277) / canvas.width);
      }
      pdf.save(`${projectName.replace(/\s+/g, '_')}_LOAD_PLAN.pdf`);
    } catch (error: any) { alert('PDF Error: ' + error.message); } finally { setIsExporting(false); }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F0F2F5]">
      {/* Sidebar */}
      <aside className={`sidebar flex flex-col shrink-0 text-white/90 transition-all duration-500 relative border-r border-white/5 z-50 no-print ${isSidebarCollapsed ? 'w-16' : 'w-[320px]'}`}>
        <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="absolute -right-3 top-10 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-slate-900 shadow-xl border-2 border-white">{isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
        <div className={`flex flex-col h-full ${isSidebarCollapsed ? 'items-center py-6' : 'p-6'}`}>
          <div className={`flex items-center gap-3 mb-8 ${isSidebarCollapsed ? 'opacity-0 h-0' : 'opacity-100'}`}><div className="w-10 h-10 bg-amber-500 rounded flex items-center justify-center font-black text-slate-900">TL</div>{!isSidebarCollapsed && <div><h1 className="font-bold text-lg leading-tight">DeckMaster Plan</h1><span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Engineering Edition</span></div>}</div>
          <div className={`flex-1 overflow-y-auto space-y-6 scrollbar-hide ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
             <section className="space-y-4">
                <h3 className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Project Meta</h3>
                <input placeholder="Project Name" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={projectName} onChange={e => setProjectName(e.target.value)} />
                <button onClick={generateAIInsights} disabled={isAnalyzing || cargo.length === 0} className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${isAnalyzing ? 'bg-slate-700 text-white/50' : 'bg-amber-500 text-slate-900 hover:bg-amber-400'}`}>{isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}{isAnalyzing ? 'Thinking...' : 'AI Manifest Insights'}</button>
                {aiAnalysis && <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] text-white/70 italic whitespace-pre-wrap"><div className="flex justify-between mb-1 border-b border-white/5 pb-1"><span className="text-amber-500 font-black uppercase">AI Analysis</span><button onClick={() => setAiAnalysis(null)} className="opacity-40 whitespace-nowrap">✕ Close</button></div>{aiAnalysis}</div>}
             </section>
             <section className="space-y-3"><h3 className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Cargo Input</h3><button onClick={() => setShowPasteModal(true)} className="w-full bg-slate-800 border border-slate-700 hover:border-amber-500 rounded py-2.5 text-xs font-bold flex items-center justify-center gap-2 text-white/80"><FileText size={14} className="text-amber-500" /> Bulk Import (Excel)</button></section>
             <section className="space-y-3"><h3 className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Individual Item</h3><input placeholder="Type (e.g. Rack, Basket)" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm" value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})} /><input placeholder="Serial No." className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm" value={newItem.serialNumber} onChange={e => setNewItem({...newItem, serialNumber: e.target.value})} /><div className="grid grid-cols-2 gap-2"><input type="number" placeholder="L (cm)" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm" value={newItem.length || ''} onChange={e => setNewItem({...newItem, length: Number(e.target.value)})} /><input type="number" placeholder="W (cm)" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm" value={newItem.width || ''} onChange={e => setNewItem({...newItem, width: Number(e.target.value)})} /></div><button onClick={handleAddItem} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 rounded text-sm transition-all">+ Add To Deck</button></section>
             <section className="flex-1 flex flex-col min-h-[200px]"><div className="flex justify-between items-center mb-4"><h3 className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Inventory ({cargo.length})</h3><button onClick={handleClearAll} className="text-[10px] text-red-400 hover:underline">Clear All</button></div><div className="space-y-2 overflow-y-auto flex-1 pr-1 scrollbar-hide">{cargo.map(item => (<div key={item.id} className="rounded-lg p-3 bg-slate-800/50 border border-slate-700 flex justify-between items-center group"><div className="min-w-0 pr-2"><p className="text-xs font-bold text-white truncate">{item.type}</p><p className="text-[10px] text-white/40">{item.serialNumber} | {item.length}x{item.width}</p></div><button onClick={() => handleRemoveItem(item.id)} className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white p-1.5 rounded-lg transition-all"><Trash2 size={12} /></button></div>))}</div></section>
          </div>
        </div>
      </aside>

      {/* Main Stage */}
      <main className="flex-1 flex flex-col bg-[#F0F2F5] p-8 overflow-y-auto">
        <header className="flex justify-between items-end mb-8">
           <div><p className="text-[11px] text-gray-500 uppercase tracking-widest font-black mb-1">{projectName.toUpperCase()}</p><h2 className="text-3xl font-black text-slate-900 flex items-center gap-4">Carrier Load Optimizer<div className="flex items-center gap-2 bg-white rounded-lg border p-1 px-3"><div className="flex flex-col items-center"><span className="text-[9px] text-gray-400 font-bold uppercase">L</span><input type="number" value={trailerLength} onChange={(e) => setTrailerLength(Number(e.target.value))} className="bg-transparent font-mono text-xs font-black w-12 text-center" /></div><div className="w-px h-6 bg-gray-100 mx-1"></div><div className="flex flex-col items-center"><span className="text-[9px] text-gray-400 font-bold uppercase">W</span><input type="number" value={trailerWidth} onChange={(e) => setTrailerWidth(Number(e.target.value))} className="bg-transparent font-mono text-xs font-black w-10 text-center" /></div></div></h2></div>
           <div className="flex gap-3 no-print"><button onClick={() => window.print()} className="bg-white border px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-50"><Printer size={16} /> Print</button><button disabled={isExporting} onClick={handleDownloadPDF} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">{isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF</button></div>
        </header>

        <div ref={reportRef} className="flex-1 space-y-12">
          {trailers.map(trailer => {
            const meta = trailerMetadata[trailer.id] || { license: '', driverName: '', driverPhone: '' };
            const updateMeta = (f: keyof typeof meta, v: string) => setTrailerMetadata(p => ({...p, [trailer.id]: {...meta, [f]: v}}));
            return (
              <div key={trailer.id} className="trailer-card bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col">
                <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
                   <div className="flex items-center gap-4 grow">
                      <div className="w-12 h-12 bg-slate-50 border rounded-xl flex items-center justify-center text-slate-400"><Truck size={24} /></div>
                      <div className="flex-1">
                         <div className="flex items-center mb-1"><h4 className="font-extrabold text-slate-900 mr-4">{trailer.id}</h4><div className="flex items-center gap-2 no-print shrink-0"><input placeholder="Plate No." className="bg-slate-50 border p-1 px-3 rounded text-[10px] w-24 outline-none" value={meta.license} onChange={e => updateMeta('license', e.target.value)} /><input placeholder="Driver" className="bg-slate-50 border p-1 px-3 rounded text-[10px] w-24 outline-none" value={meta.driverName} onChange={e => updateMeta('driverName', e.target.value)} /><input placeholder="Contact" className="bg-slate-50 border p-1 px-3 rounded text-[10px] w-24 outline-none" value={meta.driverPhone} onChange={e => updateMeta('driverPhone', e.target.value)} /></div></div>
                         <div className="hidden print:flex gap-4 text-[10px] text-slate-700 font-black uppercase"><span>Plate: {meta.license || '-'}</span><span>Driver: {meta.driverName || '-'}</span><span>Tel: {meta.driverPhone || '-'}</span></div>
                         <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{trailer.items.length} Units | Efficiency: {trailer.fillPercentage.toFixed(1)}%</div>
                      </div>
                   </div>
                   <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{width:`${trailer.fillPercentage}%`}}/></div>
                </div>

                <div className="p-12 flex items-center justify-center bg-slate-900/5 relative group overflow-x-auto min-h-[400px]">
                  <div className="trailer-bed relative rounded-sm bg-slate-900 border-4 border-slate-950 shadow-2xl" style={{width: `${trailer.length*0.7}px`, height: `${trailer.width*0.7}px`, overflow: allowOverhang ? 'visible' : 'hidden'}}>
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '35px 35px'}}/>
                    {trailer.items.map((item, i) => {
                      const mPos = manualPositions[item.id];
                      const dX = mPos ? mPos.x : item.x;
                      const dY = mPos ? mPos.y : item.y;
                      const isB = item.type.toLowerCase().includes('basket');
                      return (
                        <motion.div drag dragMomentum={false} onDragEnd={(_, inf) => setManualPositions(p => ({...p, [item.id]: {x: dX + (inf.offset.y/0.7), y: dY + (inf.offset.x/0.7)}}))} key={item.id}
                          className={`absolute border-2 overflow-hidden flex flex-col items-center justify-center p-1 cursor-move transition-all active:scale-95 group/cargo
                            ${isB ? 'bg-amber-400 border-amber-600 text-amber-900' : 'bg-slate-400 border-slate-500 text-slate-900'}`}
                          style={{left: `${dY*0.7}px`, top: `${dX*0.7}px`, width: `${item.length*0.7}px`, height: `${item.width*0.7}px`}}>
                          <p className="text-[10px] font-black uppercase truncate w-full px-1 text-center">{item.type}</p>
                          <p className="text-[7px] font-bold opacity-60 truncate w-full text-center">{item.serialNumber}</p>
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }} className="absolute top-0 right-0 bg-red-600 text-white p-0.5 opacity-0 group-hover/cargo:opacity-100"><Trash2 size={8}/></button>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="px-8 py-4 bg-gray-50 border-t"><table className="w-full text-left text-[10px] font-bold uppercase tracking-tight"><thead className="text-gray-400 border-b"><tr><th className="py-2">Serial</th><th>Cargo Type</th><th className="text-right">DIM (CM)</th><th className="text-right no-print">Action</th></tr></thead><tbody>{trailer.items.map(item => (<tr key={item.id} className="border-b border-gray-100 last:border-0"><td>{item.serialNumber}</td><td>{item.type}</td><td className="text-right">{item.length}x{item.width}</td><td className="text-right no-print"><button onClick={() => handleRemoveItem(item.id)} className="text-red-500 py-1">Delete</button></td></tr>))}</tbody></table></div>
              </div>
            );
          })}
        </div>
      </main>

      <AnimatePresence>
        {showPasteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6"><motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowPasteModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" /><motion.div initial={{opacity:0, scale:0.95, y: 20}} animate={{opacity:1, scale:1, y: 0}} exit={{opacity:0, scale:0.95}} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"><div className="px-10 py-8 border-b"><h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><Maximize2 size={24} className="text-amber-500" /> Bulk Import</h2><p className="text-sm text-gray-500">Order: <span className="font-mono text-blue-600 text-xs">Type | Serial | Length | Width</span></p></div><div className="p-8"><textarea className="w-full h-80 border-2 border-slate-100 bg-slate-50 rounded-2xl p-6 font-mono text-sm outline-none focus:border-amber-500" value={pasteValue} onChange={e => setPasteValue(e.target.value)} /></div><div className="px-10 py-6 bg-slate-50 flex justify-end gap-3"><button onClick={()=>setShowPasteModal(false)} className="text-sm font-bold text-slate-400 px-4">Cancel</button><button disabled={!pasteValue.trim()} onClick={handlePasteData} className="bg-slate-900 text-white rounded-xl px-10 py-2.5 text-sm font-bold disabled:opacity-50">Process Manifest</button></div></motion.div></div>
        )}
      </AnimatePresence>
    </div>
  );
}
