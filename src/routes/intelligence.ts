import { Hono } from 'hono'
import { type Env, type SessionUser, requireAuth, requirePermission } from '../lib/auth'
import { audit, jsonError, cleanStr, intOrNull, num, parseJson } from '../lib/util'
import { evaluateCandidate, type Criterion, type CandidateEvidence, MODEL_VERSION, normalize, tokens } from '../lib/match'

const r = new Hono<{ Bindings: Env }>()

/* ------------------------------------------------------------------ */
/* Carga de datos                                                      */
/* ------------------------------------------------------------------ */

async function jobCriteria(db: D1Database, orgId: number, jobId: number): Promise<Criterion[]> {
  const rows = await db.prepare('SELECT * FROM job_criteria WHERE job_id = ? AND org_id = ? ORDER BY kind DESC, weight DESC')
    .bind(jobId, orgId).all<any>()
  return rows.results.map((c: any) => ({
    id: c.id,
    kind: c.kind,
    category: c.category,
    label: c.label,
    weight: c.weight,
    keywords: parseJson<string[]>(c.keywords, []),
    minYears: c.min_years,
    description: c.description
  }))
}

async function loadEvidence(db: D1Database, orgId: number, candidateIds: number[]): Promise<Map<number, CandidateEvidence>> {
  const map = new Map<number, CandidateEvidence>()
  if (!candidateIds.length) return map
  const placeholders = candidateIds.map(() => '?').join(',')
  const cands = await db.prepare(
    `SELECT id, full_name, years_experience, availability FROM candidates WHERE org_id = ? AND id IN (${placeholders})`
  ).bind(orgId, ...candidateIds).all<any>()
  const skills = await db.prepare(
    `SELECT candidate_id, name, level, years, verified, source FROM candidate_skills WHERE org_id = ? AND candidate_id IN (${placeholders})`
  ).bind(orgId, ...candidateIds).all<any>()
  const exps = await db.prepare(
    `SELECT candidate_id, title, company, description, start_date, end_date, is_current FROM candidate_experiences WHERE org_id = ? AND candidate_id IN (${placeholders})`
  ).bind(orgId, ...candidateIds).all<any>()
  const edus = await db.prepare(
    `SELECT candidate_id, program, institution, level, year FROM candidate_education WHERE org_id = ? AND candidate_id IN (${placeholders})`
  ).bind(orgId, ...candidateIds).all<any>()
  const atts = await db.prepare(
    `SELECT t.candidate_id, a.title, COALESCE(t.final_score, t.auto_score) AS score, t.max_score, t.submitted_at, t.assessment_version
     FROM attempts t JOIN assessments a ON a.id = t.assessment_id
     WHERE t.org_id = ? AND t.candidate_id IN (${placeholders})`
  ).bind(orgId, ...candidateIds).all<any>()

  for (const c of cands.results) {
    map.set(c.id, {
      id: c.id,
      fullName: c.full_name,
      yearsExperience: c.years_experience || 0,
      available: c.availability,
      skills: skills.results.filter((s: any) => s.candidate_id === c.id).map((s: any) => ({
        name: s.name, level: s.level, years: s.years, verified: !!s.verified, source: s.source
      })),
      experiences: exps.results.filter((e: any) => e.candidate_id === c.id).map((e: any) => ({
        title: e.title, company: e.company, description: e.description,
        startDate: e.start_date, endDate: e.end_date, isCurrent: !!e.is_current
      })),
      education: edus.results.filter((e: any) => e.candidate_id === c.id).map((e: any) => ({
        program: e.program, institution: e.institution, level: e.level
      })),
      assessments: atts.results.filter((a: any) => a.candidate_id === c.id && a.score !== null).map((a: any) => ({
        title: a.title, score: a.score, maxScore: a.max_score || 100, submittedAt: a.submitted_at, version: a.assessment_version
      }))
    })
  }
  return map
}

/* ------------------------------------------------------------------ */
/* Smart Match: ranking para una vacante                               */
/* ------------------------------------------------------------------ */

