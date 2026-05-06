'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Loader2 } from 'lucide-react';
import type { TidpDiscipline } from '@/lib/supabase/types';

const DISCIPLINES: TidpDiscipline[] = [
  'Oficina Técnica', 'Terreno', 'Calidad', 'Medio Ambiente',
  'Prevención de Riesgos', 'Equipos', 'Recursos Humanos',
  'Administración', 'Contratos', 'Bodega', 'Topografía', 'Laboratorio',
];

interface Props {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function NewTaskTeamModal({ projectId, onClose, onSaved }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', discipline: '' as TidpDiscipline | '',
    leader_name: '', leader_email: '', client_counterpart: '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setError('');
    const { error: e } = await (supabase as any).from('task_teams').insert({
      project_id: projectId,
      name: form.name,
      discipline: form.discipline || null,
      leader_name: form.leader_name || null,
      leader_email: form.leader_email || null,
      client_counterpart: form.client_counterpart || null,
    });
    if (e) { setError(e.message); setSaving(false); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-black text-primary">Nuevo Equipo de Tarea</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Nombre *</label>
            <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Equipo Oficina Técnica" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Disciplina</label>
            <select className={inp} value={form.discipline} onChange={e => set('discipline', e.target.value)}>
              <option value="">Sin disciplina</option>
              {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Líder</label>
              <input className={inp} value={form.leader_name} onChange={e => set('leader_name', e.target.value)} placeholder="Nombre del líder" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Email Líder</label>
              <input className={inp} type="email" value={form.leader_email} onChange={e => set('leader_email', e.target.value)} placeholder="email@empresa.cl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Contraparte Cliente</label>
            <input className={inp} value={form.client_counterpart} onChange={e => set('client_counterpart', e.target.value)} placeholder="Nombre de la contraparte" />
          </div>

          {error && <p className="text-xs text-destructive font-semibold">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-black border border-border rounded-lg hover:bg-muted transition">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-black rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = 'w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white';
