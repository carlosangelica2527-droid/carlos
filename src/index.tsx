import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './lib/auth'
import authRoutes from './routes/auth'
import jobRoutes, { publicRouter } from './routes/jobs'
import candidateRoutes from './routes/candidates'
import applicationRoutes from './routes/applications'
import intelligenceRoutes from './routes/intelligence'
import assessmentRoutes from './routes/assessments'
import reportRoutes from './routes/reports'
import { publicJobsPage, publicJobPage, appShell } from './pages'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', cors({ origin: (o) => o ?? '*', credentials: true }))
app.use('/api/*', logger())

app.get('/api/health', (c) => c.json({
  ok: true,
  service: 'quipu-ats',
  name: 'QUIPU · Memoria de Talento',
  version: '1.0.0',
  time: new Date().toISOString()
}))

app.route('/api', publicRouter)
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
