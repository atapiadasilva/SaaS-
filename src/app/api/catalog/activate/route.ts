import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEPT_DISCIPLINE: Record<string, string> = {
  OT: 'Oficina Técnica', QC: 'Calidad', TER: 'Terreno',
  HSE: 'Prevención de Riesgos', BOD: 'Bodega', BIM: 'Topografía',
  ADM: 'Administración', SUB: 'Contratos', CON: 'Contratos',
  TOP: 'Topografía', COM: 'Equipos',
}
const DEPT_NAMES: Record<string, string> = {
  OT: 'Oficina Técnica', QC: 'Calidad', TER: 'Terreno',
  HSE: 'HSE / Prevención de Riesgos', BOD: 'Bodega / Procura / Logística',
  BIM: 'BIM / Coordinación', ADM: 'Administración / RRHH',
  SUB: 'Subcontratos', CON: 'Contratos / Comercial',
  TOP: 'Topografía', COM: 'Pre-comisionado / Comisionado',
}

// Tipo de restricción según departamento
const DEPT_CONSTRAINT_TYPE: Record<string, string> = {
  OT:  'ENGINEERING',
  QC:  'ENGINEERING',
  TER: 'LABOR',
  HSE: 'SAFETY',
  BOD: 'MATERIALS',
  BIM: 'ENGINEERING',
  ADM: 'LABOR',
  SUB: 'PREREQUISITE',
  CON: 'PREREQUISITE',
  TOP: 'ENGINEERING',
  COM: 'PREREQUISITE',
}

// Jefe de departamento (owner por defecto)
const DEPT_OWNER: Record<string, string> = {
  OT: 'Jefe de Oficina Técnica', QC: 'Jefe de Calidad',
  TER: 'Jefe de Terreno', HSE: 'Jefe HSE',
  BOD: 'Jefe de Procura y Logística', BIM: 'Coordinador BIM',
  ADM: 'Jefe de Administración', SUB: 'Jefe de Subcontratos',
  CON: 'Administrador de Contrato', TOP: 'Jefe de Topografía',
  COM: 'Jefe de Comisionado',
}

// Email placeholder por dept (el jefe real se asigna al editar el equipo)
const DEPT_EMAIL: Record<string, string> = {
  OT: 'jefe.ot@eimontajes.cl', QC: 'jefe.qc@eimontajes.cl',
  TER: 'jefe.ter@eimontajes.cl', HSE: 'jefe.hse@eimontajes.cl',
  BOD: 'jefe.bod@eimontajes.cl', BIM: 'jefe.bim@eimontajes.cl',
  ADM: 'jefe.adm@eimontajes.cl', SUB: 'jefe.sub@eimontajes.cl',
  CON: 'jefe.con@eimontajes.cl', TOP: 'jefe.top@eimontajes.cl',
  COM: 'jefe.com@eimontajes.cl',
}

// Días hasta próximo vencimiento según frecuencia
const FREQ_DAYS: Record<string, number> = { D: 1, S: 7, M: 30, P: 90 }

