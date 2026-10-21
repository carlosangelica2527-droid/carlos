/**
 * QUIPU · Motor de compatibilidad explicable (Smart Match)
 * Módulo puro: sin acceso a red ni a D1, 100% testeable.
 *
 * Reglas del documento de requerimientos:
 *  - Separar requisitos excluyentes (obligatorios) de criterios ponderados.
 *  - No asignar cero cuando falta evidencia: estado 'sin_evaluar'.
 *  - Mostrar evidencia, fuente y confianza por criterio.
 *  - Nunca presentar el resultado como decisión: es una ayuda para revisar.
 *  - Habilidades transferibles sin depender de coincidencia exacta de palabras.
 *  - Determinista: mismos datos => mismo puntaje (redondeado a entero).
 */

export type CriterionKind = 'mandatory' | 'weighted'
export type CriterionCategory = 'experience' | 'technical' | 'competency' | 'education' | 'other'
export type CriterionStatus = 'cumple' | 'parcial' | 'no_cumple' | 'sin_evaluar'

export interface Criterion {
  id: number
  kind: CriterionKind
  category: CriterionCategory
  label: string
  weight: number
  keywords: string[]
  minYears?: number | null
  description?: string | null
}

export interface SkillInput {
  name: string
  level: number
  years: number
  verified: boolean
  source: string
}

export interface ExperienceInput {
  title: string
  company?: string | null
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  isCurrent?: boolean
}

export interface AssessmentEvidence {
  title: string
  score: number
  maxScore: number
  submittedAt: string
  version?: number
}

export interface CandidateEvidence {
  id: number
  fullName: string
  yearsExperience: number
  skills: SkillInput[]
  experiences: ExperienceInput[]
  education: { program: string; institution?: string | null; level?: string | null }[]
  assessments: AssessmentEvidence[]
  available?: boolean
}

export interface FactorResult {
  criterionId: number
  label: string
  kind: CriterionKind
  category: CriterionCategory
  weight: number
  status: CriterionStatus
  /** 0..1, null cuando no hay evidencia suficiente */
  score: number | null
  confidence: 'alta' | 'media' | 'baja'
  evidence: string[]
  gaps: string[]
  note?: string
}

export interface MatchResult {
  candidateId: number
  candidateName: string
  /** 0..100 sobre la ponderación efectivamente evaluada, null si no hay nada evaluable */
  score: number | null
  /** 0..1 proporción del peso total que pudo evaluarse */
  coverage: number
  mandatoryStatus: 'cumple' | 'revisar' | 'falta_verificar' | 'no_cumple'
  factors: FactorResult[]
  explanation: string
  modelVersion: string
  /** señal de revisión humana obligatoria */
  requiresReview: boolean
}

export const MODEL_VERSION = 'quipu-match-1.1'

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+#. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'con', 'para', 'por', 'un', 'una',
  'al', 'del', 'se', 'que', 'a', 'e', 'the', 'and', 'of', 'to', 'in', 'for'
])

export function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/**
 * Familias de habilidades: permiten detectar habilidades transferibles.
 * Si el criterio pide una habilidad de la familia y el candidato tiene otra
 * de la misma familia, se reconoce como evidencia parcial (no como coincidencia plena).
 */
