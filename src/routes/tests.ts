/**
 * Asignación de pruebas a una postulación y lectura de respuestas.
 * Sin asignación explícita, el postulante no ve la prueba en su portal.
 */
import { Hono } from 'hono'
import { type Env, type SessionUser, requireAuth, requirePermission } from '../lib/auth'
import { audit, jsonError, cleanStr, intOrNull } from '../lib/util'
import { getEmailConfig, sendEmail, templateInviteTest } from '../lib/mail'

const t = new Hono<{ Bindings: Env }>()

function portalBase(c: any): string {
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}`
}

/* --------------------------- ASIGNAR / LISTAR --------------------------- */

t.get('/applications/:id/tests', requireAuth, requirePermission('assessments:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const app = await c.env.DB.prepare('SELECT id FROM applications WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!app) return jsonError(c, 404, 'Postulación no encontrada', 'not_found')

  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.assessment_id, t.status, t.due_at, t.created_at,
            s.title, s.type, s.duration_min, s.pass_score,
            (SELECT COUNT(*) FROM attempts a WHERE a.assessment_id = s.id AND a.candidate_id = ap.candidate_id AND a.status != 'submitted') AS attempts
     FROM test_assignments t
     JOIN assessments s ON s.id = t.assessment_id
     JOIN applications ap ON ap.id = t.application_id
     WHERE t.application_id = ? AND t.org_id = ? ORDER BY t.id`
  ).bind(id, user.org_id).all<any>()
  return c.json(rows.results)
})

t.post('/applications/:id/tests', requireAuth, requirePermission('assessments:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const assessmentId = intOrNull(b?.assessment_id)
  if (!id || !assessmentId) return jsonError(c, 400, 'Postulación y prueba son obligatorias', 'validation')

  const app = await c.env.DB.prepare(
    `SELECT a.id, a.job_id, a.candidate_id, a.public_token, c.full_name, c.email, c.do_not_contact, j.title AS job_title, o.name AS org_name, o.settings
     FROM applications a JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
     JOIN organizations o ON o.id = a.org_id
     WHERE a.id = ? AND a.org_id = ?`
  ).bind(id, user.org_id).first<any>()
  if (!app) return jsonError(c, 404, 'Postulación no encontrada', 'not_found')

  const assessment = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ? AND org_id = ?').bind(assessmentId, user.org_id).first<any>()
  if (!assessment) return jsonError(c, 404, 'Prueba no encontrada', 'not_found')
  if (!assessment.questions_count && assessment.type === 'mcq') {
    /* se valida abajo con el conteo real */
  }
  const qc = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM assessment_questions WHERE assessment_id = ?').bind(assessmentId).first<any>()
  if (!qc?.n) return jsonError(c, 400, 'Esta prueba no tiene preguntas: no se puede asignar', 'validation')

  // Token del portal si la postulación aún no lo tiene.
  let token = app.public_token
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '')
    await c.env.DB.prepare('UPDATE applications SET public_token = ? WHERE id = ? AND org_id = ?').bind(token, id, user.org_id).run()
  }

  const due = cleanStr(b?.due_at, 30) || null
  try {
    await c.env.DB.prepare(
      `INSERT INTO test_assignments (org_id, application_id, assessment_id, status, due_at, assigned_by)
       VALUES (?,?,?,'assigned',?,?)`
    ).bind(user.org_id, id, assessmentId, due, user.id).run()
  } catch (e) {
    return jsonError(c, 409, 'Esta prueba ya está asignada a la postulación', 'duplicate')
  }

  await c.env.DB.prepare('INSERT INTO application_events (org_id, application_id, action, actor_id, note) VALUES (?,?,?,?,?)')
    .bind(user.org_id, id, 'test_assigned', user.id, assessment.title).run()
  await audit(c.env.DB, user, 'test_assign', 'applications', id, { assessment_id: assessmentId, due })

  const link = `${portalBase(c)}/mi-postulacion/${token}`
  const result: any = { ok: true, assignment: { assessment_id: assessmentId, title: assessment.title, due_at: due }, portal_link: link, email: null }

  // Envío opcional; si no hay proveedor se informa, no se finge.
  if (b?.send_email) {
    if (!app.email) {
      result.email = { sent: false, reason: 'El candidato no tiene correo registrado' }
    } else if (app.do_not_contact) {
      result.email = { sent: false, reason: 'El candidato pidió no ser contactado' }
    } else {
      const cfg = await getEmailConfig(c.env, user.org_id)
      if (!cfg) {
        result.email = { sent: false, reason: 'No hay correo configurado. Ve a Configuración → Correo.' }
      } else {
        const tpl = templateInviteTest({
          candidate: app.full_name, job: app.job_title, test: assessment.title,
          link, org: app.org_name, duration: assessment.duration_min, due: due || undefined
        })
        const sent = await sendEmail(c.env, cfg, app.email, tpl.subject, tpl.text)
        await c.env.DB.prepare(
          `INSERT INTO communications (org_id, application_id, candidate_id, channel, template, subject, body, status, provider, provider_error)
           VALUES (?,?,?,'email','test_invite',?,?,?,?,?)`
        ).bind(user.org_id, id, app.candidate_id, tpl.subject, tpl.text,
          sent.ok ? 'sent' : 'failed', sent.provider, sent.error || null).run()
        result.email = { sent: sent.ok, reason: sent.error || null }
      }
    }
  }
  return c.json(result, 201)
})

