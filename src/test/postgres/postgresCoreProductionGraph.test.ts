import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'

import { setDbAdapterForTests } from '@/lib/db/client'
import {
  archiveProduction,
  createProduction,
  duplicateProduction,
  getProductionById,
  updateProduction,
} from '@/lib/db/repositories/production'
import { ensureSettingsDefaults, getSetting, setSetting } from '@/lib/db/repositories/settings'
import {
  createPerson,
  listCast,
  listCrew,
} from '@/lib/db/repositories/person'
import {
  createBooking,
  listBookingsByProduction,
} from '@/lib/db/repositories/booking'
import {
  createAvailability,
  deleteAvailability,
  listAvailabilityByPerson,
  listAvailabilityByProduction,
  updateAvailability,
} from '@/lib/db/repositories/cast-availability'
import {
  createCrewAvailability,
  deleteCrewAvailability,
  listCrewAvailabilityByPerson,
  listCrewAvailabilityByProduction,
  updateCrewAvailability,
} from '@/lib/db/repositories/crew-availability'
import {
  getCrewHierarchyConfigByProduction,
  resetCrewHierarchyConfigToDefault,
} from '@/lib/db/repositories/crewHierarchyConfig'
import {
  createLocation,
  listLocationsByProduction,
  updateLocation,
} from '@/lib/db/repositories/location'
import {
  linkLocationScene,
  listSceneIdsByLocation,
} from '@/lib/db/repositories/location-scene'
import {
  createScene,
  createShootDayWithDefaultMainUnit,
  createShot,
  getShootDayById,
  listScenesByProduction,
  listShotsByProduction,
  updateScene,
} from '@/lib/db/repositories/schedule'
import {
  createStrip,
  listStripsByShootDay,
  moveStrip,
} from '@/lib/db/repositories/stripboard-strips'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import { setShootDayUnitLocked, getShootDayUnitById } from '@/lib/db/repositories/shoot-day-units'
import {
  createEpisode,
  listEpisodesByProduction,
  reorderActiveEpisodes,
} from '@/lib/db/repositories/episodes'
import {
  createShootingBloc,
  updateShootingBloc,
} from '@/lib/db/repositories/shootingBlocs'
import { createPostgresRepoHarness } from '@/test/postgres/postgresRepositoryHarness'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => undefined),
  writeTextFile: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}))

