'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Loader2 } from 'lucide-react';

interface Props {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function NewMilestoneModal({ projectId, onClose, onSaved }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', description: '', target_date: '' });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.code || !form.description || !form.target_date) {
      setError('Todos los campos son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: e } = await (supabase as any).from('milestones').insert({
      project_id: projectId,
      code: form.code,
      description: form.description,
      target_date: form.target_date,
    });
    if (e) { setError(e.message); setSaving(false); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-black text-primary">Nuevo Hito</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Código *</label>
            <input className={inp} value={form.code} onChange={e => set('code', e.target.value)} placeholder="Ej: H-001" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Descripción *</label>
            <input className={inp} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ej: Ingeniería Básica Aprobada" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Fecha Objetivo *</label>
            <input className={inp} type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
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