t.delete('/applications/:id/tests/:assignmentId', requireAuth, requirePermission('assessments:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const aid = intOrNull(c.req.param('assignmentId'))
  if (!id || !aid) return jsonError(c, 400, 'ID inválido', 'validation')
  const found = await c.env.DB.prepare('SELECT id FROM test_assignments WHERE id = ? AND application_id = ? AND org_id = ?')
    .bind(aid, id, user.org_id).first()
  if (!found) return jsonError(c, 404, 'Asignación no encontrada', 'not_found')
  await c.env.DB.prepare('DELETE FROM test_assignments WHERE id = ? AND org_id = ?').bind(aid, user.org_id).run()
  await audit(c.env.DB, user, 'test_unassign', 'applications', id, { assignment: aid })
  return c.json({ ok: true })
})

/* ---------------------- RESPUESTAS PARA EL RECLUTADOR ------------------- */

t.get('/attempts/:id/detail', requireAuth, requirePermission('assessments:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const att = await c.env.DB.prepare(
    `SELECT t.*, s.title, s.type, s.pass_score, s.instructions, c.full_name, c.email
     FROM attempts t JOIN assessments s ON s.id = t.assessment_id JOIN candidates c ON c.id = t.candidate_id
     WHERE t.id = ? AND t.org_id = ?`
  ).bind(id, user.org_id).first<any>()
  if (!att) return jsonError(c, 404, 'Intento no encontrado', 'not_found')
  await audit(c.env.DB, user, 'attempt_view', 'attempts', id, {})

  let answers: any = {}
  try { answers = JSON.parse(att.answers || '{}') } catch { answers = {} }
  const questions = (await c.env.DB.prepare('SELECT * FROM assessment_questions WHERE assessment_id = ? AND org_id = ? ORDER BY id')
    .bind(att.assessment_id, user.org_id).all<any>()).results

  const canSeeCorrect = ['admin', 'recruiter', 'assessor'].includes(user.role)
  let items: any[] = []
  if (att.type === 'spreadsheet') {
    items = questions.map((q: any) => ({ prompt: q.prompt, kind: 'spreadsheet', rubric: q.rubric }))
  } else {
    items = questions.map((q: any) => {
      const given = answers[String(q.id)] ?? answers[q.id] ?? null
      const opts = (() => { try { return JSON.parse(q.options || '[]') } catch { return [] } })()
      const isMcq = q.kind === 'mcq'
      return {
        id: q.id, prompt: q.prompt, kind: q.kind, points: q.points, options: opts,
        answer_index: isMcq && given !== null ? Number(given) : null,
        answer_text: isMcq ? null : (given === null ? null : String(given)),
        answer_label: isMcq && given !== null ? (opts[Number(given)] ?? null) : null,
        correct_index: canSeeCorrect ? q.correct_index : null,
        correct_label: canSeeCorrect && q.correct_index !== null ? (opts[q.correct_index] ?? null) : null,
        is_correct: isMcq && given !== null && q.correct_index !== null ? Number(given) === q.correct_index : null
      }
    })
  }
  return c.json({
    id: att.id, title: att.title, type: att.type, status: att.status,
    auto_score: att.auto_score, final_score: att.final_score, max_score: att.max_score,
    pass_score: att.pass_score, candidate: att.full_name, email: att.email,
    submitted_at: att.submitted_at, reviewer_note: att.reviewer_note,
    workbook: att.type === 'spreadsheet' ? (answers.workbook || null) : null,
    items
  })
})

export default t
