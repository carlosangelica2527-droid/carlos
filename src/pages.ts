/** Páginas públicas (bolsa de empleo y postulación) — generadas en el servidor. */

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}

const baseStyle = `
  *{box-sizing:border-box}
  body{margin:0;font-family:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f5f7fa;color:#0d1b2a}
  .wrap{max-width:960px;margin:0 auto;padding:32px 20px}
  header.pub{background:linear-gradient(135deg,#0a2239,#0f3d52 48%,#0f6b5c);color:#fff;padding:40px 20px}
  header.pub h1{margin:0 0 8px;font-size:30px;letter-spacing:-.5px}
  header.pub p{margin:0;opacity:.86;font-size:15px}
  .brand{display:inline-flex;align-items:center;gap:12px;margin-bottom:20px;font-weight:700;letter-spacing:.14em;font-size:11px;text-transform:uppercase;opacity:.95}
  .brand img{height:34px;width:auto;display:block;filter:brightness(1.15)}
  .card{background:#fff;border:1px solid #e3e8ef;border-radius:14px;padding:22px;margin-bottom:16px;transition:.16s}
  .card:hover{border-color:#b7c3d0;box-shadow:0 10px 26px -18px rgba(13,27,42,.45)}
  .card h2{margin:0 0 8px;font-size:18px}
  .meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .tag{font-size:12px;padding:3px 10px;border-radius:999px;background:#eef2f7;color:#334155;border:1px solid #e3e8ef}
  .muted{color:#64748b;font-size:14px}
  a{color:#0f6b5c}
  .empty{text-align:center;padding:44px;color:#64748b}
  button.link{display:inline-block;margin-top:14px;text-decoration:none;background:#0f6b5c;color:#fff;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600;border:0;cursor:pointer}
  button.link:hover{background:#0b5648}
`

export function appShell(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>QUIPU · Memoria de Talento</title>
<link rel="icon" href="/static/favicon.png">
<link rel="apple-touch-icon" href="/static/favicon.png">
<link rel="stylesheet" href="/static/app.css">
</head>
<body>
<div id="root"><div class="boot"><div class="spinner"></div><p>Cargando QUIPU…</p></div></div>
<div id="toast-host" aria-live="polite" aria-atomic="true"></div>
<div id="modal-host"></div>
<script src="/static/core.js"></script>
<script src="/static/views1.js"></script>
<script src="/static/views2.js"></script>
<script src="/static/views3.js"></script>
<script src="/static/boot.js"></script>
</body>
</html>`
}

export function publicJobsPage(): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Empleos abiertos · QUIPU</title>
<link rel="icon" href="/static/favicon.png">
<style>${baseStyle}</style></head>
<body>
<header class="pub"><div class="wrap" style="padding:0">
  <div class="brand"><img src="/static/logo.png" alt="QUIPU"><span>Memoria de talento</span></div>
  <h1>Oportunidades abiertas</h1>
  <p>Postula en línea y adjunta tu CV en PDF. Tu información es privada y solo se usa para este proceso.</p>
</div></header>
<div class="wrap">
  <div id="list"><div class="empty">Cargando vacantes…</div></div>
  <p class="muted" style="margin-top:28px">Tratamos tus datos según la base legal indicada en cada proceso. Puedes solicitar acceso, rectificación u oposición escribiendo al equipo de selección.</p>
</div>
<script>
fetch('/api/public/jobs').then(r=>r.json()).then(jobs=>{
  const el=document.getElementById('list');
  if(!jobs.length){el.innerHTML='<div class="empty">No hay vacantes publicadas por el momento.</div>';return}
  el.innerHTML=jobs.map(j=>\`<article class="card">
    <h2>\${esc(j.title)}</h2>
    <div class="muted">\${esc(j.area||'')} \${j.location?'· '+esc(j.location):''} \${j.org_name?'· '+esc(j.org_name):''}</div>
    <div class="meta">
      <span class="tag">\${esc(j.modality)}</span>
      <span class="tag">\${esc(j.workday)}</span>
      <span class="tag">\${esc(j.contract_type)}</span>
      \${j.seniority?'<span class="tag">'+esc(j.seniority)+'</span>':''}
      \${j.salary_min?'<span class="tag">USD '+j.salary_min+(j.salary_max?' - '+j.salary_max:'')+'</span>':''}
    </div>
    <a class="link" href="/empleos/\${encodeURIComponent(j.public_slug)}">Ver detalle y postular</a>
  </article>\`).join('');
}).catch(()=>{document.getElementById('list').innerHTML='<div class="empty">No se pudieron cargar las vacantes.</div>'})
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
</script>
</body></html>`
}