describe('postgres core production graph validation', () => {
  let connectionError: string | null = null

  beforeAll(async () => {
    const client = new Client(await resolvePostgresTestConfig())
    try {
      await client.connect()
    } catch (error) {
      connectionError = error instanceof Error ? error.message : String(error)
    } finally {
      await client.end().catch(() => undefined)
    }
  })

  afterEach(() => {
    setDbAdapterForTests(null)
  })

  it('validates productions create/update/archive/duplicate and timestamps', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL core graph assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_core_productions')
    setDbAdapterForTests(harness.adapter)
    try {
      const created = await createProduction(
        { name: 'Core Graph Prod', notes: '' },
        { skipBudgetSeed: true, episodicInitialEpisodeName: 'Episode 1' }
      )
      expect(created.is_episodic).toBe(true)
      expect(typeof created.created_at).toBe('string')
      expect(typeof created.updated_at).toBe('string')
      expect(created.notes).toBe('')

      const updated = await updateProduction(created.id, { name: 'Core Graph Prod Updated', notes: null })
      expect(updated.name).toBe('Core Graph Prod Updated')
      expect(updated.notes).toBeNull()

      await archiveProduction(created.id)
      const archived = await getProductionById(created.id)
      expect(archived?.archived_at).not.toBeNull()

      const duplicate = await duplicateProduction(created.id, 'Core Graph Duplicate')
      expect(duplicate.id).not.toBe(created.id)
      const duplicatedRow = await getProductionById(duplicate.id)
      expect(duplicatedRow?.name).toBe('Core Graph Duplicate')
      expect(duplicatedRow?.is_episodic).toBe(true)
    } finally {
      await harness.close()
    }
  })

  it('validates settings default insertion and updates', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL core graph assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_core_settings')
    setDbAdapterForTests(harness.adapter)
    try {
      await setSetting('display_currency', 'USD')
      await ensureSettingsDefaults()
      expect(await getSetting('display_currency')).toBe('USD')
      expect(await getSetting('enable_currency_conversion_api')).toBe('true')
      await setSetting('display_currency', 'EUR')
      expect(await getSetting('display_currency')).toBe('EUR')
    } finally {
      await harness.close()
    }
  })

  it('validates people cast/crew/bookings/availability/hierarchy behaviors', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL core graph assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_core_people')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'People Prod', notes: null }, { skipBudgetSeed: true })
      const cast = await createPerson({ production_id: production.id, name: 'Cast A', is_cast: 1 })
      const crew = await createPerson({ production_id: production.id, name: 'Crew A', is_cast: 0, department: 'Camera' })

      const castRows = await listCast(production.id)
      const crewRows = await listCrew(production.id)
      expect(castRows.map((p) => p.id)).toContain(cast.id)
      expect(crewRows.map((p) => p.id)).toContain(crew.id)

      const booking = await createBooking({
        production_id: production.id,
        person_id: cast.id,
        start_date: '2026-02-01',
        end_date: '2026-02-03',
      })
      const bookings = await listBookingsByProduction(production.id)
      expect(bookings.map((b) => b.id)).toContain(booking.id)
      expect(bookings[0]?.start_date).toBe('2026-02-01')

      await createAvailability({
        production_id: production.id,
        person_id: cast.id,
        start_date: '2026-02-04',
        end_date: '2026-02-05',
        availability: 'UNAVAILABLE',
      })
      const availability = await listAvailabilityByPerson(cast.id)
      expect(availability).toHaveLength(1)
      expect(availability[0]?.availability).toBe('UNAVAILABLE')

      const updatedCastAvailability = await updateAvailability(availability[0]!.id, {
        end_date: '2026-02-06',
        notes: 'Holiday',
      })
      expect(updatedCastAvailability.end_date).toBe('2026-02-06')
      expect(updatedCastAvailability.notes).toBe('Holiday')

      const productionAvailability = await listAvailabilityByProduction(production.id)
      expect(productionAvailability.some((a) => a.person_id === cast.id)).toBe(true)

      await deleteAvailability(availability[0]!.id)
      expect(await listAvailabilityByPerson(cast.id)).toHaveLength(0)

      const crewAvailability = await createCrewAvailability({
        production_id: production.id,
        person_id: crew.id,
        start_date: '2026-03-01',
        end_date: '2026-03-03',
        availability: 'UNAVAILABLE',
        notes: 'Away',
      })
      expect(crewAvailability.person_id).toBe(crew.id)

      const crewWindows = await listCrewAvailabilityByPerson(crew.id)
      expect(crewWindows).toHaveLength(1)

      const updatedCrewAvailability = await updateCrewAvailability(crewAvailability.id, {
        end_date: '2026-03-05',
      })
      expect(updatedCrewAvailability.end_date).toBe('2026-03-05')

      const productionCrewAvailability = await listCrewAvailabilityByProduction(production.id)
      expect(productionCrewAvailability.some((a) => a.person_id === crew.id)).toBe(true)

      await deleteCrewAvailability(crewAvailability.id)
      expect(await listCrewAvailabilityByPerson(crew.id)).toHaveLength(0)

      await resetCrewHierarchyConfigToDefault(production.id)
      const hierarchy = await getCrewHierarchyConfigByProduction(production.id)
      expect(hierarchy).not.toBeNull()
      expect(hierarchy?.departments.length).toBeGreaterThan(0)
    } finally {
      await harness.close()
    }
  })

  it('validates locations CRUD and scene assignment', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL core graph assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_core_locations')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Location Prod', notes: null }, { skipBudgetSeed: true })
      const location = await createLocation({
        production_id: production.id,
        name: 'Pier 12',
        booked_status: 'hold',
        address: null,
      })
      const updated = await updateLocation(location.id, { address: 'Pier 12, Harbor Road', permit_fee: null })
      expect(updated.address).toContain('Harbor')
      expect(updated.permit_fee).toBeNull()

      const scene = await createScene({ production_id: production.id, scene_number: '10' })
      await linkLocationScene(location.id, scene.id)
      const sceneIds = await listSceneIdsByLocation(location.id)
      expect(sceneIds).toContain(scene.id)

      const allLocations = await listLocationsByProduction(production.id)
      expect(allLocations.map((l) => l.id)).toContain(location.id)
    } finally {
      await harness.close()
    }
  })

  it('validates scenes/shots ordering, relationships, and shot cast', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL core graph assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_core_scenes_shots')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction(
        { name: 'Scene Prod', notes: null },
        { skipBudgetSeed: true, episodicInitialEpisodeName: 'Episode A' }
      )
      const episode = (await listEpisodesByProduction(production.id))[0]!
      const cast = await createPerson({ production_id: production.id, name: 'Actor 1', is_cast: 1 })
      const scene = await createScene({
        production_id: production.id,
        scene_number: '12',
        heading: 'INT. CAFE - DAY',
        episode_id: episode.id,
      })
      const shot = await createShot({
        scene_id: scene.id,
        shot_number: '1',
        estimated_shoot_minutes: 15,
        person_ids: [cast.id],
      })

      const scenes = await listScenesByProduction(production.id)
      const shots = await listShotsByProduction(production.id)
      expect(scenes.map((s) => s.id)).toContain(scene.id)
      expect(shots.map((s) => s.id)).toContain(shot.shot.id)
      expect(shot.shotCast).toHaveLength(1)
      expect(shot.shotCast[0]?.person_id).toBe(cast.id)

      const updatedScene = await updateScene(scene.id, { location_id: null })
      expect(updatedScene.location_id).toBeNull()
    } finally {
      await harness.close()
    }
  })

  it('validates schedule shoot days, units, strips, ordering, and calendar queries', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL core graph assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_core_schedule')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Schedule Prod', notes: null }, { skipBudgetSeed: true })
      const sceneA = await createScene({ production_id: production.id, scene_number: '1' })
      const sceneB = await createScene({ production_id: production.id, scene_number: '2' })
      const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
        productionId: production.id,
        shootDate: '2026-03-01',
        callTime: '08:00',
        wrapTime: '18:00',
      })

      const stripA = await createStrip({
        production_id: production.id,
        shoot_day_id: shootDay.id,
        shoot_day_unit_id: shootDayUnitId,
        strip_type: 'SCENE',
        scene_id: sceneA.id,
      })
      const stripB = await createStrip({
        production_id: production.id,
        shoot_day_id: shootDay.id,
        shoot_day_unit_id: shootDayUnitId,
        strip_type: 'SCENE',
        scene_id: sceneB.id,
      })
      const moved = await moveStrip(stripB.id, shootDay.id, shootDayUnitId, stripA.sort_index - 10)
      expect(moved.sort_index).toBe(stripA.sort_index - 10)

      await setShootDayUnitLocked(shootDayUnitId, true)
      const unit = await getShootDayUnitById(shootDayUnitId)
      expect(unit?.is_locked).toBe(1)

      const strips = await listStripsByShootDay(shootDay.id)
      expect(strips.length).toBeGreaterThanOrEqual(4)

      const events = await listCalendarShootDayEvents(production.id, {
        start: '2026-03-01',
        end: '2026-03-05',
      })
      expect(events.length).toBeGreaterThan(0)
      expect(events[0]?.date).toBe('2026-03-01')

      const day = await getShootDayById(shootDay.id)
      expect(day?.shoot_date).toBe('2026-03-01')
    } finally {
      await harness.close()
    }
  })

  it('validates episodic episode ordering, bloc constraints, scene assignment, and bloc date updates', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL core graph assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_core_episodic')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction(
        { name: 'Episodic Prod', notes: null },
        { skipBudgetSeed: true, episodicInitialEpisodeName: 'Ep 1' }
      )
      const ep1 = (await listEpisodesByProduction(production.id))[0]!
      const ep2 = await createEpisode({ production_id: production.id, name: 'Ep 2', sort_order: 1 })
      await reorderActiveEpisodes(production.id, [ep2.id, ep1.id])
      const reordered = await listEpisodesByProduction(production.id)
      expect(reordered[0]?.id).toBe(ep2.id)

      const scene = await createScene({
        production_id: production.id,
        scene_number: '101',
        episode_id: ep2.id,
      })
      expect(scene.episode_id).toBe(ep2.id)

      const bloc = await createShootingBloc({
        production_id: production.id,
        name: 'Bloc 1',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
      })
      await expect(
        createShootingBloc({
          production_id: production.id,
          name: 'Bloc overlap',
          start_date: '2026-04-03',
          end_date: '2026-04-06',
        })
      ).rejects.toThrow(/overlaps/)

      const day = await createShootDayWithDefaultMainUnit({
        productionId: production.id,
        shootDate: '2026-04-02',
      })
      expect(day.shootDay.shooting_bloc_id).toBe(bloc.id)

      await updateShootingBloc(bloc.id, {
        start_date: '2026-04-03',
        end_date: '2026-04-07',
      })
      const shifted = await getShootDayById(day.shootDay.id)
      expect(shifted?.shoot_date).toBe('2026-04-04')
      expect(shifted?.shooting_bloc_id).toBe(bloc.id)
    } finally {
      await harness.close()
    }
  })
})
