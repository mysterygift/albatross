/**
 * Demo production deliverables and technical_specs seed.
 * Used when initialising a new demo project (ensureDemoData / resetDemoData → runFullSeed).
 * Seeds 12 realistic streaming/HETV deliverables with richer metadata and structured technical specs.
 * Deterministic and demo-only.
 */
import { getDb } from '../client'
import { IDS } from './constants'

/** Deliverable metadata supported by current schema. */
type DemoDeliverableMeta = {
  name: string
  recipient: string | null
  delivery_method: string | null
  delivered_by: string | null
  delivered_at: string | null
  status: string
  approval_status: string | null
}

/** Technical spec fields supported by current schema. */
type DemoSpecFields = {
  resolution: string | null
  codec: string | null
  audio: string | null
  captions: string | null
  aspect_ratio: string | null
  platform: string | null
  notes: string | null
  bitrate: string | null
  subtitles: string | null
  graphics: string | null
  language: string | null
  audio_mix: string | null
}

type DemoDeliverableRow = DemoDeliverableMeta & DemoSpecFields

const DEMO_DELIVERABLES: DemoDeliverableRow[] = [
  {
    name: 'Picture Master',
    recipient: 'Netflix',
    delivery_method: 'Aspera',
    delivered_by: null,
    delivered_at: null,
    status: 'delivered',
    approval_status: 'approved',
    resolution: '3840x2160',
    codec: 'ProRes 422 HQ',
    audio: null,
    captions: null,
    aspect_ratio: '16:9',
    platform: null,
    notes: 'Platform-ready picture master, UHD.',
    bitrate: '~800 Mbps',
    subtitles: null,
    graphics: 'Full Graphics',
    language: 'English',
    audio_mix: '5.1',
  },
  {
    name: 'Textless Master',
    recipient: 'Netflix',
    delivery_method: 'Aspera',
    delivered_by: null,
    delivered_at: null,
    status: 'ready',
    approval_status: 'pending',
    resolution: '3840x2160',
    codec: 'ProRes 422 HQ',
    audio: null,
    captions: null,
    aspect_ratio: '16:9',
    platform: null,
    notes: 'Textless version for localisation.',
    bitrate: '~800 Mbps',
    subtitles: null,
    graphics: 'Textless',
    language: null,
    audio_mix: '5.1',
  },
  {
    name: 'Stereo Mix',
    recipient: 'Amazon Prime Video',
    delivery_method: 'Signiant',
    delivered_by: 'Post Supervisor',
    delivered_at: null,
    status: 'delivered',
    approval_status: 'approved',
    resolution: null,
    codec: null,
    audio: 'Stereo',
    captions: null,
    aspect_ratio: null,
    platform: null,
    notes: 'Stereo broadcast mix, -24 LKFS.',
    bitrate: null,
    subtitles: null,
    graphics: null,
    language: 'English',
    audio_mix: 'Stereo',
  },
  {
    name: '5.1 Surround Mix',
    recipient: 'Amazon Prime Video',
    delivery_method: 'Signiant',
    delivered_by: null,
    delivered_at: null,
    status: 'qc',
    approval_status: 'pending',
    resolution: null,
    codec: null,
    audio: '5.1',
    captions: null,
    aspect_ratio: null,
    platform: null,
    notes: '5.1 surround mix, -24 LKFS.',
    bitrate: null,
    subtitles: null,
    graphics: null,
    language: 'English',
    audio_mix: '5.1',
  },
  {
    name: 'M&E Mix',
    recipient: 'Distributor',
    delivery_method: null,
    delivered_by: null,
    delivered_at: null,
    status: 'preparing',
    approval_status: 'pending',
    resolution: null,
    codec: null,
    audio: 'M&E',
    captions: null,
    aspect_ratio: null,
    platform: null,
    notes: 'Music and effects mix for dubbing.',
    bitrate: null,
    subtitles: null,
    graphics: null,
    language: null,
    audio_mix: 'M&E',
  },
  {
    name: 'Closed Captions (CC)',
    recipient: 'Netflix',
    delivery_method: null,
    delivered_by: null,
    delivered_at: null,
    status: 'not_started',
    approval_status: 'pending',
    resolution: null,
    codec: null,
    audio: null,
    captions: 'CC',
    aspect_ratio: null,
    platform: null,
    notes: 'Closed captions file, DFXP/STL.',
    bitrate: null,
    subtitles: 'CC',
    graphics: null,
    language: 'English',
    audio_mix: null,
  },
  {
    name: 'SDH Captions',
    recipient: 'Amazon Prime Video',
    delivery_method: null,
    delivered_by: null,
    delivered_at: null,
    status: 'not_started',
    approval_status: 'pending',
    resolution: null,
    codec: null,
    audio: null,
    captions: 'SDH',
    aspect_ratio: null,
    platform: null,
    notes: 'SDH captions for accessibility.',
    bitrate: null,
    subtitles: 'SDH',
    graphics: null,
    language: 'English',
    audio_mix: null,
  },
  {
    name: 'Timed Text Subtitle File',
    recipient: 'Distributor',
    delivery_method: null,
    delivered_by: null,
    delivered_at: null,
    status: 'not_started',
    approval_status: 'pending',
    resolution: null,
    codec: null,
    audio: null,
    captions: null,
    aspect_ratio: null,
    platform: null,
    notes: 'Timed text / SRT for localisation.',
    bitrate: null,
    subtitles: 'SRT',
    graphics: null,
    language: 'English',
    audio_mix: null,
  },
  {
    name: 'QC Report',
    recipient: null,
    delivery_method: 'Internal Transfer',
    delivered_by: 'Assistant Editor',
    delivered_at: null,
    status: 'delivered',
    approval_status: 'approved',
    resolution: null,
    codec: null,
    audio: null,
    captions: null,
    aspect_ratio: null,
    platform: null,
    notes: 'Final QC report, picture and sound.',
    bitrate: null,
    subtitles: null,
    graphics: null,
    language: null,
    audio_mix: null,
  },
  {
    name: 'Dialogue List',
    recipient: 'Distributor',
    delivery_method: null,
    delivered_by: null,
    delivered_at: null,
    status: 'preparing',
    approval_status: 'pending',
    resolution: null,
    codec: null,
    audio: null,
    captions: null,
    aspect_ratio: null,
    platform: null,
    notes: 'Dialogue list for subtitling and clearance.',
    bitrate: null,
    subtitles: null,
    graphics: null,
    language: 'English',
    audio_mix: null,
  },
  {
    name: 'As-Delivered Metadata',
    recipient: 'Netflix',
    delivery_method: null,
    delivered_by: null,
    delivered_at: null,
    status: 'ready',
    approval_status: 'pending',
    resolution: null,
    codec: null,
    audio: null,
    captions: null,
    aspect_ratio: null,
    platform: null,
    notes: 'As-delivered XML/metadata package.',
    bitrate: null,
    subtitles: null,
    graphics: null,
    language: null,
    audio_mix: null,
  },
  {
    name: 'Trailer Master',
    recipient: 'Marketing',
    delivery_method: 'S3 Upload',
    delivered_by: 'Post Producer',
    delivered_at: null,
    status: 'delivered',
    approval_status: 'rejected',
    resolution: '1920x1080',
    codec: 'H.264',
    audio: null,
    captions: null,
    aspect_ratio: '16:9',
    platform: null,
    notes: 'Trailer master for marketing; revision requested.',
    bitrate: '15 Mbps',
    subtitles: null,
    graphics: 'Full Graphics',
    language: 'English',
    audio_mix: 'Stereo',
  },
]

