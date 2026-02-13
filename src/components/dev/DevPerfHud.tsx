/**
 * Dev-only DB performance HUD. Rendered when DEV and "DB Perf logging" is enabled in Settings.
 */
import { useEffect, useState, useCallback } from 'react'
import { getPerfSummary, dumpLogsToConsole, clearPerfLog, isPerfLoggingEnabled } from '@/lib/db/perf'

const POLL_MS = 2000
const TOAST_MS = 3000

export function DevPerfHud() {
  const [summary, setSummary] = useState(getPerfSummary())
  const [collapsed, setCollapsed] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(isPerfLoggingEnabled())

  useEffect(() => {
    const interval = setInterval(() => {
      setEnabled(isPerfLoggingEnabled())
      if (isPerfLoggingEnabled()) setSummary(getPerfSummary())
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [])

  const handleLogToConsole = useCallback(() => {
    const { count, lockCount } = dumpLogsToConsole(100)
    if (count === 0) {
      setToast('No DB logs captured yet')
    } else {
      setToast(
        lockCount > 0
          ? `Dumped ${count} DB logs (${lockCount} lock errors) to console`
          : `Dumped ${count} DB logs to console`
      )
    }
    setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  if (!import.meta.env.DEV || !enabled) return null

  return (
    <div
      className="fixed bottom-2 right-2 z-[9999] max-w-[320px] rounded border border-amber-500/50 bg-amber-950/95 px-2 py-1.5 font-mono text-xs text-amber-100 shadow-lg"
      data-slot="dev-perf-hud"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="font-semibold">DB Perf</span>
        <span>
          avg {summary.rollingAvgMs.toFixed(1)} ms · {summary.totalCalls} calls
          {summary.slowCount > 0 && (
            <span className="ml-1 text-amber-300"> · {summary.slowCount} slow</span>
          )}
          {summary.lockErrorCount > 0 && (
            <span className="ml-1 text-red-300"> · {summary.lockErrorCount} locks</span>
          )}
        </span>
      </button>
      {!collapsed && (
        <div className="mt-2 space-y-1 border-t border-amber-500/30 pt-2">
          {toast && (
            <div
              className="rounded bg-amber-800/90 px-2 py-1 text-amber-100"
              role="status"
              aria-live="polite"
            >
              {toast}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-amber-700/80 px-1.5 py-0.5 hover:bg-amber-600"
              onClick={handleLogToConsole}
            >
              Log to console
            </button>
            <button
              type="button"
              className="rounded bg-amber-700/80 px-1.5 py-0.5 hover:bg-amber-600"
              onClick={() => {
                clearPerfLog()
                setSummary(getPerfSummary())
              }}
            >
              Clear
            </button>
          </div>
          {summary.topSlow.length > 0 && (
            <div>
              <div className="font-semibold text-amber-200">Top 5 slow:</div>
              <ul className="max-h-32 overflow-auto">
                {summary.topSlow.map((e, i) => (
                  <li key={i} className="truncate" title={e.sql}>
                    {e.durationMs.toFixed(0)} ms [{e.kind}] {e.sql}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