export const SKILL_FAMILIES: Record<string, string[]> = {
  bi: ['power bi', 'tableau', 'looker', 'qlik', 'qlikview', 'metabase', 'bi'],
  sql: ['sql', 'mysql', 'postgresql', 'postgres', 'sql server', 'oracle', 'sqlite', 'mariadb'],
  python_data: ['python', 'pandas', 'numpy', 'jupyter', 'scipy'],
  js: ['javascript', 'typescript', 'node', 'nodejs', 'react', 'vue', 'angular'],
  cloud: ['aws', 'azure', 'gcp', 'google cloud', 'cloudflare'],
  erp: ['sap', 'oracle erp', 'dynamics', 'odoo', 'netsuite'],
  accounting: ['contabilidad', 'niif', 'ifrs', 'conciliacion', 'auditoria', 'tributacion', 'sri'],
  payroll: ['nomina', 'rol de pagos', 'iess', 'planillas'],
  excel: ['excel', 'hojas de calculo', 'google sheets', 'spreadsheet'],
  crm: ['salesforce', 'hubspot', 'pipedrive', 'crm'],
  pm: ['gestion de proyectos', 'scrum', 'agile', 'kanban', 'pmp'],
  marketing: ['seo', 'sem', 'google ads', 'meta ads', 'marketing digital', 'analitica web'],
  hr: ['reclutamiento', 'seleccion', 'talento humano', 'rrhh', 'entrevistas'],
  customer: ['atencion al cliente', 'servicio al cliente', 'soporte', 'call center'],
  languages_en: ['ingles', 'english'],
  languages_pt: ['portugues', 'portuguese'],
  logistics: ['logistica', 'supply chain', 'cadena de suministro', 'inventarios'],
  sales: ['ventas', 'comercial', 'negociacion', 'b2b'],
  qa: ['testing', 'qa', 'pruebas de software', 'selenium'],
  devops: ['docker', 'kubernetes', 'ci cd', 'terraform', 'devops'],
  design: ['figma', 'ux', 'ui', 'diseno de producto', 'sketch'],
  dataeng: ['etl', 'airflow', 'dbt', 'data warehouse', 'spark'],
}

const FAMILY_INDEX: Map<string, string> = (() => {
  const map = new Map<string, string>()
  for (const [family, items] of Object.entries(SKILL_FAMILIES)) {
    for (const item of items) map.set(normalize(item), family)
  }
  return map
})()

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Coincidencia por palabra completa: evita falsos positivos como "habilidad" ⊃ "bi". */
function containsWord(hay: string, needle: string): boolean {
  if (!needle) return false
  return new RegExp(`(^|[^a-z0-9])${escapeRe(needle)}([^a-z0-9]|$)`).test(hay)
}

export function familyOf(term: string): string | null {
  const n = normalize(term)
  if (!n) return null
  if (FAMILY_INDEX.has(n)) return FAMILY_INDEX.get(n)!

  // coincidencia parcial solo por palabra completa y con términos de 3+ caracteres
  let best: { family: string; len: number } | null = null
  for (const [item, family] of FAMILY_INDEX.entries()) {
    if (item.length < 3) continue
    if (containsWord(n, item) || containsWord(item, n)) {
      if (!best || item.length > best.len) best = { family, len: item.length }
    }
  }
  return best ? best.family : null
}

/* ------------------------------------------------------------------ */
/* Evaluación por criterio                                             */
/* ------------------------------------------------------------------ */

interface CriterionEvaluation {
  status: CriterionStatus
  score: number | null
  confidence: 'alta' | 'media' | 'baja'
  evidence: string[]
  gaps: string[]
  note?: string
}

const LEVEL_LABEL = ['', 'básico', 'elemental', 'intermedio', 'avanzado', 'experto']

function scoreFromSkillLevel(skill: SkillInput): number {
  const base = Math.min(1, 0.35 + skill.level * 0.13) // nivel 1 → 0.48, 5 → 1
  return skill.verified ? Math.min(1, base + 0.12) : base
}

