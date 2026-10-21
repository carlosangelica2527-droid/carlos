import { Hono } from 'hono'
import { type Env, type SessionUser, requireAuth, requirePermission } from '../lib/auth'
import { audit, jsonError, cleanStr, intOrNull, num, normName, normPhone, isEmail, toCsv, parseJson } from '../lib/util'
import { extractCv, suggestSkills } from '../lib/ai'
import { normalize } from '../lib/match'

const r = new Hono<{ Bindings: Env }>()

async function loadProfile(db: D1Database, orgId: number, candId: number) {
  const candidate = await db.prepare('SELECT * FROM candidates WHERE id = ? AND org_id = ?').bind(candId, orgId).first<any>()
  if (!candidate) return null
  const skills = await db.prepare('SELECT * FROM candidate_skills WHERE candidate_id = ? AND org_id = ? ORDER BY level DESC, name').bind(candId, orgId).all()
  const experiences = await db.prepare('SELECT * FROM candidate_experiences WHERE candidate_id = ? AND org_id = ? ORDER BY start_date DESC').bind(candId, orgId).all()
  const education = await db.prepare('SELECT * FROM candidate_education WHERE candidate_id = ? AND org_id = ? ORDER BY year DESC').bind(candId, orgId).all()
  const documents = await db.prepare('SELECT id, kind, filename, mime, size, created_at, length(content_text) AS text_len FROM documents WHERE candidate_id = ? AND org_id = ? ORDER BY id DESC').bind(candId, orgId).all()
  const applications = await db.prepare(
    `SELECT a.*, j.title AS job_title, j.status AS job_status, s.name AS stage_name, s.kind AS stage_kind
     FROM applications a JOIN jobs j ON j.id = a.job_id LEFT JOIN job_stages s ON s.id = a.stage_id
     WHERE a.candidate_id = ? AND a.org_id = ? ORDER BY a.applied_at DESC`
  ).bind(candId, orgId).all()
  const notes = await db.prepare(
    `SELECT n.*, u.name AS author_name FROM notes n LEFT JOIN users u ON u.id = n.author_id
     WHERE n.candidate_id = ? AND n.org_id = ? ORDER BY n.id DESC LIMIT 100`
  ).bind(candId, orgId).all()
  const attempts = await db.prepare(
    `SELECT t.*, a.title AS assessment_title, a.type AS assessment_type FROM attempts t
     JOIN assessments a ON a.id = t.assessment_id WHERE t.candidate_id = ? AND t.org_id = ? ORDER BY t.id DESC`
  ).bind(candId, orgId).all()
  const interviews = await db.prepare(
    `SELECT i.*, j.title AS job_title FROM interviews i JOIN jobs j ON j.id = i.job_id
     WHERE i.candidate_id = ? AND i.org_id = ? ORDER BY i.scheduled_at DESC`
  ).bind(candId, orgId).all()
  const auditRows = await db.prepare(
    `SELECT actor_email, action, entity, entity_id, result, created_at FROM audit_log
     WHERE org_id = ? AND (
       (entity = 'candidates' AND entity_id = ?) OR
       (entity = 'applications' AND entity_id IN (SELECT id FROM applications WHERE candidate_id = ?))
     ) ORDER BY id DESC LIMIT 50`
  ).bind(orgId, String(candId), candId).all()

  return {
    ...candidate,
    skills: skills.results,
    experiences: experiences.results,
    education: education.results,
    documents: documents.results,
    applications: applications.results,
    notes: notes.results,
    attempts: attempts.results,
    interviews: interviews.results,
    audit: auditRows.results
  }
}

/* ---------------------------- SEARCH --------------------------- */

