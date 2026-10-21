import { Hono } from 'hono'
import { type Env, requireAuth, requirePermission } from '../lib/auth'
import { audit, jsonError, cleanStr, intOrNull, num, parseJson, DEFAULT_STAGES } from '../lib/util'

const r = new Hono<{ Bindings: Env }>()

const JOB_FIELDS = ['title', 'area', 'location', 'country', 'modality', 'workday', 'contract_type', 'seniority', 'description', 'responsibilities']

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function defaultStagesFor(db: D1Database, orgId: number, jobId: number) {
  const stmts = DEFAULT_STAGES.map((s, i) =>
    db.prepare('INSERT INTO job_stages (org_id, job_id, name, position, kind) VALUES (?, ?, ?, ?, ?)')
      .bind(orgId, jobId, s.name, i, s.kind)
  )
  await db.batch(stmts)
}

async function snapshotJob(db: D1Database, orgId: number, jobId: number, userId: number) {
  const job = await db.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').bind(jobId, orgId).first()
  const criteria = await db.prepare('SELECT * FROM job_criteria WHERE job_id = ? AND org_id = ?').bind(jobId, orgId).all()
  const stages = await db.prepare('SELECT * FROM job_stages WHERE job_id = ? ORDER BY position').bind(jobId).all()
  await db.prepare('INSERT INTO job_versions (org_id, job_id, snapshot, changed_by) VALUES (?, ?, ?, ?)')
    .bind(orgId, jobId, JSON.stringify({ job, criteria: criteria.results, stages: stages.results }), userId).run()
}

/* ----------------------------- LIST ---------------------------- */

r.get('/jobs', requireAuth, requirePermission('jobs:read'), async (c) => {
  const user = c.get('user')
  const status = c.req.query('status')
  const q = cleanStr(c.req.query('q'), 100)
  let sql = `SELECT j.*,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'active') AS active_candidates,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS total_candidates,
      (SELECT COUNT(*) FROM job_criteria k WHERE k.job_id = j.id AND k.kind = 'mandatory') AS mandatory_count,
      h.name AS hiring_manager_name, rc.name AS recruiter_name
    FROM jobs j
    LEFT JOIN users h ON h.id = j.hiring_manager_id
    LEFT JOIN users rc ON rc.id = j.recruiter_id
    WHERE j.org_id = ?`
  const params: unknown[] = [user.org_id]
  if (status && status !== 'all') { sql += ' AND j.status = ?'; params.push(status) }
  else if (!status) { sql += " AND j.status != 'archived'" }
  if (q) { sql += ' AND (j.title LIKE ? OR j.area LIKE ?)'; params.push(`%${q}%`, `%${q}%`) }
  sql += ' ORDER BY j.created_at DESC'
  const rows = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json(rows.results)
})

/* ---------------------------- DETAIL --------------------------- */

r.get('/jobs/:id', requireAuth, requirePermission('jobs:read'), async (c) => {
  const user = c.get('user')
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')

  const criteria = await c.env.DB.prepare('SELECT * FROM job_criteria WHERE job_id = ? AND org_id = ? ORDER BY kind DESC, weight DESC').bind(id, user.org_id).all()
  const stages = await c.env.DB.prepare('SELECT * FROM job_stages WHERE job_id = ? AND org_id = ? ORDER BY position').bind(id, user.org_id).all()
  const apps = await c.env.DB.prepare(
    `SELECT a.*, c.full_name, c.email, c.years_experience, s.name AS stage_name, s.kind AS stage_kind
     FROM applications a JOIN candidates c ON c.id = a.candidate_id
     LEFT JOIN job_stages s ON s.id = a.stage_id
     WHERE a.job_id = ? AND a.org_id = ? ORDER BY a.applied_at DESC`
  ).bind(id, user.org_id).all()

  return c.json({
    ...(job as any),
    criteria: (criteria.results as any[]).map((x) => ({ ...x, keywords: parseJson<string[]>(x.keywords, []) })),
    stages: stages.results,
    applications: apps.results
  })
})

/* ---------------------------- CREATE --------------------------- */

