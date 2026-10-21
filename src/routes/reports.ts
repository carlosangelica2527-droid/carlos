import { Hono } from 'hono'
import { type Env, type SessionUser, requireAuth, requirePermission } from '../lib/auth'
import { toCsv, audit } from '../lib/util'

const r = new Hono<{ Bindings: Env }>()

r.get('/reports/overview', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const db = c.env.DB
  const org = user.org_id

  const jobs = await db.prepare(
    `SELECT status, COUNT(*) AS n FROM jobs WHERE org_id = ? GROUP BY status`
  ).bind(org).all<any>()
  const apps = await db.prepare(
    `SELECT status, COUNT(*) AS n FROM applications WHERE org_id = ? GROUP BY status`
  ).bind(org).all<any>()
  const stages = await db.prepare(
    `SELECT s.name, s.position, COUNT(a.id) AS n
     FROM job_stages s LEFT JOIN applications a ON a.stage_id = s.id
     JOIN jobs j ON j.id = s.job_id
     WHERE s.org_id = ? AND j.status != 'archived'
     GROUP BY s.name, s.position ORDER BY s.position`
  ).bind(org).all<any>()
  const stale = await db.prepare(
    `SELECT COUNT(*) AS n FROM applications
     WHERE org_id = ? AND status = 'active'
     AND julianday('now') - julianday(last_activity_at) > 7`
  ).bind(org).first<any>()
  const upcoming = await db.prepare(
    `SELECT i.id, i.scheduled_at, c.full_name, j.title AS job_title
     FROM interviews i JOIN candidates c ON c.id = i.candidate_id JOIN jobs j ON j.id = i.job_id
     WHERE i.org_id = ? AND i.status = 'scheduled' AND i.scheduled_at >= datetime('now')
     ORDER BY i.scheduled_at ASC LIMIT 5`
  ).bind(org).all()
  const pendingReviews = await db.prepare(
    `SELECT COUNT(*) AS n FROM attempts WHERE org_id = ? AND status = 'review_required'`
  ).bind(org).first<any>()
  const historical = await db.prepare(
    `SELECT COUNT(*) AS n FROM recommendations WHERE org_id = ?`
  ).bind(org).first<any>()
  const consent = await db.prepare(
    `SELECT consent_status, COUNT(*) AS n FROM candidates WHERE org_id = ? GROUP BY consent_status`
  ).bind(org).all<any>()
  const openPrivacy = await db.prepare(
    `SELECT COUNT(*) AS n FROM retention_requests WHERE org_id = ? AND status IN ('open','in_progress')`
  ).bind(org).first<any>()
  const sources = await db.prepare(
    `SELECT COALESCE(c.source,'sin fuente') AS source, COUNT(*) AS n FROM candidates c WHERE c.org_id = ? GROUP BY c.source ORDER BY n DESC LIMIT 8`
  ).bind(org).all<any>()

  const totalJobs = (jobs.results as any[]).reduce((s, x) => s + x.n, 0)
  const activeJobs = (jobs.results as any[]).find((x) => x.status === 'published')?.n ?? 0

  return c.json({
    jobs: { total: totalJobs, active: activeJobs, by_status: jobs.results },
    applications: { by_status: apps.results, total: (apps.results as any[]).reduce((s, x) => s + x.n, 0) },
    funnel: stages.results,
    stale_applications: stale?.n ?? 0,
    upcoming_interviews: upcoming.results,
    pending_reviews: pendingReviews?.n ?? 0,
    recommendations_total: historical?.n ?? 0,
    consent: consent.results,
    open_privacy_requests: openPrivacy?.n ?? 0,
    sources: sources.results,
    definitions: {
      estancado: 'Postulación activa sin actividad registrada por más de 7 días.',
      tiempo_de_contratacion: 'Días entre la publicación de la vacante y el cambio a etapa "Contratado". Se calcula solo con vacantes que tienen una contratación registrada.'
    }
  })
})

