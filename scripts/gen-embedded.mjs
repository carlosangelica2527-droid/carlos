#!/usr/bin/env node
/**
 * Genera src/lib/embedded.ts con:
 *  - SCHEMA_STATEMENTS: sentencias idempotentes del esquema (desde migrations/*.sql)
 *  - DEMO_SEED_STATEMENTS: datos ficticios de demostración (desde seed.generated.sql)
 *
 * Esto permite que el Worker inicialice su propio esquema cuando la base está vacía,
 * sin depender de la CLI de wrangler ni de permisos de D1 en el token.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function splitSql(sql) {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
}

const migDir = join(root, 'migrations')
const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
let schema = []
for (const f of files) schema = schema.concat(splitSql(readFileSync(join(migDir, f), 'utf8')))

const seedPath = join(root, 'seed.generated.sql')
const seed = existsSync(seedPath) ? splitSql(readFileSync(seedPath, 'utf8')) : []

const out = `/* GENERADO AUTOMÁTICAMENTE por scripts/gen-embedded.mjs — no editar a mano. */
export const SCHEMA_STATEMENTS: string[] = ${JSON.stringify(schema, null, 2)}

export const DEMO_SEED_STATEMENTS: string[] = ${JSON.stringify(seed, null, 2)}
`
writeFileSync(join(root, 'src', 'lib', 'embedded.ts'), out)
console.log(`embedded.ts: ${schema.length} sentencias de esquema, ${seed.length} de datos demo`)