r.post('/jobs', requireAuth, requirePermission('jobs:write'), async (c) => {
  const user = c.get('user')
  const b = await c.req.json().catch(() => ({} as any))
  const title = cleanStr(b?.title, 160)
  if (!title) return jsonError(c, 400, 'El título de la vacante es obligatorio', 'validation')

  const modality = ['presencial', 'hibrido', 'remoto'].includes(b?.modality) ? b.modality : 'hibrido'
  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`

  const res = await c.env.DB.prepare(
    `INSERT INTO jobs (org_id, title, area, location, country, modality, workday, contract_type, seniority,
      salary_min, salary_max, description, responsibilities, status, public_slug, recruiter_id, hiring_manager_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    user.org_id, title,
    cleanStr(b?.area, 100) || null,
    cleanStr(b?.location, 120) || null,
    cleanStr(b?.country, 3) || 'EC',
    modality,
    cleanStr(b?.workday, 60) || 'jornada completa',
    cleanStr(b?.contract_type, 60) || 'indefinido',
    cleanStr(b?.seniority, 60) || null,
    b?.salary_min != null ? num(b.salary_min) : null,
    b?.salary_max != null ? num(b.salary_max) : null,
    cleanStr(b?.description, 4000) || null,
    cleanStr(b?.responsibilities, 4000) || null,
    'draft', slug,
    user.id,
    intOrNull(b?.hiring_manager_id)
  ).run()

  const jobId = Number(res.meta.last_row_id)
  await defaultStagesFor(c.env.DB, user.org_id, jobId)

  if (Array.isArray(b?.criteria)) {
    let weights = 0
    for (const k of b.criteria.slice(0, 25)) {
      const kind = k?.kind === 'mandatory' ? 'mandatory' : 'weighted'
      const weight = kind === 'weighted' ? Math.max(0, Math.min(100, Math.round(num(k?.weight)))) : 0
      if (kind === 'weighted') weights += weight
      await c.env.DB.prepare(
        'INSERT INTO job_criteria (org_id, job_id, kind, category, label, description, weight, keywords, min_years) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(
        user.org_id, jobId, kind,
        ['experience', 'technical', 'competency', 'education', 'other'].includes(k?.category) ? k.category : 'technical',
        cleanStr(k?.label, 160) || 'Criterio',
        cleanStr(k?.description, 500) || null,
        weight,
        JSON.stringify(Array.isArray(k?.keywords) ? k.keywords.map((x: any) => cleanStr(x, 60)).slice(0, 12) : []),
        k?.min_years != null ? num(k.min_years) : null
      ).run()
    }
  }

  await snapshotJob(c.env.DB, user.org_id, jobId, user.id)
  await audit(c.env.DB, user, 'job_create', 'jobs', jobId, { title })
  return c.json({ id: jobId, public_slug: slug }, 201)
})

/* ---------------------------- UPDATE --------------------------- */

r.patch('/jobs/:id', requireAuth, requirePermission('jobs:write'), async (c) => {
  const user = c.get('user')
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')

  const b = await c.req.json().catch(() => ({} as any))
  const sets: string[] = []
  const vals: unknown[] = []
  for (const f of JOB_FIELDS) {
    if (b?.[f] !== undefined) { sets.push(`${f} = ?`); vals.push(cleanStr(b[f], 4000) || null) }
  }
  if (b?.modality !== undefined && ['presencial', 'hibrido', 'remoto'].includes(b.modality)) { sets.push('modality = ?'); vals.push(b.modality) }
  if (b?.salary_min !== undefined) { sets.push('salary_min = ?'); vals.push(b.salary_min === null ? null : num(b.salary_min)) }
  if (b?.salary_max !== undefined) { sets.push('salary_max = ?'); vals.push(b.salary_max === null ? null : num(b.salary_max)) }
  if (b?.closes_at !== undefined) { sets.push('closes_at = ?'); vals.push(b.closes_at ? new Date(b.closes_at).toISOString() : null) }
  if (b?.hiring_manager_id !== undefined) { sets.push('hiring_manager_id = ?'); vals.push(intOrNull(b.hiring_manager_id)) }
  if (b?.recruiter_id !== undefined) { sets.push('recruiter_id = ?'); vals.push(intOrNull(b.recruiter_id)) }

  if (sets.length) {
    sets.push("updated_at = datetime('now')")
    vals.push(id, user.org_id)
    await c.env.DB.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).bind(...vals).run()
  }

  if (Array.isArray(b?.criteria)) {
    if (b.criteria.filter((k: any) => k?.kind !== 'mandatory').reduce((s: number, k: any) => s + Math.max(0, num(k?.weight)), 0) > 100) {
      return jsonError(c, 400, 'Los pesos ponderados no pueden superar 100 en total', 'validation')
    }
    await c.env.DB.prepare('DELETE FROM job_criteria WHERE job_id = ? AND org_id = ?').bind(id, user.org_id).run()
    for (const k of b.criteria.slice(0, 25)) {
      const kind = k?.kind === 'mandatory' ? 'mandatory' : 'weighted'
      await c.env.DB.prepare(
        'INSERT INTO job_criteria (org_id, job_id, kind, category, label, description, weight, keywords, min_years) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(
        user.org_id, id, kind,
        ['experience', 'technical', 'competency', 'education', 'other'].includes(k?.category) ? k.category : 'technical',
        cleanStr(k?.label, 160) || 'Criterio',
        cleanStr(k?.description, 500) || null,
        kind === 'weighted' ? Math.max(0, Math.min(100, Math.round(num(k?.weight)))) : 0,
        JSON.stringify(Array.isArray(k?.keywords) ? k.keywords.map((x: any) => cleanStr(x, 60)).slice(0, 12) : []),
        k?.min_years != null ? num(k.min_years) : null
      ).run()
    }
  }

  await snapshotJob(c.env.DB, user.org_id, id, user.id)
  await audit(c.env.DB, user, 'job_update', 'jobs', id, { fields: sets.length })
  return c.json({ ok: true })
})

