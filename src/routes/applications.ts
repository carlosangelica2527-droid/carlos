import { Hono } from 'hono'
import { type Env, type SessionUser, requireAuth, requirePermission } from '../lib/auth'
import { audit, jsonError, cleanStr, intOrNull, REJECTION_REASONS, STAGE_COLORS, normName, normPhone } from '../lib/util'

const r = new Hono<{ Bindings: Env }>()

/* ------------------- HELPERS DE VACANTE/ETAPA ------------------ */

async function stagesOf(db: D1Database, orgId: number, jobId: number) {
  const rows = await db.prepare('SELECT * FROM job_stages WHERE job_id = ? AND org_id = ? ORDER BY position').bind(jobId, orgId).all<any>()
  return rows.results
}

function stageKindFromName(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('contrat')) return 'hired'
  if (n.includes('descart') || n.includes('rechaz')) return 'rejected'
  if (n.includes('reserva') || n.includes('talento')) return 'talent_pool'
  return 'normal'
}

/* ---------------------------- LIST ----------------------------- */

r.get('/applications', requireAuth, requirePermission('applications:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const jobId = intOrNull(c.req.query('job_id'))
  const stageId = intOrNull(c.req.query('stage_id'))
  const status = cleanStr(c.req.query('status'), 20)

  let sql = `SELECT a.*, c.full_name, c.email, c.years_experience, c.consent_status,
      j.title AS job_title, s.name AS stage_name, s.kind AS stage_kind, s.position AS stage_position,
      u.name AS owner_name,
      CAST(julianday('now') - julianday(a.last_activity_at) AS INTEGER) AS days_idle
    FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    LEFT JOIN job_stages s ON s.id = a.stage_id
    LEFT JOIN users u ON u.id = a.owner_id
    WHERE a.org_id = ?`
  const params: unknown[] = [user.org_id]
  if (jobId) { sql += ' AND a.job_id = ?'; params.push(jobId) }
  if (stageId) { sql += ' AND a.stage_id = ?'; params.push(stageId) }
  if (status && status !== 'all') { sql += ' AND a.status = ?'; params.push(status) }
  sql += ' ORDER BY a.last_activity_at DESC LIMIT 500'
  const rows = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json(rows.results)
})

/* --------------------------- CREATE ---------------------------- */

