/* QUIPU · vistas: candidatos, perfil único, postulación, talent memory */
(function () {
  'use strict'
  const Q = window.Q, H = Q.helpers, api = Q.api, esc = H.esc

  /* ======================== LISTA CANDIDATOS ===================== */
  Q.views.candidates = async function () {
    Q.mountShell('candidates', Q.loading(), '')
    const f = Q.state.candFilter || {}
    let data
    try {
      const qs = new URLSearchParams()
      if (f.q) qs.set('q', f.q)
      if (f.skill) qs.set('skill', f.skill)
      if (f.location) qs.set('location', f.location)
      if (f.consent) qs.set('consent', f.consent)
      if (f.minYears) qs.set('minYears', f.minYears)
      data = await api('/candidates?' + qs.toString())
    } catch (e) { return Q.mountShell('candidates', Q.errorBlock(e), '') }

    const html = `
      <div class="filters" style="margin-bottom:14px">
        <div class="field"><label for="cq">Buscar</label><input id="cq" placeholder="Nombre, correo, titular" value="${esc(f.q || '')}"></div>
        <div class="field"><label for="cskill">Habilidad</label><input id="cskill" placeholder="Excel, SQL…" value="${esc(f.skill || '')}"></div>
        <div class="field"><label for="cloc">Ubicación</label><input id="cloc" placeholder="Quito" value="${esc(f.location || '')}"></div>
        <div class="field"><label for="ccons">Consentimiento</label><select id="ccons">
          <option value="">Todos</option>
          <option value="granted" ${f.consent === 'granted' ? 'selected' : ''}>Otorgado</option>
          <option value="pending" ${f.consent === 'pending' ? 'selected' : ''}>Pendiente</option>
          <option value="revoked" ${f.consent === 'revoked' ? 'selected' : ''}>Revocado</option>
        </select></div>
        <div class="field"><label for="cy">Exp. mín. (años)</label><input id="cy" type="number" min="0" step="1" style="max-width:110px" value="${esc(f.minYears ?? '')}"></div>
        <button class="btn" id="cfilter">Filtrar</button>
        <button class="btn btn-ghost" id="cclear">Limpiar</button>
      </div>

      <div class="row" style="margin-bottom:10px">
        <span class="small muted">${data.items.length} perfil(es) en esta vista</span>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="importBtn">Importar CSV</button>
        <button class="btn btn-ghost btn-sm" id="exportBtn">Exportar CSV</button>
        <button class="btn btn-sm" id="newCand">Nuevo candidato</button>
      </div>

      ${data.items.length ? `<div class="card"><div class="tbl-wrap"><table>
        <thead><tr><th>Candidato</th><th>Contacto</th><th>Experiencia</th><th>Habilidades</th><th>Consentimiento</th><th>Postulaciones</th><th>Actualizado</th></tr></thead>
        <tbody>${data.items.map((c) => `
          <tr>
            <td><a href="#/candidatos/${c.id}"><b>${esc(c.full_name)}</b></a>${c.is_demo ? ' <span class="badge b-violet">demo</span>' : ''}
              <div class="tiny muted">${esc(c.headline || c.location || '—')}</div></td>
            <td class="small">${esc(c.email || '—')}<div class="tiny muted">${esc(c.phone || '')}</div></td>
            <td class="small nowrap">${c.years_experience} años</td>
            <td class="small" style="max-width:240px">${esc(c.top_skills || '—')}</td>
            <td>${H.statusBadge(c.consent_status)}${c.do_not_contact ? ' <span class="badge b-red">no contactar</span>' : ''}</td>
            <td class="small">${c.application_count}</td>
            <td class="small muted nowrap">${esc(H.fmtRelative(c.updated_at))}</td>
          </tr>`).join('')}</tbody></table></div></div>`
        : `<div class="card"><div class="empty"><h3>No hay candidatos con estos filtros</h3><p>Registra un candidato o importa un CSV para empezar a construir la memoria de talento.</p><button class="btn" id="emptyNew">Nuevo candidato</button></div></div>`}
    `
    Q.mountShell('candidates', html, `<button class="btn" id="newCand2">Nuevo candidato</button>`)

    document.getElementById('cfilter').onclick = () => {
      Q.state.candFilter = {
        q: document.getElementById('cq').value.trim(),
        skill: document.getElementById('cskill').value.trim(),
        location: document.getElementById('cloc').value.trim(),
        consent: document.getElementById('ccons').value,
        minYears: document.getElementById('cy').value
      }
      Q.render()
    }
    document.getElementById('cclear').onclick = () => { Q.state.candFilter = {}; Q.render() }
    const openNew = () => newCandidateModal()
    ;['newCand', 'newCand2', 'emptyNew'].forEach((id) => { const b = document.getElementById(id); if (b) b.onclick = openNew })
    document.getElementById('importBtn').onclick = importModal
    document.getElementById('exportBtn').onclick = () => { window.location.href = '/api/candidates-export.csv' }
  }

  function newCandidateModal() {
    Q.modal({
      title: 'Nuevo candidato',
      wide: true,
      body: `<div class="field"><label for="nf">Nombre completo *</label><input id="nf" maxlength="160"></div>
        <div class="field-row"><div class="field"><label for="ne">Correo</label><input id="ne" type="email"></div><div class="field"><label for="np">Teléfono</label><input id="np"></div></div>
        <div class="field-row"><div class="field"><label for="nl">Ciudad</label><input id="nl"></div><div class="field"><label for="ny">Años de experiencia</label><input id="ny" type="number" min="0" max="60" step="0.5" value="0"></div></div>
        <div class="field"><label for="nh">Titular profesional</label><input id="nh" maxlength="160"></div>
        <div class="field"><label for="ns">Resumen</label><textarea id="ns" rows="3"></textarea></div>
        <div class="field"><label for="nsk">Habilidades (separadas por coma)</label><input id="nsk" placeholder="Excel, NIIF, Power BI"></div>
        <div class="field-row"><div class="field"><label for="nc">Consentimiento</label><select id="nc"><option value="pending">Pendiente</option><option value="granted">Otorgado</option><option value="revoked">Revocado</option></select></div>
        <div class="field"><label for="nb">Base legal / finalidad</label><input id="nb" placeholder="Proceso de selección"></div></div>
        <div id="dupbox"></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Crear candidato</button>`,
      onMount: () => {
        let force = false
        async function checkDup() {
          const email = document.getElementById('ne').value.trim()
          const phone = document.getElementById('np').value.trim()
          const name = document.getElementById('nf').value.trim()
          if (!email && !phone && !name) return
          try {
            const r = await api('/candidates/check-duplicates', { method: 'POST', body: { email, phone, full_name: name } })
            const box = document.getElementById('dupbox')
            if (r.matches.length) {
              box.innerHTML = `<div class="notice n-warn" style="margin-bottom:8px"><span>⚠</span><div><b>Posibles duplicados:</b> ${r.matches.map((m) => `<a href="#/candidatos/${m.id}" target="_blank">${esc(m.full_name)}</a> (${m.reasons.join(', ')})`).join(' · ')}<br><span class="tiny">Revisa antes de crear. No se fusionan perfiles automáticamente.</span></div></div>`
            } else box.innerHTML = ''
          } catch (e) { /* silencioso */ }
        }
        ;['ne', 'np', 'nf'].forEach((id) => { document.getElementById(id).onblur = checkDup })
        document.getElementById('msave').onclick = async () => {
          const full_name = document.getElementById('nf').value.trim()
          if (!full_name) { Q.toast('El nombre es obligatorio', 'err'); return }
          const consent = document.getElementById('nc').value
          const basis = document.getElementById('nb').value.trim()
          if (consent === 'granted' && !basis) { Q.toast('Si registras consentimiento, indica la base legal o finalidad', 'err'); return }
          const skills = document.getElementById('nsk').value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => ({ name: s, level: 3 }))
          try {
            const r = await api('/candidates', {
              method: 'POST',
              body: {
                full_name, email: document.getElementById('ne').value.trim(), phone: document.getElementById('np').value.trim(),
                location: document.getElementById('nl').value.trim(), years_experience: Number(document.getElementById('ny').value || 0),
                headline: document.getElementById('nh').value.trim(), summary: document.getElementById('ns').value.trim(),
                skills, consent_status: consent, consent_basis: basis || null, source: 'manual', force
              }
            })
            Q.toast('Candidato creado', 'ok')
            document.getElementById('mback').remove()
            Q.nav('#/candidatos/' + r.id)
          } catch (e) {
            if (e.status === 409) {
              force = true
              Q.toast(e.message + ' Vuelve a guardar para confirmar.', 'err')
            } else Q.toast(e.message, 'err')
          }
        }
      }
    })
  }

  function importModal() {
    Q.modal({
      title: 'Importar candidatos (CSV)',
      wide: true,
      body: `<div class="notice n-info" style="margin-bottom:12px"><span>ℹ</span><div>Sube un CSV con encabezados. Se detectan columnas de nombre, correo, teléfono, años, habilidades y ubicación. Verás una vista previa con filas aceptadas, duplicadas y rechazadas <b>antes</b> de importar. Nada se borra silenciosamente.</div></div>
        <div class="field"><label for="csvfile">Archivo CSV</label><input type="file" id="csvfile" accept=".csv,text/csv"></div>
        <div class="field"><label for="csvtext">…o pega el contenido</label><textarea id="csvtext" rows="6" placeholder="nombre,correo,telefono,años_experiencia,habilidades,ciudad&#10;Ana Torres,ana@example.com,0999999999,4,&quot;Excel;SQL&quot;,Quito"></textarea></div>
        <div id="prevbox"></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn btn-ghost" id="prevbtn">Vista previa</button><button class="btn" id="impbtn" disabled>Importar</button>`,
      onMount: () => {
        let preview = null
        document.getElementById('csvfile').onchange = (e) => {
          const file = e.target.files[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => { document.getElementById('csvtext').value = String(reader.result).slice(0, 400000) }
          reader.readAsText(file)
        }
        document.getElementById('prevbtn').onclick = async () => {
          const csv = document.getElementById('csvtext').value
          const box = document.getElementById('prevbox')
          if (!csv.trim()) { Q.toast('Sube o pega un CSV', 'err'); return }
          box.innerHTML = Q.loading('Analizando archivo…')
          try {
            preview = await api('/candidates/import/preview', { method: 'POST', body: { csv } })
            box.innerHTML = `
              <div class="row" style="gap:8px;margin-bottom:9px">
                <span class="badge b-green">${preview.summary.accepted} por importar</span>
                <span class="badge b-amber">${preview.summary.duplicates} duplicados</span>
                <span class="badge b-red">${preview.summary.rejected} rechazadas</span>
                <span class="tiny muted">de ${preview.summary.total} filas</span>
              </div>
              <div class="tiny muted" style="margin-bottom:7px">Mapeo: nombre → ${esc(preview.mapping.name)}, correo → ${esc(preview.mapping.email || 'no detectado')}, teléfono → ${esc(preview.mapping.phone || 'no detectado')}</div>
              <div class="tbl-wrap" style="max-height:260px;overflow:auto"><table><thead><tr><th>Línea</th><th>Nombre</th><th>Correo</th><th>Acción</th></tr></thead><tbody>
                ${preview.rows.slice(0, 60).map((r) => `<tr><td class="small">${r.line}</td><td class="small">${esc(r.data.full_name)}</td><td class="small">${esc(r.data.email || '—')}</td>
                  <td>${r.errors.length ? `<span class="badge b-red">${esc(r.errors.join(', '))}</span>` : r.duplicate ? '<span class="badge b-amber">omitir (ya existe)</span>' : '<span class="badge b-green">importar</span>'}</td></tr>`).join('')}
              </tbody></table></div>`
            document.getElementById('impbtn').disabled = false
          } catch (e) { box.innerHTML = Q.errorBlock(e) }
        }
        document.getElementById('impbtn').onclick = async () => {
          if (!preview) return
          try {
            const r = await api('/candidates/import', { method: 'POST', body: { rows: preview.rows } })
            Q.toast(`${r.created} creados, ${r.skipped} omitidos (duplicados), ${r.errors.length} con error`, 'ok')
            document.getElementById('mback').remove()
            Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  /* ======================= PERFIL ÚNICO ========================== */
  Q.views.candidates.detail = async function (id) {
    Q.mountShell('candidates', Q.loading(), '')
    let c
    try { c = await api('/candidates/' + id) } catch (e) { return Q.mountShell('candidates', Q.errorBlock(e), '') }

    const tabs = ['Resumen', 'Experiencia', 'Postulaciones', 'Pruebas', 'Entrevistas', 'Comunicaciones', 'Auditoría']
    const scoresAvg = c.attempts.filter((a) => a.final_score !== null || a.auto_score !== null)

    const html = `
      <div class="row" style="margin-bottom:14px;align-items:flex-start">
        <div class="avatar" style="width:52px;height:52px;font-size:17px;background:#0f6b5c;color:#fff">${esc(H.initials(c.full_name))}</div>
        <div>
          <div class="row" style="gap:7px">
            <h2 style="font-size:20px">${esc(c.full_name)}</h2>
            ${c.is_demo ? '<span class="badge b-violet">perfil demo</span>' : ''}
            ${H.statusBadge(c.consent_status)}
            ${c.do_not_contact ? '<span class="badge b-red">no contactar</span>' : ''}
          </div>
          <p class="small muted" style="margin-top:3px">${esc(c.headline || 'Sin titular profesional')}${c.location ? ' · ' + esc(c.location) : ''} · ${c.years_experience} años de experiencia</p>
          <p class="tiny muted">${esc(c.email || 'sin correo')}${c.phone ? ' · ' + esc(c.phone) : ''} · Creado ${esc(H.fmtDate(c.created_at))}</p>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <button class="btn btn-ghost" id="editar">Editar perfil</button>
          <button class="btn btn-ghost" id="nota">Agregar nota</button>
          <button class="btn btn-ghost" id="aplicar">Postular a vacante</button>
        </div>
      </div>

      ${c.consent_status !== 'granted' ? `<div class="notice n-warn" style="margin-bottom:14px"><span>⚠</span><div><b>Consentimiento ${esc(c.consent_status)}.</b> No se debe contactar al candidato ni usarlo en recomendaciones sin base legal registrada. ${c.consent_basis ? 'Base declarada: ' + esc(c.consent_basis) : ''}</div></div>` : ''}

      <div class="grid" style="grid-template-columns:1fr 320px">
        <div>
          <div class="tabs" id="ctabs" style="margin-bottom:14px">${tabs.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-t="${i}">${t}</button>`).join('')}</div>
          <div id="tpane"></div>
        </div>
        <div class="stack">
          <section class="card card-pad">
            <h3 style="margin-bottom:10px">Evidencias</h3>
            <div class="row" style="gap:18px">
              <div><div class="score-num">${c.skills.length}</div><div class="tiny muted">habilidades</div></div>
              <div><div class="score-num">${c.skills.filter((s) => s.verified).length}</div><div class="tiny muted">verificadas</div></div>
              <div><div class="score-num">${c.attempts.length}</div><div class="tiny muted">pruebas</div></div>
            </div>
            <div class="sep"></div>
            <h3 style="margin-bottom:8px">Documentos</h3>
            ${c.documents.length ? c.documents.map((d) => `<div class="row small" style="padding:5px 0"><span>📄 ${esc(d.filename)}</span><span class="spacer"></span><button class="btn-flat tiny" data-doc="${d.id}">Ver</button></div>`).join('') : '<p class="small muted">Sin documentos.</p>'}
            <button class="btn btn-ghost btn-sm btn-block" id="addcv" style="margin-top:8px">Subir CV / extraer datos</button>
          </section>
          <section class="card card-pad">
            <h3 style="margin-bottom:8px">Privacidad</h3>
            <p class="tiny muted">Base: ${esc(c.consent_basis || 'no registrada')}${c.consent_date ? ' · ' + esc(H.fmtDate(c.consent_date)) : ''}</p>
            <p class="tiny muted" style="margin-top:5px">Conservación: ${esc(c.retention_until ? H.fmtDate(c.retention_until) : 'sin plazo definido')}</p>
            <div class="row" style="margin-top:9px">
              <button class="btn btn-ghost btn-sm" id="consentBtn">Cambiar consentimiento</button>
              <button class="btn btn-ghost btn-sm" id="privacyBtn">Solicitud de privacidad</button>
            </div>
          </section>
          <section class="card card-pad">
            <h3 style="margin-bottom:8px">Acciones sensibles</h3>
            <button class="btn btn-ghost btn-sm btn-block" id="mergeBtn">Fusionar con otro perfil</button>
          </section>
        </div>
      </div>`
    Q.mountShell('candidates', html, `<a class="btn btn-ghost" href="#/candidatos">Volver</a>`, c.full_name)

    const pane = document.getElementById('tpane')
    function drawPane(i) {
      if (i === 0) pane.innerHTML = renderSummary(c)
      if (i === 1) pane.innerHTML = renderExperience(c)
      if (i === 2) pane.innerHTML = renderApps(c)
      if (i === 3) pane.innerHTML = renderTests(c)
      if (i === 4) pane.innerHTML = renderInterviews(c)
      if (i === 5) pane.innerHTML = renderComms(c)
      if (i === 6) pane.innerHTML = renderAudit(c)
      bindPane()
    }
    document.querySelectorAll('#ctabs .tab').forEach((t) => {
      t.onclick = () => {
        document.querySelectorAll('#ctabs .tab').forEach((x) => x.classList.remove('active'))
        t.classList.add('active'); drawPane(+t.dataset.t)
      }
    })
    drawPane(0)

    function bindPane() {
      pane.querySelectorAll('[data-doc]').forEach((b) => {
        b.onclick = async () => {
          try {
            const d = await api('/candidates/' + id + '/documents/' + b.dataset.doc)
            Q.modal({ title: d.filename, wide: true, body: `<pre style="white-space:pre-wrap;font-size:12px;font-family:inherit">${esc(d.text)}</pre>` })
          } catch (e) { Q.toast(e.message, 'err') }
        }
      })
      pane.querySelectorAll('[data-delskill]').forEach((b) => {
        b.onclick = async () => {
          try { await api('/candidates/' + id + '/skills/' + b.dataset.delskill, { method: 'DELETE' }); Q.toast('Habilidad eliminada', 'ok'); Q.render() }
          catch (e) { Q.toast(e.message, 'err') }
        }
      })
      const addSkill = pane.querySelector('#addSkillForm')
      if (addSkill) addSkill.onsubmit = async (e) => {
        e.preventDefault()
        const name = pane.querySelector('#skname').value.trim()
        if (!name) return
        try {
          await api('/candidates/' + id + '/skills', {
            method: 'POST',
            body: { name, level: Number(pane.querySelector('#sklevel').value), years: Number(pane.querySelector('#skyears').value || 0) }
          })
          Q.toast('Habilidad agregada', 'ok'); Q.render()
        } catch (e2) { Q.toast(e2.message, 'err') }
      }
    }

    document.getElementById('editar').onclick = () => editProfile(c)
    document.getElementById('nota').onclick = () => addNote(c)
    document.getElementById('aplicar').onclick = () => applyToJob(c)
    document.getElementById('addcv').onclick = () => cvModal(c)
    document.getElementById('consentBtn').onclick = () => consentModal(c)
    document.getElementById('privacyBtn').onclick = () => privacyModal(c)
    document.getElementById('mergeBtn').onclick = () => mergeModal(c)
  }

  function renderSummary(c) {
    return `<div class="stack">
      <section class="card card-pad">
        <h3 style="margin-bottom:8px">Resumen</h3>
        <p class="small" style="white-space:pre-wrap">${esc(c.summary || 'Sin resumen registrado.')}</p>
        <div class="sep"></div>
        <div class="row" style="gap:26px">
          <div><div class="tiny muted">Disponibilidad</div><div class="small"><b>${esc(c.availability || 'No declarada')}</b></div></div>
          <div><div class="tiny muted">Expectativa salarial</div><div class="small"><b>${c.salary_expectation ? H.money(c.salary_expectation) : 'No declarada'}</b></div></div>
          <div><div class="tiny muted">Origen</div><div class="small"><b>${esc(c.source || '—')}</b></div></div>
          <div><div class="tiny muted">Actualizado</div><div class="small"><b>${esc(H.fmtRelative(c.updated_at))}</b></div></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Habilidades y competencias</h2></div>
        <div class="card-pad">
          ${c.skills.length ? c.skills.map((s) => `
            <div class="crit"><div class="crit-head">
              <b>${esc(s.name)}</b>
              <span class="badge ${s.verified ? 'b-green' : 'b-gray'}">${s.verified ? 'verificada' : 'declarada'}</span>
              <span class="tiny muted">nivel ${s.level}/5${s.years ? ' · ' + s.years + ' años' : ''} · fuente: ${esc(s.source)}</span>
              <span class="spacer"></span>
              <button class="btn-flat tiny" data-delskill="${s.id}" aria-label="Eliminar ${esc(s.name)}">Quitar</button>
            </div></div>`).join('') : '<p class="small muted">Sin habilidades registradas. El Smart Match depende de esta evidencia.</p>'}
          <form id="addSkillForm" class="row" style="margin-top:12px;gap:7px">
            <input id="skname" placeholder="Habilidad" style="flex:2;min-width:130px">
            <select id="sklevel" style="max-width:130px"><option value="3">Intermedio</option><option value="2">Elemental</option><option value="4">Avanzado</option><option value="5">Experto</option><option value="1">Básico</option></select>
            <input id="skyears" type="number" min="0" step="0.5" placeholder="Años" style="max-width:90px">
            <button class="btn btn-sm" type="submit">Agregar</button>
          </form>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Notas internas (${c.notes.length})</h2></div>
        <div class="card-pad">
          ${c.notes.length ? c.notes.map((n) => `<div style="padding:8px 0;border-bottom:1px solid #eef1f5">
            <div class="row"><span class="tiny muted">${esc(H.fmtDate(n.created_at, true))} · ${esc(n.author_name || 'sistema')}</span><span class="spacer"></span>${n.visibility === 'candidate' ? '<span class="badge b-amber">visible al candidato</span>' : '<span class="badge b-gray">interna</span>'}</div>
            <div class="small" style="margin-top:3px">${esc(n.body)}</div></div>`).join('') : '<p class="small muted">Sin notas.</p>'}
        </div>
      </section>
    </div>`
  }

  function renderExperience(c) {
    return `<div class="stack">
      <section class="card">
        <div class="card-head"><h2>Experiencia laboral</h2></div>
        <div class="card-pad">
          ${c.experiences.length ? c.experiences.map((e) => `<div class="crit">
            <div class="crit-head"><b>${esc(e.title)}</b>${e.is_current ? '<span class="badge b-green">actual</span>' : ''}</div>
            <div class="small muted">${esc(e.company || 'Empresa no indicada')} · ${esc(e.start_date || '?')} — ${e.is_current ? 'presente' : esc(e.end_date || '?')}</div>
            ${e.description ? `<div class="crit-ev">${esc(e.description)}</div>` : ''}
          </div>`).join('') : '<p class="small muted">Sin experiencia registrada.</p>'}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Formación</h2></div>
        <div class="card-pad">
          ${c.education.length ? c.education.map((e) => `<div class="crit"><div class="crit-head"><b>${esc(e.program)}</b>${e.level ? `<span class="badge b-gray">${esc(e.level)}</span>` : ''}</div>
            <div class="small muted">${esc(e.institution || '')}${e.year ? ' · ' + e.year : ''}</div></div>`).join('') : '<p class="small muted">Sin formación registrada.</p>'}
        </div>
      </section>
    </div>`
  }

  function renderApps(c) {
    if (!c.applications.length) return `<div class="card"><div class="empty"><h3>Sin postulaciones</h3><p>Este perfil existe en la memoria pero aún no se ha postulado.</p></div></div>`
    return `<div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Vacante</th><th>Etapa</th><th>Estado</th><th>Postuló</th><th>Última actividad</th><th></th></tr></thead>
      <tbody>${c.applications.map((a) => `<tr>
        <td><b class="small">${esc(a.job_title)}</b></td>
        <td class="small">${esc(a.stage_name || '—')}</td>
        <td>${H.statusBadge(a.status)}</td>
        <td class="small muted nowrap">${esc(H.fmtDate(a.applied_at))}</td>
        <td class="small muted nowrap">${esc(H.fmtRelative(a.last_activity_at))}</td>
        <td><a class="btn btn-ghost btn-sm" href="#/postulacion/${a.id}">Abrir</a></td>
      </tr>${a.rejection_reason ? `<tr><td colspan="6" class="tiny" style="color:#8c2619;padding-top:0">Motivo de descarte: ${esc(a.rejection_reason)}</td></tr>` : ''}`).join('')}</tbody>
    </table></div></div>`
  }

  function renderTests(c) {
    if (!c.attempts.length) return `<div class="card"><div class="empty"><h3>Sin pruebas registradas</h3><p>Asigna una prueba desde Skill Lab para generar evidencia verificable.</p><a class="btn" href="#/evaluaciones">Ir a Skill Lab</a></div></div>`
    return `<div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Prueba</th><th>Tipo</th><th>Resultado</th><th>Versión</th><th>Estado</th><th>Fecha</th></tr></thead>
      <tbody>${c.attempts.map((a) => {
        const score = a.final_score !== null ? a.final_score : a.auto_score
        const pct = score !== null && a.max_score ? Math.round((score / a.max_score) * 100) : null
        const old = (Date.now() - new Date(String(a.submitted_at).replace(' ', 'T') + 'Z').getTime()) / 86400000 > 548
        return `<tr>
          <td class="small"><b>${esc(a.assessment_title)}</b></td>
          <td class="small">${esc(a.assessment_type)}</td>
          <td class="small"><b>${score !== null ? score + '/' + a.max_score + (pct !== null ? ' (' + pct + '%)' : '') : 'pendiente'}</b></td>
          <td class="small">v${a.assessment_version}</td>
          <td>${H.statusBadge(a.status)}${old ? ' <span class="badge b-amber">vencida</span>' : ''}</td>
          <td class="small muted nowrap">${esc(H.fmtDate(a.submitted_at))}</td>
        </tr>`
      }).join('')}</tbody></table></div>
      <div class="card-pad"><div class="notice n-info"><span>ℹ</span><div>Los resultados de pruebas son evidencia de selección, no una medición de desempeño laboral. Se marcan como vencidos después de 18 meses.</div></div></div></div>`
  }

  function renderInterviews(c) {
    if (!c.interviews.length) return `<div class="card"><div class="empty"><h3>Sin entrevistas</h3><p>Agenda una entrevista desde la postulación correspondiente.</p></div></div>`
    return `<div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Fecha</th><th>Vacante</th><th>Modalidad</th><th>Estado</th><th></th></tr></thead>
      <tbody>${c.interviews.map((i) => `<tr>
        <td class="small">${esc(H.fmtDate(i.scheduled_at, true))}</td>
        <td class="small">${esc(i.job_title)}</td>
        <td class="small">${esc(i.mode)}</td>
        <td>${H.statusBadge(i.status)}</td>
        <td><button class="btn btn-ghost btn-sm" data-iv="${i.id}">Ver rúbrica</button></td>
      </tr>`).join('')}</tbody></table></div></div>`
  }

  function renderComms(c) {
    return `<div class="card"><div class="card-pad">
      <div class="notice n-warn" style="margin-bottom:12px"><span>⚠</span><div>Los mensajes solo se marcan como <b>enviados</b> cuando el proveedor confirma la entrega. Sin proveedor configurado quedan registrados como <b>fallidos</b>, no como enviados.</div></div>
      ${(c.communications || []).length ? (c.communications || []).map((m) => `<div class="crit"><div class="crit-head"><b>${esc(m.subject || 'Sin asunto')}</b>${H.statusBadge(m.status)}<span class="tiny muted">${esc(m.provider)} · ${esc(H.fmtDate(m.created_at, true))}</span></div>
        ${m.provider_error ? `<div class="crit-gap">${esc(m.provider_error)}</div>` : ''}</div>`).join('') : '<p class="small muted">Sin comunicaciones registradas para este perfil.</p>'}
    </div></div>`
  }

  function renderAudit(c) {
    return `<div class="card"><div class="card-pad">
      ${c.audit.length ? `<div class="timeline">${c.audit.map((a) => `<div class="tl-item"><div class="tl-when">${esc(H.fmtDate(a.created_at, true))} · ${esc(a.actor_email)}</div>
        <div class="tl-what">${esc(a.action)}</div><div class="tiny muted">${esc(a.entity)} #${esc(a.entity_id || '—')} · ${esc(a.result)}</div></div>`).join('')}</div>`
        : '<p class="small muted">Sin registros de auditoría para este perfil.</p>'}
    </div></div>`
  }

  /* ---- acciones del perfil ---- */
  function editProfile(c) {
    Q.modal({
      title: 'Editar perfil',
      wide: true,
      body: `<div class="field"><label for="ef">Nombre</label><input id="ef" value="${esc(c.full_name)}"></div>
        <div class="field-row"><div class="field"><label for="ee">Correo</label><input id="ee" value="${esc(c.email || '')}"></div><div class="field"><label for="ep">Teléfono</label><input id="ep" value="${esc(c.phone || '')}"></div></div>
        <div class="field-row"><div class="field"><label for="el">Ciudad</label><input id="el" value="${esc(c.location || '')}"></div><div class="field"><label for="ey">Años de experiencia</label><input id="ey" type="number" min="0" max="60" step="0.5" value="${c.years_experience}"></div></div>
        <div class="field"><label for="eh">Titular</label><input id="eh" value="${esc(c.headline || '')}"></div>
        <div class="field"><label for="es">Resumen</label><textarea id="es" rows="3">${esc(c.summary || '')}</textarea></div>
        <div class="field-row"><div class="field"><label for="ea">Disponibilidad</label><input id="ea" value="${esc(c.availability || '')}" placeholder="inmediata / 30 días"></div>
        <div class="field"><label for="esal">Expectativa salarial (USD)</label><input id="esal" type="number" min="0" value="${c.salary_expectation ?? ''}"></div></div>
        <div class="field"><label for="ednc"><input type="checkbox" id="ednc" ${c.do_not_contact ? 'checked' : ''} style="width:auto;margin-right:7px">El candidato pidió no ser contactado</label></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Guardar cambios</button>`,
      onMount: () => {
        document.getElementById('msave').onclick = async () => {
          try {
            await api('/candidates/' + c.id, {
              method: 'PATCH',
              body: {
                full_name: document.getElementById('ef').value.trim(),
                email: document.getElementById('ee').value.trim(),
                phone: document.getElementById('ep').value.trim(),
                location: document.getElementById('el').value.trim(),
                years_experience: Number(document.getElementById('ey').value || 0),
                headline: document.getElementById('eh').value.trim(),
                summary: document.getElementById('es').value.trim(),
                availability: document.getElementById('ea').value.trim(),
                salary_expectation: document.getElementById('esal').value ? Number(document.getElementById('esal').value) : null,
                do_not_contact: document.getElementById('ednc').checked
              }
            })
            Q.toast('Perfil actualizado', 'ok'); document.getElementById('mback').remove(); Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  function addNote(c) {
    Q.modal({
      title: 'Agregar nota',
      body: `<div class="field"><label for="nb">Nota</label><textarea id="nb" rows="4" placeholder="Observación profesional y relacionada con el puesto."></textarea></div>
        <div class="field"><label for="nv">Visibilidad</label><select id="nv"><option value="internal">Interna (solo equipo)</option><option value="candidate">Visible al candidato</option></select></div>
        <p class="hint">Evita comentarios discriminatorios o irrelevantes. Las notas quedan asociadas a tu usuario.</p>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Guardar nota</button>`,
      onMount: () => {
        document.getElementById('msave').onclick = async () => {
          const body = document.getElementById('nb').value.trim()
          if (!body) { Q.toast('La nota está vacía', 'err'); return }
          try {
            await api('/candidates/' + c.id + '/notes', { method: 'POST', body: { body, visibility: document.getElementById('nv').value } })
            Q.toast('Nota agregada', 'ok'); document.getElementById('mback').remove(); Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  async function applyToJob(c) {
    let jobs = []
    try { jobs = (await api('/jobs?status=all')).filter((j) => ['draft', 'published', 'paused'].includes(j.status)) } catch (e) { jobs = [] }
    Q.modal({
      title: 'Postular a una vacante',
      body: `<div class="field"><label for="aj">Vacante</label><select id="aj">${jobs.map((j) => `<option value="${j.id}">${esc(j.title)} (${j.status})</option>`).join('')}</select></div>
        ${jobs.length ? '' : '<div class="notice n-warn"><span>⚠</span><div>No hay vacantes abiertas. Crea una primero.</div></div>'}`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave" ${jobs.length ? '' : 'disabled'}>Registrar postulación</button>`,
      onMount: () => {
        document.getElementById('msave').onclick = async () => {
          try {
            const r = await api('/applications', { method: 'POST', body: { job_id: Number(document.getElementById('aj').value), candidate_id: c.id } })
            Q.toast('Postulación registrada', 'ok'); document.getElementById('mback').remove(); Q.nav('#/postulacion/' + r.id)
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  function cvModal(c) {
    Q.modal({
      title: 'CV y extracción asistida',
      wide: true,
      body: `<div class="notice n-info" style="margin-bottom:12px"><span>ℹ</span><div>Pega el texto del CV. La extracción puede ser heurística (local) o asistida por IA si hay proveedor configurado. <b>Ningún campo se guarda automáticamente</b>: debes revisarlos y confirmarlos.</div></div>
        <div class="field"><label for="cvtxt">Texto del currículum</label><textarea id="cvtxt" rows="7" placeholder="Pega aquí el contenido del CV…"></textarea></div>
        <div class="row"><button class="btn" id="extract">Extraer datos</button><span class="tiny muted">No se envían datos a proveedores externos si no hay uno configurado.</span></div>
        <div id="extout" style="margin-top:14px"></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cerrar</button>`,
      onMount: () => {
        document.getElementById('extract').onclick = async () => {
          const text = document.getElementById('cvtxt').value
          const out = document.getElementById('extout')
          if (text.trim().length < 30) { Q.toast('Pega un texto más largo', 'err'); return }
          out.innerHTML = Q.loading('Extrayendo…')
          try {
            const r = await api('/cv/extract', { method: 'POST', body: { text } })
            out.innerHTML = `
              <div class="notice ${r.provider === 'heuristico' ? 'n-warn' : 'n-ok'}" style="margin-bottom:10px"><span>ℹ</span><div><b>Proveedor: ${esc(r.provider)}.</b> ${esc(r.notice)}</div></div>
              <div class="field-row"><div class="field"><label>Nombre</label><input id="xname" value="${esc(r.fullName || '')}"></div><div class="field"><label>Correo</label><input id="xemail" value="${esc(r.email || '')}"></div></div>
              <div class="field-row"><div class="field"><label>Teléfono</label><input id="xphone" value="${esc(r.phone || '')}"></div><div class="field"><label>Años</label><input id="xyears" type="number" value="${r.yearsExperience ?? ''}"></div></div>
              <div class="field"><label>Habilidades detectadas</label><input id="xskills" value="${esc((r.skills || []).map((s) => s.name).join(', '))}"></div>
              ${(r.uncertainFields || []).length ? `<div class="notice n-warn" style="margin-bottom:10px"><span>⚠</span><div>Campos dudosos: ${esc(r.uncertainFields.join(', '))}. Verifícalos.</div></div>` : ''}
              <button class="btn btn-sm" id="xconfirm">Confirmar y guardar en el perfil</button>`
            document.getElementById('xconfirm').onclick = async () => {
              try {
                await api('/candidates/' + c.id, {
                  method: 'PATCH',
                  body: {
                    full_name: document.getElementById('xname').value.trim() || c.full_name,
                    email: document.getElementById('xemail').value.trim(),
                    phone: document.getElementById('xphone').value.trim(),
                    years_experience: Number(document.getElementById('xyears').value || c.years_experience)
                  }
                })
                const sk = document.getElementById('xskills').value.split(',').map((s) => s.trim()).filter(Boolean)
                for (const name of sk.slice(0, 25)) {
                  try { await api('/candidates/' + c.id + '/skills', { method: 'POST', body: { name, level: 3, source: 'cv' } }) } catch (e) { /* duplicado */ }
                }
                await api('/candidates/' + c.id + '/documents', { method: 'POST', body: { filename: 'cv-' + c.id + '.txt', text, kind: 'cv' } }).catch(() => {})
                Q.toast('Datos confirmados y guardados', 'ok')
                document.getElementById('mback').remove(); Q.render()
              } catch (e) { Q.toast(e.message, 'err') }
            }
          } catch (e) { out.innerHTML = Q.errorBlock(e) }
        }
      }
    })
  }

  function consentModal(c) {
    Q.modal({
      title: 'Consentimiento y base legal',
      body: `<div class="field"><label for="cst">Estado</label><select id="cst">
          <option value="pending" ${c.consent_status === 'pending' ? 'selected' : ''}>Pendiente</option>
          <option value="granted" ${c.consent_status === 'granted' ? 'selected' : ''}>Otorgado</option>
          <option value="revoked" ${c.consent_status === 'revoked' ? 'selected' : ''}>Revocado</option></select></div>
        <div class="field"><label for="cbs">Base legal / finalidad</label><input id="cbs" value="${esc(c.consent_basis || '')}" placeholder="Ej: consentimiento del titular para proceso de selección"></div>
        <p class="hint">Cada cambio queda registrado en auditoría con tu usuario y la fecha.</p>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Guardar</button>`,
      onMount: () => {
        document.getElementById('msave').onclick = async () => {
          try {
            await api('/candidates/' + c.id + '/consent', { method: 'POST', body: { status: document.getElementById('cst').value, basis: document.getElementById('cbs').value.trim() } })
            Q.toast('Consentimiento actualizado', 'ok'); document.getElementById('mback').remove(); Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  function privacyModal(c) {
    Q.modal({
      title: 'Solicitud del titular',
      body: `<div class="field"><label for="pt">Tipo de solicitud</label><select id="pt">
        <option value="access">Acceso a sus datos</option><option value="rectification">Rectificación</option>
        <option value="opposition">Oposición</option><option value="deletion">Eliminación</option></select></div>
        <div class="field"><label for="pd">Detalle</label><textarea id="pd" rows="3"></textarea></div>
        <p class="hint">La solicitud queda con estado, responsable y registro de atención. Al completar una oposición se bloquea el contacto.</p>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Registrar solicitud</button>`,
      onMount: () => {
        document.getElementById('msave').onclick = async () => {
          try {
            await api('/privacy/requests', { method: 'POST', body: { candidate_id: c.id, type: document.getElementById('pt').value, detail: document.getElementById('pd').value } })
            Q.toast('Solicitud registrada', 'ok'); document.getElementById('mback').remove()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  function mergeModal(c) {
    Q.modal({
      title: 'Fusionar perfiles duplicados',
      body: `<div class="notice n-warn" style="margin-bottom:12px"><span>⚠</span><div>La fusión mueve postulaciones, notas, documentos y evidencias al perfil que conservas. El perfil fusionado queda marcado como tal, no se borra. <b>Revisa la identidad antes de continuar.</b></div></div>
        <div class="field"><label for="mq">Buscar el otro perfil</label><input id="mq" placeholder="Nombre o correo"></div>
        <div id="mres"></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button>`,
      onMount: () => {
        let timer
        document.getElementById('mq').oninput = () => {
          clearTimeout(timer)
          timer = setTimeout(async () => {
            const q = document.getElementById('mq').value.trim()
            if (q.length < 2) return
            const r = await api('/candidates?q=' + encodeURIComponent(q) + '&limit=8')
            document.getElementById('mres').innerHTML = r.items.filter((x) => x.id !== c.id).map((x) => `
              <div class="row" style="border:1px solid #e3e8ef;border-radius:9px;padding:9px;margin-bottom:7px">
                <div><b class="small">${esc(x.full_name)}</b><div class="tiny muted">${esc(x.email || 'sin correo')} · ${esc(x.application_count ?? 0)} postulaciones</div></div>
                <span class="spacer"></span><button class="btn btn-danger btn-sm" data-mg="${x.id}">Fusionar en este perfil</button>
              </div>`).join('') || '<p class="small muted">Sin coincidencias.</p>'
            document.querySelectorAll('[data-mg]').forEach((b) => {
              b.onclick = async () => {
                if (!(await Q.confirm('Confirmar fusión', 'Esta acción moverá el historial del otro perfil hacia ' + c.full_name + '. Queda registrada en auditoría.', 'Fusionar', true))) return
                try {
                  await api('/candidates/merge', { method: 'POST', body: { keep_id: c.id, merge_id: +b.dataset.mg } })
                  Q.toast('Perfiles fusionados', 'ok'); document.getElementById('mback').remove(); Q.render()
                } catch (e) { Q.toast(e.message, 'err') }
              }
            })
          }, 280)
        }
      }
    })
  }

  /* ====================== POSTULACIÓN =========================== */
  Q.views.application = async function (id) {
    Q.mountShell('applications', Q.loading(), '')
    let a
    try { a = await api('/applications/' + id) } catch (e) { return Q.mountShell('applications', Q.errorBlock(e), '') }

    const html = `
      <div class="row" style="margin-bottom:14px;align-items:flex-start">
        <div>
          <div class="row" style="gap:7px;margin-bottom:4px">
            ${H.statusBadge(a.status)}
            <span class="badge b-gray">${esc(a.source)}</span>
          </div>
          <h2 style="font-size:19px"><a href="#/candidatos/${a.candidate_id}">${esc(a.full_name)}</a></h2>
          <p class="small muted">${esc(a.job_title)} · ${esc(a.stage_name || 'Sin etapa')} · Postuló ${esc(H.fmtDate(a.applied_at))}</p>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <select id="stageSel" style="max-width:200px">${a.stages.map((s) => `<option value="${s.id}" ${s.id === a.stage_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          <button class="btn" id="moveBtn">Mover etapa</button>
          <button class="btn btn-ghost" id="ivBtn">Agendar entrevista</button>
          <button class="btn btn-ghost" id="commBtn">Enviar mensaje</button>
          ${['active', 'talent_pool'].includes(a.status) ? '<button class="btn btn-danger" id="rejBtn">Descartar</button>' : ''}
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 330px">
        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Historial del proceso</h2></div>
            <div class="card-pad">
              ${a.events.length ? `<div class="timeline">${a.events.map((e) => `
                <div class="tl-item"><div class="tl-when">${esc(H.fmtDate(e.created_at, true))} · ${esc(e.actor_name || 'sistema')}</div>
                  <div class="tl-what">${({ created: 'Postulación creada', stage_change: 'Cambio de etapa', rejected: 'Descartado', withdrawn: 'Retiro', interview_scheduled: 'Entrevista agendada', merge_note: 'Nota de fusión' })[e.action] || esc(e.action)}</div>
                  ${e.from_stage ? `<div class="small muted">${esc(e.from_stage)} → ${esc(e.to_stage || '—')}</div>` : e.to_stage ? `<div class="small muted">→ ${esc(e.to_stage)}</div>` : ''}
                  ${e.reason ? `<div class="small" style="color:#8c2619">Motivo: ${esc(e.reason)}</div>` : ''}
                  ${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ''}
                </div>`).join('')}</div>` : '<p class="small muted">Sin eventos.</p>'}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Pruebas aplicadas</h2><div class="right"><button class="btn btn-ghost btn-sm" id="addAttempt">Registrar intento</button></div></div>
            <div class="card-pad">
              ${a.attempts.length ? a.attempts.map((t) => `<div class="crit"><div class="crit-head"><b>${esc(t.assessment_title)}</b>${H.statusBadge(t.status)}
                <span class="small">${(t.final_score ?? t.auto_score) ?? '—'}/${t.max_score || 100}</span>
                ${t.status === 'review_required' ? `<span class="spacer"></span><button class="btn btn-ghost btn-sm" data-grade="${t.id}" data-max="${t.max_score || 100}">Calificar</button>` : ''}</div>
                <div class="tiny muted">v${t.assessment_version} · ${esc(H.fmtDate(t.submitted_at, true))}${t.reviewer_note ? ' · ' + esc(t.reviewer_note) : ''}</div></div>`).join('')
                : '<p class="small muted">Sin pruebas. Usa Skill Lab para asignar una.</p>'}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Comunicaciones</h2></div>
            <div class="card-pad">
              ${a.communications.length ? a.communications.map((m) => `<div class="crit"><div class="crit-head"><b>${esc(m.subject || '')}</b>${H.statusBadge(m.status)}<span class="tiny muted">${esc(H.fmtDate(m.created_at, true))}</span></div>
                ${m.provider_error ? `<div class="crit-gap">${esc(m.provider_error)}</div>` : ''}</div>`).join('') : '<p class="small muted">Sin mensajes.</p>'}
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="card card-pad">
            <h3 style="margin-bottom:9px">Candidato</h3>
            <p class="small"><b>${esc(a.full_name)}</b></p>
            <p class="small muted">${esc(a.email || 'sin correo')}</p>
            <p class="small muted">${a.years_experience} años · ${esc(a.headline || '')}</p>
            <a class="btn btn-ghost btn-sm btn-block" href="#/candidatos/${a.candidate_id}" style="margin-top:10px">Ver perfil completo</a>
          </section>
          <section class="card card-pad">
            <h3 style="margin-bottom:9px">Etapas de la vacante</h3>
            ${a.stages.map((s) => `<div class="row small" style="padding:4px 0"><span class="badge b-${esc(s.color || 'gray')}">${esc(s.name)}</span>${s.id === a.stage_id ? '<span class="tiny muted">actual</span>' : ''}</div>`).join('')}
          </section>
          ${a.status === 'active' ? `<section class="card card-pad"><button class="btn btn-ghost btn-sm btn-block" id="withdrawBtn">Registrar retiro del candidato</button><p class="hint" style="margin-top:7px">El perfil y sus evidencias se conservan.</p></section>` : ''}
          ${a.rejection_reason ? `<section class="card card-pad"><h3 style="margin-bottom:6px">Motivo de descarte</h3><p class="small">${esc(a.rejection_reason)}</p>${a.rejection_note ? `<p class="small muted">${esc(a.rejection_note)}</p>` : ''}</section>` : ''}
        </div>
      </div>`

    Q.mountShell('applications', html, `<a class="btn btn-ghost" href="#/vacantes/${a.job_id}">Ir a la vacante</a>`, a.job_title)

    document.getElementById('moveBtn').onclick = async () => {
      const stageId = Number(document.getElementById('stageSel').value)
      const stage = a.stages.find((s) => s.id === stageId)
      let reason = null, note = null
      if (stage && stage.kind === 'rejected') {
        reason = await pickReason()
        if (!reason) return
      }
      try {
        await api('/applications/' + id + '/move', { method: 'POST', body: { stage_id: stageId, reason, note } })
        Q.toast('Etapa actualizada', 'ok'); Q.render()
      } catch (e) { Q.toast(e.message, 'err') }
    }
    document.getElementById('rejBtn').onclick = async () => {
      const reason = await pickReason()
      if (!reason) return
      try { await api('/applications/' + id + '/reject', { method: 'POST', body: { reason } }); Q.toast('Postulación descartada', 'ok'); Q.render() }
      catch (e) { Q.toast(e.message, 'err') }
    }
    const wb = document.getElementById('withdrawBtn')
    if (wb) wb.onclick = async () => {
      if (!(await Q.confirm('Registrar retiro', 'Se cerrará la postulación y se conservará el perfil histórico.', 'Registrar retiro'))) return
      try { await api('/applications/' + id + '/withdraw', { method: 'POST' }); Q.toast('Retiro registrado', 'ok'); Q.render() }
      catch (e) { Q.toast(e.message, 'err') }
    }
    document.getElementById('ivBtn').onclick = () => scheduleInterview(a, id)
    document.getElementById('commBtn').onclick = () => sendMessage(a, id)
    document.getElementById('addAttempt').onclick = () => newAttempt(a, id)
    document.querySelectorAll('[data-grade]').forEach((b) => {
      b.onclick = async () => {
        const score = prompt('Puntuación final (máx ' + b.dataset.max + '):')
        if (score === null) return
        const note = prompt('Nota de revisión (opcional):') || ''
        try {
          await api('/attempts/' + b.dataset.grade + '/review', { method: 'POST', body: { final_score: Number(score), note } })
          Q.toast('Calificación registrada', 'ok'); Q.render()
        } catch (e) { Q.toast(e.message, 'err') }
      }
    })
  }

  function pickReason() {
    return new Promise((resolve) => {
      const reasons = ['No cumple requisitos excluyentes', 'Experiencia insuficiente', 'Brecha técnica', 'Expectativa salarial fuera de rango', 'No se presentó al proceso', 'Vacante cerrada o cancelada', 'Retiro voluntario', 'Otro']
      Q.modal({
        title: 'Motivo del descarte',
        body: `<div class="field"><label for="rr">Motivo normalizado</label><select id="rr">${reasons.map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>
          <div class="field"><label for="rn">Comentario interno (no se envía al candidato)</label><textarea id="rn" rows="3"></textarea></div>
          <p class="hint">Los comentarios internos están separados de los mensajes al candidato.</p>`,
        footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn btn-danger" id="mok">Confirmar descarte</button>`,
        onMount: ({ close }) => {
          document.getElementById('mok').onclick = () => {
            const r = document.getElementById('rr').value
            resolve(r); close()
          }
        }
      })
    })
  }

  function scheduleInterview(a, appId) {
    const now = new Date(Date.now() + 86400000)
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    Q.modal({
      title: 'Agendar entrevista',
      body: `<div class="field"><label for="ivdt">Fecha y hora</label><input id="ivdt" type="datetime-local" value="${local}"></div>
        <div class="field-row"><div class="field"><label for="ivdur">Duración (min)</label><input id="ivdur" type="number" value="45" min="15" max="240"></div>
        <div class="field"><label for="ivmode">Modalidad</label><select id="ivmode"><option>videollamada</option><option>presencial</option><option>telefónica</option></select></div></div>
        <div class="field"><label for="ivtz">Zona horaria</label><input id="ivtz" value="America/Guayaquil"></div>
        <div class="field"><label for="ivlink">Enlace de reunión (opcional)</label><input id="ivlink" placeholder="https://"></div>
        <div class="field"><label for="ivguide">Guía de entrevista estructurada</label><textarea id="ivguide" rows="4" placeholder="1. Cuéntame sobre…&#10;2. Describe un caso donde…">1. Experiencia relevante para el puesto.&#10;2. Ejemplo concreto de resolución de problemas.&#10;3. Trabajo con otras áreas.&#10;4. Expectativas y disponibilidad.</textarea></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Agendar</button>`,
      onMount: () => {
        document.getElementById('msave').onclick = async () => {
          const dt = document.getElementById('ivdt').value
          if (!dt) { Q.toast('Indica fecha y hora', 'err'); return }
          try {
            await api('/interviews', {
              method: 'POST',
              body: {
                application_id: Number(appId),
                scheduled_at: new Date(dt).toISOString(),
                duration_min: Number(document.getElementById('ivdur').value),
                mode: document.getElementById('ivmode').value,
                timezone: document.getElementById('ivtz').value,
                meeting_link: document.getElementById('ivlink').value,
                guide: document.getElementById('ivguide').value
              }
            })
            Q.toast('Entrevista agendada', 'ok'); document.getElementById('mback').remove(); Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  function sendMessage(a, appId) {
    Q.modal({
      title: 'Enviar mensaje al candidato',
      body: `<div class="notice n-warn" style="margin-bottom:12px"><span>⚠</span><div>Sin proveedor de correo configurado el envío quedará registrado como <b>fallido</b>, no como enviado. Los comentarios internos no se incluyen.</div></div>
        <div class="field"><label for="msub">Asunto</label><input id="msub" value="Sobre tu postulación a ${esc(a.job_title)}"></div>
        <div class="field"><label for="mbody">Mensaje</label><textarea id="mbody" rows="6">Hola ${esc(a.full_name)},\n\nGracias por tu interés en el puesto de ${esc(a.job_title)}. Queremos contarte que tu postulación está avanzando en nuestro proceso.\n\nSaludos cordiales.</textarea></div>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msave">Enviar</button>`,
      onMount: () => {
        document.getElementById('msave').onclick = async () => {
          try {
            const r = await api('/applications/' + appId + '/communicate', {
              method: 'POST',
              body: { subject: document.getElementById('msub').value, body: document.getElementById('mbody').value }
            })
            Q.toast(r.message, r.status === 'sent' ? 'ok' : 'err')
            document.getElementById('mback').remove(); Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }

  async function newAttempt(a, appId) {
    let assessments = []
    try { assessments = await api('/assessments') } catch (e) { assessments = [] }
    if (!assessments.length) { Q.toast('No hay pruebas creadas. Crea una en Skill Lab.'); return }
    Q.modal({
      title: 'Registrar intento de prueba',
      wide: true,
      body: `<div class="field"><label for="asel">Prueba</label><select id="asel">${assessments.filter((x) => x.status === 'active' || x.question_count > 0).map((x) => `<option value="${x.id}">${esc(x.title)} (${x.type}, ${x.question_count} preguntas)</option>`).join('')}</select></div>
        <div id="qbox"><p class="small muted">Selecciona la prueba y pulsa "Cargar preguntas".</p></div>
        <button class="btn btn-ghost btn-sm" id="loadq" style="margin-top:10px">Cargar preguntas</button>`,
      footer: `<button class="btn btn-ghost" id="mcancel">Cancelar</button><button class="btn" id="msubmit" disabled>Registrar respuestas</button>`,
      onMount: () => {
        let current = null
        document.getElementById('loadq').onclick = async () => {
          const id2 = Number(document.getElementById('asel').value)
          try {
            current = await api('/assessments/' + id2)
            document.getElementById('qbox').innerHTML = current.questions.map((q) => `
              <div class="crit"><div class="crit-head"><b class="small">${esc(q.prompt)}</b><span class="badge b-gray">${q.points} pts</span></div>
                ${q.options.length ? q.options.map((o, oi) => `<label class="small" style="display:flex;gap:7px;margin:5px 0 0;font-weight:400"><input type="radio" name="q${q.id}" value="${oi}"> ${esc(o)}</label>`).join('') : `<textarea data-open="${q.id}" rows="3" placeholder="Respuesta del candidato" style="margin-top:6px"></textarea>`}
              </div>`).join('')
            document.getElementById('msubmit').disabled = false
          } catch (e) { Q.toast(e.message, 'err') }
        }
        document.getElementById('msubmit').onclick = async () => {
          const answers = {}
          current.questions.forEach((q) => {
            if (q.options.length) {
              const sel = document.querySelector(`input[name="q${q.id}"]:checked`)
              if (sel) answers[q.id] = Number(sel.value)
            } else {
              const ta = document.querySelector(`[data-open="${q.id}"]`)
              if (ta && ta.value.trim()) answers[q.id] = ta.value.trim()
            }
          })
          try {
            const r = await api('/assessments/' + current.id + '/attempts', {
              method: 'POST', body: { candidate_id: a.candidate_id, application_id: Number(appId), answers }
            })
            Q.toast(`Intento registrado: ${r.auto_score}/${r.max_score} (${r.status})`, 'ok')
            document.getElementById('mback').remove(); Q.render()
          } catch (e) { Q.toast(e.message, 'err') }
        }
      }
    })
  }
})()
