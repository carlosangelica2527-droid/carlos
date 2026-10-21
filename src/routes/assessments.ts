import { Hono } from 'hono'
import { type Env, type SessionUser, requireAuth, requirePermission } from '../lib/auth'
import { audit, jsonError, cleanStr, intOrNull, num, parseJson } from '../lib/util'

const r = new Hono<{ Bindings: Env }>()

/* --------------------------- ASSESSMENTS ----------------------- */

r.get('/assessments', requireAuth, requirePermission('assessments:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const rows = await c.env.DB.prepare(
    `SELECT a.*, j.title AS job_title,
      (SELECT COUNT(*) FROM assessment_questions q WHERE q.assessment_id = a.id) AS question_count,
      (SELECT COUNT(*) FROM attempts t WHERE t.assessment_id = a.id) AS attempt_count
     FROM assessments a LEFT JOIN jobs j ON j.id = a.job_id
     WHERE a.org_id = ? ORDER BY a.id DESC`
  ).bind(user.org_id).all()
  return c.json(rows.results)
})

r.post('/assessments', requireAuth, requirePermission('assessments:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const title = cleanStr(b?.title, 160)
  const type = ['mcq', 'written', 'practical', 'spreadsheet', 'manual'].includes(b?.type) ? b.type : 'mcq'
  if (!title) return jsonError(c, 400, 'El título de la prueba es obligatorio', 'validation')

  const questions = Array.isArray(b?.questions) ? b.questions.slice(0, 60) : []
  if (type === 'mcq') {
    if (!questions.length) return jsonError(c, 400, 'Una prueba de opción múltiple necesita al menos una pregunta', 'validation')
    for (const q of questions) {
      if (!cleanStr(q?.prompt, 800)) return jsonError(c, 400, 'Cada pregunta necesita un enunciado', 'validation')
      if (!Array.isArray(q?.options) || q.options.length < 2) return jsonError(c, 400, 'Cada pregunta necesita al menos 2 opciones', 'validation')
      if (!Number.isInteger(q?.correct_index) || q.correct_index < 0 || q.correct_index >= q.options.length) {
        return jsonError(c, 400, 'Cada pregunta necesita un índice de respuesta correcta válido', 'validation')
      }
    }
  }

  const res = await c.env.DB.prepare(
    `INSERT INTO assessments (org_id, title, type, job_id, description, instructions, duration_min, pass_score, status, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    user.org_id, title, type, intOrNull(b?.job_id),
    cleanStr(b?.description, 2000) || null,
    cleanStr(b?.instructions, 4000) || null,
    Math.max(5, Math.min(480, num(b?.duration_min, 30))),
    Math.max(0, Math.min(100, num(b?.pass_score, 70))),
    b?.status === 'active' ? 'active' : 'draft',
    user.id
  ).run()
  const id = Number(res.meta.last_row_id)

  for (const q of questions) {
    await c.env.DB.prepare(
      'INSERT INTO assessment_questions (org_id, assessment_id, prompt, kind, options, correct_index, points, rubric) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(
      user.org_id, id, cleanStr(q.prompt, 800),
      type === 'mcq' ? 'mcq' : 'open',
      JSON.stringify(Array.isArray(q.options) ? q.options.map((o: any) => cleanStr(o, 300)) : []),
      type === 'mcq' ? q.correct_index : null,
      Math.max(0, num(q?.points, 1)),
      cleanStr(q?.rubric, 1000) || null
    ).run()
  }
  await audit(c.env.DB, user, 'assessment_create', 'assessments', id, { title, type, questions: questions.length })
  return c.json({ id }, 201)
})

r.get('/assessments/:id', requireAuth, requirePermission('assessments:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const a = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!a) return jsonError(c, 404, 'Prueba no encontrada', 'not_found')
  const qs = await c.env.DB.prepare('SELECT * FROM assessment_questions WHERE assessment_id = ? AND org_id = ? ORDER BY id').bind(id, user.org_id).all<any>()
  const attempts = await c.env.DB.prepare(
    `SELECT t.*, c.full_name FROM attempts t JOIN candidates c ON c.id = t.candidate_id
     WHERE t.assessment_id = ? AND t.org_id = ? ORDER BY t.id DESC`
  ).bind(id, user.org_id).all()
  return c.json({
    ...a,
    // Se ocultan las respuestas correctas al rol de evaluador solo si es prueba activa
    questions: qs.results.map((q: any) => ({
      id: q.id, prompt: q.prompt, kind: q.kind, options: parseJson<string[]>(q.options, []),
      points: q.points, rubric: q.rubric,
      correct_index: user.role === 'assessor' || user.role === 'admin' || user.role === 'recruiter' ? q.correct_index : null
    })),
    attempts: attempts.results.map((t: any) => ({ ...t, answers: parseJson(t.answers, {}) }))
  })
})

/* ----------------------------- ATTEMPTS ------------------------ */

r.post('/assessments/:id/attempts', requireAuth, requirePermission('assessments:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const candidateId = intOrNull(b?.candidate_id)
  const applicationId = intOrNull(b?.application_id)
  if (!id || !candidateId) return jsonError(c, 400, 'Prueba y candidato son obligatorios', 'validation')

  const assessment = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!assessment) return jsonError(c, 404, 'Prueba no encontrada', 'not_found')
  const cand = await c.env.DB.prepare('SELECT id, full_name FROM candidates WHERE id = ? AND org_id = ?').bind(candidateId, user.org_id).first<any>()
  if (!cand) return jsonError(c, 404, 'Candidato no encontrado', 'not_found')

  const questions = (await c.env.DB.prepare('SELECT * FROM assessment_questions WHERE assessment_id = ? AND org_id = ?').bind(id, user.org_id).all<any>()).results
  const answers = b?.answers ?? {}
  if (!questions.length) return jsonError(c, 400, 'La prueba no tiene preguntas configuradas', 'validation')

  let autoScore = 0
  let maxScore = 0
  let hasOpen = false
  for (const q of questions) {
    maxScore += q.points
    const given = answers[String(q.id)] ?? answers[q.id]
    if (q.kind === 'mcq') {
      if (Number(given) === q.correct_index) autoScore += q.points
    } else {
      hasOpen = true
    }
  }
  // Las preguntas abiertas no se puntúan automáticamente: quedan para revisión humana.
  const status = hasOpen || assessment.type !== 'mcq' ? 'review_required' : 'graded'
  const finalScore = assessment.type === 'mcq' && !hasOpen ? autoScore : null

  const res = await c.env.DB.prepare(
    `INSERT INTO attempts (org_id, assessment_id, candidate_id, application_id, answers, auto_score, max_score, final_score, status, assessment_version)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(user.org_id, id, candidateId, applicationId, JSON.stringify(answers), autoScore, maxScore, finalScore, status, assessment.version).run()

  await audit(c.env.DB, user, 'attempt_submit', 'attempts', res.meta.last_row_id, {
    assessment_id: id, candidate_id: candidateId, auto_score: autoScore, max_score: maxScore, status
  })

  return c.json({
    id: res.meta.last_row_id,
    auto_score: autoScore,
    max_score: maxScore,
    final_score: finalScore,
    status,
    breakdown: questions.map((q: any) => ({
      question_id: q.id,
      prompt: q.prompt,
      kind: q.kind,
      points: q.points,
      awarded: q.kind === 'mcq' ? (Number(answers[String(q.id)] ?? answers[q.id]) === q.correct_index ? q.points : 0) : null,
      pending_review: q.kind !== 'mcq'
    })),
    note: status === 'review_required'
      ? 'Hay preguntas abiertas o evidencia práctica: se requiere calificación humana antes de usar el resultado.'
      : 'Puntuación automática registrada con la versión de la prueba y las respuestas completas.'
  }, 201)
})

r.post('/attempts/:id/review', requireAuth, requirePermission('assessments:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const score = num(b?.final_score, -1)
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  if (score < 0) return jsonError(c, 400, 'Indica una puntuación final válida', 'validation')

  const att = await c.env.DB.prepare('SELECT * FROM attempts WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!att) return jsonError(c, 404, 'Intento no encontrado', 'not_found')
  if (score > (att.max_score || 100)) return jsonError(c, 400, 'La puntuación no puede superar el máximo de la prueba', 'validation')

  await c.env.DB.prepare("UPDATE attempts SET final_score = ?, status = 'graded', reviewer_id = ?, reviewed_at = datetime('now'), reviewer_note = ? WHERE id = ? AND org_id = ?")
    .bind(score, user.id, cleanStr(b?.note, 1000) || null, id, user.org_id).run()
  await audit(c.env.DB, user, 'attempt_review', 'attempts', id, { final_score: score })
  return c.json({ ok: true, final_score: score, reviewer: user.name })
})

/* ---------------------------- INTERVIEWS ----------------------- */

r.get('/interviews', requireAuth, requirePermission('interviews:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const rows = await c.env.DB.prepare(
    `SELECT i.*, c.full_name, j.title AS job_title, u.name AS interviewer_name,
      (SELECT COUNT(*) FROM scorecards sc WHERE sc.interview_id = i.id) AS scorecard_count
     FROM interviews i JOIN candidates c ON c.id = i.candidate_id JOIN jobs j ON j.id = i.job_id
     LEFT JOIN users u ON u.id = i.interviewer_id
     WHERE i.org_id = ? ORDER BY i.scheduled_at DESC LIMIT 200`
  ).bind(user.org_id).all()
  return c.json(rows.results)
})

r.post('/interviews', requireAuth, requirePermission('interviews:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const applicationId = intOrNull(b?.application_id)
  const scheduledAt = cleanStr(b?.scheduled_at, 40)
  if (!applicationId || !scheduledAt) return jsonError(c, 400, 'Postulación y fecha son obligatorias', 'validation')
  const when = new Date(scheduledAt)
  if (isNaN(when.getTime())) return jsonError(c, 400, 'Fecha inválida', 'validation')

  const app = await c.env.DB.prepare('SELECT id, candidate_id, job_id FROM applications WHERE id = ? AND org_id = ?').bind(applicationId, user.org_id).first<any>()
  if (!app) return jsonError(c, 404, 'Postulación no encontrada', 'not_found')

  const res = await c.env.DB.prepare(
    `INSERT INTO interviews (org_id, application_id, candidate_id, job_id, scheduled_at, duration_min, timezone, mode, interviewer_id, meeting_link, guide)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    user.org_id, applicationId, app.candidate_id, app.job_id,
    when.toISOString(),
    Math.max(15, Math.min(240, num(b?.duration_min, 45))),
    cleanStr(b?.timezone, 60) || 'America/Guayaquil',
    cleanStr(b?.mode, 40) || 'videollamada',
    intOrNull(b?.interviewer_id) ?? user.id,
    cleanStr(b?.meeting_link, 300) || null,
    cleanStr(b?.guide, 4000) || null
  ).run()

  await c.env.DB.prepare('INSERT INTO application_events (org_id, application_id, action, actor_id, note) VALUES (?,?,?,?,?)')
    .bind(user.org_id, applicationId, 'interview_scheduled', user.id, `Entrevista agendada para ${when.toISOString().slice(0, 16).replace('T', ' ')}`).run()
  await audit(c.env.DB, user, 'interview_create', 'interviews', res.meta.last_row_id, { application_id: applicationId })
  return c.json({ id: res.meta.last_row_id }, 201)
})

r.get('/interviews/:id', requireAuth, requirePermission('interviews:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const iv = await c.env.DB.prepare(
    `SELECT i.*, c.full_name, c.headline, j.title AS job_title FROM interviews i
     JOIN candidates c ON c.id = i.candidate_id JOIN jobs j ON j.id = i.job_id
     WHERE i.id = ? AND i.org_id = ?`
  ).bind(id, user.org_id).first<any>()
  if (!iv) return jsonError(c, 404, 'Entrevista no encontrada', 'not_found')
  const scores = await c.env.DB.prepare(
    `SELECT s.*, u.name AS author_name FROM scorecards s LEFT JOIN users u ON u.id = s.author_id
     WHERE s.interview_id = ? AND s.org_id = ? ORDER BY s.id`
  ).bind(id, user.org_id).all()
  return c.json({ ...iv, scorecards: scores.results })
})

r.post('/interviews/:id/scorecards', requireAuth, requirePermission('interviews:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const criterion = cleanStr(b?.criterion, 160)
  const score = num(b?.score, 0)
  if (!id || !criterion) return jsonError(c, 400, 'Criterio obligatorio', 'validation')
  if (score < 1 || score > 5) return jsonError(c, 400, 'La puntuación debe estar entre 1 y 5', 'validation')
  const iv = await c.env.DB.prepare('SELECT id FROM interviews WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!iv) return jsonError(c, 404, 'Entrevista no encontrada', 'not_found')

  const res = await c.env.DB.prepare('INSERT INTO scorecards (org_id, interview_id, criterion, score, comment, author_id) VALUES (?,?,?,?,?,?)')
    .bind(user.org_id, id, criterion, Math.round(score), cleanStr(b?.comment, 2000) || null, user.id).run()
  await audit(c.env.DB, user, 'scorecard_create', 'interviews', id, { criterion, score })
  return c.json({ id: res.meta.last_row_id, author: user.name }, 201)
})

r.post('/interviews/:id/status', requireAuth, requirePermission('interviews:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const status = ['scheduled', 'completed', 'cancelled', 'no_show'].includes(b?.status) ? b.status : null
  if (!id || !status) return jsonError(c, 400, 'Estado inválido', 'validation')
  await c.env.DB.prepare('UPDATE interviews SET status = ? WHERE id = ? AND org_id = ?').bind(status, id, user.org_id).run()
  await audit(c.env.DB, user, 'interview_status', 'interviews', id, { status })
  return c.json({ ok: true })
})

/* ------------------- EMPLOYEE PERFORMANCE (P2) ----------------- */

r.get('/candidates/:id/performance', requireAuth, requirePermission('candidates:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const rows = await c.env.DB.prepare(
    `SELECT p.*, u.name AS reviewer_name FROM employee_performance p LEFT JOIN users u ON u.id = p.reviewer_id
     WHERE p.candidate_id = ? AND p.org_id = ? ORDER BY p.id DESC`
  ).bind(id, user.org_id).all()
  const hired = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM applications WHERE candidate_id = ? AND org_id = ? AND status = 'hired'").bind(id, user.org_id).first<any>()
  return c.json({ items: rows.results, is_employee: (hired?.n ?? 0) > 0 })
})

r.post('/candidates/:id/performance', requireAuth, requirePermission('applications:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const hired = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM applications WHERE candidate_id = ? AND org_id = ? AND status = 'hired'").bind(id, user.org_id).first<any>()
  if (!hired || hired.n === 0) return jsonError(c, 400, 'Solo se registra desempeño de personas contratadas. Este módulo no infiere desempeño de postulantes.', 'validation')

  const period = cleanStr(b?.period_label, 40)
  if (!period) return jsonError(c, 400, 'Indica el periodo (por ejemplo 30d, 60d, 90d)', 'validation')
  const res = await c.env.DB.prepare(
    'INSERT INTO employee_performance (org_id, candidate_id, period_label, review_type, objectives, result, reviewer_id) VALUES (?,?,?,?,?,?,?)'
  ).bind(user.org_id, id, period, cleanStr(b?.review_type, 20) || '90d',
    cleanStr(b?.objectives, 2000) || null, cleanStr(b?.result, 2000) || null, user.id).run()
  await audit(c.env.DB, user, 'performance_create', 'candidates', id, { period })
  return c.json({ id: res.meta.last_row_id }, 201)
})

/* ---------------------- PRIVACY REQUESTS (P1) ------------------ */

r.get('/privacy/requests', requireAuth, requirePermission('privacy:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const rows = await c.env.DB.prepare(
    `SELECT rr.*, c.full_name FROM retention_requests rr JOIN candidates c ON c.id = rr.candidate_id
     WHERE rr.org_id = ? ORDER BY rr.id DESC`
  ).bind(user.org_id).all()
  return c.json(rows.results)
})

r.post('/privacy/requests', requireAuth, requirePermission('privacy:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const candidateId = intOrNull(b?.candidate_id)
  const type = ['access', 'rectification', 'opposition', 'deletion'].includes(b?.type) ? b.type : null
  if (!candidateId || !type) return jsonError(c, 400, 'Candidato y tipo de solicitud son obligatorios', 'validation')
  const cand = await c.env.DB.prepare('SELECT id FROM candidates WHERE id = ? AND org_id = ?').bind(candidateId, user.org_id).first()
  if (!cand) return jsonError(c, 404, 'Candidato no encontrado', 'not_found')
  const res = await c.env.DB.prepare('INSERT INTO retention_requests (org_id, candidate_id, type, detail, assigned_to) VALUES (?,?,?,?,?)')
    .bind(user.org_id, candidateId, type, cleanStr(b?.detail, 1000) || null, user.id).run()
  await audit(c.env.DB, user, 'privacy_request_create', 'candidates', candidateId, { type })
  return c.json({ id: res.meta.last_row_id }, 201)
})

r.patch('/privacy/requests/:id', requireAuth, requirePermission('privacy:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const status = ['open', 'in_progress', 'done', 'rejected'].includes(b?.status) ? b.status : null
  if (!id || !status) return jsonError(c, 400, 'Estado inválido', 'validation')
  const req = await c.env.DB.prepare('SELECT * FROM retention_requests WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!req) return jsonError(c, 404, 'Solicitud no encontrada', 'not_found')

  await c.env.DB.prepare('UPDATE retention_requests SET status = ?, resolution = ?, closed_at = CASE WHEN ? IN (\'done\',\'rejected\') THEN datetime(\'now\') ELSE NULL END WHERE id = ? AND org_id = ?')
    .bind(status, cleanStr(b?.resolution, 1000) || null, status, id, user.org_id).run()

  if (status === 'done' && req.type === 'opposition') {
    await c.env.DB.prepare("UPDATE candidates SET do_not_contact = 1, consent_status = 'revoked', updated_at = datetime('now') WHERE id = ? AND org_id = ?")
      .bind(req.candidate_id, user.org_id).run()
  }
  await audit(c.env.DB, user, 'privacy_request_update', 'retention_requests', id, { status, type: req.type })
  return c.json({ ok: true })
})

/* ------------------------------ AUDIT -------------------------- */

r.get('/audit', requireAuth, requirePermission('audit:read'), async (c) => {
  const user = c.get('user') as SessionUser
  if (user.role !== 'admin' && user.role !== 'auditor') return jsonError(c, 403, 'Solo auditoría o administración', 'forbidden')
  const limit = Math.min(300, num(c.req.query('limit'), 100))
  const rows = await c.env.DB.prepare(
    'SELECT actor_email, action, entity, entity_id, result, meta, created_at FROM audit_log WHERE org_id = ? ORDER BY id DESC LIMIT ?'
  ).bind(user.org_id, limit).all()
  return c.json(rows.results)
})

export default r