export function publicJobPage(slug: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Postular · QUIPU</title>
<link rel="icon" href="/static/favicon.png">
<link rel="stylesheet" href="/static/apply.css">
<style>${baseStyle}</style></head>
<body data-slug="${esc(slug)}">
<header class="pub"><div class="wrap" style="padding:0">
  <div class="brand"><img src="/static/logo.png" alt="QUIPU"><span>Memoria de talento</span></div>
  <h1 id="title">Cargando…</h1>
  <p id="sub"></p>
</div></header>
<div class="wrap">
  <article class="card" id="detail"></article>
  <article class="card">
    <h2>Postular a esta vacante</h2>
    <p class="muted">Postulación en línea. Adjunta tu CV en <b>PDF, DOCX o TXT</b>; el sistema lee el texto automáticamente para agilizar la revisión.</p>
    <form id="apply" novalidate>
      <div class="row">
        <div><label for="full_name">Nombre completo *</label><input id="full_name" name="full_name" required maxlength="160" autocomplete="name"></div>
        <div><label for="email">Correo electrónico *</label><input id="email" name="email" type="email" required maxlength="160" autocomplete="email"></div>
      </div>
      <div class="row">
        <div><label for="phone">Teléfono / WhatsApp</label><input id="phone" name="phone" maxlength="40" placeholder="0991234567" autocomplete="tel"></div>
        <div><label for="location">Ciudad</label><input id="location" name="location" maxlength="120" placeholder="Quito" autocomplete="address-level2"></div>
      </div>
      <div class="row">
        <div><label for="years_experience">Años de experiencia</label><input id="years_experience" name="years_experience" type="number" min="0" max="60" step="0.5" value="0"></div>
        <div><label for="salary">Pretensión salarial (USD, opcional)</label><input id="salary" name="salary" type="number" min="0" step="50"></div>
      </div>
      <label for="headline">Titular profesional</label>
      <input id="headline" name="headline" maxlength="160" placeholder="Ej: Contadora pública con 5 años en NIIF">

      <div class="upload" id="drop">
        <input type="file" id="cvfile" accept=".pdf,.docx,.txt,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
        <div class="upload-ico" aria-hidden="true">📄</div>
        <b>Adjunta tu CV *</b>
        <span class="muted">PDF, DOCX o TXT · máximo 3 MB</span>
        <label class="upload-btn" for="cvfile">Elegir archivo</label>
      </div>
      <div id="cvstate" class="cvstate" hidden></div>

      <details id="manual" style="margin-top:12px">
        <summary class="muted" style="cursor:pointer;font-size:13px">¿Tu CV es una imagen escaneada? Pega el texto aquí</summary>
        <textarea id="cvtext" rows="6" maxlength="60000" placeholder="Pega aquí el contenido de tu CV…" style="margin-top:8px"></textarea>
      </details>

      <label for="consent" class="consent"><input type="checkbox" id="consent"> Autorizo el tratamiento de mis datos personales para este proceso de selección y acepto que mi CV sea leído por el sistema. *</label>
      <button class="link" type="submit" id="submit">Enviar postulación</button>
      <div id="msg"></div>
    </form>
  </article>
</div>
<script src="/static/apply.js"></script>
</body></html>`
}

/* ==========================================================================
   PORTAL DEL POSTULANTE — /mi-postulacion/:token
   Autocontenido (HTML + CSS + JS en un solo documento). Sin sesión:
   el token personal identifica la postulación.
   ========================================================================== */
export function portalPage(token: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mi postulación · QUIPU</title>
<link rel="icon" href="/static/favicon.png">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f5f7fa;color:#0d1b2a;font-size:14px;line-height:1.55}
.wrap{max-width:820px;margin:0 auto;padding:24px 18px 60px}
header.pub{background:linear-gradient(135deg,#0a2239,#0f3d52 48%,#0f6b5c);color:#fff;padding:26px 18px}
header.pub .inner{max-width:820px;margin:0 auto}
header.pub img{height:32px;display:block;margin-bottom:14px}
header.pub h1{margin:0 0 4px;font-size:24px;letter-spacing:-.4px}
header.pub p{margin:0;opacity:.86;font-size:14px}
.card{background:#fff;border:1px solid #e3e8ef;border-radius:14px;padding:20px;margin-bottom:14px}
.card h2{margin:0 0 12px;font-size:17px}
.card h3{margin:0 0 8px;font-size:15px}
.muted{color:#64748b}
.small{font-size:13px}
.tiny{font-size:12px}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 5px;color:#243b53}
input,textarea,select{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:9px;font-size:14px;font-family:inherit}
input:focus,textarea:focus{outline:0;border-color:#0f6b5c;box-shadow:0 0 0 3px rgba(15,107,92,.12)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:640px){.row{grid-template-columns:1fr}}
.btn{display:inline-block;background:#0f6b5c;color:#fff;padding:10px 18px;border-radius:9px;font-size:14px;font-weight:600;border:0;cursor:pointer;text-decoration:none}
.btn:hover{background:#0b5648}
.btn:disabled{opacity:.55;cursor:not-allowed}
.btn-ghost{background:#fff;color:#0f6b5c;border:1px solid #cbd5e1}
.btn-sm{padding:7px 13px;font-size:13px}
.steps{display:flex;gap:6px;margin:14px 0 4px;flex-wrap:wrap}
.step{flex:1;min-width:110px;padding:9px 10px;border-radius:9px;background:#eef2f7;font-size:12px;font-weight:600;color:#64748b;border:1px solid #e3e8ef}
.step.done{background:#ecfdf5;color:#065f46;border-color:#6ee7b7}
.step.now{background:#0f6b5c;color:#fff;border-color:#0f6b5c}
.test{border:1px solid #e3e8ef;border-radius:11px;padding:15px;margin-bottom:11px}
.test.pend{border-left:4px solid #b8860b;background:#fffdf5}
.test.ok{border-left:4px solid #067647;background:#f6fdf9}
.badge{display:inline-block;font-size:11px;padding:2px 9px;border-radius:999px;background:#eef2f7;color:#475569;font-weight:600}
.badge.pend{background:#fef3c7;color:#92400e}
.badge.ok{background:#d1fae5;color:#065f46}
.ok{background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:14px;border-radius:10px;margin-top:14px}
.err{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:14px;border-radius:10px;margin-top:14px}
.q{border:1px solid #e3e8ef;border-radius:11px;padding:14px;margin-bottom:11px}
.q b{display:block;margin-bottom:9px;font-size:14px}
.opt{display:flex;gap:9px;align-items:flex-start;padding:8px 10px;border:1px solid #e3e8ef;border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:14px}
.opt:hover{border-color:#94a3b8;background:#f8fafc}
.opt input{width:auto;margin:3px 0 0;flex:none}
.drop{border:2px dashed #cbd5e1;border-radius:12px;padding:22px;text-align:center;background:#fbfcfe;position:relative;transition:.15s}
.drop.hot{border-color:#0f6b5c;background:#f0fdfa}
.drop.done{border-style:solid;border-color:#6ee7b7;background:#f0fdf4}
.drop input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.cvstate{margin-top:9px;font-size:13px;padding:9px 12px;border-radius:8px;background:#eef6f4;color:#0b4f45;border:1px solid #cfe6e1}
.cvstate.bad{background:#fef2f2;color:#991b1b;border-color:#fca5a5}
.spinner{width:22px;height:22px;border:3px solid #e3e8ef;border-top-color:#0f6b5c;border-radius:50%;animation:sp .8s linear infinite;margin:18px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.center{text-align:center;padding:30px}
</style></head>
<body data-token="${esc(token)}">
<header class="pub"><div class="inner">
  <img src="/static/logo-light.png" alt="QUIPU">
  <h1 id="title">Mi postulación</h1>
  <p id="sub">Cargando…</p>
</div></header>
<div class="wrap" id="app"><div class="center"><div class="spinner"></div><p class="muted">Cargando tu postulación…</p></div></div>
<script>
var TOKEN = document.body.getAttribute('data-token') || ''
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function el(id){return document.getElementById(id)}
async function api(path, opts){
  opts = opts || {}
  var init = { method: opts.method || 'GET', headers: {} }
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body) }
  var res = await fetch(path, init)
  var txt = await res.text(); var data = null
  try { data = txt ? JSON.parse(txt) : null } catch(e) { data = { error: txt } }
  if (!res.ok) { var err = new Error((data && data.error) || ('Error ' + res.status)); err.status = res.status; err.data = data; throw err }
  return data
}
var STATE = null
function msg(html, kind){ el('msg').className = kind || ''; el('msg').innerHTML = html }

/* ---------- pasos visuales ---------- */
function stepsHtml(st){
  var s = st.application.status
  var hasTests = (st.tests || []).length > 0
  var pending = (st.tests || []).some(function(t){ return t.status === 'pendiente' })
  var doneAll = hasTests && !pending
  var stage = s === 'hired' ? 4 : s === 'rejected' ? 3 : doneAll ? 3 : hasTests ? 2 : 1
  var names = ['Recibida','En revisión','Pruebas','Resultado']
  return '<div class="steps">' + names.map(function(n,i){
    var cls = i < stage ? 'done' : i === stage ? 'now' : ''
    return '<div class="step ' + cls + '">' + (i+1) + '. ' + n + '</div>'
  }).join('') + '</div>'
}

/* ---------- vista principal ---------- */
async function render(){
  var root = el('app')
  try {
    STATE = await api('/api/public/portal/' + encodeURIComponent(TOKEN))
  } catch (e) {
    el('title').textContent = 'Enlace no disponible'
    el('sub').textContent = ''
    root.innerHTML = '<div class="card"><h2>No pudimos abrir tu postulación</h2><p class="muted">' + esc(e.message) + '</p><p class="small muted">Si el problema continúa, escribe al equipo de selección que te contactó.</p></div>'
    return
  }
  if (STATE.blocked) {
    root.innerHTML = '<div class="card"><h2>Preferencia registrada</h2><p class="muted">' + esc(STATE.message) + '</p></div>'
    return
  }
  var st = STATE
  el('title').textContent = st.job.title
  el('sub').textContent = st.job.org_name + ' · Etapa: ' + (st.application.stage_name || '—')

  var c = st.candidate
  var testCards = (st.tests || []).map(function(t){
    var pend = t.status === 'pendiente'
    return '<div class="test ' + (pend ? 'pend' : 'ok') + '">' +
      '<div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:180px"><b>' + esc(t.title) + '</b>' +
          '<div class="tiny muted">' + (t.question_count ? t.question_count + ' pregunta(s) · ' : '') +
          (t.duration_min ? t.duration_min + ' min · ' : '') +
          ({mcq:'Opción múltiple',written:'Respuesta escrita',practical:'Caso práctico',spreadsheet:'Hoja de cálculo',manual:'Evaluación'}[t.type] || t.type) +
          (t.due_at ? ' · antes del ' + esc(String(t.due_at).slice(0,10)) : '') + '</div></div>' +
        '<span class="badge ' + (pend ? 'pend' : 'ok') + '">' + (pend ? 'Pendiente' : 'Completada') + '</span>' +
      '</div>' +
      (pend ? '<div style="margin-top:11px"><button class="btn btn-sm" data-start="' + t.assessment_id + '">Realizar prueba</button></div>' : '') +
    '</div>'
  }).join('') || '<p class="small muted">Aún no tienes pruebas asignadas. El equipo de selección te avisará por correo cuando corresponda.</p>'

  var attempts = (st.attempts || []).map(function(a){
    var score = a.final_score !== null && a.final_score !== undefined ? a.final_score : a.auto_score
    var shown = (a.type === 'mcq' && a.status === 'graded' && score !== null && score !== undefined)
      ? score + ' / ' + a.max_score + ' puntos' + (a.pass_score ? (score >= a.pass_score ? ' · aprobado' : ' · no aprobado') : '')
      : 'En revisión por el equipo'
    return '<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap">' +
      '<span class="small" style="flex:1;min-width:150px"><b>' + esc(a.title) + '</b></span>' +
      '<span class="small muted">' + esc(shown) + '</span>' +
      '<span class="tiny muted nowrap">' + esc(String(a.submitted_at || '').slice(0,10)) + '</span></div>'
  }).join('') || '<p class="small muted">Todavía no registraste pruebas.</p>'

  var rejected = st.application.status === 'rejected'
  root.innerHTML =
    '<div class="card">' +
      (rejected
        ? '<div class="err"><b>Proceso cerrado para esta vacante.</b><br>Gracias por tu tiempo. Tu perfil queda en nuestra base de talento para futuras oportunidades.</div>'
        : '<h2>Tu avance</h2>' + stepsHtml(st) +
          '<p class="small muted" style="margin-top:12px">Etapa actual: <b>' + esc(st.application.stage_name || '—') + '</b>' +
          (st.application.applied_at ? ' · Postulaste el ' + esc(String(st.application.applied_at).slice(0,10)) : '') + '</p>') +
    '</div>' +

    '<div class="card"><h2>Pruebas</h2>' + testCards + '</div>' +

    '<div class="card"><h2>Mis resultados</h2>' + attempts + '</div>' +

    '<div class="card">' +
      '<h2>Mis datos</h2>' +
      '<p class="small muted">Puedes corregir tu información o actualizar tu pretensión salarial cuando quieras.</p>' +
      '<div class="row"><div><label for="pname">Nombre</label><input id="pname" value="' + esc(c.full_name||'') + '" disabled></div>' +
      '<div><label for="pemail">Correo</label><input id="pemail" value="' + esc(c.email||'') + '" disabled></div></div>' +
      '<div class="row"><div><label for="pphone">Teléfono</label><input id="pphone" value="' + esc(c.phone||'') + '"></div>' +
      '<div><label for="ploc">Ciudad</label><input id="ploc" value="' + esc(c.location||'') + '"></div></div>' +
      '<div class="row"><div><label for="pyears">Años de experiencia</label><input id="pyears" type="number" min="0" max="60" step="0.5" value="' + (c.years_experience||0) + '"></div>' +
      '<div><label for="psalary">Pretensión salarial (USD)</label><input id="psalary" type="number" min="0" step="50" value="' + (c.salary_expectation != null ? c.salary_expectation : '') + '" placeholder="Ej: 1800"></div></div>' +
      '<label for="phead">Titular profesional</label><input id="phead" maxlength="160" value="' + esc(c.headline||'') + '">' +
      '<div style="margin-top:14px"><button class="btn" id="psave">Guardar cambios</button></div>' +
      '<div id="msg"></div>' +
    '</div>'

  el('psave').onclick = async function(){
    var btn = this; btn.disabled = true; btn.textContent = 'Guardando…'
    try {
      await api('/api/public/portal/' + encodeURIComponent(TOKEN) + '/profile', { method: 'POST', body: {
        phone: el('pphone').value.trim(),
        location: el('ploc').value.trim(),
        years_experience: Number(el('pyears').value || 0),
        salary_expectation: el('psalary').value === '' ? null : Number(el('psalary').value),
        headline: el('phead').value.trim()
      }})
      msg('<b>Datos guardados.</b> El equipo de selección verá la información actualizada.', 'ok')
    } catch (e) { msg(esc(e.message), 'err') }
    btn.disabled = false; btn.textContent = 'Guardar cambios'
  }

  document.querySelectorAll('[data-start]').forEach(function(b){
    b.onclick = function(){ startTest(Number(b.getAttribute('data-start'))) }
  })
}

/* ---------- ejecutar una prueba ---------- */
async function startTest(assessmentId){
  var root = el('app')
  root.innerHTML = '<div class="center"><div class="spinner"></div><p class="muted">Cargando prueba…</p></div>'
  var t
  try {
    t = await api('/api/public/portal/' + encodeURIComponent(TOKEN) + '/tests/' + assessmentId)
  } catch (e) {
    root.innerHTML = '<div class="card"><h2>No se pudo abrir la prueba</h2><p class="muted">' + esc(e.message) + '</p><button class="btn btn-ghost" id="back">Volver</button></div>'
    el('back').onclick = render
    return
  }

  var isSheet = t.type === 'spreadsheet'
  var body = ''
  if (isSheet) {
    body = '<div class="card"><h2>' + esc(t.title) + '</h2>' +
      (t.instructions ? '<p class="small muted" style="white-space:pre-wrap">' + esc(t.instructions) + '</p>' : '') +
      '<div class="err" style="background:#eef6f4;border-color:#cfe6e1;color:#0b4f45"><b>Instrucciones</b><br>' +
      t.questions.map(function(q,i){ return (i+1) + '. ' + esc(q.prompt) }).join('<br>') + '</div>' +
      '<div class="drop" id="drop"><input type="file" id="xfile" accept=".xlsx"><b>Adjunta tu archivo .xlsx resuelto</b>' +
      '<div class="tiny muted" style="margin-top:6px">Máximo 5 MB · debe ser Excel (.xlsx)</div></div>' +
      '<div id="xstate"></div>' +
      '<div style="margin-top:18px"><button class="btn" id="send" disabled>Enviar prueba</button> ' +
      '<button class="btn btn-ghost" id="back">Volver</button></div></div>'
  } else {
    body = '<div class="card"><h2>' + esc(t.title) + '</h2>' +
      (t.instructions ? '<p class="small muted" style="white-space:pre-wrap">' + esc(t.instructions) + '</p>' : '') +
      (t.duration_min ? '<p class="tiny muted">Duración sugerida: ' + t.duration_min + ' minutos</p>' : '') +
      t.questions.map(function(q){
        var opts = (q.options || []).map(function(o, oi){
          return '<label class="opt"><input type="radio" name="q' + q.id + '" value="' + oi + '"><span>' + esc(o) + '</span></label>'
        }).join('')
        return '<div class="q"><b>' + esc(q.prompt) + '</b>' +
          (opts || '<textarea rows="6" data-open="' + q.id + '" placeholder="Escribe tu respuesta aquí…"></textarea>') +
        '</div>'
      }).join('') +
      '<div style="margin-top:16px"><button class="btn" id="send">Enviar respuestas</button> ' +
      '<button class="btn btn-ghost" id="back">Volver</button></div><div id="msg"></div></div>'
  }
  root.innerHTML = body
  el('back').onclick = function(){
    if (confirm('¿Salir sin enviar? Se perderán tus respuestas.')) render()
  }

  var workbook = null

  if (isSheet) {
    var drop = el('drop'), xf = el('xfile')
    async function readXlsx(file){
      var st = el('xstate')
      if (!file) return
      if (file.size > 5 * 1024 * 1024) { st.className='cvstate bad'; st.textContent='El archivo supera 5 MB.'; return }
      st.className = 'cvstate'; st.textContent = 'Leyendo ' + file.name + '…'
      try {
        if (!window.XLSX) {
          await new Promise(function(res, rej){
            var s = document.createElement('script')
            s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
            s.onload = res; s.onerror = function(){ rej(new Error('No se pudo cargar el lector de Excel')) }
            document.head.appendChild(s)
          })
        }
        var buf = await file.arrayBuffer()
        var wb = window.XLSX.read(buf, { type:'array', cellFormula:true })
        var out = {}
        wb.SheetNames.forEach(function(name){
          var sh = wb.Sheets[name], cells = {}
          Object.keys(sh || {}).forEach(function(ref){
            if (ref[0] === '!') return
            var cc = sh[ref], cell = {}
            if (cc.f) cell.f = cc.f
            if (cc.v !== undefined && cc.v !== null) cell.v = cc.v
            if (Object.keys(cell).length) cells[ref.toUpperCase()] = cell
          })
          out[name] = { cells: cells }
        })
        workbook = out
        drop.classList.add('done')
        var sheets = Object.keys(out)
        var ncells = sheets.reduce(function(n,s){ return n + Object.keys(out[s].cells).length }, 0)
        st.innerHTML = '✓ <b>' + esc(file.name) + '</b> · ' + sheets.length + ' hoja(s) · ' + ncells + ' celdas leídas.'
        el('send').disabled = false
      } catch (e) {
        workbook = null
        st.className = 'cvstate bad'
        st.textContent = 'No se pudo leer el archivo: ' + e.message
      }
    }
    xf.onchange = function(){ readXlsx(xf.files[0]) }
    ;['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('hot') }) })
    ;['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('hot') }) })
    drop.addEventListener('drop', function(e){ if (e.dataTransfer && e.dataTransfer.files[0]) readXlsx(e.dataTransfer.files[0]) })
  }

  el('send').onclick = async function(){
    var btn = this
    var payload = {}
    if (isSheet) {
      if (!workbook) return
      payload = { workbook: workbook }
    } else {
      var answers = {}
      var missing = false
      t.questions.forEach(function(q){
        if ((q.options || []).length) {
          var sel = document.querySelector('input[name="q' + q.id + '"]:checked')
          if (sel) answers[q.id] = Number(sel.value)
          else if (q.kind === 'mcq') missing = true
        } else {
          var ta = document.querySelector('[data-open="' + q.id + '"]')
          var v = ta ? ta.value.trim() : ''
          if (v) answers[q.id] = v
          else missing = true
        }
      })
      if (missing && !confirm('Quedan preguntas sin responder. ¿Enviar de todas formas?')) return
      payload = { answers: answers }
    }
    btn.disabled = true; btn.textContent = 'Enviando…'
    try {
      var r = await api('/api/public/portal/' + encodeURIComponent(TOKEN) + '/tests/' + assessmentId, { method: 'POST', body: payload })
      el('app').innerHTML = '<div class="card"><h2>Prueba enviada</h2>' +
        '<div class="ok">' + esc(r.message) + '</div>' +
        '<p class="small muted" style="margin-top:12px">Puedes volver para ver el estado de tu postulación.</p>' +
        '<button class="btn" id="back2">Volver a mi postulación</button></div>'
      el('back2').onclick = render
    } catch (e) {
      btn.disabled = false; btn.textContent = isSheet ? 'Enviar prueba' : 'Enviar respuestas'
      var box = el('msg')
      if (box) { box.className = 'err'; box.textContent = e.message }
      else alert(e.message)
    }
  }
}

render()
</script>
</body></html>`
}
