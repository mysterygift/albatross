import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/app/layout'
import { DashboardPage } from '@/features/dashboard/page'
import { ProductionsPage } from '@/features/productions/page'
import { BudgetPage } from '@/features/budget/page'
import { ScheduleCalendarPage } from '@/features/schedule/calendar-page'
import { StripboardPage } from '@/features/schedule/stripboard-page'
import { ShotListPage } from '@/features/schedule/shot-list-page'
import { StoryboardPage } from '@/features/schedule/storyboard-page'
import { ScriptImportPage } from '@/features/schedule/script-import-page'
import { ScriptSectionsPage } from '@/features/schedule/script-sections-page'
import { ScriptBreakdownPage } from '@/features/schedule/script-breakdown-page'
import { ScriptSupervisorPage } from '@/features/script-supervisor/script-supervisor-page'
import { BookingsPage } from '@/features/people/pages/BookingsPage'
import { DayOutOfDaysPage } from '@/features/people/pages/DayOutOfDaysPage'
import { CastDetailPage } from '@/features/people/pages/CastDetailPage'
import { CrewDetailPage } from '@/features/people/pages/CrewDetailPage'
import { CastManagerPage } from '@/features/people/pages/CastManagerPage'
import { CrewManagerPage } from '@/features/people/crew-manager/page'
import { LocationsPage } from '@/features/locations/page'
import { EquipmentPage } from '@/features/equipment/page'
import { RiskAssessmentsPage } from '@/features/risk-assessments/page'
import { RiskAssessmentEditorPage } from '@/features/risk-assessments/editor-page'
import { DocumentsPage, DocumentsCategoryPage } from '@/features/documents/page'
import { CallSheetsPage } from '@/features/call-sheets/page'
import { MovementOrdersPage } from '@/features/movement-orders/page'
import { ReadinessPage } from '@/features/readiness/page'
import { DeliverablesPage } from '@/features/deliverables/page'
import { MusicClearancePage } from '@/features/music-clearance/page'
import { SettingsPage } from '@/features/settings/page'
import { AdminOnlyUserManagementRoute } from '@/features/admin/UserManagementPage'
import { ProjectAccessRoute } from '@/features/admin/ProjectAccessPage'
import { WrapProductionPage } from '@/features/wrap-production/page'
import { VendorsIndexPage } from '@/features/budget/vendors/VendorsIndexPage'
import { OvertimePage } from '@/features/people/overtime/OvertimePage'
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
      { path: 'schedule/storyboard', element: <StoryboardPage /> },
      { path: 'schedule/script-import', element: <ScriptImportPage /> },
      { path: 'schedule/script-sections', element: <ScriptSectionsPage /> },
      { path: 'schedule/script-breakdown', element: <ScriptBreakdownPage /> },
      { path: 'schedule/script-supervisor', element: <ScriptSupervisorPage /> },
      { path: 'people', element: <Navigate to="/people/cast-manager" replace /> },
      { path: 'people/bookings', element: <BookingsPage /> },
      { path: 'people/day-out-of-days', element: <DayOutOfDaysPage /> },
      { path: 'people/cast-manager', element: <CastManagerPage /> },
      { path: 'people/crew-manager', element: <CrewManagerPage /> },
      { path: 'people/overtime', element: <OvertimePage /> },
      { path: 'people/crew/:personId', element: <CrewDetailPage /> },
      { path: 'people/cast', element: <Navigate to="/people/cast-manager" replace /> },
      { path: 'people/:personId', element: <CastDetailPage /> },
      { path: 'locations', element: <LocationsPage /> },
      { path: 'equipment', element: <EquipmentPage /> },
      { path: 'risk-assessments', element: <RiskAssessmentsPage /> },
      { path: 'risk-assessments/:id', element: <RiskAssessmentEditorPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'documents/:category', element: <DocumentsCategoryPage /> },
      { path: 'call-sheets', element: <CallSheetsPage /> },
      { path: 'movement-orders', element: <MovementOrdersPage /> },
      { path: 'tasks', element: <ReadinessPage /> },
      { path: 'readiness', element: <Navigate to="/tasks" replace /> },
      { path: 'deliverables', element: <DeliverablesPage /> },
      { path: 'music-clearance', element: <MusicClearancePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/users', element: <AdminOnlyUserManagementRoute /> },
      { path: 'settings/project-access', element: <ProjectAccessRoute /> },
      {
        path: 'settings/guidebook/:chapter?',
        lazy: async () => ({ Component: (await import('@/features/guidebook/GuidebookPage')).GuidebookPage }),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])