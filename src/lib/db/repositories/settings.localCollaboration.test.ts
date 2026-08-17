import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'

import { setDbAdapterForTests } from '@/lib/db/client'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

import { ensureSettingsDefaults, getSetting, setSetting } from './settings'

let raw: Database

beforeEach(async () => {
  const SQL = await initSqlJs()
  raw = new SQL.Database()
  raw.run('CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)')
  setDbAdapterForTests(createSqlJsTauriAdapter(raw))
})

afterEach(() => {
  setDbAdapterForTests(null)
  raw.close()
})

describe('local collaboration setting migration', () => {
  it('carries the previous beta opt-in into the durable collaboration setting once', async () => {
    raw.run("INSERT INTO settings (key, value) VALUES ('feature_server_publish_enabled', 'true')")

    await ensureSettingsDefaults()
    await expect(getSetting('local_collaboration_enabled')).resolves.toBe('true')

    await setSetting('local_collaboration_enabled', 'false')
    await ensureSettingsDefaults()
    await expect(getSetting('local_collaboration_enabled')).resolves.toBe('false')
  })

  it('defaults to disabled when the previous beta setting does not exist', async () => {
    await ensureSettingsDefaults()
    await expect(getSetting('local_collaboration_enabled')).resolves.toBe('false')
  })
})