r.get('/reports/time-to-hire', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const rows = await c.env.DB.prepare(
    `SELECT j.id, j.title AS job_title, j.opened_at,
       MIN(a.updated_at) AS hired_at,
       CAST(julianday(MIN(a.updated_at)) - julianday(COALESCE(j.opened_at, j.created_at)) AS INTEGER) AS days_to_fill
     FROM jobs j JOIN applications a ON a.job_id = j.id
     WHERE j.org_id = ? AND a.status = 'hired' AND j.opened_at IS NOT NULL
     GROUP BY j.id ORDER BY days_to_fill ASC`
  ).bind(user.org_id).all<any>()
  const values = rows.results.map((x: any) => x.days_to_fill).filter((v: any) => typeof v === 'number')
  const avg = values.length ? Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length) : null
  return c.json({
    items: rows.results,
    sample_size: values.length,
    average_days: avg,
    warning: values.length < 3
      ? 'Muestra insuficiente (menos de 3 vacantes cubiertas): no es posible extraer conclusiones.'
      : null,
    definition: 'Días entre la publicación y la contratación. Solo incluye vacantes con contratación registrada.'
  })
})

r.get('/reports/tests', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const rows = await c.env.DB.prepare(
    `SELECT a.title, a.type, COUNT(t.id) AS attempts,
      ROUND(AVG(COALESCE(t.final_score, t.auto_score)), 1) AS avg_score,
      ROUND(MIN(COALESCE(t.final_score, t.auto_score)), 1) AS min_score,
      ROUND(MAX(COALESCE(t.final_score, t.auto_score)), 1) AS max_score
     FROM assessments a LEFT JOIN attempts t ON t.assessment_id = a.id AND t.org_id = a.org_id
     WHERE a.org_id = ? GROUP BY a.id ORDER BY attempts DESC`
  ).bind(user.org_id).all<any>()
  return c.json({ items: rows.results, warning: (rows.results as any[]).some((x) => x.attempts > 0 && x.attempts < 3) ? 'Algunas pruebas tienen menos de 3 intentos: interpreta con cautela.' : null })
})

r.get('/reports/rejections', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const rows = await c.env.DB.prepare(
    `SELECT COALESCE(rejection_reason,'sin motivo registrado') AS reason, COUNT(*) AS n
     FROM applications WHERE org_id = ? AND status = 'rejected' GROUP BY rejection_reason ORDER BY n DESC`
  ).bind(user.org_id).all()
  return c.json({ items: rows.results, note: 'Datos agregados. El detalle individual requiere permiso sobre el candidato y uso responsable.' })
})

r.get('/reports/export.csv', requireAuth, requirePermission('reports:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const what = c.req.query('what') ?? 'applications'
  let rows: any[] = []
  if (what === 'jobs') {
    rows = (await c.env.DB.prepare(
      `SELECT id, title, area, location, modality, status, created_at, opened_at FROM jobs WHERE org_id = ? ORDER BY id DESC`
    ).bind(user.org_id).all<any>()).results
  } else if (what === 'rejections') {
    rows = (await c.env.DB.prepare(
      `SELECT a.id, j.title AS job_title, COALESCE(a.rejection_reason,'') AS reason, a.updated_at
       FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.org_id = ? AND a.status = 'rejected' ORDER BY a.id DESC`
    ).bind(user.org_id).all<any>()).results
  } else {
    rows = (await c.env.DB.prepare(
      `SELECT a.id, j.title AS job_title, c.full_name, a.status, s.name AS stage, a.source, a.applied_at, a.last_activity_at
       FROM applications a JOIN jobs j ON j.id = a.job_id JOIN candidates c ON c.id = a.candidate_id
       LEFT JOIN job_stages s ON s.id = a.stage_id
       WHERE a.org_id = ? ORDER BY a.id DESC LIMIT 5000`
    ).bind(user.org_id).all<any>()).results
  }
  await audit(c.env.DB, user, 'report_export', 'reports', null, { what, rows: rows.length })
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="quipu-${what}.csv"`)
  return c.body(toCsv(rows))
})

export default r