r.get('/candidates', requireAuth, requirePermission('candidates:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const q = cleanStr(c.req.query('q'), 120)
  const skill = cleanStr(c.req.query('skill'), 60)
  const location = cleanStr(c.req.query('location'), 80)
  const consent = cleanStr(c.req.query('consent'), 20)
  const minYears = num(c.req.query('minYears'), -1)
  const limit = Math.min(200, Math.max(1, num(c.req.query('limit'), 50)))
  const offset = Math.max(0, num(c.req.query('offset'), 0))

  let sql = `SELECT c.*,
      (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = c.id) AS application_count,
      (SELECT GROUP_CONCAT(name, ', ') FROM (SELECT name FROM candidate_skills WHERE candidate_id = c.id ORDER BY level DESC LIMIT 4)) AS top_skills
    FROM candidates c WHERE c.org_id = ?`
  const params: unknown[] = [user.org_id]

  if (q) { sql += ' AND (c.full_name LIKE ? OR c.email LIKE ? OR c.headline LIKE ? OR c.summary LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`) }
  if (skill) { sql += ' AND EXISTS (SELECT 1 FROM candidate_skills s WHERE s.candidate_id = c.id AND s.name LIKE ?)'; params.push(`%${skill}%`) }
  if (location) { sql += ' AND c.location LIKE ?'; params.push(`%${location}%`) }
  if (consent && ['granted', 'pending', 'revoked'].includes(consent)) { sql += ' AND c.consent_status = ?'; params.push(consent) }
  if (minYears >= 0) { sql += ' AND c.years_experience >= ?'; params.push(minYears) }

  sql += ' ORDER BY c.updated_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const rows = await c.env.DB.prepare(sql).bind(...params).all()
  const total = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM candidates WHERE org_id = ?').bind(user.org_id).first<any>()
  return c.json({ items: rows.results, total: total?.n ?? 0 })
})

/* --------------------------- DEDUPLICATE ----------------------- */

r.post('/candidates/check-duplicates', requireAuth, requirePermission('candidates:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const email = cleanStr(b?.email, 160).toLowerCase()
  const phone = normPhone(cleanStr(b?.phone, 40))
  const name = normName(cleanStr(b?.full_name, 160))
  if (!email && !phone && !name) return c.json({ matches: [] })

  const rows = await c.env.DB.prepare(
    `SELECT id, full_name, email, phone, location, years_experience, consent_status, updated_at
     FROM candidates WHERE org_id = ?`
  ).bind(user.org_id).all<any>()

  const matches = rows.results
    .map((row) => {
      let score = 0
      const reasons: string[] = []
      if (email && row.email && row.email.toLowerCase() === email) { score += 60; reasons.push('mismo correo') }
      if (phone && row.phone && normPhone(row.phone) === phone) { score += 30; reasons.push('mismo teléfono') }
      if (name && normName(row.full_name) === name) { score += 35; reasons.push('nombre idéntico') }
      else if (name && row.full_name && (normName(row.full_name).includes(name) || name.includes(normName(row.full_name)))) { score += 15; reasons.push('nombre similar') }
      return { ...row, score, reasons }
    })
    .filter((m) => m.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, 8)

  return c.json({ matches, threshold: 60, note: 'Coincidencias potenciales. Requieren revisión humana antes de fusionar.' })
})

/* ---------------------------- CREATE --------------------------- */

r.post('/candidates', requireAuth, requirePermission('candidates:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const fullName = cleanStr(b?.full_name, 160)
  if (!fullName) return jsonError(c, 400, 'El nombre completo es obligatorio', 'validation')
  const email = cleanStr(b?.email, 160).toLowerCase()
  if (email && !isEmail(email)) return jsonError(c, 400, 'El correo no tiene un formato válido', 'validation')
  if (b?.consent_status === 'granted' && !b?.consent_basis) return jsonError(c, 400, 'Si registras consentimiento debes indicar la base legal o finalidad', 'validation')

  // Prevención de duplicados por correo exacto dentro de la organización
  if (email) {
    const dup = await c.env.DB.prepare('SELECT id, full_name FROM candidates WHERE org_id = ? AND lower(email) = ?').bind(user.org_id, email).first<any>()
    if (dup && !b?.force) {
      return jsonError(c, 409, `Ya existe un perfil con ese correo (${dup.full_name}). Usa el perfil existente o confirma la creación con force=true.`, 'duplicate', { duplicate_id: dup.id })
    }
  }

  const res = await c.env.DB.prepare(
    `INSERT INTO candidates (org_id, full_name, email, phone, location, country, headline, summary,
      years_experience, availability, salary_expectation, source, consent_status, consent_basis, consent_date, retention_until, do_not_contact, is_demo)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    user.org_id, fullName,
    email || null,
    cleanStr(b?.phone, 40) || null,
    cleanStr(b?.location, 120) || null,
    cleanStr(b?.country, 3) || 'EC',
    cleanStr(b?.headline, 160) || null,
    cleanStr(b?.summary, 2000) || null,
    Math.max(0, Math.min(60, num(b?.years_experience))),
    cleanStr(b?.availability, 80) || null,
    b?.salary_expectation != null ? num(b.salary_expectation) : null,
    cleanStr(b?.source, 80) || 'manual',
    ['granted', 'pending', 'revoked'].includes(b?.consent_status) ? b.consent_status : 'pending',
    cleanStr(b?.consent_basis, 200) || null,
    b?.consent_status === 'granted' ? new Date().toISOString() : null,
    b?.retention_until ? cleanStr(b.retention_until, 30) : null,
    b?.do_not_contact ? 1 : 0,
    b?.is_demo ? 1 : 0
  ).run()

  const id = Number(res.meta.last_row_id)

  if (Array.isArray(b?.skills)) await replaceSkills(c.env, user.org_id, id, b.skills)
  if (Array.isArray(b?.experiences)) await insertExperiences(c.env, user.org_id, id, b.experiences)
  if (Array.isArray(b?.education)) await insertEducation(c.env, user.org_id, id, b.education)

  await audit(c.env.DB, user, 'candidate_create', 'candidates', id, { fullName })
  return c.json({ id }, 201)
})

async function replaceSkills(env: Env, orgId: number, candId: number, skills: any[], source = 'declarado') {
  await env.DB.prepare('DELETE FROM candidate_skills WHERE candidate_id = ? AND org_id = ?').bind(candId, orgId).run()
  const list = skills.slice(0, 40).filter((s) => s && typeof s.name === 'string' && s.name.trim())
  if (!list.length) return
  await env.DB.batch(list.map((s) => env.DB.prepare(
    'INSERT INTO candidate_skills (org_id, candidate_id, name, level, years, source, verified, evidence_ref) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(
    orgId, candId, cleanStr(s.name, 60),
    Math.max(1, Math.min(5, Math.round(num(s.level, 3)))),
    Math.max(0, num(s.years, 0)),
    cleanStr(s.source, 40) || source,
    s.verified ? 1 : 0,
    cleanStr(s.evidence_ref, 120) || null
  )))
}

async function insertExperiences(env: Env, orgId: number, candId: number, exp: any[]) {
  const list = exp.slice(0, 15).filter((e) => e && e.title)
  if (!list.length) return
  await env.DB.batch(list.map((e) => env.DB.prepare(
    'INSERT INTO candidate_experiences (org_id, candidate_id, title, company, start_date, end_date, is_current, description) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(orgId, candId, cleanStr(e.title, 120), cleanStr(e.company, 120) || null,
    cleanStr(e.start_date, 20) || null, cleanStr(e.end_date, 20) || null,
    e.is_current ? 1 : 0, cleanStr(e.description, 1000) || null)))
}

async function insertEducation(env: Env, orgId: number, candId: number, edu: any[]) {
  const list = edu.slice(0, 10).filter((e) => e && e.program)
  if (!list.length) return
  await env.DB.batch(list.map((e) => env.DB.prepare(
    'INSERT INTO candidate_education (org_id, candidate_id, program, institution, level, year) VALUES (?,?,?,?,?,?)'
  ).bind(orgId, candId, cleanStr(e.program, 160), cleanStr(e.institution, 160) || null,
    cleanStr(e.level, 60) || null, e.year ? Math.round(num(e.year)) : null)))
}

/* ---------------------------- DETAIL --------------------------- */

r.get('/candidates/:id', requireAuth, requirePermission('candidates:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const profile = await loadProfile(c.env.DB, user.org_id, id)
  if (!profile) return jsonError(c, 404, 'Candidato no encontrado en esta organización', 'not_found')
  await audit(c.env.DB, user, 'candidate_view', 'candidates', id, {})
  return c.json(profile)
})

r.patch('/candidates/:id', requireAuth, requirePermission('candidates:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const exists = await c.env.DB.prepare('SELECT id FROM candidates WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!exists) return jsonError(c, 404, 'Candidato no encontrado', 'not_found')

  const b = await c.req.json().catch(() => ({} as any))
  if (b?.email && !isEmail(String(b.email))) return jsonError(c, 400, 'Correo inválido', 'validation')

  const sets: string[] = []
  const vals: unknown[] = []
  const map: Record<string, (v: any) => unknown> = {
    full_name: (v) => cleanStr(v, 160),
    email: (v) => cleanStr(v, 160).toLowerCase() || null,
    phone: (v) => cleanStr(v, 40) || null,
    location: (v) => cleanStr(v, 120) || null,
    headline: (v) => cleanStr(v, 160) || null,
    summary: (v) => cleanStr(v, 2000) || null,
    availability: (v) => cleanStr(v, 80) || null,
    years_experience: (v) => Math.max(0, Math.min(60, num(v))),
    salary_expectation: (v) => (v === null ? null : num(v)),
    consent_status: (v) => (['granted', 'pending', 'revoked'].includes(v) ? v : 'pending'),
    consent_basis: (v) => cleanStr(v, 200) || null,
    do_not_contact: (v) => (v ? 1 : 0),
    retention_until: (v) => cleanStr(v, 30) || null
  }
  for (const [k, fn] of Object.entries(map)) {
    if (b?.[k] !== undefined) { sets.push(`${k} = ?`); vals.push(fn(b[k])) }
  }
  if (b?.consent_status === 'granted') { sets.push('consent_date = ?'); vals.push(new Date().toISOString()) }
  if (sets.length) {
    sets.push("updated_at = datetime('now')")
    vals.push(id, user.org_id)
    await c.env.DB.prepare(`UPDATE candidates SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).bind(...vals).run()
  }

  if (Array.isArray(b?.skills)) await replaceSkills(c.env, user.org_id, id, b.skills)
  if (Array.isArray(b?.experiences)) {
    await c.env.DB.prepare('DELETE FROM candidate_experiences WHERE candidate_id = ? AND org_id = ?').bind(id, user.org_id).run()
    await insertExperiences(c.env, user.org_id, id, b.experiences)
  }
  if (Array.isArray(b?.education)) {
    await c.env.DB.prepare('DELETE FROM candidate_education WHERE candidate_id = ? AND org_id = ?').bind(id, user.org_id).run()
    await insertEducation(c.env, user.org_id, id, b.education)
  }

  await audit(c.env.DB, user, 'candidate_update', 'candidates', id, { fields: Object.keys(b || {}) })
  return c.json({ ok: true })
})

