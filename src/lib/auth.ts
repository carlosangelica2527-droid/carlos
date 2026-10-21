import type { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

export type Role = 'admin' | 'recruiter' | 'hiring_manager' | 'assessor' | 'auditor'

export interface SessionUser {
  id: number
  org_id: number
  email: string
  name: string
  role: Role
}

export interface Env {
  DB: D1Database
  AI?: { run: (model: string, input: unknown) => Promise<unknown> }
  OPENAI_API_KEY?: string
  RESEND_API_KEY?: string
  R2?: R2Bucket
}

export type AppContext = Context<{ Bindings: Env; Variables: { user: SessionUser } }>

const ITERATIONS = 100_000
const COOKIE = 'quipu_session'

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256
  )
  return toHex(bits)
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomHex(16)
  const hash = await pbkdf2(password, salt)
  return { hash, salt }
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const candidate = await pbkdf2(password, salt)
  // comparación en tiempo constante
  if (candidate.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}

export async function createSession(db: D1Database, user: SessionUser): Promise<string> {
  const token = randomHex(32)
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()
  await db.prepare('INSERT INTO sessions (token, user_id, org_id, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, user.id, user.org_id, expires).run()
  await db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run()
  return token
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    secure: new URL(c.req.url).protocol === 'https:'
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' })
}

export async function userFromRequest(c: Context<{ Bindings: Env }>): Promise<SessionUser | null> {
  const token = getCookie(c, COOKIE) || c.req.header('x-quipu-token')
  if (!token) return null
  const row = await c.env.DB.prepare(
    `SELECT s.token, s.expires_at, u.id, u.org_id, u.email, u.name, u.role, u.status
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
  ).bind(token).first<any>()
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
    return null
  }
  if (row.status !== 'active') return null
  return { id: row.id, org_id: row.org_id, email: row.email, name: row.name, role: row.role }
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ['*'],
  recruiter: [
    'jobs:write', 'jobs:read', 'candidates:write', 'candidates:read', 'applications:write',
    'applications:read', 'assessments:read', 'assessments:write', 'interviews:write',
    'interviews:read', 'memory:read', 'reports:read', 'notes:write', 'comms:write',
    'privacy:write', 'documents:write'
  ],
  hiring_manager: [
    'jobs:read', 'candidates:read', 'applications:read', 'interviews:read', 'interviews:write',
    'assessments:read', 'reports:read', 'notes:write'
  ],
  assessor: ['assessments:read', 'assessments:write', 'candidates:read', 'applications:read'],
  auditor: ['jobs:read', 'candidates:read', 'applications:read', 'reports:read', 'audit:read']
}

export function can(role: Role, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] || []
  return perms.includes('*') || perms.includes(permission)
}

/** Middleware: exige sesión válida. */
export async function requireAuth(c: any, next: Next) {
  const user = await userFromRequest(c)
  if (!user) return c.json({ error: 'No autenticado', code: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
}

/** Middleware factory: exige permiso por rol. */
export function requirePermission(permission: string) {
  return async (c: any, next: Next) => {
    const user: SessionUser | undefined = c.get('user')
    if (!user) return c.json({ error: 'No autenticado', code: 'unauthorized' }, 401)
    if (!can(user.role, permission)) {
      return c.json({ error: 'Tu rol no permite esta acción', code: 'forbidden' }, 403)
    }
    await next()
  }
}
