/**
 * Dev-only DB performance logger. Times every execute/select, keeps rolling stats,
 * and captures lock errors for diagnostics. Single source of truth for the HUD and "Log to console".
 *
 * Locking fixes applied in this codebase:
 * - WAL + busy_timeout + write queue in client.ts reduce "database is locked".
 * - Retry with backoff on SQLITE_BUSY in client wrapper.
 * - Outbox should be written inside same transaction as entity write (see repos).
 * Verify with: open DB Perf HUD, do data entry, click "Log to console", check for lock errors in output.
 */
export type DbOpKind = 'execute' | 'select'

export interface DbPerfEntry {
  id: string
  kind: DbOpKind
  /** First 120 chars of SQL (sanitized for logging) */
  sql: string
  durationMs: number
  rowsAffected?: number
  rowsReturned?: number
  correlationId?: string
  timestamp: number
  /** Set when the op threw (e.g. "database is locked") */
  error?: string
  /** true = INSERT/UPDATE/DELETE/REPLACE, false = read */
  isWrite?: boolean
}

export interface LockErrorEntry {
  timestamp: number
  message: string
  sql: string
  kind: DbOpKind
}

const MAX_ENTRIES = 500
const MAX_LOCK_ERRORS = 100
const SLOW_THRESHOLD_MS = 50
const TOP_N = 20
const DUMP_DEFAULT_N = 100

const entries: DbPerfEntry[] = []
const lockErrors: LockErrorEntry[] = []
let correlationCounter = 0

function sanitizeSql(sql: string, maxLen: number = 120): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

/** Detect SQLite lock/busy errors from message. Exported for client retry logic. */
export function isLockError(msg: string): boolean {
  const s = String(msg || '').toLowerCase()
  return (
    s.includes('database is locked') ||
    s.includes('sqlite_busy') ||
    s.includes('sqlite_locked') ||
    s.includes('code: 5') ||
    s.includes('code: 6')
  )
}

function isWriteSql(sql: string): boolean {
  const t = sql.trim().toUpperCase()
  return (
    t.startsWith('INSERT') ||
    t.startsWith('UPDATE') ||
    t.startsWith('DELETE') ||
    t.startsWith('REPLACE')
  )
}

/** Call at start of a multi-step operation to get a correlation id for all steps. */
export function startCorrelation(): string {
  return `op-${Date.now()}-${++correlationCounter}`
}

/** Record a lock error for diagnostics. */
export function recordLockError(sql: string, kind: DbOpKind, message: string): void {
  if (!import.meta.env.DEV) return
  lockErrors.push({
    timestamp: Date.now(),
    message,
    sql: sanitizeSql(sql),
    kind,
  })
  if (lockErrors.length > MAX_LOCK_ERRORS) lockErrors.shift()
}

/** Record a retry attempt for SQLITE_BUSY (for diagnostics). */
export function recordRetryAttempt(sql: string, kind: DbOpKind, attempt: number, errorMessage: string): void {
  if (!import.meta.env.DEV) return
  console.warn(`[DB retry] attempt ${attempt} [${kind}] ${sanitizeSql(sql)} | ${errorMessage}`)
}

/** Record a DB operation. No-op when not in DEV. */
export function recordDbOp(entry: Omit<DbPerfEntry, 'id' | 'timestamp'>): void {
  if (!import.meta.env.DEV) return
  const isWrite = entry.kind === 'execute' ? isWriteSql(entry.sql) : false
  const full: DbPerfEntry = {
    ...entry,
    id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    isWrite: entry.kind === 'execute' ? isWrite : false,
  }
  entries.push(full)
  if (entries.length > MAX_ENTRIES) entries.shift()
  if (full.error && isLockError(full.error)) {
    recordLockError(full.sql, full.kind, full.error)
  }
  if (full.durationMs >= SLOW_THRESHOLD_MS) {
    console.warn(
      `[DB slow] ${full.kind} ${full.durationMs.toFixed(0)}ms | ${full.sql}`,
      full.error ? ` error=${full.error}` : ''
    )
  }
}

/** Rolling average duration (ms) over last N execute/select calls. */
export function getRollingAverageMs(n: number = 50): number {
  if (!import.meta.env.DEV || entries.length === 0) return 0
  const slice = entries.slice(-n)
  const sum = slice.reduce((a, e) => a + e.durationMs, 0)
  return sum / slice.length
}

/** Top N slowest queries (by duration). */
export function getTopSlow(n: number = TOP_N): DbPerfEntry[] {
  if (!import.meta.env.DEV) return []
  return [...entries]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, n)
}

/** All entries (for external HUD). */
export function getEntries(): DbPerfEntry[] {
  return import.meta.env.DEV ? [...entries] : []
}

