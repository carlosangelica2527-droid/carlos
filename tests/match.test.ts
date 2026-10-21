/**
 * Pruebas del motor de compatibilidad explicable (Smart Match).
 * Ejecutar: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateCandidate, normalize, familyOf, tokens, MODEL_VERSION,
  type Criterion, type CandidateEvidence
} from '../src/lib/match.ts'

const criteria = (): Criterion[] => [
  { id: 1, kind: 'mandatory', category: 'education', label: 'Formación en contabilidad', weight: 0, keywords: ['contabilidad'] },
  { id: 2, kind: 'weighted', category: 'technical', label: 'Excel avanzado', weight: 40, keywords: ['excel'] },
  { id: 3, kind: 'weighted', category: 'experience', label: 'Experiencia en cierre contable', weight: 30, keywords: ['cierre contable'], minYears: 2 },
  { id: 4, kind: 'weighted', category: 'other', label: 'Power BI', weight: 30, keywords: ['power bi'] }
]

const base = (over: Partial<CandidateEvidence> = {}): CandidateEvidence => ({
  id: 10,
  fullName: 'Candidata Ficticia',
  yearsExperience: 4,
  skills: [
    { name: 'Excel', level: 5, years: 4, verified: true, source: 'prueba' },
    { name: 'Contabilidad', level: 4, years: 4, verified: false, source: 'declarado' }
  ],
  experiences: [
    { title: 'Analista contable', company: 'Empresa Demo', description: 'Cierre contable mensual y conciliaciones' }
  ],
  education: [{ program: 'Contabilidad y Auditoría', institution: 'Universidad Demo' }],
  assessments: [],
  ...over
})

test('normalize quita acentos, mayúsculas y signos', () => {
  assert.equal(normalize('  Análisis   FINANCIERO!! '), 'analisis financiero')
  assert.equal(normalize('NIIF/IFRS'), 'niif ifrs')
})

test('tokens descarta palabras vacías', () => {
  assert.deepEqual(tokens('gestión de la cartera'), ['gestion', 'cartera'])
})

test('familyOf reconoce familias de habilidades equivalentes', () => {
  assert.equal(familyOf('power bi'), 'bi')
  assert.equal(familyOf('Tableau'), 'bi')
  assert.equal(familyOf('postgresql'), 'sql')
  assert.equal(familyOf('habilidad inexistente xyz'), null)
})

test('candidato compatible obtiene puntaje alto y sin brechas críticas', () => {
  const r = evaluateCandidate(criteria(), base({
    skills: [
      { name: 'Excel', level: 5, years: 5, verified: true, source: 'prueba' },
      { name: 'Power BI', level: 4, years: 2, verified: true, source: 'prueba' },
      { name: 'Contabilidad', level: 5, years: 5, verified: true, source: 'prueba' }
    ]
  }))
  assert.equal(r.modelVersion, MODEL_VERSION)
  assert.equal(r.mandatoryStatus, 'cumple')
  assert.ok((r.score as number) >= 80, `score esperado >= 80, obtenido ${r.score}`)
  assert.ok(r.coverage >= 0.99)
  assert.ok(r.explanation.length > 40)
  assert.ok(r.factors.length === 4)
})

test('NO asigna cero cuando falta evidencia: marca sin_evaluar', () => {
  const r = evaluateCandidate(criteria(), base({
    skills: [], experiences: [], education: [], yearsExperience: 0
  }))
  const powerBi = r.factors.find((f) => f.label === 'Power BI')!
  assert.equal(powerBi.status, 'sin_evaluar')
  assert.equal(powerBi.score, null)
  assert.ok(powerBi.note && powerBi.note.includes('falta evidencia'))
  // el puntaje se limita por baja cobertura, no se inventa
  assert.ok(r.coverage < 0.5)
})

test('requisito excluyente no cumplido limita el puntaje pero no descarta', () => {
  const r = evaluateCandidate(criteria(), base({
    education: [{ program: 'Marketing' }],
    skills: [
      { name: 'Excel', level: 5, years: 5, verified: true, source: 'prueba' },
      { name: 'Power BI', level: 4, years: 3, verified: true, source: 'prueba' }
    ]
  }))
  assert.equal(r.mandatoryStatus, 'no_cumple')
  assert.ok((r.score as number) <= 25, `debe limitarse a 25, obtenido ${r.score}`)
  assert.equal(r.requiresReview, true)
  // sigue siendo una recomendación, nunca una decisión
  assert.ok(r.explanation.includes('no es una decisión'))
})

test('detecta habilidad transferible dentro de la misma familia', () => {
  const r = evaluateCandidate(
    [{ id: 9, kind: 'weighted', category: 'technical', label: 'Power BI', weight: 100, keywords: ['power bi'] }],
    base({ skills: [{ name: 'Tableau', level: 4, years: 3, verified: true, source: 'prueba' }] })
  )
  const f = r.factors[0]
  assert.equal(f.status, 'parcial')
  assert.ok(f.evidence.some((e) => e.includes('transferible')), 'debe explicar la transferibilidad')
  assert.ok((r.score as number) < 100)
})

test('resultado determinista ante los mismos datos', () => {
  const c = criteria()
  const e = base()
  const a = evaluateCandidate(c, e)
  const b = evaluateCandidate(c, e)
  assert.deepEqual(a.factors, b.factors)
  assert.equal(a.score, b.score)
  assert.equal(a.coverage, b.coverage)
})

test('variaciones pequeñas de datos no cambian el resultado de forma inexplicable', () => {
  const c = criteria()
  const r1 = evaluateCandidate(c, base())
  const r2 = evaluateCandidate(c, base({
    skills: base().skills.map((s) => ({ ...s, years: s.years + 0.1 }))
  }))
  assert.equal(r1.mandatoryStatus, r2.mandatoryStatus)
  assert.ok(Math.abs((r1.score ?? 0) - (r2.score ?? 0)) <= 3, 'variación de puntaje debe ser pequeña')
})

test('resultados de prueba aportan evidencia y suben confianza', () => {
  const r = evaluateCandidate(
    [{ id: 9, kind: 'weighted', category: 'technical', label: 'Excel', weight: 100, keywords: ['excel'] }],
    base({
      skills: [],
      assessments: [{ title: 'Excel intermedio', score: 9, maxScore: 10, submittedAt: '2026-09-01T10:00:00Z' }]
    })
  )
  const f = r.factors[0]
  assert.equal(f.status, 'cumple')
  assert.ok(f.evidence.some((e) => e.includes('Prueba')))
})

test('marca pruebas antiguas como señal de reevaluación', () => {
  const r = evaluateCandidate(
    [{ id: 9, kind: 'weighted', category: 'technical', label: 'Excel', weight: 100, keywords: ['excel'] }],
    base({
      skills: [{ name: 'Excel', level: 4, years: 3, verified: true, source: 'prueba' }],
      assessments: [{ title: 'Excel', score: 8, maxScore: 10, submittedAt: '2023-01-01T10:00:00Z' }]
    }),
    { now: '2026-10-21T00:00:00Z' }
  )
  assert.ok(r.explanation.includes('18 meses'), 'debe advertir sobre resultados vencidos')
})

test('sin criterios ponderados no inventa un puntaje', () => {
  const r = evaluateCandidate(
    [{ id: 1, kind: 'mandatory', category: 'technical', label: 'SQL', weight: 0, keywords: ['sql'] }],
    base({ skills: [{ name: 'SQL', level: 4, years: 3, verified: true, source: 'prueba' }] })
  )
  assert.equal(r.score, null)
  assert.equal(r.coverage, 0)
  assert.ok(r.explanation.includes('No fue posible estimar'))
})

test('criterio de experiencia con años insuficientes queda parcial, no cero inventado', () => {
  const r = evaluateCandidate(
    [{ id: 5, kind: 'weighted', category: 'experience', label: 'Experiencia en cierre', weight: 100, keywords: ['cierre contable'], minYears: 5 }],
    base({ yearsExperience: 3 })
  )
  const f = r.factors[0]
  assert.equal(f.status, 'parcial')
  assert.ok((f.score as number) > 0 && (f.score as number) < 1)
  assert.ok(f.gaps.some((g) => g.includes('Se piden 5 años')))
})
