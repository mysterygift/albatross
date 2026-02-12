import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDb } from '@/lib/db/client'
import { ensureSettingsDefaults } from '@/lib/db/repositories/settings'
import { listProductions } from '@/lib/db/repositories/production'
import type { Production } from '@/lib/db/types'

type ProductionContextValue = {
  currentProductionId: string | null
  setCurrentProductionId: (id: string | null) => void
  productions: Production[]
  currentProduction: Production | null
  refetchProductions: () => void
}

const ProductionContext = createContext<ProductionContextValue | null>(null)

export function ProductionProvider({ children }: { children: ReactNode }) {
  const [currentProductionId, setCurrentProductionId] = useState<string | null>(null)

  useEffect(() => {
    getDb()
      .then(() => ensureSettingsDefaults())
      .catch(console.error)
  }, [])

  const { data: productions = [], refetch: refetchProductions } = useQuery({
    queryKey: ['productions'],
    queryFn: listProductions,
  })

  const currentProduction = useMemo(
    () => productions.find((p) => p.id === currentProductionId) ?? null,
    [productions, currentProductionId]
  )

  const setCurrent = useCallback((id: string | null) => {
    setCurrentProductionId(id)
  }, [])

  const value = useMemo<ProductionContextValue>(
    () => ({
      currentProductionId,
      setCurrentProductionId: setCurrent,
      productions,
      currentProduction,
      refetchProductions,
    }),
    [currentProductionId, setCurrent, productions, currentProduction, refetchProductions]
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