/* ---------------------------- SKILLS --------------------------- */

r.post('/candidates/:id/skills', requireAuth, requirePermission('candidates:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const name = cleanStr(b?.name, 60)
  if (!id || !name) return jsonError(c, 400, 'Nombre de habilidad obligatorio', 'validation')
  const exists = await c.env.DB.prepare('SELECT id FROM candidates WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!exists) return jsonError(c, 404, 'Candidato no encontrado', 'not_found')
  const dup = await c.env.DB.prepare('SELECT id FROM candidate_skills WHERE candidate_id = ? AND lower(name) = lower(?)').bind(id, name).first()
  if (dup) return jsonError(c, 409, 'Esa habilidad ya está registrada', 'conflict')
  const res = await c.env.DB.prepare('INSERT INTO candidate_skills (org_id, candidate_id, name, level, years, source, verified) VALUES (?,?,?,?,?,?,?)')
    .bind(user.org_id, id, name, Math.max(1, Math.min(5, Math.round(num(b?.level, 3)))), Math.max(0, num(b?.years)), cleanStr(b?.source, 40) || 'declarado', b?.verified ? 1 : 0).run()
  await audit(c.env.DB, user, 'skill_add', 'candidates', id, { name })
  return c.json({ id: res.meta.last_row_id }, 201)
})

r.delete('/candidates/:id/skills/:skillId', requireAuth, requirePermission('candidates:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const sid = intOrNull(c.req.param('skillId'))
  if (!id || !sid) return jsonError(c, 400, 'ID inválido', 'validation')
  await c.env.DB.prepare('DELETE FROM candidate_skills WHERE id = ? AND candidate_id = ? AND org_id = ?').bind(sid, id, user.org_id).run()
  await audit(c.env.DB, user, 'skill_remove', 'candidates', id, { skill_id: sid })
  return c.json({ ok: true })
})

/* --------------------------- DOCUMENTS ------------------------- */

r.post('/candidates/:id/documents', requireAuth, requirePermission('documents:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const cand = await c.env.DB.prepare('SELECT id FROM candidates WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!cand) return jsonError(c, 404, 'Candidato no encontrado', 'not_found')

  const b = await c.req.json().catch(() => ({} as any))
  const filename = cleanStr(b?.filename, 200)
  const text = typeof b?.text === 'string' ? b.text.slice(0, 120000) : ''
  if (!filename) return jsonError(c, 400, 'Nombre de archivo obligatorio', 'validation')
  if (!text) return jsonError(c, 400, 'No se recibió texto del documento. Si es un PDF escaneado, pega el contenido manualmente.', 'validation')

  const res = await c.env.DB.prepare(
    'INSERT INTO documents (org_id, candidate_id, kind, filename, mime, size, content_text, storage) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(user.org_id, id, cleanStr(b?.kind, 20) || 'cv', filename, cleanStr(b?.mime, 80) || 'text/plain',
    text.length, text, 'd1-privado').run()

  await audit(c.env.DB, user, 'document_upload', 'candidates', id, { filename, chars: text.length })
  return c.json({ id: res.meta.last_row_id, note: 'Documento almacenado de forma privada y ligada a la organización. No se generan enlaces públicos.' }, 201)
})

