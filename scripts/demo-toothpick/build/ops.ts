/**
 * Operations rows: tasks, equipment, music/clearances, deliverables, hazards and risk assessments,
 * documents (script PDF, permits, agreements) and the script-document link.
 */
import { CREW_TO_TASK_DEPARTMENT_MAP, type CrewDepartmentName } from '@/lib/people/crewDepartments'
import { getBuiltInHazard } from '@/lib/risk-assessments/builtInHazards'
import { serializeFirstAiders } from '@/lib/risk-assessments/content'
import { add, type Ctx } from './ctx'
import { DEMO_BANNER, renderPdf } from '../lib/pdf'
import { fileSafe } from '../lib/util'
import { vendorByKey } from '../data/vendors'
import { crewByKey, crewEmailLocal, crewPhone } from '../data/people'
import { locationByKey, type LocationKey } from '../data/locations'
import { INVOICES } from '../data/finance'
import { DAYS, EMERGENCY } from '../data/schedule'
import {
  BUILT_IN_HAZARD_KEYS_BY_DAY, DELIVERABLES, EQUIPMENT, EQUIPMENT_LISTS, HAZARD_TEMPLATES, MUSIC, TASKS, TASK_SECTIONS,
} from '../data/ops'

const HIRE_START = '2026-10-30'
const HIRE_END = '2026-11-12'

// ─── Tasks ───────────────────────────────────────────────────────────────────

function taskDeptForEquipment(dept: string): string {
  const mapped = CREW_TO_TASK_DEPARTMENT_MAP[dept as CrewDepartmentName]
  return mapped?.[0] ?? dept
}

export function buildTasks(ctx: Ctx): void {
  TASK_SECTIONS.forEach((s, i) => add(ctx, 'production_task_sections', {
    id: ctx.ids('taskSection', s.key), production_id: ctx.pid, name: s.name, sort_order: i, created_at: ctx.ts, updated_at: ctx.ts,
  }))
  const row = (r: Record<string, unknown>) => add(ctx, 'production_tasks', {
    production_id: ctx.pid, notes: null, due_date: null, priority: null, parent_task_id: null, section_id: null,
    vendor_invoice_id: null, equipment_id: null, created_at: ctx.ts, updated_at: ctx.ts, ...r,
  })
  for (const t of TASKS) {
    row({
      id: ctx.ids('task', t.key), description: t.description, is_complete: t.done ? 1 : 0, notes: t.notes ?? null,
      due_date: t.due, assigned_department: t.dept, priority: t.priority,
      parent_task_id: t.parent ? ctx.ids('task', t.parent) : null, section_id: ctx.ids('taskSection', t.section),
    })
  }
  // Invoice reminders: one per invoice, as the app creates them.
  for (const inv of INVOICES) {
    row({
      id: ctx.ids('task', `inv.${inv.key}`), description: `Pay invoice ${inv.number} — ${vendorByKey(inv.vendor).company_name}`,
      is_complete: inv.status === 'paid' ? 1 : 0, due_date: inv.due, assigned_department: 'Accounts',
      vendor_invoice_id: ctx.ids('invoice', inv.key),
    })
  }
  // Equipment return reminders: one per rented item.
  for (const e of EQUIPMENT) {
    if (e.source !== 'rented') continue
    row({
      id: ctx.ids('task', `eq.${e.key}`), description: `Return equipment — ${e.name}`, is_complete: 0, due_date: HIRE_END,
      assigned_department: taskDeptForEquipment(e.department), equipment_id: ctx.ids('equipment', e.key),
      notes: [`UUID: ${ctx.ids('equipmentUuid', e.key)}`, e.vendor ? '(vendor linked)' : null, `Rental: ${HIRE_START} → ${HIRE_END}`].filter(Boolean).join(' · '),
    })
  }
}

// ─── Equipment ───────────────────────────────────────────────────────────────

