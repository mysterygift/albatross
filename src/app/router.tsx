import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/app/layout'
import { DashboardPage } from '@/features/dashboard/page'
import { ProductionsPage } from '@/features/productions/page'
import { BudgetPage } from '@/features/budget/page'
import { ScheduleCalendarPage } from '@/features/schedule/calendar-page'
import { StripboardPage } from '@/features/schedule/stripboard-page'
import { ShotListPage } from '@/features/schedule/shot-list-page'
import { ScriptImportPage } from '@/features/schedule/script-import-page'
import { PeoplePage } from '@/features/people/page'
import { BookingsPage } from '@/features/people/pages/BookingsPage'
import { DayOutOfDaysPage } from '@/features/people/pages/DayOutOfDaysPage'
import { LocationsPage } from '@/features/locations/page'
import { EquipmentPage } from '@/features/equipment/page'
import { DocumentsPage } from '@/features/documents/page'
import { CallSheetsPage } from '@/features/call-sheets/page'
import { ReadinessPage } from '@/features/readiness/page'
import { DeliverablesPage } from '@/features/deliverables/page'
import { MusicClearancePage } from '@/features/music-clearance/page'
import { SettingsPage } from '@/features/settings/page'
import { WrapProductionPage } from '@/features/wrap-production/page'
import { VendorsIndexPage } from '@/features/budget/vendors/VendorsIndexPage'
import { VendorDetailPage } from '@/features/budget/vendors/VendorDetailPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'wrap-production', element: <WrapProductionPage /> },
      { path: 'productions', element: <ProductionsPage /> },
      { path: 'budget', element: <BudgetPage /> },
      { path: 'budget/vendors', element: <VendorsIndexPage /> },
      { path: 'budget/vendors/:vendorId', element: <VendorDetailPage /> },
      { path: 'schedule', element: <Navigate to="/schedule/calendar" replace /> },
      { path: 'schedule/calendar', element: <ScheduleCalendarPage /> },
      { path: 'schedule/stripboard', element: <StripboardPage /> },
      { path: 'schedule/shots', element: <ShotListPage /> },
      { path: 'schedule/script-import', element: <ScriptImportPage /> },
      { path: 'people', element: <Navigate to="/people/bookings" replace /> },
      { path: 'people/bookings', element: <BookingsPage /> },
      { path: 'people/day-out-of-days', element: <DayOutOfDaysPage /> },
      { path: 'people/cast', element: <PeoplePage /> },
      { path: 'locations', element: <LocationsPage /> },
      { path: 'equipment', element: <EquipmentPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'call-sheets', element: <CallSheetsPage /> },
      { path: 'readiness', element: <ReadinessPage /> },
      { path: 'deliverables', element: <DeliverablesPage /> },
      { path: 'music-clearance', element: <MusicClearancePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])