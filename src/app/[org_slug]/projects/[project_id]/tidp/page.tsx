'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2, AlertTriangle, LayoutDashboard, Users, Flag, FileText,
  ShieldAlert, Plus, CheckCircle2, RefreshCw, GitBranch, BookOpen,
  Search, Building2, Filter
} from 'lucide-react';
import type { CdeStatus, ConstraintStatus, TidpStatus } from '@/lib/supabase/types';
import NewTidpModal from './NewTidpModal';
import NewMilestoneModal from './NewMilestoneModal';
import NewTaskTeamModal from './NewTaskTeamModal';

// ─── Catálogo maestro de entregables EIMI (fuente: TIDPs v6.0 · abril 2026) ──
interface CatalogDel {
  code: string; name: string; type: string;
  destino: string; frecuencia: string; milestone?: string; comments?: string;
}
interface CatalogDept {
  code: string; name: string; jefe: string; alcance: string; color: string; dels: CatalogDel[];
}

const FREQ_LABELS: Record<string, string> = { D: 'Diario', S: 'Semanal', M: 'Mensual', P: 'Puntual' };
const DEST_COLORS: Record<string, string> = {
  C:    'bg-blue-100 text-blue-700 border-blue-200',
  OC:   'bg-violet-100 text-violet-700 border-violet-200',
  I:    'bg-slate-100 text-slate-600 border-slate-300',
  'C+OC': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'I+OC': 'bg-purple-100 text-purple-700 border-purple-200',
  'C+I':  'bg-cyan-100 text-cyan-700 border-cyan-200',
};
const TYPE_COLORS: Record<string, string> = {
  SCHEDULE:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  REPORT:        'bg-amber-100 text-amber-700 border-amber-200',
  DRAWING:       'bg-blue-100 text-blue-700 border-blue-200',
  SPECIFICATION: 'bg-orange-100 text-orange-700 border-orange-200',
  BIM_MODEL:     'bg-violet-100 text-violet-700 border-violet-200',
  PROCEDURE:     'bg-rose-100 text-rose-700 border-rose-200',
  CERTIFICATE:   'bg-teal-100 text-teal-700 border-teal-200',
  OTHER:         'bg-slate-100 text-slate-600 border-slate-200',
};
const TYPE_LABELS: Record<string, string> = {
  SCHEDULE: 'Programa', REPORT: 'Reporte', DRAWING: 'Plano',
  SPECIFICATION: 'Especificación', BIM_MODEL: 'Modelo BIM',
  PROCEDURE: 'Procedimiento', CERTIFICATE: 'Certificado', OTHER: 'Otro',
};

