import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSetupProgress,
  readSetupProgress,
  SETUP_STATE_FILENAME,
  writeSetupProgress,
} from '@/lib/auth/setupProgress'

const fsMocks = vi.hoisted(() => ({
  exists: vi.fn(async () => false),
  readTextFile: vi.fn(async () => ''),
  writeTextFile: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}))

vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/tmp/albatross-config'),
  join: (...parts: string[]) => parts.join('/'),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: fsMocks.exists,
  readTextFile: fsMocks.readTextFile,
  writeTextFile: fsMocks.writeTextFile,
  remove: fsMocks.remove,
}))

describe('setupProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fsMocks.exists.mockResolvedValue(false)
  })

  it('writes and reads non-secret setup progress', async () => {
    fsMocks.writeTextFile.mockImplementation(async (_path, contents) => {
      fsMocks.readTextFile.mockResolvedValue(contents)
      fsMocks.exists.mockResolvedValue(true)
    })

    const saved = await writeSetupProgress('detect')
    const loaded = await readSetupProgress()

    expect(saved.phase).toBe('detect')
    expect(loaded?.phase).toBe('detect')
    expect(saved.started_at).toBeTruthy()
    expect(saved.updated_at).toBeTruthy()
  })

  it('clears setup progress', async () => {
    fsMocks.exists.mockResolvedValue(true)
    await clearSetupProgress()
    expect(fsMocks.remove).toHaveBeenCalledWith(`/tmp/albatross-config/${SETUP_STATE_FILENAME}`)
  })

  it('does not persist secret field names in setup progress module', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/auth/setupProgress.ts'), 'utf8')
    const forbidden = [
      'password',
      'recovery_key',
      'recoveryKey',
      'instance_key',
      'instanceKey',
      'dek',
      'imk',
      'sqlcipher',
      'wrapped_instance_key',
      'wrapped_file_passphrase',
    ]
    for (const term of forbidden) {
      expect(source.toLowerCase()).not.toContain(term.toLowerCase())
    }
  })
})
