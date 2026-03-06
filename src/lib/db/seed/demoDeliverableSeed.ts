/**
 * Demo production deliverables and technical_specs seed.
 * Used when initialising a new demo project (ensureDemoData / resetDemoData → runFullSeed).
 * Seeds 12 realistic streaming/HETV deliverables and their technical specs.
 * Deterministic and demo-only.
 */
import { getDb } from '../client'
import { IDS } from './constants'

const DEMO_DELIVERABLES: Array<{
  name: string
  resolution: string | null
  codec: string | null
  notes: string
}> = [
  { name: 'Picture Master', resolution: '1920x1080', codec: 'ProRes 422 HQ', notes: 'Picture master for streaming delivery.' },
  { name: 'Textless Master', resolution: '1920x1080', codec: 'ProRes 422 HQ', notes: 'Textless version for localisation.' },
  { name: 'Stereo Mix', resolution: null, codec: null, notes: 'Stereo broadcast mix.' },
  { name: '5.1 Surround Mix', resolution: null, codec: null, notes: '5.1 surround mix.' },
  { name: 'M&E Mix', resolution: null, codec: null, notes: 'Music and effects mix.' },
  { name: 'Closed Captions (CC)', resolution: null, codec: null, notes: 'Closed captions file.' },
  { name: 'SDH Captions', resolution: null, codec: null, notes: 'SDH captions.' },
  { name: 'Timed Text Subtitle File', resolution: null, codec: null, notes: 'Timed text / subtitle file.' },
  { name: 'QC Report', resolution: null, codec: null, notes: 'QC report.' },
  { name: 'Dialogue List', resolution: null, codec: null, notes: 'Dialogue list.' },
  { name: 'As-Delivered Metadata', resolution: null, codec: null, notes: 'As-delivered metadata.' },
  { name: 'Trailer Master', resolution: '1920x1080', codec: 'H.264', notes: 'Trailer master for marketing.' },
]

/**
 * Seed demo deliverables and technical_specs. Call after production and other demo data exist.
 * Due dates: startDate + 60 + i*7 days. Status: every 3rd done, rest pending.
 */
export async function seedDemoDeliverables(
  pid: string,
  startDate: string,
  ts: string,
  addDaysLocal: (yyyyMmDd: string, days: number) => string
): Promise<void> {
  const db = await getDb()

  for (let i = 1; i <= 12; i++) {
    const del = DEMO_DELIVERABLES[i - 1]!
    await db.execute(
      `INSERT INTO deliverables (id, production_id, name, due_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [IDS.deliverable(i), pid, del.name, addDaysLocal(startDate, 60 + i * 7), i % 3 === 0 ? 'done' : 'pending', ts, ts]
    )
  }

  for (let i = 1; i <= 12; i++) {
    const del = DEMO_DELIVERABLES[i - 1]!
    await db.execute(
      `INSERT INTO technical_specs (id, deliverable_id, resolution, codec, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [IDS.technicalSpec(i), IDS.deliverable(i), del.resolution, del.codec, del.notes, ts, ts]
    )
  }
}
