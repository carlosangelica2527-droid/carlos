/* QUIPU · núcleo de la aplicación (sin dependencias) */
(function () {
  'use strict'

  const Q = (window.Q = window.Q || {})
  Q.state = { user: null, org: null, route: null, cache: {} }
  Q.views = Q.views || {}
  Q.helpers = Q.helpers || {}

  /* ---------------- utilidades ---------------- */
  const H = (Q.helpers)
  H.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }
  H.attr = (s) => H.esc(s)
  H.fmtDate = function (v, withTime) {
    if (!v) return '—'
    const d = new Date(String(v).includes('T') || String(v).includes('Z') ? v : String(v).replace(' ', 'T') + 'Z')
    if (isNaN(d.getTime())) return String(v)
    const opts = { day: '2-digit', month: 'short', year: 'numeric' }
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit' }
    return d.toLocaleDateString('es-EC', opts)
  }
  H.fmtRelative = function (v) {
    if (!v) return '—'
    const d = new Date(String(v).includes('T') || String(v).includes('Z') ? v : String(v).replace(' ', 'T') + 'Z')
    if (isNaN(d.getTime())) return String(v)
    const days = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (days <= 0) return 'hoy'
    if (days === 1) return 'ayer'
    if (days < 30) return 'hace ' + days + ' días'
    if (days < 365) return 'hace ' + Math.floor(days / 30) + ' meses'
    return 'hace ' + Math.floor(days / 365) + ' años'
  }
  H.money = function (v) {
    if (v === null || v === undefined || v === '') return '—'
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v))
  }
  H.initials = function (name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  }
  H.statusBadge = function (status) {
    const map = {
      draft: ['b-gray', 'Borrador'], published: ['b-green', 'Publicada'], paused: ['b-amber', 'Pausada'],
      closed: ['b-slate', 'Cerrada'], archived: ['b-slate', 'Archivada'],
      active: ['b-blue', 'Activa'], hired: ['b-emerald', 'Contratado'], rejected: ['b-red', 'Descartado'],
      withdrawn: ['b-slate', 'Retirado'], talent_pool: ['b-teal', 'Reserva'],
      granted: ['b-green', 'Otorgado'], pending: ['b-amber', 'Pendiente'], revoked: ['b-red', 'Revocado'],
      scheduled: ['b-blue', 'Agendada'], completed: ['b-green', 'Completada'], cancelled: ['b-gray', 'Cancelada'], no_show: ['b-red', 'No asistió'],
      submitted: ['b-blue', 'Enviado'], graded: ['b-green', 'Calificado'], review_required: ['b-amber', 'Requiere revisión'],
      sent: ['b-green', 'Enviado'], failed: ['b-red', 'Fallido'], queued: ['b-amber', 'En cola'],
      open: ['b-amber', 'Abierta'], in_progress: ['b-blue', 'En proceso'], done: ['b-green', 'Atendida'],
      cumple: ['b-green', 'Cumple'], parcial: ['b-amber', 'Parcial'], no_cumple: ['b-red', 'No cumple'],
      sin_evaluar: ['b-gray', 'Sin evaluar'], falta_verificar: ['b-gray', 'Falta verificar'],
      revisar: ['b-amber', 'Revisar'], useful: ['b-green', 'Útil'], incorrect: ['b-red', 'Incorrecta']
    }
    const [cls, label] = map[status] || ['b-gray', status || '—']
    return `<span class="badge ${cls}">${H.esc(label)}</span>`
  }
  Q.fmt = H

  /* ---------------- cliente API ---------------- */
  Q.api = async function (path, opts) {
    opts = opts || {}
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} }
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(opts.body)
    }
    const res = await fetch('/api' + path, init)
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch (e) { data = { error: text } }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Error ' + res.status)
      err.status = res.status
      err.payload = data
      if (res.status === 401) Q.onUnauthorized()
      throw err
    }
    return data
  }

  Q.onUnauthorized = function () {
    if (Q.state.user) {
      Q.state.user = null
      Q.render()
    }
  }

  /* ---------------- UI genérica ---------------- */
  Q.toast = function (msg, kind) {
    const host = document.getElementById('toast-host')
    const el = document.createElement('div')
    el.className = 'toast ' + (kind || '')
    el.innerHTML = `<span>${kind === 'err' ? '⚠' : kind === 'ok' ? '✓' : 'ℹ'}</span><span>${H.esc(msg)}</span>`
    host.appendChild(el)
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 350) }, 4200)
  }

  Q.modal = function (opts) {
    const host = document.getElementById('modal-host')
    host.innerHTML = `
      <div class="modal-bg" id="mback">
        <div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mtitle">
          <div class="modal-head"><h3 id="mtitle">${H.esc(opts.title || '')}</h3><button type="button" aria-label="Cerrar" id="mclose">×</button></div>
          <div class="modal-body" id="mbody">${opts.body || ''}</div>
          ${opts.footer === null ? '' : `<div class="modal-foot" id="mfoot">${opts.footer || '<button class="btn btn-ghost" id="mcancel">Cerrar</button>'}</div>`}
        </div>
      </div>`
    const close = () => { host.innerHTML = ''; document.removeEventListener('keydown', onKey) }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const back = document.getElementById('mback')
    back.addEventListener('mousedown', (e) => { if (e.target === back) close() })
    document.getElementById('mclose').onclick = close
    const cancel = document.getElementById('mcancel')
    if (cancel) cancel.onclick = close
    if (opts.onMount) opts.onMount({ close, body: document.getElementById('mbody'), foot: document.getElementById('mfoot') })
    return { close, body: document.getElementById('mbody') }
  }

  Q.confirm = function (title, text, confirmLabel, danger) {
    return new Promise((resolve) => {
      let done = false
      const m = Q.modal({
        title,
        body: `<p>${H.esc(text)}</p>`,
        footer: `<button class="btn btn-ghost" id="cno">Cancelar</button><button class="btn ${danger ? 'btn-danger' : ''}" id="cyes">${H.esc(confirmLabel || 'Confirmar')}</button>`,
        onMount: ({ close }) => {
          document.getElementById('cno').onclick = () => { done = true; close(); resolve(false) }
          document.getElementById('cyes').onclick = () => { done = true; close(); resolve(true) }
        }
      })
      const obs = new MutationObserver(() => {
        if (!document.getElementById('mback') && !done) { obs.disconnect(); resolve(false) }
      })
      obs.observe(document.getElementById('modal-host'), { childList: true })
    })
  }

  Q.loading = function (label) {
    return `<div class="empty"><div class="spinner" style="margin:0 auto 12px"></div><p>${H.esc(label || 'Cargando…')}</p></div>`
  }
  Q.errorBlock = function (err) {
    return `<div class="notice n-err"><span>⚠</span><div><b>No se pudo completar la acción.</b><br>${H.esc(err && err.message ? err.message : String(err))}</div></div>`
  }

  /* ---------------- navegación ---------------- */
  Q.nav = function (hash) {
    if (location.hash === hash) Q.render()
    else location.hash = hash
  }

  Q.menu = [
    { group: 'Operación' },
    { id: 'dashboard', label: 'Panel', hash: '#/', icon: '◧' },
    { id: 'jobs', label: 'Vacantes', hash: '#/vacantes', icon: '▤' },
    { id: 'candidates', label: 'Candidatos', hash: '#/candidatos', icon: '☰' },
    { id: 'memory', label: 'Talent Memory', hash: '#/memoria', icon: '◎' },
    { group: 'Evaluación' },
    { id: 'assessments', label: 'Skill Lab', hash: '#/evaluaciones', icon: '◈' },
    { id: 'interviews', label: 'Entrevistas', hash: '#/entrevistas', icon: '◷' },
    { group: 'Control' },
    { id: 'reports', label: 'Reportes', hash: '#/reportes', icon: '◔' },
    { id: 'settings', label: 'Configuración', hash: '#/configuracion', icon: '⚙' }
  ]

  const TITLES = {
    dashboard: 'Panel', jobs: 'Vacantes', job: 'Vacante', candidates: 'Candidatos', candidate: 'Perfil de candidato',
    memory: 'Talent Memory', assessments: 'Skill Lab', assessment: 'Prueba', interviews: 'Entrevistas',
    reports: 'Reportes', settings: 'Configuración', application: 'Postulación', privacy: 'Privacidad'
  }

  Q.shell = function (activeId, contentHtml, actionsHtml, crumb) {
    const u = Q.state.user || { name: '', role: '', email: '' }
    const roleLabel = { admin: 'Administrador', recruiter: 'Reclutador', hiring_manager: 'Responsable', assessor: 'Evaluador', auditor: 'Auditor' }[u.role] || u.role
    const nav = Q.menu.map((m) => {
      if (m.group) return `<div class="nav-label">${H.esc(m.group)}</div>`
      return `<a class="nav-item ${activeId === m.id ? 'active' : ''}" href="${m.hash}"><span class="ico">${m.icon}</span>${H.esc(m.label)}</a>`
    }).join('')

    return `
      <div class="shell">
        <aside class="side" id="sidebar">
          <div class="side-brand">
            <div class="knot" aria-hidden="true"></div>
            <div><b>QUIPU</b><small>Memoria de talento</small></div>
          </div>
          ${nav}
          <div class="side-foot">
            <div class="side-user">
              <div class="avatar">${H.esc(H.initials(u.name))}</div>
              <div><b>${H.esc(u.name)}</b><span>${H.esc(roleLabel)}</span></div>
            </div>
            <a class="nav-item" href="#/configuracion" style="padding-left:0;font-size:12px"><span class="ico">⚙</span>Ajustes</a>
            <button class="nav-item" id="logout" style="padding-left:0;font-size:12px"><span class="ico">⏻</span>Cerrar sesión</button>
          </div>
        </aside>
        <div class="main">
          <div class="topbar">
            <button class="btn btn-ghost btn-sm" id="burger" style="display:none" aria-label="Abrir menú">☰</button>
            <div>
              <div class="crumb">QUIPU${crumb ? ' · ' + H.esc(crumb) : ''}</div>
              <h1>${H.esc(TITLES[activeId] || 'QUIPU')}</h1>
            </div>
            <div class="topbar-actions">${actionsHtml || ''}</div>
          </div>
          <main class="content" id="view">${contentHtml}</main>
        </div>
      </div>`
  }

  Q.mountShell = function (activeId, html, actions, crumb) {
    const root = document.getElementById('root')
    root.innerHTML = Q.shell(activeId, '', actions, crumb)
    document.getElementById('view').innerHTML = html
    const burger = document.getElementById('burger')
    const side = document.getElementById('sidebar')
    if (window.innerWidth <= 900) burger.style.display = 'inline-flex'
    burger.onclick = () => side.classList.toggle('open')
    side.addEventListener('click', (e) => { if (e.target.closest('.nav-item')) side.classList.remove('open') })
    const lo = document.getElementById('logout')
    if (lo) lo.onclick = async () => {
      try { await Q.api('/auth/logout', { method: 'POST' }) } catch (e) { /* noop */ }
      Q.state.user = null
      Q.render()
    }
  }

  /* ---------------- router ---------------- */
  Q.parseHash = function () {
    const raw = (location.hash || '#/').replace(/^#\/?/, '')
    const parts = raw.split('/').filter(Boolean)
    return { parts, raw }
  }

  Q.render = async function () {
    if (!Q.state.user) return renderLogin()
    const { parts } = Q.parseHash()
    const v = Q.views
    try {
      const p0 = parts[0], p1 = parts[1], p2 = parts[2]
      if (!p0) return await v.dashboard()
      if (p0 === 'vacantes') {
        if (p1 === 'nueva') return await v.jobs.new()
        if (p1) return await v.jobs.detail(p1, p2)
        return await v.jobs()
      }
      if (p0 === 'candidatos') return p1 ? await v.candidates.detail(p1) : await v.candidates()
      if (p0 === 'postulacion' && p1) return await v.application(p1)
      if (p0 === 'memoria') return await v.memory()
      if (p0 === 'evaluaciones') return p1 ? await v.assessments.detail(p1) : await v.assessments()
      if (p0 === 'entrevistas') return await v.interviews()
      if (p0 === 'reportes') return await v.reports()
      if (p0 === 'configuracion') return await v.settings(p1)
      return Q.mountShell('dashboard', `<div class="empty"><h3>Página no encontrada</h3><p>La ruta solicitada no existe.</p><a class="btn" href="#/">Volver al panel</a></div>`)
    } catch (e) {
      console.error(e)
      Q.mountShell('dashboard', `<div class="notice n-err"><span>⚠</span><div><b>Error al cargar la vista</b><br>${H.esc(e.message)}</div></div>`)
    }
  }

  /* ---------------- login ---------------- */
  function renderLogin() {
    const root = document.getElementById('root')
    root.innerHTML = `
    <div class="login-wrap">
      <section class="login-aside">
        <div>
          <div class="login-brand"><div class="knot" aria-hidden="true"></div>QUIPU · ATS</div>
          <h1>No pierdas a un buen candidato.</h1>
          <p>Recupera el talento que ya conoces, evalúa lo que sabe hacer y decide con evidencia.</p>
          <ul class="login-points">
            <li><span class="dot"></span><span><b>Memoria histórica.</b> Cada candidato conserva un perfil único con su historial completo.</span></li>
            <li><span class="dot"></span><span><b>Compatibilidad explicada.</b> Cada recomendación muestra evidencia, brechas y datos faltantes.</span></li>
            <li><span class="dot"></span><span><b>Pruebas prácticas.</b> Resultados versionados con revisión humana obligatoria.</span></li>
            <li><span class="dot"></span><span><b>Trazabilidad.</b> Cada etapa, decisión y cambio queda registrado.</span></li>
          </ul>
        </div>
        <p class="tiny" style="color:#7fa8a1">Datos de demostración ficticios · Ambiente QUIPU v1.0</p>
      </section>
      <section class="login-main">
        <div class="login-card">
          <h2>Inicia sesión</h2>
          <p class="sub">Accede al espacio de tu organización.</p>
          <form id="loginform" novalidate>
            <div class="field">
              <label for="email">Correo corporativo</label>
              <input id="email" name="email" type="email" autocomplete="username" required placeholder="tu@empresa.com">
            </div>
            <div class="field">
              <label for="password">Contraseña</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••">
            </div>
            <div id="loginerr"></div>
            <button class="btn btn-block" type="submit" id="loginbtn" style="margin-top:6px">Entrar</button>
          </form>
          <div class="login-foot">
            <b>Cuentas de demostración</b> (datos ficticios):<br>
            admin@quipu.demo · reclutador@quipu.demo · auditor@quipu.demo<br>
            Contraseña: <span class="mono">Quipu2026!</span>
          </div>
        </div>
      </section>
    </div>`

    const form = document.getElementById('loginform')
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('loginbtn')
      const errBox = document.getElementById('loginerr')
      errBox.innerHTML = ''
      const email = document.getElementById('email').value.trim()
      const password = document.getElementById('password').value
      if (!email || !password) { errBox.innerHTML = '<div class="err-text">Ingresa correo y contraseña.</div>'; return }
      btn.disabled = true; btn.textContent = 'Verificando…'
      try {
        const data = await Q.api('/auth/login', { method: 'POST', body: { email, password } })
        Q.state.user = data.user
        await Q.bootstrapOrg()
        Q.render()
      } catch (err) {
        errBox.innerHTML = `<div class="notice n-err" style="margin-top:10px"><span>⚠</span><div>${H.esc(err.message)}</div></div>`
      } finally {
        btn.disabled = false; btn.textContent = 'Entrar'
      }
    })
  }

  Q.bootstrapOrg = async function () {
    try {
      const me = await Q.api('/auth/me')
      Q.state.user = me.user
      Q.state.org = me.org
    } catch (e) { /* sesión inválida */ }
  }

  Q.start = async function () {
    await Q.bootstrapOrg()
    Q.render()
  }

  window.addEventListener('hashchange', Q.render)
})()