function evaluateCriterion(c: Criterion, cand: CandidateEvidence): CriterionEvaluation {
  const keywords = (c.keywords || []).filter(Boolean)
  const haystackSkills = cand.skills.map((s) => ({ ...s, norm: normalize(s.name) }))
  const expText = cand.experiences
    .map((e) => `${e.title} ${e.company ?? ''} ${e.description ?? ''}`)
    .join(' ')
  const expNorm = normalize(expText)
  const eduNorm = normalize(cand.education.map((e) => `${e.program} ${e.institution ?? ''} ${e.level ?? ''}`).join(' '))

  // --- Criterios por años de experiencia ---
  if (c.category === 'experience' && c.minYears != null) {
    const years = cand.yearsExperience || 0
    const relevant = keywords.length
      ? keywords.some((k) => expNorm.includes(normalize(k))) || haystackSkills.some((s) => keywords.some((k) => s.norm.includes(normalize(k))))
      : true
    if (!relevant) {
      return {
        status: 'sin_evaluar',
        score: null,
        confidence: 'baja',
        evidence: [],
        gaps: ['No hay experiencia declarada relacionada con ' + keywords.join(', ')],
        note: 'Sin evidencia suficiente; requiere verificación manual'
      }
    }
    const ev = [`Experiencia declarada: ${years} años`]
    if (years >= c.minYears) return { status: 'cumple', score: 1, confidence: 'media', evidence: ev, gaps: [] }
    if (years >= c.minYears * 0.6) {
      return {
        status: 'parcial',
        score: Math.max(0.3, years / c.minYears),
        confidence: 'media',
        evidence: ev,
        gaps: [`Se piden ${c.minYears} años y se declaran ${years}`]
      }
    }
    return { status: 'no_cumple', score: 0, confidence: 'media', evidence: ev, gaps: [`Se piden ${c.minYears} años y se declaran ${years}`] }
  }

  // --- Criterios de formación ---
  if (c.category === 'education') {
    if (!eduNorm) {
      return { status: 'sin_evaluar', score: null, confidence: 'baja', evidence: [], gaps: ['Sin formación registrada'] }
    }
    const terms = keywords.length ? keywords : tokens(c.label)
    const hit = terms.find((k) => eduNorm.includes(normalize(k)))
    if (hit) {
      const edu = cand.education.find((e) => normalize(`${e.program} ${e.institution ?? ''} ${e.level ?? ''}`).includes(normalize(hit)))
      return {
        status: 'cumple',
        score: 1,
        confidence: 'media',
        evidence: [edu ? `${edu.program}${edu.institution ? ' · ' + edu.institution : ''} (declarado)` : `Coincide con "${hit}"`],
        gaps: []
      }
    }
    const famHit = terms.map((t) => familyOf(t)).find(Boolean)
    if (famHit) {
      // Solo cuenta como formación relacionada si el título acredita OTRA habilidad
      // de la misma familia (no basta con que el propio término pertenezca a la familia).
      const sibling = SKILL_FAMILIES[famHit].find((item) => {
        const ni = normalize(item)
        return !terms.some((t) => normalize(t) === ni) && containsWord(eduNorm, ni)
      })
      if (sibling) {
        return {
          status: 'parcial',
          score: 0.55,
          confidence: 'baja',
          evidence: [`Formación relacionada: ${sibling}`],
          gaps: [`No se acredita "${c.label}"`]
        }
      }
    }
    return { status: 'no_cumple', score: 0, confidence: 'baja', evidence: (cand.education[0] ? [cand.education[0].program] : []), gaps: [`No se acredita "${c.label}"`] }
  }

  // --- Resto: habilidades / competencias / otros (conceptos) ---
  const terms = keywords.length ? keywords : tokens(c.label)
  if (!terms.length) {
    return { status: 'sin_evaluar', score: null, confidence: 'baja', evidence: [], gaps: ['Criterio sin palabras clave'] }
  }

  let best: { score: number; status: CriterionStatus; evidence: string[]; confidence: 'alta' | 'media' | 'baja' } | null = null

  for (const term of terms) {
    const t = normalize(term)
    // 1) coincidencia directa con habilidad registrada
    const direct = haystackSkills.filter((s) => s.norm.includes(t) || t.includes(s.norm))
    if (direct.length) {
      const skill = direct.sort((a, b) => b.level - a.level)[0]
      const sc = scoreFromSkillLevel(skill)
      const ev = [`${skill.name} · nivel ${LEVEL_LABEL[skill.level]}${skill.verified ? ' · verificado con prueba' : ' · declarado'}${skill.years ? ` · ${skill.years} años` : ''}`]
      const confidence: 'alta' | 'media' | 'baja' = skill.verified ? 'alta' : skill.source.includes('prueba') ? 'alta' : 'media'
      const status: CriterionStatus = sc >= 0.8 ? 'cumple' : sc >= 0.45 ? 'parcial' : 'no_cumple'
      if (!best || sc > best.score) best = { score: sc, status, evidence: ev, confidence }
      continue
    }
    // 2) evidencia en experiencia / educación (texto)
    if (expNorm.includes(t)) {
      const exp = cand.experiences.find((e) => normalize(`${e.title} ${e.description ?? ''}`).includes(t))
      const ev = [exp ? `Evidencia en experiencia: ${exp.title}${exp.company ? ' · ' + exp.company : ''}` : 'Mencionado en experiencia declarada']
      if (!best || 0.7 > best.score) best = { score: 0.7, status: 'parcial', evidence: ev, confidence: 'media' }
      continue
    }
    // 3) habilidad transferible dentro de la misma familia
    const fam = familyOf(term)
    if (fam) {
      const sibling = haystackSkills.find((s) => familyOf(s.name) === fam)
      if (sibling) {
        const ev = [`Habilidad transferible: ${sibling.name} (familia ${fam}) en lugar de "${term}"`]
        if (!best || 0.55 > best.score) best = { score: 0.55, status: 'parcial', evidence: ev, confidence: 'baja' }
        continue
      }
    }
    // 4) token parcial en cualquier parte
    const partial = tokens(term).some((tk) => expNorm.includes(tk) || haystackSkills.some((s) => s.norm.includes(tk)))
    if (partial && (!best || 0.4 > best.score)) {
      best = { score: 0.4, status: 'parcial', evidence: ['Coincidencia parcial de texto; requiere verificación'], confidence: 'baja' }
    }
  }

  if (!best) {
    // Antes de declarar "sin evidencia", revisar si una prueba práctica cubre el criterio.
    const probeOnly = cand.assessments.find((a) => {
      const t = normalize(a.title)
      return terms.some((term) => containsWord(t, normalize(term))) && a.maxScore > 0
    })
    if (probeOnly) {
      const pct = probeOnly.score / probeOnly.maxScore
      return {
        status: pct >= 0.8 ? 'cumple' : pct >= 0.45 ? 'parcial' : 'no_cumple',
        score: pct,
        confidence: 'alta',
        evidence: [`Prueba "${probeOnly.title}" · ${Math.round(pct * 100)}% (${probeOnly.submittedAt.slice(0, 10)})`],
        gaps: pct >= 0.8 ? [] : [`Evidencia parcial en prueba para "${c.label}"`]
      }
    }
    return {
      status: 'sin_evaluar',
      score: null,
      confidence: 'baja',
      evidence: [],
      gaps: [`Sin evidencia registrada para "${c.label}"`],
      note: 'No se asigna 0: falta evidencia (requisito del sistema)'
    }
  }

  // Refuerzo: si existe una prueba con buena nota que menciona la etiqueta, sube confianza
  const probe = cand.assessments.find((a) => normalize(a.title).includes(normalize(terms[0])))
  const evidence = [...best.evidence]
  let confidence = best.confidence
  let score = best.score
  if (probe && probe.maxScore > 0) {
    const pct = probe.score / probe.maxScore
    evidence.push(`Prueba "${probe.title}" · ${Math.round(pct * 100)}% (${probe.submittedAt.slice(0, 10)})`)
    if (pct >= 0.7) {
      score = Math.min(1, score + 0.2)
      confidence = 'alta'
    }
  }

  const status: CriterionStatus = score >= 0.8 ? 'cumple' : score >= 0.45 ? 'parcial' : 'no_cumple'
  const gaps: string[] = []
  if (status !== 'cumple') {
    gaps.push(status === 'parcial' ? `Evidencia parcial para "${c.label}"` : `No se acredita "${c.label}"`)
    if (confidence === 'baja') gaps.push('Verificar en entrevista o con prueba práctica')
  }
  return { status, score, confidence, evidence, gaps }
}