r.get('/candidates/:id/documents/:docId', requireAuth, requirePermission('candidates:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const did = intOrNull(c.req.param('docId'))
  const doc = await c.env.DB.prepare('SELECT filename, content_text FROM documents WHERE id = ? AND candidate_id = ? AND org_id = ?')
    .bind(did, id, user.org_id).first<any>()
  if (!doc) return jsonError(c, 404, 'Documento no encontrado', 'not_found')
  await audit(c.env.DB, user, 'document_view', 'candidates', id, { doc: did })
  return c.json({ filename: doc.filename, text: doc.content_text })
})

/* ------------------------- CV EXTRACTION ----------------------- */

r.post('/cv/extract', requireAuth, requirePermission('candidates:write'), async (c) => {
  const b = await c.req.json().catch(() => ({} as any))
  const text = typeof b?.text === 'string' ? b.text.trim() : ''
  if (text.length < 30) return jsonError(c, 400, 'El texto del currículum es demasiado corto para extraer datos', 'validation')
  const extraction = await extractCv(c.env, text, cleanStr(b?.name_hint, 120) || undefined)
  return c.json(extraction)
})

r.post('/candidates/:id/suggest-skills', requireAuth, requirePermission('candidates:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'ID inválido', 'validation')
  const cand = await c.env.DB.prepare('SELECT summary, headline FROM candidates WHERE id = ? AND org_id = ?').bind(id, user.org_id).first<any>()
  if (!cand) return jsonError(c, 404, 'Candidato no encontrado', 'not_found')
  const existing = await c.env.DB.prepare('SELECT name FROM candidate_skills WHERE candidate_id = ?').bind(id).all<any>()
  const doc = await c.env.DB.prepare("SELECT content_text FROM documents WHERE candidate_id = ? AND org_id = ? ORDER BY id DESC LIMIT 1").bind(id, user.org_id).first<any>()
  const text = `${cand.headline ?? ''}\n${cand.summary ?? ''}\n${doc?.content_text?.slice(0, 6000) ?? ''}`
  const suggestions = await suggestSkills(c.env, text, existing.results.map((s) => s.name))
  if (!suggestions.length) {
    return c.json({ suggestions: [], configured: false, note: 'No hay proveedor de IA configurado o no devolvió sugerencias. Puedes agregar habilidades manualmente.' })
  }
  return c.json({ suggestions, configured: true })
})

