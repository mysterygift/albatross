import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDb } from '@/lib/db/client'
import { API_CALL_TRACKING_SETTING_KEY, setApiCallTrackingEnabled } from '@/lib/dev/apiCallTracker'
import { ensureSettingsDefaults, getSetting } from '@/lib/db/repositories/settings'
import { listProductions } from '@/lib/db/repositories/production'
import type { Production } from '@/lib/db/types'

type ProductionContextValue = {
  currentProductionId: string | null
  setCurrentProductionId: (id: string | null) => void
  getSelectedBudgetRevisionId: (productionId: string | null | undefined) => string | null
  setSelectedBudgetRevisionId: (productionId: string | null | undefined, revisionId: string | null) => void
  clearSelectedBudgetRevisionId: (productionId: string | null | undefined) => void
  productions: Production[]
  currentProduction: Production | null
  refetchProductions: () => void
}

const ProductionContext = createContext<ProductionContextValue | null>(null)

let settingsDefaultsEnsured = false

export function ProductionProvider({ children }: { children: ReactNode }) {
  const [currentProductionId, setCurrentProductionId] = useState<string | null>(null)
  const [selectedBudgetRevisionByProduction, setSelectedBudgetRevisionByProduction] = useState<Record<string, string>>({})

  useEffect(() => {
    if (settingsDefaultsEnsured) return
    settingsDefaultsEnsured = true
    getDb()
      .then(() => ensureSettingsDefaults())
      .then(() => getSetting(API_CALL_TRACKING_SETTING_KEY))
      .then((v) => setApiCallTrackingEnabled(v === 'true'))
      .catch(console.error)
  }, [])

  const { data: productions = [], refetch: refetchProductions } = useQuery({
    queryKey: ['productions', { includeArchived: false }],
    queryFn: () => listProductions({ includeArchived: false }),
  })

  // If current production was archived (or deleted), it won't be in the active list; clear selection to avoid stale state.
  useEffect(() => {
    if (currentProductionId && productions.length >= 0 && !productions.some((p) => p.id === currentProductionId)) {
      queueMicrotask(() => setCurrentProductionId(null))
    }
  }, [currentProductionId, productions, setCurrentProductionId])

  const currentProduction = useMemo(
    () => productions.find((p) => p.id === currentProductionId) ?? null,
    [productions, currentProductionId]
  )

  const setCurrent = useCallback((id: string | null) => {
    setCurrentProductionId(id)
  }, [])

  const getSelectedBudgetRevisionId = useCallback(
    (productionId: string | null | undefined) => {
      if (!productionId) return null
      return selectedBudgetRevisionByProduction[productionId] ?? null
    },
    [selectedBudgetRevisionByProduction]
  )

  const setSelectedBudgetRevisionId = useCallback((productionId: string | null | undefined, revisionId: string | null) => {
    if (!productionId) return
    setSelectedBudgetRevisionByProduction((prev) => {
      const existing = prev[productionId] ?? null
      if (revisionId == null) {
        if (existing == null) return prev
        const next = { ...prev }
        delete next[productionId]
        return next
      }
      if (existing === revisionId) return prev
      return { ...prev, [productionId]: revisionId }
    })
  }, [])

  const clearSelectedBudgetRevisionId = useCallback((productionId: string | null | undefined) => {
    if (!productionId) return
    setSelectedBudgetRevisionByProduction((prev) => {
      if (!(productionId in prev)) return prev
      const next = { ...prev }
      delete next[productionId]
      return next
    })
  }, [])

  const value = useMemo<ProductionContextValue>(
    () => ({
      currentProductionId,
      setCurrentProductionId: setCurrent,
      getSelectedBudgetRevisionId,
      setSelectedBudgetRevisionId,
      clearSelectedBudgetRevisionId,
      productions,
      currentProduction,
      refetchProductions,
    }),
    [
      currentProductionId,
      setCurrent,
      getSelectedBudgetRevisionId,
      setSelectedBudgetRevisionId,
      clearSelectedBudgetRevisionId,
      productions,
      currentProduction,
      refetchProductions,
    ]
  )

  return (
    <ProductionContext.Provider value={value}>
      {children}
    </ProductionContext.Provider>
  )
}

export function useCurrentProduction() {
  const ctx = useContext(ProductionContext)
  if (!ctx) throw new Error('useCurrentProduction must be used within ProductionProvider')
  return ctx
}