r.post('/applications', requireAuth, requirePermission('applications:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const jobId = intOrNull(b?.job_id)
  let candidateId = intOrNull(b?.candidate_id)
  if (!jobId) return jsonError(c, 400, 'Debes indicar la vacante', 'validation')

  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').bind(jobId, user.org_id).first<any>()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')
  if (job.status === 'closed' || job.status === 'archived') return jsonError(c, 400, 'No se puede postular a una vacante cerrada o archivada', 'validation')

  // Crear candidato al vuelo si no existe
  if (!candidateId) {
    const fullName = cleanStr(b?.full_name, 160)
    if (!fullName) return jsonError(c, 400, 'Indica un candidato existente o los datos del nuevo candidato', 'validation')
    const email = cleanStr(b?.email, 160).toLowerCase()
    if (email) {
      const existing = await c.env.DB.prepare('SELECT id, full_name FROM candidates WHERE org_id = ? AND lower(email) = ?').bind(user.org_id, email).first<any>()
      if (existing) {
        candidateId = existing.id
      }
    }
    if (!candidateId) {
      const res = await c.env.DB.prepare(
        `INSERT INTO candidates (org_id, full_name, email, phone, location, years_experience, source, consent_status, consent_basis, consent_date, headline)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        user.org_id, fullName, email || null, cleanStr(b?.phone, 40) || null, cleanStr(b?.location, 120) || null,
        Math.max(0, Math.min(60, Number(b?.years_experience) || 0)),
        cleanStr(b?.source, 80) || 'postulacion',
        b?.consent_status === 'granted' ? 'granted' : 'pending',
        b?.consent_status === 'granted' ? (cleanStr(b?.consent_basis, 200) || 'Consentimiento del candidato al postular') : null,
        b?.consent_status === 'granted' ? new Date().toISOString() : null,
        cleanStr(b?.headline, 160) || null
      ).run()
      candidateId = Number(res.meta.last_row_id)
    }
  }

  const cand = await c.env.DB.prepare('SELECT id, full_name, consent_status FROM candidates WHERE id = ? AND org_id = ?').bind(candidateId, user.org_id).first<any>()
  if (!cand) return jsonError(c, 404, 'Candidato no encontrado', 'not_found')

  const dup = await c.env.DB.prepare('SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?').bind(jobId, candidateId).first<any>()
  if (dup) return jsonError(c, 409, `${cand.full_name} ya tiene una postulación en esta vacante`, 'duplicate', { application_id: dup.id })

  const stages = await stagesOf(c.env.DB, user.org_id, jobId)
  if (!stages.length) return jsonError(c, 500, 'La vacante no tiene etapas configuradas', 'config')
  const first = stages[0]

  const token = crypto.randomUUID().replace(/-/g, '')
  const res = await c.env.DB.prepare(
    'INSERT INTO applications (org_id, job_id, candidate_id, stage_id, status, source, owner_id, public_token) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(user.org_id, jobId, candidateId, first.id, 'active', cleanStr(b?.source, 80) || 'postulacion', user.id, token).run()
  const appId = Number(res.meta.last_row_id)

  await c.env.DB.prepare('INSERT INTO application_events (org_id, application_id, to_stage, action, actor_id, note) VALUES (?,?,?,?,?,?)')
    .bind(user.org_id, appId, first.name, 'created', user.id, cleanStr(b?.note, 500) || null).run()
  await audit(c.env.DB, user, 'application_create', 'applications', appId, { job_id: jobId, candidate_id: candidateId })

  return c.json({ id: appId, candidate_id: candidateId, stage: first.name, portal_url: `/mi-postulacion/${token}` }, 201)
})

/* ---------------------------- DETAIL --------------------------- */

r.get('/applications/:id', requireAuth, requirePermission('applications:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const app = await c.env.DB.prepare(
    `SELECT a.*, c.full_name, c.email, c.years_experience, c.headline, j.title AS job_title, s.name AS stage_name, s.kind AS stage_kind
     FROM applications a JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
     LEFT JOIN job_stages s ON s.id = a.stage_id WHERE a.id = ? AND a.org_id = ?`
  ).bind(id, user.org_id).first<any>()
  if (!app) return jsonError(c, 404, 'Postulación no encontrada', 'not_found')

  const events = await c.env.DB.prepare(
    `SELECT e.*, u.name AS actor_name FROM application_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.application_id = ? ORDER BY e.id DESC`
  ).bind(id).all()
  const stages = await stagesOf(c.env.DB, user.org_id, app.job_id)
  const interviews = await c.env.DB.prepare('SELECT * FROM interviews WHERE application_id = ? ORDER BY scheduled_at DESC').bind(id).all()
  const attempts = await c.env.DB.prepare(
    `SELECT t.*, s.title AS assessment_title FROM attempts t JOIN assessments s ON s.id = t.assessment_id
     WHERE t.application_id = ? ORDER BY t.id DESC`
  ).bind(id).all()
  const comms = await c.env.DB.prepare('SELECT * FROM communications WHERE application_id = ? ORDER BY id DESC').bind(id).all()

  return c.json({
    ...app,
    stages: stages.map((s: any) => ({ ...s, color: STAGE_COLORS[(s.name || '').toLowerCase().replace(/\s+/g, '_')] ?? 'slate' })),
    events: events.results,
    interviews: interviews.results,
    attempts: attempts.results,
    communications: comms.results,
    rejection_reasons: REJECTION_REASONS
  })
})

/* ------------------------ STAGE TRANSITION --------------------- */

r.post('/applications/:id/move', requireAuth, requirePermission('applications:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const stageId = intOrNull(b?.stage_id)
  if (!id || !stageId) return jsonError(c, 400, 'Debes indicar la etapa destino', 'validation')

  const app = await c.env.DB.prepare(
    `SELECT a.*, s.name AS current_stage FROM applications a LEFT JOIN job_stages s ON s.id = a.stage_id
     WHERE a.id = ? AND a.org_id = ?`
  ).bind(id, user.org_id).first<any>()
  if (!app) return jsonError(c, 404, 'Postulación no encontrada', 'not_found')

  const target = await c.env.DB.prepare('SELECT * FROM job_stages WHERE id = ? AND job_id = ? AND org_id = ?').bind(stageId, app.job_id, user.org_id).first<any>()
  if (!target) return jsonError(c, 400, 'La etapa no pertenece a la vacante de esta postulación', 'validation')

  if (target.kind === 'rejected') {
    const reason = cleanStr(b?.reason, 120)
    if (!reason) return jsonError(c, 400, 'Para descartar se requiere un motivo normalizado', 'validation')
  }

  let status = app.status
  if (target.kind === 'hired') status = 'hired'
  else if (target.kind === 'rejected') status = 'rejected'
  else if (target.kind === 'talent_pool') status = 'talent_pool'
  else status = 'active'

  await c.env.DB.prepare(
    `UPDATE applications SET stage_id = ?, status = ?, rejection_reason = ?, rejection_note = ?,
      last_activity_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND org_id = ?`
  ).bind(
    stageId, status,
    target.kind === 'rejected' ? cleanStr(b?.reason, 120) : null,
    target.kind === 'rejected' ? cleanStr(b?.note, 1000) || null : null,
    id, user.org_id
  ).run()

  await c.env.DB.prepare(
    'INSERT INTO application_events (org_id, application_id, from_stage, to_stage, action, actor_id, reason, note) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(user.org_id, id, app.current_stage ?? null, target.name, 'stage_change', user.id,
    cleanStr(b?.reason, 120) || null, cleanStr(b?.note, 1000) || null).run()

  await audit(c.env.DB, user, 'application_move', 'applications', id, { from: app.current_stage, to: target.name, status })
  return c.json({ ok: true, stage: target.name, status })
})

/* ---------------------------- REJECT --------------------------- */

r.post('/applications/:id/reject', requireAuth, requirePermission('applications:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const reason = cleanStr(b?.reason, 120)
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  if (!reason) return jsonError(c, 400, 'Indica el motivo del descarte', 'validation')

  const app = await c.env.DB.prepare('SELECT id, job_id FROM applications WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!app) return jsonError(c, 404, 'Postulación no encontrada', 'not_found')
  const stage = await c.env.DB.prepare("SELECT id FROM job_stages WHERE job_id = ? AND kind = 'rejected' ORDER BY position LIMIT 1").bind(app.job_id).first<any>()

  await c.env.DB.prepare(
    `UPDATE applications SET status = 'rejected', rejection_reason = ?, rejection_note = ?, stage_id = COALESCE(?, stage_id),
     last_activity_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND org_id = ?`
  ).bind(reason, cleanStr(b?.note, 1000) || null, stage?.id ?? null, id, user.org_id).run()

  await c.env.DB.prepare('INSERT INTO application_events (org_id, application_id, to_stage, action, actor_id, reason, note) VALUES (?,?,?,?,?,?,?)')
    .bind(user.org_id, id, 'Descartado', 'rejected', user.id, reason, cleanStr(b?.note, 1000) || null).run()
  await audit(c.env.DB, user, 'application_reject', 'applications', id, { reason })
  return c.json({ ok: true })
})

/* --------------------------- WITHDRAW -------------------------- */

r.post('/applications/:id/withdraw', requireAuth, requirePermission('applications:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const app = await c.env.DB.prepare('SELECT id FROM applications WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!app) return jsonError(c, 404, 'Postulación no encontrada', 'not_found')
  // Retiro: no se borra el perfil histórico ni las evidencias.
  await c.env.DB.prepare("UPDATE applications SET status = 'withdrawn', last_activity_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND org_id = ?")
    .bind(id, user.org_id).run()
  await c.env.DB.prepare('INSERT INTO application_events (org_id, application_id, action, actor_id, note) VALUES (?,?,?,?,?)')
    .bind(user.org_id, id, 'withdrawn', user.id, 'Candidato retiró su postulación. El perfil histórico se conserva según política de conservación.').run()
  await audit(c.env.DB, user, 'application_withdraw', 'applications', id, {})
  return c.json({ ok: true, note: 'El perfil y sus evidencias se conservan; solo se cierra la postulación.' })
})

/* --------------------------- PIPELINE -------------------------- */

r.get('/jobs/:id/pipeline', requireAuth, requirePermission('applications:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const jobId = intOrNull(c.req.param('id'))
  if (!jobId) return jsonError(c, 400, 'ID inválido', 'validation')
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').bind(jobId, user.org_id).first<any>()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')
  const stages = await stagesOf(c.env.DB, user.org_id, jobId)
  const apps = await c.env.DB.prepare(
    `SELECT a.id, a.candidate_id, a.stage_id, a.status, a.applied_at, a.last_activity_at, a.rejection_reason,
       c.full_name, c.email, c.years_experience, c.headline,
       CAST(julianday('now') - julianday(a.last_activity_at) AS INTEGER) AS days_idle,
       (SELECT COUNT(*) FROM attempts t WHERE t.candidate_id = a.candidate_id AND t.application_id = a.id) AS attempt_count
     FROM applications a JOIN candidates c ON c.id = a.candidate_id
     WHERE a.job_id = ? AND a.org_id = ? ORDER BY a.applied_at DESC`
  ).bind(jobId, user.org_id).all<any>()

  const columns = stages.map((s) => ({
    id: s.id, name: s.name, kind: s.kind, position: s.position,
    candidates: apps.results.filter((a) => a.stage_id === s.id)
  }))
  const orphans = apps.results.filter((a) => !stages.some((s) => s.id === a.stage_id))
  const staleThreshold = 7
  return c.json({
    job: { id: job.id, title: job.title, status: job.status, stale_threshold_days: staleThreshold },
    columns,
    unassigned: orphans,
    stale: apps.results.filter((a) => a.days_idle > staleThreshold && a.status === 'active').length
  })
})

/* ------------------------- COMMUNICATIONS ---------------------- */

r.post('/applications/:id/communicate', requireAuth, requirePermission('comms:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const subject = cleanStr(b?.subject, 200)
  const body = cleanStr(b?.body, 4000)
  if (!id || !subject || !body) return jsonError(c, 400, 'Asunto y mensaje son obligatorios', 'validation')

  const app = await c.env.DB.prepare(
    'SELECT a.id, a.candidate_id, c.email, c.do_not_contact FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = ? AND a.org_id = ?'
  ).bind(id, user.org_id).first<any>()
  if (!app) return jsonError(c, 404, 'Postulación no encontrada', 'not_found')
  if (app.do_not_contact) return jsonError(c, 400, 'El candidato pidió no ser contactado. Respeta su preferencia.', 'preference')

  // Sin proveedor configurado NO se presenta como enviado.
  const provider = c.env.RESEND_API_KEY ? 'resend' : 'no_configurado'
  let status = 'queued'
  let providerError: string | null = null

  if (provider === 'resend' && app.email) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'QUIPU <no-reply@quipu.app>', to: [app.email], subject, text: body })
      })
      if (res.ok) status = 'sent'
      else { status = 'failed'; providerError = `Proveedor respondió ${res.status}` }
    } catch (e: any) {
      status = 'failed'; providerError = e?.message ?? 'Error de red'
    }
  } else {
    status = 'failed'
    providerError = provider === 'no_configurado'
      ? 'No hay proveedor de correo configurado (RESEND_API_KEY). El mensaje quedó registrado como fallido.'
      : 'El candidato no tiene correo registrado.'
  }

  const res = await c.env.DB.prepare(
    'INSERT INTO communications (org_id, application_id, candidate_id, channel, template, subject, body, status, provider, provider_error) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(user.org_id, id, app.candidate_id, 'email', cleanStr(b?.template, 40) || 'manual', subject, body, status, provider, providerError).run()

  await audit(c.env.DB, user, 'communication_send', 'communications', res.meta.last_row_id, { status, provider })
  return c.json({
    id: res.meta.last_row_id, status, provider,
    message: status === 'sent' ? 'Correo aceptado por el proveedor.' : `No se envió: ${providerError}`
  })
})

export default r
