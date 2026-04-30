import { RouterProvider } from 'react-router-dom'
import { AppProviders } from '@/app/providers'
import { router } from '@/app/router'
import { isTauriWebview } from '@/lib/tauri/isTauriWebview'

function BrowserOnlyExplainer() {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-8"
      style={{ background: 'oklch(0.18 0.01 260)', color: 'oklch(0.92 0.01 260)' }}
    >
      <div
        className="max-w-lg space-y-3 rounded-lg border p-6 shadow-sm"
        style={{ borderColor: 'oklch(0.35 0.02 260)', background: 'oklch(0.22 0.01 260)' }}
      >
        <h1 className="text-lg font-semibold">Open the desktop window, not this browser tab</h1>
        <p className="text-sm leading-relaxed opacity-90">
          Albatross talks to SQLite through Tauri. A normal browser tab at this URL does not have the Tauri runtime, so
          the app cannot load your database here.
        </p>
        <p className="text-sm leading-relaxed opacity-90">
          Start <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">npm run tauri:dev</span> and use
          the <strong>Albatross</strong> window it opens. Ignore <span className="font-mono text-xs">localhost:5174</span>{' '}
          in Chrome or Safari unless you are only editing static UI.
        </p>
      </div>
    </div>
  )
}

function App() {
  if (typeof window !== 'undefined' && !isTauriWebview()) {
    return <BrowserOnlyExplainer />
  }
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}

export default App
