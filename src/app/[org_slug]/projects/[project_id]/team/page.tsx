'use client';

import { use, useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Trash2, Loader2, ShieldCheck,
  Edit3, Eye, EyeOff, ChevronDown, Check, Search,
  RefreshCw, Link2, Copy, X, Mail, Send, AlertCircle,
  Clock, Infinity, Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLES = [
  { id: 'admin',  label: 'Administrador', color: 'text-rose-700',   bg: 'bg-rose-50',   border: 'border-rose-200',   dot: 'bg-rose-500' },
  { id: 'editor', label: 'Editor',        color: 'text-blue-700',  bg: 'bg-blue-50',  border: 'border-blue-200',  dot: 'bg-blue-500' },
  { id: 'viewer', label: 'Visualizador',  color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-400' },
] as const;

const MODULES_LIST = [
  { id: 'awp',      label: 'Ingesta de Datos' },
  { id: 'programa', label: 'Programa Maestro' },
  { id: 'bim',      label: 'Visualización 3D' },
];

const ACCESS_OPTS = [
  { id: 'edit', label: 'Editar',     icon: Edit3,   color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'view', label: 'Ver',        icon: Eye,     color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'none', label: 'Sin acceso', icon: EyeOff,  color: 'text-slate-400 bg-slate-50 border-slate-200' },
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

interface Invitation {
  id: string;
  token: string;
  role: string;
  label: string | null;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  created_at: string;
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
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
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
        </>
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
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
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
        </>
      )}
    </div>
  );
}

// ─── Invite Link Card ────────────────────────────────────────────────────────