const CATALOG: CatalogDept[] = [
  {
    code: 'OT', name: 'Oficina Técnica', jefe: 'Jefe de Oficina Técnica',
    alcance: 'Planificación, records, control de gestión, EE.PP.',
    color: 'bg-blue-600',
    dels: [
      { code:'OT-PLN-SCH-002', name:'Programa Maestro actualizado semanal',     type:'SCHEDULE', destino:'C+OC', frecuencia:'S', comments:'Reprograma si Forecast >5% sobre LB' },
      { code:'OT-PLN-SCH-003', name:'Programa Trisemanal (3WL)',                type:'SCHEDULE', destino:'C+I',  frecuencia:'S', comments:'Formato EIM-OFT-001-11 · EIMI Planner' },
      { code:'OT-PLN-REP-004', name:'Matriz de Correspondencia',                type:'REPORT',   destino:'I',    frecuencia:'D', comments:'Formato EIM-OFT-001-14' },
      { code:'OT-PLN-REP-005', name:'Curvas S por especialidad',                type:'REPORT',   destino:'C+OC', frecuencia:'S', comments:'EIM-OFT-001-15 · Trazabilidad alcance↔plan' },
      { code:'OT-PLN-REP-006', name:'Histograma de mano de obra',               type:'REPORT',   destino:'OC',   frecuencia:'P', comments:'EIM-OFT-001-17 · Una vez en arranque' },
      { code:'OT-PLN-LST-007', name:'Log de Restricciones (EIMI Planner)',      type:'REPORT',   destino:'C+I',  frecuencia:'S', comments:'EIM-OFT-001-13' },
      { code:'OT-PLN-REP-008', name:'PAC / PACi semanal',                       type:'REPORT',   destino:'OC',   frecuencia:'P', comments:'Una sola emisión + revisiones' },
      { code:'OT-PLN-REP-009', name:'POD (Planificación Obra Diaria)',           type:'REPORT',   destino:'I',    frecuencia:'D', comments:'EIM-OFT-001-01' },
      { code:'OT-PLN-REP-010', name:'Análisis Condición Base',                  type:'REPORT',   destino:'I+OC', frecuencia:'P', milestone:'H-MOB', comments:'EIM-OFT-001-17' },
      { code:'OT-PLN-REP-011', name:'Análisis desviaciones / Reprogramación',   type:'REPORT',   destino:'C+OC', frecuencia:'S', comments:'EIM-OFT-001-32' },
      { code:'OT-PLN-REP-012', name:'Curvas seguimiento (LB/Real/Forecast)',     type:'REPORT',   destino:'OC',   frecuencia:'M', comments:'EIM-OFT-001-43' },
      { code:'OT-HH-REP-013',  name:'Reporte Diario de Obra',                   type:'REPORT',   destino:'OC',   frecuencia:'D', comments:'EIM-OFT-001-01' },
      { code:'OT-HH-REP-014',  name:'Parte Diario de Asistencia',               type:'REPORT',   destino:'OC',   frecuencia:'D', comments:'FO.EIM-OFT-001-50' },
      { code:'OT-HH-REP-015',  name:'Reporte Obra Semanal Consolidado',         type:'REPORT',   destino:'C+OC', frecuencia:'S', comments:'EIM-OFT-001-19' },
      { code:'OT-AVA-REP-016', name:'Planilla Medición de Avance',              type:'REPORT',   destino:'I+OC', frecuencia:'S', comments:'EIM-OFT-001-33 · Avance físico validado ITO' },
      { code:'OT-AVA-REP-017', name:'Planilla Control Programa',                type:'REPORT',   destino:'I+OC', frecuencia:'S', comments:'EIM-OFT-001-34 · LB vs Real, alertas desviación' },
      { code:'OT-AVA-REP-018', name:'Planilla Control Itemizado (Weekly)',       type:'REPORT',   destino:'I+OC', frecuencia:'S', comments:'EIM-OFT-001-35 · Avance por ítem contractual' },
      { code:'OT-PRD-REP-019', name:'Planilla Control de Productividad (PF)',    type:'REPORT',   destino:'I+OC', frecuencia:'S', comments:'EIM-OFT-001-36 · PF por especialidad' },
      { code:'OT-PRD-REP-020', name:'Resumen Control de Productividad',          type:'REPORT',   destino:'OC',   frecuencia:'S', comments:'EIM-OFT-001-37 · Resumen ejecutivo PF' },
      { code:'OT-EDP-REP-021', name:'Planilla Control Estado de Pago',           type:'REPORT',   destino:'C+OC', frecuencia:'M', comments:'EIM-OFT-001-46 · Corte mensual EDP' },
      { code:'OT-EDP-REP-022', name:'Carta de Presentación EDP',                type:'REPORT',   destino:'C',    frecuencia:'M', comments:'EIM-OFT-001-47 · Carta formal EDP al cliente' },
    ],
  },
  {
    code: 'QC', name: 'Calidad', jefe: 'Jefe de Calidad',
    alcance: 'PIC, ITP, NCR, dossier, procedimientos.',
    color: 'bg-emerald-600',
    dels: [
      { code:'QC-PIC-PRO-001', name:'Plan de Inspección y Control (PIC)',        type:'PROCEDURE', destino:'C+OC', frecuencia:'P', milestone:'H-MOB', comments:'Aprobado por ITO antes de inicio' },
      { code:'QC-ITP-LST-002', name:'Inspection & Test Plan (ITP) por CWP',      type:'PROCEDURE', destino:'C+OC', frecuencia:'P', comments:'Un ITP por CWP relevante' },
      { code:'QC-NCR-REP-003', name:'Registro No Conformidades (NCR)',            type:'REPORT',   destino:'C+OC', frecuencia:'D', comments:'Cierre en ≤ 5 días hábiles' },
      { code:'QC-DOS-CER-004', name:'Dossier de Calidad por disciplina',          type:'CERTIFICATE',destino:'C',  frecuencia:'P', milestone:'H-CLO', comments:'Entrega al cierre' },
      { code:'QC-PRO-PRO-005', name:'Procedimiento de Control de Calidad',        type:'PROCEDURE', destino:'OC',  frecuencia:'P', comments:'EIM-QC-001 — base del PIC' },
    ],
  },
  {
    code: 'TER', name: 'Terreno', jefe: 'Jefe de Terreno',
    alcance: 'Reporte diario, dotaciones, maquinaria, bitácora.',
    color: 'bg-orange-600',
    dels: [
      { code:'TER-REP-DIA-001', name:'Reporte Diario Terreno',                   type:'REPORT',   destino:'OC',   frecuencia:'D', comments:'Incluye dotación, avance físico, incidentes' },
      { code:'TER-DOT-REP-002', name:'Informe Dotación Semanal',                  type:'REPORT',   destino:'OC',   frecuencia:'S', comments:'Trabajadores propios + subcontratos' },
      { code:'TER-MAQ-REP-003', name:'Informe Control de Maquinaria',             type:'REPORT',   destino:'I+OC', frecuencia:'S', comments:'Horas efectivas vs. disponibles' },
      { code:'TER-BIT-REP-004', name:'Bitácora de Obra',                          type:'REPORT',   destino:'C+OC', frecuencia:'D', comments:'Registro cronológico oficial' },
      { code:'TER-FRE-REP-005', name:'Informe Frentes de Trabajo',                type:'REPORT',   destino:'I',    frecuencia:'S', comments:'Por CWP activo' },
      { code:'TER-CIE-REP-006', name:'Reporte Cierre de Frente',                  type:'REPORT',   destino:'C+OC', frecuencia:'P', comments:'Al completar cada CWP' },
    ],
  },
  {
    code: 'HSE', name: 'HSE / Prevención de Riesgos', jefe: 'Jefe HSE',
    alcance: 'IPER, permisos, indicadores, RCA, dossier HSE.',
    color: 'bg-red-600',
    dels: [
      { code:'HSE-IPE-PRO-001', name:'Identificación de Peligros y Evaluación de Riesgos (IPER)', type:'PROCEDURE', destino:'C+OC', frecuencia:'P', milestone:'H-MOB' },
      { code:'HSE-PER-LST-002', name:'Registro Permisos de Trabajo (PT)',          type:'REPORT',   destino:'I',    frecuencia:'D', comments:'PT alto riesgo + caliente' },
      { code:'HSE-IND-REP-003', name:'Tablero de Indicadores HSE',                 type:'REPORT',   destino:'C+OC', frecuencia:'S', comments:'TRIFR, IF, IS, HIPO' },
      { code:'HSE-RCA-REP-004', name:'Análisis Causa Raíz de Incidente (RCA)',     type:'REPORT',   destino:'C+OC', frecuencia:'P', comments:'Plazo máx 5 días post-incidente' },
      { code:'HSE-DOS-CER-005', name:'Dossier HSE al cierre',                      type:'CERTIFICATE',destino:'C',  frecuencia:'P', milestone:'H-CLO' },
    ],
  },
  {
    code: 'BOD', name: 'Bodega / Procura / Logística', jefe: 'Jefe de Procura y Logística',
    alcance: 'Recepciones, stock, FIM, certificados proveedores.',
    color: 'bg-amber-600',
    dels: [
      { code:'BOD-REC-LST-001', name:'Registro Recepciones de Material',           type:'REPORT',   destino:'I+OC', frecuencia:'D', comments:'Vinculado a PWP' },
      { code:'BOD-STK-REP-002', name:'Informe de Stock Crítico',                   type:'REPORT',   destino:'OC',   frecuencia:'S', comments:'Alertas de quiebre de stock' },
      { code:'BOD-FIM-LST-003', name:'Fichas de Ingreso de Material (FIM)',         type:'REPORT',   destino:'I',    frecuencia:'D', comments:'Por ítem recepcionado' },
      { code:'BOD-PRV-CER-004', name:'Certificados de Calidad de Proveedores',      type:'CERTIFICATE',destino:'C+OC',frecuencia:'P', comments:'Al ingreso de material certificado' },
    ],
  },
  {
    code: 'BIM', name: 'BIM / Coordinación', jefe: 'Coordinador BIM',
    alcance: 'Modelo federado, clash, 4D, as-built.',
    color: 'bg-violet-600',
    dels: [
      { code:'BIM-MOD-IFC-001', name:'Modelo Federado IFC (Coordinación)',         type:'BIM_MODEL', destino:'C+OC', frecuencia:'S', comments:'LOD 300 mín · Navisworks NWD' },
      { code:'BIM-CLH-REP-002', name:'Informe Clash Detection',                    type:'REPORT',    destino:'C+OC', frecuencia:'S', comments:'Clashes Hard + Soft por disciplina' },
      { code:'BIM-4D-SCH-003',  name:'Modelo 4D (BIM+Programa)',                   type:'BIM_MODEL', destino:'C+OC', frecuencia:'M', comments:'Vinculado a Programa Maestro' },
      { code:'BIM-ASB-IFC-004', name:'Modelo As-Built IFC',                        type:'BIM_MODEL', destino:'C',    frecuencia:'P', milestone:'H-CLO', comments:'LOD 400 · Entrega final' },
      { code:'BIM-PLN-DRW-005', name:'Planos de Construcción (RFI resueltos)',      type:'DRAWING',   destino:'C+OC', frecuencia:'P', comments:'Uno por RFI con impacto en plano' },
      { code:'BIM-RFI-REP-006', name:'Registro RFI (Request for Information)',      type:'REPORT',    destino:'C+OC', frecuencia:'S', comments:'Estado abierto/cerrado, días vigente' },
      { code:'BIM-PLN-DRW-007', name:'Planos Estructurales (IFC→PDF)',              type:'DRAWING',   destino:'C+OC', frecuencia:'P', milestone:'H-CIV' },
      { code:'BIM-PLN-DRW-008', name:'Planos Mecánicos (IFC→PDF)',                  type:'DRAWING',   destino:'C+OC', frecuencia:'P', milestone:'H-MEC' },
      { code:'BIM-PLN-DRW-009', name:'Planos Eléctricos / Instrumentación',         type:'DRAWING',   destino:'C+OC', frecuencia:'P', milestone:'H-ELE' },
      { code:'BIM-BEP-PRO-010', name:'BIM Execution Plan (BEP)',                    type:'PROCEDURE', destino:'C+OC', frecuencia:'P', milestone:'H-MOB', comments:'Nomenclatura, LOINs, hitos, responsables' },
      { code:'BIM-CDE-PRO-011', name:'Procedimiento CDE (Common Data Environment)', type:'PROCEDURE', destino:'OC',   frecuencia:'P', comments:'Flujo WIP→SHARED→PUBLISHED' },
      { code:'BIM-MOD-IFC-012', name:'Modelo Disciplinar Civil IFC',                type:'BIM_MODEL', destino:'OC',   frecuencia:'M', comments:'LOD 300' },
      { code:'BIM-MOD-IFC-013', name:'Modelo Disciplinar Mecánico IFC',             type:'BIM_MODEL', destino:'OC',   frecuencia:'M', comments:'LOD 350' },
      { code:'BIM-MOD-IFC-014', name:'Modelo Disciplinar Eléctrico IFC',            type:'BIM_MODEL', destino:'OC',   frecuencia:'M', comments:'LOD 300' },
      { code:'BIM-QNT-REP-015', name:'Listado de Cantidades desde BIM',             type:'REPORT',    destino:'OC',   frecuencia:'P', comments:'Linked to EWP/CWP' },
      { code:'BIM-COO-REP-016', name:'Acta de Coordinación BIM',                   type:'REPORT',    destino:'C+OC', frecuencia:'S', comments:'Reunión semanal de coordinación' },
    ],
  },
  {
    code: 'ADM', name: 'Administración / RRHH', jefe: 'Jefe de Administración',
    alcance: 'Dotación, F30, capacitaciones, previsional.',
    color: 'bg-slate-600',
    dels: [
      { code:'ADM-DOT-REP-001', name:'Informe de Dotación Mensual',                type:'REPORT',   destino:'OC',   frecuencia:'M', comments:'Propios + subcontratos' },
      { code:'ADM-F30-CER-002', name:'Certificado F30-1 (CCAF)',                    type:'CERTIFICATE',destino:'C',  frecuencia:'M', comments:'Previsión al día' },
      { code:'ADM-CAP-REP-003', name:'Registro de Capacitaciones',                  type:'REPORT',   destino:'OC',   frecuencia:'M', comments:'ODI, inducción, cursos especiales' },
    ],
  },
  {
    code: 'SUB', name: 'Subcontratos', jefe: 'Jefe de Subcontratos',
    alcance: 'Avance subcontratistas, EE.PP., cumplimiento doc.',
    color: 'bg-teal-600',
    dels: [
      { code:'SUB-AVA-REP-001', name:'Informe Avance Subcontratistas',              type:'REPORT',   destino:'OC',   frecuencia:'S', comments:'Por contrato activo' },
      { code:'SUB-EDP-REP-002', name:'Estado de Pago Subcontratistas',              type:'REPORT',   destino:'OC',   frecuencia:'M', comments:'Validado por Jefe OT' },
      { code:'SUB-DOC-LST-003', name:'Listado Cumplimiento Documental',             type:'REPORT',   destino:'I',    frecuencia:'M', comments:'Seguros, contratos, F30 subcontratos' },
    ],
  },
  {
    code: 'CON', name: 'Contratos / Comercial', jefe: 'Administrador de Contrato',
    alcance: 'Cambios alcance, claims, cierre administrativo.',
    color: 'bg-indigo-600',
    dels: [
      { code:'CON-CAM-REP-001', name:'Registro de Cambios de Alcance',             type:'REPORT',   destino:'C+OC', frecuencia:'P', comments:'Por evento de cambio' },
      { code:'CON-CLM-REP-002', name:'Informe de Claims / Disputas',               type:'REPORT',   destino:'C+OC', frecuencia:'P', comments:'Con respaldo contractual' },
      { code:'CON-CIE-REP-003', name:'Informe de Cierre Administrativo',            type:'REPORT',   destino:'C',    frecuencia:'P', milestone:'H-CLO', comments:'Finiquito + liquidación' },
    ],
  },
  {
    code: 'TOP', name: 'Topografía', jefe: 'Jefe de Topografía',
    alcance: 'Replanteo, coordenadas as-built, monitoreo.',
    color: 'bg-cyan-600',
    dels: [
      { code:'TOP-REP-LST-001', name:'Informe de Replanteo',                       type:'REPORT',   destino:'C+OC', frecuencia:'P', comments:'Por hito constructivo' },
      { code:'TOP-ASB-DRW-002', name:'Coordenadas As-Built',                        type:'DRAWING',  destino:'C',    frecuencia:'P', milestone:'H-CLO', comments:'CSV + DWG georeferenciado' },
      { code:'TOP-MON-REP-003', name:'Informe de Monitoreo (si aplica)',            type:'REPORT',   destino:'C+OC', frecuencia:'S', comments:'Asentamientos, deformaciones' },
    ],
  },
  {
    code: 'COM', name: 'Pre-comisionado / Comisionado', jefe: 'Jefe de Comisionado',
    alcance: 'MC, RFCC, RFSU, punch list por sistema.',
    color: 'bg-rose-600',
    dels: [
      { code:'COM-MC-CER-001',  name:'Certificado Mechanical Completion (MC)',      type:'CERTIFICATE',destino:'C', frecuencia:'P', milestone:'H-PRE' },
      { code:'COM-RFC-CER-002', name:'RFCC (Ready for Commissioning Certificate)',   type:'CERTIFICATE',destino:'C', frecuencia:'P', milestone:'H-PRE' },
      { code:'COM-RFC-CER-003', name:'RFSU (Ready for Start-Up Certificate)',        type:'CERTIFICATE',destino:'C', frecuencia:'P', milestone:'H-COM' },
      { code:'COM-PUN-LST-004', name:'Punch List por Sistema',                      type:'REPORT',    destino:'C+OC',frecuencia:'P', comments:'A → B → C por sistema' },
    ],
  },
];

