'use client';

import { use, useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Trash2, Loader2, ShieldCheck,
  Edit3, Eye, EyeOff, ChevronDown, Check, Search, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLES = [
  { id: 'admin',  label: 'Administrador', color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  { id: 'editor', label: 'Editor',        color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-500' },
  { id: 'viewer', label: 'Visualizador',  color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200',  dot: 'bg-slate-400' },
] as const;

const MODULES_LIST = [
  { id: 'awp',       label: 'Ingesta de Datos' },
  { id: 'cwp',       label: 'CWP Viewer' },
  { id: '4d',        label: 'Planeación 4D' },
  { id: 'bim',       label: 'Visor BIM' },
  { id: 'documents', label: 'Gestor Documental' },
];

const ACCESS_OPTS = [
  { id: 'edit', label: 'Editar',       icon: Edit3,   color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'view', label: 'Ver',          icon: Eye,     color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'none', label: 'Sin acceso',   icon: EyeOff,  color: 'text-slate-400 bg-slate-50 border-slate-200' },
];

type AccessLevel = 'edit' | 'view' | 'none';

interface OrgMember {
  user_id: string;
  email: string;
  org_role: string;
  project_member: {
    id: string;
    role: 'admin' | 'editor' | 'viewer';
    module_access: Record<string, AccessLevel>;
  } | null;
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLES.find(r => r.id === role) ?? ROLES[2];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Role Selector ────────────────────────────────────────────────────────────

function RoleSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = ROLES.find(r => r.id === value) ?? ROLES[2];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider ${cur.bg} ${cur.color} ${cur.border}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cur.dot}`} />
        {cur.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 bg-white rounded-2xl border border-slate-100 shadow-xl py-1 min-w-[160px]">
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => { onChange(r.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold hover:bg-slate-50 transition-colors ${r.color}`}
            >
              <span className={`w-2 h-2 rounded-full ${r.dot}`} />
              {r.label}
              {value === r.id && <Check size={11} className="ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Access Cell ──────────────────────────────────────────────────────────────

function AccessCell({ value, onChange }: { value: AccessLevel; onChange: (v: AccessLevel) => void }) {
  const [open, setOpen] = useState(false);
  const cur = ACCESS_OPTS.find(o => o.id === value) ?? ACCESS_OPTS[2];
  const Icon = cur.icon;
  return (
    <div className="relative flex justify-center">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${cur.color}`}
      >
        <Icon size={11} />
        {cur.label}
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 bg-white rounded-xl border border-slate-100 shadow-xl py-1 min-w-[130px]">
          {ACCESS_OPTS.map(o => {
            const OIcon = o.icon;
            return (
              <button
                key={o.id}
                onClick={() => { onChange(o.id as AccessLevel); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold hover:bg-slate-50 transition-colors text-slate-700"
              >
                <OIcon size={11} />
                {o.label}
                {value === o.id && <Check size={10} className="ml-auto text-blue-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { org_slug, project_id } = use(params);

  const [members, setMembers]   = useState<OrgMember[]>([]);
  const [orgId, setOrgId]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [showAll, setShowAll]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Obtener org_id
  useEffect(() => {
    supabase.from('organizations').select('id').eq('slug', org_slug).single()
      .then(({ data }) => { if (data) setOrgId(data.id); });
  }, [org_slug]);

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const res = await fetch(`/api/project-members?project_id=${project_id}&org_id=${orgId}`);
    const data = await res.json();
    setMembers(data);
    setLoading(false);
  }, [orgId, project_id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleRoleChange = async (userId: string, role: string) => {
    const member = members.find(m => m.user_id === userId);
    setSaving(userId);
    await fetch('/api/project-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id, user_id: userId, role,
        module_access: member?.project_member?.module_access ?? {}
      })
    });
    await loadMembers();
    setSaving(null);
  };

  const handleModuleAccess = async (userId: string, modId: string, level: AccessLevel) => {
    const member = members.find(m => m.user_id === userId);
    const newAccess = { ...(member?.project_member?.module_access ?? {}), [modId]: level };
    setSaving(userId + modId);
    await fetch('/api/project-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id, user_id: userId,
        role: member?.project_member?.role ?? 'viewer',
        module_access: newAccess
      })
    });
    await loadMembers();
    setSaving(null);
  };

  const handleRemove = async (memberId: string) => {
    await fetch(`/api/project-members?member_id=${memberId}`, { method: 'DELETE' });
    await loadMembers();
  };

  const handleAddToProject = async (userId: string) => {
    setSaving(userId);
    await fetch('/api/project-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id, user_id: userId, role: 'viewer', module_access: {} })
    });
    await loadMembers();
    setSaving(null);
  };

  const filtered = members.filter(m => {
    const matchSearch = m.email.toLowerCase().includes(search.toLowerCase());
    const matchShow   = showAll || !!m.project_member;
    return matchSearch && matchShow;
  });

  const projectCount = members.filter(m => !!m.project_member).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black text-[#0C1E4F] flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0C1E4F] rounded-2xl flex items-center justify-center text-white">
              <Users size={20} />
            </div>
            Equipo del Proyecto
          </h2>
          <p className="text-slate-400 text-sm mt-1 ml-[52px]">
            {projectCount} miembro{projectCount !== 1 ? 's' : ''} en el proyecto · {members.length} en la organización
          </p>
        </div>
        <button onClick={loadMembers} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            type="text"
            placeholder="Buscar por email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${
            showAll ? 'bg-[#0C1E4F] text-white border-[#0C1E4F]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          }`}
        >
          <UserPlus size={13} />
          {showAll ? 'Mostrando todos' : 'Añadir miembros'}
        </button>
      </div>

      {/* Members table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#0C1E4F]" size={28} /></div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-50 bg-slate-50/50 grid grid-cols-[1fr_140px_140px_40px] gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <span>Usuario</span>
            <span className="text-center">Rol en Org</span>
            <span className="text-center">Rol en Proyecto</span>
            <span />
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-sm font-bold">Sin resultados</div>
            )}

            {filtered.map(member => {
              const pm = member.project_member;
              const isExpanded = expanded === member.user_id;
              const isSavingRow = saving === member.user_id;

              return (
                <div key={member.user_id}>
                  {/* Main row */}
                  <div className={`px-6 py-4 grid grid-cols-[1fr_140px_140px_40px] gap-4 items-center transition-colors ${pm ? 'hover:bg-blue-50/30' : 'hover:bg-slate-50/50 opacity-60'}`}>
                    {/* Email + expand */}
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => pm && setExpanded(isExpanded ? null : member.user_id)}
                        disabled={!pm}
                        className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 font-black text-xs shrink-0 hover:from-blue-100 hover:to-blue-200 hover:text-blue-700 transition-all disabled:cursor-default"
                      >
                        {member.email[0]?.toUpperCase() ?? '?'}
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{member.email}</p>
                        {pm && (
                          <button
                            onClick={() => setExpanded(isExpanded ? null : member.user_id)}
                            className="text-[9px] font-bold text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-0.5"
                          >
                            {isExpanded ? 'Ocultar permisos' : 'Ver permisos por módulo'}
                            <ChevronDown size={9} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Org role */}
                    <div className="flex justify-center">
                      <RoleBadge role={member.org_role} />
                    </div>

                    {/* Project role */}
                    <div className="flex justify-center">
                      {pm ? (
                        isSavingRow ? (
                          <Loader2 size={16} className="animate-spin text-blue-500" />
                        ) : (
                          <RoleSelector
                            value={pm.role}
                            onChange={v => handleRoleChange(member.user_id, v)}
                          />
                        )
                      ) : (
                        <button
                          onClick={() => handleAddToProject(member.user_id)}
                          disabled={saving === member.user_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1E4F] text-white rounded-xl text-[10px] font-black uppercase tracking-wide hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          <UserPlus size={11} /> Añadir
                        </button>
                      )}
                    </div>

                    {/* Remove */}
                    <div className="flex justify-center">
                      {pm && (
                        <button
                          onClick={() => handleRemove(pm.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded module access */}
                  {isExpanded && pm && (
                    <div className="px-6 pb-4 bg-slate-50/50 border-t border-slate-50">
                      <div className="pt-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                          Permisos por módulo (sobrescribe el rol)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {MODULES_LIST.map(mod => {
                            const current = (pm.module_access[mod.id] as AccessLevel) ?? 'view';
                            return (
                              <div key={mod.id} className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-100 px-3 py-2">
                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-tight">{mod.label}</p>
                                <AccessCell
                                  value={current}
                                  onChange={v => handleModuleAccess(member.user_id, mod.id, v)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
