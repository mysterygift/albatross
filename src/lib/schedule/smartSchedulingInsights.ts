/**
 * Read-only scheduling hints for the Stripboard: explainable, heuristic groupings
 * from scheduled SHOT strips + shot/scene metadata (and optional shot_cast).
 */
import type { Scene, ShootDay, Shot, StripboardStrip } from '@/lib/db/types'

export type SmartSchedulingInsightKind =
  | 'support_split'
  | 'size_support_split'
  | 'day_night_support_split'
  | 'location_split'
  | 'cast_time_support_split'

/** What ties the grouped shots together (filmmaking-oriented labels). */
export type SharedSetupCharacteristics = {
  support?: string
  shotSize?: string
  dayNight?: 'DAY' | 'NIGHT'
  location?: string
  /** e.g. same shot_cast person set */
  castNote?: string
  /**
   * Setup / equipment-style insights are only emitted when shots share the same scene
   * or the same location; this records which scope produced the group.
   */
  groupScope?: 'scene' | 'location'
  /** Scene number (script order label) when {@link groupScope} is `scene`. */
  sceneNumber?: string
}

export type InsightShotRow = {
  stripId: string
  shotId: string
  sceneNumber: string
  shotNumber: string
  /** One-line description for lists */
  label: string
}

export type InsightDayGroup = {
  shootDayId: string
  dayLabel: string
  shots: InsightShotRow[]
}

export type SmartSchedulingInsight = {
  id: string
  kind: SmartSchedulingInsightKind
  /** Short line for collapsed UI */
  summary: string
  /**
   * Explicit, read-only scheduling idea (non-binding). Generated from kind + shared data.
   */
  suggestion?: string
  /**
   * Optional context that does not duplicate {@link suggestion} — e.g. wide-shot nuance at a location.
   */
  planningNote?: string
  distinctDayCount: number
  shared: SharedSetupCharacteristics
  /** Schedule spread: shots grouped by shoot day */
  byDay: InsightDayGroup[]
  shotIds: string[]
  stripIds: string[]
  shootDayIds: string[]
}

export type SmartSchedulingInsightsResult = {
  insights: SmartSchedulingInsight[]
  /** Fewer than two schedulable shot strips with resolved shot+scene. */
  state: 'empty_insufficient' | 'empty_no_patterns' | 'ready'
}

export type SmartSchedulingInsightsInput = {
  strips: StripboardStrip[]
  shots: Shot[]
  scenes: Scene[]
  shootDays: Pick<ShootDay, 'id' | 'shoot_date' | 'day_number'>[]
  /** location_id → display name */
  locationNameById: Map<string, string>
  /** shot_id → cast person ids (from shot_cast). */
  castPersonIdsByShotId: Map<string, string[]>
  /** Max items to return (default 5). */
  maxInsights?: number
}

const WIDE_SIZES = new Set<string>(['LS', 'FS', 'MFS'])

const MIN_SHOTS_SUPPORT = 3
const MIN_DAYS_SPLIT = 2
const MIN_SHOTS_SIZE_SUPPORT = 3
const MIN_SHOTS_LOCATION = 2
const MIN_SHOTS_CAST_GROUP = 2

type ShotCtx = {
  stripId: string
  shootDayId: string
  shotId: string
  sceneId: string
  sceneNumber: string
  supportNorm: string | null
  shotSize: string | null
  dayNight: Scene['day_night']
  locationId: string | null
  locationLabel: string | null
  /** Sorted person ids joined, or null when no shot_cast rows. */
  castKey: string | null
}

type ScoredInsight = {
  salience: number
  insight: SmartSchedulingInsight
}

function distinctDayCount(rows: { shootDayId: string }[]): number {
  return new Set(rows.map((r) => r.shootDayId)).size
}

function normalizeSupport(s: string | null): string | null {
  if (s == null) return null
  const t = s.trim()
  return t.length > 0 ? t : null
}

function formatShootDayCaption(day: Pick<ShootDay, 'shoot_date' | 'day_number'>): string {
  if (day.day_number != null) {
    return `Day ${day.day_number} · ${day.shoot_date}`
  }
  return day.shoot_date
}

function shotPrimaryLabel(shot: Shot): string {
  const a = shot.shot_description?.trim()
  if (a) return a
  const b = shot.subject?.trim()
  if (b) return b
  return 'No description'
}

