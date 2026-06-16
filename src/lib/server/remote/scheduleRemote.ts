import type { ServerPublishContext } from '@/lib/db/projectDataSource'
import { serverRuntimeGetOne, serverRuntimeList } from '@/lib/server/serverClient'
import type { Scene, ShootDay, Shot } from '@/lib/db/types'
import { normalizeSceneDayNight, normalizeSceneIntExt } from '@/lib/schedule/sceneFields'

function mapShootDay(r: Record<string, unknown>): ShootDay {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shooting_bloc_id: (r.shooting_bloc_id as string | null) ?? null,
    shoot_date: r.shoot_date as string,
    day_number: (r.day_number as number | null) ?? null,
    call_time: r.call_time as string | null,
    wrap_time: (r.wrap_time as string | null) ?? null,
    notes: r.notes as string | null,
    weather_manual: r.weather_manual as string | null,
    meal_times_json: (r.meal_times_json as string | null) ?? null,
    weather_json: (r.weather_json as string | null) ?? null,
    parking_base_address: (r.parking_base_address as string | null) ?? null,
    special_notes: (r.special_notes as string | null) ?? null,
    hospital_name: (r.hospital_name as string | null) ?? null,
    hospital_address: (r.hospital_address as string | null) ?? null,
    police_station_name: (r.police_station_name as string | null) ?? null,
    police_station_address: (r.police_station_address as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function mapScene(r: Record<string, unknown>): Scene {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    episode_id: (r.episode_id as string | null) ?? null,
    scene_number: r.scene_number as string,
    title: (r.title as string | null) ?? null,
    description: r.description as string | null,
    int_ext: normalizeSceneIntExt(r.int_ext),
    day_night: normalizeSceneDayNight(r.day_night),
    page_eighths: (r.page_eighths as number | null) ?? null,
    location_id: (r.location_id as string | null) ?? null,
    duration_minutes: (r.duration_minutes as number | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function mapShot(r: Record<string, unknown>): Shot {
  return {
    id: r.id as string,
    scene_id: r.scene_id as string,
    shot_number: r.shot_number as string,
    shot_description: (r.shot_description as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    shot_size: (r.shot_size as Shot['shot_size']) ?? null,
    support: (r.support as string | null) ?? null,
    lens: (r.lens as string | null) ?? null,
    duration_seconds: (r.duration_seconds as number | null) ?? null,
    estimated_shoot_minutes: (r.estimated_shoot_minutes as number | null) ?? null,
    camera_movement: (r.camera_movement as Shot['camera_movement']) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function remoteListShootDays(ctx: ServerPublishContext): Promise<ShootDay[]> {
  const rows = await serverRuntimeList<Record<string, unknown>>(
    ctx.baseUrl,
    ctx.token,
    ctx.remoteProjectId,
    'shoot_days',
  )
  return rows.map(mapShootDay)
}

export async function remoteGetShootDay(ctx: ServerPublishContext, id: string): Promise<ShootDay | null> {
  const row = await serverRuntimeGetOne(ctx.baseUrl, ctx.token, ctx.remoteProjectId, 'shoot_days', id)
  return row ? mapShootDay(row) : null
}

export async function remoteListScenes(ctx: ServerPublishContext): Promise<Scene[]> {
  const rows = await serverRuntimeList<Record<string, unknown>>(
    ctx.baseUrl,
    ctx.token,
    ctx.remoteProjectId,
    'scenes',
  )
  return rows.map(mapScene)
}

export async function remoteGetScene(ctx: ServerPublishContext, id: string): Promise<Scene | null> {
  const row = await serverRuntimeGetOne(ctx.baseUrl, ctx.token, ctx.remoteProjectId, 'scenes', id)
  return row ? mapScene(row) : null
}

export async function remoteListShotsByScene(ctx: ServerPublishContext, sceneId: string): Promise<Shot[]> {
  const rows = await serverRuntimeList<Record<string, unknown>>(
    ctx.baseUrl,
    ctx.token,
    ctx.remoteProjectId,
    'shots',
  )
  return rows.filter((r) => r.scene_id === sceneId).map(mapShot)
}

export async function remoteListShotsByProduction(ctx: ServerPublishContext): Promise<Shot[]> {
  const rows = await serverRuntimeList<Record<string, unknown>>(
    ctx.baseUrl,
    ctx.token,
    ctx.remoteProjectId,
    'shots',
  )
  return rows.map(mapShot)
}

export async function remoteGetShot(ctx: ServerPublishContext, id: string): Promise<Shot | null> {
  const row = await serverRuntimeGetOne(ctx.baseUrl, ctx.token, ctx.remoteProjectId, 'shots', id)
  return row ? mapShot(row) : null
}