/* ----------------------------- NOTES --------------------------- */

r.post('/candidates/:id/notes', requireAuth, requirePermission('notes:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const body = cleanStr(b?.body, 2000)
  if (!id || !body) return jsonError(c, 400, 'La nota no puede estar vacía', 'validation')
  const exists = await c.env.DB.prepare('SELECT id FROM candidates WHERE id = ? AND org_id = ?').bind(id, user.org_id).first()
  if (!exists) return jsonError(c, 404, 'Candidato no encontrado', 'not_found')
  const res = await c.env.DB.prepare('INSERT INTO notes (org_id, candidate_id, application_id, body, visibility, author_id) VALUES (?,?,?,?,?,?)')
    .bind(user.org_id, id, intOrNull(b?.application_id), body, b?.visibility === 'candidate' ? 'candidate' : 'internal', user.id).run()
  await audit(c.env.DB, user, 'note_create', 'candidates', id, { visibility: b?.visibility ?? 'internal' })
  return c.json({ id: res.meta.last_row_id }, 201)
})

/* ---------------------------- CONSENT -------------------------- */

r.post('/candidates/:id/consent', requireAuth, requirePermission('privacy:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const id = intOrNull(c.req.param('id'))
  const b = await c.req.json().catch(() => ({} as any))
  const status = ['granted', 'pending', 'revoked'].includes(b?.status) ? b.status : null
  if (!id || !status) return jsonError(c, 400, 'Estado de consentimiento inválido', 'validation')
  if (status === 'granted' && !cleanStr(b?.basis, 200)) return jsonError(c, 400, 'Indica la base legal o finalidad del tratamiento', 'validation')
  await c.env.DB.prepare('UPDATE candidates SET consent_status = ?, consent_basis = ?, consent_date = ?, updated_at = datetime(\'now\') WHERE id = ? AND org_id = ?')
    .bind(status, cleanStr(b?.basis, 200) || null, status === 'granted' ? new Date().toISOString() : null, id, user.org_id).run()
  await audit(c.env.DB, user, 'consent_change', 'candidates', id, { status, basis: b?.basis ?? null })
  return c.json({ ok: true })
})

