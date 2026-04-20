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
  const [trailerCapacity, setTrailerCapacity] = useState(25000);
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

  // Form state for manual entry
  const [newItem, setNewItem] = useState<Partial<CargoItem>>({
    type: '',
    serialNumber: '',
    length: 0,
    width: 0,
    weight: 0,
    rig: 'COSL GIFT',
    segment: 'Testing'
  });

  const trailers = useMemo(() => {
    return packCargo(cargo, trailerWidth, trailerLength, allowOverhang, trailerCapacity);
  }, [cargo, trailerWidth, trailerLength, allowOverhang, trailerCapacity]);

  const handleAddItem = () => {
    if (newItem.type && newItem.length && newItem.width) {
      setCargo([...cargo, { 
        ...newItem, 
        id: Math.random().toString(36).substr(2, 9),
        weight: newItem.weight || 0
      } as CargoItem]);
      setNewItem({ type: '', serialNumber: '', length: 0, width: 0, weight: 0, rig: 'COSL GIFT', segment: 'Testing' });
    }
  };

  const handleRemoveItem = (id: string) => {
    setCargo(cargo.filter(item => item.id !== id));
  };

  const handleMoveItemToTrailer = (itemId: string, direction: 'prev' | 'next') => {
    setCargo(prev => {
      const item = prev.find(i => i.id === itemId);
      if (!item) return prev;

      // Find current trailer index
      let currentIdx = item.manualTrailerIndex;
      if (currentIdx === undefined) {
        currentIdx = trailers.findIndex(t => t.items.some(i => i.id === itemId));
      }

      if (currentIdx === -1) return prev;

      let nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
      if (nextIdx < 0) nextIdx = 0;

      // Reset manual position if moving to a different trailer
      setManualPositions(pos => {
        const newPos = { ...pos };
        delete newPos[itemId];
        return newPos;
      });

      return prev.map(i => i.id === itemId ? { ...i, manualTrailerIndex: nextIdx } : i);
    });
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
        const [type, serial, l, w, wt] = parts;
        const length = parseInt(l);
        const width = parseInt(w);
        const weight = parseInt(wt) || 0;
        if (!isNaN(length) && !isNaN(width)) {
          newItems.push({
            id: Math.random().toString(36).substr(2, 9),
            type: type || 'Unknown',
            serialNumber: serial || '-',
            segment: '-',
            rig: '-',
            length,
            width,
            weight
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
      // Robust API key detection for both AI Studio and Vercel/Vite environments
      const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY not found in environment variables.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are an expert in Heavy Vehicle Cargo Securement, strictly following SLB (Schlumberger) safety standards. 
Your task is to evaluate the match between a specific cargo and a trailer based on the manifest below and provide a comprehensive, safe loading and securing plan.

PROJECT: "${projectName}"
TRAILER DATA: Capacity ${trailerCapacity}kg per trailer, Dimensions ${trailerWidth}x${trailerLength}cm.
MANIFEST: ${JSON.stringify(cargo.map(i => ({ type: i.type, sn: i.serialNumber, dim: i.length + 'x' + i.width, wt: i.weight + 'kg' })))}
CURRENT PLAN: ${trailers.length} trailers utilized.

STRICT SLB SECUREMENT RULES (MANDATORY):
1. WEIGHT & DISTRIBUTION: 
   - Verify Trailer Capacity vs Total Cargo Weight.
   - 60/50 Rule: Max 60% of cargo weight can be placed on center 50% of trailer deck length.
   - Aggregate WLL Calculation: Must calculate and show that Aggregate WLL is at least 50% of the cargo weight (e.g., 5,000kg cargo requires 2,500kg Aggregate WLL).

2. EQUIPMENT & FRICTION:
   - ONLY Ratchet type load binders. 'Break Over' binders are STRICTLY PROHIBITED.
   - Steel-on-Steel friction (e.g., CCU on Steel Deck) is extremely low (CoF ~0.15). MUST mandate high-friction rubber mats (CoF 0.6) or significantly increase tie-downs.
   - Minimum Grade 70 "Transport Chain" (3/8" or 10mm).

3. SECURING QUANTITIES:
   - Min 2 tie-downs for first 3 meters of cargo length, plus 1 tie-down for every additional 3 meters or fraction thereof.
   - Weight rule: 1 tie-down for every 4,500kg if weight exceeds length rule requirements.

4. CCU / ISO CONTAINER SPECIFICS:
   - UNLOADED CCU: May use over-the-top straps.
   - LOADED CCU: STRAPPED OVER ROOF IS PROHIBITED. Must secure using Corner Castings with direct tie-downs in diagonal cross (X-cross) configuration.

5. FORCES: System must withstand: 0.8g Forward, 0.5g Rearward, 0.5g Lateral, 0.2g Upward.

OUTPUT FORMAT (Must be in Thai):
1. สรุปความปลอดภัย (Safety Summary): [ปลอดภัย / ต้องแก้ไข / ไม่ปลอดภัย]
2. การคำนวณ WLL และน้ำหนัก (WLL & Weight Calculations): แสดงการคำนวณ Aggregate WLL ที่ 50% ของน้ำหนักจริง
3. อุปกรณ์และการจัดการแรงเสียดทาน (Equipment & Friction Management): ระบุเรื่องห้ามใช้ Break-Over และความจำเป็นของแผ่นกันลื่น
4. วิธีการรัดตรึงตามประเภทสินค้า (Specific Securing Method): เจาะจงเรื่องการรัดตู้ CCU และจำนวนสายรัดตามความยาว
5. ข้อควรระวังพิเศษสำหรับ SLB (SLB Special Precautions)

Keep the technical terminology accurate but the explanation clear for field operators.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      
      setAiAnalysis(response.text);
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      setAiAnalysis(`Error: ${error.message || "Failed to generate AI insights."}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePrint = () => {
    try {
      if (cargo.length === 0) {
        alert("⚠️ Your manifest is empty.");
        return;
      }
      window.print();
    } catch (err) {
      console.error("Print failed:", err);
    }
  };

  const handleDownloadPDF = async () => {
    if (cargo.length === 0 || !reportRef.current) {
        alert("⚠️ Inventory is empty.");
        return;
    }

    setIsExporting(true);
    
    try {
      // Allow UI to stabilize and ensure fonts are ready
      await new Promise(r => setTimeout(r, 800));
      const pdf = new jsPDF({ 
        orientation: 'landscape', 
        unit: 'mm', 
        format: 'a4',
        compress: true 
      });
      const trailersList = reportRef.current.querySelectorAll('.trailer-card');
      
      for (let i = 0; i < trailersList.length; i++) {
        const element = trailersList[i] as HTMLElement;
        const canvas = await html2canvas(element, {
          scale: 2.2, // Higher scale for text clarity
          useCORS: true,
          logging: false,
          allowTaint: true,
          backgroundColor: '#FFFFFF',
          onclone: (clonedDoc) => {
            // Force cloned document and body to be very wide to prevent viewport clipping
            clonedDoc.documentElement.style.width = '4000px';
            clonedDoc.body.style.width = '4000px';
            clonedDoc.body.style.overflow = 'visible';

            // FIX: Prevent clipping by forcing containers to show all content
            const cards = clonedDoc.querySelectorAll('.trailer-card');
            cards.forEach(card => {
              const c = card as HTMLElement;
              c.style.overflow = 'visible';
              c.style.width = 'fit-content';
              c.style.minWidth = 'fit-content';
            });

            const scrollCaps = clonedDoc.querySelectorAll('.overflow-x-auto');
            scrollCaps.forEach(cap => {
              const c = cap as HTMLElement;
              c.style.overflow = 'visible';
              c.style.width = 'fit-content';
              c.style.display = 'block';
            });

            const allElements = clonedDoc.getElementsByTagName('*');
            for (let j = 0; j < allElements.length; j++) {
              const el = allElements[j] as HTMLElement;
              const style = window.getComputedStyle(el);
              
              // Handle OKLAB/OKLCH fallback
              const isModern = (v: string) => v.includes('oklch') || v.includes('oklab');
              if (isModern(style.color)) el.style.color = '#1e293b';
              if (isModern(style.backgroundColor)) el.style.backgroundColor = '#ffffff';
              if (isModern(style.borderColor)) el.style.borderColor = '#e2e8f0';
              if (isModern(style.boxShadow)) el.style.boxShadow = 'none';

              // FIX: Text clipping by forcing block display and line-height
              if (el.tagName === 'P' || el.tagName === 'SPAN') {
                el.style.display = 'block';
                el.style.lineHeight = '1.1';
                el.style.overflow = 'visible';
                el.style.height = 'auto';
              }
              
              // Ensure input values are visible as text in PDF
              if (el instanceof HTMLInputElement && el.value) {
                const text = clonedDoc.createElement('span');
                text.innerText = el.value;
                text.style.fontSize = '26px';
                text.style.fontWeight = 'bold';
                el.parentNode?.replaceChild(text, el);
              }
            }
          }
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        if (i > 0) pdf.addPage('a4', 'l');
        
        pdf.setFontSize(14);
        pdf.setTextColor(30, 41, 59);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`PROJECT: ${projectName.toUpperCase()}`, 15, 12);
        
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Loading Deck Plan - Page ${i + 1}/${trailersList.length} | Date: ${new Date().toLocaleDateString()}`, 15, 17);
        
        const imgProps = pdf.getImageProperties(imgData);
        const pdfW = 277;
        const pdfH = (imgProps.height * pdfW) / imgProps.width;
        pdf.addImage(imgData, 'JPEG', 10, 22, pdfW, pdfH);
      }
      
      pdf.save(`${projectName.replace(/\s+/g, '_')}_LOAD_PLAN.pdf`);
    } catch (error: any) {
      console.error('PDF Export Error:', error);
      alert('PDF Error: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F0F2F5]">
      <aside className={`sidebar flex flex-col shrink-0 text-white/90 transition-all duration-500 relative border-r border-white/5 z-50 no-print ${isSidebarCollapsed ? 'w-16' : 'w-[320px]'}`}>
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-10 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-slate-900 shadow-xl z-50 border-2 border-white"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={`flex flex-col h-full ${isSidebarCollapsed ? 'items-center py-6' : 'p-6'}`}>
          <div className={`flex items-center gap-3 mb-8 ${isSidebarCollapsed ? 'opacity-0 h-0' : 'opacity-100'}`}>
            <div className="w-10 h-10 bg-amber-500 rounded flex items-center justify-center font-black text-slate-900">TL</div>
            {!isSidebarCollapsed && (
              <div>
                <h1 className="font-bold text-lg leading-tight">TrailerLoad Elite</h1>
                <span className="text-[10px] text-white/40 uppercase font-bold">Engineering Edition</span>
              </div>
            )}
          </div>

          <div className={`flex-1 overflow-y-auto space-y-6 scrollbar-hide ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
             <section className="space-y-4">
                <h3 className="text-[10px] text-white/40 uppercase font-bold">Project Information</h3>
                <input 
                  placeholder="Project Name"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                />
                <button 
                  onClick={generateAIInsights}
                  disabled={isAnalyzing || cargo.length === 0}
                  className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${isAnalyzing ? 'bg-slate-700 text-white/50' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-900'}`}
                >
                  {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {isAnalyzing ? 'Analyzing...' : 'Get AI Load Insights'}
                </button>
                {aiAnalysis && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] leading-relaxed text-white/70 italic whitespace-pre-wrap">
                    <div className="flex justify-between mb-1 border-b border-white/5 pb-1">
                      <span className="text-amber-500 font-black uppercase">AI Insights</span>
                      <button onClick={() => setAiAnalysis(null)} className="opacity-40 hover:opacity-100">✕</button>
                    </div>
                    {aiAnalysis}
                  </div>
                )}
             </section>

             <section className="space-y-3">
                <h3 className="text-[10px] text-white/40 uppercase font-bold">Manage Manifest</h3>
                <button onClick={() => setShowPasteModal(true)} className="w-full bg-slate-800 border border-slate-700 hover:border-amber-500 rounded py-2.5 text-xs font-bold flex items-center justify-center gap-2">
                  <FileText size={14} className="text-amber-500" /> Import Excel Data
                </button>
             </section>

             <section className="space-y-3">
                <h3 className="text-[10px] text-white/40 uppercase font-bold">Add Individual Item</h3>
                <input placeholder="Item Type" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})} />
                <input placeholder="Serial Number" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.serialNumber} onChange={e => setNewItem({...newItem, serialNumber: e.target.value})} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="L (cm)" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.length || ''} onChange={e => setNewItem({...newItem, length: Number(e.target.value)})} />
                  <input type="number" placeholder="W (cm)" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.width || ''} onChange={e => setNewItem({...newItem, width: Number(e.target.value)})} />
                </div>
                <input type="number" placeholder="Weight (kg)" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.weight || ''} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})} />
                <button onClick={handleAddItem} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-2.5 rounded text-sm transition-all">Add to Manifest</button>
             </section>

             <section className="flex-1 overflow-hidden flex flex-col min-h-[200px]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[10px] text-white/40 uppercase font-bold">Loadlist ({cargo.length})</h3>
                  <button onClick={handleClearAll} className="text-[10px] text-red-400/60 hover:text-red-400 font-bold uppercase">Clear All</button>
                </div>
                <div className="space-y-2 overflow-y-auto flex-1 pr-2 scrollbar-hide">
                  {cargo.map(item => (
                    <div key={item.id} className="rounded-lg p-3 bg-slate-800/50 border border-slate-700 flex justify-between items-center group">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold text-white truncate">{item.type}</p>
                        <p className="text-[10px] text-white/40">{item.serialNumber} | {item.length}x{item.width} | {item.weight}kg</p>
                      </div>
                      <button onClick={() => handleRemoveItem(item.id)} className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white p-1.5 rounded-lg transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
             </section>
          </div>
        </div>

        {isSidebarCollapsed && (
          <div className="mt-auto p-4 flex flex-col gap-4 items-center border-t border-white/5">
             <button onClick={() => setShowPasteModal(true)} className="text-white/40 hover:text-white"><FileText size={20} /></button>
             <button onClick={handleClearAll} className="text-white/40 hover:text-red-400"><RotateCcw size={20} /></button>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col bg-[#F0F2F5] p-8 overflow-y-auto">
        <header className="flex justify-between items-end mb-8">
           <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold mb-1">PROJECT: {projectName.toUpperCase()}</p>
              <h2 className="text-3xl font-black text-slate-900 flex items-center gap-4">
                Deck Master Plan
                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1 px-3 shadow-sm">
                   <div className="flex flex-col items-center">
                     <span className="text-[9px] text-gray-400 font-bold uppercase">L</span>
                     <input type="number" value={trailerLength} onChange={(e) => setTrailerLength(Number(e.target.value))} className="bg-transparent font-mono text-sm font-black w-14 text-center outline-none" />
                   </div>
                   <div className="w-px h-6 bg-gray-100 mx-1"></div>
                   <div className="flex flex-col items-center">
                     <span className="text-[9px] text-gray-400 font-bold uppercase">W</span>
                     <input type="number" value={trailerWidth} onChange={(e) => setTrailerWidth(Number(e.target.value))} className="bg-transparent font-mono text-sm font-black w-10 text-center outline-none" />
                   </div>
                   <div className="w-px h-6 bg-gray-100 mx-1"></div>
                   <div className="flex flex-col items-center">
                     <span className="text-[9px] text-gray-400 font-bold uppercase">SWL (kg)</span>
                     <input type="number" value={trailerCapacity} onChange={(e) => setTrailerCapacity(Number(e.target.value))} className="bg-transparent font-mono text-sm font-black w-16 text-center outline-none" />
                   </div>
                </div>
              </h2>
           </div>
           <div className="flex gap-3 no-print">
              <button onClick={handlePrint} className="bg-white border border-gray-200 px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-50"><Printer size={16} /> Print</button>
              <button disabled={isExporting} onClick={handleDownloadPDF} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} PDF
              </button>
           </div>
        </header>

        <div ref={reportRef} className="flex-1 space-y-8">
          {trailers.map(trailer => {
            const meta = trailerMetadata[trailer.id] || { license: '', driverName: '', driverPhone: '' };
            const updateMeta = (f: keyof typeof meta, v: string) => setTrailerMetadata(p => ({...p, [trailer.id]: {...meta, [f]: v}}));
            return (
              <div key={trailer.id} className="trailer-card bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col">
                <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
                   <div className="flex items-center gap-4 grow">
                      <div className="w-12 h-12 bg-slate-50 border border-gray-100 rounded-xl flex items-center justify-center text-slate-400"><Truck size={24} /></div>
                      <div className="flex-1">
                         <div className="flex items-center mb-1">
                            <h4 className="font-black text-slate-900 mr-8">{trailer.id}</h4>
                            <div className="flex items-center gap-4 no-print flex-1">
                               <input placeholder="License" className="bg-slate-50 border p-1 px-2 rounded text-[10px] w-32" value={meta.license} onChange={e => updateMeta('license', e.target.value)} />
                               <input placeholder="Driver" className="bg-slate-50 border p-1 px-2 rounded text-[10px] w-32" value={meta.driverName} onChange={e => updateMeta('driverName', e.target.value)} />
                               <input placeholder="Phone" className="bg-slate-50 border p-1 px-2 rounded text-[10px] w-32" value={meta.driverPhone} onChange={e => updateMeta('driverPhone', e.target.value)} />
                            </div>
                         </div>
                         <div className="hidden print:flex gap-4 text-[10px] text-slate-600 font-bold mb-1">
                           {meta.license && <span>Plate: {meta.license}</span>}
                           {meta.driverName && <span>Driver: {meta.driverName}</span>}
                           {meta.driverPhone && <span>Tel: {meta.driverPhone}</span>}
                         </div>
                         <div className="text-[10px] text-gray-400 font-bold">
                            {trailer.items.length} Units | {trailer.width}x{trailer.length} cm Bed | Payload: {trailer.totalWeight} / {trailer.capacity} kg
                         </div>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Efficiency: <span className="text-blue-600">{trailer.fillPercentage.toFixed(1)}%</span></p>
                      <div className="w-32 h-2 bg-gray-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-blue-500" style={{width:`${trailer.fillPercentage}%`}}/></div>
                   </div>
                </div>

                <div className="p-8 flex items-center justify-center bg-slate-900/5 relative group overflow-x-auto min-h-[400px]">
                  <div className="trailer-bed shadow-2xl relative rounded bg-slate-900 border-4 border-slate-950" style={{width: `${trailer.length*0.8}px`, height: `${trailer.width*0.8}px`, overflow: allowOverhang ? 'visible' : 'hidden'}}>
                    <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '25px 25px'}}></div>
                    {trailer.items.map((item, i) => {
                      const mPos = manualPositions[item.id];
                      const dX = mPos ? mPos.x : item.x;
                      const dY = mPos ? mPos.y : item.y;
                      const isB = item.type.toLowerCase().includes('basket');
                      const isR = item.type.toLowerCase().includes('rack');
                      const isC = item.type.toLowerCase().includes('container') || item.type.toLowerCase().includes('ccu');
                      return (
                        <motion.div
                          drag dragMomentum={false}
                          dragConstraints={{left:0, top:0, right: trailer.length*0.8 - item.length*0.8, bottom: trailer.width*0.8 - item.width*0.8}}
                          onDragEnd={(_, inf) => setManualPositions(p => ({...p, [item.id]: {x: dX + (inf.offset.y/0.8), y: dY + (inf.offset.x/0.8)}}))}
                          key={item.id}
                          className={`absolute border-2 overflow-visible flex flex-col items-center justify-center p-1 cursor-move transition-all active:scale-95 group/cargo
                            ${isB ? 'bg-amber-400 border-amber-600 text-amber-900' : isR ? 'bg-orange-500 border-orange-700 text-white' : isC ? 'bg-blue-500 border-blue-700 text-white' : 'bg-slate-400 border-slate-500 text-slate-900'}`}
                          style={{left: `${dY*0.8}px`, top: `${dX*0.8}px`, width: `${item.length*0.8}px`, height: `${item.width*0.8}px`}}
                        >
                          <p className="text-[14px] font-black uppercase truncate w-full text-center leading-tight">{item.type}</p>
                          <p className="text-[11px] font-bold opacity-100 truncate w-full text-center">{item.serialNumber}</p>
                          
                          <div className="absolute top-0 right-0 flex gap-0.5 opacity-0 group-hover/cargo:opacity-100 transition-opacity no-print">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleMoveItemToTrailer(item.id, 'prev'); }} 
                              className="bg-slate-700 text-white p-0.5 hover:bg-slate-600 rounded-bl"
                              title="Move to Previous Trailer"
                            >
                              <ChevronLeft size={10}/>
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleMoveItemToTrailer(item.id, 'next'); }} 
                              className="bg-slate-700 text-white p-0.5 hover:bg-slate-600"
                              title="Move to Next Trailer"
                            >
                              <ChevronRight size={10}/>
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }} 
                              className="bg-red-600 text-white p-0.5 hover:bg-red-500"
                              title="Delete Item"
                            >
                              <Trash2 size={10}/>
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-100 text-[10px]">
                  <table className="w-full text-left">
                    <thead className="text-gray-400 uppercase font-black"><tr className="border-b border-gray-200"><th>Series</th><th>Type</th><th className="text-right">Dim (cm)</th><th className="text-right">Weight (kg)</th><th className="text-right no-print">Action</th></tr></thead>
                    <tbody>
                      {trailer.items.map(item => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-white/50">
                          <td className="py-2 font-black">{item.serialNumber}</td>
                          <td>{item.type}</td>
                          <td className="text-right">{item.length}x{item.width}</td>
                          <td className="text-right">{item.weight}</td>
                          <td className="text-right no-print">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleMoveItemToTrailer(item.id, 'prev')} className="text-slate-400 hover:text-slate-600 font-bold">Prev</button>
                              <button onClick={() => handleMoveItemToTrailer(item.id, 'next')} className="text-slate-400 hover:text-slate-600 font-bold">Next</button>
                              <button onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-600 font-bold ml-2">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <AnimatePresence>
        {showPasteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowPasteModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.95}} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-10 py-8 border-b border-gray-100">
                <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><Maximize2 className="text-amber-500" /> Spreadsheet Import</h2>
                <p className="text-sm text-gray-500 mt-2">Required order: <span className="font-mono text-blue-600 font-bold text-xs">Type | Serial | Length | Width | Weight</span></p>
              </div>
              <div className="p-8"><textarea className="w-full h-64 border-2 border-slate-100 bg-slate-50/50 rounded-2xl p-6 font-mono text-sm outline-none focus:border-amber-500 focus:bg-white transition-all shadow-inner" placeholder="Workshop Container	09-009	Testing	COSL GIFT	490	244..." value={pasteValue} onChange={e => setPasteValue(e.target.value)} /></div>
              <div className="px-10 py-6 bg-slate-50 flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Units: {pasteValue.split('\n').filter(l=>l.trim()).length}</span>
                <div className="flex gap-3">
                  <button onClick={()=>setShowPasteModal(false)} className="text-sm font-bold text-slate-400">Cancel</button>
                  <button disabled={!pasteValue.trim()} onClick={handlePasteData} className="bg-slate-900 text-white rounded-xl px-10 py-2.5 text-sm font-bold disabled:opacity-50">Import Manifest</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
