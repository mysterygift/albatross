import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'

export const SETUP_STATE_FILENAME = 'albatross.setup.state.json'

export type SetupProgressPhase =
  | 'welcome'
  | 'detect'
  | 'admin_pending'
  | 'recovery_pending'
  | 'failed'

export type SetupProgressState = {
  version: 1
  phase: SetupProgressPhase
  last_error?: string
  started_at: string
  updated_at: string
}

export async function getSetupProgressPath(): Promise<string> {
  const dir = await appConfigDir()
  return join(dir, SETUP_STATE_FILENAME)
}

function parseSetupProgressState(raw: unknown): SetupProgressState {
  const parsed = raw as SetupProgressState
  if (parsed?.version !== 1) {
    throw new Error('Invalid setup progress metadata')
  }
  if (
    parsed.phase !== 'welcome' &&
    parsed.phase !== 'detect' &&
    parsed.phase !== 'admin_pending' &&
    parsed.phase !== 'recovery_pending' &&
    parsed.phase !== 'failed'
  ) {
    throw new Error('Invalid setup progress metadata')
  }
  if (typeof parsed.started_at !== 'string' || typeof parsed.updated_at !== 'string') {
    throw new Error('Invalid setup progress metadata')
  }
  if (parsed.last_error !== undefined && typeof parsed.last_error !== 'string') {
    throw new Error('Invalid setup progress metadata')
  }
  return parsed
}

export async function readSetupProgress(): Promise<SetupProgressState | null> {
  const path = await getSetupProgressPath()
  if (!(await exists(path))) {
    return null
  }
  const raw = await readTextFile(path)
  return parseSetupProgressState(JSON.parse(raw))
}

export async function writeSetupProgress(
  phase: SetupProgressPhase,
  options?: { lastError?: string; startedAt?: string }
): Promise<SetupProgressState> {
  const existing = await readSetupProgress()
  const now = new Date().toISOString()
  const next: SetupProgressState = {
    version: 1,
    phase,
    started_at: options?.startedAt ?? existing?.started_at ?? now,
    updated_at: now,
  }
  if (options?.lastError) {
    next.last_error = options.lastError
  } else if (phase !== 'failed' && existing?.last_error) {
    delete next.last_error
  }
  const path = await getSetupProgressPath()
  await writeTextFile(path, JSON.stringify(next, null, 2))
  return next
}

export async function markSetupFailed(message: string): Promise<SetupProgressState> {
  return writeSetupProgress('failed', { lastError: message })
}

export async function clearSetupProgress(): Promise<void> {
  const path = await getSetupProgressPath()
  if (await exists(path)) {
    await remove(path)
  }
}
