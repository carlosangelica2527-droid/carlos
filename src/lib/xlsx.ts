/**
 * Verificación de hojas de cálculo (.xlsx) para pruebas técnicas.
 *
 * Principio del sistema: el verificador NO decide. Comprueba hechos
 * objetivos (¿la celda tiene esta fórmula?, ¿el valor coincide?) y
 * devuelve evidencia. Cualquier prueba con revisión pendiente queda
 * marcada para que una persona califique.
 */

export type WorkbookSpec = {
  check: 'cell' | 'sheet_exists' | 'range_sum' | 'formula_present'
  sheet?: string
  cell?: string
  expected?: string | number
  mode?: 'value' | 'formula'
  tolerance?: number
}

export type ParsedSheet = { cells: Record<string, { v?: unknown; f?: string }> }
export type ParsedWorkbook = Record<string, ParsedSheet>

export type CheckResult = {
  index: number
  prompt: string
  status: 'cumple' | 'parcial' | 'no_cumple' | 'revisar'
  points: number
  awarded: number
  evidence: string
}

function normCell(ref: string): string {
  return String(ref || '').trim().toUpperCase().replace(/\$/g, '')
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function cellOf(wb: ParsedWorkbook, sheet: string | undefined, ref: string) {
  const name = sheet && wb[sheet] ? sheet : Object.keys(wb)[0]
  if (!name) return null
  const s = wb[name]
  if (!s || !s.cells) return null
  return s.cells[normCell(ref)] ?? null
}

/** Evalúa una prueba de hoja de cálculo contra su especificación. */
export function verifyWorkbook(
  workbook: ParsedWorkbook,
  specs: { prompt: string; points: number; rubric: string }[]
): { results: CheckResult[]; autoScore: number; maxScore: number; requiresReview: boolean } {
  const results: CheckResult[] = []
  let autoScore = 0
  let maxScore = 0
  let requiresReview = false

  specs.forEach((q, index) => {
    const points = Number(q.points) || 0
    maxScore += points

    let spec: WorkbookSpec | null = null
    try {
      spec = JSON.parse(q.rubric || '')
    } catch {
      spec = null
    }

    if (!spec || !spec.check) {
      requiresReview = true
      results.push({
        index, prompt: q.prompt, status: 'revisar', points, awarded: 0,
        evidence: 'Sin criterio automático verificable: requiere revisión humana.'
      })
      return
    }

    if (spec.check === 'sheet_exists') {
      const ok = !!workbook[spec.sheet || '']
      const awarded = ok ? points : 0
      autoScore += awarded
      results.push({
        index, prompt: q.prompt, status: ok ? 'cumple' : 'no_cumple', points, awarded,
        evidence: ok ? `La hoja "${spec.sheet}" existe.` : `No se encontró la hoja "${spec.sheet}". Hojas: ${Object.keys(workbook).join(', ') || 'ninguna'}`
      })
      return
    }

    if (spec.check === 'cell' || spec.check === 'formula_present') {
      const target = cellOf(workbook, spec.sheet, spec.cell || '')
      if (!target) {
        results.push({
          index, prompt: q.prompt, status: 'no_cumple', points, awarded: 0,
          evidence: `La celda ${spec.sheet ? spec.sheet + '!' : ''}${spec.cell} está vacía o no existe.`
        })
        return
      }
      const mode = spec.check === 'formula_present' ? 'formula' : spec.mode || 'value'
      if (mode === 'formula') {
        const got = String(target.f || '').replace(/\s+/g, '').toUpperCase()
        const want = String(spec.expected ?? '').replace(/\s+/g, '').toUpperCase()
        const ok = want ? got === want : !!got
        const awarded = ok ? points : got ? points * 0.5 : 0
        if (!ok && got) requiresReview = true
        autoScore += awarded
        results.push({
          index, prompt: q.prompt, status: ok ? 'cumple' : got ? 'parcial' : 'no_cumple', points, awarded,
          evidence: got ? `Fórmula encontrada: ${got}${want && !ok ? ` · esperada: ${want}` : ''}` : 'La celda contiene un valor fijo, no una fórmula.'
        })
        return
      }
      const got = num(target.v)
      const want = num(spec.expected)
      const tol = spec.tolerance ?? 0.01
      if (got === null) {
        results.push({
          index, prompt: q.prompt, status: 'no_cumple', points, awarded: 0,
          evidence: `El valor de ${spec.cell} no es numérico: "${String(target.v ?? '')}"`
        })
        return
      }
      const ok = want !== null && Math.abs(got - want) <= tol
      const awarded = ok ? points : 0
      autoScore += awarded
      results.push({
        index, prompt: q.prompt, status: ok ? 'cumple' : 'no_cumple', points, awarded,
        evidence: `Valor en ${spec.cell}: ${got}${want !== null ? ` · esperado: ${want}` : ''}`
      })
      return
    }

    if (spec.check === 'range_sum') {
      const s = workbook[spec.sheet || ''] || workbook[Object.keys(workbook)[0]]
      if (!s) {
        results.push({ index, prompt: q.prompt, status: 'no_cumple', points, awarded: 0, evidence: 'Libro sin hojas.' })
        return
      }
      const sum = Object.values(s.cells || {}).reduce((acc, c) => acc + (num(c.v) ?? 0), 0)
      const want = num(spec.expected)
      const ok = want !== null && Math.abs(sum - want) <= (spec.tolerance ?? 0.01)
      const awarded = ok ? points : 0
      autoScore += awarded
      results.push({
        index, prompt: q.prompt, status: ok ? 'cumple' : 'no_cumple', points, awarded,
        evidence: `Suma de la hoja: ${Math.round(sum * 100) / 100}${want !== null ? ` · esperado: ${want}` : ''}`
      })
      return
    }

    requiresReview = true
    results.push({
      index, prompt: q.prompt, status: 'revisar', points, awarded: 0,
      evidence: `Criterio no reconocido: ${spec.check}`
    })
  })

  return { results, autoScore, maxScore, requiresReview }
}
