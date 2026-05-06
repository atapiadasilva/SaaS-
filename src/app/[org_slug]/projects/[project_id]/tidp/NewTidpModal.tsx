'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Loader2 } from 'lucide-react';
import type { TidpStatus } from '@/lib/supabase/types';

interface Props {
  projectId: string;
  teams: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

export default function NewTidpModal({ projectId, teams, onClose, onSaved }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', code: '', task_team_id: '', version: '1.0',
    author: '', status: 'DRAFT' as TidpStatus, issue_date: '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.code || !form.task_team_id) {
      setError('Nombre, código y equipo son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      project_id: projectId,
      task_team_id: form.task_team_id,
      name: form.name,
      code: form.code,
      version: form.version,
      author: form.author || null,
      status: form.status,
      issue_date: form.issue_date || null,
    };
    const { error: e } = await (supabase as any).from('tidps').insert(payload);
    if (e) { setError(e.message); setSaving(false); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal title="Nuevo TIDP" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nombre *">
          <input className={input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: TIDP Oficina Técnica" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Código *">
            <input className={input} value={form.code} onChange={e => set('code', e.target.value)} placeholder="Ej: TIDP-OT-001" />
          </Field>
          <Field label="Versión">
            <input className={input} value={form.version} onChange={e => set('version', e.target.value)} />
          </Field>
        </div>
        <Field label="Equipo de Tarea *">
          <select className={input} value={form.task_team_id} onChange={e => set('task_team_id', e.target.value)}>
            <option value="">Seleccionar equipo...</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Autor">
            <input className={input} value={form.author} onChange={e => set('author', e.target.value)} placeholder="Nombre del autor" />
          </Field>
          <Field label="Estado">
            <select className={input} value={form.status} onChange={e => set('status', e.target.value as TidpStatus)}>
              <option value="DRAFT">DRAFT</option>
              <option value="CURRENT">CURRENT</option>
              <option value="SUPERSEDED">SUPERSEDED</option>
            </select>
          </Field>
        </div>
        <Field label="Fecha de Emisión">
          <input className={input} type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} />
        </Field>

        {error && <p className="text-xs text-destructive font-semibold">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-black border border-border rounded-lg hover:bg-muted transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-black rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-black text-primary">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const input = 'w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white';