r.get('/jobs/:id/matches', requireAuth, requirePermission('memory:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const jobId = intOrNull(c.req.param('id'))
  if (!jobId) return jsonError(c, 400, 'ID inválido', 'validation')
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').bind(jobId, user.org_id).first<any>()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')

  const criteria = await jobCriteria(c.env.DB, user.org_id, jobId)
  const includeHistory = c.req.query('history') !== 'false'

  // Candidatos: postulantes actuales + histórico (si se pide)
  let sql = `SELECT c.id FROM candidates c WHERE c.org_id = ? AND c.status = 'active'`
  const params: unknown[] = [user.org_id]
  if (!includeHistory) {
    sql += ` AND EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id AND a.job_id = ?)`
    params.push(jobId)
  }
  sql += ' LIMIT 500'
  const ids = (await c.env.DB.prepare(sql).bind(...params).all<any>()).results.map((x: any) => x.id)

  const evidence = await loadEvidence(c.env.DB, user.org_id, ids)
  const appliedRows = await c.env.DB.prepare('SELECT candidate_id FROM applications WHERE job_id = ? AND org_id = ?').bind(jobId, user.org_id).all<any>()
  const appliedSet = new Set(appliedRows.results.map((x: any) => x.candidate_id))

  const results = [...evidence.values()]
    .map((ev) => {
      const res = evaluateCandidate(criteria, ev)
      return { ...res, isApplicant: appliedSet.has(ev.id), available: ev.available, yearsExperience: ev.yearsExperience }
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  return c.json({
    job: { id: job.id, title: job.title },
    model_version: MODEL_VERSION,
    criteria_count: criteria.length,
    searched_pool: ids.length,
    from_history: results.filter((x) => !x.isApplicant).length,
    results: results.slice(0, 60),
    disclaimer: 'Estimación orientativa basada en la evidencia registrada. No es una decisión de contratación ni una medición de desempeño. Revisión humana obligatoria.'
  })
})

/* ------------------------------------------------------------------ */
/* Talent Memory: búsqueda histórica por capacidades                   */
/* ------------------------------------------------------------------ */

r.get('/memory/search', requireAuth, requirePermission('memory:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const q = cleanStr(c.req.query('q'), 200)
  const skill = cleanStr(c.req.query('skill'), 80)
  const location = cleanStr(c.req.query('location'), 80)
  const minYears = num(c.req.query('minYears'), -1)
  const onlyAvailable = c.req.query('available') === 'true'
  const onlyConsented = c.req.query('consented') === 'true'
  const excludeJob = intOrNull(c.req.query('excludeJob'))

  let sql = `SELECT c.id, c.full_name, c.headline, c.location, c.years_experience, c.availability,
      c.consent_status, c.updated_at, c.do_not_contact,
      (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = c.id) AS applications_count,
      (SELECT MAX(a.applied_at) FROM applications a WHERE a.candidate_id = c.id) AS last_applied_at,
      (SELECT GROUP_CONCAT(name, ' · ') FROM (SELECT name FROM candidate_skills WHERE candidate_id = c.id ORDER BY level DESC, years DESC LIMIT 6)) AS skills_text,
      (SELECT GROUP_CONCAT(title, ' · ') FROM (SELECT title FROM candidate_experiences WHERE candidate_id = c.id LIMIT 3)) AS experience_text,
      (SELECT GROUP_CONCAT(program, ' · ') FROM (SELECT program FROM candidate_education WHERE candidate_id = c.id LIMIT 2)) AS education_text
    FROM candidates c WHERE c.org_id = ? AND c.status = 'active'`
  const params: unknown[] = [user.org_id]

  if (q) {
    sql += ` AND (c.full_name LIKE ? OR c.headline LIKE ? OR c.summary LIKE ?
      OR EXISTS (SELECT 1 FROM candidate_skills s WHERE s.candidate_id = c.id AND s.name LIKE ?)
      OR EXISTS (SELECT 1 FROM candidate_experiences e WHERE e.candidate_id = c.id AND (e.title LIKE ? OR e.description LIKE ? OR e.company LIKE ?)))`
    for (let i = 0; i < 7; i++) params.push(`%${q}%`)
  }
  if (skill) { sql += ' AND EXISTS (SELECT 1 FROM candidate_skills s WHERE s.candidate_id = c.id AND s.name LIKE ?)'; params.push(`%${skill}%`) }
  if (location) { sql += ' AND c.location LIKE ?'; params.push(`%${location}%`) }
  if (minYears >= 0) { sql += ' AND c.years_experience >= ?'; params.push(minYears) }
  if (onlyAvailable) sql += " AND c.availability IS NOT NULL AND c.availability != ''"
  if (onlyConsented) sql += " AND c.consent_status = 'granted'"
  if (excludeJob) {
    sql += ' AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id AND a.job_id = ?)'
    params.push(excludeJob)
  }
  sql += ' ORDER BY c.updated_at DESC LIMIT 120'

  const rows = await c.env.DB.prepare(sql).bind(...params).all<any>()

  // Explicación de por qué aparece cada resultado + señales de vigencia
  const qTokens = tokens(q || '')
  const items = rows.results.map((row) => {
    const hay = normalize(`${row.skills_text ?? ''} ${row.experience_text ?? ''} ${row.education_text ?? ''} ${row.headline ?? ''}`)
    const matched = qTokens.filter((t) => hay.includes(t))
    const reasons: string[] = []
    if (skill) reasons.push(`Habilidad registrada que coincide con "${skill}"`)
    if (matched.length) reasons.push(`Coincide en: ${matched.slice(0, 4).join(', ')}`)
    if (row.location && location) reasons.push(`Ubicación: ${row.location}`)
    if (row.applications_count > 0) reasons.push(`Historial: ${row.applications_count} postulación(es) previa(s)`)
    else reasons.push('Perfil sin postulaciones previas (candidato histórico/importado)')
    if (row.do_not_contact) reasons.push('⚠ Pidió no ser contactado')
    if (row.consent_status !== 'granted') reasons.push('⚠ Consentimiento pendiente o revocado: no contactar sin base legal')
    const lastApplied = row.last_applied_at ? new Date(row.last_applied_at) : null
    const daysSince = lastApplied ? Math.floor((Date.now() - lastApplied.getTime()) / 86400000) : null
    if (daysSince !== null && daysSince > 365) reasons.push(`Última postulación hace ${Math.floor(daysSince / 365)} año(s): verificar disponibilidad`)

    return {
      id: row.id,
      fullName: row.full_name,
      headline: row.headline,
      location: row.location,
      yearsExperience: row.years_experience,
      availability: row.availability,
      consentStatus: row.consent_status,
      doNotContact: !!row.do_not_contact,
      applicationsCount: row.applications_count,
      lastAppliedAt: row.last_applied_at,
      daysSinceLastApplication: daysSince,
      skillsText: row.skills_text,
      experienceText: row.experience_text,
      educationText: row.education_text,
      reasons
    }
  })

  await audit(c.env.DB, user, 'memory_search', 'candidates', null, { q, skill, results: items.length })
  return c.json({
    query: { q, skill, location, minYears, onlyAvailable, onlyConsented, excludeJob },
    total: items.length,
    items,
    note: 'Resultados recuperados del histórico de la organización. La disponibilidad y el consentimiento deben verificarse antes de contactar.'
  })
})

/* ------------------------------------------------------------------ */
/* Recomendaciones históricas para una vacante (con persistencia)       */
/* ------------------------------------------------------------------ */

r.post('/jobs/:id/recommendations', requireAuth, requirePermission('memory:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const jobId = intOrNull(c.req.param('id'))
  if (!jobId) return jsonError(c, 400, 'ID inválido', 'validation')
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND org_id = ?').bind(jobId, user.org_id).first<any>()
  if (!job) return jsonError(c, 404, 'Vacante no encontrada', 'not_found')
  const criteria = await jobCriteria(c.env.DB, user.org_id, jobId)
  if (!criteria.length) return jsonError(c, 400, 'Define criterios de evaluación antes de generar recomendaciones', 'validation')

  const ids = (await c.env.DB.prepare(
    `SELECT c.id FROM candidates c WHERE c.org_id = ? AND c.status = 'active'
     AND c.consent_status = 'granted'
     AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id AND a.job_id = ?) LIMIT 400`
  ).bind(user.org_id, jobId).all<any>()).results.map((x: any) => x.id)

  const evidence = await loadEvidence(c.env.DB, user.org_id, ids)
  const scored = [...evidence.values()]
    .map((ev) => evaluateCandidate(criteria, ev))
    .filter((x) => x.score !== null && x.score >= 40)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 15)

  await c.env.DB.prepare('DELETE FROM recommendations WHERE job_id = ? AND org_id = ? AND origin = ?').bind(jobId, user.org_id, 'bulk').run()
  for (const s of scored) {
    await c.env.DB.prepare(
      `INSERT INTO recommendations (org_id, job_id, candidate_id, score, coverage, mandatory_status, factors, explanation, model_version, origin, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(user.org_id, jobId, s.candidateId, s.score, s.coverage, s.mandatoryStatus,
      JSON.stringify(s.factors), s.explanation, s.modelVersion, 'bulk', user.id).run()
  }
  await audit(c.env.DB, user, 'recommendations_generate', 'jobs', jobId, { count: scored.length, model: MODEL_VERSION })

  return c.json({
    generated: scored.length,
    model_version: MODEL_VERSION,
    candidates_evaluated: ids.length,
    results: scored,
    note: 'Solo se consideraron perfiles con consentimiento registrado y sin postulación previa a esta vacante.'
  })
})

r.get('/recommendations', requireAuth, requirePermission('memory:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const jobId = intOrNull(c.req.query('job_id'))
  let sql = `SELECT rc.*, c.full_name, j.title AS job_title FROM recommendations rc
    JOIN candidates c ON c.id = rc.candidate_id JOIN jobs j ON j.id = rc.job_id
    WHERE rc.org_id = ?`
  const params: unknown[] = [user.org_id]
  if (jobId) { sql += ' AND rc.job_id = ?'; params.push(jobId) }
  sql += ' ORDER BY rc.score DESC LIMIT 100'
  const rows = await c.env.DB.prepare(sql).bind(...params).all<any>()
  return c.json(rows.results.map((x: any) => ({ ...x, factors: parseJson(x.factors, []) })))
})

r.post('/recommendations/:id/feedback', requireAuth, requirePermission('memory:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const feedback = b?.feedback === 'useful' ? 'useful' : b?.feedback === 'incorrect' ? 'incorrect' : null
  if (!id || !feedback) return jsonError(c, 400, 'Indica si la recomendación fue útil o incorrecta', 'validation')
  const row = await c.env.DB.prepare('SELECT id FROM recommendations WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!row) return jsonError(c, 404, 'Recomendación no encontrada', 'not_found')
  await c.env.DB.prepare('UPDATE recommendations SET feedback = ?, feedback_reason = ? WHERE id = ? AND org_id = ?')
    .bind(feedback, cleanStr(b?.reason, 500) || null, id, user.org_id).run()
  await audit(c.env.DB, user, 'recommendation_feedback', 'recommendations', id, { feedback })
  return c.json({ ok: true })
})

export { loadEvidence, jobCriteria }
export default r
