/**
 * Motor único de calificación de intentos.
 * Lo usan tanto el portal del postulante como el registro interno del reclutador,
 * para que un mismo intento nunca se puntúe de dos formas distintas.
 */
import { verifyWorkbook } from './xlsx.ts'

export type ScoreStatus = 'graded' | 'review_required'

export type ScoreResult = {
  autoScore: number
  maxScore: number
  status: ScoreStatus
  finalScore: number | null
  breakdown: any[]
  storedAnswers: unknown
  note: string
}

export function scoreSubmission(type: string, questions: any[], payload: any): ScoreResult {
  if (type === 'spreadsheet') {
    const wb = payload?.workbook
    if (!wb || typeof wb !== 'object' || !Object.keys(wb).length) {
      throw new Error('Adjunta el archivo .xlsx resuelto')
    }
    const verdict = verifyWorkbook(
      wb,
      questions.map((q: any) => ({ prompt: q.prompt, points: Number(q.points) || 0, rubric: q.rubric }))
    )
    return {
      autoScore: verdict.autoScore,
      maxScore: verdict.maxScore,
      status: verdict.requiresReview ? 'review_required' : 'review_required',
      // La hoja de cálculo siempre requiere confirmación humana antes de decidir.
      finalScore: null,
      breakdown: verdict.results.map((x) => ({
        question_id: questions[x.index]?.id ?? null,
        prompt: x.prompt,
        kind: 'spreadsheet',
        points: x.points,
        awarded: x.awarded,
        status: x.status,
        evidence: x.evidence,
        pending_review: x.status === 'revisar'
      })),
      storedAnswers: { workbook: wb },
      note: 'Verificación automática de fórmulas y valores. Requiere confirmación humana.'
    }
  }

  const answers = payload?.answers ?? {}
  let autoScore = 0
  let maxScore = 0
  let hasOpen = false
  for (const q of questions) {
    maxScore += Number(q.points) || 0
    const given = answers[String(q.id)] ?? answers[q.id]
    if (q.kind === 'mcq') {
      if (Number(given) === q.correct_index) autoScore += Number(q.points) || 0
    } else {
      hasOpen = true
    }
  }
  const graded = type === 'mcq' && !hasOpen
  return {
    autoScore,
    maxScore,
    status: graded ? 'graded' : 'review_required',
    finalScore: graded ? autoScore : null,
    breakdown: questions.map((q: any) => ({
      question_id: q.id,
      prompt: q.prompt,
      kind: q.kind,
      points: q.points,
      awarded: q.kind === 'mcq' ? (Number(answers[String(q.id)] ?? answers[q.id]) === q.correct_index ? q.points : 0) : null,
      pending_review: q.kind !== 'mcq'
    })),
    storedAnswers: answers,
    note: graded
      ? 'Puntuación automática registrada con la versión de la prueba.'
      : 'Hay respuestas abiertas: requieren calificación humana antes de usarse.'
  }
}