/** Lock errors captured so far. */
export function getLockErrors(): LockErrorEntry[] {
  return import.meta.env.DEV ? [...lockErrors] : []
}

/** Clear stored entries and lock errors. */
export function clearPerfLog(): void {
  if (import.meta.env.DEV) {
    entries.length = 0
    lockErrors.length = 0
  }
}

/**
 * Dump last N DB operations and any lock errors to the console. Used by "Log to console" button.
 * Returns { count, lockCount } for toast. Always runs (does not early-return on !DEV) so the button can show feedback.
 */
export function dumpLogsToConsole(n: number = DUMP_DEFAULT_N): { count: number; lockCount: number } {
  const count = entries.length
  const lockCount = lockErrors.length
  const lastN = count === 0 ? [] : entries.slice(-n)

  console.groupCollapsed(`[Albatross DB] Last ${lastN.length} operations (total ${count}) | Lock errors: ${lockCount}`)
  console.log(
    'Rolling avg (last 50): %s ms',
    count > 0 ? getRollingAverageMs(50).toFixed(2) : 'n/a'
  )
  if (lastN.length === 0) {
    console.log('No DB operations captured yet. Use the app (navigate, edit, drag) then try again.')
  } else {
    console.table(
      lastN.map((e) => ({
        time: new Date(e.timestamp).toISOString().slice(11, 23),
        kind: e.kind,
        write: e.isWrite ?? false,
        ms: e.durationMs.toFixed(1),
        rows: e.rowsReturned ?? e.rowsAffected ?? '-',
        error: e.error ? (e.error.length > 40 ? e.error.slice(0, 40) + '…' : e.error) : '',
        sql: e.sql,
      }))
    )
    lastN.forEach((e, i) => {
      console.log(
        `  ${i + 1}. ${new Date(e.timestamp).toISOString()} | ${e.kind} | ${e.durationMs.toFixed(0)}ms | write=${e.isWrite ?? false} | ${e.sql}${e.error ? ` | ERROR: ${e.error}` : ''}`
      )
    })
  }
  if (lockErrors.length > 0) {
    console.group('Lock errors (database is locked / SQLITE_BUSY)')
    lockErrors.forEach((le, i) => {
      console.log(`${i + 1}. ${new Date(le.timestamp).toISOString()} [${le.kind}] ${le.sql} | ${le.message}`)
    })
    console.groupEnd()
  }
  console.groupEnd()

  return { count, lockCount }
}

/** Log to console: rolling avg and top slow. Kept for backward compat. */
export function logPerfSummary(): void {
  if (!import.meta.env.DEV) return
  const avg = getRollingAverageMs(50)
  const top = getTopSlow(20)
  console.group('[DB Perf] Summary')
  console.log(`Rolling avg (last 50): ${avg.toFixed(2)} ms | total calls: ${entries.length} | lock errors: ${lockErrors.length}`)
  console.log('Top 20 slow:')
  if (top.length === 0) console.log('  (none yet)')
  top.forEach((e, i) => {
    console.log(
      `  ${i + 1}. ${e.durationMs.toFixed(0)}ms [${e.kind}] write=${e.isWrite ?? false} ${e.sql}${e.rowsReturned != null ? ` rows=${e.rowsReturned}` : ''}${e.rowsAffected != null ? ` affected=${e.rowsAffected}` : ''}${e.error ? ` | ${e.error}` : ''}`
    )
  })
  console.groupEnd()
}

/** Expose in dev for console. */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as {
    __dbPerfSummary?: () => void
    __dbPerfLog?: () => void
    __dbDumpLogs?: (n?: number) => { count: number; lockCount: number }
  }
  w.__dbPerfSummary = logPerfSummary
  w.__dbPerfLog = () => {
    dumpLogsToConsole(100)
  }
  w.__dbDumpLogs = (n) => dumpLogsToConsole(n ?? 100)
}

/** Return a summary object for the Perf HUD. */
export function getPerfSummary(): {
  rollingAvgMs: number
  totalCalls: number
  slowCount: number
  lockErrorCount: number
  topSlow: Array<{ sql: string; durationMs: number; kind: string }>
} {
  if (!import.meta.env.DEV) {
    return { rollingAvgMs: 0, totalCalls: 0, slowCount: 0, lockErrorCount: 0, topSlow: [] }
  }
  const avg = getRollingAverageMs(50)
  const slowCount = entries.filter((e) => e.durationMs >= SLOW_THRESHOLD_MS).length
  const top = getTopSlow(5).map((e) => ({
    sql: e.sql,
    durationMs: e.durationMs,
    kind: e.kind,
  }))
  return {
    rollingAvgMs: avg,
    totalCalls: entries.length,
    slowCount,
    lockErrorCount: lockErrors.length,
    topSlow: top,
  }
}
