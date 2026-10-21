/* QUIPU · vistas: panel, vacantes, candidatos, postulación */
(function () {
  'use strict'
  const Q = window.Q, H = Q.helpers, api = Q.api, esc = H.esc

  /* ============================ PANEL ============================ */
  Q.views.dashboard = async function () {
    Q.mountShell('dashboard', Q.loading('Cargando indicadores…'), '')
    let d
    try { d = await api('/reports/overview') } catch (e) {
      return Q.mountShell('dashboard', Q.errorBlock(e))
    }
    const funnel = (d.funnel || []).filter((f) => f.n > 0 || f.position < 8)
    const maxFunnel = Math.max(1, ...funnel.map((f) => f.n))
    const consentGranted = (d.consent || []).find((x) => x.consent_status === 'granted')?.n || 0
    const consentPending = (d.consent || []).find((x) => x.consent_status === 'pending')?.n || 0

    const html = `
      <div class="notice n-demo" style="margin-bottom:16px">
        <span>◆</span>
        <div><b>Ambiente de demostración.</b> Los perfiles, vacantes y resultados incluidos son ficticios y sirven para probar el flujo completo. La estimación de compatibilidad es una ayuda para revisar, nunca una decisión automática.</div>
      </div>

      <div class="grid g4" style="margin-bottom:16px">
        <div class="kpi brand"><div class="label">Vacantes activas</div><div class="value">${d.jobs.active}</div><div class="foot">${d.jobs.total} en total</div></div>
        <div class="kpi"><div class="label">Postulaciones</div><div class="value">${d.applications.total}</div><div class="foot">${(d.applications.by_status || []).map((s) => s.n + ' ' + s.status).join(' · ') || 'sin registros'}</div></div>
        <div class="kpi ${d.stale_applications > 0 ? 'alert' : 'good'}"><div class="label">Procesos estancados</div><div class="value">${d.stale_applications}</div><div class="foot">+7 días sin actividad</div></div>
        <div class="kpi ${d.pending_reviews > 0 ? 'alert' : ''}"><div class="label">Evaluaciones por calificar</div><div class="value">${d.pending_reviews}</div><div class="foot">requieren revisión humana</div></div>
      </div>

      <div class="grid" style="grid-template-columns:1.5fr 1fr">
        <section class="card">
          <div class="card-head"><h2>Embudo del proceso</h2><div class="right"><a class="btn btn-ghost btn-sm" href="#/vacantes">Ver vacantes</a></div></div>
          <div class="card-pad">
            ${funnel.length ? funnel.map((f) => `
              <div style="margin-bottom:11px">
                <div class="row" style="justify-content:space-between;margin-bottom:4px">
                  <span class="small"><b>${esc(f.name)}</b></span>
                  <span class="small muted">${f.n} candidato${f.n === 1 ? '' : 's'}</span>
                </div>
                <div class="scorebar"><i style="width:${Math.round((f.n / maxFunnel) * 100)}%;background:${f.n ? '#0f6b5c' : '#cbd5e1'}"></i></div>
              </div>`).join('') : '<p class="muted">Aún no hay etapas registradas.</p>'}
          </div>
        </section>

        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Próximas entrevistas</h2></div>
            <div class="card-pad">
              ${d.upcoming_interviews.length ? `<div class="timeline">${d.upcoming_interviews.map((i) => `
                <div class="tl-item">
                  <div class="tl-when">${esc(H.fmtDate(i.scheduled_at, true))}</div>
                  <div class="tl-what">${esc(i.full_name)}</div>
                  <div class="small muted">${esc(i.job_title)}</div>
                </div>`).join('')}</div>`
                : '<p class="muted small">No hay entrevistas programadas. Agenda desde una postulación.</p>'}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Memoria de talento</h2></div>
            <div class="card-pad">
              <p class="small muted">Candidatos con consentimiento vigente y disponibles para búsqueda histórica.</p>
              <div class="row" style="gap:22px;margin:12px 0">
                <div><div class="score-num">${consentGranted}</div><div class="tiny muted">con consentimiento</div></div>
                <div><div class="score-num" style="color:#b54708">${consentPending}</div><div class="tiny muted">pendientes</div></div>
                <div><div class="score-num" style="color:#0f6b5c">${d.recommendations_total}</div><div class="tiny muted">recomendaciones</div></div>
              </div>
              <a class="btn btn-ghost btn-sm" href="#/memoria">Buscar en histórico</a>
            </div>
          </section>

          ${d.open_privacy_requests > 0 ? `<section class="card"><div class="card-pad"><div class="notice n-warn"><span>⚠</span><div><b>${d.open_privacy_requests} solicitud(es) de privacidad abiertas.</b><br><a href="#/configuracion">Atender en configuración</a></div></div></div></section>` : ''}
        </div>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-head"><h2>Orígenes de candidatos</h2></div>
        <div class="card-pad">
          ${(d.sources || []).length ? `<div class="row" style="gap:8px">${d.sources.map((s) => `<span class="chip">${esc(s.source)} · <b>${s.n}</b></span>`).join('')}</div>` : '<p class="muted small">Sin datos.</p>'}
        </div>
      </section>
    `
    Q.mountShell('dashboard', html, `<a class="btn" href="#/vacantes/nueva">Nueva vacante</a>`)
  }

  /* ============================ VACANTES ============================ */
  Q.views.jobs = async function () {
    Q.mountShell('jobs', Q.loading(), `<a class="btn" href="#/vacantes/nueva">Nueva vacante</a>`)
    const status = Q.state.jobsFilter || 'all'
    let jobs
    try { jobs = await api('/jobs?status=' + encodeURIComponent(status)) } catch (e) { return Q.mountShell('jobs', Q.errorBlock(e), '') }

    const html = `
      <div class="filters" style="margin-bottom:14px">
        <div class="field"><label for="jstatus">Estado</label>
          <select id="jstatus">
            ${['all', 'published', 'draft', 'paused', 'closed', 'archived'].map((s) => `<option value="${s}" ${status === s ? 'selected' : ''}>${({ all: 'Todas', published: 'Publicadas', draft: 'Borradores', paused: 'Pausadas', closed: 'Cerradas', archived: 'Archivadas' })[s]}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="jq">Buscar</label><input id="jq" placeholder="Título o área" value="${esc(Q.state.jobsQ || '')}"></div>
        <button class="btn btn-ghost" id="jsearch">Filtrar</button>
      </div>
      ${jobs.length ? `<div class="card"><div class="tbl-wrap"><table>
        <thead><tr><th>Vacante</th><th>Estado</th><th>Etapa / candidatos</th><th>Criterios</th><th>Responsable</th><th>Creada</th><th></th></tr></thead>
        <tbody>
        ${jobs.map((j) => `
          <tr>
            <td><a href="#/vacantes/${j.id}"><b>${esc(j.title)}</b></a><div class="tiny muted">${esc(j.area || 'Sin área')}${j.location ? ' · ' + esc(j.location) : ''} · ${esc(j.modality)}</div></td>
            <td>${H.statusBadge(j.status)}</td>
            <td><span class="badge b-blue">${j.active_candidates} activos</span> <span class="tiny muted">de ${j.total_candidates}</span></td>
            <td>${j.mandatory_count > 0 ? `<span class="badge b-red">${j.mandatory_count} excluyente(s)</span>` : '<span class="tiny muted">sin excluyentes</span>'}</td>
            <td class="small">${esc(j.hiring_manager_name || j.recruiter_name || '—')}</td>
            <td class="small muted nowrap">${esc(H.fmtDate(j.created_at))}</td>
            <td class="nowrap"><a class="btn btn-ghost btn-sm" href="#/vacantes/${j.id}">Abrir</a></td>
          </tr>`).join('')}
        </tbody></table></div></div>`
        : `<div class="card"><div class="empty"><h3>No hay vacantes con este filtro</h3><p>Crea la primera vacante para empezar a recibir postulaciones y activar la memoria de talento.</p><a class="btn" href="#/vacantes/nueva">Nueva vacante</a></div></div>`}
    `
    Q.mountShell('jobs', html, `<a class="btn" href="#/vacantes/nueva">Nueva vacante</a>`)
    document.getElementById('jstatus').onchange = (e) => { Q.state.jobsFilter = e.target.value; Q.render() }
    document.getElementById('jsearch').onclick = () => { Q.state.jobsQ = document.getElementById('jq').value; Q.render() }
  }

  /* ------------------------ NUEVA VACANTE ----------------------- */
  Q.views.jobs.new = async function () {
    Q.mountShell('jobs', Q.loading(), '', 'Nueva vacante')
    let users = []
    try { users = await api('/users') } catch (e) { users = [] }

    const html = `
      <form id="jobform" novalidate>
        <div class="grid" style="grid-template-columns:1.6fr 1fr">
          <div class="stack">
            <section class="card card-pad">
              <h2 style="margin-bottom:14px">Datos de la vacante</h2>
              <div class="field"><label for="title">Título del puesto *</label><input id="title" maxlength="160" required placeholder="Ej: Analista Financiero Senior"></div>
              <div class="field-row">
                <div class="field"><label for="area">Área</label><input id="area" maxlength="100" placeholder="Finanzas"></div>
                <div class="field"><label for="location">Ubicación</label><input id="location" maxlength="120" placeholder="Quito, Ecuador"></div>
              </div>
              <div class="field-row-3">
                <div class="field"><label for="modality">Modalidad</label><select id="modality"><option value="presencial">Presencial</option><option value="hibrido" selected>Híbrido</option><option value="remoto">Remoto</option></select></div>
                <div class="field"><label for="workday">Jornada</label><input id="workday" value="jornada completa" maxlength="60"></div>
                <div class="field"><label for="contract_type">Contrato</label><input id="contract_type" value="indefinido" maxlength="60"></div>
              </div>
              <div class="field-row-3">
                <div class="field"><label for="seniority">Nivel</label><input id="seniority" placeholder="Senior" maxlength="60"></div>
                <div class="field"><label for="salary_min">Salario mínimo (USD)</label><input id="salary_min" type="number" min="0" step="50"></div>
                <div class="field"><label for="salary_max">Salario máximo (USD)</label><input id="salary_max" type="number" min="0" step="50"></div>
              </div>
              <div class="field"><label for="description">Descripción</label><textarea id="description" rows="4" placeholder="Contexto del puesto, equipo y objetivos."></textarea></div>
              <div class="field"><label for="responsibilities">Funciones principales</label><textarea id="responsibilities" rows="4" placeholder="Una por línea."></textarea></div>
            </section>

            <section class="card">
              <div class="card-head"><h2>Criterios de evaluación</h2><div class="right"><button type="button" class="btn btn-ghost btn-sm" id="addcrit">+ Agregar criterio</button></div></div>
              <div class="card-pad">
                <div class="notice n-info" style="margin-bottom:14px"><span>ℹ</span><div>Los <b>requisitos excluyentes</b> no suman puntos: si no se cumplen, el perfil se marca para revisión. Los <b>ponderados</b> deben sumar 100 en total. Los pesos se registran y quedan auditados.</div></div>
                <div id="critlist"></div>
                <div class="row" style="justify-content:flex-end;margin-top:10px"><span class="small">Suma de pesos: <b id="weightsum">0</b> / 100</span></div>
              </div>
            </section>
          </div>

          <div class="stack">
            <section class="card card-pad">
              <h2 style="margin-bottom:12px">Responsables</h2>
              <div class="field"><label for="hiring_manager_id">Responsable de contratación</label>
                <select id="hiring_manager_id"><option value="">— Sin asignar —</option>
                ${users.filter((u) => ['hiring_manager', 'admin', 'recruiter'].includes(u.role)).map((u) => `<option value="${u.id}">${esc(u.name)} (${u.role})</option>`).join('')}
                </select>
              </div>
              <p class="hint">Podrás asignar evaluadores y aprobadores al publicar.</p>
            </section>

            <section class="card card-pad">
              <h2 style="margin-bottom:12px">Plantillas</h2>
              <p class="small muted">Las plantillas por familia de puestos permiten reutilizar criterios ya aprobados.</p>
              <button type="button" class="btn btn-ghost btn-block btn-sm" id="tplbtn" style="margin-top:10px">Insertar plantilla de criterios</button>
            </section>

            <section class="card card-pad">
              <div class="notice n-warn"><span>⚠</span><div>La vacante se crea como <b>borrador</b>. Se publica solo con criterios definidos, y nunca se publica automáticamente en portales externos.</div></div>
            </section>
          </div>
        </div>

        <div class="row" style="justify-content:flex-end;margin-top:16px;gap:9px">
          <a class="btn btn-ghost" href="#/vacantes">Cancelar</a>
          <button class="btn" type="submit" id="savejob">Crear vacante</button>
        </div>
      </form>`

    Q.mountShell('jobs', html, '', 'Nueva vacante')

    const list = document.getElementById('critlist')
    let crits = [{ kind: 'mandatory', category: 'experience', label: '', weight: 0, keywords: '', min_years: null }]

    function drawCrits() {
      list.innerHTML = crits.map((c, i) => `
        <div class="card-pad" style="border:1px solid #e3e8ef;border-radius:10px;margin-bottom:10px;background:#fbfcfd">
          <div class="row" style="gap:8px;margin-bottom:8px">
            <select data-i="${i}" data-f="kind" style="max-width:160px">
              <option value="mandatory" ${c.kind === 'mandatory' ? 'selected' : ''}>Excluyente</option>
              <option value="weighted" ${c.kind === 'weighted' ? 'selected' : ''}>Ponderado</option>
            </select>
            <select data-i="${i}" data-f="category" style="max-width:170px">
              ${[['experience', 'Experiencia'], ['technical', 'Técnica'], ['competency', 'Competencia'], ['education', 'Formación'], ['other', 'Otro']].map(([v, l]) => `<option value="${v}" ${c.category === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            ${c.kind === 'weighted' ? `<input data-i="${i}" data-f="weight" type="number" min="0" max="100" value="${c.weight}" style="max-width:90px" aria-label="Peso">` : '<span class="badge b-red">Regla excluyente</span>'}
            <button type="button" class="btn btn-ghost btn-sm" data-del="${i}" style="margin-left:auto">Quitar</button>
          </div>
          <input data-i="${i}" data-f="label" value="${esc(c.label)}" placeholder="Criterio (ej: Experiencia con NIIF)" style="margin-bottom:7px" aria-label="Criterio">
          <input data-i="${i}" data-f="keywords" value="${esc(c.keywords)}" placeholder="Palabras clave separadas por coma (ej: niif, conciliacion)" aria-label="Palabras clave">
          ${c.category === 'experience' ? `<input data-i="${i}" data-f="min_years" type="number" min="0" step="0.5" value="${c.min_years ?? ''}" placeholder="Años mínimos" style="margin-top:7px" aria-label="Años mínimos">` : ''}
        </div>`).join('')

      list.querySelectorAll('[data-f]').forEach((el) => {
        el.onchange = el.oninput = () => {
          const i = +el.dataset.i, f = el.dataset.f
          crits[i][f] = f === 'weight' || f === 'min_years' ? (el.value === '' ? null : Number(el.value)) : el.value
          const sum = crits.filter((x) => x.kind === 'weighted').reduce((s, x) => s + (Number(x.weight) || 0), 0)
          document.getElementById('weightsum').textContent = sum
          if (f === 'kind') drawCrits()
        }
      })
      list.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = () => { crits.splice(+b.dataset.del, 1); drawCrits() }
      })
      const sum = crits.filter((x) => x.kind === 'weighted').reduce((s, x) => s + (Number(x.weight) || 0), 0)
      document.getElementById('weightsum').textContent = sum
    }
    drawCrits()

    document.getElementById('addcrit').onclick = () => {
      crits.push({ kind: 'weighted', category: 'technical', label: '', weight: 0, keywords: '', min_years: null })
      drawCrits()
    }

    document.getElementById('tplbtn').onclick = () => {
      const tpl = Q.templates[0]
      crits = tpl.criteria.map((c) => ({ ...c, keywords: (c.keywords || []).join(', ') }))
      drawCrits()
      Q.toast('Plantilla aplicada: ' + tpl.name + '. Revisa y ajusta los criterios antes de guardar.')
    }

    document.getElementById('jobform').onsubmit = async (e) => {
      e.preventDefault()
      const title = document.getElementById('title').value.trim()
      if (!title) { Q.toast('El título es obligatorio', 'err'); return }
      const valid = crits.filter((c) => c.label.trim())
      const weighted = valid.filter((c) => c.kind === 'weighted')
      if (weighted.length) {
        const sum = weighted.reduce((s, c) => s + (Number(c.weight) || 0), 0)
        if (sum !== 100 && sum !== 0) {
          if (!(await Q.confirm('Los pesos suman ' + sum, 'Los criterios ponderados deberían sumar 100. ¿Deseas guardar de todos modos? Podrás ajustarlos antes de publicar.', 'Guardar igual'))) return
        }
      }
      const body = {
        title,
        area: v('area'), location: v('location'), modality: v('modality'), workday: v('workday'),
        contract_type: v('contract_type'), seniority: v('seniority'),
        salary_min: v('salary_min') ? Number(v('salary_min')) : null,
        salary_max: v('salary_max') ? Number(v('salary_max')) : null,
        description: v('description'), responsibilities: v('responsibilities'),
        hiring_manager_id: v('hiring_manager_id') || null,
        criteria: valid.map((c) => ({
          kind: c.kind, category: c.category, label: c.label.trim(),
          weight: c.kind === 'weighted' ? Number(c.weight) || 0 : 0,
          keywords: String(c.keywords || '').split(',').map((s) => s.trim()).filter(Boolean),
          min_years: c.min_years
        }))
      }
      const btn = document.getElementById('savejob')
      btn.disabled = true; btn.textContent = 'Guardando…'
      try {
        const r = await api('/jobs', { method: 'POST', body })
        Q.toast('Vacante creada. Agrega criterios y publícala cuando esté lista.', 'ok')
        Q.nav('#/vacantes/' + r.id)
      } catch (err) {
        Q.toast(err.message, 'err')
        btn.disabled = false; btn.textContent = 'Crear vacante'
      }
    }
    function v(id) { return document.getElementById(id).value.trim() }
  }

  Q.templates = [
    {
      name: 'Analista financiero (contabilidad y NIIF)',
      criteria: [
        { kind: 'mandatory', category: 'education', label: 'Formación en contabilidad, finanzas o afines', keywords: ['contabilidad', 'finanzas', 'cpa', 'auditoria'], weight: 0, min_years: null },
        { kind: 'weighted', category: 'experience', label: 'Experiencia relevante en análisis financiero', keywords: ['analisis financiero', 'presupuesto', 'conciliacion'], weight: 25, min_years: 2 },
        { kind: 'weighted', category: 'technical', label: 'Dominio de Excel avanzado', keywords: ['excel', 'buscarx', 'tabla dinamica', 'sumar.si.conjunto'], weight: 25, min_years: null },
        { kind: 'weighted', category: 'technical', label: 'Conocimiento de NIIF / normativa local', keywords: ['niif', 'ifrs', 'tributacion', 'sri'], weight: 20, min_years: null },
        { kind: 'weighted', category: 'competency', label: 'Comunicación y trabajo con otras áreas', keywords: ['comunicacion', 'colaboracion', 'reportes'], weight: 15, min_years: null },
        { kind: 'weighted', category: 'other', label: 'Herramientas de BI (Power BI o similar)', keywords: ['power bi', 'tableau', 'looker'], weight: 15, min_years: null }
      ]
    },
    {
      name: 'Desarrollador backend',
      criteria: [
        { kind: 'mandatory', category: 'technical', label: 'Experiencia con SQL', keywords: ['sql', 'postgresql', 'mysql'], weight: 0, min_years: null },
        { kind: 'weighted', category: 'experience', label: 'Experiencia construyendo servicios en producción', keywords: ['api', 'backend', 'microservicios'], weight: 30, min_years: 2 },
        { kind: 'weighted', category: 'technical', label: 'Lenguaje de programación principal', keywords: ['javascript', 'typescript', 'python', 'java'], weight: 30, min_years: null },
        { kind: 'weighted', category: 'technical', label: 'Pruebas automatizadas y calidad', keywords: ['testing', 'qa', 'pruebas automatizadas'], weight: 20, min_years: null },
        { kind: 'weighted', category: 'competency', label: 'Trabajo en equipo y comunicación técnica', keywords: ['colaboracion', 'comunicacion', 'code review'], weight: 20, min_years: null }
      ]
    }
  ]

  /* --------------------- DETALLE DE VACANTE --------------------- */
  Q.views.jobs.detail = async function (id) {
    Q.mountShell('jobs', Q.loading(), '', 'Vacante')
    let job
    try { job = await api('/jobs/' + id) } catch (e) { return Q.mountShell('jobs', Q.errorBlock(e), '') }

    const byStage = {}
    job.applications.forEach((a) => {
      const k = a.stage_id || 0
      byStage[k] = byStage[k] || []
      byStage[k].push(a)
    })

    const mand = job.criteria.filter((c) => c.kind === 'mandatory')
    const weighted = job.criteria.filter((c) => c.kind === 'weighted')
    const wsum = weighted.reduce((s, c) => s + c.weight, 0)

    const html = `
      <div class="row" style="margin-bottom:14px;align-items:flex-start">
        <div>
          <div class="row" style="gap:8px;margin-bottom:6px">${H.statusBadge(job.status)} <span class="badge b-gray">${esc(job.modality)}</span> ${job.public_slug && job.status === 'published' ? `<a class="badge b-teal" href="/empleos/${esc(job.public_slug)}" target="_blank">Ver página pública ↗</a>` : ''}</div>
          <h2 style="font-size:21px">${esc(job.title)}</h2>
          <p class="small muted" style="margin-top:4px">${esc(job.area || 'Sin área')}${job.location ? ' · ' + esc(job.location) : ''}${job.seniority ? ' · ' + esc(job.seniority) : ''}${job.salary_min ? ' · ' + H.money(job.salary_min) + ' – ' + H.money(job.salary_max) : ''}</p>
        </div>
        <div class="spacer"></div>
        <div class="row">
          ${job.status !== 'published' ? `<button class="btn" id="publish" ${job.criteria.length ? '' : 'disabled title="Agrega criterios antes de publicar"'}>Publicar</button>` : `<button class="btn btn-ghost" id="pause">Pausar</button>`}
          ${job.status !== 'closed' ? '<button class="btn btn-ghost" id="closejob">Cerrar</button>' : ''}
          <a class="btn btn-ghost" href="#/vacantes/${job.id}">Pipeline</a>
        </div>
      </div>

      <div class="tabs" id="jtabs" style="margin-bottom:16px">
        <button class="tab active" data-tab="pipeline">Pipeline (${job.applications.length})</button>
        <button class="tab" data-tab="criteria">Criterios (${job.criteria.length})</button>
        <button class="tab" data-tab="matches">Smart Match</button>
        <button class="tab" data-tab="detail">Descripción</button>
        <button class="tab" data-tab="history">Historial</button>
      </div>

      <div id="tab-body">
        <section id="tab-pipeline">
          ${job.criteria.length ? '' : '<div class="notice n-warn" style="margin-bottom:12px"><span>⚠</span><div>Esta vacante no tiene criterios definidos. Sin criterios el Smart Match no puede estimar compatibilidad y la vacante no se puede publicar.</div></div>'}
          <div class="kanban">
            ${job.stages.map((s) => {
              const list = byStage[s.id] || []
              return `<div class="kcol">
                <div class="kcol-head">${esc(s.name)}<span class="count">${list.length}</span></div>
                ${list.length ? list.map((a) => {
                  const days = Math.floor((Date.now() - new Date(String(a.last_activity_at).includes('T') ? a.last_activity_at : a.last_activity_at.replace(' ', 'T') + 'Z').getTime()) / 86400000)
                  return `<div class="kcard ${days > 7 && a.status === 'active' ? 'stale' : ''}" data-open="${a.id}">
                    <b>${esc(a.full_name)}</b>
                    <div class="meta"><span>${a.years_experience} años</span>${days > 7 && a.status === 'active' ? `<span class="badge b-amber">${days}d sin actividad</span>` : `<span>${esc(H.fmtRelative(a.applied_at))}</span>`}</div>
                  </div>`
                }).join('') : '<div class="kcol-empty">Sin candidatos</div>'}
              </div>`
            }).join('')}
          </div>
          <div class="card card-pad" style="margin-top:14px">
            <div class="row"><b class="small">Agregar postulación</b><span class="spacer"></span>
              <button class="btn btn-ghost btn-sm" id="addExisting">Candidato existente</button>
              <button class="btn btn-sm" id="addnew">Nuevo candidato</button>
            </div>
          </div>
        </section>

        <section id="tab-criteria" style="display:none">
          <div class="card">
            <div class="card-head"><h2>Criterios de evaluación</h2><div class="right"><span class="small">Pesos ponderados: <b>${wsum}</b>/100</span></div></div>
            <div class="card-pad">
              ${job.criteria.length ? `
                <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px">Requisitos excluyentes (${mand.length})</h3>
                ${mand.length ? mand.map((c) => `<div class="crit"><div class="crit-head"><span class="badge b-red">Excluyente</span><b>${esc(c.label)}</b></div>${c.keywords.length ? `<div class="crit-ev">${esc(c.keywords.join(', '))}</div>` : ''}${c.min_years ? `<div class="crit-ev">Mínimo ${c.min_years} años</div>` : ''}</div>`).join('') : '<p class="small muted">Sin requisitos excluyentes definidos.</p>'}
                <div class="sep"></div>
                <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px">Criterios ponderados (${weighted.length})</h3>
                ${weighted.length ? weighted.map((c) => `<div class="crit"><div class="crit-head"><span class="badge b-blue">${c.weight}%</span><b>${esc(c.label)}</b><span class="badge b-gray">${esc(c.category)}</span></div>${c.keywords.length ? `<div class="crit-ev">${esc(c.keywords.join(', '))}</div>` : ''}</div>`).join('') : '<p class="small muted">Sin criterios ponderados.</p>'}
                ${wsum !== 100 && weighted.length ? '<div class="notice n-warn" style="margin-top:14px"><span>⚠</span><div>Los pesos suman ' + wsum + ', no 100. La estimación se normaliza sobre el peso realmente evaluado, pero conviene ajustarlos.</div></div>' : ''}
                <button class="btn btn-ghost btn-sm" id="editCrit" style="margin-top:14px">Editar criterios</button>
              ` : '<div class="empty"><h3>Sin criterios</h3><p>Los criterios hacen posible el Smart Match y la trazabilidad de las decisiones.</p><button class="btn" id="editCrit">Definir criterios</button></div>'}
            </div>
          </div>
        </section>

        <section id="tab-matches" style="display:none">
          <div class="card card-pad" style="margin-bottom:14px">
            <div class="row">
              <div><b>Compatibilidad explicada</b><div class="small muted">Compara postulantes y perfiles históricos con los criterios de esta vacante.</div></div>
              <span class="spacer"></span>
              <label class="small" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="inclHistory" checked> Incluir histórico</label>
              <button class="btn" id="runMatch">Analizar</button>
            </div>
          </div>
          <div id="matchout"></div>
        </section>

        <section id="tab-detail" style="display:none">
          <div class="card card-pad">
            <h3>Descripción</h3>
            <p class="small" style="white-space:pre-wrap;margin-top:8px">${esc(job.description || 'Sin descripción.')}</p>
            <div class="sep"></div>
            <h3>Funciones</h3>
            <p class="small" style="white-space:pre-wrap;margin-top:8px">${esc(job.responsibilities || 'Sin funciones detalladas.')}</p>
          </div>
        </section>

        <section id="tab-history" style="display:none">
          <div class="card card-pad" id="histbox">${Q.loading('Cargando historial…')}</div>
        </section>
      </div>`

    Q.mountShell('jobs', html, `<a class="btn btn-ghost" href="#/vacantes">Volver</a>`, job.title)

    /* tabs */
    document.querySelectorAll('#jtabs .tab').forEach((t) => {
      t.onclick = () => {
        document.querySelectorAll('#jtabs .tab').forEach((x) => x.classList.remove('active'))
        t.classList.add('active')
        ;['pipeline', 'criteria', 'matches', 'detail', 'history'].forEach((k) => {
          document.getElementById('tab-' + k).style.display = k === t.dataset.tab ? '' : 'none'
        })
        if (t.dataset.tab === 'history') loadHistory()
      }
    })

    async function loadHistory() {
      try {
        const vers = await api('/jobs/' + id + '/versions')
        document.getElementById('histbox').innerHTML = vers.length
          ? `<h3 style="margin-bottom:12px">Cambios registrados (${vers.length})</h3><div class="timeline">${vers.map((v) => `
              <div class="tl-item"><div class="tl-when">${esc(H.fmtDate(v.created_at, true))}</div>
              <div class="tl-what">Versión #${v.id}</div>
              <div class="small muted">por ${esc(v.changed_by_name || 'sistema')}</div></div>`).join('')}</div>
              <p class="tiny muted" style="margin-top:10px">Cada guardado conserva una copia de la descripción, criterios y etapas vigentes en ese momento.</p>`
          : '<p class="muted small">Sin cambios registrados.</p>'
      } catch (e) { document.getElementById('histbox').innerHTML = Q.errorBlock(e) }
    }

    /* acciones */
    const pub = document.getElementById('publish')
    if (pub) pub.onclick = async () => {
      try { await api('/jobs/' + id + '/status', { method: 'POST', body: { status: 'published' } }); Q.toast('Vacante publicada', 'ok'); Q.render() }
      catch (e) { Q.toast(e.message, 'err') }
    }
    const pause = document.getElementById('pause')
    if (pause) pause.onclick = async () => {
      try { await api('/jobs/' + id + '/status', { method: 'POST', body: { status: 'paused' } }); Q.toast('Vacante pausada', 'ok'); Q.render() }
      catch (e) { Q.toast(e.message, 'err') }
    }
    const closeBtn = document.getElementById('closejob')
    if (closeBtn) closeBtn.onclick = async () => {
      if (!(await Q.confirm('Cerrar vacante', 'La vacante dejará de recibir postulaciones. Los perfiles se conservan en la memoria de talento.', 'Cerrar vacante', true))) return
      try { await api('/jobs/' + id + '/status', { method: 'POST', body: { status: 'closed' } }); Q.toast('Vacante cerrada', 'ok'); Q.render() }
      catch (e) { Q.toast(e.message, 'err') }
    }

    document.querySelectorAll('[data-open]').forEach((el) => {
      el.onclick = () => Q.nav('#/postulacion/' + el.dataset.open)
    })

    const editCrit = document.getElementById('editCrit')
    if (editCrit) editCrit.onclick = () => editCriteria(job)

    document.getElementById('runMatch').onclick = async () => {
      const out = document.getElementById('matchout')
      out.innerHTML = Q.loading('Evaluando perfiles…')
      const hist = document.getElementById('inclHistory').checked
      try {
        const r = await api('/jobs/' + id + '/matches?history=' + hist)
        out.innerHTML = Q.renderMatchList(r)
        Q.bindMatchCards()
      } catch (e) { out.innerHTML = Q.errorBlock(e) }
    }

    document.getElementById('addExisting').onclick = () => addExistingApp(job)
    document.getElementById('addnew').onclick = () => addNewApp(job)
  }

  async function editCriteria(job) {
    Q.modal({
      title: 'Editar criterios de la vacante',
      wide: true,
      body: `<div class="notice n-info" style="margin-bottom:12px"><span>ℹ</span><div>Los cambios quedan registrados en el historial de versiones con tu usuario y la fecha. Los resultados previos no se recalculan automáticamente.</div></div>
        <div id="mcrit"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="madd" style="margin-top:8px">+ Criterio</button>
        <div class="row" style="justify-content:flex-end;margin-top:10px"><span class="small">Pesos: <b id="mweight">0</b>/100</span></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Guardar criterios</button>`,
      onMount: () => {
        let crits = job.criteria.map((c) => ({ ...c, keywords: (c.keywords || []).join(', ') }))
        if (!crits.length) crits = [{ kind: 'mandatory', category: 'technical', label: '', weight: 0, keywords: '' }]
        const host = document.getElementById('mcrit')
        const draw = () => {
          host.innerHTML = crits.map((c, i) => `
            <div style="border:1px solid #e3e8ef;border-radius:10px;padding:11px;margin-bottom:9px">
              <div class="row" style="gap:7px;margin-bottom:7px">
                <select data-i="${i}" data-f="kind"><option value="mandatory" ${c.kind === 'mandatory' ? 'selected' : ''}>Excluyente</option><option value="weighted" ${c.kind === 'weighted' ? 'selected' : ''}>Ponderado</option></select>
                <select data-i="${i}" data-f="category">${[['experience', 'Experiencia'], ['technical', 'Técnica'], ['competency', 'Competencia'], ['education', 'Formación'], ['other', 'Otro']].map(([v, l]) => `<option value="${v}" ${c.category === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <input data-i="${i}" data-f="weight" type="number" min="0" max="100" value="${c.weight}" style="max-width:80px" aria-label="Peso">
                <button type="button" class="btn btn-ghost btn-sm" data-del="${i}" style="margin-left:auto">Quitar</button>
              </div>
              <input data-i="${i}" data-f="label" value="${esc(c.label)}" placeholder="Criterio" style="margin-bottom:6px">
              <input data-i="${i}" data-f="keywords" value="${esc(c.keywords)}" placeholder="Palabras clave separadas por coma">
              ${c.category === 'experience' ? `<input data-i="${i}" data-f="min_years" type="number" step="0.5" value="${c.min_years ?? ''}" placeholder="Años mínimos" style="margin-top:6px">` : ''}
            </div>`).join('')
          const sum = crits.filter((x) => x.kind === 'weighted').reduce((s, x) => s + (Number(x.weight) || 0), 0)
          document.getElementById('mweight').textContent = sum
          host.querySelectorAll('[data-f]').forEach((el) => {
            el.onchange = el.oninput = () => {
              const i = +el.dataset.i, f = el.dataset.f
              crits[i][f] = (f === 'weight' || f === 'min_years') ? (el.value === '' ? null : Number(el.value)) : el.value
              if (f === 'kind' || f === 'category') draw()
              else document.getElementById('mweight').textContent = crits.filter((x) => x.kind === 'weighted').reduce((s, x) => s + (Number(x.weight) || 0), 0)
            }
          })
          host.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { crits.splice(+b.dataset.del, 1); draw() } })
        }
        draw()
        document.getElementById('madd').onclick = () => { crits.push({ kind: 'weighted', category: 'technical', label: '', weight: 0, keywords: '' }); draw() }
        document.getElementById('msave').onclick = async () => {
          const valid = crits.filter((c) => c.label.trim())
          if (!valid.length) { Q.toast('Agrega al menos un criterio', 'err'); return }
          try {
            await api('/jobs/' + job.id, {
              method: 'PATCH',
              body: {
                criteria: valid.map((c) => ({
                  kind: c.kind, category: c.category, label: c.label.trim(),
                  weight: c.kind === 'weighted' ? Number(c.weight) || 0 : 0,
                  keywords: String(c.keywords || '').split(',').map((s) => s.trim()).filter(Boolean),
                  min_years: c.min_years != null ? Number(c.min_years) : null
                }))
              }
            })
            Q.toast('Criterios actualizados', 'ok')
            Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  function addExistingApp(job) {
    Q.modal({
      title: 'Agregar candidato existente',
      body: `<div class="field"><label for="qsearch">Buscar por nombre o correo</label><input id="qsearch" placeholder="Escribe para buscar…"></div>
        <div id="qresults" class="stack" style="max-height:280px;overflow:auto"><p class="small muted">Escribe al menos 2 caracteres.</p></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cerrar</button>`,
      onMount: () => {
        let timer
        const search = async () => {
          const q = document.getElementById('qsearch').value.trim()
          const box = document.getElementById('qresults')
          if (q.length < 2) { box.innerHTML = '<p class="small muted">Escribe al menos 2 caracteres.</p>'; return }
          box.innerHTML = Q.loading('Buscando…')
          try {
            const r = await api('/candidates?q=' + encodeURIComponent(q) + '&limit=12')
            box.innerHTML = r.items.length ? r.items.map((c) => `
              <div class="row" style="border:1px solid #e3e8ef;border-radius:9px;padding:9px">
                <div><b class="small">${esc(c.full_name)}</b><div class="tiny muted">${esc(c.email || 'sin correo')} · ${c.years_experience} años ${c.consent_status !== 'granted' ? '· ⚠ consentimiento ' + esc(c.consent_status) : ''}</div></div>
                <span class="spacer"></span>
                <button class="btn btn-sm" data-pick="${c.id}">Agregar</button>
              </div>`).join('') : '<p class="small muted">Sin resultados.</p>'
            box.querySelectorAll('[data-pick]').forEach((b) => {
              b.onclick = async () => {
                try {
                  await api('/applications', { method: 'POST', body: { job_id: job.id, candidate_id: +b.dataset.pick } })
                  Q.toast('Postulación registrada', 'ok')
                  document.getElementById('mback').remove()
                  Q.render()
                } catch (e) { Q.toast(e.message, 'err') }
              }
            })
          } catch (e) { box.innerHTML = Q.errorBlock(e) }
        }
        document.getElementById('qsearch').oninput = () => { clearTimeout(timer); timer = setTimeout(search, 280) }
      }
    })
  }

  function addNewApp(job) {
    Q.modal({
      title: 'Nuevo candidato y postulación',
      body: `<div class="field"><label for="nf">Nombre completo *</label><input id="nf" maxlength="160"></div>
        <div class="field-row"><div class="field"><label for="ne">Correo</label><input id="ne" type="email"></div><div class="field"><label for="np">Teléfono</label><input id="np"></div></div>
        <div class="field-row"><div class="field"><label for="nl">Ciudad</label><input id="nl"></div><div class="field"><label for="ny">Años de experiencia</label><input id="ny" type="number" min="0" max="60" step="0.5" value="0"></div></div>
        <div class="field"><label for="nh">Titular profesional</label><input id="nh" maxlength="160"></div>
        <div class="notice n-info" style="margin-top:6px"><span>ℹ</span><div>Si el correo ya existe, el sistema reutiliza el perfil único en lugar de duplicarlo.</div></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="nsave">Registrar postulación</button>`,
      onMount: () => {
        document.getElementById('nsave').onclick = async () => {
          const full_name = document.getElementById('nf').value.trim()
          if (!full_name) { Q.toast('El nombre es obligatorio', 'err'); return }
          try {
            const r = await api('/applications', {
              method: 'POST',
              body: {
                job_id: job.id, full_name,
                email: document.getElementById('ne').value.trim(),
                phone: document.getElementById('np').value.trim(),
                location: document.getElementById('nl').value.trim(),
                years_experience: Number(document.getElementById('ny').value || 0),
                headline: document.getElementById('nh').value.trim(),
                source: 'manual'
              }
            })
            Q.toast('Postulación creada', 'ok')
            document.getElementById('mback').remove()
            Q.nav('#/postulacion/' + r.id)
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  /* ------------------------- MATCH RENDER ----------------------- */
  Q.renderMatchList = function (r) {
    const results = r.results || []
    const head = `<div class="notice n-warn" style="margin-bottom:14px"><span>⚠</span><div><b>${esc(r.disclaimer)}</b><br>
      <span class="tiny">Modelo ${esc(r.model_version)} · ${r.criteria_count} criterios · ${r.searched_pool} perfiles evaluados · ${r.from_history} desde el histórico.</span></div></div>`
    if (!results.length) return head + `<div class="card"><div class="empty"><h3>Sin resultados evaluables</h3><p>No hay perfiles con evidencia suficiente. Registra habilidades, experiencia o pruebas para obtener estimaciones.</p></div></div>`

    return head + `<div class="card"><div class="card-pad">` + results.map((x, idx) => {
      const scoreTxt = x.score === null ? 's/e' : x.score
      const color = x.score === null ? '#94a3b8' : x.score >= 75 ? '#0f6b5c' : x.score >= 50 ? '#b54708' : '#b42318'
      return `<div style="border:1px solid #e3e8ef;border-radius:11px;padding:13px;margin-bottom:10px">
        <div class="row" style="align-items:flex-start">
          <div style="min-width:56px;text-align:center">
            <div class="score-num" style="color:${color}">${scoreTxt}</div>
            <div class="tiny muted">estimación</div>
          </div>
          <div style="flex:1;min-width:0">
            <div class="row" style="gap:7px">
              <a href="#/candidatos/${x.candidateId}"><b>${esc(x.candidateName)}</b></a>
              ${x.isApplicant ? '<span class="badge b-blue">Postulante</span>' : '<span class="badge b-teal">Histórico</span>'}
              ${H.statusBadge(x.mandatoryStatus)}
              ${x.coverage < 0.6 ? '<span class="badge b-amber">Cobertura ' + Math.round(x.coverage * 100) + '%</span>' : ''}
            </div>
            <div class="small" style="margin-top:5px;color:#37546b">${esc(x.explanation)}</div>
            <button class="btn btn-flat small" data-factors="${idx}">Ver desglose por criterio (${x.factors.length})</button>
            <div id="factors-${idx}" style="display:none;margin-top:9px">
              ${x.factors.map((f) => `
                <div class="crit">
                  <div class="crit-head">
                    ${H.statusBadge(f.status)}
                    <b>${esc(f.label)}</b>
                    <span class="badge b-gray">${f.kind === 'mandatory' ? 'excluyente' : f.weight + '%'}</span>
                    <span class="tiny muted">confianza ${esc(f.confidence)}</span>
                  </div>
                  ${f.evidence.map((e) => `<div class="crit-ev">${esc(e)}</div>`).join('')}
                  ${f.gaps.map((g) => `<div class="crit-gap">${esc(g)}</div>`).join('')}
                  ${f.note ? `<div class="tiny muted" style="margin-top:4px">${esc(f.note)}</div>` : ''}
                </div>`).join('')}
              <div class="row" style="margin-top:9px">
                <button class="btn btn-ghost btn-sm" data-addapp="${x.candidateId}">Agregar a esta vacante</button>
                <button class="btn btn-ghost btn-sm" data-fb="${x.candidateId}" data-val="useful">👍 Útil</button>
                <button class="btn btn-ghost btn-sm" data-fb="${x.candidateId}" data-val="incorrect">👎 Incorrecta</button>
              </div>
            </div>
          </div>
        </div>
      </div>`
    }).join('') + `</div></div>`
  }

  Q.bindMatchCards = function () {
    document.querySelectorAll('[data-factors]').forEach((b) => {
      b.onclick = () => {
        const el = document.getElementById('factors-' + b.dataset.factors)
        el.style.display = el.style.display === 'none' ? '' : 'none'
      }
    })
    document.querySelectorAll('[data-addapp]').forEach((b) => {
      b.onclick = async () => {
        const jobId = location.hash.split('/')[2]
        try {
          await api('/applications', { method: 'POST', body: { job_id: +jobId, candidate_id: +b.dataset.addapp } })
          Q.toast('Agregado a la vacante', 'ok')
          Q.render()
        } catch (e) { Q.toast(e.message, 'err') }
      }
    })
    document.querySelectorAll('[data-fb]').forEach((b) => {
      b.onclick = async () => {
        const reason = prompt(b.dataset.val === 'useful' ? '¿Por qué fue útil? (opcional)' : '¿Por qué es incorrecta? (opcional)')
        if (reason === null) return
        // el feedback se guarda sobre la recomendación persistida del candidato
        const jobId = +location.hash.split('/')[2]
        try {
          const recs = await api('/recommendations?job_id=' + jobId)
          const rec = recs.find((x) => x.candidate_id === +b.dataset.fb)
          if (!rec) { Q.toast('Genera y guarda las recomendaciones primero (botón "Generar recomendaciones" en Talent Memory).'); return }
          await api('/recommendations/' + rec.id + '/feedback', { method: 'POST', body: { feedback: b.dataset.val, reason } })
          Q.toast('Gracias: tu evaluación quedó registrada', 'ok')
        } catch (e) { Q.toast(e.message, 'err') }
      }
    })
  }
})()
