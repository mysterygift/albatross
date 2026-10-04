/**
 * TanStack Query hooks for Script Supervisor slates and takes (SS1).
 * Every mutation invalidates the whole ['script-supervisor'] key so day, scene and take views stay in step.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SlatingSystem } from '@/lib/db/types'
import { loadShootProgress } from '@/lib/db/scriptSupervisorProgressService'
import {
  countLiveSlates,
  createSlate,
  createTake,
  getNextSlatePreview,
  getScriptSupervisorSettings,
  setSceneProgress,
  setSlatingSystem,
  type SceneProgressInput,
  listScenesForShootDay,
  listSlatesByScene,
  listSlatesByShootDay,
  listTakesBySlateIds,
  softDeleteSlate,
  softDeleteTake,
  updateSlate,
  updateTake,
  type CreateSlateInput,
  type TakeFields,
  type UpdateSlateInput,
} from '@/lib/db/repositories/scriptSupervisor'

export const scriptSupervisorKeys = {
  all: ['script-supervisor'] as const,
  slatesByShootDay: (shootDayId: string | null | undefined) =>
    ['script-supervisor', 'slates', 'shoot-day', shootDayId ?? null] as const,
  slatesByScene: (sceneId: string | null | undefined) =>
    ['script-supervisor', 'slates', 'scene', sceneId ?? null] as const,
  takes: (slateIds: readonly string[]) => ['script-supervisor', 'takes', [...slateIds].sort()] as const,
  settings: (productionId: string | null | undefined) => ['script-supervisor', 'settings', productionId ?? null] as const,
  slateCount: (productionId: string | null | undefined) =>
    ['script-supervisor', 'slate-count', productionId ?? null] as const,
  nextSlate: (productionId: string | null | undefined, prefix: string, sceneId: string | null | undefined) =>
    ['script-supervisor', 'next-slate', productionId ?? null, prefix, sceneId ?? null] as const,
}

/** Scenes on a shoot day's stripboard, in strip order. */
export function useScenesForShootDay(shootDayId: string | null | undefined) {
  return useQuery({
    queryKey: ['script-supervisor', 'day-scenes', shootDayId ?? null],
    queryFn: () => listScenesForShootDay(shootDayId!),
    enabled: !!shootDayId,
  })
}

/** Production slating system (UK default) — SS2. */
export function useScriptSupervisorSettings(productionId: string | null | undefined) {
  return useQuery({
    queryKey: scriptSupervisorKeys.settings(productionId),
    queryFn: () => getScriptSupervisorSettings(productionId!),
    enabled: !!productionId,
  })
}

/** Number of live slates; the slating system is locked while this is above zero. */
export function useLiveSlateCount(productionId: string | null | undefined) {
  return useQuery({
    queryKey: scriptSupervisorKeys.slateCount(productionId),
    queryFn: () => countLiveSlates(productionId!),
    enabled: !!productionId,
  })
}

/** Label the next "New slate" will get (UK '217', US '23B'); null when US has no scene chosen. */
export function useNextSlatePreview(
  productionId: string | null | undefined,
  opts: { prefix?: string; sceneId?: string | null } = {}
) {
  const prefix = opts.prefix ?? ''
  return useQuery({
    queryKey: scriptSupervisorKeys.nextSlate(productionId, prefix, opts.sceneId),
    queryFn: () => getNextSlatePreview(productionId!, { prefix, sceneId: opts.sceneId }),
    enabled: !!productionId,
  })
}

export function useSetSlatingSystem() {
  return useInvalidatingMutation(({ productionId, system }: { productionId: string; system: SlatingSystem }) =>
    setSlatingSystem(productionId, system)
  )
}

export function useSlatesForShootDay(shootDayId: string | null | undefined) {
  return useQuery({
    queryKey: scriptSupervisorKeys.slatesByShootDay(shootDayId),
    queryFn: () => listSlatesByShootDay(shootDayId!),
    enabled: !!shootDayId,
  })
}

export function useSlatesForScene(sceneId: string | null | undefined) {
  return useQuery({
    queryKey: scriptSupervisorKeys.slatesByScene(sceneId),
    queryFn: () => listSlatesByScene(sceneId!),
    enabled: !!sceneId,
  })
}

export function useTakesForSlates(slateIds: readonly string[]) {
  return useQuery({
    queryKey: scriptSupervisorKeys.takes(slateIds),
    queryFn: () => listTakesBySlateIds(slateIds),
    enabled: slateIds.length > 0,
  })
}

function useInvalidatingMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scriptSupervisorKeys.all }),
  })
}

export function useCreateSlate() {
  return useInvalidatingMutation((input: CreateSlateInput) => createSlate(input))
}

export function useUpdateSlate() {
  return useInvalidatingMutation(({ id, patch }: { id: string; patch: UpdateSlateInput }) => updateSlate(id, patch))
}

export function useDeleteSlate() {
  return useInvalidatingMutation((id: string) => softDeleteSlate(id))
}

export function useCreateTake() {
  return useInvalidatingMutation(({ slateId, fields }: { slateId: string; fields?: TakeFields }) =>
    createTake(slateId, fields)
  )
}

export function useUpdateTake() {
  return useInvalidatingMutation(({ id, patch }: { id: string; patch: TakeFields }) => updateTake(id, patch))
}

export function useDeleteTake() {
  return useInvalidatingMutation((id: string) => softDeleteTake(id))
}

/** Shooting progress: per-scene status, totals and per-day pages (SS4). */
export function useShootProgress(productionId: string | null | undefined) {
  return useQuery({
    queryKey: ['script-supervisor', 'progress', productionId ?? null],
    queryFn: () => loadShootProgress(productionId!),
    enabled: !!productionId,
  })
}

export function useSetSceneProgress() {
  return useInvalidatingMutation(
    ({ productionId, sceneId, input }: { productionId: string; sceneId: string; input: SceneProgressInput }) =>
      setSceneProgress(productionId, sceneId, input)
  )
}
