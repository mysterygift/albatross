import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'

import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
    executeBatch: vi.fn(async (db: { execute: (sql: string, b?: unknown[]) => Promise<void> }, statements: Array<{ sql: string; bindValues: unknown[] }>) => {
      for (const s of statements) await db.execute(s.sql, s.bindValues)
    }),
  }
})
vi.mock('@/lib/db/projectDataSource', () => ({ getEffectiveDataSourceForProduction: vi.fn(async () => 'local_sqlite') }))

import {
  carryBreakdownTagsForward,
  createBreakdownTags,
  deleteBreakdownElement,
  listBreakdownElements,
  listBreakdownRevisionReview,
  listBreakdownTagsByScriptVersion,
  mergeBreakdownElements,
  moveBreakdownTagToNewElement,
} from './scriptBreakdown'

const V1 = 'Sc 1\n\nEXT. BEACH - DAY\n\nMary opens a red umbrella. A dog barks.'
const V2 = 'Sc 1\n\nEXT. BEACH - DAY\n\nThunder.\n\nMary opens a red umbrella.'

async function seed() {
  const SQL = await initSqlJs({})
  const raw = new SQL.Database()
  applyAlbatrossMigrationsSqlJs(raw)
  raw.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(raw)
  raw.exec(`
    INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod', 't', 't');
    INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at) VALUES ('s1', 'p1', '1', 't', 't'), ('s2', 'p1', '2', 't', 't');
    INSERT INTO script_versions (id, production_id, title, is_locked, created_at, updated_at) VALUES ('v1', 'p1', 'White', 0, '2026-01-01', '2026-01-01');
    INSERT INTO script_pages (id, script_version_id, scene_id, page_number, page_index, content, eighths, created_at, updated_at)
      VALUES ('pg1', 'v1', 's1', '1', 0, '${V1}', 4, 't', 't'), ('pg2', 'v1', 's2', '2', 1, 'INT. HUT - NIGHT\n\nThe umbrella drips. A dog barks.', 4, 't', 't');
  `)
  return raw
}

function rangeOf(pageId: string, content: string, text: string) {
  const at = content.indexOf(text)
  return { startPageId: pageId, startOffset: at, endPageId: pageId, endOffset: at + text.length }
}

describe('script breakdown repository', () => {
  beforeEach(async () => {
    await seed()
  })

  it('reuses an element of the same category and name across scenes', async () => {
    const hut = 'INT. HUT - NIGHT\n\nThe umbrella drips. A dog barks.'
    const created = await createBreakdownTags([
      { scriptVersionId: 'v1', sceneId: 's1', category: 'props', range: rangeOf('pg1', V1, 'umbrella'), text: 'umbrella' },
      { scriptVersionId: 'v1', sceneId: 's2', category: 'props', range: rangeOf('pg2', hut, 'umbrella'), text: 'Umbrella' },
      { scriptVersionId: 'v1', sceneId: 's1', category: 'costume', range: rangeOf('pg1', V1, 'umbrella'), text: 'umbrella' },
    ])
    expect(created.map((c) => c.createdElement)).toEqual([true, false, true])
    expect(created[0]!.elementId).toBe(created[1]!.elementId)
    const elements = await listBreakdownElements('p1')
    expect(elements.map((e) => [e.category, e.name]).sort()).toEqual([['costume', 'umbrella'], ['props', 'umbrella']])
    expect(await listBreakdownTagsByScriptVersion('v1')).toHaveLength(3)
  })

  it('rejects a highlight that is not in the scene', async () => {
    await expect(
      createBreakdownTags([{ scriptVersionId: 'v1', sceneId: 's1', category: 'props', range: rangeOf('pg2', 'x', 'x'), text: 'x' }])
    ).rejects.toThrow('not in this scene')
  })

  it('moves tags to a renamed element, merges and deletes elements', async () => {
    const [a, b] = await createBreakdownTags([
      { scriptVersionId: 'v1', sceneId: 's1', category: 'animals_children', range: rangeOf('pg1', V1, 'dog'), text: 'dog' },
      { scriptVersionId: 'v1', sceneId: 's1', category: 'animals_children', range: rangeOf('pg1', V1, 'Mary'), text: 'Mary' },
    ])
    const terrier = await moveBreakdownTagToNewElement(a!.tagId, 'Terrier')
    await mergeBreakdownElements([b!.elementId], terrier)
    const tags = await listBreakdownTagsByScriptVersion('v1')
    expect(new Set(tags.map((t) => t.element_id))).toEqual(new Set([terrier]))
    await deleteBreakdownElement(terrier)
    expect(await listBreakdownTagsByScriptVersion('v1')).toEqual([])
  })

  it('carries tags to a new draft once, recording what moved or was cut', async () => {
    const raw = await seed()
    await createBreakdownTags([
      { scriptVersionId: 'v1', sceneId: 's1', category: 'props', range: rangeOf('pg1', V1, 'red umbrella'), text: 'red umbrella' },
      { scriptVersionId: 'v1', sceneId: 's1', category: 'animals_children', range: rangeOf('pg1', V1, 'dog'), text: 'dog' },
    ])
    raw.exec(`
      INSERT INTO script_versions (id, production_id, title, is_locked, previous_script_version_id, created_at, updated_at) VALUES ('v2', 'p1', 'Blue', 0, 'v1', '2026-02-01', '2026-02-01');
      INSERT INTO script_pages (id, script_version_id, scene_id, page_number, page_index, content, eighths, created_at, updated_at)
        VALUES ('pg1b', 'v2', 's1', '1', 0, '${V2}', 4, 't', 't');
    `)
    expect(await carryBreakdownTagsForward('v2')).toEqual({ carried: 0, moved: 1, unmatched: 1 })
    expect(await carryBreakdownTagsForward('v2')).toEqual({ carried: 0, moved: 0, unmatched: 0 })

    const carried = await listBreakdownTagsByScriptVersion('v2')
    expect(carried).toHaveLength(1)
    expect(carried[0]).toMatchObject({ tagged_text: 'red umbrella', start_page_id: 'pg1b' })
    expect(V2.slice(carried[0]!.start_offset, carried[0]!.end_offset)).toBe('red umbrella')

    const review = await listBreakdownRevisionReview('v2')
    expect(review.map((r) => [r.outcome, r.elementName]).sort()).toEqual([
      ['moved', 'red umbrella'],
      ['unmatched', 'dog'],
    ])
  })
})
