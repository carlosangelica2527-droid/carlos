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