/* ------------------------------------------------------------------ */
/* Evaluación completa                                                 */
/* ------------------------------------------------------------------ */

export interface MatchOptions {
  /** Peso mínimo evaluado para considerar la estimación utilizable */
  minCoverage?: number
  now?: string
}

export function evaluateCandidate(
  criteria: Criterion[],
  cand: CandidateEvidence,
  opts: MatchOptions = {}
): MatchResult {
  const now = opts.now ? new Date(opts.now) : new Date()
  const minCoverage = opts.minCoverage ?? 0.4

  const factors: FactorResult[] = criteria.map((c) => {
    const e = evaluateCriterion(c, cand)
    return {
      criterionId: c.id,
      label: c.label,
      kind: c.kind,
      category: c.category,
      weight: c.weight,
      status: e.status,
      score: e.score,
      confidence: e.confidence,
      evidence: e.evidence,
      gaps: e.gaps,
      note: e.note
    }
  })

  const weighted = factors.filter((f) => f.kind === 'weighted' && f.weight > 0)
  const totalWeight = weighted.reduce((s, f) => s + f.weight, 0)
  const evaluated = weighted.filter((f) => f.score !== null)
  const evaluatedWeight = evaluated.reduce((s, f) => s + f.weight, 0)
  const coverage = totalWeight > 0 ? evaluatedWeight / totalWeight : 0
  const rawScore = evaluatedWeight > 0
    ? evaluated.reduce((s, f) => s + (f.score as number) * f.weight, 0) / evaluatedWeight
    : null

  const mandatories = factors.filter((f) => f.kind === 'mandatory')
  let mandatoryStatus: MatchResult['mandatoryStatus'] = 'cumple'
  if (mandatories.some((m) => m.status === 'no_cumple')) mandatoryStatus = 'no_cumple'
  else if (mandatories.some((m) => m.status === 'sin_evaluar')) mandatoryStatus = 'falta_verificar'
  else if (mandatories.some((m) => m.status === 'parcial')) mandatoryStatus = 'revisar'

  // Penalidad por requisito obligatorio no cumplido: la estimación se limita,
  // pero NO se descarta al candidato automáticamente.
  let score = rawScore === null ? null : Math.round(rawScore * 100)
  if (score !== null && mandatoryStatus === 'no_cumple') score = Math.min(score, 25)
  if (score !== null && mandatoryStatus === 'revisar') score = Math.min(score, 85)
  if (score !== null && coverage < minCoverage) score = Math.min(score, 55)

  // Señales de vigencia de pruebas (>18 meses => revisar)
  const stale = cand.assessments.filter((a) => {
    const d = new Date(a.submittedAt)
    if (isNaN(d.getTime())) return false
    return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) > 548
  })

  const explanation = buildExplanation(factors, mandatoryStatus, score, coverage, stale.length, cand)

  return {
    candidateId: cand.id,
    candidateName: cand.fullName,
    score,
    coverage: Math.round(coverage * 100) / 100,
    mandatoryStatus,
    factors,
    explanation,
    modelVersion: MODEL_VERSION,
    requiresReview: true
  }
}

