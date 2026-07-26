'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Users } from 'lucide-react';
import DeptoDashboard from '@/components/awp/DeptoDashboard';

interface Persona { n: number | null; nombre: string; cargo: string | null; tipo: string | null; cuadrilla: string | null; fecha_compromiso: string | null; estado_acreditacion: string | null; }

function PersonalRoster({ projectId }: { projectId: string }) {
  const [personal, setPersonal] = useState<Persona[] | null>(null);
  useEffect(() => {
    fetch(`/api/mining-personal?project_id=${projectId}`).then(r => r.json()).then(d => setPersonal(d.personal ?? [])).catch(() => setPersonal([]));
  }, [projectId]);
  if (!personal || personal.length === 0) return null;

  const directos = personal.filter(p => (p.tipo ?? '').toLowerCase().startsWith('d')).length;
  return (
    <div className="max-w-[1500px] mx-auto mb-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <Users className="w-4 h-4 text-[#FF0000]" />
        <span className="text-[13px] font-black text-[#1A1A1A]">Personal clave</span>
        <span className="text-[10.5px] text-slate-400">{personal.length} personas · {directos} directos · {personal.length - directos} indirectos</span>
      </div>
      <table className="w-full text-[11.5px]">
        <thead><tr className="bg-slate-50 text-slate-400 text-[9px] uppercase">
          <th className="text-left font-black py-2 px-4">Nombre</th><th className="text-left font-black">Cargo</th>
          <th className="text-left font-black">Tipo</th><th className="text-left font-black">Cuadrilla</th>
          <th className="text-left font-black">Acreditación</th>
        </tr></thead>
        <tbody>
          {personal.map((p, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-1.5 px-4 font-semibold text-[#1A1A1A]">{p.nombre}</td>
              <td className="text-slate-600">{p.cargo ?? '—'}</td>
              <td><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${(p.tipo ?? '').toLowerCase().startsWith('d') ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{p.tipo ?? '—'}</span></td>
              <td className="text-slate-500">{p.cuadrilla ?? '—'}</td>
              <td className="text-slate-500 text-[10px]">{p.estado_acreditacion || (p.fecha_compromiso ? `compromiso ${p.fecha_compromiso.slice(0,10)}` : '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RrhhPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  return (
    <>
      <PersonalRoster projectId={projectId} />
      <DeptoDashboard
        projectId={projectId}
        depto="RRHH"
        titulo="RECURSOS"
        tituloAcento="HUMANOS"
        descripcion="Personal clave, dotación, acreditaciones y documentación de recursos humanos."
      />
    </>
  );
}
