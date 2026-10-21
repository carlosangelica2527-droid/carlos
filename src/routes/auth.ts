import { Hono } from 'hono'
import {
  type Env, type SessionUser, hashPassword, verifyPassword, createSession,
  setSessionCookie, clearSessionCookie, userFromRequest, requireAuth, requirePermission, can
} from '../lib/auth'
import { audit, jsonError, cleanStr, isEmail, intOrNull, parseJson, normName, normPhone } from '../lib/util'
import { DEFAULT_STAGES } from '../lib/util'

const r = new Hono<{ Bindings: Env }>()

/* ---------------------------- AUTH ---------------------------- */

r.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const email = cleanStr(body?.email, 160).toLowerCase()
  const password = cleanStr(body?.password, 200)
  if (!email || !password) return jsonError(c, 400, 'Correo y contraseña son obligatorios', 'validation')

  const user = await c.env.DB.prepare(
    'SELECT id, org_id, email, name, role, password_hash, password_salt, status FROM users WHERE email = ?'
  ).bind(email).first<any>()

  if (!user) return jsonError(c, 401, 'Credenciales inválidas', 'unauthorized')
  if (user.status !== 'active') return jsonError(c, 403, 'Usuario inactivo', 'forbidden')

  const ok = await verifyPassword(password, user.password_hash, user.password_salt)
  if (!ok) {
    await audit(c.env.DB, null, 'login_failed', 'users', user.id, { email })
    return jsonError(c, 401, 'Credenciales inválidas', 'unauthorized')
  }

  const sessionUser: SessionUser = { id: user.id, org_id: user.org_id, email: user.email, name: user.name, role: user.role }
  const token = await createSession(c.env.DB, sessionUser)
  setSessionCookie(c, token)
  await audit(c.env.DB, sessionUser, 'login', 'users', user.id, {})
  return c.json({ user: sessionUser, token })
})

r.post('/auth/logout', async (c) => {
  clearSessionCookie(c)
  return c.json({ ok: true })
})

r.get('/auth/me', async (c) => {
  const user = await userFromRequest(c)
  if (!user) return jsonError(c, 401, 'No autenticado', 'unauthorized')
  const org = await c.env.DB.prepare('SELECT id, name, country, timezone, currency FROM organizations WHERE id = ?')
    .bind(user.org_id).first()
  return c.json({ user, org, permissions: can(user.role, '*') ? ['*'] : undefined })
})

/* ------------------------- ORGANIZATION ------------------------ */

r.get('/org', requireAuth, async (c) => {
  const user = c.get('user')
  const org = await c.env.DB.prepare('SELECT * FROM organizations WHERE id = ?').bind(user.org_id).first()
  return c.json(org)
})

r.patch('/org', requireAuth, requirePermission('jobs:write'), async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return jsonError(c, 403, 'Solo el administrador puede cambiar la organización', 'forbidden')
  const b = await c.req.json().catch(() => ({} as any))
  const name = cleanStr(b?.name, 160)
  if (!name) return jsonError(c, 400, 'El nombre es obligatorio', 'validation')
  await c.env.DB.prepare('UPDATE organizations SET name = ?, country = ?, timezone = ?, currency = ? WHERE id = ?')
    .bind(name, cleanStr(b?.country, 3) || 'EC', cleanStr(b?.timezone, 60) || 'America/Guayaquil', cleanStr(b?.currency, 5) || 'USD', user.org_id).run()
  await audit(c.env.DB, user, 'org_update', 'organizations', user.org_id, { name })
  return c.json({ ok: true })
})

/* ----------------------------- USERS --------------------------- */

r.get('/users', requireAuth, async (c) => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(
    'SELECT id, email, name, role, status, last_login_at, created_at FROM users WHERE org_id = ? ORDER BY name'
  ).bind(user.org_id).all()
  return c.json(rows.results)
})

r.post('/users', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return jsonError(c, 403, 'Solo un administrador puede crear usuarios', 'forbidden')
  const b = await c.req.json().catch(() => ({} as any))
  const name = cleanStr(b?.name, 120)
  const email = cleanStr(b?.email, 160).toLowerCase()
  const role = cleanStr(b?.role, 30)
  const password = cleanStr(b?.password, 200)
  const validRoles = ['admin', 'recruiter', 'hiring_manager', 'assessor', 'auditor']
  if (!name || !isEmail(email) || !validRoles.includes(role)) return jsonError(c, 400, 'Datos inválidos: nombre, correo y rol son obligatorios', 'validation')
  if (password.length < 8) return jsonError(c, 400, 'La contraseña debe tener al menos 8 caracteres', 'validation')

  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(user.org_id, email).first()
  if (exists) return jsonError(c, 409, 'Ya existe un usuario con ese correo en la organización', 'conflict')

  const { hash, salt } = await hashPassword(password)
  const res = await c.env.DB.prepare(
    'INSERT INTO users (org_id, email, name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(user.org_id, email, name, role, hash, salt).run()
  await audit(c.env.DB, user, 'user_create', 'users', res.meta.last_row_id, { email, role })
  return c.json({ id: res.meta.last_row_id }, 201)
})

r.patch('/users/:id', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return jsonError(c, 403, 'Solo un administrador puede editar usuarios', 'forbidden')
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const b = await c.req.json().catch(() => ({} as any))
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!target) return jsonError(c, 404, 'Usuario no encontrado', 'not_found')

  const fields: string[] = []
  const vals: unknown[] = []
  if (b?.name !== undefined) { fields.push('name = ?'); vals.push(cleanStr(b.name, 120)) }
  if (b?.role !== undefined) {
    const validRoles = ['admin', 'recruiter', 'hiring_manager', 'assessor', 'auditor']
    if (!validRoles.includes(b.role)) return jsonError(c, 400, 'Rol inválido', 'validation')
    fields.push('role = ?'); vals.push(b.role)
  }
  if (b?.status !== undefined) { fields.push('status = ?'); vals.push(b.status === 'inactive' ? 'inactive' : 'active') }
  if (b?.password) {
    if (String(b.password).length < 8) return jsonError(c, 400, 'La contraseña debe tener al menos 8 caracteres', 'validation')
    const { hash, salt } = await hashPassword(String(b.password))
    fields.push('password_hash = ?', 'password_salt = ?'); vals.push(hash, salt)
  }
  if (!fields.length) return jsonError(c, 400, 'Nada que actualizar', 'validation')
  vals.push(id, user.org_id)
  await c.env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).bind(...vals).run()
  await audit(c.env.DB, user, 'user_update', 'users', id, { fields: fields.map((f) => f.split(' ')[0]) })
  return c.json({ ok: true })
})

export default r