export function buildEquipment(ctx: Ctx): void {
  for (const e of EQUIPMENT) {
    add(ctx, 'equipment', {
      id: ctx.ids('equipment', e.key), production_id: ctx.pid, name: e.name, quantity: e.qty ?? 1, source_type: e.source,
      vendor: null, shoot_day_id: null, notes: e.notes ?? null, item_uuid: ctx.ids('equipmentUuid', e.key),
      category: e.category, status: e.source === 'rented' ? 'planned' : 'active', department: e.department,
      vendor_id: e.vendor ? ctx.idOf.vendor(e.vendor) : null, invoice_id: e.invoice ? ctx.ids('invoice', e.invoice) : null,
      rental_start_date: e.source === 'rented' ? HIRE_START : null, return_due_date: e.source === 'rented' ? HIRE_END : null,
      returned_at: null, replacement_value: e.value, serial_number: e.serial ?? null, created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
  for (const l of EQUIPMENT_LISTS) {
    add(ctx, 'equipment_lists', {
      id: ctx.ids('equipmentList', l.key), production_id: ctx.pid, shoot_day_id: l.day ? ctx.idOf.day(l.day) : null,
      name: l.name, department: l.department, notes: l.notes, created_at: ctx.ts, updated_at: ctx.ts,
    })
    l.items.forEach((it, i) => add(ctx, 'equipment_list_items', {
      id: ctx.ids('equipmentListItem', `${l.key}.${i}`), equipment_list_id: ctx.ids('equipmentList', l.key),
      equipment_id: ctx.ids('equipment', it.equip), sort_order: i, checked_out: 0, checked_back_in: 0, notes: null,
      quantity: it.qty ?? 1, created_at: ctx.ts, updated_at: ctx.ts,
    }))
  }
}

// ─── Music and deliverables ─────────────────────────────────────────────────

export function buildMusicAndDeliverables(ctx: Ctx): void {
  for (const m of MUSIC) {
    add(ctx, 'music_tracks', {
      id: ctx.ids('music', m.key), production_id: ctx.pid, title: m.title, artist: m.artist, publisher_label: m.label,
      notes: m.notes, episode_id: null, created_at: ctx.ts, updated_at: ctx.ts,
    })
    add(ctx, 'clearances', {
      id: ctx.ids('clearance', m.key), production_id: ctx.pid, type: 'music', item_id: ctx.ids('music', m.key),
      status: m.clearance === 'granted' ? 'granted' : 'pending', requested_at: m.requested ?? null, granted_at: m.granted ?? null,
      expiry: null, created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
  for (const d of DELIVERABLES) {
    add(ctx, 'deliverables', {
      id: ctx.ids('deliverable', d.key), production_id: ctx.pid, name: d.name, due_date: d.due, status: d.status,
      recipient: d.recipient, delivery_method: d.method, delivered_by: null, delivered_at: null, approval_status: d.approval,
      episode_id: null, created_at: ctx.ts, updated_at: ctx.ts,
    })
    add(ctx, 'technical_specs', {
      id: ctx.ids('techSpec', d.key), deliverable_id: ctx.ids('deliverable', d.key), resolution: d.spec.resolution ?? null,
      codec: d.spec.codec ?? null, audio: d.spec.audio ?? null, captions: d.spec.captions ?? null, aspect_ratio: d.spec.aspect ?? null,
      platform: d.spec.platform ?? null, notes: d.spec.notes, bitrate: d.spec.bitrate ?? null, subtitles: d.spec.subtitles ?? null,
      graphics: d.spec.graphics ?? null, language: d.spec.language ?? null, audio_mix: d.spec.audioMix ?? null,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
}

// ─── Hazards and risk assessments ───────────────────────────────────────────

const RAMS_LOCATION: Record<number, LocationKey> = {
  1: 'maisiesFlat', 2: 'hughsFlat', 3: 'gooseAndGander', 4: 'cafe', 5: 'club', 6: 'donsFlat', 7: 'loadOut',
}
const RAMS_TEMPLATES_BY_DAY: Record<number, string[]> = {
  1: ['Filming in a public park'],
  3: ['Working in licensed premises (pub, bar, café)'],
  4: ['Working in licensed premises (pub, bar, café)'],
  5: ['Working in licensed premises (pub, bar, café)', 'Night exterior on a public pavement'],
  6: ['Filming in a public park', 'Static vehicle rig (bus)'],
  7: ['Night exterior on a public pavement'],
}
const RAMS_ACTIVITIES: Record<number, string> = {
  1: 'Interior filming in a private flat (bedroom, bathroom, kitchen), then a company move and a daytime walk-and-talk in Platt Fields Park with a gimbal and dolly. Cast: 2. Crew: about 28.',
  2: 'Interior filming in a private flat in two lighting looks (lamp-lit "night", then daylight), plus Second Unit macro inserts. Cast: 2. Crew: about 28 plus Second Unit.',
  3: 'Interior filming in a closed pub: daytime scene, then blackout for two night scenes. Practical lights, tie-in to venue power, herbal cigarette props. Cast: 3 plus supporting artists.',
  4: 'Before-opening filming in a small café and its staff bathroom, then a private apartment (balcony railings in shot). Small crew in confined spaces. Cast: 3.',
  5: 'Afternoon in a working bar, then a night exterior on a public pavement outside a live-music venue with hard-techno playback, a bouncer and a queue. Cast: 5 plus supporting artist.',
  6: 'Private house interiors (two rooms), a daytime park scene with the public present, then a parked bus rocked by grips at dusk. Cast: 2 plus supporting artists.',
  7: 'Main Unit: bars in the afternoon, then a night load-out exterior with a box truck and flight cases. Second Unit: degree-show gallery and a pub. Cast: 5 plus supporting artists.',
}

export function buildHazardsAndRams(ctx: Ctx): void {
  HAZARD_TEMPLATES.forEach((h, i) => add(ctx, 'hazard_templates', {
    id: ctx.ids('hazardTemplate', i), production_id: ctx.pid, name: h.name, description: h.description, risks: h.risks,
    outcomes: h.outcomes, control_measures: h.controls, at_risk_crew: h.crew, at_risk_cast: h.cast, at_risk_public: h.public,
    severity_before: h.sb, probability_before: h.pb, severity_after: h.sa, probability_after: h.pa,
    created_at: ctx.ts, updated_at: ctx.ts,
  }))
  const police = (base: string) => (['park', 'hughsFlat'].includes(base) ? EMERGENCY.policeSouth : EMERGENCY.policeCity)
  for (const d of DAYS) {
    const loc = locationByKey(RAMS_LOCATION[d.n]!)
    const raId = ctx.ids('rams', d.n)
    const approved = d.n <= 3
    const p = police(d.base)
    add(ctx, 'risk_assessments', {
      id: raId, production_id: ctx.pid, shoot_day_id: ctx.idOf.day(d.n), location_id: ctx.idOf.location(loc.key),
      location_name: loc.name, activities: RAMS_ACTIVITIES[d.n]!, responsible_person_id: ctx.idOf.person('crew', 'productionManager'),
      responsible_person_name: crewByKey('productionManager').name,
      first_aiders_json: serializeFirstAiders([
        { name: 'Set medic (name TBC)', phone: '07700 900210', email: 'medic@safesetnw-demo.example' },
        { name: crewByKey('unitManager').name, phone: crewPhone('unitManager'), email: `${crewEmailLocal('unitManager')}@toothpick-demo.example` },
      ]),
      hospital_name: EMERGENCY.hospital.name, hospital_address: EMERGENCY.hospital.address, hospital_phone: '0161 276 4147',
      police_name: p.name, police_address: p.address, police_phone: '101 (non-emergency); 999 emergency',
      status: approved ? 'approved' : 'draft', approved_by: approved ? `${crewByKey('lineProducer').name} (Line Producer)` : null,
      approved_at: approved ? '2026-10-02T14:00:00.000Z' : null, generated_document_id: null, created_at: ctx.ts, updated_at: ctx.ts,
    })
    for (const u of d.units) {
      add(ctx, 'risk_assessment_units', {
        id: ctx.ids('ramsUnit', `${d.n}.${u.unit}`), risk_assessment_id: raId, shoot_day_unit_id: ctx.idOf.dayUnit(d.n, u.unit),
        created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
    const hazards = [
      ...BUILT_IN_HAZARD_KEYS_BY_DAY[d.n]!.map((k) => {
        const h = getBuiltInHazard(k)
        if (!h) throw new Error(`Unknown built-in hazard ${k}`)
        return h
      }),
      ...(RAMS_TEMPLATES_BY_DAY[d.n] ?? []).map((name) => {
        const t = HAZARD_TEMPLATES.find((x) => x.name === name)!
        return {
          name: t.name, description: t.description, risks: t.risks, outcomes: t.outcomes, control_measures: t.controls,
          at_risk_crew: t.crew, at_risk_cast: t.cast, at_risk_public: t.public, severity_before: t.sb, probability_before: t.pb,
          severity_after: t.sa, probability_after: t.pa,
        }
      }),
    ]
    hazards.forEach((h, i) => add(ctx, 'risk_assessment_hazards', {
      id: ctx.ids('ramsHazard', `${d.n}.${i}`), risk_assessment_id: raId, sort_order: i, name: h.name, description: h.description,
      risks: h.risks, outcomes: h.outcomes, control_measures: h.control_measures, at_risk_crew: h.at_risk_crew,
      at_risk_cast: h.at_risk_cast, at_risk_public: h.at_risk_public, severity_before: h.severity_before,
      probability_before: h.probability_before, severity_after: h.severity_after, probability_after: h.probability_after,
      created_at: ctx.ts, updated_at: ctx.ts,
    }))
  }
}

// ─── Documents ───────────────────────────────────────────────────────────────

export function filePathFor(pid: string, docId: string, fileName: string): string {
  return `attachments/${pid}/${docId}-${fileName}`
}

export async function buildPlaceholderDocuments(ctx: Ctx): Promise<void> {
  const park = locationByKey('park')
  const pub = locationByKey('gooseAndGander')
  const placeholder = async (title: string, lines: string[]) =>
    renderPdf({ title, banner: DEMO_BANNER, blocks: lines.map((text) => ({ kind: 'p' as const, text })) })
  ctx.docs.push({
    id: ctx.ids('doc', 'permit.park'), entity_type: 'permit', entity_id: ctx.idOf.location('park'),
    file_name: 'Platt-Fields-Park-filming-permit-DEMO.pdf', mime_type: 'application/pdf',
    bytes: await placeholder('Filming permit — Platt Fields Park (placeholder)', [
      `Location: ${park.address}`,
      'Dates: Monday 2 November and Monday 9 November 2026 (days 1 and 6).',
      'Applications for filming in Manchester parks go through Screen Manchester, the film office for Manchester City Council. This placeholder stands in for the permit and its conditions.',
      'Conditions to track: public liability insurance evidence (minimum £5m), a risk assessment, locations marshals on the path, and unit base in the Wilmslow Road car park.',
    ]),
  })
  ctx.docs.push({
    id: ctx.ids('doc', 'release.pub'), entity_type: 'location_release', entity_id: ctx.idOf.location('gooseAndGander'),
    file_name: 'Goose-and-Gander-location-agreement-DEMO.pdf', mime_type: 'application/pdf',
    bytes: await placeholder('Location agreement — The Goose and Gander (placeholder)', [
      `Venue standing in for The Goose and Gander: ${pub.address}.`,
      'Hire: Wednesday 4 November 2026, 08:00–20:30, closed to the public. Fee £900 (PO-GBV-001), 50% deposit paid.',
      'Conditions to track: fire plan walk with the duty manager, floor protection, herbal smoking props only, venue power tie-in by a qualified electrician.',
    ]),
  })
  ctx.docs.push({
    id: ctx.ids('doc', 'insurance'), entity_type: 'manual_upload_finance', entity_id: null,
    file_name: 'Production-insurance-certificate-DEMO.pdf', mime_type: 'application/pdf',
    bytes: await placeholder('Production insurance certificate (placeholder)', [
      'Broker: Northern Screen Insurance Brokers (fictional). Invoice NSI-7712, £1,950, paid.',
      'Cover to track: public liability (minimum £5m for park and city-centre permits), equipment and hire kit, cast, negative and faulty stock, employers’ liability.',
    ]),
  })
}

/** Writes every spec'd file as a `documents` row (paths are attachments-relative, like the app's). */
export function addDocumentRows(ctx: Ctx): void {
  for (const d of ctx.docs) {
    add(ctx, 'documents', {
      id: d.id, production_id: ctx.pid, entity_type: d.entity_type, entity_id: d.entity_id, file_name: d.file_name,
      file_path: filePathFor(ctx.pid, d.id, fileSafe(d.file_name)), mime_type: d.mime_type,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
}

export function addScriptDocument(ctx: Ctx, scriptPdf: Uint8Array, rawText: string): string {
  const docId = ctx.ids('doc', 'script')
  ctx.docs.push({
    id: docId, entity_type: 'script', entity_id: null, file_name: 'Toothpick-V1.pdf', mime_type: 'application/pdf', bytes: scriptPdf,
  })
  add(ctx, 'script_documents', {
    id: ctx.ids('scriptDocument', 'v1'), production_id: ctx.pid, document_id: docId, raw_text: rawText,
    created_at: ctx.ts, updated_at: ctx.ts,
  })
  return docId
}