/* ---------------------------- EXPORT --------------------------- */

r.get('/candidates-export.csv', requireAuth, requirePermission('candidates:read'), async (c) => {
  const user = c.get('user') as SessionUser
  const rows = await c.env.DB.prepare(
    `SELECT c.full_name, c.email, c.phone, c.location, c.headline, c.years_experience, c.consent_status, c.available_for_work AS availability FROM candidates c WHERE c.org_id = ?`
  ).bind(user.org_id).all<any>().catch(async () => {
    // columna availability no existe; fallback
    return c.env.DB.prepare(
      `SELECT full_name, email, phone, location, headline, years_experience, consent_status FROM candidates WHERE org_id = ?`
    ).bind(user.org_id).all<any>()
  })
  await audit(c.env.DB, user, 'candidates_export', 'candidates', null, { rows: rows.results.length, format: 'csv' })
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', 'attachment; filename="candidatos-quipu.csv"')
  // Minimización: no se exportan notas internas ni documentos
  return c.body(toCsv(rows.results as any[]))
})

/* ---------------------------- MERGE ---------------------------- */

r.post('/candidates/merge', requireAuth, async (c) => {
  const user = c.get('user') as SessionUser
  if (user.role !== 'admin' && user.role !== 'recruiter') return jsonError(c, 403, 'Solo administradores o reclutadores pueden fusionar perfiles', 'forbidden')
  const b = await c.req.json().catch(() => ({} as any))
  const keepId = intOrNull(b?.keep_id)
  const mergeId = intOrNull(b?.merge_id)
  if (!keepId || !mergeId || keepId === mergeId) return jsonError(c, 400, 'Debes indicar dos perfiles distintos', 'validation')

  const keep = await c.env.DB.prepare('SELECT * FROM candidates WHERE id = ? AND org_id = ?').bind(keepId, user.org_id).first<any>()
  const merge = await c.env.DB.prepare('SELECT * FROM candidates WHERE id = ? AND org_id = ?').bind(mergeId, user.org_id).first<any>()
  if (!keep || !merge) return jsonError(c, 404, 'Uno de los perfiles no existe en tu organización', 'not_found')

  // Reasignar postulaciones evitando conflicto de unicidad (job_id, candidate_id)
  const apps = await c.env.DB.prepare('SELECT id, job_id FROM applications WHERE candidate_id = ? AND org_id = ?').bind(mergeId, user.org_id).all<any>()
  for (const a of apps.results) {
    const clash = await c.env.DB.prepare('SELECT id FROM applications WHERE job_id = ? AND candidate_id = ? AND org_id = ?').bind(a.job_id, keepId, user.org_id).first<any>()
    if (clash) {
      await c.env.DB.prepare('UPDATE applications SET candidate_id = ? WHERE id = ?').bind(keepId, a.id).run()
      // se conserva el registro; se marca en el evento
      await c.env.DB.prepare('INSERT INTO application_events (org_id, application_id, action, actor_id, note) VALUES (?,?,?,?,?)')
        .bind(user.org_id, a.id, 'merge_note', user.id, `Postulación duplicada fusionada desde el perfil #${mergeId}`).run()
    } else {
      await c.env.DB.prepare('UPDATE applications SET candidate_id = ? WHERE id = ?').bind(keepId, a.id).run()
    }
  }
  await c.env.DB.prepare('UPDATE notes SET candidate_id = ? WHERE candidate_id = ? AND org_id = ?').bind(keepId, mergeId, user.org_id).run()
  await c.env.DB.prepare('UPDATE attempts SET candidate_id = ? WHERE candidate_id = ? AND org_id = ?').bind(keepId, mergeId, user.org_id).run()
  await c.env.DB.prepare('UPDATE interviews SET candidate_id = ? WHERE candidate_id = ? AND org_id = ?').bind(keepId, mergeId, user.org_id).run()
  await c.env.DB.prepare('UPDATE documents SET candidate_id = ? WHERE candidate_id = ? AND org_id = ?').bind(keepId, mergeId, user.org_id).run()
  await c.env.DB.prepare('UPDATE candidate_skills SET candidate_id = ? WHERE candidate_id = ? AND org_id = ?').bind(keepId, mergeId, user.org_id).run()
  await c.env.DB.prepare('UPDATE candidate_experiences SET candidate_id = ? WHERE candidate_id = ? AND org_id = ?').bind(keepId, mergeId, user.org_id).run()
  await c.env.DB.prepare('UPDATE candidate_education SET candidate_id = ? WHERE candidate_id = ? AND org_id = ?').bind(keepId, mergeId, user.org_id).run()
  await c.env.DB.prepare('UPDATE recommendations SET candidate_id = ? WHERE candidate_id = ? AND org_id = ?').bind(keepId, mergeId, user.org_id).run()
  await c.env.DB.prepare("UPDATE candidates SET status = 'merged', updated_at = datetime('now') WHERE id = ? AND org_id = ?").bind(mergeId, user.org_id).run()

  await audit(c.env.DB, user, 'candidate_merge', 'candidates', keepId, { merged: mergeId, merged_name: merge.full_name })
  return c.json({ ok: true, kept: keepId, merged: mergeId })
})

