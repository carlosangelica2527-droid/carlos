/**
 * Portal del postulante. Sin contraseña: se accede con un token personal
 * por postulación. Solo permite ver y modificar SU propia postulación.
 */
import { Hono } from 'hono'
import type { Env } from '../lib/auth'
import { cleanStr, jsonError, num } from '../lib/util'
import { scoreSubmission } from '../lib/score'

const p = new Hono<{ Bindings: Env }>()

async function loadByToken(db: D1Database, token: string) {
  if (!token || token.length < 16) return null
  return await db
    .prepare(
      `SELECT a.id, a.org_id, a.job_id, a.candidate_id, a.status, a.applied_at, a.rejection_reason,
              a.rejection_note, a.public_token,
              j.title AS job_title, j.description,
              s.name AS stage_name, s.kind AS stage_kind,
              c.full_name, c.email, c.phone, c.location, c.headline, c.salary_expectation,
              c.years_experience, c.consent_status, c.do_not_contact,
              o.name AS org_name
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN candidates c ON c.id = a.candidate_id
       JOIN organizations o ON o.id = a.org_id
       LEFT JOIN job_stages s ON s.id = a.stage_id
       WHERE a.public_token = ?`
    )
    .bind(token)
    .first<any>()
}

/* ------------------------- ESTADO DE LA POSTULACIÓN ------------------------ */

p.get('/public/portal/:token', async (c) => {
  const app = await loadByToken(c.env.DB, c.req.param('token'))
  if (!app) return jsonError(c, 404, 'Este enlace no es válido o la postulación ya no existe. Solicita uno nuevo al equipo de selección.', 'not_found')
  if (app.do_not_contact) {
    return c.json({ blocked: true, message: 'Registramos tu solicitud de no contacto. No se mostrará información adicional.' })
  }

  const tests = await c.env.DB.prepare(
    `SELECT t.id AS assignment_id, t.status AS assignment_status, t.due_at,
            s.id AS assessment_id, s.title, s.type, s.instructions, s.duration_min, s.pass_score,
            (SELECT COUNT(*) FROM assessment_questions q WHERE q.assessment_id = s.id) AS question_count,
            (SELECT COUNT(*) FROM attempts a2 WHERE a2.assessment_id = s.id AND a2.candidate_id = ? AND a2.status != 'submitted') AS done
     FROM test_assignments t JOIN assessments s ON s.id = t.assessment_id
     WHERE t.application_id = ? AND t.org_id = ?
     ORDER BY t.id`
  ).bind(app.candidate_id, app.id, app.org_id).all<any>()

  const attempts = await c.env.DB.prepare(
    `SELECT t.id, t.assessment_id, s.title, s.type, t.status, t.final_score, t.auto_score, t.max_score, t.submitted_at, s.pass_score
     FROM attempts t JOIN assessments s ON s.id = t.assessment_id
     WHERE t.candidate_id = ? AND t.org_id = ? ORDER BY t.id DESC`
  ).bind(app.candidate_id, app.org_id).all<any>()

  return c.json({
    job: { title: app.job_title, description: app.description, org_name: app.org_name },
    application: {
      id: app.id, status: app.status, stage_name: app.stage_name, stage_kind: app.stage_kind,
      applied_at: app.applied_at, rejection_reason: app.rejection_reason
    },
    candidate: {
      full_name: app.full_name, email: app.email, phone: app.phone, location: app.location,
      headline: app.headline, years_experience: app.years_experience,
      salary_expectation: app.salary_expectation, consent_status: app.consent_status
    },
    tests: tests.results.map((t: any) => ({
      assignment_id: t.assignment_id,
      assessment_id: t.assessment_id,
      title: t.title,
      type: t.type,
      instructions: t.instructions,
      duration_min: t.duration_min,
      question_count: t.question_count,
      due_at: t.due_at,
      completed: t.done > 0,
      status: t.done > 0 ? 'completada' : 'pendiente'
    })),
    attempts: attempts.results.map((t: any) => ({
      id: t.id, title: t.title, type: t.type, status: t.status,
      final_score: t.final_score, auto_score: t.auto_score, max_score: t.max_score,
      pass_score: t.pass_score, submitted_at: t.submitted_at
    })),
    note: 'Este es tu enlace personal de seguimiento. No lo compartas.'
  })
})