// ─── Color maps ────────────────────────────────────────────────────────────────
const CDE_COLORS: Record<CdeStatus, string> = {
  WIP:       'bg-amber-100 text-amber-800 border-amber-200',
  SHARED:    'bg-blue-100 text-blue-800 border-blue-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ARCHIVED:  'bg-slate-100 text-slate-600 border-slate-200',
};

const TIDP_STATUS_COLORS: Record<TidpStatus, string> = {
  DRAFT:      'bg-slate-100 text-slate-600 border-slate-200',
  CURRENT:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  SUPERSEDED: 'bg-red-100 text-red-600 border-red-200',
};

const CONSTRAINT_COLORS: Record<ConstraintStatus, string> = {
  OPEN:        'bg-red-100 text-red-700 border-red-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border-amber-200',
  CLOSED:      'bg-emerald-100 text-emerald-700 border-emerald-200',
};

type ViewKey = 'project' | 'teams' | 'milestones' | 'deliverables' | 'constraints' | 'catalog';

const VIEWS: { key: ViewKey; label: string; icon: React.ElementType }[] = [
  { key: 'project',     label: 'Proyecto',      icon: LayoutDashboard },
  { key: 'teams',       label: 'Equipos',        icon: Users           },
  { key: 'milestones',  label: 'Hitos',          icon: Flag            },
  { key: 'deliverables',label: 'Entregables',    icon: FileText        },
  { key: 'constraints', label: 'Restricciones',  icon: ShieldAlert     },
  { key: 'catalog',     label: 'Catálogo',        icon: BookOpen        },
];