function buildShotRow(c: ShotCtx, shot: Shot, scene: Scene): InsightShotRow {
  return {
    stripId: c.stripId,
    shotId: c.shotId,
    sceneNumber: scene.scene_number,
    shotNumber: shot.shot_number,
    label: shotPrimaryLabel(shot),
  }
}

function compareShotRows(a: InsightShotRow, b: InsightShotRow): number {
  const sc = a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true })
  if (sc !== 0) return sc
  return a.shotNumber.localeCompare(b.shotNumber, undefined, { numeric: true })
}

/** Dedupe when the same strips qualify under both scene- and location-scoped buckets. */
function stripSetSignature(ctxs: ShotCtx[]): string {
  return [...new Set(ctxs.map((c) => c.stripId))].sort().join('\x1e')
}

function addToNestedBucket(
  root: Map<string, Map<string, ShotCtx[]>>,
  outerKey: string,
  innerKey: string,
  ctx: ShotCtx
): void {
  if (!root.has(outerKey)) root.set(outerKey, new Map())
  const inner = root.get(outerKey)!
  const list = inner.get(innerKey) ?? []
  list.push(ctx)
  inner.set(innerKey, list)
}

function buildDayGroups(
  contexts: ShotCtx[],
  shootDays: Pick<ShootDay, 'id' | 'shoot_date' | 'day_number'>[],
  shotById: Map<string, Shot>,
  sceneById: Map<string, Scene>
): InsightDayGroup[] {
  const shootDayById = new Map(shootDays.map((d) => [d.id, d]))
  const byDayId = new Map<string, ShotCtx[]>()
  for (const c of contexts) {
    const list = byDayId.get(c.shootDayId) ?? []
    list.push(c)
    byDayId.set(c.shootDayId, list)
  }

  const dayIds = [...byDayId.keys()].sort((a, b) => {
    const da = shootDayById.get(a)
    const db = shootDayById.get(b)
    const dateA = da?.shoot_date ?? ''
    const dateB = db?.shoot_date ?? ''
    const dateCmp = dateA.localeCompare(dateB)
    if (dateCmp !== 0) return dateCmp
    const numA = da?.day_number ?? 0
    const numB = db?.day_number ?? 0
    return numA - numB
  })

  const groups: InsightDayGroup[] = []
  for (const dayId of dayIds) {
    const day = shootDayById.get(dayId)
    const dayLabel = day ? formatShootDayCaption(day) : dayId
    const ctxList = byDayId.get(dayId) ?? []
    const rows: InsightShotRow[] = []
    for (const c of ctxList) {
      const shot = shotById.get(c.shotId)
      const scene = shot ? sceneById.get(shot.scene_id) : undefined
      if (!shot || !scene) continue
      rows.push(buildShotRow(c, shot, scene))
    }
    rows.sort(compareShotRows)
    groups.push({ shootDayId: dayId, dayLabel, shots: rows })
  }
  return groups
}

function schedulingSuggestionForInsight(
  kind: SmartSchedulingInsightKind,
  shared: SharedSetupCharacteristics
): string | undefined {
  switch (kind) {
    case 'support_split': {
      if (!shared.support) return undefined
      if (shared.groupScope === 'scene' && shared.sceneNumber) {
        return `Consider grouping these “${shared.support}” shots from scene ${shared.sceneNumber} into the same shoot block or back-to-back blocks if cast and day constraints allow.`
      }
      if (shared.groupScope === 'location' && shared.location) {
        return `Consider grouping these “${shared.support}” shots at “${shared.location}” into the same shoot block or back-to-back blocks if cast and day constraints allow.`
      }
      return undefined
    }
    case 'size_support_split': {
      if (!shared.shotSize || !shared.support) return undefined
      if (shared.groupScope === 'scene' && shared.sceneNumber) {
        return `Consider blocking these ${shared.shotSize} shots from scene ${shared.sceneNumber} (${shared.support} support) together so lens, head height, and support stay aligned with fewer resets.`
      }
      if (shared.groupScope === 'location' && shared.location) {
        return `Consider blocking these ${shared.shotSize} shots at “${shared.location}” (${shared.support} support) together so lens, head height, and support stay aligned with fewer resets.`
      }
      return undefined
    }
    case 'day_night_support_split': {
      if (!shared.dayNight || !shared.support) return undefined
      const dnWord = shared.dayNight === 'NIGHT' ? 'night' : 'day'
      if (shared.groupScope === 'scene' && shared.sceneNumber) {
        return `These ${shared.dayNight} shots in scene ${shared.sceneNumber} share “${shared.support}” support across multiple days; consider scheduling them closer together if ${dnWord} lighting and rigging can line up with cast.`
      }
      if (shared.groupScope === 'location' && shared.location) {
        return `These ${shared.dayNight} shots at “${shared.location}” share “${shared.support}” support across multiple days; consider scheduling them closer together if ${dnWord} lighting and rigging can line up with cast.`
      }
      return undefined
    }
    case 'location_split':
      if (!shared.location) return undefined
      return `Coverage at “${shared.location}” is split across several shoot days; consider consolidating those days if company moves, holds, and cast timing make that practical.`
    case 'cast_time_support_split': {
      if (!shared.dayNight || !shared.support) return undefined
      if (shared.groupScope === 'scene' && shared.sceneNumber) {
        return `These ${shared.dayNight} shots in scene ${shared.sceneNumber} match on shot-level cast and “${shared.support}” support; consider whether they belong in the same scheduling block to trim turnaround.`
      }
      if (shared.groupScope === 'location' && shared.location) {
        return `These ${shared.dayNight} shots at “${shared.location}” match on shot-level cast and “${shared.support}” support; consider whether they belong in the same scheduling block to trim turnaround.`
      }
      return undefined
    }
  }
}

