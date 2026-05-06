'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users, UserPlus, Trash2, Loader2, Crown,
  ShieldCheck, User, ChevronDown, Check,
  Mail, AlertCircle, RefreshCw, Send
} from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLES = [
  { id: 'owner', label: 'Owner',          color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500',  icon: Crown },
  { id: 'admin', label: 'Administrador',  color: 'text-rose-700',   bg: 'bg-rose-50',   border: 'border-rose-200',   dot: 'bg-rose-500',   icon: ShieldCheck },
  { id: 'member', label: 'Miembro',       color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200',  dot: 'bg-slate-400',  icon: User },
] as const;

type OrgRole = 'owner' | 'admin' | 'member';

interface OrgMember {
  id: string;
  user_id: string;
  email: string;
  role: OrgRole;
  created_at: string;
  is_self: boolean;
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: OrgRole }) {
  const cfg = ROLES.find(r => r.id === role) ?? ROLES[2];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ─── Role Selector ────────────────────────────────────────────────────────────

function RoleSelector({
  value, onChange, disabled
}: {
  value: OrgRole;
  onChange: (v: OrgRole) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cur = ROLES.find(r => r.id === value) ?? ROLES[2];
  const Icon = cur.icon;

  if (disabled) return <RoleBadge role={value} />;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider ${cur.bg} ${cur.color} ${cur.border} hover:opacity-80 transition`}
      >
        <Icon size={10} />
        {cur.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1 left-0 bg-white rounded-2xl border border-slate-100 shadow-xl py-1 min-w-[170px]">
            {ROLES.filter(r => r.id !== 'owner').map(r => {
              const RIcon = r.icon;
              return (
                <button
                  key={r.id}
                  onClick={() => { onChange(r.id as OrgRole); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold hover:bg-slate-50 transition-colors ${r.color}`}
                >
                  <RIcon size={11} />
                  {r.label}
                  {value === r.id && <Check size={11} className="ml-auto" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MiembrosPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = use(params);

  const [orgId, setOrgId]         = useState('');
  const [callerRole, setCallerRole] = useState<OrgRole>('member');
  const [members, setMembers]     = useState<OrgMember[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole, setInviteRole]     = useState<OrgRole>('member');
  const [inviting, setInviting]         = useState(false);
  const [inviteMsg, setInviteMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isAdmin = callerRole === 'owner' || callerRole === 'admin';

  // Obtener org_id
  useEffect(() => {
    const supabase = createClient();
    (supabase as any).from('organizations').select('id').eq('slug', org_slug).single()
      .then(({ data }: { data: { id: string } | null }) => { if (data) setOrgId(data.id); });
  }, [org_slug]);

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org-members?org_id=${orgId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMembers(data.members ?? []);
      setCallerRole(data.caller_role ?? 'member');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando miembros');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleRoleChange = async (member: OrgMember, role: OrgRole) => {
    setSaving(member.id);
    const res = await fetch('/api/org-members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: member.id, role, org_id: orgId }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Error cambiando rol');
    } else {
      await loadMembers();
    }
    setSaving(null);
  };

  const handleRemove = async (member: OrgMember) => {
    if (!confirm(`¿Eliminar a ${member.email} de la organización?`)) return;
    setSaving(member.id);
    const res = await fetch(`/api/org-members?member_id=${member.id}&org_id=${orgId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Error eliminando miembro');
    } else {
      await loadMembers();
    }
    setSaving(null);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !orgId) return;
    setInviting(true);
    setInviteMsg(null);

    const res = await fetch('/api/org-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, email: inviteEmail, role: inviteRole }),
    });
    const data = await res.json();

    if (!res.ok) {
      setInviteMsg({ type: 'err', text: data.error ?? 'Error al invitar' });
    } else {
      setInviteMsg({
        type: 'ok',
        text: data.was_invited
          ? `Invitación enviada a ${inviteEmail}. Recibirá un email para activar su cuenta.`
          : `${inviteEmail} añadido a la organización.`,
      });
      setInviteEmail('');
      await loadMembers();
    }
    setInviting(false);
  };

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            {org_slug} · Organización
          </p>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Users className="w-8 h-8" />
            Equipo de la Organización
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Gestiona quién tiene acceso a esta organización y sus proyectos.
          </p>
        </div>
        <button
          onClick={loadMembers}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Error global */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 text-sm font-semibold">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">Cerrar</button>
        </div>
      )}

      {/* Invite form — solo admins/owners */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-4">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <UserPlus size={18} className="text-primary" />
            Invitar nuevo miembro
          </h2>
          <form onSubmit={handleInvite} className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
                />
              </div>
            </div>
            <div className="min-w-[160px]">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Rol inicial
              </label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as OrgRole)}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm font-semibold focus:border-primary outline-none bg-white"
              >
                <option value="member">Miembro</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition shadow-sm disabled:opacity-60 text-sm"
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {inviting ? 'Enviando...' : 'Invitar'}
            </button>
          </form>
          {inviteMsg && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-semibold ${
              inviteMsg.type === 'ok'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-destructive/10 text-destructive border border-destructive/10'
            }`}>
              {inviteMsg.type === 'ok' ? <Check size={15} className="shrink-0 mt-0.5" /> : <AlertCircle size={15} className="shrink-0 mt-0.5" />}
              {inviteMsg.text}
            </div>
          )}
        </div>
      )}

      {/* Members table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="px-6 py-3 border-b border-slate-50 bg-slate-50/50 grid grid-cols-[1fr_160px_160px_44px] gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <span>Usuario</span>
            <span className="text-center">Rol en Org</span>
            <span className="text-center">Desde</span>
            <span />
          </div>

          <div className="divide-y divide-slate-50">
            {members.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm font-bold">
                No hay miembros
              </div>
            ) : (
              members.map(member => {
                const isSaving = saving === member.id;
                const isOwner  = member.role === 'owner';
                // Solo owner puede cambiar roles de otros owners
                const canEdit  = isAdmin && !member.is_self && !(isOwner && callerRole !== 'owner');
                const canDelete = isAdmin && !member.is_self && !isOwner;
                const joinedDate = new Date(member.created_at).toLocaleDateString('es-CL', {
                  day: '2-digit', month: 'short', year: 'numeric'
                });

                return (
                  <div
                    key={member.id}
                    className="px-6 py-4 grid grid-cols-[1fr_160px_160px_44px] gap-4 items-center hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Email + avatar */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center text-primary font-black text-sm shrink-0">
                        {member.email[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">
                          {member.email}
                          {member.is_self && (
                            <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                              Tú
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Role */}
                    <div className="flex justify-center">
                      {isSaving ? (
                        <Loader2 size={16} className="animate-spin text-primary" />
                      ) : (
                        <RoleSelector
                          value={member.role}
                          onChange={v => handleRoleChange(member, v)}
                          disabled={!canEdit}
                        />
                      )}
                    </div>

                    {/* Joined date */}
                    <div className="flex justify-center">
                      <span className="text-xs text-slate-400 font-semibold">{joinedDate}</span>
                    </div>

                    {/* Remove */}
                    <div className="flex justify-center">
                      {canDelete && (
                        <button
                          onClick={() => handleRemove(member)}
                          disabled={!!saving}
                          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-40"
                          title="Eliminar de la organización"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer con stats */}
          <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/30 flex items-center gap-6">
            {ROLES.map(r => {
              const count = members.filter(m => m.role === r.id).length;
              if (!count) return null;
              const Icon = r.icon;
              return (
                <div key={r.id} className={`flex items-center gap-1.5 text-[10px] font-black ${r.color}`}>
                  <Icon size={11} />
                  {count} {r.label}{count !== 1 ? 's' : ''}
                </div>
              );
            })}
            <span className="ml-auto text-[10px] font-bold text-slate-400">
              {members.length} miembro{members.length !== 1 ? 's' : ''} en total
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