/* ------------------------- IMPORT (CSV) ------------------------ */

r.post('/candidates/import/preview', requireAuth, requirePermission('candidates:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const csv = typeof b?.csv === 'string' ? b.csv : ''
  if (!csv.trim()) return jsonError(c, 400, 'No se recibió contenido CSV', 'validation')
  const parsed = parseCsv(csv)
  if (!parsed.rows.length) return jsonError(c, 400, 'El CSV no tiene filas de datos', 'validation')

  const headers = parsed.headers
  const nameKey = headers.find((h) => /nombre|name/i.test(h))
  const emailKey = headers.find((h) => /correo|email|mail/i.test(h))
  const phoneKey = headers.find((h) => /telefono|phone|celular/i.test(h))
  const yearsKey = headers.find((h) => /años|years|experiencia/i.test(h))
  const skillsKey = headers.find((h) => /habilidad|skill|competen/i.test(h))
  const locKey = headers.find((h) => /ubicacion|location|ciudad/i.test(h))

  if (!nameKey) return jsonError(c, 400, 'No se encontró una columna de nombre. Columnas detectadas: ' + headers.join(', '), 'validation')

  const existing = await c.env.DB.prepare('SELECT id, full_name, email FROM candidates WHERE org_id = ?').bind(user.org_id).all<any>()
  const byEmail = new Map(existing.results.filter((x: any) => x.email).map((x: any) => [String(x.email).toLowerCase(), x]))
  const byName = new Set(existing.results.map((x: any) => normName(x.full_name)))

  const rows = parsed.rows.slice(0, 500).map((row, i) => {
    const name = (row[nameKey] || '').trim()
    const email = (row[emailKey || ''] || '').trim().toLowerCase()
    const errors: string[] = []
    if (!name) errors.push('Fila sin nombre')
    if (email && !isEmail(email)) errors.push('Correo inválido')
    const duplicate = (email && byEmail.has(email)) || (!email && name && byName.has(normName(name)))
    return {
      line: i + 2,
      data: {
        full_name: name,
        email: email || null,
        phone: (row[phoneKey || ''] || '').trim() || null,
        years_experience: yearsKey ? num(row[yearsKey]) : 0,
        location: (row[locKey || ''] || '').trim() || null,
        skills: skillsKey ? String(row[skillsKey] || '').split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : []
      },
      errors,
      duplicate: !!duplicate,
      action: errors.length ? 'rechazar' : duplicate ? 'omitir (ya existe)' : 'importar'
    }
  })

  const summary = {
    total: rows.length,
    accepted: rows.filter((x) => x.action === 'importar').length,
    duplicates: rows.filter((x) => x.duplicate).length,
    rejected: rows.filter((x) => x.errors.length).length
  }
  return c.json({ headers, mapping: { name: nameKey, email: emailKey ?? null, phone: phoneKey ?? null, years: yearsKey ?? null, skills: skillsKey ?? null, location: locKey ?? null }, rows, summary })
})

