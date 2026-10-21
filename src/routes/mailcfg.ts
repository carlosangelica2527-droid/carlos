/**
 * Conexión del correo propio de la empresa.
 * El administrador pega su API key de Resend y el remitente; se guarda en
 * organizations.settings.email y se usa de inmediato, sin redeploy.
 */
import { Hono } from 'hono'
import { type Env, type SessionUser, requireAuth, requirePermission } from '../lib/auth'
import { audit, jsonError, cleanStr, isEmail } from '../lib/util'
import { getEmailConfig, sendEmail } from '../lib/mail'

const m = new Hono<{ Bindings: Env }>()

async function readSettings(db: D1Database, orgId: number): Promise<any> {
  const row = await db.prepare('SELECT settings FROM organizations WHERE id = ?').bind(orgId).first<any>()
  try { return JSON.parse(row?.settings || '{}') } catch { return {} }
}

async function writeSettings(db: D1Database, orgId: number, settings: any) {
  await db.prepare('UPDATE organizations SET settings = ? WHERE id = ?').bind(JSON.stringify(settings), orgId).run()
}

/** Estado de la conexión (nunca devuelve la clave completa). */
m.get('/settings/email', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const s = await readSettings(c.env.DB, user.org_id)
  const cfg = s.email || {}
  const key: string = cfg.api_key || ''
  const envKey = !!(c.env as any).RESEND_API_KEY
  return c.json({
    configured: !!(key && cfg.from_email) || envKey,
    source: key ? 'organizacion' : envKey ? 'entorno' : 'ninguno',
    provider: 'resend',
    from_email: cfg.from_email || '',
    from_name: cfg.from_name || '',
    reply_to: cfg.reply_to || '',
    key_hint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : '',
    docs_url: 'https://resend.com/api-keys',
    steps: [
      'Crea una cuenta gratuita en resend.com',
      'Verifica un dominio propio (o usa onboarding@resend.dev para pruebas)',
      'Genera una API Key con permiso de envío',
      'Pega aquí la clave y el remitente, y envía un correo de prueba'
    ]
  })
})

m.put('/settings/email', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  if (user.role !== 'admin') return jsonError(c, 403, 'Solo el administrador puede conectar el correo', 'forbidden')
  const b = await c.req.json().catch(() => ({} as any))

  const fromEmail = cleanStr(b?.from_email, 160).toLowerCase()
  const fromName = cleanStr(b?.from_name, 120)
  const replyTo = cleanStr(b?.reply_to, 160).toLowerCase()
  const apiKey = cleanStr(b?.api_key, 200)

  if (!fromEmail || !isEmail(fromEmail)) return jsonError(c, 400, 'Indica un correo remitente válido', 'validation')
  if (replyTo && !isEmail(replyTo)) return jsonError(c, 400, 'El correo de respuesta no es válido', 'validation')

  const s = await readSettings(c.env.DB, user.org_id)
  const prev = s.email || {}
  const key = apiKey || prev.api_key
  if (!key) return jsonError(c, 400, 'Falta la API key del proveedor de correo', 'validation')

  s.email = { provider: 'resend', api_key: key, from_email: fromEmail, from_name: fromName, reply_to: replyTo }
  await writeSettings(c.env.DB, user.org_id, s)
  await audit(c.env.DB, user, 'email_config_update', 'organizations', user.org_id, { from_email: fromEmail })
  return c.json({ ok: true, configured: true, from_email: fromEmail })
})

m.delete('/settings/email', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  if (user.role !== 'admin') return jsonError(c, 403, 'Solo el administrador', 'forbidden')
  const s = await readSettings(c.env.DB, user.org_id)
  delete s.email
  await writeSettings(c.env.DB, user.org_id, s)
  await audit(c.env.DB, user, 'email_config_remove', 'organizations', user.org_id, {})
  return c.json({ ok: true, configured: false })
})

/** Prueba real de envío: confirma que la clave y el remitente funcionan. */
m.post('/settings/email/test', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const to = cleanStr(b?.to, 160).toLowerCase() || user.email
  if (!isEmail(to)) return jsonError(c, 400, 'Correo de destino inválido', 'validation')

  const cfg = await getEmailConfig(c.env, user.org_id)
  if (!cfg) return jsonError(c, 400, 'El correo aún no está configurado', 'not_configured')

  const res = await sendEmail(
    c.env, cfg, to,
    'Prueba de conexión · QUIPU',
    `Este es un correo de prueba enviado desde QUIPU.\n\nSi lo recibes, el envío de correos ya funciona y podrás invitar a los postulantes a sus pruebas.\n\nRemitente: ${cfg.from_email}`
  )
  await audit(c.env.DB, user, 'email_test', 'organizations', user.org_id, { to, ok: res.ok })
  if (!res.ok) return c.json({ ok: false, error: res.error || 'El proveedor rechazó el envío' }, 400)
  return c.json({ ok: true, to, provider: res.provider })
})

export default m
