import type { Context } from 'hono'
import type { Env, SessionUser } from './auth'

export function jsonError(c: Context, status: number, message: string, code = 'error', extra: Record<string, unknown> = {}) {
  return c.json({ error: message, code, ...extra }, status as any)
}

export async function audit(
  db: D1Database,
  user: SessionUser | null,
  action: string,
  entity: string,
  entityId: string | number | null,
  meta: Record<string, unknown> = {},
  result = 'ok'
) {
  await db.prepare(
    `INSERT INTO audit_log (org_id, actor_id, actor_email, action, entity, entity_id, result, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user?.org_id ?? 0,
    user?.id ?? null,
    user?.email ?? 'sistema',
    action,
    entity,
    entityId === null ? null : String(entityId),
    result,
    JSON.stringify(meta)
  ).run()
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

export function cleanStr(v: unknown, max = 500): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

export function intOrNull(v: unknown): number | null {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : null
}

/** Normaliza para detección de duplicados. */
export function normName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normPhone(phone?: string | null): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  return digits.length > 9 ? digits.slice(-9) : digits
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return ''
  const cols = columns ?? Object.keys(rows[0])
  const head = cols.join(',')
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')).join('\n')
  return `${head}\n${body}`
}

export const STAGE_COLORS: Record<string, string> = {
  nueva_postulacion: 'blue',
  revision: 'indigo',
  evaluacion_inicial: 'violet',
  prueba_tecnica: 'amber',
  entrevista: 'cyan',
  referencias: 'teal',
  oferta: 'green',
  contratado: 'emerald',
  reserva: 'slate',
  descartado: 'rose'
}

export const DEFAULT_STAGES = [
  { name: 'Nueva postulación', kind: 'normal' },
  { name: 'Revisión', kind: 'normal' },
  { name: 'Evaluación inicial', kind: 'normal' },
  { name: 'Prueba técnica', kind: 'normal' },
  { name: 'Entrevista', kind: 'normal' },
  { name: 'Referencias', kind: 'normal' },
  { name: 'Oferta', kind: 'normal' },
  { name: 'Contratado', kind: 'hired' },
  { name: 'Reserva (talento)', kind: 'talent_pool' },
  { name: 'Descartado', kind: 'rejected' }
]

export const REJECTION_REASONS = [
  'No cumple requisitos excluyentes',
  'Experiencia insuficiente',
  'Brecha técnica',
  'Expectativa salarial fuera de rango',
  'No se presentó al proceso',
  'Vacante cerrada o cancelada',
  'Retiro voluntario',
  'Otro'
]

/** Verifica pertenencia a la organización (defensa en profundidad además del WHERE). */
export async function belongsToOrg(db: D1Database, table: string, id: number, orgId: number): Promise<boolean> {
  const allowed = ['jobs', 'candidates', 'applications', 'assessments', 'interviews', 'attempts', 'notes', 'documents', 'communications', 'retention_requests']
  if (!allowed.includes(table)) throw new Error('tabla no permitida')
  const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND org_id = ?`).bind(id, orgId).first()
  return !!row
}