export type DemoDeliverableSeedIdSource = {
  deliverable: (n: number) => string
  technicalSpec: (n: number) => string
}

/**
 * Seed demo deliverables and technical_specs. Call after production and other demo data exist.
 * Due dates: startDate + 60 + i*7 days. Deterministic.
 */
export async function seedDemoDeliverables(
  pid: string,
  startDate: string,
  ts: string,
  addDaysLocal: (yyyyMmDd: string, days: number) => string,
  idSource: DemoDeliverableSeedIdSource = IDS
): Promise<void> {
  const db = await getDb()

  for (let i = 1; i <= DEMO_DELIVERABLES.length; i++) {
    const d = DEMO_DELIVERABLES[i - 1]!
    const dueDate = addDaysLocal(startDate, 60 + i * 7)
    await db.execute(
      `INSERT INTO deliverables (id, production_id, name, due_date, status, recipient, delivery_method, delivered_by, delivered_at, approval_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        idSource.deliverable(i),
        pid,
        d.name,
        dueDate,
        d.status,
        d.recipient,
        d.delivery_method,
        d.delivered_by,
        d.delivered_at,
        d.approval_status,
        ts,
        ts,
      ]
    )
  }

  for (let i = 1; i <= DEMO_DELIVERABLES.length; i++) {
    const d = DEMO_DELIVERABLES[i - 1]!
    await db.execute(
      `INSERT INTO technical_specs (id, deliverable_id, resolution, codec, audio, captions, aspect_ratio, platform, notes, bitrate, subtitles, graphics, language, audio_mix, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        idSource.technicalSpec(i),
        idSource.deliverable(i),
        d.resolution,
        d.codec,
        d.audio,
        d.captions,
        d.aspect_ratio,
        d.platform,
        d.notes,
        d.bitrate,
        d.subtitles,
        d.graphics,
        d.language,
        d.audio_mix,
        ts,
        ts,
      ]
    )
  }
}