function nextDueDate(frecuencia: string): string {
  const days = FREQ_DAYS[frecuencia] ?? 14
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function descriptionForConstraint(delName: string, frecuencia: string, deptCode: string): string {
  const freqLabel: Record<string, string> = { D: 'diariamente', S: 'semanalmente', M: 'mensualmente', P: 'una sola vez' }
  return `Producir y entregar "${delName}" (${deptCode}) — ${freqLabel[frecuencia] ?? 'según programa'}.`
}

interface CatalogDelPayload {
  code: string; name: string; type: string
  destino: string; frecuencia: string; milestone?: string; comments?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { deliverables, projectIds } = await req.json() as {
    deliverables: CatalogDelPayload[]; projectIds: string[]
  }
  if (!deliverables?.length || !projectIds?.length)
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const results: Record<string, {
    created: number; skipped: number; tidpsCreated: number; constraintsCreated: number; error?: string
  }> = {}

  for (const projectId of projectIds) {
    const { data: member } = await supabase
      .from('project_members').select('role')
      .eq('project_id', projectId).eq('user_id', user.id).single()

    if (!member) {
      results[projectId] = { created: 0, skipped: 0, tidpsCreated: 0, constraintsCreated: 0, error: 'Sin acceso' }
      continue
    }

    const byDept = new Map<string, CatalogDelPayload[]>()
    for (const del of deliverables) {
      const dept = del.code.split('-')[0]
      if (!byDept.has(dept)) byDept.set(dept, [])
      byDept.get(dept)!.push(del)
    }

    let created = 0, skipped = 0, tidpsCreated = 0, constraintsCreated = 0

    for (const [deptCode, deptDels] of byDept) {
      // ── 1. Task Team ──────────────────────────────────────────────────────
      let { data: team } = await supabase.from('task_teams').select('id')
        .eq('project_id', projectId).ilike('name', `%${deptCode}%`).maybeSingle()

      if (!team) {
        const { data: newTeam, error: e } = await (supabase as any).from('task_teams').insert({
          project_id: projectId,
          name: `Task Team ${deptCode} — ${DEPT_NAMES[deptCode] ?? deptCode}`,
          discipline: DEPT_DISCIPLINE[deptCode] ?? 'Oficina Técnica',
          leader_name: DEPT_OWNER[deptCode] ?? '',
          leader_email: DEPT_EMAIL[deptCode] ?? '',
        }).select('id').single()
        if (e || !newTeam) { results[projectId] = { created, skipped, tidpsCreated, constraintsCreated, error: e?.message }; continue }
        team = newTeam
      }

      // ── 2. TIDP ───────────────────────────────────────────────────────────
      let { data: tidp } = await supabase.from('tidps').select('id')
        .eq('project_id', projectId).eq('task_team_id', team.id)
        .in('status', ['DRAFT', 'CURRENT']).maybeSingle()

      if (!tidp) {
        const { data: newTidp, error: e } = await supabase.from('tidps').insert({
          project_id: projectId, task_team_id: team.id,
          name: `TIDP ${DEPT_NAMES[deptCode] ?? deptCode}`,
          code: `TIDP-${deptCode}-AUTO`, version: '1.0', status: 'DRAFT',
          author: user.email ?? 'Sistema',
          issue_date: new Date().toISOString().split('T')[0],
        }).select('id').single()
        if (e || !newTidp) { results[projectId] = { created, skipped, tidpsCreated, constraintsCreated, error: e?.message }; continue }
        tidp = newTidp
        tidpsCreated++
      }

      // ── 3. Detectar duplicados ────────────────────────────────────────────
      const { data: existing } = await supabase.from('deliverables').select('iso_code')
        .eq('project_id', projectId).in('iso_code', deptDels.map(d => d.code))
      const existingSet = new Set((existing ?? []).map((e: any) => e.iso_code))
      skipped += existingSet.size

      const toInsert = deptDels.filter(d => !existingSet.has(d.code)).map(d => ({
        tidp_id: tidp!.id, project_id: projectId,
        name: d.name, iso_code: d.code, type: d.type,
        cde_status: 'WIP',
        loin_geometric: deptCode,
        loin_alphanumeric: d.destino,
        responsible: DEPT_OWNER[deptCode] ?? '',
      }))
      if (toInsert.length === 0) continue

      // ── 4. Insertar entregables (con ID de vuelta) ────────────────────────
      const { data: inserted, error: insertErr } = await supabase
        .from('deliverables').insert(toInsert).select('id, iso_code, name, loin_geometric')
      if (insertErr || !inserted) {
        results[projectId] = { created, skipped, tidpsCreated, constraintsCreated, error: insertErr?.message }
        continue
      }
      created += inserted.length

      // ── 5. Auto-crear restricción por cada nuevo entregable ───────────────
      const originalByCode = new Map(deptDels.map(d => [d.code, d]))
      const constraints = inserted.map((del: any) => {
        const original = originalByCode.get(del.iso_code)
        return {
          project_id:            projectId,
          deliverable_id:        del.id,
          type:                  DEPT_CONSTRAINT_TYPE[deptCode] ?? 'ENGINEERING',
          description:           descriptionForConstraint(del.name, original?.frecuencia ?? 'S', deptCode),
          resolution_owner:      DEPT_OWNER[deptCode] ?? '',
          resolution_owner_email: DEPT_EMAIL[deptCode] ?? '',
          commitment_date:       nextDueDate(original?.frecuencia ?? 'S'),
          status:                'OPEN',
        }
      })

      const { data: createdCons, error: consErr } = await supabase
        .from('tidp_constraints').insert(constraints).select('id')
      if (!consErr && createdCons) constraintsCreated += createdCons.length
    }

    results[projectId] = { created, skipped, tidpsCreated, constraintsCreated }
  }

  return NextResponse.json({ ok: true, results })
}