/* ------------------------------ MIS DATOS --------------------------------- */

p.post('/public/portal/:token/profile', async (c) => {
  const app = await loadByToken(c.env.DB, c.req.param('token'))
  if (!app) return jsonError(c, 404, 'Enlace no válido', 'not_found')
  if (app.do_not_contact) return jsonError(c, 403, 'Tu perfil está marcado como no contactar', 'preference')

  const b = await c.req.json().catch(() => ({} as any))
  const sets: string[] = []
  const vals: unknown[] = []

  if (b?.phone !== undefined) { sets.push('phone = ?'); vals.push(cleanStr(b.phone, 40) || null) }
  if (b?.location !== undefined) { sets.push('location = ?'); vals.push(cleanStr(b.location, 120) || null) }
  if (b?.headline !== undefined) { sets.push('headline = ?'); vals.push(cleanStr(b.headline, 160) || null) }
  if (b?.years_experience !== undefined) { sets.push('years_experience = ?'); vals.push(Math.max(0, Math.min(60, num(b.years_experience)))) }
  if (b?.salary_expectation !== undefined) {
    const v = b.salary_expectation === '' || b.salary_expectation === null ? null : Math.max(0, num(b.salary_expectation))
    sets.push('salary_expectation = ?'); vals.push(v)
  }
  if (b?.summary !== undefined) { sets.push('summary = ?'); vals.push(cleanStr(b.summary, 2000) || null) }

  if (!sets.length) return jsonError(c, 400, 'No hay cambios para guardar', 'validation')
  sets.push("updated_at = datetime('now')")
  vals.push(app.candidate_id, app.org_id)
  await c.env.DB.prepare(`UPDATE candidates SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).bind(...vals).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_log (org_id, actor_id, actor_email, action, entity, entity_id, meta)
     VALUES (?, NULL, ?, 'portal_profile_update', 'candidates', ?, ?)`
  ).bind(app.org_id, app.email, String(app.candidate_id), JSON.stringify({ fields: sets.length - 1, via: 'portal' })).run()

  return c.json({ ok: true })
})

/* -------------------------------- PRUEBAS --------------------------------- */

async function loadAssignment(db: D1Database, token: string, assessmentId: number) {
  const app = await loadByToken(db, token)
  if (!app) return { error: jsonError as any, app: null, assign: null, assessment: null, questions: [] as any[] }
  const assign = await db
    .prepare('SELECT * FROM test_assignments WHERE application_id = ? AND assessment_id = ? AND org_id = ?')
    .bind(app.id, assessmentId, app.org_id)
    .first<any>()
  if (!assign) return { error: null, app, assign: null, assessment: null, questions: [] }
  const assessment = await db
    .prepare('SELECT * FROM assessments WHERE id = ? AND org_id = ?')
    .bind(assessmentId, app.org_id)
    .first<any>()
  if (!assessment) return { error: null, app, assign, assessment: null, questions: [] }
  const questions = (
    await db.prepare('SELECT * FROM assessment_questions WHERE assessment_id = ? AND org_id = ? ORDER BY id').bind(assessmentId, app.org_id).all<any>()
  ).results
  return { error: null, app, assign, assessment, questions }
}

