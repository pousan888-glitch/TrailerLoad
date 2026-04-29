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
  Loader2,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { CargoItem, TrailerPlan } from './types';
import { packCargo } from './utils/packing';
import { translations, Language } from './translations';
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
  const [allowOverhang, setAllowOverhang] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number, y: number }>>({});
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>('th');
  const t = translations;

  const handleSidebarItemDragEnd = (itemId: string, event: any, info: any) => {
    setDraggedItemId(null);
    const x = info.point.x;
    const y = info.point.y;
    
    // Find if we dropped over a trailer card
    const elements = document.elementsFromPoint(x, y);
    const trailerCard = elements.find(el => el.classList.contains('trailer-card'));
    
    if (trailerCard) {
      const trailerId = trailerCard.getAttribute('data-trailer-id');
      if (trailerId) {
        const trailerIndex = trailers.findIndex(t => t.id === trailerId);
        if (trailerIndex !== -1) {
          setCargo(prev => prev.map(item => 
            item.id === itemId ? { ...item, manualTrailerIndex: trailerIndex } : item
          ));
          // Reset position for the newly moved item
          setManualPositions(pos => {
            const newPos = { ...pos };
            delete newPos[itemId];
            return newPos;
          });
        }
      }
    }
  };
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
    if (window.confirm(t[lang].confirmClear)) {
      setCargo([]);
      setManualPositions({});
    }
  };

  const handlePasteData = () => {
    const lines = pasteValue.split('\n').map(l => l.trim()).filter(l => l);
    const newItems: CargoItem[] = [];
    
    lines.forEach(line => {
      // Try tab first, then comma, then semicolon
      let parts = line.split('\t');
      if (parts.length < 3) parts = line.split(',');
      if (parts.length < 3) parts = line.split(';');

      if (parts.length >= 3) {
        // Some users might have headers, we skip if it's not numbers
        const potentialL = parseFloat(parts[2]?.replace(/[^\d.]/g, ''));
        const potentialW = parseFloat(parts[3]?.replace(/[^\d.]/g, ''));
        
        if (!isNaN(potentialL) && !isNaN(potentialW)) {
          newItems.push({
            id: crypto.randomUUID?.() || Math.random().toString(36).substring(2, 11),
            type: (parts[0] || 'Item').trim(),
            serialNumber: (parts[1] || '-').trim(),
            segment: '-',
            rig: '-',
            length: potentialL,
            width: potentialW,
            weight: parseFloat(parts[4]?.replace(/[^\d.]/g, '')) || 0
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
   - CoG (Center of Gravity): Must be on longitudinal centerline and as low as possible. Heavy items at the bottom.
   - 60/50 Rule: Max 60% weight on center 50% of deck length.
   - Overhang: Max 1.5 meters from trailer rear. STRICT RULE: At least 70% of the cargo length must be supported on the trailer deck. Strictly PROHIBITED to place cargo on the Tail Roller.
   - Safety Gap: Maintain a mandatory 3-inch (approx. 7.5cm) gap between all cargo items to ensure safe crane operation and avoid snagging.
   - Blocking: Placing cargo against the front end structure (headboard) or other cargo reduces required tie-down capacity by 50%.
   - Aggregate WLL Calculation: Must calculate and show that Aggregate WLL is at least 50% of the cargo weight.

2. EQUIPMENT & FRICTION:
   - ONLY Ratchet type load binders. 'Break Over' binders are PROHIBITED.
   - Wood Dunnage: Width must ALWAYS be greater than height. Never place wood vertically.
   - Friction Mats: Mandatory under all items. Steel-on-Steel (0.26 CoF) vs Rubber Mats (0.56 CoF). Note: Total securement load is reduced when using rubber mats.
   - Grade 70 chains minimum 3/8" (10mm).

3. SPECIFIC CARGO HANDLING:
   - ISO Containers / CCUs: Use Twist locks (max 12mm horiz/10mm vert play) or X-pattern Direct Tie-down. LOADED units = TOP STRAPPING PROHIBITED.
   - Wheeled Equipment: Direct tie-downs plus wheel blocking (wooden blocks) is mandatory.
   - Round Pipes: Must be on dunnage, aligned (not staggered), pushed against headboard. Double wrap for loose pipes. Secure each layer.
   - Pallets / Big Bags (FIBC): Arrange tightly (bundling). Pyramid stacking (1 unit on top of 4 bottom units). Min 2 straps for front/back rows, 1 strap for middle.

4. SECURING QUANTITIES:
   - Min 2 tie-downs for first 3 meters, plus 1 for every additional 3 meters or fraction.
   - Weight rule: 1 tie-down for every 4,500kg if weight rule > length rule.

5. FORCES (Dynamics): System must withstand: 0.8g Forward (Braking), 0.5g Rearward (Acceleration), 0.5g Lateral (Cornering), 0.2g Upward (Bumps).

OUTPUT FORMAT (Must be in Thai):
1. สรุปความปลอดภัย (Safety Summary): [ปลอดภัย / ต้องแก้ไข / ไม่ปลอดภัย]
2. การจัดวางและการกระจายน้ำหนัก (Positioning & Weight Distribution): วิเคราะห์ CoG, กฎ 60/50 และการยื่นเหลื่อม (Overhang/Tail Roller)
3. การคำนวณ WLL และจำนวนสายรัด (WLL & Tie-down Calculation): แสดงการคำนวณ aggregate WLL 50% และจำนวนสายรัดตามกฎความยาว/น้ำหนัก
4. อุปกรณ์และการจัดการแรงเสียดทาน (Equipment & Friction): เน้นเรื่องแผ่นยางรอง (Friction Mats) และการจัดวางไม้หมอน (Dunnage)
5. วิธีการรัดตรึงเฉพาะทาง (Specific Securing Strategy): เจาะจงตามประเภทสินค้า (ตู้ CCU, ท่อ, รถล้อ) ตามกฎ SLB
6. ข้อควรระวังพิเศษสำหรับ SLB (SLB Critical Precautions)

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
        alert(t[lang].manifestEmpty);
        return;
      }
      window.print();
    } catch (err) {
      console.error("Print failed:", err);
    }
  };

  const handleDownloadPDF = async () => {
    if (cargo.length === 0 || !reportRef.current) {
        alert(t[lang].inventoryEmpty);
        return;
    }

    setIsExporting(true);
    
    try {
      // Allow UI to stabilize
      await new Promise(r => setTimeout(r, 600));
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      
      // Capture all major report sections
      const sections = reportRef.current.querySelectorAll('.trailer-card, .ai-insights-section, .guidelines-section');
      const sectionsArray = Array.from(sections);
      
      for (let i = 0; i < sectionsArray.length; i += 2) {
        if (i > 0) pdf.addPage('a4', 'p');
        const pageNum = Math.floor(i / 2) + 1;
        const totalPagesPred = Math.ceil(sectionsArray.length / 2);
        
        pdf.setFontSize(14);
        pdf.setTextColor(30, 41, 59);
        pdf.text(`PROJECT: ${projectName.toUpperCase()}`, 15, 12);
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Loading Deck Plan - Page ${pageNum}/${totalPagesPred} | Date: ${new Date().toLocaleDateString()}`, 15, 17);

        const capture = async (el: HTMLElement) => {
          return await html2canvas(el, {
            scale: 2.0,
            useCORS: true,
            logging: false,
            allowTaint: true,
            backgroundColor: '#FFFFFF',
            onclone: (clonedDoc) => {
              const allElements = clonedDoc.getElementsByTagName('*');
              for (let j = 0; j < allElements.length; j++) {
                const subEl = allElements[j] as HTMLElement;
                if (subEl.classList.contains('no-print')) subEl.style.display = 'none';
                if (subEl.classList.contains('print:flex')) subEl.style.display = 'flex';
                if (subEl.classList.contains('print:block')) subEl.style.display = 'block';

                const style = window.getComputedStyle(subEl);
                const isModern = (v: string) => v.includes('oklch') || v.includes('oklab');
                if (isModern(style.color)) subEl.style.color = '#1e293b';
                if (isModern(style.backgroundColor)) subEl.style.backgroundColor = '#ffffff';

                if (subEl instanceof HTMLInputElement && subEl.value) {
                  const span = clonedDoc.createElement('span');
                  span.innerText = subEl.value;
                  span.style.fontSize = '12px';
                  span.style.fontWeight = 'bold';
                  subEl.parentNode?.replaceChild(span, subEl);
                }
              }
            }
          });
        };

        const canvas1 = await capture(sectionsArray[i] as HTMLElement);
        const imgData1 = canvas1.toDataURL('image/jpeg', 0.85);
        const imgProps1 = pdf.getImageProperties(imgData1);
        let pdfW = 180;
        let pdfH1 = (imgProps1.height * pdfW) / imgProps1.width;

        if (i + 1 < sectionsArray.length) {
          const canvas2 = await capture(sectionsArray[i+1] as HTMLElement);
          const imgData2 = canvas2.toDataURL('image/jpeg', 0.85);
          const imgProps2 = pdf.getImageProperties(imgData2);
          let pdfH2 = (imgProps2.height * pdfW) / imgProps2.width;

          if (22 + pdfH1 + 10 + pdfH2 > 270) {
            const factor = 240 / (pdfH1 + pdfH2);
            pdfH1 *= factor; pdfH2 *= factor; pdfW *= factor;
          }
          pdf.addImage(imgData1, 'JPEG', 15, 22, pdfW, pdfH1);
          pdf.addImage(imgData2, 'JPEG', 15, 22 + pdfH1 + 10, pdfW, pdfH2);
        } else {
          if (pdfH1 > 250) {
            const factor = 250 / pdfH1;
            pdfH1 *= factor; pdfW *= factor;
          }
          pdf.addImage(imgData1, 'JPEG', 15, 22, pdfW, pdfH1);
        }
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
          <div className="flex justify-between items-center mb-4 no-print">
             <div className="flex gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button onClick={() => setLang('en')} className={`px-2 py-1 text-[9px] font-black rounded ${lang === 'en' ? 'bg-amber-500 text-slate-900' : 'text-white/40'}`}>EN</button>
                <button onClick={() => setLang('th')} className={`px-2 py-1 text-[9px] font-black rounded ${lang === 'th' ? 'bg-amber-500 text-slate-900' : 'text-white/40'}`}>TH</button>
             </div>
          </div>
          <div className={`flex items-center gap-3 mb-8 ${isSidebarCollapsed ? 'opacity-0 h-0' : 'opacity-100'}`}>
            <div className="w-10 h-10 bg-amber-500 rounded flex items-center justify-center font-black text-slate-900">TL</div>
            {!isSidebarCollapsed && (
              <div>
                <h1 className="font-bold text-lg leading-tight">TrailerLoad Elite</h1>
                <span className="text-[10px] text-white/40 uppercase font-bold">{t[lang].engineeringEdition}</span>
              </div>
            )}
          </div>

          <div className={`flex-1 overflow-y-auto space-y-6 scrollbar-hide ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
             <section className="space-y-4">
                <h3 className="text-[10px] text-white/40 uppercase font-bold">{t[lang].projectInformation}</h3>
                <input 
                  placeholder={t[lang].projectNamePlaceholder}
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
                  {isAnalyzing ? t[lang].analyzing : t[lang].getAiInsights}
                </button>
                {aiAnalysis && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] leading-relaxed text-white/70 italic whitespace-pre-wrap">
                    <div className="flex justify-between mb-1 border-b border-white/5 pb-1">
                      <span className="text-amber-500 font-black uppercase">{t[lang].aiInsightsTitle}</span>
                      <button onClick={() => setAiAnalysis(null)} className="opacity-40 hover:opacity-100">✕</button>
                    </div>
                    {aiAnalysis}
                  </div>
                )}
             </section>

             <section className="space-y-3">
                <h3 className="text-[10px] text-white/40 uppercase font-bold">{t[lang].manageManifest}</h3>
                <button onClick={() => setShowPasteModal(true)} className="w-full bg-slate-800 border border-slate-700 hover:border-amber-500 rounded py-2.5 text-xs font-bold flex items-center justify-center gap-2">
                  <FileText size={14} className="text-amber-500" /> {t[lang].importExcel}
                </button>
             </section>

             <section className="space-y-3">
                <h3 className="text-[10px] text-white/40 uppercase font-bold">{t[lang].addIndividualItem}</h3>
                <input placeholder={t[lang].itemType} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})} />
                <input placeholder={t[lang].serialNumber} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.serialNumber} onChange={e => setNewItem({...newItem, serialNumber: e.target.value})} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder={t[lang].length} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.length || ''} onChange={e => setNewItem({...newItem, length: Number(e.target.value)})} />
                  <input type="number" placeholder={t[lang].width} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.width || ''} onChange={e => setNewItem({...newItem, width: Number(e.target.value)})} />
                </div>
                <input type="number" placeholder={t[lang].weight} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500" value={newItem.weight || ''} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})} />
                <button onClick={handleAddItem} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-2.5 rounded text-sm transition-all">{t[lang].addToManifest}</button>
             </section>

             <section className="flex-1 overflow-hidden flex flex-col min-h-[200px]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[10px] text-white/40 uppercase font-bold">{t[lang].loadlist} ({cargo.length})</h3>
                  <button onClick={handleClearAll} className="text-[10px] text-white font-bold uppercase px-3 py-1 rounded bg-[#a05b19] hover:bg-[#8a4e15] shadow-lg transition-all">{t[lang].clearAll}</button>
                </div>
                <div className="space-y-6 overflow-y-auto flex-1 pr-2 scrollbar-hide">
                  {trailers.map((trailer, tIdx) => (
                    <div 
                      key={trailer.id || tIdx} 
                      data-trailer-id={trailer.id} 
                      className={`trailer-card space-y-2 p-1 rounded-xl transition-all ${draggedItemId ? 'bg-slate-800/40 ring-1 ring-amber-500/20 shadow-inner' : ''}`}
                    >
                      <div className="flex items-center gap-2 px-1 py-1">
                        <Truck size={12} className={draggedItemId ? 'text-amber-400 animate-pulse' : 'text-amber-500'} />
                        <h4 className={`text-[10px] uppercase font-black tracking-wider transition-colors ${draggedItemId ? 'text-amber-400' : 'text-amber-500/80'}`}>{t[lang].trailer} {tIdx + 1}</h4>
                        <div className="flex-1 h-px bg-slate-700/50"></div>
                      </div>
                      <div className="space-y-1.5 pl-3 border-l border-slate-800 ml-1">
                        {trailer.items.map(item => (
                    <motion.div 
                      key={item.id} 
                      drag
                      dragSnapToOrigin
                      onDragStart={() => setDraggedItemId(item.id)}
                      onDragEnd={(e, info) => handleSidebarItemDragEnd(item.id, e, info)}
                      className={`rounded-lg p-2.5 border flex justify-between items-center group cursor-grab active:cursor-grabbing z-[60] transition-colors ${draggedItemId === item.id ? 'bg-amber-500/30 border-amber-500 scale-105 shadow-xl ring-2 ring-amber-500/50' : 'bg-slate-800/80 border-slate-700 shadow-sm'}`}
                    >
                      <div className="min-w-0 pr-2 pointer-events-none">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${item.weight && item.weight > 10000 ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                          <p className="text-[11px] font-black text-white truncate leading-tight uppercase">{item.type}</p>
                        </div>
                        <p className="text-[9px] text-white/50 leading-tight font-mono tracking-tighter">{item.serialNumber} • {item.length}x{item.width}cm • {item.weight}kg</p>
                      </div>
                      <button onClick={() => handleRemoveItem(item.id)} className="opacity-0 group-hover:opacity-100 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white p-1 rounded transition-all relative z-10">
                        <Trash2 size={10} />
                      </button>
                    </motion.div>
                        ))}
                        {trailer.items.length === 0 && (
                          <p className="text-[9px] text-slate-600 italic py-1 pl-2">{t[lang].emptyDeck}</p>
                        )}
                      </div>
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
              <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold mb-1">{t[lang].projectName} {projectName.toUpperCase()}</p>
              <h2 className="text-3xl font-black text-slate-900 flex items-center gap-4">
                {t[lang].deckMasterPlan}
                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1 px-3 shadow-sm">
                   <div className="flex flex-col items-center">
                     <span className="text-[9px] text-gray-400 font-bold uppercase">{t[lang].length.split(' ')[0]}</span>
                     <input type="number" value={trailerLength} onChange={(e) => setTrailerLength(Number(e.target.value))} className="bg-transparent font-mono text-sm font-black w-14 text-center outline-none" />
                   </div>
                   <div className="w-px h-6 bg-gray-100 mx-1"></div>
                   <div className="flex flex-col items-center">
                     <span className="text-[9px] text-gray-400 font-bold uppercase">{t[lang].width.split(' ')[0]}</span>
                     <input type="number" value={trailerWidth} onChange={(e) => setTrailerWidth(Number(e.target.value))} className="bg-transparent font-mono text-sm font-black w-10 text-center outline-none" />
                   </div>
                   <div className="w-px h-6 bg-gray-100 mx-1"></div>
                   <div className="flex flex-col items-center">
                     <span className="text-[9px] text-gray-400 font-bold uppercase">SWL (kg)</span>
                     <input type="number" value={trailerCapacity} onChange={(e) => setTrailerCapacity(Number(e.target.value))} className="bg-transparent font-mono text-sm font-black w-16 text-center outline-none" />
                   </div>
                   <div className="w-px h-6 bg-gray-100 mx-1"></div>
                   <button 
                     onClick={() => setAllowOverhang(!allowOverhang)}
                     className={`flex flex-col items-center px-2 py-1 rounded transition-colors ${allowOverhang ? 'bg-amber-50' : 'bg-gray-50'}`}
                   >
                     <span className="text-[8px] text-gray-400 font-bold uppercase">{t[lang].overhang}</span>
                     <span className={`text-[10px] font-black ${allowOverhang ? 'text-amber-600' : 'text-gray-400'}`}>{allowOverhang ? '1.5M / 70% / 3" GAP' : 'OFF'}</span>
                   </button>
                </div>
              </h2>
           </div>
           <div className="flex gap-3 no-print">
              <button onClick={handlePrint} className="bg-white border border-gray-200 px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-50"><Printer size={16} /> {t[lang].print}</button>
              <button disabled={isExporting} onClick={handleDownloadPDF} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t[lang].pdf}
              </button>
           </div>
        </header>

        <div ref={reportRef} className="flex-1 space-y-8 p-1 sm:p-4 md:p-8 bg-[#F0F2F5]">
          <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
             <div className="flex justify-between items-start">
               <div>
                 <h1 className="text-3xl font-black text-slate-900 uppercase leading-none">{t[lang].deckMasterPlan}</h1>
                 <p className="text-sm font-bold text-slate-500 mt-2">{t[lang].projectName} {projectName || '-'}</p>
               </div>
               <div className="text-right">
                 <p className="text-[10px] font-bold text-slate-400">DATE: {new Date().toLocaleDateString()}</p>
                 <div className="mt-2 text-xs font-black bg-slate-900 text-white px-3 py-1 rounded inline-block">
                    {trailerWidth}cm x {trailerLength}cm BED
                 </div>
               </div>
             </div>
          </div>

          {trailers.map((trailer, tIdx) => {
            const meta = trailerMetadata[trailer.id] || { license: '', driverName: '', driverPhone: '' };
            const updateMeta = (f: keyof typeof meta, v: string) => setTrailerMetadata(p => ({...p, [trailer.id]: {...meta, [f]: v}}));
            return (
              <div key={trailer.id} data-trailer-id={trailer.id} className={`trailer-card bg-white rounded-2xl border transition-all overflow-hidden flex flex-col ${draggedItemId ? 'ring-2 ring-amber-500/10 border-amber-200 shadow-amber-900/5' : 'border-gray-200 shadow-xl'}`}>
                <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
                   <div className="flex items-center gap-4 grow">
                      <div className="w-12 h-12 bg-slate-50 border border-gray-100 rounded-xl flex items-center justify-center text-slate-400"><Truck size={24} /></div>
                      <div className="flex-1">
                         <div className="flex items-center mb-1">
                            <h4 className="font-black text-slate-900 mr-8">{t[lang].trailer} {tIdx + 1}</h4>
                            <div className="flex items-center gap-4 no-print flex-1">
                               <input placeholder={t[lang].license} className="bg-slate-50 border p-1 px-2 rounded text-[10px] w-32" value={meta.license} onChange={e => updateMeta('license', e.target.value)} />
                               <input placeholder={t[lang].driver} className="bg-slate-50 border p-1 px-2 rounded text-[10px] w-32" value={meta.driverName} onChange={e => updateMeta('driverName', e.target.value)} />
                               <input placeholder={t[lang].phone} className="bg-slate-50 border p-1 px-2 rounded text-[10px] w-32" value={meta.driverPhone} onChange={e => updateMeta('driverPhone', e.target.value)} />
                            </div>
                         </div>
                         <div className="hidden print:flex gap-4 text-[10px] text-slate-700 font-bold mb-1.5 p-1.5 bg-slate-50 rounded border border-slate-100">
                           <div className="flex items-center gap-1"><span className="text-slate-400">{t[lang].licenseLabel}</span> {meta.license || '-'}</div>
                           <div className="flex items-center gap-1"><span className="text-slate-400">{t[lang].driverLabel}</span> {meta.driverName || '-'}</div>
                           <div className="flex items-center gap-1"><span className="text-slate-400">{t[lang].phoneLabel}</span> {meta.driverPhone || '-'}</div>
                         </div>
                         <div className="text-[10px] text-slate-500 font-bold flex flex-wrap gap-x-4 gap-y-1 items-center">
                            <span className="flex items-center gap-1"><Box size={10} className="text-slate-400" /> {trailer.items.length} {t[lang].units}</span>
                            <span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-black">{trailer.width}x{trailer.length} cm {t[lang].bed}</span>
                            <span className="flex items-center gap-1"><Hash size={10} className="text-slate-400" /> {t[lang].payload}: {trailer.totalWeight} / {trailer.capacity} kg</span>
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
                    {/* Ruler / Meter Markers */}
                    <div className="absolute -top-7 left-0 flex w-full no-print">
                      {Array.from({ length: Math.floor(trailer.length / 100) + 1 }).map((_, idx) => (
                        <div key={idx} className="absolute flex flex-col items-center" style={{ left: `${idx * 100 * 0.8}px` }}>
                          <span className="text-[9px] font-black text-slate-500 leading-none mb-1">{idx}M</span>
                          <div className="w-px h-2.5 bg-slate-500/40"></div>
                          {idx > 0 && <div className="absolute top-4 w-px h-1 bg-slate-500/10" style={{ left: '-40px' }}></div>}
                        </div>
                      ))}
                    </div>
                    <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '25px 25px'}}></div>
                    {trailer.items.map((item, i) => {
                      const mPos = manualPositions[item.id];
                      const dX = mPos ? mPos.x : item.x;
                      const dY = mPos ? mPos.y : item.y;
                      const isB = item.type.toLowerCase().includes('basket');
                      const isR = item.type.toLowerCase().includes('rack');
                      const isC = item.type.toLowerCase().includes('container') || item.type.toLowerCase().includes('ccu');
                      
                      const onDeckLength = Math.max(0, trailer.length - dY);
                      const supportPct = Math.min(100, (onDeckLength / item.length) * 100);
                      const isOverhanging = dY + item.length > trailer.length;
                      const overhangDist = Math.max(0, (dY + item.length) - trailer.length);
                      
                      return (
                        <motion.div
                          drag dragMomentum={false}
                          dragConstraints={{
                            left: -dY * 0.8, 
                            top: -dX * 0.8, 
                            right: (trailer.length + (allowOverhang ? Math.min(150, item.length * 0.3) : 0) - item.length - dY) * 0.8, 
                            bottom: (trailer.width - item.width - dX) * 0.8
                          }}
                          onDragEnd={(_, inf) => setManualPositions(p => ({...p, [item.id]: {x: dX + (inf.offset.y/0.8), y: dY + (inf.offset.x/0.8)}}))}
                          key={item.id}
                          className={`absolute border-2 overflow-visible flex flex-col items-center justify-center p-0.5 cursor-move transition-all active:scale-95 group/cargo
                            ${isB ? 'bg-amber-400 border-amber-600 text-amber-900' : isR ? 'bg-orange-500 border-orange-700 text-white' : isC ? 'bg-blue-500 border-blue-700 text-white' : 'bg-slate-400 border-slate-500 text-slate-900'}`}
                          style={{left: `${dY*0.8}px`, top: `${dX*0.8}px`, width: `${item.length*0.8}px`, height: `${item.width*0.8}px`}}
                        >
                          <div className="flex flex-col items-center justify-center w-full px-0.5 overflow-hidden text-center pointer-events-none">
                            <p className="text-[9px] sm:text-[11px] font-black uppercase break-words w-full leading-tight mb-0.5" style={{wordBreak: 'break-all'}}>{item.type}</p>
                            <p className="text-[8px] sm:text-[9px] font-bold opacity-90 break-all w-full leading-none">{item.serialNumber}</p>
                          </div>
                          
                          {isOverhanging && (
                            <div className="absolute -bottom-7 left-0 w-full flex flex-col items-center gap-0.5 pointer-events-none">
                              <div className="flex gap-1 items-center justify-center">
                                <span className={`text-[7px] font-black px-1 py-0.5 rounded shadow-sm whitespace-nowrap ${supportPct < 70 ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-white'}`}>
                                  {t[lang].support} {supportPct.toFixed(0)}%
                                </span>
                                <span className={`text-[7px] font-black px-1 py-0.5 rounded shadow-sm whitespace-nowrap border ${overhangDist > 150 ? 'bg-red-600 text-white border-red-400 animate-pulse' : 'bg-amber-500 text-slate-900 border-amber-600'}`}>
                                  {t[lang].overhangDist} {(overhangDist/100).toFixed(2)}m
                                </span>
                              </div>
                            </div>
                          )}
                          
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
                    <thead className="text-gray-400 uppercase font-black"><tr className="border-b border-gray-200"><th>{t[lang].series}</th><th>{t[lang].type}</th><th className="text-right">{t[lang].dim}</th><th className="text-right">{t[lang].weight}</th><th className="text-right no-print">{t[lang].action}</th></tr></thead>
                    <tbody>
                      {trailer.items.map(item => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-white/50">
                          <td className="py-2 font-black">{item.serialNumber}</td>
                          <td>{item.type}</td>
                          <td className="text-right">{item.length}x{item.width}</td>
                          <td className="text-right">{item.weight}</td>
                          <td className="text-right no-print">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleMoveItemToTrailer(item.id, 'prev')} className="text-slate-400 hover:text-slate-600 font-bold">{t[lang].prev}</button>
                              <button onClick={() => handleMoveItemToTrailer(item.id, 'next')} className="text-slate-400 hover:text-slate-600 font-bold">{t[lang].next}</button>
                              <button onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-600 font-bold ml-2">{t[lang].delete}</button>
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

          {/* AI Insights Section in PDF/Print */}
          {aiAnalysis && (
            <div className="ai-insights-section bg-white border-2 border-amber-100 rounded-2xl p-6 shadow-sm print:shadow-none break-inside-avoid mt-8">
              <h3 className="text-sm font-black text-amber-600 uppercase mb-4 flex items-center gap-2">
                <Sparkles size={16} /> {t[lang].aiInsightsTitle}
              </h3>
              <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium border-l-4 border-amber-500 pl-4 py-1">
                {aiAnalysis}
              </div>
            </div>
          )}

          {/* Global Guidelines Section for PDF/Print */}
          <div className="guidelines-section px-8 py-8 bg-white border border-gray-200 rounded-2xl shadow-xl mt-8">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
               <div className="space-y-3">
                  <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                    <Shield className="text-amber-500" size={14} /> {t[lang].slbGuidelines}
                  </h5>
                  <ul className="text-[10px] text-slate-600 font-bold space-y-2">
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].wllReq}</span></li>
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].weightDistRule}</span></li>
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].minTieDowns}</span></li>
                  </ul>
               </div>
               <div className="space-y-3">
                  <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">{t[lang].blockingBracing}</h5>
                  <ul className="text-[10px] text-slate-600 font-bold space-y-2">
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].blockingHeadboard}</span></li>
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].blockingTimber}</span></li>
                  </ul>
               </div>
               <div className="space-y-3">
                  <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">{t[lang].overhangRules}</h5>
                  <ul className="text-[10px] text-slate-600 font-bold space-y-2">
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].maxOH}</span></li>
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].flagLights}</span></li>
                  </ul>
               </div>
               <div className="space-y-3">
                  <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">{t[lang].liftingOperations}</h5>
                  <ul className="text-[10px] text-slate-600 font-bold space-y-2">
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].safetyGap}</span></li>
                    <li className="flex gap-2"><span>•</span> <span>{t[lang].cranePath}</span></li>
                  </ul>
               </div>
             </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showPasteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowPasteModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.95}} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-10 py-8 border-b border-gray-100">
                <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><Maximize2 className="text-amber-500" /> {t[lang].spreadsheetImport}</h2>
                <p className="text-sm text-gray-500 mt-2">{t[lang].requiredOrder} <span className="font-mono text-blue-600 font-bold text-xs">Type | Serial | Length | Width | Weight</span></p>
              </div>
              <div className="p-8"><textarea className="w-full h-64 border-2 border-slate-100 bg-slate-50/50 rounded-2xl p-6 font-mono text-sm outline-none focus:border-amber-500 focus:bg-white transition-all shadow-inner" placeholder="Workshop Container	09-009	Testing	COSL GIFT	490	244..." value={pasteValue} onChange={e => setPasteValue(e.target.value)} /></div>
              <div className="px-10 py-6 bg-slate-50 flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase">{t[lang].units}: {pasteValue.split('\n').filter(l=>l.trim()).length}</span>
                <div className="flex gap-3">
                  <button onClick={()=>setShowPasteModal(false)} className="text-sm font-bold text-slate-400">{t[lang].cancel}</button>
                  <button disabled={!pasteValue.trim()} onClick={handlePasteData} className="bg-slate-900 text-white rounded-xl px-10 py-2.5 text-sm font-bold disabled:opacity-50">{t[lang].importManifest}</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
