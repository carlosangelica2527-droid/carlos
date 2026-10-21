import type { Env } from './auth'
import { SCHEMA_STATEMENTS, DEMO_SEED_STATEMENTS } from './embedded'
import { hashPassword } from './auth'

let schemaReady = false

/**
 * Columnas añadidas después del esquema inicial.
 * Se aplican con ALTER TABLE solo si faltan, así una base ya creada
 * (por ejemplo en producción) se actualiza sin CLI ni migraciones manuales.
 */
const COLUMN_UPGRADES: { table: string; column: string; ddl: string }[] = [
  { table: 'documents', column: 'r2_key', ddl: 'ALTER TABLE documents ADD COLUMN r2_key TEXT' },
  { table: 'documents', column: 'parse_note', ddl: 'ALTER TABLE documents ADD COLUMN parse_note TEXT' },
  { table: 'assessments', column: 'workbook_ref', ddl: 'ALTER TABLE assessments ADD COLUMN workbook_ref TEXT' }
]

async function applyColumnUpgrades(env: Env): Promise<void> {
  for (const up of COLUMN_UPGRADES) {
    try {
      const info = await env.DB.prepare(`PRAGMA table_info(${up.table})`).all<any>()
      const cols = (info.results || []).map((r: any) => String(r.name))
      if (!cols.length) continue
      if (!cols.includes(up.column)) await env.DB.prepare(up.ddl).run()
    } catch (e) {
      /* Si la tabla aún no existe, el esquema base la creará con la columna. */
    }
  }
}

/**
 * Inicializa el esquema en la base D1 si aún no existe y aplica
 * las columnas nuevas sobre bases ya existentes.
 * Es idempotente y se ejecuta una sola vez por isolate.
 * Motivo: el despliegue no debe depender de permisos de CLI sobre D1.
 */
export async function ensureSchema(env: Env): Promise<void> {
  if (schemaReady) return
  const row = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  ).first()
  if (!row) {
    await env.DB.batch(SCHEMA_STATEMENTS.map((sql) => env.DB.prepare(sql)))
  }
  await applyColumnUpgrades(env)
  schemaReady = true
}

export async function isFreshDatabase(env: Env): Promise<boolean> {
  await ensureSchema(env)
  const orgs = await env.DB.prepare('SELECT COUNT(*) AS n FROM organizations').first<any>()
  const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<any>()
  return (orgs?.n ?? 0) === 0 && (users?.n ?? 0) === 0
}

/** Carga los datos ficticios de demostración. Solo sobre una base vacía. */
export async function loadDemoData(env: Env): Promise<{ statements: number }> {
  if (!(await isFreshDatabase(env))) {
    throw new Error('La base ya tiene datos. La carga de demostración solo se permite en una base vacía.')
  }
  // D1 limita el tamaño de un batch: se ejecuta por bloques.
  const CHUNK = 40
  for (let i = 0; i < DEMO_SEED_STATEMENTS.length; i += CHUNK) {
    const block = DEMO_SEED_STATEMENTS.slice(i, i + CHUNK)
    await env.DB.batch(block.map((sql) => env.DB.prepare(sql)))
  }
  return { statements: DEMO_SEED_STATEMENTS.length }
}

/** Crea la organización y el primer administrador en una base vacía. */
export async function bootstrapOrganization(
  env: Env,
  input: { orgName: string; country?: string; timezone?: string; adminName: string; adminEmail: string; password: string }
): Promise<{ orgId: number; userId: number }> {
  if (!(await isFreshDatabase(env))) {
    throw new Error('La base ya está inicializada. Usa Configuración → Usuarios para agregar personas.')
  }
  const org = await env.DB.prepare(
    "INSERT INTO organizations (name, country, timezone, currency) VALUES (?, ?, ?, 'USD')"
  ).bind(input.orgName, (input.country || 'EC').toUpperCase(), input.timezone || 'America/Guayaquil').run()
  const orgId = Number(org.meta.last_row_id)
  const { hash, salt } = await hashPassword(input.password)
  const user = await env.DB.prepare(
    'INSERT INTO users (org_id, email, name, role, password_hash, password_salt) VALUES (?,?,?,?,?,?)'
  ).bind(orgId, input.adminEmail.toLowerCase(), input.adminName, 'admin', hash, salt).run()
  return { orgId, userId: Number(user.meta.last_row_id) }
}
