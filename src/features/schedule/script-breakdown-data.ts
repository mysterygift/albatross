import { useMemo } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { listEquipmentByProduction } from '@/lib/db/repositories/equipment'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listClearancesByProduction, listMusicTracksByProduction } from '@/lib/db/repositories/music-clearance'
import { listCast } from '@/lib/db/repositories/person'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { listScenesByProduction } from '@/lib/db/repositories/schedule'
import { listBreakdownElements, listBreakdownTagsByScriptVersion } from '@/lib/db/repositories/scriptBreakdown'
import { listScriptPagesByScriptVersion } from '@/lib/db/repositories/scriptPages'
import { buildSceneLayouts, type SceneLayout } from '@/lib/db/scriptSectionLayout'
import type { BreakdownElement, BreakdownTag, Location, Scene, ScriptPage } from '@/lib/db/types'
import { matchBreakdownElement, type ElementMatch } from '@/lib/breakdown/matching'

const NO_SECTIONS: ReadonlyArray<{ id: string; scene_id: string }> = []
const NO_RANGES = new Map()

export type ScriptBreakdownData = {
  scenes: Scene[]
  /** Scenes with pages in the version, in script order. */
  versionScenes: Scene[]
  locations: Location[]
  pages: ScriptPage[]
  layoutBySceneId: Map<string, SceneLayout<ScriptPage>>
  elements: BreakdownElement[]
  elementsById: Map<string, BreakdownElement>
  tags: BreakdownTag[]
  tagsBySceneId: Map<string, BreakdownTag[]>
  /** Scenes each element is tagged in (this version), in script order. */
  sceneIdsByElementId: Map<string, string[]>
  matchesByElementId: Map<string, ElementMatch>
  isLoading: boolean
}

/** Everything the Script Breakdown page shows for one script version. */
export function useScriptBreakdownData(productionId: string | null, versionId: string | null): ScriptBreakdownData {
  const enabled = !!productionId
  const scenesQ = useQuery({ queryKey: ['scenes', productionId], queryFn: () => listScenesByProduction(productionId!), enabled })
  const locationsQ = useQuery({ queryKey: ['locations', productionId], queryFn: () => listLocationsByProduction(productionId!), enabled })
  const castQ = useQuery({ queryKey: ['cast', productionId], queryFn: () => listCast(productionId!), enabled })
  const equipmentQ = useQuery({ queryKey: ['equipment', productionId], queryFn: () => listEquipmentByProduction(productionId!), enabled })
  const tracksQ = useQuery({
    queryKey: ['music-tracks', productionId, 'breakdown'],
    queryFn: () => listMusicTracksByProduction(productionId!, { filter: 'all' }),
    enabled,
  })
  const clearancesQ = useQuery({ queryKey: ['clearances', productionId], queryFn: () => listClearancesByProduction(productionId!), enabled })
  const elementsQ = useQuery({ queryKey: ['breakdown-elements', productionId], queryFn: () => listBreakdownElements(productionId!), enabled })
  const pagesQ = useQuery({
    queryKey: ['script-pages', versionId],
    queryFn: () => listScriptPagesByScriptVersion(versionId!),
    enabled: !!versionId,
  })
  const tagsQ = useQuery({
    queryKey: ['breakdown-tags', versionId],
    queryFn: () => listBreakdownTagsByScriptVersion(versionId!),
    enabled: !!versionId,
  })

  const scenes = useMemo(() => scenesQ.data ?? [], [scenesQ.data])
  const pages = useMemo(() => pagesQ.data ?? [], [pagesQ.data])
  const tags = useMemo(() => tagsQ.data ?? [], [tagsQ.data])
  const elements = useMemo(() => elementsQ.data ?? [], [elementsQ.data])

  const layoutBySceneId = useMemo(() => buildSceneLayouts(pages, NO_SECTIONS, NO_RANGES), [pages])
  const versionScenes = useMemo(() => {
    const firstPage = (id: string) => layoutBySceneId.get(id)?.pages[0]?.page_index ?? 0
    return scenes
      .filter((s) => layoutBySceneId.has(s.id))
      .sort((a, b) => firstPage(a.id) - firstPage(b.id) || a.scene_number.localeCompare(b.scene_number, undefined, { numeric: true }))
  }, [scenes, layoutBySceneId])

  const sceneIdsKey = versionScenes.map((s) => s.id).join(',')
  const castBySceneQ = useQuery({
    queryKey: ['cast-by-scene', sceneIdsKey],
    queryFn: () => getCastIdsBySceneIds(versionScenes.map((s) => s.id)),
    enabled: versionScenes.length > 0,
  })

  const elementsById = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements])
  const tagsBySceneId = useMemo(() => {
    const map = new Map<string, BreakdownTag[]>()
    for (const tag of tags) {
      if (!elementsById.has(tag.element_id)) continue
      map.set(tag.scene_id, [...(map.get(tag.scene_id) ?? []), tag])
    }
    return map
  }, [tags, elementsById])

  const sceneIdsByElementId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const scene of versionScenes) {
      for (const tag of tagsBySceneId.get(scene.id) ?? []) {
        const list = map.get(tag.element_id) ?? []
        if (!list.includes(scene.id)) list.push(scene.id)
        map.set(tag.element_id, list)
      }
    }
    return map
  }, [versionScenes, tagsBySceneId])

  const matchesByElementId = useMemo(() => {
    const data = {
      locations: locationsQ.data ?? [],
      cast: castQ.data ?? [],
      equipment: equipmentQ.data ?? [],
      musicTracks: tracksQ.data ?? [],
      clearances: clearancesQ.data ?? [],
      castIdsBySceneId: castBySceneQ.data ?? new Map<string, string[]>(),
    }
    return new Map(elements.map((e) => [e.id, matchBreakdownElement(e, sceneIdsByElementId.get(e.id) ?? [], data)]))
  }, [elements, sceneIdsByElementId, locationsQ.data, castQ.data, equipmentQ.data, tracksQ.data, clearancesQ.data, castBySceneQ.data])

  return {
    scenes,
    versionScenes,
    locations: locationsQ.data ?? [],
    pages,
    layoutBySceneId,
    elements,
    elementsById,
    tags,
    tagsBySceneId,
    sceneIdsByElementId,
    matchesByElementId,
    isLoading: pagesQ.isLoading || tagsQ.isLoading || elementsQ.isLoading,
  }
}

/** Refetch after a tag or element write. */
export function invalidateBreakdown(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['breakdown-elements'] })
  queryClient.invalidateQueries({ queryKey: ['breakdown-tags'] })
  queryClient.invalidateQueries({ queryKey: ['breakdown-revision-review'] })
}
