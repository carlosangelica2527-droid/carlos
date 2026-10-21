/* QUIPU · vistas: talent memory, skill lab, entrevistas, reportes, configuración */
(function () {
  'use strict'
  const Q = window.Q, H = Q.helpers, api = Q.api, esc = H.esc

  /* ====================== TALENT MEMORY ========================= */
  Q.views.memory = async function () {
    Q.mountShell('memory', Q.loading(), '')
    let jobs = []
    try { jobs = await api('/jobs?status=all') } catch (e) { jobs = [] }
    const f = Q.state.memFilter || {}

    const html = `
      <div class="notice n-info" style="margin-bottom:16px">
        <span>◎</span>
        <div><b>Memoria histórica de candidatos.</b> Busca personas que ya evaluaste, aunque nunca se hayan postulado a la vacante nueva. Solo se muestran perfiles de tu organización; el contacto requiere consentimiento vigente.</div>
      </div>

      <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-bottom:16px">
        <section class="card">
          <div class="card-head"><h2>Buscar en el histórico</h2></div>
          <div class="card-pad">
            <form id="memform">
              <div class="field"><label for="mq">Búsqueda libre</label><input id="mq" value="${esc(f.q || '')}" placeholder="Ej: conciliación bancaria, Power BI, jefe de logística"></div>
              <div class="field-row">
                <div class="field"><label for="mskill">Habilidad</label><input id="mskill" value="${esc(f.skill || '')}" placeholder="Excel"></div>
                <div class="field"><label for="mloc">Ubicación</label><input id="mloc" value="${esc(f.location || '')}" placeholder="Guayaquil"></div>
              </div>
              <div class="field-row">
                <div class="field"><label for="my">Experiencia mínima (años)</label><input id="my" type="number" min="0" value="${esc(f.minYears ?? '')}"></div>
                <div class="field"><label for="mjob">Excluir postulados a</label><select id="mjob"><option value="">— Ninguna —</option>${jobs.map((j) => `<option value="${j.id}" ${String(f.excludeJob) === String(j.id) ? 'selected' : ''}>${esc(j.title)}</option>`).join('')}</select></div>
              </div>
              <div class="row" style="margin-bottom:12px">
                <label class="small" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="mavail" ${f.available ? 'checked' : ''}> Solo con disponibilidad declarada</label>
                <label class="small" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="mcons" ${f.consented ? 'checked' : ''}> Solo con consentimiento</label>
              </div>
              <button class="btn" type="submit">Buscar</button>
            </form>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Recomendaciones por vacante</h2></div>
          <div class="card-pad">
            <p class="small muted">Genera y guarda una lista explicada de candidatos históricos compatibles con una vacante. Se exige consentimiento registrado.</p>
            <div class="field" style="margin-top:12px"><label for="rjob">Vacante</label><select id="rjob">${jobs.filter((j) => j.status !== 'archived').map((j) => `<option value="${j.id}">${esc(j.title)}</option>`).join('')}</select></div>
            <button class="btn btn-block" id="genrec">Generar recomendaciones</button>
            <div id="recout" style="margin-top:12px"></div>
          </div>
        </section>
      </div>

      <div id="memout"></div>`

    Q.mountShell('memory', html, '', 'Talent Memory')

    document.getElementById('memform').onsubmit = (e) => {
      e.preventDefault()
      Q.state.memFilter = {
        q: document.getElementById('mq').value.trim(),
        skill: document.getElementById('mskill').value.trim(),
        location: document.getElementById('mloc').value.trim(),
        minYears: document.getElementById('my').value,
        excludeJob: document.getElementById('mjob').value || null,
        available: document.getElementById('mavail').checked,
        consented: document.getElementById('mcons').checked
      }
      runSearch()
    }

    document.getElementById('genrec').onclick = async () => {
      const jobId = document.getElementById('rjob').value
      const out = document.getElementById('recout')
      if (!jobId) { Q.toast('Crea una vacante primero', 'err'); return }
      out.innerHTML = Q.loading('Evaluando histórico…')
      try {
        const r = await api('/jobs/' + jobId + '/recommendations', { method: 'POST' })
        out.innerHTML = `<div class="notice n-ok" style="margin-bottom:8px"><span>✓</span><div>${r.generated} recomendación(es) guardada(s) sobre ${r.candidates_evaluated} perfiles con consentimiento.</div></div>
          ${r.results.slice(0, 6).map((x) => `<div class="row small" style="padding:6px 0;border-bottom:1px solid #eef1f5"><b>${x.score}</b> <a href="#/candidatos/${x.candidateId}">${esc(x.candidateName)}</a><span class="spacer"></span>${H.statusBadge(x.mandatoryStatus)}</div>`).join('')}
          <a class="btn btn-ghost btn-sm btn-block" href="#/vacantes/${jobId}" style="margin-top:9px">Ver en la vacante</a>`
      } catch (e) { out.innerHTML = Q.errorBlock(e) }
    }

    async function runSearch() {
      const out = document.getElementById('memout')
      out.innerHTML = Q.loading('Buscando en el histórico…')
      const f2 = Q.state.memFilter || {}
      const qs = new URLSearchParams()
      Object.entries(f2).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined && v !== false) qs.set(k, v) })
      try {
        const r = await api('/memory/search?' + qs.toString())
        out.innerHTML = `
          <div class="row" style="margin-bottom:10px">
            <h2 style="font-size:15px">${r.total} perfil(es) recuperado(s)</h2>
            <span class="spacer"></span>
            <span class="tiny muted">El histórico incluye perfiles sin postulación a la vacante actual</span>
          </div>
          ${r.total ? r.items.map((x) => `
            <div class="card card-pad" style="margin-bottom:10px">
              <div class="row" style="align-items:flex-start">
                <div style="flex:1;min-width:0">
                  <div class="row" style="gap:7px">
                    <a href="#/candidatos/${x.id}"><b>${esc(x.fullName)}</b></a>
                    ${H.statusBadge(x.consentStatus)}
                    ${x.doNotContact ? '<span class="badge b-red">no contactar</span>' : ''}
                    ${x.applicationsCount === 0 ? '<span class="badge b-violet">nunca postuló</span>' : ''}
                  </div>
                  <div class="small muted" style="margin-top:2px">${esc(x.headline || '')}${x.location ? ' · ' + esc(x.location) : ''} · ${x.yearsExperience} años</div>
                  <div class="small" style="margin-top:5px">${esc(x.skillsText || 'Sin habilidades registradas')}</div>
                  <div class="tiny muted" style="margin-top:3px">${esc(x.experienceText || '')}</div>
                  <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap">
                    ${x.reasons.map((rr) => `<span class="chip">${esc(rr)}</span>`).join('')}
                  </div>
                </div>
                <div class="row" style="flex-direction:column;gap:6px;align-items:stretch">
                  <a class="btn btn-ghost btn-sm" href="#/candidatos/${x.id}">Ver perfil</a>
                  <button class="btn btn-sm" data-add="${x.id}">Agregar a vacante</button>
                </div>
              </div>
            </div>`).join('') : `<div class="card"><div class="empty"><h3>Sin coincidencias</h3><p>Ajusta los filtros o importa perfiles históricos para ampliar la memoria.</p></div></div>`}
          <p class="tiny muted" style="margin-top:10px">${esc(r.note)}</p>`

        out.querySelectorAll('[data-add]').forEach((b) => {
          b.onclick = () => {
            const options = jobs.filter((j) => ['published', 'draft', 'paused'].includes(j.status))
            if (!options.length) { Q.toast('No hay vacantes abiertas', 'err'); return }
            Q.modal({
              title: 'Agregar al pipeline',
              body: `<div class="field"><label for="tj">Vacante</label><select id="tj">${options.map((j) => `<option value="${j.id}">${esc(j.title)}</option>`).join('')}</select></div>`,
              footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="mok">Agregar</button>`,
              onMount: ({ close }) => {
                document.getElementById('mok').onclick = async () => {
                  try {
                    const r = await api('/applications', { method: 'POST', body: { job_id: Number(document.getElementById('tj').value), candidate_id: Number(b.dataset.add) } })
                    close(); Q.toast('Agregado al pipeline', 'ok'); Q.nav('#/postulacion/' + r.id)
                  } catch (e) { Q.toast(e.message, 'err') }
                }
              }
            })
          }
        })
      } catch (e) { out.innerHTML = Q.errorBlock(e) }
    }
    if (f.q || f.skill || f.location || f.excludeJob) runSearch()
    else document.getElementById('memout').innerHTML = `<div class="card"><div class="empty"><h3>Busca en tu memoria de talento</h3><p>Filtra por habilidad, experiencia o ubicación. También puedes generar recomendaciones automáticas para una vacante.</p></div></div>`
  }

  /* ========================= SKILL LAB ========================== */
  Q.views.assessments = async function () {
    Q.mountShell('assessments', Q.loading(), '')
    let data = []
    try { data = await api('/assessments') } catch (e) { return Q.mountShell('assessments', Q.errorBlock(e), '') }

    const html = `
      <div class="notice n-info" style="margin-bottom:14px"><span>◈</span><div><b>Skill Lab.</b> Cada prueba conserva versión, respuestas, puntuación, criterios y evaluador. Las preguntas abiertas y los casos prácticos requieren calificación humana; el sistema nunca las puntúa solo.</div></div>
      <div class="row" style="margin-bottom:12px"><span class="small muted">${data.length} prueba(s)</span><span class="spacer"></span><button class="btn" id="newA">Nueva prueba</button></div>
      ${data.length ? `<div class="card"><div class="tbl-wrap"><table>
        <thead><tr><th>Prueba</th><th>Tipo</th><th>Vacante</th><th>Preguntas</th><th>Intentos</th><th>Estado</th><th></th></tr></thead>
        <tbody>${data.map((a) => `<tr>
          <td><a href="#/evaluaciones/${a.id}"><b>${esc(a.title)}</b></a><div class="tiny muted">v${a.version} · ${a.duration_min} min · aprueba ${a.pass_score}%</div></td>
          <td class="small">${({ mcq: 'Opción múltiple', written: 'Respuesta escrita', practical: 'Caso práctico', spreadsheet: 'Hoja de cálculo', manual: 'Manual' })[a.type] || a.type}</td>
          <td class="small">${esc(a.job_title || '—')}</td>
          <td class="small">${a.question_count}</td>
          <td class="small">${a.attempt_count}</td>
          <td>${H.statusBadge(a.status === 'active' ? 'published' : a.status === 'draft' ? 'draft' : 'archived')}</td>
          <td><a class="btn btn-ghost btn-sm" href="#/evaluaciones/${a.id}">Abrir</a></td>
        </tr>`).join('')}</tbody></table></div></div>`
        : `<div class="card"><div class="empty"><h3>Sin pruebas</h3><p>Crea una prueba práctica para generar evidencia verificable de competencias.</p><button class="btn" id="newA2">Crear la primera prueba</button></div></div>`}
    `
    Q.mountShell('assessments', html, `<button class="btn" id="newA3">Nueva prueba</button>`)
    ;['newA', 'newA2', 'newA3'].forEach((id) => { const b = document.getElementById(id); if (b) b.onclick = newAssessment })
  }

  async function newAssessment() {
    let jobs = []
    try { jobs = await api('/jobs?status=all') } catch (e) { jobs = [] }
    Q.modal({
      title: 'Nueva prueba',
      wide: true,
      body: `<div class="field"><label for="at">Título *</label><input id="at" placeholder="Excel intermedio — conciliación"></div>
        <div class="field-row">
          <div class="field"><label for="atype">Tipo</label><select id="atype">
            <option value="mcq">Opción múltiple (autocalificable)</option>
            <option value="written">Respuesta escrita (revisión manual)</option>
            <option value="spreadsheet">Hoja de cálculo / archivo (revisión manual)</option>
            <option value="practical">Caso práctico (revisión manual)</option>
            <option value="manual">Evaluación manual</option>
          </select></div>
          <div class="field"><label for="ajob">Vacante</label><select id="ajob"><option value="">— General —</option>${jobs.map((j) => `<option value="${j.id}">${esc(j.title)}</option>`).join('')}</select></div>
        </div>
        <div class="field-row-3">
          <div class="field"><label for="adur">Duración (min)</label><input id="adur" type="number" value="30" min="5"></div>
          <div class="field"><label for="apass">Nota de aprobación (%)</label><input id="apass" type="number" value="70" min="0" max="100"></div>
          <div class="field"><label for="astatus">Estado</label><select id="astatus"><option value="active">Activa</option><option value="draft">Borrador</option></select></div>
        </div>
        <div class="field"><label for="adesc">Descripción</label><textarea id="adesc" rows="2"></textarea></div>
        <div class="field"><label for="ains">Instrucciones para el candidato</label><textarea id="ains" rows="2" placeholder="Se evalúa exactitud, procedimiento e interpretación."></textarea></div>
        <div class="sep"></div>
        <div class="row"><b class="small">Preguntas</b><span class="spacer"></span><button class="btn btn-ghost btn-sm" id="addq">+ Pregunta</button></div>
        <div id="qlist" style="margin-top:9px"></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Crear prueba</button>`,
      onMount: () => {
        let qs = [{ prompt: '', options: ['', '', '', ''], correct_index: 0, points: 1 }]
        const type = () => document.getElementById('atype').value
        const draw = () => {
          const isMcq = type() === 'mcq'
          document.getElementById('qlist').innerHTML = qs.map((q, i) => `
            <div style="border:1px solid #e3e8ef;border-radius:10px;padding:11px;margin-bottom:9px">
              <div class="row" style="margin-bottom:6px"><b class="tiny muted">Pregunta ${i + 1}</b><span class="spacer"></span>
                <input data-i="${i}" data-f="points" type="number" min="0" step="0.5" value="${q.points}" style="max-width:70px" aria-label="Puntos">
                <button class="btn-flat tiny" data-del="${i}">Quitar</button></div>
              <input data-i="${i}" data-f="prompt" value="${esc(q.prompt)}" placeholder="Enunciado" style="margin-bottom:7px">
              ${isMcq ? q.options.map((o, oi) => `<div class="row" style="gap:6px;margin-bottom:4px">
                <input type="radio" name="c${i}" ${q.correct_index === oi ? 'checked' : ''} data-ci="${i}" data-oi="${oi}" aria-label="Correcta">
                <input data-i="${i}" data-oi="${oi}" data-f="opt" value="${esc(o)}" placeholder="Opción ${oi + 1}">
              </div>`).join('') : `<textarea data-i="${i}" data-f="rubric" rows="2" placeholder="Rúbrica / respuesta esperada (revisión manual)">${esc(q.rubric || '')}</textarea>`}
            </div>`).join('')
          document.querySelectorAll('[data-f]').forEach((el) => {
            el.oninput = el.onchange = () => {
              const i = +el.dataset.i, f = el.dataset.f
              if (f === 'opt') qs[i].options[+el.dataset.oi] = el.value
              else if (f === 'points') qs[i].points = Number(el.value) || 1
              else qs[i][f] = el.value
            }
          })
          document.querySelectorAll('[data-ci]').forEach((r) => {
            r.onchange = () => { qs[+r.dataset.ci].correct_index = +r.dataset.oi }
          })
          document.querySelectorAll('[data-del]').forEach((b) => {
            b.onclick = () => { qs.splice(+b.dataset.del, 1); if (!qs.length) qs.push({ prompt: '', options: ['', '', '', ''], correct_index: 0, points: 1 }); draw() }
          })
        }
        draw()
        document.getElementById('atype').onchange = draw
        document.getElementById('addq').onclick = () => { qs.push({ prompt: '', options: ['', '', '', ''], correct_index: 0, points: 1, rubric: '' }); draw() }
        document.getElementById('msave').onclick = async () => {
          const title = document.getElementById('at').value.trim()
          if (!title) { Q.toast('El título es obligatorio', 'err'); return }
          const payloadQs = qs.filter((q) => q.prompt.trim()).map((q) => ({
            prompt: q.prompt.trim(), options: q.options.map((o) => o.trim()).filter(Boolean),
            correct_index: q.correct_index, points: q.points, rubric: q.rubric
          }))
          try {
            const r = await api('/assessments', {
              method: 'POST',
              body: {
                title, type: type(), job_id: document.getElementById('ajob').value || null,
                description: document.getElementById('adesc').value,
                instructions: document.getElementById('ains').value,
                duration_min: Number(document.getElementById('adur').value),
                pass_score: Number(document.getElementById('apass').value),
                status: document.getElementById('astatus').value,
                questions: payloadQs
              }
            })
            Q.toast('Prueba creada', 'ok'); document.getElementById('mback').remove(); Q.nav('#/evaluaciones/' + r.id)
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  Q.views.assessments.detail = async function (id) {
    Q.mountShell('assessments', Q.loading(), '')
    let a
    try { a = await api('/assessments/' + id) } catch (e) { return Q.mountShell('assessments', Q.errorBlock(e), '') }
    const html = `
      <div class="row" style="margin-bottom:14px;align-items:flex-start">
        <div>
          <h2 style="font-size:19px">${esc(a.title)}</h2>
          <p class="small muted">${({ mcq: 'Opción múltiple', written: 'Respuesta escrita', practical: 'Caso práctico', spreadsheet: 'Hoja de cálculo', manual: 'Manual' })[a.type]} · v${a.version} · ${a.duration_min} min · aprueba ${a.pass_score}% · ${a.question_count ?? a.questions.length} preguntas</p>
          ${a.instructions ? `<p class="small" style="margin-top:8px;white-space:pre-wrap">${esc(a.instructions)}</p>` : ''}
        </div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 360px">
        <section class="card">
          <div class="card-head"><h2>Preguntas</h2></div>
          <div class="card-pad">
            ${a.questions.length ? a.questions.map((q, i) => `<div class="crit">
              <div class="crit-head"><span class="badge b-gray">${i + 1}</span><b class="small">${esc(q.prompt)}</b><span class="badge b-blue">${q.points} pts</span><span class="badge b-gray">${q.kind === 'mcq' ? 'opción múltiple' : 'abierta'}</span></div>
              ${q.options.length ? q.options.map((o, oi) => `<div class="crit-ev" ${q.correct_index === oi ? 'style="font-weight:600;color:#067647"' : ''}>${esc(o)}${q.correct_index === oi ? ' ✓' : ''}</div>`).join('') : ''}
              ${q.rubric ? `<div class="crit-ev">Rúbrica: ${esc(q.rubric)}</div>` : ''}
            </div>`).join('') : '<p class="small muted">Sin preguntas: esta prueba es de evaluación manual.</p>'}
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Intentos (${a.attempts.length})</h2></div>
          <div class="card-pad">
            ${a.attempts.length ? a.attempts.map((t) => `<div class="crit">
              <div class="crit-head"><a class="small" href="#/candidatos/${t.candidate_id}"><b>${esc(t.full_name)}</b></a>${H.statusBadge(t.status)}</div>
              <div class="tiny muted">${t.final_score !== null ? 'final ' + t.final_score : 'auto ' + (t.auto_score ?? '—')} / ${t.max_score} · v${t.assessment_version} · ${esc(H.fmtDate(t.submitted_at, true))}</div>
              ${t.status === 'review_required' ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px" data-grade="${t.id}" data-max="${t.max_score}">Calificar</button>` : ''}
            </div>`).join('') : '<p class="small muted">Sin intentos registrados.</p>'}
          </div>
        </section>
      </div>`
    Q.mountShell('assessments', html, `<a class="btn btn-ghost" href="#/evaluaciones">Volver</a>`, a.title)
    document.querySelectorAll('[data-grade]').forEach((b) => {
      b.onclick = async () => {
        const score = prompt('Puntuación final (máx ' + b.dataset.max + '):')
        if (score === null) return
        const note = prompt('Nota de revisión (opcional):') || ''
        try { await api('/attempts/' + b.dataset.grade + '/review', { method: 'POST', body: { final_score: Number(score), note } }); Q.toast('Calificación registrada', 'ok'); Q.render() }
        catch (e) { Q.toast(e.message, 'err') }
      }
    })
  }

  /* ======================== ENTREVISTAS ========================= */
  Q.views.interviews = async function () {
    Q.mountShell('interviews', Q.loading(), '')
    let data = []
    try { data = await api('/interviews') } catch (e) { return Q.mountShell('interviews', Q.errorBlock(e), '') }
    const upcoming = data.filter((i) => i.status === 'scheduled' && new Date(i.scheduled_at) >= new Date())
    const past = data.filter((i) => !upcoming.includes(i))

    const html = `
      <div class="notice n-info" style="margin-bottom:14px"><span>◷</span><div>Las entrevistas usan guías estructuradas y rúbricas comunes para que los candidatos de una misma vacante se comparen bajo los mismos criterios. Cada puntuación registra quién la hizo y cuándo.</div></div>
      ${upcoming.length ? `<section class="card" style="margin-bottom:14px">
        <div class="card-head"><h2>Próximas (${upcoming.length})</h2></div>
        <div class="card-pad"><div class="timeline">${upcoming.map((i) => `
          <div class="tl-item">
            <div class="tl-when">${esc(H.fmtDate(i.scheduled_at, true))} · ${i.duration_min} min · ${esc(i.timezone)}</div>
            <div class="tl-what"><a href="#/candidatos/${i.candidate_id}">${esc(i.full_name)}</a></div>
            <div class="small muted">${esc(i.job_title)} · ${esc(i.mode)} · entrevistador: ${esc(i.interviewer_name || '—')}</div>
            <div class="row" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-iv="${i.id}">Abrir rúbrica</button></div>
          </div>`).join('')}</div></div>
      </section>` : '<div class="card" style="margin-bottom:14px"><div class="empty"><h3>Sin entrevistas próximas</h3><p>Agenda una entrevista desde el detalle de una postulación.</p></div></div>'}

      ${past.length ? `<section class="card"><div class="card-head"><h2>Historial (${past.length})</h2></div><div class="tbl-wrap"><table>
        <thead><tr><th>Fecha</th><th>Candidato</th><th>Vacante</th><th>Entrevistador</th><th>Rúbrica</th><th>Estado</th><th></th></tr></thead>
        <tbody>${past.map((i) => `<tr>
          <td class="small nowrap">${esc(H.fmtDate(i.scheduled_at, true))}</td>
          <td class="small"><a href="#/candidatos/${i.candidate_id}">${esc(i.full_name)}</a></td>
          <td class="small">${esc(i.job_title)}</td>
          <td class="small">${esc(i.interviewer_name || '—')}</td>
          <td class="small">${i.scorecard_count} criterio(s)</td>
          <td>${H.statusBadge(i.status)}</td>
          <td><button class="btn btn-ghost btn-sm" data-iv="${i.id}">Abrir</button></td>
        </tr>`).join('')}</tbody></table></div></section>` : ''}`

    Q.mountShell('interviews', html, '')
    document.querySelectorAll('[data-iv]').forEach((b) => { b.onclick = () => openInterview(b.dataset.iv) })
  }

  async function openInterview(id) {
    let iv
    try { iv = await api('/interviews/' + id) } catch (e) { Q.toast(e.message, 'err'); return }
    const criteria = ['Conocimiento técnico del puesto', 'Resolución de problemas', 'Comunicación', 'Trabajo en equipo', 'Motivación y encaje']
    Q.modal({
      title: 'Entrevista · ' + iv.full_name,
      wide: true,
      body: `<div class="row small muted" style="margin-bottom:12px">${esc(H.fmtDate(iv.scheduled_at, true))} · ${esc(iv.mode)} · ${esc(iv.timezone)}</div>
        ${iv.guide ? `<div class="notice n-info" style="margin-bottom:12px"><span>ℹ</span><div style="white-space:pre-wrap">${esc(iv.guide)}</div></div>` : ''}
        <h3 style="margin-bottom:8px">Rúbrica estructurada</h3>
        <p class="hint" style="margin-bottom:10px">Escala 1–5. Evalúa solo criterios relacionados con el puesto.</p>
        <form id="scform">
          ${criteria.map((c) => `<div class="crit"><div class="crit-head"><b class="small">${esc(c)}</b><span class="spacer"></span>
            <select data-crit="${esc(c)}" style="max-width:90px"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></div>
            <input data-comment="${esc(c)}" placeholder="Comentario (opcional)" style="margin-top:6px"></div>`).join('')}
          <button class="btn" type="submit" style="margin-top:10px">Registrar puntuaciones</button>
        </form>
        <div class="sep"></div>
        <h3 style="margin-bottom:8px">Puntuaciones registradas</h3>
        <div id="scbox">${iv.scorecards.length ? iv.scorecards.map((s) => `<div class="row small" style="padding:5px 0;border-bottom:1px solid #eef1f5"><b>${esc(s.criterion)}</b><span class="badge b-blue">${s.score}/5</span><span class="muted">${esc(s.comment || '')}</span><span class="spacer"></span><span class="tiny muted">${esc(s.author_name || '')} · ${esc(H.fmtDate(s.created_at))}</span></div>`).join('') : '<p class="small muted">Sin puntuaciones.</p>'}</div>
        <div class="row" style="margin-top:12px"><button class="btn btn-ghost btn-sm" id="ivdone">Marcar como completada</button><button class="btn btn-ghost btn-sm" id="ivnoshow">No asistió</button></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cerrar</button>`,
      onMount: ({ close }) => {
        document.getElementById('scform').onsubmit = async (e) => {
          e.preventDefault()
          let n = 0
          for (const c of criteria) {
            const sel = document.querySelector(`[data-crit="${CSS.escape(c)}"]`)
            const com = document.querySelector(`[data-comment="${CSS.escape(c)}"]`)
            if (sel && sel.value) {
              try {
                await api('/interviews/' + id + '/scorecards', { method: 'POST', body: { criterion: c, score: Number(sel.value), comment: com.value } })
                n++
              } catch (err) { Q.toast(err.message, 'err') }
            }
          }
          Q.toast(n + ' criterio(s) registrados', n ? 'ok' : 'err')
          close(); Q.render()
        }
        document.getElementById('ivdone').onclick = async () => {
          try { await api('/interviews/' + id + '/status', { method: 'POST', body: { status: 'completed' } }); Q.toast('Entrevista completada', 'ok'); close(); Q.render() }
          catch (e) { Q.toast(e.message, 'err') }
        }
        document.getElementById('ivnoshow').onclick = async () => {
          try { await api('/interviews/' + id + '/status', { method: 'POST', body: { status: 'no_show' } }); Q.toast('Registrado', 'ok'); close(); Q.render() }
          catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  /* ========================= RESÚMENES ========================== */
  Q.views.reports = async function () {
    Q.mountShell('reports', Q.loading(), '')
    let ov, tth, tests, rej
    try {
      ;[ov, tth, tests, rej] = await Promise.all([
        api('/reports/overview'), api('/reports/time-to-hire'), api('/reports/tests'), api('/reports/rejections')
      ])
    } catch (e) { return Q.mountShell('reports', Q.errorBlock(e), '') }

    const maxStage = Math.max(1, ...(ov.funnel || []).map((f) => f.n))
    const html = `
      <div class="row" style="margin-bottom:14px">
        <span class="small muted">Definiciones visibles: estancado = +7 días sin actividad · tiempo de contratación = publicación → contratación</span>
        <span class="spacer"></span>
        <a class="btn btn-ghost btn-sm" href="/api/reports/export.csv?what=applications">Exportar postulaciones</a>
        <a class="btn btn-ghost btn-sm" href="/api/reports/export.csv?what=jobs">Exportar vacantes</a>
        <a class="btn btn-ghost btn-sm" href="/api/reports/export.csv?what=rejections">Exportar descartes</a>
      </div>

      <div class="grid g4" style="margin-bottom:16px">
        <div class="kpi brand"><div class="label">Vacantes activas</div><div class="value">${ov.jobs.active}</div><div class="foot">${ov.jobs.total} totales</div></div>
        <div class="kpi"><div class="label">Postulaciones</div><div class="value">${ov.applications.total}</div><div class="foot">${ov.stale_applications} estancadas</div></div>
        <div class="kpi"><div class="label">Días para cubrir</div><div class="value">${tth.average_days ?? '—'}</div><div class="foot">muestra: ${tth.sample_size} vacante(s)</div></div>
        <div class="kpi"><div class="label">Históricos recuperados</div><div class="value">${ov.recommendations_total}</div><div class="foot">recomendaciones generadas</div></div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
        <section class="card">
          <div class="card-head"><h2>Embudo por etapa</h2></div>
          <div class="card-pad">
            ${(ov.funnel || []).map((f) => `<div style="margin-bottom:10px">
              <div class="row" style="justify-content:space-between"><span class="small">${esc(f.name)}</span><span class="small muted">${f.n}</span></div>
              <div class="scorebar"><i style="width:${Math.round((f.n / maxStage) * 100)}%"></i></div></div>`).join('') || '<p class="muted small">Sin datos.</p>'}
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Resultados de pruebas</h2></div>
          <div class="card-pad">
            ${tests.warning ? `<div class="notice n-warn" style="margin-bottom:10px"><span>⚠</span><div>${esc(tests.warning)}</div></div>` : ''}
            ${(tests.items || []).length ? `<div class="tbl-wrap"><table><thead><tr><th>Prueba</th><th>Intentos</th><th>Promedio</th><th>Rango</th></tr></thead>
              <tbody>${tests.items.map((t) => `<tr><td class="small">${esc(t.title)}</td><td class="small">${t.attempts}</td><td class="small"><b>${t.avg_score ?? '—'}</b></td><td class="small muted">${t.min_score ?? '—'} – ${t.max_score ?? '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Sin intentos registrados.</p>'}
          </div>
        </section>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr">
        <section class="card">
          <div class="card-head"><h2>Motivos de descarte</h2></div>
          <div class="card-pad">
            ${(rej.items || []).length ? rej.items.map((r) => `<div class="row small" style="padding:5px 0;border-bottom:1px solid #eef1f5"><span>${esc(r.reason)}</span><span class="spacer"></span><b>${r.n}</b></div>`).join('') : '<p class="small muted">Sin descartes registrados.</p>'}
            <p class="tiny muted" style="margin-top:9px">${esc(rej.note)}</p>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Tiempo para cubrir vacantes</h2></div>
          <div class="card-pad">
            ${tth.warning ? `<div class="notice n-warn" style="margin-bottom:10px"><span>⚠</span><div>${esc(tth.warning)}</div></div>` : ''}
            ${(tth.items || []).length ? tth.items.map((t) => `<div class="row small" style="padding:5px 0;border-bottom:1px solid #eef1f5"><span>${esc(t.job_title)}</span><span class="spacer"></span><b>${t.days_to_fill} días</b></div>`).join('') : '<p class="small muted">Aún no hay contrataciones registradas.</p>'}
            <p class="tiny muted" style="margin-top:9px">${esc(tth.definition)}</p>
          </div>
        </section>
      </div>
      <div class="notice n-info" style="margin-top:16px"><span>ℹ</span><div>Los indicadores se calculan solo con datos de tu organización. Cuando el tamaño de muestra es pequeño se advierte explícitamente: no se presentan correlaciones como causalidad.</div></div>
    `
    Q.mountShell('reports', html, `<a class="btn btn-ghost" href="/api/reports/export.csv?what=applications">Exportar CSV</a>`)
  }

  /* ======================== CONFIGURACIÓN ======================= */
  Q.views.settings = async function () {
    Q.mountShell('settings', Q.loading(), '')
    const u = Q.state.user
    let users = [], privacy = [], org = Q.state.org || {}
    try { users = await api('/users') } catch (e) { users = [] }
    try { privacy = await api('/privacy/requests') } catch (e) { privacy = [] }

    const isAdmin = u.role === 'admin'
    const canAudit = u.role === 'admin' || u.role === 'auditor'
    const html = `
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <section class="card">
          <div class="card-head"><h2>Organización</h2></div>
          <div class="card-pad">
            ${isAdmin ? `<form id="orgform">
              <div class="field"><label for="on">Nombre</label><input id="on" value="${esc(org.name || '')}"></div>
              <div class="field-row-3">
                <div class="field"><label for="oc">País</label><input id="oc" value="${esc(org.country || 'EC')}" maxlength="3"></div>
                <div class="field"><label for="ot">Zona horaria</label><input id="ot" value="${esc(org.timezone || 'America/Guayaquil')}"></div>
                <div class="field"><label for="ocur">Moneda</label><input id="ocur" value="${esc(org.currency || 'USD')}" maxlength="5"></div>
              </div>
              <button class="btn" type="submit">Guardar</button>
            </form>` : `<p class="small"><b>${esc(org.name || '')}</b></p><p class="small muted">${esc(org.country || '')} · ${esc(org.timezone || '')} · ${esc(org.currency || '')}</p><p class="hint">Solo un administrador puede editar la organización.</p>`}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Roles y permisos</h2></div>
          <div class="card-pad">
            <div class="tbl-wrap"><table><thead><tr><th>Rol</th><th>Acceso</th></tr></thead><tbody>
              <tr><td class="small"><b>Administrador</b></td><td class="tiny">Todo: organización, usuarios, vacantes, candidatos, políticas y auditoría.</td></tr>
              <tr><td class="small"><b>Reclutador</b></td><td class="tiny">Vacantes, candidatos, postulaciones, pruebas, entrevistas y reportes.</td></tr>
              <tr><td class="small"><b>Responsable de contratación</b></td><td class="tiny">Lectura de vacantes y candidatos; entrevistas, notas y reportes.</td></tr>
              <tr><td class="small"><b>Evaluador técnico</b></td><td class="tiny">Pruebas y calificaciones; acceso limitado al perfil.</td></tr>
              <tr><td class="small"><b>Auditor</b></td><td class="tiny">Solo lectura y registros de auditoría.</td></tr>
            </tbody></table></div>
            <p class="hint" style="margin-top:9px">El aislamiento por organización se aplica en cada consulta a la base de datos, no solo en la interfaz.</p>
          </div>
        </section>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-head"><h2>Usuarios (${users.length})</h2><div class="right">${isAdmin ? '<button class="btn btn-sm" id="newUser">Nuevo usuario</button>' : ''}</div></div>
        <div class="tbl-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th></tr></thead>
          <tbody>${users.map((x) => `<tr><td class="small"><b>${esc(x.name)}</b></td><td class="small">${esc(x.email)}</td>
            <td class="small">${esc(({ admin: 'Administrador', recruiter: 'Reclutador', hiring_manager: 'Responsable', assessor: 'Evaluador', auditor: 'Auditor' })[x.role] || x.role)}</td>
            <td>${H.statusBadge(x.status === 'active' ? 'active' : 'archived')}</td>
            <td class="small muted">${esc(x.last_login_at ? H.fmtDate(x.last_login_at, true) : 'nunca')}</td></tr>`).join('')}</tbody></table></div>
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-head"><h2>Solicitudes de privacidad (${privacy.length})</h2></div>
        <div class="card-pad">
          <p class="small muted" style="margin-bottom:10px">Solicitudes de acceso, rectificación, oposición o eliminación. Cada una conserva estado, responsable y resolución.</p>
          ${privacy.length ? `<div class="tbl-wrap"><table><thead><tr><th>Candidato</th><th>Tipo</th><th>Estado</th><th>Creada</th><th>Resolución</th><th></th></tr></thead>
            <tbody>${privacy.map((p) => `<tr><td class="small"><a href="#/candidatos/${p.candidate_id}">${esc(p.full_name)}</a></td>
              <td class="small">${({ access: 'Acceso', rectification: 'Rectificación', opposition: 'Oposición', deletion: 'Eliminación' })[p.type]}</td>
              <td>${H.statusBadge(p.status)}</td><td class="small muted">${esc(H.fmtDate(p.created_at))}</td>
              <td class="small muted">${esc(p.resolution || '—')}</td>
              <td>${['open', 'in_progress'].includes(p.status) ? `<button class="btn btn-ghost btn-sm" data-pr="${p.id}">Atender</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="small muted">Sin solicitudes registradas.</p>'}
        </div>
      </section>

      ${canAudit ? `<section class="card" style="margin-top:16px">
        <div class="card-head"><h2>Registro de auditoría</h2><div class="right"><button class="btn btn-ghost btn-sm" id="loadAudit">Cargar últimas 100</button></div></div>
        <div class="card-pad" id="auditbox"><p class="small muted">Pulsa cargar para consultar el registro.</p></div>
      </section>` : ''}

      <section class="card" style="margin-top:16px">
        <div class="card-head"><h2>Integraciones</h2></div>
        <div class="card-pad">
          <div class="tbl-wrap"><table><thead><tr><th>Integración</th><th>Estado</th><th>Qué falta</th></tr></thead><tbody>
            <tr><td class="small"><b>Correo transaccional</b></td><td>${H.statusBadge('pending')}</td><td class="tiny">Configurar la clave del proveedor (por ejemplo RESEND_API_KEY) como secreto del proyecto. Sin ella los envíos se registran como fallidos.</td></tr>
            <tr><td class="small"><b>IA para extracción de CV</b></td><td>${H.statusBadge('pending')}</td><td class="tiny">Opcional. Sin proveedor, la extracción es heurística local y se marca como tal.</td></tr>
            <tr><td class="small"><b>Almacenamiento de archivos</b></td><td>${H.statusBadge('active')}</td><td class="tiny">Los documentos se guardan de forma privada en D1, ligados a la organización. No se generan enlaces públicos.</td></tr>
            <tr><td class="small"><b>Importación / exportación CSV</b></td><td>${H.statusBadge('active')}</td><td class="tiny">Disponible en Candidatos y Reportes.</td></tr>
            <tr><td class="small"><b>WhatsApp Business</b></td><td>${H.statusBadge('draft')}</td><td class="tiny">Requiere proveedor oficial, plantillas aprobadas y consentimiento. No implementado.</td></tr>
            <tr><td class="small"><b>Calendario externo</b></td><td>${H.statusBadge('draft')}</td><td class="tiny">No implementado. Hoy las entrevistas se agendan dentro de QUIPU.</td></tr>
          </tbody></table></div>
        </div>
      </section>`

    Q.mountShell('settings', html, '', 'Configuración')

    const of = document.getElementById('orgform')
    if (of) of.onsubmit = async (e) => {
      e.preventDefault()
      try {
        await api('/org', {
          method: 'PATCH',
          body: {
            name: document.getElementById('on').value,
            country: document.getElementById('oc').value,
            timezone: document.getElementById('ot').value,
            currency: document.getElementById('ocur').value
          }
        })
        Q.toast('Organización actualizada', 'ok')
        await Q.bootstrapOrg()
      } catch (err) { Q.toast(err.message, 'err') }
    }

    const nu = document.getElementById('newUser')
    if (nu) nu.onclick = () => Q.modal({
      title: 'Nuevo usuario',
      body: `<div class="field"><label for="un">Nombre</label><input id="un"></div>
        <div class="field"><label for="ue">Correo</label><input id="ue" type="email"></div>
        <div class="field"><label for="ur">Rol</label><select id="ur"><option value="recruiter">Reclutador</option><option value="hiring_manager">Responsable de contratación</option><option value="assessor">Evaluador técnico</option><option value="auditor">Auditor</option><option value="admin">Administrador</option></select></div>
        <div class="field"><label for="up">Contraseña inicial (mín. 8)</label><input id="up" type="password"></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Crear usuario</button>`,
      onMount: () => {
        document.getElementById('msave').onclick = async () => {
          try {
            await api('/users', {
              method: 'POST',
              body: { name: document.getElementById('un').value, email: document.getElementById('ue').value, role: document.getElementById('ur').value, password: document.getElementById('up').value }
            })
            Q.toast('Usuario creado', 'ok'); document.getElementById('mback').remove(); Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })

    document.querySelectorAll('[data-pr]').forEach((b) => {
      b.onclick = () => Q.modal({
        title: 'Atender solicitud',
        body: `<div class="field"><label for="pst">Estado</label><select id="pst"><option value="in_progress">En proceso</option><option value="done">Atendida</option><option value="rejected">Rechazada</option></select></div>
          <div class="field"><label for="prs">Resolución</label><textarea id="prs" rows="3" placeholder="Qué se hizo y cuándo."></textarea></div>
          <p class="hint">Al atender una oposición se bloquea el contacto del candidato automáticamente.</p>`,
        footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Guardar</button>`,
        onMount: () => {
          document.getElementById('msave').onclick = async () => {
            try {
              await api('/privacy/requests/' + b.dataset.pr, { method: 'PATCH', body: { status: document.getElementById('pst').value, resolution: document.getElementById('prs').value } })
              Q.toast('Solicitud actualizada', 'ok'); document.getElementById('mback').remove(); Q.render()
            } catch (e) { Q.toast(e.message, 'err') }
          }
        }
      })
    })

    const la = document.getElementById('loadAudit')
    if (la) la.onclick = async () => {
      const box = document.getElementById('auditbox')
      box.innerHTML = Q.loading()
      try {
        const rows = await api('/audit?limit=100')
        box.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Resultado</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td class="tiny nowrap">${esc(H.fmtDate(r.created_at, true))}</td><td class="tiny">${esc(r.actor_email)}</td>
            <td class="tiny">${esc(r.action)}</td><td class="tiny">${esc(r.entity)} #${esc(r.entity_id || '—')}</td><td class="tiny">${esc(r.result)}</td></tr>`).join('')}</tbody></table></div>`
      } catch (e) { box.innerHTML = Q.errorBlock(e) }
    }
  }
})()
