import React, { useState, useMemo, useRef } from 'react';
import { Truck, RotateCcw, Trash2, FileText, ChevronRight, ChevronLeft, Maximize2, Printer, Download, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Internal Packing Logic ---
function packCargo(items, maxWidth, maxLength, overhang) {
  let trailers = [];
  let currentItems = [...items].sort((a, b) => (b.length * b.width) - (a.length * a.width));
  let trailerCount = 1;

  while (currentItems.length > 0) {
    let placed = [];
    let remaining = [];
    let currentX = 0;
    let currentY = 0;
    let maxHeightInRow = 0;

    for (let item of currentItems) {
      if (currentY + item.width <= maxWidth) {
        if (currentX + item.length <= (overhang ? maxLength + 150 : maxLength)) {
          placed.push({ ...item, x: currentX, y: currentY });
          currentY += item.width;
          maxHeightInRow = Math.max(maxHeightInRow, item.length);
        } else {
          remaining.push(item);
        }
      } else {
        currentX += maxHeightInRow;
        currentY = 0;
        maxHeightInRow = 0;
        if (currentX + item.length <= (overhang ? maxLength + 150 : maxLength) && item.width <= maxWidth) {
          placed.push({ ...item, x: currentX, y: currentY });
          currentY = item.width;
          maxHeightInRow = item.length;
        } else {
          remaining.push(item);
        }
      }
    }
    
    let usedArea = placed.reduce((sum, i) => sum + (i.length * i.width), 0);
    trailers.push({
      id: `Trailer ${trailerCount++}`,
      items: placed,
      fillPercentage: (usedArea / (maxWidth * maxLength)) * 100,
      width: maxWidth,
      length: maxLength
    });
    currentItems = remaining;
  }
  return trailers;
}

export default function App() {
  const [projectName, setProjectName] = useState('DECK_LOAD_PLAN');
  const [cargo, setCargo] = useState([]);
  const [trailerWidth, setTrailerWidth] = useState(250);
  const [trailerLength, setTrailerLength] = useState(1200);
  const [pasteValue, setPasteValue] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [allowOverhang, setAllowOverhang] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const reportRef = useRef(null);

  const [newItem, setNewItem] = useState({ type: '', serialNumber: '', length: 0, width: 0 });

  const trailers = useMemo(() => packCargo(cargo, trailerWidth, trailerLength, allowOverhang), [cargo, trailerWidth, trailerLength, allowOverhang]);

  const handleAddItem = () => {
    if (newItem.type && newItem.length > 0) {
      setCargo([...cargo, { ...newItem, id: Math.random().toString(36).substr(2, 9) }]);
      setNewItem({ type: '', serialNumber: '', length: 0, width: 0 });
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current || cargo.length === 0) return;
    setIsExporting(true);
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const canvas = await html2canvas(reportRef.current, { 
        scale: 4, // เพิ่มความชัดระดับ 4K
        useCORS: true, 
        backgroundColor: '#FFFFFF' 
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.setFontSize(16);
      pdf.text(`PROJECT: ${projectName}`, 15, 15);
      pdf.addImage(imgData, 'JPEG', 10, 25, 277, (canvas.height * 277) / canvas.width);
      pdf.save(`${projectName}_PLAN.pdf`);
    } catch (e) {
      alert("PDF Error. Use Print instead.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen w-full flex bg-[#F0F2F5] font-sans overflow-hidden">
      <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-72'} bg-slate-900 text-white p-6 transition-all no-print shrink-0`}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-amber-500 rounded font-bold text-slate-900 flex items-center justify-center">TL</div>
          {!isSidebarCollapsed && <h1 className="font-black italic">TrailerLoad</h1>}
        </div>
        {!isSidebarCollapsed && (
          <div className="space-y-4">
            <input className="w-full bg-slate-800 p-2 rounded text-sm outline-none border border-transparent focus:border-amber-500" value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Project Name" />
            <button onClick={()=>setShowPasteModal(true)} className="w-full bg-slate-800 p-2 rounded text-xs font-bold border border-slate-700 flex items-center justify-center gap-2 hover:border-amber-500 transition-colors"><FileText size={14}/> Import Data</button>
            <div className="space-y-2 pt-4 border-t border-slate-800">
               <input className="w-full bg-slate-800 p-2 rounded text-xs outline-none focus:border-amber-500" placeholder="Item Type" value={newItem.type} onChange={e=>setNewItem({...newItem, type:e.target.value})} />
               <input className="w-full bg-slate-800 p-2 rounded text-xs outline-none focus:border-amber-500" placeholder="Serial Number" value={newItem.serialNumber} onChange={e=>setNewItem({...newItem, serialNumber:e.target.value})} />
               <div className="flex gap-2">
                 <input type="number" className="w-1/2 bg-slate-800 p-2 rounded text-xs outline-none focus:border-amber-500" placeholder="L (cm)" onChange={e=>setNewItem({...newItem, length:Number(e.target.value)})} />
                 <input type="number" className="w-1/2 bg-slate-800 p-2 rounded text-xs outline-none focus:border-amber-500" placeholder="W (cm)" onChange={e=>setNewItem({...newItem, width:Number(e.target.value)})} />
               </div>
               <button onClick={handleAddItem} className="w-full bg-amber-500 text-slate-900 font-bold p-2 rounded text-xs hover:bg-amber-400 transition-colors">Add Item</button>
            </div>
            <button onClick={() => setCargo([])} className="w-full text-red-400 text-[10px] font-bold uppercase hover:text-red-300">Clear All</button>
          </div>
        )}
        <button onClick={()=>setIsSidebarCollapsed(!isSidebarCollapsed)} className="mt-auto self-center p-2 bg-slate-800 rounded-full text-amber-500">
            {isSidebarCollapsed ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}
        </button>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        <div className="flex justify-between items-center mb-10 no-print">
          <div>
            <h2 className="text-3xl font-black text-slate-900 italic">Deck Master Plan</h2>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mt-1">SLB Ranong Operations</p>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>window.print()} className="bg-white border p-2 px-4 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50">Print</button>
            <button onClick={handleDownloadPDF} disabled={isExporting} className="bg-blue-600 text-white p-2 px-6 rounded-lg font-bold text-sm shadow-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 
              Export PDF
            </button>
          </div>
        </div>

        <div ref={reportRef} className="space-y-10">
          {trailers.map(t => (
            <div key={t.id} className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
              <div className="flex justify-between items-center mb-6 border-b border-slate-50 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100"><Truck size={24}/></div>
                  <div>
                    <span className="font-black text-xl text-slate-900">{t.id}</span>
                    <p className="text-slate-400 text-[10px] font-bold uppercase">{t.items.length} Units On Board</p>
                  </div>
                </div>
                <div className="text-right">
                   <span className="text-blue-600 font-black text-2xl">{t.fillPercentage.toFixed(1)}%</span>
                   <p className="text-slate-400 text-[9px] font-bold uppercase">Space Utilized</p>
                </div>
              </div>

              <div className="relative bg-slate-900 rounded-2xl overflow-hidden shadow-inner border-4 border-slate-900" 
                   style={{ height: `${t.width * 0.5}px`, width: `${t.length * 0.5}px` }}>
                {t.items.map(item => (
                  <div key={item.id} className="absolute bg-blue-600 border-2 border-white text-white font-bold shadow-lg" 
                       style={{
                         left: `${item.y * 0.5}px`, 
                         top: `${item.x * 0.5}px`, 
                         width: `${item.length * 0.5}px`, 
                         height: `${item.width * 0.5}px`,
                         overflow: 'hidden'
                       }}>
                    <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <tbody>
                        <tr>
                          <td style={{ verticalAlign: 'top', padding: '4px', textAlign: 'left' }}>
                            <div style={{ fontSize: '12px', opacity: 0.8, lineHeight: '1', fontWeight: 'bold' }}>{item.type}</div>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ verticalAlign: 'middle', textAlign: 'center', padding: '2px' }}>
                            <div style={{ 
                              fontSize: '26px', // ขยายเลข Serial ให้ใหญ่สะใจ
                              fontWeight: '900', 
                              lineHeight: '1',
                              letterSpacing: '1px'
                            }}>
                              {item.serialNumber || 'No S/N'}
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ verticalAlign: 'bottom', padding: '4px', textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{item.length}x{item.width}</div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      <AnimatePresence>
        {showPasteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white p-8 rounded-3xl w-full max-w-lg shadow-2xl">
              <h3 className="text-2xl font-black text-slate-900 mb-4 italic">Import Manifest</h3>
              <p className="text-slate-400 text-xs mb-4 font-bold uppercase">Format: Type [TAB] SN [TAB] Length [TAB] Width</p>
              <textarea className="w-full h-48 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-mono text-xs outline-none focus:border-blue-500 transition-colors" placeholder="Workshop Container	09-009	490	244" value={pasteValue} onChange={e=>setPasteValue(e.target.value)} />
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={()=>setShowPasteModal(false)} className="text-slate-400 font-bold hover:text-slate-600 transition-colors">Cancel</button>
                <button onClick={()=>{
                  const lines = pasteValue.split('\n');
                  const items = lines.map(l => {
                    const parts = l.split('\t');
                    if (parts.length >= 4) {
                      return { id: Math.random().toString(36).substr(2,9), type: parts[0], serialNumber: parts[1], length: Number(parts[2]), width: Number(parts[3]) };
                    }
                    return null;
                  }).filter(i => i && !isNaN(i.length));
                  setCargo([...cargo, ...items]);
                  setPasteValue('');
                  setShowPasteModal(false);
                }} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg transition-all">Import Now</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
