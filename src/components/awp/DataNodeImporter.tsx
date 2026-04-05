'use client';

import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Save, Loader2, X, CheckCircle2, 
  AlertCircle, Table2, ArrowRight, Eye, ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

interface DataNodeImporterProps {
  projectId: string;
  onSuccess?: (nodeId: string) => void;
}

export default function DataNodeImporter({ projectId, onSuccess }: DataNodeImporterProps) {
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [nodeName, setNodeName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (data.length > 0) {
          setPreviewData(data);
          setColumns(Object.keys(data[0] || {}));
          // Sugerir nombre basado en el archivo
          setNodeName(file.name.replace(/\.[^/.]+$/, "").toUpperCase());
        } else {
          setError('El archivo está vacío.');
        }
      } catch (err) {
        setError('Error al leer el archivo Excel.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Reset input
  };

  const handleSave = async () => {
    if (!nodeName.trim()) {
      setError('Debes ingresar un nombre para este conjunto de datos.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Obtenemos la sesión para el header
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          projectId,
          entityName: nodeName,
          rows: previewData,
          fileType: 'excel',
          strategy: 'replace'
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error en la carga.');
      }

      // Éxito
      setPreviewData([]);
      setColumns([]);
      setNodeName('');
      if (onSuccess) onSuccess(result.nodeId);
      
    } catch (err: any) {
      setError(err.message);
      console.error('Upload Error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        
        {/* Header Section */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-slate-200/50 text-blue-500 mb-4 border border-slate-100">
            <Upload size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Importador de Fuentes de Datos</h2>
          <p className="text-sm font-bold text-slate-400">Sube archivos Excel (Piping, Estructura, PTRP...) para usarlos en el modelo relacional.</p>
        </div>

        {/* Dropzone Area */}
        {previewData.length === 0 ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group relative border-2 border-dashed border-slate-200 bg-white rounded-[2.5rem] p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-300"
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
              onChange={handleFileChange} 
            />
            <div className="space-y-4">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto text-slate-300 group-hover:scale-110 group-hover:text-blue-500 transition-all duration-300">
                <FileText size={24} />
              </div>
              <p className="font-black text-slate-400 uppercase tracking-widest text-[11px]">
                Click para seleccionar archivo <span className="text-blue-500">XLSX, XLS o CSV</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Preview Card */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500 rounded-xl text-white">
                    <Table2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Previsualización de Datos</h3>
                    <p className="text-[10px] font-bold text-slate-400">{previewData.length} filas detectadas</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setPreviewData([]); setColumns([]); }}
                  className="p-2 hover:bg-white rounded-xl text-slate-300 hover:text-rose-500 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Node Name Input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre de la Fuente (Nodo)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={nodeName}
                      onChange={(e) => setNodeName(e.target.value)}
                      placeholder="EJ: PTRP PIPING 2024"
                      className="w-full px-5 py-4 bg-slate-50 border-transparent rounded-2xl text-xs font-black text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500/20">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                </div>

                {/* Columns Preview Chips */}
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Columnas Detectadas ({columns.length})</label>
                   <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                      {columns.map(col => (
                        <div key={col} className="px-3 py-1.5 bg-slate-100 text-[10px] font-black text-slate-500 rounded-lg uppercase tracking-tight">
                          {col}
                        </div>
                      ))}
                   </div>
                </div>

                {/* Confirm Action */}
                <button 
                  onClick={handleSave}
                  disabled={isUploading || !nodeName.trim()}
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-slate-900/20 flex items-center justify-center gap-3 hover:bg-blue-600 transition-all disabled:opacity-50"
                >
                  {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isUploading ? 'Procesando Gran Matriz...' : 'Confirmar Carga de Datos'}
                </button>
              </div>
            </div>

            {/* Hint Card */}
            <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-[2rem] flex items-start gap-4">
               <div className="p-2 bg-blue-100 rounded-xl text-blue-500 shrink-0">
                 <AlertCircle size={18} />
               </div>
               <div className="space-y-1">
                 <p className="text-xs font-black text-blue-900 uppercase tracking-widest">Siguiente Paso</p>
                 <p className="text-[11px] font-bold text-blue-700/70 leading-relaxed italic">
                   Una vez cargado, ve a la pestaña <span className="font-black">Mapa Nodal</span> para conectar esta fuente con el Catálogo CWP o con otros archivos mediante un JOIN nodal.
                 </p>
               </div>
            </div>
          </div>
        )}

        {/* Error Handling */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex items-center gap-3 text-rose-700 animate-in shake duration-300">
            <AlertCircle size={16} />
            <p className="text-[11px] font-black uppercase">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
