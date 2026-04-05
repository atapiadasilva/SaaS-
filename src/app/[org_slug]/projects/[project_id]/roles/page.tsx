'use client';

import { use, useState, useEffect } from 'react';
import {
  ShieldCheck, Edit3, Eye, EyeOff, Loader2,
  Save, RotateCcw, Check, Info
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLES = [
  {
    id: 'admin',
    label: 'Administrador',
    desc: 'Control total del proyecto',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    ring: 'ring-rose-300',
    dot: 'bg-rose-500',
  },
  {
    id: 'editor',
    label: 'Editor',
    desc: 'Puede editar datos y módulos asignados',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    ring: 'ring-blue-300',
    dot: 'bg-blue-500',
  },
  {
    id: 'viewer',
    label: 'Visualizador',
    desc: 'Solo lectura en los módulos permitidos',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    ring: 'ring-slate-300',
    dot: 'bg-slate-400',
  },
];

const MODULES = [
  { id: 'awp',       label: 'Ingesta de Datos',    desc: 'Importar, modelar y analizar fuentes de datos' },
  { id: 'cwp',       label: 'CWP Viewer',           desc: 'Explorar paquetes de construcción' },
  { id: '4d',        label: 'Planeación 4D',        desc: 'Cronograma y simulación' },
  { id: 'bim',       label: 'Visor BIM',            desc: 'Modelos 3D de ingeniería' },
  { id: 'documents', label: 'Gestor Documental',    desc: 'Expedientes y archivos técnicos' },
  { id: 'team',      label: 'Equipo',               desc: 'Gestión de miembros del proyecto' },
  { id: 'roles',     label: 'Configuración Roles',  desc: 'Permisos por rol' },
];

type AccessLevel = 'edit' | 'view' | 'none';
type RolePerms = Record<string, AccessLevel>;
type AllPerms  = Record<string, RolePerms>;

const DEFAULT_PERMS: AllPerms = {
  admin:  { awp:'edit', cwp:'edit', '4d':'edit', bim:'edit', documents:'edit', team:'edit', roles:'edit' },
  editor: { awp:'edit', cwp:'view', '4d':'view', bim:'view', documents:'edit', team:'view', roles:'none' },
  viewer: { awp:'view', cwp:'view', '4d':'view', bim:'view', documents:'view', team:'none', roles:'none' },
};

// ─── Access level button cycle ────────────────────────────────────────────────

const ACCESS_CYCLE: AccessLevel[] = ['edit', 'view', 'none'];

function cycleNext(cur: AccessLevel): AccessLevel {
  const idx = ACCESS_CYCLE.indexOf(cur);
  return ACCESS_CYCLE[(idx + 1) % ACCESS_CYCLE.length];
}

interface AccessCellProps {
  value: AccessLevel;
  disabled?: boolean;
  onChange: (v: AccessLevel) => void;
}

function AccessCell({ value, disabled, onChange }: AccessCellProps) {
  const cfg = {
    edit: { label: 'Editar',       Icon: Edit3,   cls: 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600' },
    view: { label: 'Ver',          Icon: Eye,     cls: 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600' },
    none: { label: 'Sin acceso',   Icon: EyeOff,  cls: 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200' },
  }[value];

  return (
    <button
      onClick={() => !disabled && onChange(cycleNext(value))}
      disabled={disabled}
      title="Click para cambiar"
      className={`flex flex-col items-center gap-1 w-full py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${cfg.cls} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <cfg.Icon size={14} />
      {cfg.label}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RolesPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { project_id } = use(params);

  const [perms, setPerms]   = useState<AllPerms>(DEFAULT_PERMS);
  const [original, setOriginal] = useState<AllPerms>(DEFAULT_PERMS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const isDirty = JSON.stringify(perms) !== JSON.stringify(original);

  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase.from('projects') as any)
        .select('role_permissions')
        .eq('id', project_id)
        .single();

      const loaded = data?.role_permissions ?? DEFAULT_PERMS;
      // Merge with defaults in case new modules/roles were added
      const merged: AllPerms = {};
      for (const role of ROLES) {
        merged[role.id] = { ...DEFAULT_PERMS[role.id], ...loaded[role.id] };
      }
      setPerms(merged);
      setOriginal(merged);
      setLoading(false);
    };
    load();
  }, [project_id]);

  const handleChange = (roleId: string, modId: string, level: AccessLevel) => {
    setPerms(prev => ({
      ...prev,
      [roleId]: { ...prev[roleId], [modId]: level }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    await (supabase.from('projects') as any)
      .update({ role_permissions: perms })
      .eq('id', project_id);
    setOriginal(perms);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => setPerms(original);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#0C1E4F]" size={28} /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black text-[#0C1E4F] flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0C1E4F] rounded-2xl flex items-center justify-center text-white">
              <ShieldCheck size={20} />
            </div>
            Configuración de Roles
          </h2>
          <p className="text-slate-400 text-sm mt-1 ml-[52px]">
            Define qué puede ver o editar cada rol en cada módulo
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={12} /> Descartar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              saved
                ? 'bg-emerald-500 text-white'
                : isDirty
                ? 'bg-[#0C1E4F] text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Save size={12} />}
            {saving ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3">
        <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] font-bold text-blue-700 leading-relaxed">
          Estas son las reglas <span className="font-black">base por rol</span>. Los permisos individuales por usuario
          (configurados en la pestaña Equipo) sobrescriben estas reglas.
          Haz click en cada celda para ciclar entre <span className="font-black">Editar → Ver → Sin acceso</span>.
        </p>
      </div>

      {/* Matrix */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Role headers */}
        <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: `280px repeat(${ROLES.length}, 1fr)` }}>
          <div className="px-6 py-4 bg-slate-50/50" />
          {ROLES.map(role => (
            <div key={role.id} className={`px-4 py-4 border-l border-slate-100 ${role.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${role.dot}`} />
                <p className={`text-[11px] font-black uppercase tracking-widest ${role.color}`}>{role.label}</p>
              </div>
              <p className="text-[9px] text-slate-400 font-bold">{role.desc}</p>
            </div>
          ))}
        </div>

        {/* Module rows */}
        {MODULES.map((mod, i) => (
          <div
            key={mod.id}
            className={`grid border-b border-slate-50 last:border-0 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}
            style={{ gridTemplateColumns: `280px repeat(${ROLES.length}, 1fr)` }}
          >
            {/* Module label */}
            <div className="px-6 py-4 flex flex-col justify-center border-r border-slate-50">
              <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{mod.label}</p>
              <p className="text-[9px] text-slate-400 font-medium mt-0.5">{mod.desc}</p>
            </div>

            {/* Access cells per role */}
            {ROLES.map(role => {
              const level = (perms[role.id]?.[mod.id] as AccessLevel) ?? 'none';
              const isAdmin = role.id === 'admin';
              return (
                <div key={role.id} className="px-3 py-3 border-l border-slate-50 flex items-center">
                  <AccessCell
                    value={level}
                    disabled={isAdmin && mod.id !== 'roles'} // admin always edit (except roles self)
                    onChange={v => handleChange(role.id, mod.id, v)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 justify-center">
        {[
          { Icon: Edit3,  label: 'Editar',      cls: 'text-blue-600' },
          { Icon: Eye,    label: 'Ver',          cls: 'text-emerald-600' },
          { Icon: EyeOff, label: 'Sin acceso',   cls: 'text-slate-400' },
        ].map(({ Icon, label, cls }) => (
          <div key={label} className={`flex items-center gap-1.5 text-[10px] font-bold ${cls}`}>
            <Icon size={12} /> {label}
          </div>
        ))}
      </div>
    </div>
  );
}
