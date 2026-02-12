import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/top-bar'

export function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopBar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