r.post('/candidates/import', requireAuth, requirePermission('candidates:write'), async (c) => {
  const user = c.get('user') as SessionUser
  const b = await c.req.json().catch(() => ({} as any))
  const rows = Array.isArray(b?.rows) ? b.rows : []
  if (!rows.length) return jsonError(c, 400, 'No hay filas para importar', 'validation')
  if (rows.length > 500) return jsonError(c, 400, 'Máximo 500 filas por importación', 'validation')

  let created = 0, skipped = 0
  const errors: { line: number; message: string }[] = []
  for (const row of rows) {
    const d = row?.data ?? row
    const name = cleanStr(d?.full_name, 160)
    if (!name) { errors.push({ line: row?.line ?? 0, message: 'Sin nombre' }); continue }
    const email = cleanStr(d?.email, 160).toLowerCase()
    if (email && !isEmail(email)) { errors.push({ line: row?.line ?? 0, message: 'Correo inválido' }); continue }
    if (email) {
      const dup = await c.env.DB.prepare('SELECT id FROM candidates WHERE org_id = ? AND lower(email) = ?').bind(user.org_id, email).first()
      if (dup) { skipped++; continue }
    }
    const res = await c.env.DB.prepare(
      `INSERT INTO candidates (org_id, full_name, email, phone, location, years_experience, source, consent_status, is_demo)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(user.org_id, name, email || null, cleanStr(d?.phone, 40) || null, cleanStr(d?.location, 120) || null,
      Math.max(0, num(d?.years_experience)), 'importacion', 'pending', b?.is_demo ? 1 : 0).run()
    const id = Number(res.meta.last_row_id)
    created++
    if (Array.isArray(d?.skills) && d.skills.length) {
      await replaceSkills(c.env, user.org_id, id, d.skills.map((s: string) => ({ name: s, level: 3 })), 'importacion')
    }
  }
  await audit(c.env.DB, user, 'candidates_import', 'candidates', null, { created, skipped, errors: errors.length })
  return c.json({ created, skipped, errors, note: 'Las filas omitidas no se borraron: siguen existiendo en el perfil previo.' })
})

export function parseCsv(input: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()
  const delimiter = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ','
  const lines = splitCsvLines(text, delimiter)
  if (!lines.length) return { headers: [], rows: [] }
  const headers = lines[0].map((h) => h.trim())
  const rows = lines.slice(1).filter((l) => l.some((x) => x.trim() !== '')).map((l) => {
    const o: Record<string, string> = {}
    headers.forEach((h, i) => { o[h] = (l[i] ?? '').trim() })
    return o
  })
  return { headers, rows }
}

function splitCsvLines(text: string, delim: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delim) { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); out.push(row); row = []; field = '' }
    else field += ch
  }
  if (field !== '' || row.length) { row.push(field); out.push(row) }
  return out
}

export { loadProfile }
export default r
