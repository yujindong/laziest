import { copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

copyFileSync(resolve(rootDir, 'LICENSE'), resolve(process.cwd(), 'LICENSE'))
