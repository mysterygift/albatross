import { join, resolve } from 'node:path'

/** Where the generated project is written (committed so it can be fetched from the branch). */
export const OUTPUT_DIR = resolve(__dirname, '../../../demo')
export const OUTPUT_FILE = join(OUTPUT_DIR, 'Toothpick-Manchester-Demo.apf')
