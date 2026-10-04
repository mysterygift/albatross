/**
 * TanStack Query hooks for Script Supervisor slates and takes (SS1).
 * Every mutation invalidates the whole ['script-supervisor'] key so day, scene and take views stay in step.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSlate,
  createTake,
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
