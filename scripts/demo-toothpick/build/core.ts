/**
 * Core project rows: production, units, people, locations, shoot days, scenes, shots, stripboard,
 * bookings and availability.
 */
import { buildDefaultCrewHierarchyConfig } from '@/lib/people/defaultCrewHierarchy'
import { serializeMovementPins } from '@/lib/movement-orders/pins'
import { add, PRODUCTION_NAME, SLUG, type Ctx } from './ctx'
import { emailLocal, sunTimes } from '../lib/util'
import { SCENES } from '../data/scenes'
import { LOCATIONS, type LocationKey } from '../data/locations'
import {
  CAST, CAST_AVAILABILITY, CREW, CREW_AVAILABILITY, castByKey, crewByKey, crewEmailLocal, crewPhone, type CastKey,
} from '../data/people'
import { SHOTS, CAST_LETTER } from '../data/shots'
import { DAYS, EMERGENCY } from '../data/schedule'
import { KEY_CONTACTS } from '../data/ops'

export const PRODUCTION_NOTES =
  'Toothpick — a short comedy-drama written by Aran Davies (script V1, 04/12/2025, 26 pages). Hugh, a 22-year-old stage-crew freelancer, burns through his wages and his relationships on nights out until a conversation in a park makes him rethink. Shot in Manchester over 7 days (2–10 Nov 2026): Fallowfield, Ancoats, the Northern Quarter, Castlefield and Trafford Park. Main Unit plus a Second Unit on days 2 and 7. Demo data: all people, companies, invoices and contacts are fictional; locations are real public venues (verified addresses) or area-level for private homes.'

export function buildProduction(ctx: Ctx): void {
  add(ctx, 'productions', {
    id: ctx.pid, name: PRODUCTION_NAME, notes: PRODUCTION_NOTES, slug: SLUG, currency_code: 'GBP',
    is_episodic: 0, client_id: null, delivery_date: '2027-02-26', created_at: ctx.ts, updated_at: ctx.ts,
  })
  add(ctx, 'units',
    { id: ctx.idOf.unit('main'), production_id: ctx.pid, name: 'Main Unit', created_at: ctx.ts, updated_at: ctx.ts },
    { id: ctx.idOf.unit('second'), production_id: ctx.pid, name: 'Second Unit', created_at: ctx.ts, updated_at: ctx.ts },
  )
  // Crew hierarchy: canonical departments plus a Script Supervisor role (not in the built-in list).
  const config = buildDefaultCrewHierarchyConfig()
  const production = config.departments.find((d) => d.name === 'Production')!
  const lineProducer = production.roles.findIndex((r) => r.name === 'Line Producer')
  production.roles.splice(lineProducer, 0, { id: 'production--script-supervisor', name: 'Script Supervisor', sort_order: 0 })
  production.roles.forEach((r, i) => { r.sort_order = i })
  add(ctx, 'production_crew_hierarchy_configs', {
    id: ctx.ids('crewHierarchy', 'toothpick'), production_id: ctx.pid, config_json: JSON.stringify(config),
    created_at: ctx.ts, updated_at: ctx.ts,
  })
}

// ─── People ──────────────────────────────────────────────────────────────────