function InviteLinkCard({
  invite,
  onRevoke,
}: {
  invite: Invitation;
  onRevoke: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/invite/${invite.token}`;
  const roleCfg = ROLES.find(r => r.id === invite.role) ?? ROLES[2];
  const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();
  const isExhausted = invite.max_uses !== null && invite.use_count >= invite.max_uses;
  const isInactive = isExpired || isExhausted;

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border p-4 space-y-3 transition-opacity ${isInactive ? 'opacity-50' : 'bg-white border-slate-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {invite.label && (
              <p className="text-xs font-black text-slate-700">{invite.label}</p>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${roleCfg.bg} ${roleCfg.color} ${roleCfg.border}`}>
              <ShieldCheck size={9} />
              {roleCfg.label}
            </span>
            {isInactive && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">
                {isExpired ? 'Expirado' : 'Agotado'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            {invite.expires_at ? (
              <span className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                <Clock size={10} />
                Vence {new Date(invite.expires_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                <Infinity size={10} /> Sin expiración
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
              <Zap size={10} />
              {invite.use_count}{invite.max_uses !== null ? `/${invite.max_uses}` : ''} usos
            </span>
          </div>
        </div>

        <button
          onClick={() => onRevoke(invite.id)}
          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all shrink-0"
          title="Revocar link"
        >
          <X size={13} />
        </button>
      </div>

      {/* URL row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-mono text-slate-500 truncate">
          {url}
        </div>
        <button
          onClick={copy}
          disabled={!!isInactive}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition shrink-0 ${
            copied
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-[#0C1E4F] text-white hover:bg-blue-700'
          } disabled:opacity-40`}
        >
          {copied ? <><Check size={11} /> Copiado!</> : <><Copy size={11} /> Copiar</>}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { org_slug, project_id } = use(params);

  // Members state
  const [members, setMembers]   = useState<OrgMember[]>([]);
  const [orgId, setOrgId]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [showAll, setShowAll]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Invite by email state
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [inviteEmail, setInviteEmail]         = useState('');
  const [inviteRole, setInviteRole]           = useState('viewer');
  const [inviting, setInviting]               = useState(false);
  const [inviteMsg, setInviteMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Invite links state
  const [invitations, setInvitations]           = useState<Invitation[]>([]);
  const [loadingLinks, setLoadingLinks]         = useState(false);
  const [showLinkPanel, setShowLinkPanel]       = useState(false);
  const [creatingLink, setCreatingLink]         = useState(false);
  const [newLinkRole, setNewLinkRole]           = useState('viewer');
  const [newLinkLabel, setNewLinkLabel]         = useState('');
  const [newLinkExpiry, setNewLinkExpiry]       = useState<number | ''>('');
  const [newLinkMaxUses, setNewLinkMaxUses]     = useState<number | ''>('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Obtener org_id
  useEffect(() => {
    const supabase = createClient();
    (supabase as any).from('organizations').select('id').eq('slug', org_slug).single()
      .then(({ data }: { data: { id: string } | null }) => { if (data) setOrgId(data.id); });
  }, [org_slug]);

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const res = await fetch(`/api/project-members?project_id=${project_id}&org_id=${orgId}`);
    const data = await res.json();
    setMembers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [orgId, project_id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const loadInvitations = useCallback(async () => {
    setLoadingLinks(true);
    const res = await fetch(`/api/invite?project_id=${project_id}`);
    if (res.ok) {
      const data = await res.json();
      setInvitations(data);
    }
    setLoadingLinks(false);
  }, [project_id]);

  useEffect(() => {
    if (showLinkPanel) loadInvitations();
  }, [showLinkPanel, loadInvitations]);

  // ── Member handlers ────────────────────────────────────────────────────────

  const handleRoleChange = async (userId: string, role: string) => {
    const member = members.find(m => m.user_id === userId);
    setSaving(userId);
    const res = await fetch('/api/project-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id, user_id: userId, role, module_access: member?.project_member?.module_access ?? {} })
    });
    await loadMembers();
    setSaving(null);
    if (res.ok) showToast('Rol actualizado');
  };

  const handleModuleAccess = async (userId: string, modId: string, level: AccessLevel) => {
    const member = members.find(m => m.user_id === userId);
    const newAccess = { ...(member?.project_member?.module_access ?? {}), [modId]: level };
    setSaving(userId + modId);
    await fetch('/api/project-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id, user_id: userId, role: member?.project_member?.role ?? 'viewer', module_access: newAccess })
    });
    await loadMembers();
    setSaving(null);
    showToast('Permiso actualizado');
  };

  const handleRemove = async (memberId: string) => {
    await fetch(`/api/project-members?member_id=${memberId}`, { method: 'DELETE' });
    await loadMembers();
    showToast('Miembro removido');
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
    showToast('Miembro añadido al proyecto');
  };

  // ── Email invite ───────────────────────────────────────────────────────────

  const handleEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !orgId) return;
    setInviting(true);
    setInviteMsg(null);

    // 1. Invitar a la org (crea cuenta si no existe)
    const orgRes = await fetch('/api/org-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, email: inviteEmail, role: 'member' }),
    });
    const orgData = await orgRes.json();

    if (!orgRes.ok && orgData.error !== 'El usuario ya es miembro de la organización') {
      setInviteMsg({ type: 'err', text: orgData.error ?? 'Error al invitar' });
      setInviting(false);
      return;
    }

    // 2. Obtener user_id del email invitado
    // Recargar miembros para obtener el user_id
    const membersRes = await fetch(`/api/project-members?project_id=${project_id}&org_id=${orgId}`);
    const membersData = await membersRes.json();
    const target = (Array.isArray(membersData) ? membersData : [])
      .find((m: OrgMember) => m.email.toLowerCase() === inviteEmail.toLowerCase());

    if (target) {
      // 3. Añadir al proyecto con el rol elegido
      await fetch('/api/project-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, user_id: target.user_id, role: inviteRole, module_access: {} }),
      });
    }

    setInviteMsg({
      type: 'ok',
      text: orgData.was_invited
        ? `Invitación enviada a ${inviteEmail}. Recibirá un email para activar su cuenta.`
        : `${inviteEmail} añadido al proyecto.`,
    });
    setInviteEmail('');
    await loadMembers();
    setInviting(false);
  };

  // ── Invite links ───────────────────────────────────────────────────────────

  const handleCreateLink = async () => {
    setCreatingLink(true);
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id,
        role: newLinkRole,
        label: newLinkLabel || null,
        max_uses: newLinkMaxUses || null,
        expires_in_days: newLinkExpiry || null,
      }),
    });
    if (res.ok) {
      await loadInvitations();
      setNewLinkLabel('');
      setNewLinkExpiry('');
      setNewLinkMaxUses('');
      showToast('Link de invitación creado');
    }
    setCreatingLink(false);
  };

  const handleRevokeLink = async (id: string) => {
    await fetch(`/api/invite?id=${id}`, { method: 'DELETE' });
    await loadInvitations();
    showToast('Link revocado');
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const filtered = members.filter(m => {
    const matchSearch = m.email.toLowerCase().includes(search.toLowerCase());
    const matchShow   = showAll || !!m.project_member;
    return matchSearch && matchShow;
  });

  const projectCount = members.filter(m => !!m.project_member).length;
  const activeLinks  = invitations.filter(i => {
    const notExpired   = !i.expires_at || new Date(i.expires_at) > new Date();
    const notExhausted = i.max_uses === null || i.use_count < i.max_uses;
    return notExpired && notExhausted;
  }).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#0C1E4F] text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-xl">
          <Check size={15} className="text-emerald-400" />
          {toast}
        </div>
      )}

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

      {/* ── Invite actions ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Invitar por email */}
        <button
          onClick={() => { setShowEmailInvite(!showEmailInvite); setShowLinkPanel(false); }}
          className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
            showEmailInvite
              ? 'bg-[#0C1E4F] border-[#0C1E4F] text-white'
              : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm text-slate-700'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${showEmailInvite ? 'bg-white/10' : 'bg-[#0C1E4F]/5'}`}>
            <Mail size={18} className={showEmailInvite ? 'text-white' : 'text-[#0C1E4F]'} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest">Invitar por email</p>
            <p className={`text-[10px] ${showEmailInvite ? 'text-blue-200' : 'text-slate-400'}`}>Envía invitación directa a un correo</p>
          </div>
        </button>

        {/* Links compartibles */}
        <button
          onClick={() => { setShowLinkPanel(!showLinkPanel); setShowEmailInvite(false); }}
          className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
            showLinkPanel
              ? 'bg-[#0C1E4F] border-[#0C1E4F] text-white'
              : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm text-slate-700'
          }`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${showLinkPanel ? 'bg-white/10' : 'bg-[#0C1E4F]/5'}`}>
            <Link2 size={18} className={showLinkPanel ? 'text-white' : 'text-[#0C1E4F]'} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest">Links de invitación</p>
            <p className={`text-[10px] ${showLinkPanel ? 'text-blue-200' : 'text-slate-400'}`}>
              {activeLinks > 0 ? `${activeLinks} link${activeLinks !== 1 ? 's' : ''} activo${activeLinks !== 1 ? 's' : ''}` : 'Genera links compartibles'}
            </p>
          </div>
        </button>
      </div>

      {/* Email invite panel */}
      {showEmailInvite && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Mail size={16} className="text-[#0C1E4F]" />
            Invitar por correo electrónico
          </h3>
          <p className="text-[11px] text-slate-400">
            Si el usuario no tiene cuenta, recibirá un email de Supabase para crear una. Quedará automáticamente en la organización y en este proyecto.
          </p>
          <form onSubmit={handleEmailInvite} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Correo</label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Rol en proyecto</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold"
              >
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0C1E4F] text-white font-black rounded-xl hover:bg-blue-700 transition disabled:opacity-60 text-sm"
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {inviting ? 'Enviando...' : 'Invitar'}
            </button>
          </form>
          {inviteMsg && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-semibold ${
              inviteMsg.type === 'ok'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {inviteMsg.type === 'ok'
                ? <Check size={14} className="shrink-0 mt-0.5" />
                : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
              {inviteMsg.text}
            </div>
          )}
        </div>
      )}

      {/* Invite links panel */}
      {showLinkPanel && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Link2 size={16} className="text-[#0C1E4F]" />
            Links de invitación compartibles
          </h3>
          <p className="text-[11px] text-slate-400">
            Comparte el link y cualquier persona puede unirse con una cuenta existente o crear una nueva. El link los asignará automáticamente al proyecto con el rol configurado.
          </p>

          {/* Create link form */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nuevo link</p>
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Etiqueta (opcional)"
                value={newLinkLabel}
                onChange={e => setNewLinkLabel(e.target.value)}
                className="flex-1 min-w-[140px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
              />
              <select
                value={newLinkRole}
                onChange={e => setNewLinkRole(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
              >
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <input
                type="number"
                min={1}
                placeholder="Máx usos (∞)"
                value={newLinkMaxUses}
                onChange={e => setNewLinkMaxUses(e.target.value ? Number(e.target.value) : '')}
                className="w-28 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
              />
              <input
                type="number"
                min={1}
                placeholder="Días expira (∞)"
                value={newLinkExpiry}
                onChange={e => setNewLinkExpiry(e.target.value ? Number(e.target.value) : '')}
                className="w-32 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={handleCreateLink}
                disabled={creatingLink}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#0C1E4F] text-white rounded-xl text-xs font-black hover:bg-blue-700 transition disabled:opacity-60"
              >
                {creatingLink ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                Generar link
              </button>
            </div>
          </div>

          {/* Links list */}
          {loadingLinks ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-slate-300" size={20} />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-center text-[11px] text-slate-400 font-semibold py-4">
              No hay links generados aún
            </p>
          ) : (
            <div className="space-y-2">
              {invitations.map(inv => (
                <InviteLinkCard key={inv.id} invite={inv} onRevoke={handleRevokeLink} />
              ))}
            </div>
          )}
        </div>
      )}

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
            showAll
              ? 'bg-[#0C1E4F] text-white border-[#0C1E4F]'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          }`}
        >
          <UserPlus size={13} />
          {showAll ? 'Todos los miembros' : 'Solo del proyecto'}
        </button>
      </div>

      {/* Members table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[#0C1E4F]" size={28} />
        </div>
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
                  <div className={`px-6 py-4 grid grid-cols-[1fr_140px_140px_40px] gap-4 items-center transition-colors ${pm ? 'hover:bg-blue-50/30' : 'hover:bg-slate-50/50 opacity-60'}`}>

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

                    <div className="flex justify-center">
                      <RoleBadge role={member.org_role} />
                    </div>

                    <div className="flex justify-center">
                      {pm ? (
                        isSavingRow ? (
                          <Loader2 size={16} className="animate-spin text-blue-500" />
                        ) : (
                          <RoleSelector value={pm.role} onChange={v => handleRoleChange(member.user_id, v)} />
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

                  {isExpanded && pm && (
                    <div className="px-6 pb-4 bg-slate-50/50 border-t border-slate-50">
                      <div className="pt-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                          Permisos por módulo
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
