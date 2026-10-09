import type { TableRows } from '../lib/db'
import { makeIdFactory, type Row } from '../lib/util'

/** A file to bundle: becomes a `documents` row and bytes under attachments/<production>/. */
export type DocSpec = {
  id: string
  entity_type: string | null
  entity_id: string | null
  file_name: string
  mime_type: string
  bytes: Uint8Array
}

export const TS = '2026-09-14T09:00:00.000Z'
export const SLUG = 'demo-toothpick-manchester'
export const PRODUCTION_NAME = 'Demo: Toothpick (Manchester)'

export type Ctx = {
  ids: ReturnType<typeof makeIdFactory>
  pid: string
  ts: string
  tables: Required<{ [K in keyof TableRows]: Row[] }>
  docs: DocSpec[]
  /** Convenience lookups filled in as groups are built. */
  idOf: {
    person: (kind: 'crew' | 'cast', key: string) => string
    location: (key: string) => string
    vendor: (key: string) => string
    scene: (n: number) => string
    shot: (scene: number, n: number) => string
    unit: (u: 'main' | 'second') => string
    day: (n: number) => string
    dayUnit: (n: number, u: 'main' | 'second') => string
  }
}

export function createCtx(): Ctx {
  const ids = makeIdFactory()
  const tables = {} as Ctx['tables']
  return {
    ids,
    pid: ids('production', 'toothpick'),
    ts: TS,
    tables: new Proxy(tables, {
      get(target, prop: string) {
        if (!(prop in target)) (target as Record<string, Row[]>)[prop] = []
        return (target as Record<string, Row[]>)[prop]
      },
    }),
    docs: [],
    idOf: {
      person: (kind, key) => ids('person', `${kind}:${key}`),
      location: (key) => ids('location', key),
      vendor: (key) => ids('vendor', key),
      scene: (n) => ids('scene', n),
      shot: (scene, n) => ids('shot', `${scene}.${n}`),
      unit: (u) => ids('unit', u),
      day: (n) => ids('shootDay', n),
      dayUnit: (n, u) => ids('shootDayUnit', `${n}.${u}`),
    },
  }
}

export function add(ctx: Ctx, table: keyof TableRows, ...rows: Row[]): void {
  ;(ctx.tables as Record<string, Row[]>)[table]!.push(...rows)
}