function buildExplanation(
  factors: FactorResult[],
  mandatoryStatus: MatchResult['mandatoryStatus'],
  score: number | null,
  coverage: number,
  staleCount: number,
  cand: CandidateEvidence
): string {
  const parts: string[] = []
  const mand = factors.filter((f) => f.kind === 'mandatory')
  const mandOk = mand.filter((m) => m.status === 'cumple').length
  if (mand.length) parts.push(`Requisitos excluyentes: ${mandOk}/${mand.length} con evidencia (${mandatoryStatus.replace('_', ' ')}).`)

  const strong = factors.filter((f) => f.status === 'cumple' && f.kind === 'weighted').slice(0, 3)
  if (strong.length) parts.push(`Evidencia a favor: ${strong.map((s) => s.label).join(', ')}.`)

  const gaps = factors.filter((f) => f.status === 'parcial' || f.status === 'no_cumple').slice(0, 3)
  if (gaps.length) parts.push(`Brechas a revisar: ${gaps.map((g) => g.label).join(', ')}.`)

  const missing = factors.filter((f) => f.status === 'sin_evaluar')
  if (missing.length) parts.push(`Sin evaluar (falta evidencia): ${missing.map((m) => m.label).join(', ')}.`)

  if (coverage < 0.6) parts.push(`Solo se pudo evaluar el ${Math.round(coverage * 100)}% de los criterios ponderados.`)
  if (staleCount > 0) parts.push(`${staleCount} resultado(s) de prueba tienen más de 18 meses: considerar reevaluación.`)
  if (score === null) parts.push('No fue posible estimar compatibilidad: el perfil no tiene evidencia registrada.')

  parts.push(`Estimación orientativa (no es una decisión de contratación); perfil con ${cand.yearsExperience} años de experiencia declarada. Revisión humana obligatoria.`)
  return parts.join(' ')
}