function insightFromContexts(
  id: string,
  kind: SmartSchedulingInsightKind,
  summary: string,
  planningNote: string | undefined,
  shared: SharedSetupCharacteristics,
  contexts: ShotCtx[],
  input: SmartSchedulingInsightsInput,
  shotById: Map<string, Shot>,
  sceneById: Map<string, Scene>,
  salience: number
): ScoredInsight {
  const distinctDays = distinctDayCount(contexts)
  const byDay = buildDayGroups(contexts, input.shootDays, shotById, sceneById)
  const shotIds = [...new Set(contexts.map((c) => c.shotId))]
  const stripIds = [...new Set(contexts.map((c) => c.stripId))]
  const shootDayIds = [...new Set(contexts.map((c) => c.shootDayId))]
  const suggestion = schedulingSuggestionForInsight(kind, shared)

  return {
    salience,
    insight: {
      id,
      kind,
      summary,
      suggestion,
      planningNote,
      distinctDayCount: distinctDays,
      shared,
      byDay,
      shotIds,
      stripIds,
      shootDayIds,
    },
  }
}

function buildShotContexts(input: SmartSchedulingInsightsInput): ShotCtx[] {
  const shotById = new Map(input.shots.map((s) => [s.id, s]))
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const out: ShotCtx[] = []

  for (const strip of input.strips) {
    if (strip.strip_type !== 'SHOT' || !strip.shot_id || !strip.shoot_day_id) continue
    const shot = shotById.get(strip.shot_id)
    if (!shot) continue
    const scene = sceneById.get(shot.scene_id)
    if (!scene) continue

    const locId = scene.location_id
    const locationLabel =
      locId != null ? (input.locationNameById.get(locId) ?? null) : null

    const castList = input.castPersonIdsByShotId.get(strip.shot_id) ?? []
    const castKey = castList.length > 0 ? [...castList].sort().join('|') : null

    out.push({
      stripId: strip.id,
      shootDayId: strip.shoot_day_id,
      shotId: strip.shot_id,
      sceneId: shot.scene_id,
      sceneNumber: scene.scene_number,
      supportNorm: normalizeSupport(shot.support),
      shotSize: shot.shot_size,
      dayNight: scene.day_night,
      locationId: locId,
      locationLabel,
      castKey,
    })
  }
  return out
}