p.get('/public/portal/:token/tests/:assessmentId', async (c) => {
  const aid = Number(c.req.param('assessmentId'))
  const r = await loadAssignment(c.env.DB, c.req.param('token'), aid)
  if (!r.app) return jsonError(c, 404, 'Enlace no válido', 'not_found')
  if (!r.assign) return jsonError(c, 404, 'Esta prueba no está asignada a tu postulación', 'not_found')
  if (!r.assessment) return jsonError(c, 404, 'Prueba no encontrada', 'not_found')

  const done = await c.env.DB
    .prepare("SELECT id FROM attempts WHERE candidate_id = ? AND assessment_id = ? AND org_id = ? AND status != 'submitted'")
    .bind(r.app.candidate_id, aid, r.app.org_id)
    .first<any>()
  if (done) return jsonError(c, 409, 'Ya completaste esta prueba. El equipo revisará tu resultado.', 'already_done')

  return c.json({
    id: r.assessment.id,
    title: r.assessment.title,
    type: r.assessment.type,
    instructions: r.assessment.instructions,
    duration_min: r.assessment.duration_min,
    pass_score: r.assessment.pass_score,
    due_at: r.assign.due_at,
    questions: r.questions.map((q: any) => ({
      id: q.id,
      prompt: q.prompt,
      kind: q.kind,
      options: (() => { try { return JSON.parse(q.options || '[]') } catch { return [] } })(),
      points: q.points,
      // La rúbrica de verificación NO se expone al postulante en pruebas de hoja.
      rubric_display: r.assessment.type === 'spreadsheet' ? q.prompt : q.rubric
    }))
  })
})

p.post('/public/portal/:token/tests/:assessmentId', async (c) => {
  const aid = Number(c.req.param('assessmentId'))
  const r = await loadAssignment(c.env.DB, c.req.param('token'), aid)
  if (!r.app) return jsonError(c, 404, 'Enlace no válido', 'not_found')
  if (!r.assign) return jsonError(c, 404, 'Esta prueba no está asignada a tu postulación', 'not_found')
  if (!r.assessment || !r.questions.length) return jsonError(c, 400, 'La prueba no tiene preguntas configuradas', 'validation')

  const dup = await c.env.DB
    .prepare("SELECT id FROM attempts WHERE candidate_id = ? AND assessment_id = ? AND org_id = ? AND status != 'submitted'")
    .bind(r.app.candidate_id, aid, r.app.org_id)
    .first<any>()
  if (dup) return jsonError(c, 409, 'Ya registramos tu respuesta para esta prueba', 'already_done')

  const b = await c.req.json().catch(() => ({} as any))
  let result
  try {
    result = scoreSubmission(r.assessment.type, r.questions, b)
  } catch (e) {
    return jsonError(c, 400, String((e as Error)?.message ?? e), 'validation')
  }

  const ins = await c.env.DB.prepare(
    `INSERT INTO attempts (org_id, assessment_id, candidate_id, application_id, answers, auto_score, max_score, final_score, status, assessment_version)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    r.app.org_id, aid, r.app.candidate_id, r.app.id,
    JSON.stringify(result.storedAnswers), result.autoScore, result.maxScore,
    result.finalScore, result.status, r.assessment.version
  ).run()

  await c.env.DB.prepare("UPDATE test_assignments SET status = 'completed' WHERE id = ?").bind(r.assign.id).run()
  await c.env.DB.prepare(
    `INSERT INTO application_events (org_id, application_id, action, note) VALUES (?,?,?,?)`
  ).bind(r.app.org_id, r.app.id, 'test_submitted', `${r.assessment.title} · ${result.autoScore}/${result.maxScore}`).run()
  await c.env.DB.prepare("UPDATE applications SET last_activity_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(r.app.id).run()
  await c.env.DB.prepare(
    `INSERT INTO audit_log (org_id, actor_id, actor_email, action, entity, entity_id, meta)
     VALUES (?, NULL, ?, 'portal_test_submit', 'attempts', ?, ?)`
  ).bind(r.app.org_id, r.app.email, String(ins.meta.last_row_id), JSON.stringify({ assessment_id: aid, auto: result.autoScore, max: result.maxScore })).run()

  const showsScore = r.assessment.type === 'mcq'
  return c.json({
    ok: true,
    attempt_id: ins.meta.last_row_id,
    status: result.status,
    auto_score: showsScore ? result.autoScore : null,
    max_score: result.maxScore,
    message: showsScore
      ? `Respuesta registrada. Obtuviste ${result.autoScore} de ${result.maxScore} puntos.`
      : 'Respuesta registrada. El equipo la revisará y te contactará.'
  }, 201)
})

export default p