export default function TidpPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { project_id, org_slug } = use(params);
  const supabase = createClient();

  const [view, setView] = useState<ViewKey>('project');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [taskTeams, setTaskTeams]     = useState<any[]>([]);
  const [tidps, setTidps]             = useState<any[]>([]);
  const [milestones, setMilestones]   = useState<any[]>([]);
  const [deliverables, setDeliverables] = useState<any[]>([]);
  const [constraints, setConstraints] = useState<any[]>([]);

  const [showNewTidp, setShowNewTidp]           = useState(false);
  const [showNewMilestone, setShowNewMilestone] = useState(false);
  const [showNewTeam, setShowNewTeam]           = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [
      { data: teams, error: e1 },
      { data: tidpData, error: e2 },
      { data: msData, error: e3 },
      { data: delData, error: e4 },
      { data: conData, error: e5 },
    ] = await Promise.all([
      (supabase as any).from('task_teams').select('*, departments(name,code)').eq('project_id', project_id),
      (supabase as any).from('tidps').select('*, task_teams(name,discipline)').eq('project_id', project_id).order('created_at', { ascending: false }),
      (supabase as any).from('milestones').select('*').eq('project_id', project_id).order('target_date'),
      (supabase as any).from('deliverables').select('*, tidps(code,name), milestones(code,description)').eq('project_id', project_id).order('planned_date'),
      (supabase as any).from('tidp_constraints').select('*, deliverables(iso_code,name)').eq('project_id', project_id).order('commitment_date'),
    ]);

    const anyError = e1 || e2 || e3 || e4 || e5;
    if (anyError) setError('Error cargando datos del módulo TIDP.');
    setTaskTeams(teams ?? []);
    setTidps(tidpData ?? []);
    setMilestones(msData ?? []);
    setDeliverables(delData ?? []);
    setConstraints(conData ?? []);
    setLoading(false);
  }, [project_id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-2 text-destructive p-8 font-semibold">
      <AlertTriangle className="w-5 h-5" /> {error}
    </div>
  );

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  const totalDel       = deliverables.length;
  const published      = deliverables.filter(d => d.cde_status === 'PUBLISHED').length;
  const overdue        = deliverables.filter(d => d.planned_date && new Date(d.planned_date) < new Date() && d.cde_status !== 'PUBLISHED').length;
  const openCons       = constraints.filter(c => c.status === 'OPEN').length;
  const compliance     = totalDel > 0 ? Math.round((published / totalDel) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-primary leading-none">Hilo Digital — TIDP</h2>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">ISO 19650-2 · Visualizador de Planes de Entrega de Información</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-muted transition">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition ${
              view === key ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Views */}
      {view === 'project'      && <ProjectView kpis={{ totalDel, published, overdue, openCons, compliance }} tidps={tidps} onNewTidp={() => setShowNewTidp(true)} />}
      {view === 'teams'        && <TeamsView teams={taskTeams} tidps={tidps} onNewTeam={() => setShowNewTeam(true)} onNewTidp={() => setShowNewTidp(true)} />}
      {view === 'milestones'   && <MilestonesView milestones={milestones} deliverables={deliverables} onNew={() => setShowNewMilestone(true)} />}
      {view === 'deliverables' && <DeliverablesView deliverables={deliverables} />}
      {view === 'constraints'  && <ConstraintsView constraints={constraints} onRefresh={load} />}
      {view === 'catalog'      && <CatalogView orgSlug={org_slug} currentProjectId={project_id} onActivated={load} />}

      {/* Modals */}
      {showNewTidp      && <NewTidpModal projectId={project_id} teams={taskTeams} onClose={() => setShowNewTidp(false)} onSaved={load} />}
      {showNewMilestone && <NewMilestoneModal projectId={project_id} onClose={() => setShowNewMilestone(false)} onSaved={load} />}
      {showNewTeam      && <NewTaskTeamModal projectId={project_id} onClose={() => setShowNewTeam(false)} onSaved={load} />}
    </div>
  );
}

