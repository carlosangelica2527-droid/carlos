import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './lib/auth'
import { ensureSchema, isFreshDatabase, loadDemoData, bootstrapOrganization } from './lib/db'
import authRoutes from './routes/auth'
import jobRoutes, { publicRouter } from './routes/jobs'
import candidateRoutes from './routes/candidates'
import applicationRoutes from './routes/applications'
import intelligenceRoutes from './routes/intelligence'
import assessmentRoutes from './routes/assessments'
import reportRoutes from './routes/reports'
import publicApplyRoutes from './routes/public'
import { publicJobsPage, publicJobPage, appShell } from './pages'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', cors({ origin: (o) => o ?? '*', credentials: true }))
app.use('/api/*', logger())

// Garantiza que el esquema exista antes de atender cualquier ruta de datos.
// Idempotente: solo crea tablas si la base está vacía.
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()
  try {
    await ensureSchema(c.env)
  } catch (e) {
    console.error('schema init failed', e)
    return c.json({
      error: 'No se pudo inicializar la base de datos',
      code: 'db_init_failed',
      detail: String((e as Error)?.message ?? e)
    }, 500)
  }
  await next()
})

app.get('/api/health', (c) => c.json({
  ok: true,
  service: 'quipu-ats',
  name: 'QUIPU · Memoria de Talento',
  version: '1.0.0',
  time: new Date().toISOString()
}))

/* ------------------- Preparación de la base ------------------- */

app.get('/api/setup/status', async (c) => {
  try {
    const fresh = await isFreshDatabase(c.env)
    return c.json({ initialized: !fresh, needs_setup: fresh })
  } catch (e) {
    return c.json({ initialized: false, needs_setup: true, detail: String((e as Error)?.message ?? e) })
  }
})

app.post('/api/setup/demo', async (c) => {
  try {
    const fresh = await isFreshDatabase(c.env)
    if (!fresh) return c.json({ error: 'La base ya tiene datos. Esta acción solo funciona en una base vacía.', code: 'not_empty' }, 409)
    const r = await loadDemoData(c.env)
    return c.json({ ok: true, statements: r.statements, accounts: ['admin@quipu.demo', 'reclutador@quipu.demo', 'auditor@quipu.demo'], password: 'Quipu2026!' })
  } catch (e) {
    return c.json({ error: 'No se pudieron cargar los datos de demostración', code: 'setup_failed', detail: String((e as Error)?.message ?? e) }, 500)
  }
})

app.post('/api/setup/bootstrap', async (c) => {
  const b = await c.req.json().catch(() => ({} as any))
  const orgName = String(b?.org_name ?? '').trim()
  const adminName = String(b?.admin_name ?? '').trim()
  const adminEmail = String(b?.admin_email ?? '').trim().toLowerCase()
  const password = String(b?.password ?? '')
  if (!orgName || !adminName || !adminEmail || !password) {
    return c.json({ error: 'Organización, nombre, correo y contraseña son obligatorios', code: 'validation' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adminEmail)) {
    return c.json({ error: 'Correo inválido', code: 'validation' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'La contraseña debe tener al menos 8 caracteres', code: 'validation' }, 400)
  }
  try {
    const r = await bootstrapOrganization(c.env, {
      orgName, adminName, adminEmail, password,
      country: b?.country, timezone: b?.timezone
    })
    return c.json({ ok: true, ...r }, 201)
  } catch (e) {
    return c.json({ error: String((e as Error)?.message ?? e), code: 'setup_failed' }, 409)
  }
})

app.route('/api', publicRouter)
app.route('/api', publicApplyRoutes)
app.route('/api', authRoutes)
app.route('/api', jobRoutes)
app.route('/api', candidateRoutes)
app.route('/api', applicationRoutes)
app.route('/api', intelligenceRoutes)
app.route('/api', assessmentRoutes)
app.route('/api', reportRoutes)

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Ruta no encontrada', code: 'not_found' }, 404)
  return c.html(appShell())
})

// Aplicación (SPA)
app.get('/', (c) => c.html(appShell()))
app.get('/app', (c) => c.html(appShell()))

app.onError((err, c) => {
  console.error('QUIPU error:', err)
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Error interno del servidor', code: 'internal', detail: String(err?.message ?? err) }, 500)
  }
  return c.text('Error interno', 500)
})

// Página pública de empleos
app.get('/empleos', (c) => c.html(publicJobsPage()))
app.get('/empleos/:slug', (c) => c.html(publicJobPage(c.req.param('slug'))))

export default app
