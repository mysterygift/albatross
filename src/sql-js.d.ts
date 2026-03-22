declare module 'sql.js' {
  export interface Statement {
    bind(values?: unknown[]): void
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }

  export interface Database {
    run(sql: string, params?: unknown[]): void
    exec(sql: string): unknown[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }

  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>
  export default initSqlJs
}