export function buildPeople(ctx: Ctx): void {
  let castPhone = 400
  for (const c of CAST) {
    add(ctx, 'people', {
      id: ctx.idOf.person('cast', c.key), production_id: ctx.pid, name: c.name, is_cast: 1,
      cast_number: c.cast_number, role_name: c.role_name,
      email: `${emailLocal(c.name)}@toothpick-demo.example`, phone: `07700 900${castPhone++}`,
      agent_name: c.agent_name, agent_email: c.agent_email, agent_phone: c.agent_phone,
      contributor_form_status: c.contributor_form_status, notes: c.notes, created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
  for (const c of CREW) {
    add(ctx, 'people', {
      id: ctx.idOf.person('crew', c.key), production_id: ctx.pid, name: c.name, is_cast: 0,
      department: c.department, role_name: c.role_name, phases: c.phases,
      email: `${emailLocal(c.name)}@toothpick-demo.example`, phone: crewPhone(c.key),
      contributor_form_status: 'not_requested', notes: c.notes, created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
}

export function buildAvailability(ctx: Ctx): void {
  CAST_AVAILABILITY.forEach((a, i) => {
    add(ctx, 'cast_availability', {
      id: ctx.ids('castAvailability', i), production_id: ctx.pid, person_id: ctx.idOf.person('cast', a.cast),
      start_date: a.start, end_date: a.end, availability: a.availability, notes: a.notes,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
  })
  CREW_AVAILABILITY.forEach((a, i) => {
    add(ctx, 'crew_availability', {
      id: ctx.ids('crewAvailability', i), production_id: ctx.pid, person_id: ctx.idOf.person('crew', a.crew),
      start_date: a.start, end_date: a.end, availability: a.availability, notes: a.notes,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
  })
}

export function buildKeyContacts(ctx: Ctx): void {
  KEY_CONTACTS.forEach((k, i) => {
    add(ctx, 'key_contacts', {
      id: ctx.ids('keyContact', i), production_id: ctx.pid, department: k.department,
      name: k.crewKey ? crewByKey(k.crewKey).name : k.name ?? null,
      phone: k.crewKey ? crewPhone(k.crewKey) : k.phone ?? null,
      email: k.crewKey ? `${crewEmailLocal(k.crewKey)}@toothpick-demo.example` : k.email ?? null,
      notes: k.notes ?? null, created_at: ctx.ts, updated_at: ctx.ts,
    })
  })
}

// ─── Locations ───────────────────────────────────────────────────────────────

export function buildLocations(ctx: Ctx): void {
  for (const l of LOCATIONS) {
    add(ctx, 'locations', {
      id: ctx.idOf.location(l.key), production_id: ctx.pid, name: l.name, booked_status: l.booked_status,
      address: l.address, availability_constraints: l.availability_constraints, location_fee: l.location_fee,
      notes: l.notes, parking_info: l.parking_info, contact_name: l.contact_name, contact_email: l.contact_email,
      contact_phone: l.contact_phone, created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
}

// ─── Shoot days, units, scenes, shots, strips ────────────────────────────────

const LENS_TERMS = ['18mm', '24mm', '35mm', '50mm', '85mm', '100mm Macro', '24–70mm', '70–200mm']
const SUPPORT_TERMS = ['Tripod', 'Shoulder', 'Gimbal', 'Dolly', 'Jib', 'Crane', 'Steadicam', 'Slider', 'Handheld']

export function buildEquipmentTerms(ctx: Ctx): void {
  let n = 0
  for (const v of LENS_TERMS) add(ctx, 'equipment_terms', { id: ctx.ids('term', n++), production_id: ctx.pid, type: 'LENS', value: v, created_at: ctx.ts, updated_at: ctx.ts })
  for (const v of SUPPORT_TERMS) add(ctx, 'equipment_terms', { id: ctx.ids('term', n++), production_id: ctx.pid, type: 'SUPPORT', value: v, created_at: ctx.ts, updated_at: ctx.ts })
}

export function buildShootDays(ctx: Ctx): void {
  for (const d of DAYS) {
    const police = ['park', 'hughsFlat'].includes(d.base) ? EMERGENCY.policeSouth : EMERGENCY.policeCity
    const sun = sunTimes(d.date)
    const mapped = d.pins.map((p) => ({ ...p }))
    add(ctx, 'shoot_days', {
      id: ctx.idOf.day(d.n), production_id: ctx.pid, shoot_date: d.date, day_number: d.n,
      call_time: d.call, wrap_time: d.wrap, notes: `${d.headline}. ${d.notes}`,
      meal_times_json: JSON.stringify(d.meals), weather_json: JSON.stringify({ sunrise: sun.sunrise, sunset: sun.sunset }),
      parking_base_address: d.parkingBase, special_notes: d.special,
      hospital_name: EMERGENCY.hospital.name, hospital_address: EMERGENCY.hospital.address,
      police_station_name: police.name, police_station_address: police.address,
      movement_pins_json: serializeMovementPins(mapped), created_at: ctx.ts, updated_at: ctx.ts,
    })
    for (const u of d.units) {
      add(ctx, 'shoot_day_units', {
        id: ctx.idOf.dayUnit(d.n, u.unit), shoot_day_id: ctx.idOf.day(d.n), unit_id: ctx.idOf.unit(u.unit),
        notes: u.unit === 'second' ? 'Second Unit: slates take the X prefix (UK consecutive slating).' : null,
        is_locked: 0, created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
  }
}

export function buildScenes(ctx: Ctx): void {
  for (const s of SCENES) {
    add(ctx, 'scenes', {
      id: ctx.idOf.scene(s.n), production_id: ctx.pid, scene_number: String(s.n), title: s.title,
      description: s.description, int_ext: s.int_ext, day_night: s.day_night, page_eighths: s.eighths,
      duration_minutes: Math.max(1, Math.round(s.eighths / 8)), location_id: ctx.idOf.location(s.location),
      episode_id: null, created_at: ctx.ts, updated_at: ctx.ts,
    })
    const locs: LocationKey[] = [s.location as LocationKey, ...((s.extraLocations ?? []) as LocationKey[])]
    locs.forEach((lk) => add(ctx, 'location_scene', {
      id: ctx.ids('locationScene', `${s.n}.${lk}`), location_id: ctx.idOf.location(lk), scene_id: ctx.idOf.scene(s.n),
      created_at: ctx.ts, updated_at: ctx.ts,
    }))
    s.cast.forEach((ck) => add(ctx, 'scene_cast', {
      id: ctx.ids('sceneCast', `${s.n}.${ck}`), production_id: ctx.pid, scene_id: ctx.idOf.scene(s.n),
      person_id: ctx.idOf.person('cast', ck), created_at: ctx.ts, updated_at: ctx.ts,
    }))
  }
}

export function shotMinutes(scene: number, n: number): number {
  return SHOTS[scene]![n - 1]![5]
}

export function buildShots(ctx: Ctx): void {
  for (const [sceneStr, shots] of Object.entries(SHOTS)) {
    const scene = Number(sceneStr)
    shots.forEach(([size, desc, lens, support, move, minutes, letters, notes], i) => {
      const n = i + 1
      const people = [...letters].map((l) => CAST_LETTER[l]!).filter(Boolean)
      const names = people.slice(0, 3).map((k) => castByKey(k).role_name.replace(/^SA – /, 'SA ')).join(', ')
      const id = ctx.idOf.shot(scene, n)
      add(ctx, 'shots', {
        id, scene_id: ctx.idOf.scene(scene), shot_number: String(n), subject: names || 'Insert / detail',
        shot_size: size, support, lens, duration_seconds: null, camera_movement: move, notes: notes ?? null,
        estimated_shoot_minutes: minutes, shot_description: desc, created_at: ctx.ts, updated_at: ctx.ts,
      })
      people.forEach((ck) => add(ctx, 'shot_cast', {
        id: ctx.ids('shotCast', `${scene}.${n}.${ck}`), production_id: ctx.pid, shot_id: id,
        person_id: ctx.idOf.person('cast', ck), created_at: ctx.ts, updated_at: ctx.ts,
      }))
    })
  }
}

export function buildStrips(ctx: Ctx): void {
  let n = 0
  for (const d of DAYS) {
    for (const u of d.units) {
      const sduId = ctx.idOf.dayUnit(d.n, u.unit)
      let sort = 0
      const base = {
        production_id: ctx.pid, shoot_day_id: ctx.idOf.day(d.n), shoot_day_unit_id: sduId,
        strip_status: 'SCHEDULED', created_at: ctx.ts, updated_at: ctx.ts,
      }
      const strip = (row: Record<string, unknown>) =>
        add(ctx, 'stripboard_strips', { id: ctx.ids('strip', n++), ...base, sort_index: sort++, ...row })
      for (const s of u.strips) {
        switch (s.type) {
          case 'call': strip({ strip_type: 'CALL', title: `Call ${s.time}` }); break
          case 'lunch': strip({ strip_type: 'LUNCH', title: `${s.label ?? 'Lunch'} ${s.time}` }); break
          case 'wrap': strip({ strip_type: 'WRAP', title: `Wrap ${s.time}` }); break
          case 'note': strip({ strip_type: 'NOTE', title: s.title, description: s.text }); break
          case 'move':
            strip({
              strip_type: 'MOVE', title: s.title, estimated_minutes: s.minutes,
              origin_location_id: ctx.idOf.location(s.from), destination_location_id: ctx.idOf.location(s.to),
            })
            break
          case 'shots':
            for (const shotNo of s.shots) {
              strip({
                strip_type: 'SHOT', scene_id: ctx.idOf.scene(s.scene), shot_id: ctx.idOf.shot(s.scene, shotNo),
                estimated_minutes: shotMinutes(s.scene, shotNo),
              })
            }
            break
        }
      }
    }
  }
}

// ─── Bookings ────────────────────────────────────────────────────────────────

/** Days each cast member is booked. Minty is deliberately NOT booked on day 4 (availability clash). */
export const CAST_DAYS: Record<CastKey, number[]> = {
  hugh: [1, 2, 3, 4, 5, 6, 7], maisie: [1, 2, 4, 5, 6, 7], don: [3, 6], rose: [3, 5], minty: [5],
  bouncer: [5], customer: [4], cottagecore: [3], woman1: [7], woman2: [7], woman3: [7],
  sa1: [6], sa2: [6], sa3: [6], sa4: [3, 7], sa5: [3, 7], sa6: [5],
}

export function buildBookings(ctx: Ctx): void {
  let n = 0
  const dayDate = (d: number) => DAYS.find((x) => x.n === d)!.date
  for (const c of CAST) {
    for (const d of CAST_DAYS[c.key]) {
      add(ctx, 'bookings', {
        id: ctx.ids('booking', n++), production_id: ctx.pid, person_id: ctx.idOf.person('cast', c.key),
        shoot_day_id: ctx.idOf.day(d), start_date: dayDate(d), end_date: dayDate(d), role: c.role_name,
        notes: c.key === 'maisie' && d === 7 ? 'Second Unit, degree-show montage.' : null,
        created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
  }
  add(ctx, 'bookings', {
    id: ctx.ids('booking', n++), production_id: ctx.pid, person_id: ctx.idOf.person('cast', 'don'),
    shoot_day_id: null, start_date: '2026-10-30', end_date: '2026-10-30', role: 'Rehearsal / sound check',
    notes: '"Free Bird" chorus rehearsal at the sound check.', created_at: ctx.ts, updated_at: ctx.ts,
  })
  for (const c of CREW) {
    const days = c.days ?? [1, 2, 3, 4, 5, 6, 7]
    for (const d of days) {
      add(ctx, 'bookings', {
        id: ctx.ids('booking', n++), production_id: ctx.pid, person_id: ctx.idOf.person('crew', c.key),
        shoot_day_id: ctx.idOf.day(d), start_date: dayDate(d), end_date: dayDate(d),
        role: c.bookingRole?.[d] ?? c.role_name, notes: null, created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
    if (c.prep) {
      add(ctx, 'bookings', {
        id: ctx.ids('booking', n++), production_id: ctx.pid, person_id: ctx.idOf.person('crew', c.key),
        shoot_day_id: null, start_date: c.prep[0], end_date: c.prep[1], role: `${c.role_name} (prep)`,
        notes: 'Prep period.', created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
    if (c.post) {
      add(ctx, 'bookings', {
        id: ctx.ids('booking', n++), production_id: ctx.pid, person_id: ctx.idOf.person('crew', c.key),
        shoot_day_id: null, start_date: c.post[0], end_date: c.post[1], role: `${c.role_name} (post)`,
        notes: 'Post-production period.', created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
  }
}

/** Handy for the guide: pages and day counts. */
export function scheduleSummary(): { days: number; scenes: number; shots: number; eighths: number } {
  return {
    days: DAYS.length,
    scenes: SCENES.length,
    shots: Object.values(SHOTS).reduce((s, a) => s + a.length, 0),
    eighths: SCENES.reduce((s, x) => s + x.eighths, 0),
  }
}
