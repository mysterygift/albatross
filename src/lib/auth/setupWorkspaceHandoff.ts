export type SetupWorkspaceHandoffPhase =
  | 'idle'
  | 'fadingWelcome'
  | 'brandWash'
  | 'revealingApp'
  | 'complete'

/**
 * `setup` is the one-time handoff after first-run setup (the wizard stays mounted until the
 * session is persisted). `login` is the intro played after every ordinary sign-in.
 */
export type SetupWorkspaceHandoffKind = 'setup' | 'login'

export type SetupWorkspaceHandoffSnapshot = {
  armed: boolean
  phase: SetupWorkspaceHandoffPhase
  kind: SetupWorkspaceHandoffKind
}

let snapshot: SetupWorkspaceHandoffSnapshot = { armed: false, phase: 'idle', kind: 'setup' }
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

export function getSetupWorkspaceHandoffSnapshot(): SetupWorkspaceHandoffSnapshot {
  return snapshot
}

export function subscribeSetupWorkspaceHandoff(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Call after a successful first-time setup commit (`setup`) or a successful credential check (`login`). */
export function armSetupWorkspaceHandoff(kind: SetupWorkspaceHandoffKind = 'setup'): void {
  snapshot = { armed: true, phase: 'idle', kind }
  emit()
}

/** Begins the one-time transition; returns false if not armed or already started. */
export function startSetupWorkspaceTransition(): boolean {
  if (!snapshot.armed || snapshot.phase !== 'idle') {
    return false
  }
  snapshot = { ...snapshot, phase: 'fadingWelcome' }
  emit()
  return true
}

export function advanceSetupWorkspaceHandoffPhase(phase: SetupWorkspaceHandoffPhase): void {
  snapshot = { ...snapshot, phase }
  emit()
}

export function resetSetupWorkspaceHandoffTransition(): void {
  if (!snapshot.armed) {
    return
  }
  snapshot = { ...snapshot, phase: 'idle' }
  emit()
}

export function disarmSetupWorkspaceHandoff(): void {
  snapshot = { armed: false, phase: 'idle', kind: 'setup' }
  emit()
}

export function isSetupWorkspaceHandoffArmed(): boolean {
  return snapshot.armed
}

export function isSetupWorkspaceTransitionActive(): boolean {
  return snapshot.phase !== 'idle' && snapshot.phase !== 'complete'
}

/** @internal Vitest only */
export function resetSetupWorkspaceHandoffForTests(): void {
  snapshot = { armed: false, phase: 'idle', kind: 'setup' }
  emit()
}
