export type PreviewRole = 'owner' | 'project_admin' | 'project_editor' | 'project_viewer';

export const VALID: PreviewRole[] = ['owner', 'project_admin', 'project_editor', 'project_viewer'];

/**
 * Convierte el preview en un rol de organización simulado.
 * owner/project_* → 'owner' para la plataforma, 'member' para los demás
 */
export function previewOrgRole(preview: PreviewRole): 'owner' | 'admin' | 'member' {
  if (preview === 'owner') return 'owner';
  return 'member'; // project_admin/editor/viewer son "miembros" a nivel org
}

/**
 * Convierte el preview en un rol de proyecto simulado.
 */
export function previewProjectRole(preview: PreviewRole): 'admin' | 'editor' | 'viewer' {
  switch (preview) {
    case 'owner':          return 'admin';
    case 'project_admin':  return 'admin';
    case 'project_editor': return 'editor';
    case 'project_viewer': return 'viewer';
  }
}

export const PREVIEW_ROLES: { id: PreviewRole; label: string; sublabel: string; color: string; dot: string }[] = [
  {
    id:       'owner',
    label:    'Owner',
    sublabel: 'Dueño de la plataforma',
    color:    'text-amber-700 bg-amber-50 border-amber-300',
    dot:      'bg-amber-500',
  },
  {
    id:       'project_admin',
    label:    'Admin Proyecto',
    sublabel: 'Gestiona equipo y módulos',
    color:    'text-rose-700 bg-rose-50 border-rose-300',
    dot:      'bg-rose-500',
  },
  {
    id:       'project_editor',
    label:    'Editor',
    sublabel: 'Puede editar datos',
    color:    'text-blue-700 bg-blue-50 border-blue-300',
    dot:      'bg-blue-500',
  },
  {
    id:       'project_viewer',
    label:    'Visualizador',
    sublabel: 'Solo lectura',
    color:    'text-slate-600 bg-slate-50 border-slate-300',
    dot:      'bg-slate-400',
  },
];
