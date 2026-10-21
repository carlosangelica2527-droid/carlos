/**
 * Rutas públicas (sin sesión): postulación desde la página de empleos.
 * Aislamiento: el org_id se deduce SIEMPRE de la vacante publicada, nunca del cliente.
 */
import { Hono } from 'hono'
import type { Env } from '../lib/auth'
import { cleanStr, isEmail, jsonError } from '../lib/util'
import { extractCv } from '../lib/ai'

const pub = new Hono<{ Bindings: Env }>()

// Límite defensivo: un CV de ~4.5MB en base64 cabe en el cuerpo aceptado.
const MAX_B64 = 4_500_000

pub.post('/public/apply', async (c) => {
  const db = c.env.DB
  const b = await c.req.json().catch(() => ({} as any))

  const jobId = Number(b?.job_id)
  const fullName = cleanStr(b?.full_name, 160)
  const email = cleanStr(b?.email, 160).toLowerCase()
  const cv = b?.cv && typeof b.cv === 'object' ? b.cv : null
  const cvText = cv && typeof cv.text === 'string' ? cv.text.trim().slice(0, 100000) : ''
  const hasBinary = !!(cv && typeof cv.base64 === 'string' && cv.base64.length > 100)

  if (!jobId) return jsonError(c, 400, 'Debes indicar la vacante', 'validation')
  if (!fullName) return jsonError(c, 400, 'El nombre completo es obligatorio', 'validation')
  if (!email || !isEmail(email)) return jsonError(c, 400, 'Indica un correo electrónico válido', 'validation')
  if (b?.consent_status !== 'granted') return jsonError(c, 400, 'Necesitamos tu autorización para tratar tus datos', 'validation')
  if (!hasBinary && cvText.length < 40) {
    return jsonError(c, 400, 'Adjunta tu CV en PDF, DOCX o TXT. Si es un PDF escaneado, pega el texto en el campo de respaldo.', 'cv_required')
  }

  const job = await db
    .prepare("SELECT id, org_id, title FROM jobs WHERE id = ? AND status = 'published'")
    .bind(jobId)
    .first<any>()
  if (!job) return jsonError(c, 404, 'La vacante no está disponible o ya se cerró', 'not_found')

  const stage = await db
    .prepare('SELECT id, name FROM job_stages WHERE job_id = ? AND org_id = ? ORDER BY position LIMIT 1')
    .bind(job.id, job.org_id)
    .first<any>()
  if (!stage) return jsonError(c, 500, 'La vacante no tiene etapas configuradas', 'config')

  const years = Math.max(0, Math.min(60, Number(b?.years_experience) || 0))
  const phone = cleanStr(b?.phone, 40) || null
  const location = cleanStr(b?.location, 120) || null
  const headline = cleanStr(b?.headline, 160) || null
  const salary = b?.salary_expectation != null && b.salary_expectation !== '' ? Number(b.salary_expectation) : null

  // Perfil único: se reutiliza por correo dentro de la organización.
  let candidateId: number
  let reused = false
  const existing = await db
    .prepare('SELECT id FROM candidates WHERE org_id = ? AND lower(email) = ?')
    .bind(job.org_id, email)
    .first<any>()

  if (existing) {
    candidateId = existing.id
    reused = true
    await db
      .prepare(
        `UPDATE candidates SET phone = COALESCE(?, phone), location = COALESCE(?, location),
           headline = COALESCE(?, headline), salary_expectation = COALESCE(?, salary_expectation),
           years_experience = MAX(years_experience, ?), consent_status = 'granted',
           consent_date = COALESCE(consent_date, datetime('now')), updated_at = datetime('now')
         WHERE id = ? AND org_id = ?`
      )
      .bind(phone, location, headline, salary, years, candidateId, job.org_id)
      .run()
  } else {
    const res = await db
      .prepare(
        `INSERT INTO candidates (org_id, full_name, email, phone, location, headline, years_experience,
           salary_expectation, source, consent_status, consent_basis, consent_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
      )
      .bind(
        job.org_id, fullName, email, phone, location, headline, years, salary,
        'pagina_publica', 'granted', 'Consentimiento otorgado en el formulario público de postulación'
      )
      .run()
    candidateId = Number(res.meta.last_row_id)
  }

  const dup = await db
    .prepare('SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?')
    .bind(job.id, candidateId)
    .first<any>()
  if (dup) {
    return c.json(
      { error: 'Ya registramos una postulación tuya a esta vacante. Te contactaremos si tu perfil avanza.', code: 'duplicate', application_id: dup.id },
      409
    )
  }

  const publicToken = crypto.randomUUID().replace(/-/g, '')
  const appRes = await db
    .prepare("INSERT INTO applications (org_id, job_id, candidate_id, stage_id, status, source, public_token) VALUES (?,?,?,?,'active','pagina_publica',?)")
    .bind(job.org_id, job.id, candidateId, stage.id, publicToken)
    .run()
  const applicationId = Number(appRes.meta.last_row_id)

  await db
    .prepare('INSERT INTO application_events (org_id, application_id, to_stage, action, note) VALUES (?,?,?,?,?)')
    .bind(job.org_id, applicationId, stage.name, 'created', 'Postulación recibida desde la página pública con CV adjunto')
    .run()

  /* ------------------------- Documento (CV) ------------------------- */
  const filename = cleanStr(cv?.filename, 200) || `cv-${candidateId}.pdf`
  const mime = cleanStr(cv?.mime, 100) || 'application/octet-stream'
  const size = Math.max(0, Number(cv?.size) || cvText.length)

  let r2Key: string | null = null
  if (hasBinary && c.env.R2) {
    const raw = String(cv!.base64)
    if (raw.length <= MAX_B64) {
      try {
        const bin = atob(raw)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        r2Key = `org-${job.org_id}/candidates/${candidateId}/${Date.now()}-${filename.replace(/[^A-Za-z0-9._-]/g, '_')}`
        await c.env.R2.put(r2Key, bytes, { httpMetadata: { contentType: mime } })
      } catch (e) {
        r2Key = null
      }
    }
  }

  await db
    .prepare(
      `INSERT INTO documents (org_id, candidate_id, kind, filename, mime, size, content_text, storage, r2_key, parse_note)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      job.org_id, candidateId, 'cv', filename, mime, size, cvText || null,
      r2Key ? 'r2' : 'd1-texto', r2Key,
      cvText ? null : 'Sin texto extraído (posible PDF escaneado); el archivo original quedó guardado.'
    )
    .run()

  /* ---- Habilidades detectadas del CV: quedan sin verificar (no deciden) ---- */
  let skillsFound = 0
  if (!reused && cvText.length >= 80) {
    try {
      const ex = await extractCv(c.env, cvText, fullName)
      for (const s of (ex.skills || []).slice(0, 18)) {
        const name = cleanStr(s.name, 80)
        if (!name) continue
        const seen = await db
          .prepare('SELECT id FROM candidate_skills WHERE candidate_id = ? AND lower(name) = lower(?)')
          .bind(candidateId, name)
          .first()
        if (seen) continue
        await db
          .prepare('INSERT INTO candidate_skills (org_id, candidate_id, name, level, years, source, verified) VALUES (?,?,?,?,?,?,0)')
          .bind(job.org_id, candidateId, name, 3, 0, 'cv')
          .run()
        skillsFound++
      }
    } catch (e) {
      /* La extracción nunca bloquea la postulación. */
    }
  }

  await db
    .prepare(
      `INSERT INTO audit_log (org_id, actor_id, actor_email, action, entity, entity_id, meta)
       VALUES (?, NULL, ?, 'public_application', 'applications', ?, ?)`
    )
    .bind(
      job.org_id, email, String(applicationId),
      JSON.stringify({ job_id: job.id, cv: r2Key ? 'r2' : 'd1-texto', chars: cvText.length, skills: skillsFound })
    )
    .run()

  return c.json(
    {
      ok: true,
      application_id: applicationId,
      candidate_id: candidateId,
      profile_reused: reused,
      cv_stored: r2Key ? 'r2' : 'd1-texto',
      cv_chars: cvText.length,
      skills_detected: skillsFound,
      stage: stage.name,
      portal_token: publicToken,
      portal_url: `/mi-postulacion/${publicToken}`
    },
    201
  )
})

export default pub
