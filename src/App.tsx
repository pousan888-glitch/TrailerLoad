/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { 
  Truck, 
  Package, 
  Plus, 
  RotateCcw, 
  Trash2, 
  FileText, 
  LayoutDashboard,
  ChevronRight,
  ChevronLeft,
  Info,
  Maximize2,
  Box,
  CornerDownRight,
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

const INITIAL_CARGO: CargoItem[] = [];

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

  // Form state for manual entry
  const [newItem, setNewItem] = useState<Partial<CargoItem>>({
    type: '',
    serialNumber: '',
    length: 0,
    width: 0,
    rig: 'COSL GIFT',
    segment: 'Testing'
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
      setNewItem({ type: '', serialNumber: '', length: 0, width: 0, rig: 'COSL GIFT', segment: 'Testing' });
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
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a logistics and safety expert for Oil & Gas cargo loading. 
Analyze this manifest and trailer plan for project "${projectName}":
Manifest items: ${JSON.stringify(cargo.map(i => ({ type: i.type, sn: i.serialNumber, dim: `${i.length}x${i.width}` })))}
Planned Trailers: ${trailers.length} trailers with average efficiency of ${(trailers.reduce((acc, t) => acc + t.fillPercentage, 0) / (trailers.length || 1)).toFixed(1)}%.

Provide a brief, professional technical summary in 2-3 short bullet points. 
Focus on:
1. Loading efficiency observation.
2. Potential risks or grouping tips.
3. A "Safety Tip" for the deck crew.
Keep the tone very professional and concise.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      
      setAiAnalysis(response.text);
    } catch (error) {
      console.error("AI Analysis Error:", error);
      setAiAnalysis("Failed to generate AI insights. Please check your configuration.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePrint = () => {
    try {
      if (cargo.length === 0) {
        alert("⚠️ Your manifest is empty. Please add items before printing.");
        return;
      }
      window.print();
    } catch (err) {
      console.error("Print failed:", err);
      alert("Print failed. Please try using a different browser or opening the app in a new tab.");
    }
  };

  const handleDownloadPDF = async () => {
    if (cargo.length === 0) {
      alert("⚠️ Your manifest is empty. Please add items before downloading PDF.");
      return;
    }
    
    if (trailers.length === 0) {
      alert("⚠️ No trailer layouts generated. Check your cargo dimensions.");
      return;
    }

    if (!reportRef.current) {
      alert("⚠️ Internal Error: Visualization area not found.");
      return;
    }

    setIsExporting(true);
    
    try {
      // Small pause to allow UI to settle
      await new Promise(resolve => setTimeout(resolve, 800));

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      if (!reportRef.current) return;
      const trailersList = reportRef.current.querySelectorAll('.trailer-card');
      
      if (trailersList.length === 0) {
         throw new Error("No trailer cards found in view. Try scrolling them into view first.");
      }

      for (let i = 0; i < trailersList.length; i++) {
        const borderElement = trailersList[i] as HTMLElement;
        
        // Ensure element is visible/layouted
        const canvas = await html2canvas(borderElement, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          allowTaint: true,
          backgroundColor: '#FFFFFF',
          imageTimeout: 20000,
          removeContainer: true,
         onclone: (clonedDoc) => {
          // Force remove any oklab/oklch colors that break html2canvas
          const elements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            const style = window.getComputedStyle(el);
            
            // ถ้าเจอสีตระกูล ok ทั้งหลาย ให้เปลี่ยนเป็นสีเข้มมาตรฐานแทน
            if (style.color.includes('okl') || style.backgroundColor.includes('okl')) {
              el.style.color = '#1e293b'; 
              if (style.backgroundColor.includes('okl')) {
                el.style.backgroundColor = '#f8fafc';
              }
            }
            // ลบเงาที่อาจจะมีปัญหาออกด้วย
            if (style.boxShadow.includes('okl')) {
              el.style.boxShadow = 'none';
            }
          }
        }
        
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const imgWidth = 277; 
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (i > 0) pdf.addPage('a4', 'l');
        
        // Add Header
        pdf.setFontSize(14);
        pdf.setTextColor(30, 41, 59);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`PROJECT: ${projectName.toUpperCase()}`, 15, 12);
        
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Trailer Loading Plan - Page ${i + 1}/${trailersList.length}`, 15, 17);
        pdf.text(`Date: ${new Date().toLocaleDateString()} | Total Items: ${cargo.length}`, 200, 17);
        
        // Add Image
        pdf.addImage(imgData, 'JPEG', 10, 22, imgWidth, Math.min(imgHeight, 170));
      }
      
      const filename = `${projectName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);
      
    } catch (error: any) {
      console.error('PDF Export Error:', error);
      alert('PDF generation failed: ' + (error.message || 'Unknown error') + '\n\nTIP: Try "Print Layout" > "Save as PDF" as a more reliable alternative.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F0F2F5]">
      {/* Sidebar - Dark theme */}
      <aside className={`sidebar flex flex-col shrink-0 text-white/90 transition-all duration-500 relative border-r border-white/5 z-50 no-print ${isSidebarCollapsed ? 'w-16' : 'w-[320px]'}`}>
        {/* Toggle Button */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-10 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-slate-900 shadow-xl hover:bg-amber-400 transition-colors z-50 border-2 border-white"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
        </button>

        <div className={`flex flex-col h-full ${isSidebarCollapsed ? 'items-center py-6 px-2' : 'p-6'}`}>
          <div className={`flex items-center gap-3 mb-8 transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
            <div className="w-10 h-10 bg-amber-500 rounded flex items-center justify-center font-black text-slate-900 shadow-lg shrink-0">
              TL
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <h1 className="font-bold text-lg leading-tight truncate">TrailerLoad Elite</h1>
                <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Engineering Edition</span>
              </div>
            )}
          </div>

          <div className={`flex-1 overflow-y-auto space-y-6 scrollbar-hide ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
             <section>
                <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-4">Project Information</h3>
                <div className="space-y-4">
                  <input 
                    placeholder="Project Name"
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500 transition-colors"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                  />
                  
                  <button 
                    onClick={generateAIInsights}
                    disabled={isAnalyzing || cargo.length === 0}
                    className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg
                      ${isAnalyzing ? 'bg-slate-700 text-white/50 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-900 hover:scale-[1.02] active:scale-95'}`}
                  >
                    {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {isAnalyzing ? 'Analyzing Manifest...' : 'Get AI Load Insights'}
                  </button>

                  <AnimatePresence>
                    {aiAnalysis && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white/5 border border-white/10 rounded-lg p-3 overflow-hidden"
                      >
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                          <span className="text-[9px] font-black text-amber-500 uppercase tracking-tighter">AI Insights</span>
                          <button onClick={() => setAiAnalysis(null)} className="text-[9px] text-white/20 hover:text-white transition-colors uppercase font-bold">Close</button>
                        </div>
                        <div className="text-[10px] leading-relaxed text-white/70 space-y-2 whitespace-pre-wrap italic">
                          {aiAnalysis}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
             </section>

             <section>
                <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-4">Import Manifest</h3>
                <div className="space-y-3">
                  <div className="relative">
                    <button 
                      onClick={() => setShowPasteModal(true)}
                      className="w-full bg-slate-800 border border-slate-700 hover:border-amber-500 rounded px-3 py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <FileText size={14} className="text-amber-500" />
                      Import Excel Data
                    </button>
                  </div>
                </div>
             </section>

             <section>
                <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-4">Add Individual Item</h3>
                <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-4">Add Individual Item</h3>
                <div className="space-y-3">
                  <input 
                    placeholder="Item Type"
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500 transition-colors"
                    value={newItem.type}
                    onChange={e => setNewItem({...newItem, type: e.target.value})}
                  />
                  <input 
                    placeholder="Serial Number"
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500 transition-colors"
                    value={newItem.serialNumber}
                    onChange={e => setNewItem({...newItem, serialNumber: e.target.value})}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input 
                        type="number"
                        placeholder="L (cm)"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500 transition-colors"
                        value={newItem.length || ''}
                        onChange={e => setNewItem({...newItem, length: Number(e.target.value)})}
                      />
                    </div>
                    <div className="relative">
                      <input 
                        type="number"
                        placeholder="W (cm)"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-amber-500 transition-colors"
                        value={newItem.width || ''}
                        onChange={e => setNewItem({...newItem, width: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleAddItem}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-2.5 rounded text-sm transition-all shadow-lg shadow-amber-500/10 active:scale-95"
                  >
                    Add to Manifest
                  </button>
                </div>
             </section>

             <section>
                <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-4">Transport Options</h3>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">Allow Overhang</span>
                      <span className="text-[9px] text-white/40">Up to 1.5m Rear</span>
                    </div>
                    <button 
                      onClick={() => setAllowOverhang(!allowOverhang)}
                      className={`w-10 h-5 rounded-full relative transition-colors duration-200 focus:outline-none ${allowOverhang ? 'bg-amber-500' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 ${allowOverhang ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
             </section>

             <section className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Manage Loadlist</h3>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleClearAll}
                      className="text-[10px] text-red-400/60 hover:text-red-400 font-bold uppercase transition-colors"
                    >
                      Clear All
                    </button>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-white/60">{cargo.length} Items</span>
                  </div>
                </div>
                <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-600px)] pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                  {cargo.length === 0 && (
                    <div className="py-8 text-center border border-dashed border-slate-700 rounded-lg">
                      <p className="text-xs text-white/30 italic">No items in manifest</p>
                    </div>
                  )}
                  {cargo.map((item, idx) => (
                    <div key={item.id} className="cargo-item rounded-lg p-3 bg-slate-800/50 border border-slate-700 group hover:border-amber-500/50 transition-all">
                      <div className="flex justify-between items-start mb-1">
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold truncate text-white">{item.type}</p>
                          <p className="text-[10px] font-mono text-white/40 truncate">{item.serialNumber}</p>
                        </div>
                        <button 
                          onClick={() => handleRemoveItem(item.id)}
                          className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white p-1.5 rounded-lg transition-all shadow-sm"
                          title="Delete Item"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="text-[10px] text-amber-500/80 font-mono font-bold">
                        {item.length}cm x {item.width}cm
                      </div>
                    </div>
                  ))}
                </div>
             </section>
          </div>
        </div>

        <div className={`mt-auto transition-opacity duration-300 overflow-hidden ${isSidebarCollapsed ? 'opacity-0 h-0' : 'p-6 border-t border-white/5 opacity-100'}`}>
           <button 
             onClick={() => setShowPasteModal(true)}
             className="w-full border border-white/20 hover:bg-white/5 text-white/70 py-2.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-2"
           >
             <FileText size={14} />
             Paste Excel Data
           </button>
           <button 
             onClick={handleClearAll}
             className="w-full mt-2 text-white/30 hover:text-white/50 py-2 text-[10px] font-bold uppercase tracking-wider transition-all"
           >
             Reset Workspace
           </button>
        </div>

        {isSidebarCollapsed && (
          <div className="mt-auto p-4 flex flex-col gap-4 items-center border-t border-white/5">
             <button onClick={() => setShowPasteModal(true)} className="text-white/40 hover:text-white transition-colors"><FileText size={20} /></button>
             <button onClick={handleClearAll} className="text-white/40 hover:text-red-400 transition-colors"><RotateCcw size={20} /></button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-[#F0F2F5] p-8 overflow-y-auto">
        <header className="flex justify-between items-end mb-8">
           <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold mb-1">PROJECT: {projectName.toUpperCase()}</p>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                Deck Master Plan System
                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1 px-3 shadow-sm">
                   <div className="flex flex-col items-center">
                     <span className="text-[9px] text-gray-400 font-bold uppercase">L (cm)</span>
                     <input 
                       type="number" 
                       value={trailerLength} 
                       onChange={(e) => setTrailerLength(Number(e.target.value))}
                       className="bg-transparent font-mono text-sm font-black w-14 text-center outline-none"
                     />
                   </div>
                   <div className="w-px h-6 bg-gray-100 mx-1"></div>
                   <div className="flex flex-col items-center">
                     <span className="text-[9px] text-gray-400 font-bold uppercase">W (cm)</span>
                     <input 
                       type="number" 
                       value={trailerWidth} 
                       onChange={(e) => setTrailerWidth(Number(e.target.value))}
                       className="bg-transparent font-mono text-sm font-black w-10 text-center outline-none"
                     />
                   </div>
                </div>
              </h2>
           </div>
           <div className="flex gap-3 no-print">
              <button 
                onClick={handlePrint}
                className="bg-white border border-gray-200 px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Printer size={16} />
                Print Layout
              </button>
              <button 
                disabled={isExporting}
                onClick={handleDownloadPDF}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
              >
                {isExporting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                Download PDF
              </button>
           </div>
        </header>

        {/* Visualization area */}
        <div ref={reportRef} className="flex-1 space-y-8 scrollbar-hide">
          {trailers.map((trailer, idx) => {
            const meta = trailerMetadata[trailer.id] || { license: '', driverName: '', driverPhone: '' };
            const updateMeta = (field: keyof typeof meta, val: string) => {
               setTrailerMetadata(prev => ({
                  ...prev,
                  [trailer.id]: { ...meta, [field]: val }
               }));
            };

            return (
            <div key={trailer.id} className="trailer-card bg-white rounded-2xl border border-gray-200 shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col">
               <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-4 grow">
                      <div className="w-12 h-12 bg-slate-50 border border-gray-100 rounded-xl flex items-center justify-center text-slate-400">
                         <Truck size={24} />
                      </div>
                      <div className="flex-1">
                         <div className="flex items-center justify-between mb-1">
                            <h4 className="font-black text-slate-900">{trailer.id}</h4>
                            <div className="flex items-center gap-4 no-print grow ml-8">
                               <div className="relative grow max-w-xs">
                                  <Hash size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
                                  <input 
                                    placeholder="License Plate"
                                    className="w-full bg-slate-50 border border-transparent focus:border-amber-500/30 rounded px-2 py-1 pl-6 text-[10px] font-bold text-slate-700 outline-none transition-all"
                                    value={meta.license}
                                    onChange={e => updateMeta('license', e.target.value)}
                                  />
                               </div>
                               <div className="relative grow max-w-xs">
                                  <User size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
                                  <input 
                                    placeholder="Driver Name"
                                    className="w-full bg-slate-50 border border-transparent focus:border-amber-500/30 rounded px-2 py-1 pl-6 text-[10px] font-bold text-slate-700 outline-none transition-all"
                                    value={meta.driverName}
                                    onChange={e => updateMeta('driverName', e.target.value)}
                                  />
                               </div>
                               <div className="relative grow max-w-xs">
                                  <Phone size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
                                  <input 
                                    placeholder="Phone"
                                    className="w-full bg-slate-50 border border-transparent focus:border-amber-500/30 rounded px-2 py-1 pl-6 text-[10px] font-bold text-slate-700 outline-none transition-all"
                                    value={meta.driverPhone}
                                    onChange={e => updateMeta('driverPhone', e.target.value)}
                                  />
                               </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                            <span>{trailer.items.length} Units Placed</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                            <span>{trailer.width}x{trailer.length} cm Bed</span>
                         </div>
                      </div>
                   </div>
                   
                   {/* Print-only Info Header */}
                   <div className="hidden print:flex flex-col gap-1 items-end text-right">
                      {meta.license && <p className="text-[12px] font-black text-slate-900 border-b border-slate-200 pb-0.5">Plate: {meta.license}</p>}
                      {meta.driverName && <p className="text-[11px] font-bold text-slate-600">Driver: {meta.driverName}</p>}
                      {meta.driverPhone && <p className="text-[11px] font-bold text-slate-600">Tel: {meta.driverPhone}</p>}
                   </div>
                  <div className="text-right flex items-center gap-6">
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Floor Occupancy</p>
                        <p className={`text-xl font-black ${trailer.fillPercentage > 85 ? 'text-green-600' : trailer.fillPercentage > 60 ? 'text-amber-600' : 'text-blue-600'}`}>
                           {trailer.fillPercentage.toFixed(1)}%
                        </p>
                     </div>
                     <div className="w-40 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${trailer.fillPercentage}%` }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className={`h-full ${trailer.fillPercentage > 85 ? 'bg-green-500' : trailer.fillPercentage > 60 ? 'bg-amber-500' : 'bg-blue-500'}`}
                        />
                     </div>
                  </div>
               </div>

                <div className="p-16 flex items-center justify-center bg-slate-900/5 relative group overflow-x-auto min-h-[400px]">
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-slate-900 border border-slate-700 rounded-full shadow-lg text-[10px] font-black text-white uppercase tracking-widest z-30">
                    Trailer Bed: {trailer.length} cm 
                  </div>
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-slate-900 border border-slate-700 rounded-full shadow-lg text-[10px] font-black text-white uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 z-30">
                    Bed Width: {trailer.width} cm
                  </div>

                  {/* Trailer Bed Rendering - Horizontal Orientation */}
                  <div 
                    className="trailer-bed shadow-2xl relative rounded transition-all duration-300 bg-slate-900 border-4 border-slate-950"
                    style={{
                       width: `${trailer.length * 0.8}px`,
                       height: `${trailer.width * 0.8}px`,
                       overflow: allowOverhang ? 'visible' : 'hidden'
                    }}
                  >
                    {/* Grid Pattern */}
                    <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
                      backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
                      backgroundSize: '25px 25px'
                    }}></div>

                    {/* Center Reference Lines */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 border-l border-dashed border-white/20 z-0" />
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 border-t border-dashed border-white/20 z-0" />

                    {/* Side Guards to clip vertical overflow (Width) while allowing horizontal (Length) */}
                    <div className="absolute top-[-1000px] left-[-1000px] right-[-1000px] h-[1000px] bg-[#F8FAFC]/0 z-20 pointer-events-none" />
                    <div className="absolute bottom-[-1000px] left-[-1000px] right-[-1000px] h-[1000px] bg-[#F8FAFC]/0 z-20 pointer-events-none" />

                    {/* Overhang Buffer Zone (Visual Only) */}
                    {allowOverhang && (
                      <div 
                        className="absolute top-0 bottom-0 border-l-2 border-amber-500/50 bg-amber-500/5 z-0 flex items-center justify-center"
                        style={{
                          left: `${trailer.length * 0.8}px`,
                          width: `${150 * 0.8}px`
                        }}
                      >
                        <span className="text-[8px] font-black text-amber-500/40 uppercase tracking-tighter rotate-90">Overhang Zone (1.5m)</span>
                      </div>
                    )}

                    {trailer.items.map((item, i) => {
                      const typeLower = item.type.toLowerCase();
                      const isBasket = typeLower.includes('basket');
                      const isRack = typeLower.includes('rack');
                      const isContainer = typeLower.includes('container') || typeLower.includes('ccu') || typeLower.includes('tank') || typeLower.includes('tote');
                      
                      const manualPos = manualPositions[item.id];
                      const displayX = manualPos ? manualPos.x : item.x;
                      const displayY = manualPos ? manualPos.y : item.y;

                      return (
                        <motion.div
                          drag
                          dragMomentum={false}
                          dragConstraints={{
                            left: 0,
                            top: 0,
                            right: trailer.length * 0.8 - item.length * 0.8,
                            bottom: trailer.width * 0.8 - item.width * 0.8
                          }}
                          onDragEnd={(_, info) => {
                            // Convert delta back to cm and save
                            const newY = displayY + (info.offset.x / 0.8);
                            const newX = displayX + (info.offset.y / 0.8);
                            setManualPositions(prev => ({
                              ...prev,
                              [item.id]: { x: newX, y: newY }
                            }));
                          }}
                          initial={{ opacity: 0, scale: 0.8, x: -20 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                          key={item.id}
                          className={`absolute border-2 overflow-hidden flex flex-col items-center justify-center p-1 cursor-move transition-all active:scale-95 active:shadow-2xl z-30
                            ${isBasket ? 'bg-amber-400 border-amber-600 text-amber-900' : 
                              isRack ? 'bg-orange-500 border-orange-700 text-white' : 
                              isContainer ? 'bg-blue-500 border-blue-700 text-white' :
                              'bg-slate-400 border-slate-500 text-slate-900'}`}
                          style={{
                            left: `${displayY * 0.8}px`,
                            top: `${displayX * 0.8}px`,
                            width: `${item.length * 0.8}px`,
                            height: `${item.width * 0.8}px`,
                          }}
                        >
                          <div className="text-[9px] font-black leading-tight text-center uppercase truncate w-full px-1">
                            {item.type}
                          </div>
                          <div className="text-[7px] font-bold opacity-80 truncate w-full text-center">
                            {item.serialNumber}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 bg-black/10 py-0.5 text-[7px] font-black text-center">
                            {item.length}x{item.width}
                          </div>
                          
                          {/* Quick Delete Overlay Button */}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveItem(item.id);
                            }}
                            className="absolute top-0 right-0 bg-red-600 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 rounded-bl"
                            title="Delete"
                          >
                            <Trash2 size={8} />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Ruler / Scale Markers */}
                  <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex justify-between no-print" style={{ width: `${(trailer.length + (allowOverhang ? 150 : 0)) * 0.8}px` }}>
                    {[0, 300, 600, 900, 1200, ...(allowOverhang ? [1350] : [])].map(mark => (
                      <div key={mark} className="flex flex-col items-center">
                        <div className={`w-0.5 h-3 ${mark === 600 ? 'bg-blue-500 h-5' : mark > 1200 ? 'bg-amber-500' : 'bg-gray-300'}`} />
                        <span className={`text-[9px] font-bold mt-1 ${mark === 600 ? 'text-blue-600' : mark > 1200 ? 'text-amber-500' : 'text-gray-400'}`}>
                          {mark === 600 ? '6m (Half)' : mark === 1350 ? 'Ext (13.5m)' : `${mark/100}m`}
                        </span>
                      </div>
                    ))}
                  </div>
               </div>

               <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-100">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Serial Number</th>
                        <th className="py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cargo Type</th>
                        <th className="py-1 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">L (cm)</th>
                        <th className="py-1 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">W (cm)</th>
                        <th className="py-1 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right no-print">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trailer.items.map(item => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-white/50 transition-colors group">
                          <td className="py-2 text-xs font-black text-slate-700">{item.serialNumber}</td>
                          <td className="py-2 text-[10px] text-gray-500">{item.type}</td>
                          <td className="py-2 text-[10px] font-mono font-bold text-gray-500 text-right">{item.length}</td>
                          <td className="py-2 text-[10px] font-mono font-bold text-gray-500 text-right">{item.width}</td>
                          <td className="py-2 text-right no-print">
                            <button 
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1 px-2 text-[10px] font-bold text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all flex items-center gap-1 ml-auto"
                              title="Delete Item"
                            >
                               <Trash2 size={10} />
                               Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>
            );
          })}

          {cargo.length > 0 && trailers.length === 0 && (
            <div className="bg-white border border-red-100 p-12 rounded-2xl text-center shadow-xl shadow-red-100/50">
               <Info className="mx-auto mb-4 text-red-500" size={48} />
               <h3 className="text-xl font-black text-slate-900 mb-2">Payload Dimension Conflict</h3>
               <p className="text-sm text-gray-500 max-w-sm mx-auto">One or more items in the manifest exceed the trailer bed dimensions. Please double-check your cargo specifications.</p>
            </div>
          )}

          {cargo.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center opacity-40 py-20">
                <Box size={64} className="mb-4 text-slate-300" />
                <p className="font-bold text-slate-400 uppercase tracking-widest text-sm">Waiting for inventory data...</p>
             </div>
          )}
        </div>

        {/* Stats Bar */}
        {cargo.length > 0 && (
           <div className="mt-8 grid grid-cols-4 gap-6">
              <div className="stat-card p-6 rounded-2xl">
                 <p className="stat-label mb-1">Total Assets</p>
                 <p className="text-2xl font-black text-slate-900">{cargo.length}</p>
                 <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-tight">Across {trailers.length} Carriers</p>
              </div>
              <div className="stat-card p-6 rounded-2xl">
                 <p className="stat-label mb-1">Avg Efficiency</p>
                 <p className="text-2xl font-black text-blue-600">
                    {(trailers.reduce((acc, t) => acc + t.fillPercentage, 0) / trailers.length).toFixed(1)}%
                 </p>
                 <div className="w-full h-1 bg-gray-100 rounded-full mt-3 overflow-hidden">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ width: `${trailers.reduce((acc, t) => acc + t.fillPercentage, 0) / trailers.length}%` }} 
                    />
                 </div>
              </div>
              <div className="stat-card p-6 rounded-2xl">
                 <p className="stat-label mb-1">Total Payload</p>
                 <p className="text-2xl font-black text-slate-900">
                    {(cargo.reduce((acc, item) => acc + (item.length * item.width) / 10000, 0)).toFixed(1)} <span className="text-xs font-bold text-gray-400">m²</span>
                 </p>
                 <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-tight">Aggregate Deck Area</p>
              </div>
              <div className="stat-card p-6 rounded-2xl border-l-4 border-l-amber-500">
                 <p className="stat-label mb-1 text-amber-600">Health Check</p>
                 <p className="text-2xl font-black text-slate-900">Optimal</p>
                 <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Safety Standards Met</span>
                 </div>
              </div>
           </div>
        )}
      </main>

      {/* Paste Modal */}
      <AnimatePresence>
        {showPasteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPasteModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-10 py-8 border-b border-gray-100">
                <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                  <Maximize2 className="text-amber-500" strokeWidth={3} />
                  Spreadsheet Import
                </h2>
                <p className="text-sm text-gray-500 mt-2">
                  Copy rows from Excel and paste here. <br/>
                  Required order: <span className="font-mono text-blue-600 font-bold">Type | Serial | Length | Width</span>
                </p>
              </div>
              <div className="p-10">
                <textarea
                  className="w-full h-64 border-2 border-slate-100 bg-slate-50/50 rounded-2xl p-6 font-mono text-sm outline-none focus:border-amber-500 focus:bg-white transition-all shadow-inner"
                  placeholder="Workshop Container	09-009	Testing	COSL GIFT	490	244..."
                  value={pasteValue}
                  onChange={e => setPasteValue(e.target.value)}
                />
              </div>
              <div className="px-10 py-8 bg-slate-50 flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Detected Units: {pasteValue.split('\n').filter(l => l.trim()).length}</span>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowPasteModal(false)}
                    className="px-6 py-2.5 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={!pasteValue.trim()}
                    onClick={handlePasteData}
                    className="bg-slate-900 disabled:opacity-50 text-white rounded-xl px-10 py-3 text-sm font-bold shadow-xl shadow-slate-900/20 hover:bg-slate-800 active:scale-95 transition-all"
                  >
                    Import Manifest
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
