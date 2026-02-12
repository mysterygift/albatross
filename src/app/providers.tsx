import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProductionProvider } from '@/features/productions/context'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000 },
  },
})

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProductionProvider>{children}</ProductionProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
