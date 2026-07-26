'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Settings2, Save, Loader2, CheckCircle2, Circle, Database, Lock, Code2, Rocket } from 'lucide-react';
import { MODULE_CATALOG, type ModuleKey, type ModuleCategory } from '@/lib/modules';

interface Fuente { key: string; label: string; count: number; modulos: ModuleKey[] }
const CAT_LABEL: Record<ModuleCategory, string> = { nucleo: 'Núcleo', awp: 'Gestión AWP', departamentos: 'Departamentos' };

export default function SetupPage() {
  const { org_slug, project_id } = useParams<{ org_slug: string; project_id: string }>();
  const [active, setActive] = useState<Set<ModuleKey>>(new Set());
  const [externalCode, setExternalCode] = useState('');
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/project-setup?project_id=${project_id}`).then(r => r.json()).then(d => {
      setActive(new Set(d.active_modules ?? [])); setExternalCode(d.external_code ?? '');
      setFuentes(d.fuentes ?? []); setLoading(false);
    });
  }, [project_id]);
  useEffect(() => { load(); }, [load]);

  const toggle = (k: ModuleKey, alwaysOn?: boolean) => {
    if (alwaysOn) return;
    setActive(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };

  const save = async () => {
    setSaving(true);
    await fetch('/api/project-setup', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id, active_modules: [...active], external_code: externalCode }),
    });
    setSaving(false); setToast('✓ Configuración guardada · recarga para ver la nav actualizada');
    setTimeout(() => setToast(null), 3500);
  };

  if (loading) return <div className="p-10 text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando configuración…</div>;

  const byCat = (c: ModuleCategory) => MODULE_CATALOG.filter(m => m.category === c);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-black text-[#1A1A1A] flex items-center gap-2"><Settings2 className="w-6 h-6 text-[#FF0000]" /> Configuración del proyecto</h1>
          <p className="text-[11.5px] text-slate-500">Activa los módulos, define el código externo y revisa qué datos están cargados.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/${org_slug}/projects/${project_id}/onboarding`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-[#FF0000] text-[#FF0000] text-[12px] font-black hover:bg-red-50">
            <Rocket className="w-4 h-4" /> Cargar datos
          </Link>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#FF0000] text-white text-[12px] font-black disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        </div>
      </div>

      {/* Código externo */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Código externo del proyecto</label>
        <div className="flex items-center gap-2 max-w-md">
          <Code2 className="w-4 h-4 text-slate-400 shrink-0" />
          <input value={externalCode} onChange={e => setExternalCode(e.target.value)} placeholder="Ej: EIMI00417, PRC25031"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-red-400" />
        </div>
        <p className="text-[10.5px] text-slate-400 mt-1.5">Vincula los datos importados (P6, SmartPlant, Aconex) sin hardcodear el proyecto.</p>
      </div>

      {/* Módulos */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="text-[13px] font-black text-[#1A1A1A]">Módulos activos</div>
        {(['nucleo', 'awp', 'departamentos'] as ModuleCategory[]).map(cat => (
          <div key={cat}>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{CAT_LABEL[cat]}</div>
            <div className="grid md:grid-cols-2 gap-2">
              {byCat(cat).map(m => {
                const on = active.has(m.key) || m.alwaysOn;
                return (
                  <div key={m.key} onClick={() => toggle(m.key, m.alwaysOn)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border-2 transition ${m.alwaysOn ? 'cursor-default' : 'cursor-pointer'} ${on ? 'border-[#FF0000] bg-red-50/40' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <div className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-[#FF0000] border-[#FF0000] text-white' : 'border-slate-300 bg-white'}`}>
                      {m.alwaysOn ? <Lock className="w-3 h-3" /> : on && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <div className={`font-bold text-[12.5px] ${on ? 'text-[#A00000]' : 'text-slate-700'}`}>{m.label}</div>
                      <div className="text-[10.5px] text-slate-400">{m.descripcion}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Estado de datos (onboarding) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[13px] font-black text-[#1A1A1A] flex items-center gap-2 mb-1"><Database className="w-4 h-4 text-slate-400" /> Datos cargados</div>
        <p className="text-[10.5px] text-slate-400 mb-3">Fuentes que alimentan los módulos. Verde = cargada. Cárgalas con los importadores (scripts) parametrizados por proyecto.</p>
        <div className="space-y-1.5">
          {fuentes.map(f => (
            <div key={f.key} className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 last:border-0">
              {f.count > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
              <span className="text-[12px] text-slate-700 flex-1">{f.label}</span>
              <span className={`text-[11px] font-mono font-bold ${f.count > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>{f.count.toLocaleString('es-CL')}</span>
              <span className="text-[9px] text-slate-400 w-40 text-right truncate">{f.modulos.join(', ')}</span>
            </div>
          ))}
        </div>
      </div>

      {toast && <div className="fixed bottom-5 right-5 bg-[#08203F] text-white text-[12px] font-semibold px-4 py-2.5 rounded-lg shadow-xl z-50">{toast}</div>}
    </div>
  );
}
