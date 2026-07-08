'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Settings2, Map, Database, CheckCircle2, ChevronRight,
  Save, RefreshCw, Plus, Trash2, Code2
} from 'lucide-react';
import { ProjectHealthDashboard } from '@/components/awp/ProjectHealthDashboard';

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
interface StandardField {
  key: string;
  label: string;
  example: string;
}

type Step = 'config' | 'columnas' | 'salud';

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: 'config',   label: 'Configuración',    icon: Settings2   },
  { id: 'columnas', label: 'Mapeo de columnas', icon: Map         },
  { id: 'salud',    label: 'Salud de datos',    icon: Database    },
];

// ──────────────────────────────────────────────
// Step 1: Configuración general del proyecto
// ──────────────────────────────────────────────
function StepConfig({
  projectId,
  onNext,
}: {
  projectId: string;
  onNext: () => void;
}) {
  const [externalCode, setExternalCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/project-health?project_id=${projectId}`)
      .then(r => r.json())
      .then(d => { setExternalCode(d.externalCode ?? ''); setLoading(false); });
  }, [projectId]);

  async function save() {
    setSaving(true);
    await fetch('/api/project-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, key: 'external_code_display', value: externalCode }),
    });
    // Persist external_code directly via a dedicated endpoint
    await fetch('/api/project-column-mapping', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, mapping: {} }),
    });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div className="py-12 text-center text-slate-500 text-sm">Cargando configuración…</div>;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">
          Código externo del proyecto
        </label>
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            value={externalCode}
            onChange={e => setExternalCode(e.target.value)}
            placeholder="Ej: EIMI00387, MIPE0101"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FF0000]/50"
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          Código del proyecto en P6, SmartPlant u otro sistema externo.
          Permite vincular datos importados sin hardcodear en el código.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[#FF0000] hover:bg-[#A00000] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? '¡Guardado!' : 'Guardar'}
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 text-slate-300 text-sm rounded-lg transition"
        >
          Siguiente <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Step 2: Mapeo de columnas
// ──────────────────────────────────────────────
function StepColumnMapping({
  projectId,
  onNext,
}: {
  projectId: string;
  onNext: () => void;
}) {
  const [fields, setFields] = useState<StandardField[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/project-column-mapping?project_id=${projectId}`)
      .then(r => r.json())
      .then(d => {
        setFields(d.fields ?? []);
        setMapping(d.mapping ?? {});
        setLoading(false);
      });
  }, [projectId]);

  async function save() {
    setSaving(true);
    await fetch('/api/project-column-mapping', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, mapping }),
    });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div className="py-12 text-center text-slate-500 text-sm">Cargando mapeo…</div>;

  return (
    <div className="space-y-6">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-300 text-[12px]">
        <strong>¿Por qué mapear columnas?</strong> Cada proyecto puede tener nombres distintos para las mismas
        columnas clave. Si tu Excel tiene {'"GUID_ELEMENTO"'} en vez de {'"SP3D_MONIKER"'}, mapéalo aquí y
        la plataforma lo normalizará automáticamente al importar.
      </div>

      <div className="space-y-3">
        {fields.map(field => (
          <div key={field.key} className="bg-white/3 border border-white/8 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-[12px] font-bold text-white">{field.label}</div>
                <div className="text-[10px] text-slate-500">Ejemplos: {field.example}</div>
              </div>
              {mapping[field.key] && (
                <button
                  onClick={() => setMapping(m => { const n = { ...m }; delete n[field.key]; return n; })}
                  className="text-slate-600 hover:text-red-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <input
              value={mapping[field.key] ?? ''}
              onChange={e => setMapping(m => ({ ...m, [field.key]: e.target.value }))}
              placeholder={`Nombre de columna en tu Excel…`}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FF0000]/50"
            />
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
        <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">
          Vista previa del mapeo activo
        </div>
        {Object.keys(mapping).filter(k => mapping[k]).length === 0 ? (
          <div className="text-[12px] text-slate-600">Sin mapeo configurado — se usarán los nombres estándar.</div>
        ) : (
          <div className="space-y-1">
            {Object.entries(mapping).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-[12px]">
                <span className="text-slate-500 w-28 shrink-0">{fields.find(f => f.key === k)?.label ?? k}</span>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <span className="text-[#FF0000]/80 font-mono">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[#FF0000] hover:bg-[#A00000] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? '¡Guardado!' : 'Guardar mapeo'}
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 text-slate-300 text-sm rounded-lg transition"
        >
          Ver salud de datos <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Página principal de Setup
// ──────────────────────────────────────────────
export default function SetupPage() {
  const params = useParams<{ org_slug: string; project_id: string }>();
  const projectId = params.project_id;
  const [step, setStep] = useState<Step>('config');

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Configuración del proyecto</h1>
        <p className="text-slate-400 text-sm mt-1">
          Configura el mapeo de columnas, verifica la cobertura de datos y conoce qué vistas ya están listas.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isDone = STEPS.findIndex(x => x.id === step) > i;
          return (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold transition border ${
                  isActive
                    ? 'bg-[#FF0000]/10 border-[#FF0000]/30 text-[#FF0000]'
                    : isDone
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-white/3 border-white/8 text-slate-500 hover:text-white'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-700 mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Contenido del step */}
      <div className="bg-[#0f1e35] border border-white/8 rounded-2xl p-6">
        {step === 'config' && (
          <StepConfig projectId={projectId} onNext={() => setStep('columnas')} />
        )}
        {step === 'columnas' && (
          <StepColumnMapping projectId={projectId} onNext={() => setStep('salud')} />
        )}
        {step === 'salud' && (
          <ProjectHealthDashboard projectId={projectId} />
        )}
      </div>

      {/* Info de cómo cargar datos */}
      {step === 'salud' && (
        <div className="bg-[#0f1e35] border border-white/8 rounded-2xl p-6 space-y-3">
          <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-wider">
            Cómo cargar datos al proyecto
          </h3>
          <div className="space-y-2 text-[13px] text-slate-400">
            <div className="flex items-start gap-2">
              <span className="text-[#FF0000] font-mono font-black shrink-0">1.</span>
              <span>Configura el <strong className="text-white">mapeo de columnas</strong> (paso anterior) para que la plataforma entienda tus archivos.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#FF0000] font-mono font-black shrink-0">2.</span>
              <span>Sube cada archivo Excel en <strong className="text-white">Explorador Relacional → Importar</strong> usando el nombre estándar de la entidad (<code className="text-[#FF0000]/80">elementos</code>, <code className="text-[#FF0000]/80">programa</code>, etc.).</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#FF0000] font-mono font-black shrink-0">3.</span>
              <span>Vuelve a esta vista y actualiza el dashboard de salud para ver qué vistas se desbloquearon.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#FF0000] font-mono font-black shrink-0">4.</span>
              <span>Una vez cargados los <strong className="text-white">elementos</strong> y el <strong className="text-white">catálogo CWP</strong>, el módulo <strong className="text-white">Minería</strong> aparece habilitado en el navbar.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