function pushSupportSplit(ctxs: ShotCtx[], input: SmartSchedulingInsightsInput, out: ScoredInsight[]) {
  const shotById = new Map(input.shots.map((s) => [s.id, s]))
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const byScene = new Map<string, Map<string, ShotCtx[]>>()
  const byLocation = new Map<string, Map<string, ShotCtx[]>>()
  for (const c of ctxs) {
    if (!c.supportNorm) continue
    addToNestedBucket(byScene, c.sceneId, c.supportNorm, c)
    if (c.locationId) {
      addToNestedBucket(byLocation, c.locationId, c.supportNorm, c)
    }
  }

  const seenStripSets = new Set<string>()
  const planningNote =
    'Leaving the same support package built between similar shots often saves teardown and rebuild time.'

  for (const [sceneId, supportMap] of byScene) {
    const scene = sceneById.get(sceneId)
    const sceneNum = scene?.scene_number ?? sceneId
    for (const [support, list] of supportMap) {
      const days = distinctDayCount(list)
      if (list.length < MIN_SHOTS_SUPPORT || days < MIN_DAYS_SPLIT) continue
      const sig = stripSetSignature(list)
      if (seenStripSets.has(sig)) continue
      seenStripSets.add(sig)
      const summary = `Scene ${sceneNum}: ${list.length} shots using “${support}” support are spread across ${days} shoot days.`
      out.push(
        insightFromContexts(
          `support:scene:${sceneId}:${encodeURIComponent(support)}`,
          'support_split',
          summary,
          planningNote,
          { support, groupScope: 'scene', sceneNumber: sceneNum },
          list,
          input,
          shotById,
          sceneById,
          list.length * days
        )
      )
    }
  }

  for (const [locId, supportMap] of byLocation) {
    for (const [support, list] of supportMap) {
      const locLabel = list[0]?.locationLabel ?? input.locationNameById.get(locId) ?? locId
      const days = distinctDayCount(list)
      if (list.length < MIN_SHOTS_SUPPORT || days < MIN_DAYS_SPLIT) continue
      const sig = stripSetSignature(list)
      if (seenStripSets.has(sig)) continue
      seenStripSets.add(sig)
      const summary = `“${locLabel}”: ${list.length} shots using “${support}” support are spread across ${days} shoot days.`
      out.push(
        insightFromContexts(
          `support:loc:${locId}:${encodeURIComponent(support)}`,
          'support_split',
          summary,
          planningNote,
          { support, groupScope: 'location', location: locLabel },
          list,
          input,
          shotById,
          sceneById,
          list.length * days
        )
      )
    }
  }
}

function pushShotSizeSupportSplit(ctxs: ShotCtx[], input: SmartSchedulingInsightsInput, out: ScoredInsight[]) {
  const shotById = new Map(input.shots.map((s) => [s.id, s]))
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const byScene = new Map<string, Map<string, ShotCtx[]>>()
  const byLocation = new Map<string, Map<string, ShotCtx[]>>()
  for (const c of ctxs) {
    if (!c.supportNorm || !c.shotSize) continue
    const key = JSON.stringify([c.shotSize, c.supportNorm])
    addToNestedBucket(byScene, c.sceneId, key, c)
    if (c.locationId) {
      addToNestedBucket(byLocation, c.locationId, key, c)
    }
  }

  const seenStripSets = new Set<string>()

  for (const [sceneId, inner] of byScene) {
    const scene = sceneById.get(sceneId)
    const sceneNum = scene?.scene_number ?? sceneId
    for (const [key, list] of inner) {
      const days = distinctDayCount(list)
      if (list.length < MIN_SHOTS_SIZE_SUPPORT || days < MIN_DAYS_SPLIT) continue
      const sig = stripSetSignature(list)
      if (seenStripSets.has(sig)) continue
      seenStripSets.add(sig)
      const [size, support] = JSON.parse(key) as [string, string]
      const summary = `Scene ${sceneNum}: ${list.length} ${size} shots (${support} support) sit on ${days} different shoot days.`
      out.push(
        insightFromContexts(
          `size-support:scene:${sceneId}:${encodeURIComponent(key)}`,
          'size_support_split',
          summary,
          undefined,
          { shotSize: size, support, groupScope: 'scene', sceneNumber: sceneNum },
          list,
          input,
          shotById,
          sceneById,
          list.length * days + 2
        )
      )
    }
  }

  for (const [locId, inner] of byLocation) {
    for (const [key, list] of inner) {
      const days = distinctDayCount(list)
      if (list.length < MIN_SHOTS_SIZE_SUPPORT || days < MIN_DAYS_SPLIT) continue
      const sig = stripSetSignature(list)
      if (seenStripSets.has(sig)) continue
      seenStripSets.add(sig)
      const [size, support] = JSON.parse(key) as [string, string]
      const locLabel = list[0]?.locationLabel ?? input.locationNameById.get(locId) ?? locId
      const summary = `“${locLabel}”: ${list.length} ${size} shots (${support} support) sit on ${days} different shoot days.`
      out.push(
        insightFromContexts(
          `size-support:loc:${locId}:${encodeURIComponent(key)}`,
          'size_support_split',
          summary,
          undefined,
          { shotSize: size, support, groupScope: 'location', location: locLabel },
          list,
          input,
          shotById,
          sceneById,
          list.length * days + 2
        )
      )
    }
  }
}

