import { useQuery } from '@tanstack/react-query'

import { getEffectiveDataSourceForProduction, type EffectiveDataSource } from '@/lib/db/projectDataSource'

/**
 * Cached effective data source for TanStack query key namespacing when a production
 * toggles between local SQLite and linked server runtime.
 */
export function useEffectiveDataSourceForProduction(productionId: string | null): {
  data: EffectiveDataSource | undefined
  dataSourceKey: EffectiveDataSource
} {
  const q = useQuery({
    queryKey: ['effective-data-source', productionId],
    queryFn: () => (productionId ? getEffectiveDataSourceForProduction(productionId) : ('local_sqlite' as const)),
    enabled: !!productionId,
    staleTime: 5_000,
  })
  return {
    data: q.data,
    dataSourceKey: q.data ?? 'local_sqlite',
  }
}
