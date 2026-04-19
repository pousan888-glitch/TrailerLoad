import React, { useState, useMemo, useRef } from 'react';
import { Truck, RotateCcw, Trash2, FileText, ChevronRight, ChevronLeft, Maximize2, Printer, Download, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenerativeAI } from "@google/generative-ai";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Internal Packing Logic (No external file needed) ---
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

// --- Main App Component ---
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
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' });
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
      <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-72'} bg-slate-900 text-white p-6 transition-all no-print`}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-amber-500 rounded font-bold text-slate-900 flex items-center justify-center">TL</div>
          {!isSidebarCollapsed && <h1 className="font-black">TrailerLoad</h1>}
        </div>
        {!isSidebarCollapsed && (
          <div className="space-y-4">
            <input className="w-full bg-slate-800 p-2 rounded text-sm" value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Project Name" />
            <button onClick={()=>setShowPasteModal(true)} className="w-full bg-slate-800 p-2 rounded text-xs font-bold border border-slate-700 flex items-center justify-center gap-2"><FileText size={14}/> Import Data</button>
            <div className="space-y-2 pt-4 border-t border-slate-800">
               <input className="w-full bg-slate-800 p-2 rounded text-xs" placeholder="Item Type" value={newItem.type} onChange={e=>setNewItem({...newItem, type:e.target.value})} />
               <div className="flex gap-2">
                 <input type="number" className="w-1/2 bg-slate-800 p-2 rounded text-xs" placeholder="L" onChange={e=>setNewItem({...newItem, length:Number(e.target.value)})} />
                 <input type="number" className="w-1/2 bg-slate-800 p-2 rounded text-xs" placeholder="W" onChange={e=>setNewItem({...newItem, width:Number(e.target.value)})} />
               </div>
               <button onClick={handleAddItem} className="w-full bg-amber-500 text-slate-900 font-bold p-2 rounded text-xs">Add Item</button>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        <div className="flex justify-between items-center mb-10 no-print">
          <h2 className="text-3xl font-black text-slate-900">Deck Master Plan</h2>
          <div className="flex gap-2">
            <button onClick={()=>window.print()} className="bg-white border p-2 px-4 rounded-lg font-bold text-sm">Print</button>
            <button onClick={handleDownloadPDF} className="bg-blue-600 text-white p-2 px-4 rounded-lg font-bold text-sm shadow-lg">Export PDF</button>
          </div>
        </div>

        <div ref={reportRef} className="space-y-6">
          {trailers.map(t => (
            <div key={t.id} className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
              <div className="flex justify-between mb-4">
                <span className="font-bold">{t.id} - {t.fillPercentage.toFixed(1)}% Used</span>
                <span className="text-slate-400 text-xs">{t.items.length} items</span>
              </div>
              <div className="relative bg-slate-900 rounded-xl overflow-hidden" style={{height: `${t.width*0.5}px`, width: `${t.length*0.5}px`}}>
                {t.items.map(item => (
<div key={item.id} className="absolute bg-blue-600 border border-blue-300 text-white flex flex-col items-center justify-center font-bold shadow-inner" 
                     style={{
                       left:`${item.y*0.5}px`, 
                       top:`${item.x*0.5}px`, 
                       width:`${item.length*0.5}px`, 
                       height:`${item.width*0.5}px`,
                       fontSize: '16px',      // ขยายขนาดฟอนต์ให้ใหญ่ขึ้นชัดเจน
                       lineHeight: '1.2',    // ป้องกันตัวอักษรขาดครึ่ง
                       padding: '4px'        // กันตัวเลขชิดขอบกล่อง
                     }}>
                  <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '2px' }}>{item.type}</div>
                  <div style={{ fontSize: '18px', letterSpacing: '1px' }}>{item.serialNumber || 'No S/N'}</div>
                  <div style={{ fontSize: '9px', marginTop: '2px' }}>{item.length}x{item.width}</div>
                </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      <AnimatePresence>
        {showPasteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white p-8 rounded-2xl w-full max-w-lg">
              <h3 className="text-xl font-bold mb-4">Paste Manifest Data</h3>
              <textarea className="w-full h-48 bg-slate-50 border p-4 rounded-xl text-xs font-mono" placeholder="Type SN Length Width" value={pasteValue} onChange={e=>setPasteValue(e.target.value)} />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={()=>setShowPasteModal(false)} className="text-slate-400 font-bold">Cancel</button>
                <button onClick={()=>{
                  const lines = pasteValue.split('\n');
                  const items = lines.map(l => {
                    const [type, sn, len, wid] = l.split('\t');
                    return { id: Math.random().toString(36).substr(2,9), type, serialNumber: sn, length: Number(len), width: Number(wid) };
                  }).filter(i => !isNaN(i.length));
                  setCargo([...cargo, ...items]);
                  setShowPasteModal(false);
                }} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold">Import</button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