// ─── Vista 1: Proyecto (dashboard) ───────────────────────────────────────────
function ProjectView({ kpis, tidps, onNewTidp }: {
  kpis: { totalDel: number; published: number; overdue: number; openCons: number; compliance: number };
  tidps: any[];
  onNewTidp: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Cumplimiento MIDP" value={`${kpis.compliance}%`}
          sub={`${kpis.published} / ${kpis.totalDel} publicados`}
          color={kpis.compliance >= 80 ? 'emerald' : kpis.compliance >= 50 ? 'amber' : 'red'} />
        <KpiCard label="Entregables totales" value={kpis.totalDel} sub="en todos los TIDPs" color="slate" />
        <KpiCard label="Vencidos" value={kpis.overdue} sub="sin publicar y fecha pasada" color={kpis.overdue > 0 ? 'red' : 'emerald'} />
        <KpiCard label="Restricciones abiertas" value={kpis.openCons} sub="requieren acción" color={kpis.openCons > 0 ? 'amber' : 'emerald'} />
      </div>

      {/* TIDPs table */}
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-black text-primary">TIDPs del Proyecto</h3>
          <button onClick={onNewTidp} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[11px] font-black rounded-lg hover:bg-primary/90 transition">
            <Plus className="w-3.5 h-3.5" /> Nuevo TIDP
          </button>
        </div>
        {tidps.length === 0 ? (
          <EmptyState icon={GitBranch} text="No hay TIDPs registrados" action="Nuevo TIDP" onAction={onNewTidp} />
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th>Código</Th><Th>Nombre</Th><Th>Equipo</Th><Th>Versión</Th><Th>Estado</Th><Th>Emisión</Th>
              </tr>
            </thead>
            <tbody>
              {tidps.map(t => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition">
                  <td className="px-4 py-3 font-mono font-bold text-primary">{t.code}</td>
                  <td className="px-4 py-3 text-slate-700">{t.name}</td>
                  <td className="px-4 py-3 text-slate-500">{t.task_teams?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{t.version}</td>
                  <td className="px-4 py-3"><StatusBadge text={t.status} cls={TIDP_STATUS_COLORS[t.status as TidpStatus]} /></td>
                  <td className="px-4 py-3 text-slate-400">{t.issue_date ? new Date(t.issue_date).toLocaleDateString('es-CL') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Vista 2: Equipos de Tareas ───────────────────────────────────────────────
function TeamsView({ teams, tidps, onNewTeam, onNewTidp }: {
  teams: any[]; tidps: any[]; onNewTeam: () => void; onNewTidp: () => void;
}) {
  const tidpsByTeam = (teamId: string) => tidps.filter(t => t.task_team_id === teamId);
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={onNewTeam} className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-[11px] font-black rounded-lg hover:bg-muted transition">
          <Plus className="w-3.5 h-3.5" /> Nuevo Equipo
        </button>
        <button onClick={onNewTidp} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[11px] font-black rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-3.5 h-3.5" /> Nuevo TIDP
        </button>
      </div>
      {teams.length === 0 ? (
        <EmptyState icon={Users} text="No hay equipos de tareas" action="Nuevo Equipo" onAction={onNewTeam} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map(team => {
            const teamTidps = tidpsByTeam(team.id);
            return (
              <div key={team.id} className="bg-white rounded-xl border border-border p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-black text-sm text-primary">{team.name}</p>
                    {team.discipline && <p className="text-[11px] text-muted-foreground mt-0.5">{team.discipline}</p>}
                  </div>
                  {team.departments && (
                    <span className="px-2 py-0.5 bg-muted text-[10px] font-bold rounded-full text-slate-500">{team.departments.code}</span>
                  )}
                </div>
                {team.leader_name && (
                  <div className="text-xs text-slate-500">
                    <span className="font-semibold">Líder:</span> {team.leader_name}
                    {team.leader_email && <span className="ml-2 text-muted-foreground">({team.leader_email})</span>}
                  </div>
                )}
                {team.client_counterpart && (
                  <div className="text-xs text-slate-500"><span className="font-semibold">Contraparte:</span> {team.client_counterpart}</div>
                )}
                <div className="pt-2 border-t border-border/50">
                  <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground mb-2">TIDPs ({teamTidps.length})</p>
                  {teamTidps.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">Sin TIDPs registrados</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {teamTidps.map(t => (
                        <span key={t.id} className={`px-2 py-0.5 text-[10px] font-bold rounded border ${TIDP_STATUS_COLORS[t.status as TidpStatus]}`}>
                          {t.code} v{t.version}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Vista 3: Hitos ───────────────────────────────────────────────────────────
function MilestonesView({ milestones, deliverables, onNew }: {
  milestones: any[]; deliverables: any[]; onNew: () => void;
}) {
  const delByMilestone = (msId: string) => deliverables.filter(d => d.milestone_id === msId);
  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={onNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[11px] font-black rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-3.5 h-3.5" /> Nuevo Hito
        </button>
      </div>
      {milestones.length === 0 ? (
        <EmptyState icon={Flag} text="No hay hitos registrados" action="Nuevo Hito" onAction={onNew} />
      ) : (
        <div className="space-y-3">
          {milestones.map(ms => {
            const msDels    = delByMilestone(ms.id);
            const total     = msDels.length;
            const pub       = msDels.filter(d => d.cde_status === 'PUBLISHED').length;
            const pct       = total > 0 ? Math.round((pub / total) * 100) : 0;
            const isPast    = new Date(ms.target_date) < today;
            const isAtRisk  = isPast && pct < 100;
            return (
              <div key={ms.id} className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isAtRisk ? 'bg-red-500' : pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <div>
                      <span className="font-mono text-xs font-bold text-muted-foreground mr-2">{ms.code}</span>
                      <span className="font-black text-sm text-primary">{ms.description}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-bold ${isAtRisk ? 'text-red-600' : 'text-slate-500'}`}>
                      {new Date(ms.target_date).toLocaleDateString('es-CL')}
                      {isAtRisk && <span className="ml-1.5 text-red-500">VENCIDO</span>}
                    </p>
                  </div>
                </div>
                {total > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{pub}/{total} publicados</span>
                      <span className="font-bold">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : isAtRisk ? 'bg-red-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {msDels.slice(0, 8).map(d => (
                        <span key={d.id} className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${CDE_COLORS[d.cde_status as CdeStatus]}`}>
                          {d.iso_code}
                        </span>
                      ))}
                      {msDels.length > 8 && <span className="px-1.5 py-0.5 text-[9px] text-muted-foreground">+{msDels.length - 8} más</span>}
                    </div>
                  </div>
                )}
                {total === 0 && <p className="text-[11px] text-muted-foreground italic">Sin entregables asignados a este hito</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Vista 4: Entregables ─────────────────────────────────────────────────────
function DeliverablesView({ deliverables }: { deliverables: any[] }) {
  const [filter, setFilter] = useState<CdeStatus | 'ALL'>('ALL');
  const today = new Date();
  const filtered = filter === 'ALL' ? deliverables : deliverables.filter(d => d.cde_status === filter);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {(['ALL', 'WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition ${
              filter === s ? 'bg-primary text-white border-primary' : 'bg-white border-border text-slate-500 hover:bg-muted'
            }`}>
            {s === 'ALL' ? 'Todos' : s}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} entregables</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} text="No hay entregables que mostrar" />
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th>Código ISO</Th><Th>Nombre</Th><Th>TIDP</Th><Th>Hito</Th>
                <Th>LOIN Geo.</Th><Th>Estado CDE</Th><Th>Fecha Plan.</Th><Th>Responsable</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const isOverdue = d.planned_date && new Date(d.planned_date) < today && d.cde_status !== 'PUBLISHED';
                return (
                  <tr key={d.id} className={`border-b border-border/50 hover:bg-muted/20 transition ${isOverdue ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3 font-mono font-bold text-primary">{d.iso_code}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={d.name}>{d.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500 text-[10px]">{d.tidps?.code ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-[10px]">{d.milestones?.code ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{d.loin_geometric ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge text={d.cde_status} cls={CDE_COLORS[d.cde_status as CdeStatus]} /></td>
                    <td className={`px-4 py-3 ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                      {d.planned_date ? new Date(d.planned_date).toLocaleDateString('es-CL') : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{d.responsible ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Vista 5: Restricciones ───────────────────────────────────────────────────
function ConstraintsView({ constraints, onRefresh }: { constraints: any[]; onRefresh: () => void }) {
  const supabase = createClient();
  const [filter, setFilter] = useState<ConstraintStatus | 'ALL'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, { comment: string; status: string; saving: boolean }>>({});
  const today = new Date();

  const filtered = filter === 'ALL' ? constraints : constraints.filter(c => c.status === filter);

  const TYPE_LABELS: Record<string, string> = {
    ENGINEERING: 'Ingeniería', MATERIALS: 'Materiales', EQUIPMENT: 'Equipos',
    LABOR: 'Mano de Obra', SAFETY: 'Seguridad', PREREQUISITE: 'Prerrequisito',
  };
  const TYPE_ICONS: Record<string, string> = {
    ENGINEERING: '⚙️', MATERIALS: '📦', EQUIPMENT: '🏗️',
    LABOR: '👷', SAFETY: '🦺', PREREQUISITE: '🔗',
  };

  const getForm = (id: string, currentStatus: string) =>
    formData[id] ?? { comment: '', status: currentStatus === 'CLOSED' ? 'CLOSED' : 'IN_PROGRESS', saving: false };

  const setField = (id: string, key: string, val: string) =>
    setFormData(prev => ({ ...prev, [id]: { ...getForm(id, ''), [key]: val } }));

  const handleSubmit = async (constraint: any) => {
    const form = getForm(constraint.id, constraint.status);
    setFormData(prev => ({ ...prev, [constraint.id]: { ...form, saving: true } }));

    // Actualizar estado de la restricción
    await (supabase as any).from('tidp_constraints').update({
      status: form.status,
      ...(form.status === 'CLOSED' ? { closure_comment: form.comment, closed_date: new Date().toISOString().split('T')[0] } : {}),
    }).eq('id', constraint.id);

    // Registrar en historial
    if (form.comment.trim()) {
      await (supabase as any).from('constraint_history').insert({
        constraint_id:   constraint.id,
        history_label:   form.status === 'CLOSED' ? 'Cierre' : 'Actualización',
        change_date:     new Date().toISOString().split('T')[0],
        changed_by:      'usuario',
        previous_status: constraint.status,
        new_status:      form.status,
        comments:        form.comment,
      });
    }

    // Actualizar estado CDE del entregable si se cierra
    if (form.status === 'CLOSED' && constraint.deliverable_id) {
      await (supabase as any).from('deliverables').update({ cde_status: 'SHARED' })
        .eq('id', constraint.deliverable_id).eq('cde_status', 'WIP');
    }

    setFormData(prev => ({ ...prev, [constraint.id]: { ...form, saving: false } }));
    setExpandedId(null);
    onRefresh();
  };

  const openCount = constraints.filter(c => c.status === 'OPEN').length;
  const inProgCount = constraints.filter(c => c.status === 'IN_PROGRESS').length;

  return (
    <div className="space-y-4">
      {/* Resumen rápido */}
      {constraints.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-red-700">{openCount}</p>
            <p className="text-[10px] font-black text-red-600 uppercase tracking-wide">Abiertas</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-amber-700">{inProgCount}</p>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-wide">En Curso</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-emerald-700">{constraints.filter(c => c.status === 'CLOSED').length}</p>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wide">Cerradas</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2">
        {(['ALL', 'OPEN', 'IN_PROGRESS', 'CLOSED'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition ${
              filter === s ? 'bg-primary text-white border-primary' : 'bg-white border-border text-slate-500 hover:bg-muted'
            }`}>
            {s === 'ALL' ? 'Todas' : s === 'IN_PROGRESS' ? 'En Curso' : s === 'OPEN' ? 'Abiertas' : 'Cerradas'}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} restricciones</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ShieldAlert} text="No hay restricciones que mostrar" />
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isOverdue = c.commitment_date && new Date(c.commitment_date) < today && c.status !== 'CLOSED';
            const isOpen = expandedId === c.id;
            const form = getForm(c.id, c.status);

            return (
              <div key={c.id} className={`bg-white rounded-xl border transition-all ${
                isOverdue ? 'border-red-300' : isOpen ? 'border-primary/40 shadow-sm' : 'border-border'
              }`}>
                {/* Fila principal */}
                <div className="flex items-start gap-3 p-4">
                  <span className="text-xl mt-0.5 shrink-0">{TYPE_ICONS[c.type] ?? '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge text={TYPE_LABELS[c.type] ?? c.type} cls="bg-slate-100 text-slate-600 border-slate-200" />
                      <StatusBadge
                        text={c.status === 'IN_PROGRESS' ? 'En Curso' : c.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
                        cls={CONSTRAINT_COLORS[c.status as ConstraintStatus]}
                      />
                      {isOverdue && <StatusBadge text="VENCIDA" cls="bg-red-100 text-red-700 border-red-200" />}
                    </div>
                    <p className="text-sm text-slate-700 leading-snug">{c.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {c.deliverables && (
                        <span className="font-mono text-[10px] text-primary font-bold">{c.deliverables.iso_code}</span>
                      )}
                      {c.resolution_owner && (
                        <span className="text-[10px] text-slate-500">👤 {c.resolution_owner}</span>
                      )}
                      {c.commitment_date && (
                        <span className={`text-[10px] font-bold ${isOverdue ? 'text-red-600' : 'text-slate-400'}`}>
                          📅 {new Date(c.commitment_date).toLocaleDateString('es-CL')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Botón Registrar */}
                  {c.status !== 'CLOSED' && (
                    <button
                      onClick={() => setExpandedId(isOpen ? null : c.id)}
                      className={`shrink-0 px-3 py-1.5 text-[11px] font-black rounded-lg border transition ${
                        isOpen
                          ? 'bg-primary text-white border-primary'
                          : 'bg-primary/5 text-primary border-primary/30 hover:bg-primary/10'
                      }`}
                    >
                      {isOpen ? 'Cancelar' : 'Registrar avance'}
                    </button>
                  )}
                </div>

                {/* Panel de captura de información */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-0 border-t border-border/50 space-y-3">
                    <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wide pt-3">
                      Captura de información — Responsable: {c.resolution_owner}
                    </p>

                    {/* Nuevo estado */}
                    <div>
                      <p className="text-[11px] font-bold text-slate-600 mb-1.5">Nuevo estado</p>
                      <div className="flex gap-2">
                        {(['IN_PROGRESS', 'CLOSED'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => setField(c.id, 'status', s)}
                            className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition ${
                              form.status === s ? CONSTRAINT_COLORS[s] + ' font-black' : 'bg-white border-border text-slate-500'
                            }`}
                          >
                            {s === 'IN_PROGRESS' ? '⏳ En Curso' : '✅ Cerrada / Entregada'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Comentario / evidencia */}
                    <div>
                      <p className="text-[11px] font-bold text-slate-600 mb-1.5">
                        {form.status === 'CLOSED' ? 'Evidencia de cierre *' : 'Comentario de avance'}
                      </p>
                      <textarea
                        rows={3}
                        placeholder={
                          form.status === 'CLOSED'
                            ? 'Describe qué se entregó, referencia del documento, link CDE...'
                            : 'Describe el avance, obstáculos, próximos pasos...'
                        }
                        value={form.comment}
                        onChange={e => setField(c.id, 'comment', e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[10px] text-muted-foreground">
                        {form.status === 'CLOSED' && 'Al cerrar, el entregable pasará a estado SHARED en el CDE.'}
                      </p>
                      <button
                        onClick={() => handleSubmit(c)}
                        disabled={form.saving || (form.status === 'CLOSED' && !form.comment.trim())}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-[11px] font-black rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                      >
                        {form.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Guardar
                      </button>
                    </div>
                  </div>
                )}

                {/* Cierre registrado */}
                {c.closure_comment && c.status === 'CLOSED' && (
                  <div className="px-4 pb-3 pt-0">
                    <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-200">
                      <span className="font-bold">✅ Cierre:</span> {c.closure_comment}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shared micro-components ─────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-700',
    slate:   'bg-white border-border text-slate-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.slate}`}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-3xl font-black mt-1">{value}</p>
      <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>
    </div>
  );
}

function StatusBadge({ text, cls }: { text: string; cls: string }) {
  return <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${cls}`}>{text}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">{children}</th>;
}

function EmptyState({ icon: Icon, text, action, onAction }: {
  icon: React.ElementType; text: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <Icon className="w-10 h-10 opacity-20" />
      <p className="text-sm font-semibold">{text}</p>
      {action && onAction && (
        <button onClick={onAction} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-[11px] font-black rounded-lg hover:bg-primary/90 transition">
          <Plus className="w-3.5 h-3.5" /> {action}
        </button>
      )}
    </div>
  );
}

// ─── Vista 6: Catálogo Maestro de Entregables ─────────────────────────────────
function CatalogView({ orgSlug, currentProjectId, onActivated }: {
  orgSlug: string; currentProjectId: string; onActivated: () => void;
}) {
  const supabase = createClient();
  const [selectedDept, setSelectedDept] = useState<string>(CATALOG[0].code);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set([currentProjectId]));
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Cargar TODOS los proyectos donde el usuario es miembro (cross-org)
  const loadProjects = async () => {
    const { data } = await (supabase as any)
      .from('project_members')
      .select('projects!inner(id, name)');
    const projs = (data ?? [])
      .map((m: any) => m.projects)
      .filter(Boolean)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    setProjects(projs);
  };

  const toggleCheck = (code: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const toggleAll = () => {
    const allCodes = filtered.map(d => d.code);
    const allChecked = allCodes.every(c => checked.has(c));
    setChecked(prev => {
      const next = new Set(prev);
      allCodes.forEach(c => allChecked ? next.delete(c) : next.add(c));
      return next;
    });
  };

  const handleAssign = async () => {
    const selectedDels = CATALOG.flatMap(d => d.dels).filter(d => checked.has(d.code));
    setAssigning(true);
    setAssignResult(null);
    try {
      const res = await fetch('/api/catalog/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliverables: selectedDels, projectIds: [...selectedProjects] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error en servidor');
      const vals = Object.values(data.results as Record<string, any>);
      const totalCreated = vals.reduce((a: number, r: any) => a + (r.created ?? 0), 0);
      const totalSkipped = vals.reduce((a: number, r: any) => a + (r.skipped ?? 0), 0);
      const totalCons    = vals.reduce((a: number, r: any) => a + (r.constraintsCreated ?? 0), 0);
      setAssignResult({ ok: true, msg: `${totalCreated} entregables activados · ${totalCons} restricciones creadas · ${totalSkipped} ya existían.` });
      setChecked(new Set());
      onActivated();
    } catch (e: any) {
      setAssignResult({ ok: false, msg: e.message });
    } finally {
      setAssigning(false);
    }
  };

  const dept = CATALOG.find(d => d.code === selectedDept)!;
  const totalEmpresa = CATALOG.reduce((acc, d) => acc + d.dels.length, 0);

  const filtered = dept.dels.filter(del => {
    const matchSearch = search === '' ||
      del.name.toLowerCase().includes(search.toLowerCase()) ||
      del.code.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'ALL' || del.type === typeFilter;
    return matchSearch && matchType;
  });

  const types = [...new Set(dept.dels.map(d => d.type))];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-primary">Catálogo Maestro de Entregables EIMI</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            v6.0 · {CATALOG.length} departamentos · {totalEmpresa} entregables tipo
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
          <Building2 className="w-3.5 h-3.5 text-violet-600" />
          <span className="text-[11px] font-black text-violet-700">Estándar Empresa — EIMI</span>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Panel izquierdo: departamentos */}
        <div className="w-52 shrink-0 space-y-1">
          {CATALOG.map(d => (
            <button
              key={d.code}
              onClick={() => { setSelectedDept(d.code); setSearch(''); setTypeFilter('ALL'); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition ${
                selectedDept === d.code
                  ? 'bg-primary text-white shadow-sm'
                  : 'hover:bg-muted text-slate-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black truncate">{d.code}</p>
                <p className={`text-[10px] truncate ${selectedDept === d.code ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {d.dels.length} entregables
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Panel derecho: entregables del departamento */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Dept header */}
          <div className={`rounded-xl p-4 text-white ${dept.color}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-black opacity-70 uppercase tracking-wide">{dept.code}</p>
                <p className="text-base font-black">{dept.name}</p>
                <p className="text-[11px] opacity-80 mt-0.5">{dept.jefe}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black">{dept.dels.length}</p>
                <p className="text-[10px] opacity-70">entregables tipo</p>
              </div>
            </div>
            <p className="text-[11px] opacity-70 mt-2 border-t border-white/20 pt-2">{dept.alcance}</p>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar código o nombre..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              {['ALL', ...types].map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1.5 text-[10px] font-black rounded-lg border transition ${
                    typeFilter === t ? 'bg-primary text-white border-primary' : 'bg-white border-border text-slate-500 hover:bg-muted'
                  }`}
                >
                  {t === 'ALL' ? 'Todos' : (TYPE_LABELS[t] ?? t)}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{filtered.length} / {dept.dels.length}</span>
          </div>

          {/* Tabla con checkboxes */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={filtered.length > 0 && filtered.every(d => checked.has(d.code))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">Código</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">Nombre</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">Tipo</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">Destino</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">Freq.</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">Hito</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">Notas</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((del, i) => (
                  <tr
                    key={del.code}
                    onClick={() => toggleCheck(del.code)}
                    className={`border-b border-border/50 cursor-pointer transition ${
                      checked.has(del.code) ? 'bg-primary/5 border-primary/20' : i % 2 === 0 ? 'hover:bg-muted/20' : 'bg-muted/10 hover:bg-muted/20'
                    }`}
                  >
                    <td className="px-3 py-2.5 w-8" onClick={e => { e.stopPropagation(); toggleCheck(del.code); }}>
                      <input type="checkbox" className="rounded" checked={checked.has(del.code)} onChange={() => toggleCheck(del.code)} />
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-primary text-[10px]">{del.code}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[200px]">
                      <span title={del.name}>{del.name}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${TYPE_COLORS[del.type] ?? TYPE_COLORS.OTHER}`}>
                        {TYPE_LABELS[del.type] ?? del.type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {del.destino.split('+').map(d => (
                        <span key={d} className={`inline-block mr-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded border ${DEST_COLORS[d] ?? DEST_COLORS.I}`}>{d}</span>
                      ))}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold text-slate-500">{FREQ_LABELS[del.frecuencia] ?? del.frecuencia}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {del.milestone
                        ? <span className="font-mono text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{del.milestone}</span>
                        : <span className="text-muted-foreground text-[10px]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-slate-400 max-w-[160px] truncate" title={del.comments}>
                      {del.comments ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">Sin resultados para &quot;{search}&quot;</p>
              </div>
            )}
          </div>

          {/* Leyenda */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="font-black uppercase tracking-wide">Destino:</span>
            {['C', 'OC', 'I'].map(d => (
              <span key={d} className={`px-1.5 py-0.5 font-bold rounded border ${DEST_COLORS[d]}`}>
                {d === 'C' ? 'C — Cliente' : d === 'OC' ? 'OC — Obra/Contr.' : 'I — Interno'}
              </span>
            ))}
            <span className="ml-4 font-black uppercase tracking-wide">Freq.:</span>
            {Object.entries(FREQ_LABELS).map(([k, v]) => (
              <span key={k} className="text-slate-500">{k}={v}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Barra flotante de selección */}
      {checked.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-primary text-white px-5 py-3 rounded-2xl shadow-xl">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-white text-primary text-[11px] font-black flex items-center justify-center">{checked.size}</span>
            <span className="text-sm font-bold">entregables seleccionados</span>
          </div>
          <button
            onClick={() => { setChecked(new Set()); }}
            className="text-white/60 hover:text-white text-[11px] underline"
          >
            Limpiar
          </button>
          <button
            onClick={() => { loadProjects(); setShowAssignModal(true); setAssignResult(null); }}
            className="flex items-center gap-1.5 bg-white text-primary px-4 py-2 rounded-xl text-[11px] font-black hover:bg-white/90 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Asignar a proyectos
          </button>
        </div>
      )}

      {/* Modal asignación multi-proyecto */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-black text-primary">Asignar a proyectos</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {checked.size} entregables · selecciona uno o más proyectos
                </p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-muted-foreground hover:text-slate-700 text-lg font-bold">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
              {projects.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                projects.map(p => {
                  const isCurrent = p.id === currentProjectId;
                  const sel = selectedProjects.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProjects(prev => {
                        const next = new Set(prev);
                        sel ? next.delete(p.id) : next.add(p.id);
                        return next;
                      })}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition ${
                        sel ? 'bg-primary/5 border-primary text-primary' : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center ${sel ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                        {sel && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{p.name}</p>
                        {isCurrent && <span className="text-[9px] text-primary font-black">Proyecto actual</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {assignResult && (
              <div className={`mx-6 mb-2 px-4 py-3 rounded-xl text-[11px] font-semibold border ${
                assignResult.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {assignResult.msg}
              </div>
            )}

            <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">{selectedProjects.size} proyecto{selectedProjects.size !== 1 ? 's' : ''} seleccionado{selectedProjects.size !== 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-[11px] font-black border border-border rounded-xl hover:bg-muted transition">
                  Cerrar
                </button>
                <button
                  onClick={handleAssign}
                  disabled={assigning || selectedProjects.size === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-[11px] font-black rounded-xl hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Activar entregables
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