/* ------------------------- STATUS ACTIONS ---------------------- */

r.post('/jobs/:id/status', requireAuth, requirePermission('jobs:write'), async (c) => {
  const user = c.get('user')
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const status = cleanStr(b?.status, 20)
  const allowed = ['draft', 'published', 'paused', 'closed', 'archived']
  if (!id || !allowed.includes(status)) return jsonError(c, 400, 'Estado inválido', 'validation')
  const job = await c.env.DB.prepare('SELECT id, status FROM jobs WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')

  if (status === 'published') {
    const c2 = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM job_criteria WHERE job_id = ? AND org_id = ?").bind(id, user.org_id).first<any>()
    if (!c2 || c2.n === 0) return jsonError(c, 400, 'No puedes publicar una vacante sin criterios de evaluación definidos. Agrega al menos uno.', 'validation')
    await c.env.DB.prepare("UPDATE jobs SET status = ?, opened_at = COALESCE(opened_at, datetime('now')), updated_at = datetime('now') WHERE id = ? AND org_id = ?")
      .bind(status, id, user.org_id).run()
  } else {
    await c.env.DB.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ? AND org_id = ?")
      .bind(status, id, user.org_id).run()
  }
  await audit(c.env.DB, user, 'job_status', 'jobs', id, { from: job.status, to: status })
  return c.json({ ok: true, status })
})

