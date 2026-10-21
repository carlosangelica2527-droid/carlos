import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreSubmission } from '../src/lib/score.ts'

// Pruebas del motor de puntuación unificado.
// Regla de oro: el portal del postulante y la vista del reclutador
// deben calcular exactamente lo mismo para un mismo intento.

const mcqQuestions = [
  { id: 1, kind: 'mcq', prompt: '¿Cuánto es 2+2?', points: 5, correct_index: 1 },
  { id: 2, kind: 'mcq', prompt: '¿Cuál es la capital de Ecuador?', points: 5, correct_index: 0 }
]

test('MCQ completamente correcto se autocalifica y queda graded', () => {
  const r = scoreSubmission('mcq', mcqQuestions, { answers: { 1: 1, 2: 0 } })
  assert.equal(r.autoScore, 10)
  assert.equal(r.maxScore, 10)
  assert.equal(r.status, 'graded')
  assert.equal(r.finalScore, 10)
})

test('MCQ parcialmente correcto puntúa solo lo acertado', () => {
  const r = scoreSubmission('mcq', mcqQuestions, { answers: { 1: 1, 2: 3 } })
  assert.equal(r.autoScore, 5)
  assert.equal(r.status, 'graded')
  assert.equal(r.finalScore, 5)
  const wrong = r.breakdown.find((b: any) => b.question_id === 2)
  assert.equal(wrong.awarded, 0)
})

test('MCQ sin responder no inventa puntos y sigue siendo graded', () => {
  const r = scoreSubmission('mcq', mcqQuestions, { answers: {} })
  assert.equal(r.autoScore, 0)
  assert.equal(r.status, 'graded')
})

test('Las respuestas pueden venir como clave string (JSON del cliente)', () => {
  const r = scoreSubmission('mcq', mcqQuestions, { answers: { '1': '1', '2': '0' } })
  assert.equal(r.autoScore, 10)
})

test('Prueba con pregunta abierta requiere revisión y no fija puntaje final', () => {
  const qs = [
    { id: 1, kind: 'mcq', prompt: 'objetiva', points: 5, correct_index: 0 },
    { id: 2, kind: 'open', prompt: 'explique', points: 15 }
  ]
  const r = scoreSubmission('written', qs, { answers: { 1: 0, 2: 'mi respuesta' } })
  assert.equal(r.status, 'review_required')
  assert.equal(r.finalScore, null, 'una abierta nunca se autocalifica')
  assert.equal(r.maxScore, 20)
  assert.equal(r.autoScore, 5, 'lo objetivo sí se contabiliza como referencia')
  assert.equal(r.storedAnswers['2'], 'mi respuesta', 'la respuesta se conserva para el revisor')
  const open = r.breakdown.find((b: any) => b.question_id === 2)
  assert.equal(open.pending_review, true)
  assert.equal(open.awarded, null)
})

test('Spreadsheet sin archivo lanza error explícito', () => {
  assert.throws(() => scoreSubmission('spreadsheet', [], {}), /Adjunta el archivo/)
})

test('Spreadsheet nunca autocalifica: siempre revisión humana', () => {
  const qs = [{ id: 9, prompt: 'Suma correcta en B10', points: 10, rubric: null }]
  const workbook = {
    Sheet1: {
      '!ref': 'A1:B10',
      B10: { t: 'n', v: 500, f: 'SUM(B1:B9)' }
    }
  }
  // El verificador busca criterios estructurados; aquí solo comprobamos el contrato.
  const r = scoreSubmission('spreadsheet', qs, { workbook })
  assert.equal(r.status, 'review_required')
  assert.equal(r.finalScore, null)
  assert.equal(r.maxScore, 10)
  assert.deepEqual(r.storedAnswers, { workbook })
  assert.ok(Array.isArray(r.breakdown))
})

test('Sin preguntas no rompe y devuelve máximo cero', () => {
  const r = scoreSubmission('mcq', [], { answers: {} })
  assert.equal(r.maxScore, 0)
  assert.equal(r.autoScore, 0)
  assert.equal(r.status, 'graded')
})