function pushDayNightSupportSplit(ctxs: ShotCtx[], input: SmartSchedulingInsightsInput, out: ScoredInsight[]) {
  const shotById = new Map(input.shots.map((s) => [s.id, s]))
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const byScene = new Map<string, Map<string, ShotCtx[]>>()
  const byLocation = new Map<string, Map<string, ShotCtx[]>>()
  for (const c of ctxs) {
    if (!c.supportNorm) continue
    if (c.dayNight !== 'DAY' && c.dayNight !== 'NIGHT') continue
    const key = JSON.stringify([c.dayNight, c.supportNorm])
    addToNestedBucket(byScene, c.sceneId, key, c)
    if (c.locationId) {
      addToNestedBucket(byLocation, c.locationId, key, c)
    }
  }

  const seenStripSets = new Set<string>()
  const planningNote = 'Batching by scene time-of-day can simplify lighting direction and rigging plans.'

  for (const [sceneId, inner] of byScene) {
    const scene = sceneById.get(sceneId)
    const sceneNum = scene?.scene_number ?? sceneId
    for (const [key, list] of inner) {
      const days = distinctDayCount(list)
      if (list.length < MIN_SHOTS_SUPPORT || days < MIN_DAYS_SPLIT) continue
      const sig = stripSetSignature(list)
      if (seenStripSets.has(sig)) continue
      seenStripSets.add(sig)
      const [dn, support] = JSON.parse(key) as [string, string]
      const summary = `Scene ${sceneNum}: ${list.length} ${dn} shots using “${support}” support are spread across ${days} shoot days.`
      out.push(
        insightFromContexts(
          `dn-support:scene:${sceneId}:${encodeURIComponent(key)}`,
          'day_night_support_split',
          summary,
          planningNote,
          { dayNight: dn as 'DAY' | 'NIGHT', support, groupScope: 'scene', sceneNumber: sceneNum },
          list,
          input,
          shotById,
          sceneById,
          list.length * days + 1
        )
      )
    }
  }

  for (const [locId, inner] of byLocation) {
    for (const [key, list] of inner) {
      const days = distinctDayCount(list)
      if (list.length < MIN_SHOTS_SUPPORT || days < MIN_DAYS_SPLIT) continue
      const sig = stripSetSignature(list)
      if (seenStripSets.has(sig)) continue
      seenStripSets.add(sig)
      const [dn, support] = JSON.parse(key) as [string, string]
      const locLabel = list[0]?.locationLabel ?? input.locationNameById.get(locId) ?? locId
      const summary = `“${locLabel}”: ${list.length} ${dn} shots using “${support}” support are spread across ${days} shoot days.`
      out.push(
        insightFromContexts(
          `dn-support:loc:${locId}:${encodeURIComponent(key)}`,
          'day_night_support_split',
          summary,
          planningNote,
          { dayNight: dn as 'DAY' | 'NIGHT', support, groupScope: 'location', location: locLabel },
          list,
          input,
          shotById,
          sceneById,
          list.length * days + 1
        )
      )
    }
  }
}

function pushLocationSplit(ctxs: ShotCtx[], input: SmartSchedulingInsightsInput, out: ScoredInsight[]) {
  const shotById = new Map(input.shots.map((s) => [s.id, s]))
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const byLoc = new Map<string, ShotCtx[]>()
  for (const c of ctxs) {
    if (!c.locationId || !c.locationLabel) continue
    const list = byLoc.get(c.locationId) ?? []
    list.push(c)
    byLoc.set(c.locationId, list)
  }
  for (const [locId, list] of byLoc) {
    const days = distinctDayCount(list)
    if (list.length < MIN_SHOTS_LOCATION || days < MIN_DAYS_SPLIT) continue
    const label = list[0]!.locationLabel!
    const wide = list.filter((c) => c.shotSize && WIDE_SIZES.has(c.shotSize))
    const summary = `${list.length} shots at “${label}” are scheduled across ${days} shoot days.`
    const planningNote =
      wide.length > 0
        ? 'Several listed shots are wider (LS / FS / MFS); consolidating may need extra stage space or a broader lighting plan.'
        : undefined
    out.push(
      insightFromContexts(
        `location:${locId}`,
        'location_split',
        summary,
        planningNote,
        { location: label },
        list,
        input,
        shotById,
        sceneById,
        list.length * days
      )
    )
  }
}

