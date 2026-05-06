'use client';

import { FileText, Upload, FolderOpen } from 'lucide-react';

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
          <FileText className="w-5 h-5 text-rose-600" />
        </div>
        <div>
          <h2 className="text-xl font-black text-primary leading-none">Documentos</h2>
          <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Repositorio de documentos del proyecto</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-32 gap-4 border-2 border-dashed border-border rounded-2xl bg-muted/20">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
          <FolderOpen className="w-8 h-8 text-rose-300" />
        </div>
        <div className="text-center">
          <p className="font-black text-slate-600 text-lg">Módulo en desarrollo</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            El repositorio de documentos estará disponible próximamente. Incluirá control de versiones, flujos de aprobación y vínculo con entregables TIDP.
          </p>
        </div>
        <button
          disabled
          className="flex items-center gap-2 px-5 py-2.5 bg-rose-100 text-rose-400 font-black text-sm rounded-xl cursor-not-allowed opacity-60"
        >
          <Upload className="w-4 h-4" />
          Subir Documento
        </button>
      </div>
    </div>
  );
}