r.post('/jobs/:id/duplicate', requireAuth, requirePermission('jobs:write'), async (c) => {
  const user = c.get('user')
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')

  const res = await c.env.DB.prepare(
    `INSERT INTO jobs (org_id, title, area, location, country, modality, workday, contract_type, seniority,
      salary_min, salary_max, description, responsibilities, status, public_slug, recruiter_id, hiring_manager_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    user.org_id, `${job.title} (copia)`, job.area, job.location, job.country, job.modality,
    job.workday, job.contract_type, job.seniority, job.salary_min, job.salary_max,
    job.description, job.responsibilities, 'draft',
    `${slugify(job.title)}-${Math.random().toString(36).slice(2, 6)}`,
    user.id, job.hiring_manager_id
  ).run()
  const newId = Number(res.meta.last_row_id)

  const stages = await c.env.DB.prepare('SELECT name, position, kind FROM job_stages WHERE job_id = ? ORDER BY position').bind(id).all<any>()
  if (stages.results.length) {
    await c.env.DB.batch(stages.results.map((s) =>
      c.env.DB.prepare('INSERT INTO job_stages (org_id, job_id, name, position, kind) VALUES (?,?,?,?,?)')
        .bind(user.org_id, newId, s.name, s.position, s.kind)))
  } else {
    await defaultStagesFor(c.env.DB, user.org_id, newId)
  }

  const crit = await c.env.DB.prepare('SELECT * FROM job_criteria WHERE job_id = ? AND org_id = ?').bind(id, user.org_id).all<any>()
  if (crit.results.length) {
    await c.env.DB.batch(crit.results.map((k) =>
      c.env.DB.prepare('INSERT INTO job_criteria (org_id, job_id, kind, category, label, description, weight, keywords, min_years) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(user.org_id, newId, k.kind, k.category, k.label, k.description, k.weight, k.keywords, k.min_years)))
  }

  await audit(c.env.DB, user, 'job_duplicate', 'jobs', newId, { from: id })
  return c.json({ id: newId }, 201)
})

r.get('/jobs/:id/versions', requireAuth, requirePermission('jobs:read'), async (c) => {
  const user = c.get('user')
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const rows = await c.env.DB.prepare(
    `SELECT v.id, v.created_at, u.name AS changed_by_name FROM job_versions v
     LEFT JOIN users u ON u.id = v.changed_by
     WHERE v.job_id = ? AND v.org_id = ? ORDER BY v.id DESC LIMIT 50`
  ).bind(id, user.org_id).all()
  return c.json(rows.results)
})

r.delete('/jobs/:id', requireAuth, requirePermission('jobs:write'), async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return jsonError(c, 403, 'Solo un administrador puede archivar vacantes', 'forbidden')
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const apps = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM applications WHERE job_id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (apps && apps.n > 0) {
    await c.env.DB.prepare("UPDATE jobs SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND org_id = ?").bind(id, user.org_id).run()
    await audit(c.env.DB, user, 'job_archive', 'jobs', id, { reason: 'tiene postulaciones' })
    return c.json({ ok: true, archived: true, message: 'La vacante tiene postulaciones: se archivó en lugar de eliminarse.' })
  }
  await c.env.DB.prepare('DELETE FROM jobs WHERE id = ? AND org_id = ?').bind(id, user.org_id).run()
  await audit(c.env.DB, user, 'job_delete', 'jobs', id, {})
  return c.json({ ok: true, deleted: true })
})

/* --------------------------- STAGES ---------------------------- */

r.post('/jobs/:id/stages', requireAuth, requirePermission('jobs:write'), async (c) => {
  const user = c.get('user')
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const name = cleanStr(b?.name, 80)
  if (!id || !name) return jsonError(c, 400, 'Nombre de etapa obligatorio', 'validation')
  const job = await c.env.DB.prepare('SELECT id FROM jobs WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(position),0) AS p FROM job_stages WHERE job_id = ?').bind(id).first<any>()
  const res = await c.env.DB.prepare('INSERT INTO job_stages (org_id, job_id, name, position, kind) VALUES (?,?,?,?,?)')
    .bind(user.org_id, id, name, (max?.p ?? 0) + 1, 'normal').run()
  await audit(c.env.DB, user, 'stage_create', 'job_stages', res.meta.last_row_id, { job_id: id, name })
  return c.json({ id: res.meta.last_row_id }, 201)
})

/* ----------------------- PUBLIC JOB BOARD ---------------------- */

const publicRouter = new Hono<{ Bindings: Env }>()

publicRouter.get('/public/jobs', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT j.id, j.title, j.area, j.location, j.modality, j.workday, j.contract_type, j.seniority,
            j.salary_min, j.salary_max, j.description, j.public_slug, j.created_at, o.name AS org_name
     FROM jobs j JOIN organizations o ON o.id = j.org_id
     WHERE j.status = 'published' ORDER BY j.created_at DESC LIMIT 100`
  ).all()
  return c.json(rows.results)
})

publicRouter.get('/public/jobs/:slug', async (c) => {
  const slug = cleanStr(c.req.param('slug'), 80)
  const job = await c.env.DB.prepare(
    `SELECT j.*, o.name AS org_name FROM jobs j JOIN organizations o ON o.id = j.org_id
     WHERE j.public_slug = ? AND j.status = 'published'`
  ).bind(slug).first<any>()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada o no publicada', 'not_found')
  const crit = await c.env.DB.prepare(
    'SELECT label, kind, category FROM job_criteria WHERE job_id = ? ORDER BY kind DESC'
  ).bind(job.id).all()
  return c.json({ ...job, criteria: crit.results })
})

export { publicRouter }
export default r