function pushCastTimeSupportSplit(ctxs: ShotCtx[], input: SmartSchedulingInsightsInput, out: ScoredInsight[]) {
  const shotById = new Map(input.shots.map((s) => [s.id, s]))
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const byScene = new Map<string, Map<string, ShotCtx[]>>()
  const byLocation = new Map<string, Map<string, ShotCtx[]>>()
  for (const c of ctxs) {
    if (!c.supportNorm || !c.castKey) continue
    if (c.dayNight !== 'DAY' && c.dayNight !== 'NIGHT') continue
    const key = JSON.stringify([c.dayNight, c.supportNorm, c.castKey])
    addToNestedBucket(byScene, c.sceneId, key, c)
    if (c.locationId) {
      addToNestedBucket(byLocation, c.locationId, key, c)
    }
  }

  const seenStripSets = new Set<string>()

  for (const [sceneId, inner] of byScene) {
    const scene = sceneById.get(sceneId)
    const sceneNum = scene?.scene_number ?? sceneId
    for (const [key, list] of inner) {
      const days = distinctDayCount(list)
      if (list.length < MIN_SHOTS_CAST_GROUP || days < MIN_DAYS_SPLIT) continue
      const sig = stripSetSignature(list)
      if (seenStripSets.has(sig)) continue
      seenStripSets.add(sig)
      const parsed = JSON.parse(key) as [string, string, string]
      const dn = parsed[0]! as 'DAY' | 'NIGHT'
      const support = parsed[1]!
      const summary = `Scene ${sceneNum}: ${list.length} ${dn} shots share “${support}” support and the same shot-level cast, spread across ${days} shoot days.`
      out.push(
        insightFromContexts(
          `cast-dn-support:scene:${sceneId}:${encodeURIComponent(key)}`,
          'cast_time_support_split',
          summary,
          undefined,
          {
            dayNight: dn,
            support,
            castNote: 'Same shot-level cast on each shot',
            groupScope: 'scene',
            sceneNumber: sceneNum,
          },
          list,
          input,
          shotById,
          sceneById,
          list.length * days + 4
        )
      )
    }
  }

  for (const [locId, inner] of byLocation) {
    for (const [key, list] of inner) {
      const days = distinctDayCount(list)
      if (list.length < MIN_SHOTS_CAST_GROUP || days < MIN_DAYS_SPLIT) continue
      const sig = stripSetSignature(list)
      if (seenStripSets.has(sig)) continue
      seenStripSets.add(sig)
      const parsed = JSON.parse(key) as [string, string, string]
      const dn = parsed[0]! as 'DAY' | 'NIGHT'
      const support = parsed[1]!
      const locLabel = list[0]?.locationLabel ?? input.locationNameById.get(locId) ?? locId
      const summary = `“${locLabel}”: ${list.length} ${dn} shots share “${support}” support and the same shot-level cast, spread across ${days} shoot days.`
      out.push(
        insightFromContexts(
          `cast-dn-support:loc:${locId}:${encodeURIComponent(key)}`,
          'cast_time_support_split',
          summary,
          undefined,
          {
            dayNight: dn,
            support,
            castNote: 'Same shot-level cast on each shot',
            groupScope: 'location',
            location: locLabel,
          },
          list,
          input,
          shotById,
          sceneById,
          list.length * days + 4
        )
      )
    }
  }
}

/**
 * Derive a small set of cross-day setup insights for the active production’s scheduled shot strips.
 * Uses only in-memory data; no I/O.
 */
export function computeSmartSchedulingInsights(
  input: SmartSchedulingInsightsInput
): SmartSchedulingInsightsResult {
  const max = input.maxInsights ?? 5
  const ctxs = buildShotContexts(input)

  if (ctxs.length < 2) {
    return { insights: [], state: 'empty_insufficient' }
  }

  const scored: ScoredInsight[] = []
  pushSupportSplit(ctxs, input, scored)
  pushShotSizeSupportSplit(ctxs, input, scored)
  pushDayNightSupportSplit(ctxs, input, scored)
  pushLocationSplit(ctxs, input, scored)
  pushCastTimeSupportSplit(ctxs, input, scored)

  if (scored.length === 0) {
    return { insights: [], state: 'empty_no_patterns' }
  }

  scored.sort((a, b) => {
    if (b.salience !== a.salience) return b.salience - a.salience
    return a.insight.id.localeCompare(b.insight.id)
  })

  const insights = scored.slice(0, max).map((s) => s.insight)

  return { insights, state: 'ready' }
}
