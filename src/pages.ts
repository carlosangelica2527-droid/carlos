/** Páginas públicas mínimas (bolsa de empleo) — generadas en el servidor. */

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}

const baseStyle = `
  *{box-sizing:border-box}
  body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f6f7fb;color:#0f172a}
  .wrap{max-width:960px;margin:0 auto;padding:32px 20px}
  header.pub{background:linear-gradient(135deg,#0b1f3a,#123a63 55%,#0f6b5c);color:#fff;padding:40px 20px}
  header.pub h1{margin:0 0 8px;font-size:30px;letter-spacing:-.5px}
  header.pub p{margin:0;opacity:.85;font-size:15px}
  .brand{display:inline-flex;align-items:center;gap:10px;margin-bottom:18px;font-weight:700;letter-spacing:.14em;font-size:12px;text-transform:uppercase;opacity:.9}
  .brand i{display:inline-block;width:10px;height:10px;border-radius:3px;background:#48d1b0}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:14px;transition:.15s}
  .card:hover{border-color:#94a3b8;box-shadow:0 6px 18px -8px rgba(15,23,42,.25)}
  .card h2{margin:0 0 6px;font-size:18px}
  .meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .tag{font-size:12px;padding:3px 9px;border-radius:999px;background:#eef2f7;color:#334155;border:1px solid #e2e8f0}
  .muted{color:#64748b;font-size:14px}
  a{color:#0f6b5c}
  .empty{text-align:center;padding:40px;color:#64748b}
  button.link{display:inline-block;margin-top:12px;text-decoration:none;background:#0f6b5c;color:#fff;padding:9px 16px;border-radius:9px;font-size:14px;font-weight:600;border:0;cursor:pointer}
`

export function appShell(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>QUIPU · Memoria de Talento</title>
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
<style>${baseStyle}</style></head>
<body>
<header class="pub"><div class="wrap" style="padding:0">
  <div class="brand"><i></i>QUIPU · Memoria de Talento</div>
  <h1>Oportunidades abiertas</h1>
  <p>Postula con tu perfil: tu información se conserva de forma privada y solo para este proceso.</p>
</div></header>
<div class="wrap">
  <div id="list"><div class="empty">Cargando vacantes…</div></div>
  <p class="muted" style="margin-top:28px">Los datos que envíes se tratan según la base legal indicada en cada proceso. Puedes solicitar acceso, rectificación u oposición escribiendo al reclutador.</p>
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
<style>${baseStyle}
  label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px}
  input,textarea,select{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:9px;font-size:14px;font-family:inherit}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .ok{background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:14px;border-radius:10px;margin-top:16px}
  .err{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:14px;border-radius:10px;margin-top:16px}
  @media(max-width:640px){.row{grid-template-columns:1fr}}
</style></head>
<body>
<header class="pub"><div class="wrap" style="padding:0">
  <div class="brand"><i></i>QUIPU · Memoria de Talento</div>
  <h1 id="title">Cargando…</h1>
  <p id="sub"></p>
</div></header>
<div class="wrap">
  <article class="card" id="detail"></article>
  <article class="card">
    <h2>Postular a esta vacante</h2>
    <p class="muted">Tus datos se usarán únicamente para evaluar tu candidatura. Puedes pedir su eliminación en cualquier momento.</p>
    <form id="apply">
      <div class="row">
        <div><label for="full_name">Nombre completo *</label><input id="full_name" name="full_name" required maxlength="160"></div>
        <div><label for="email">Correo electrónico *</label><input id="email" name="email" type="email" required maxlength="160"></div>
      </div>
      <div class="row">
        <div><label for="phone">Teléfono</label><input id="phone" name="phone" maxlength="40"></div>
        <div><label for="location">Ciudad</label><input id="location" name="location" maxlength="120"></div>
      </div>
      <div class="row">
        <div><label for="years_experience">Años de experiencia</label><input id="years_experience" name="years_experience" type="number" min="0" max="60" step="0.5" value="0"></div>
        <div><label for="salary">Expectativa salarial (USD, opcional)</label><input id="salary" name="salary" type="number" min="0" step="50"></div>
      </div>
      <label for="headline">Titular profesional</label>
      <input id="headline" name="headline" maxlength="160" placeholder="Ej: Analista financiero con 4 años en NIIF">
      <label for="consent"><input type="checkbox" id="consent" checked style="width:auto;margin-right:8px">Autorizo el tratamiento de mis datos para este proceso de selección.</label>
      <button class="link" type="submit">Enviar postulación</button>
      <div id="msg"></div>
    </form>
  </article>
</div>
<script>
const slug=${JSON.stringify(slug)};
let job=null;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
fetch('/api/public/jobs/'+encodeURIComponent(slug)).then(r=>r.json()).then(j=>{
  if(j.error){document.getElementById('title').textContent='Vacante no disponible';return}
  job=j;
  document.getElementById('title').textContent=j.title;
  document.getElementById('sub').textContent=[j.org_name,j.location,j.modality].filter(Boolean).join(' · ');
  const crit=(j.criteria||[]);
  document.getElementById('detail').innerHTML=\`
    <h2>Descripción</h2>
    <p class="muted" style="white-space:pre-wrap">\${esc(j.description||'Sin descripción detallada.')}</p>
    \${j.responsibilities?'<h2 style="margin-top:18px">Responsabilidades</h2><p class="muted" style="white-space:pre-wrap">'+esc(j.responsibilities)+'</p>':''}
    \${crit.length?'<h2 style="margin-top:18px">Qué evaluamos</h2><div class="meta">'+crit.map(c=>'<span class="tag">'+esc(c.label)+(c.kind==='mandatory'?' (excluyente)':'')+'</span>').join('')+'</div>':''}
  \`;
}).catch(()=>{document.getElementById('title').textContent='Vacante no disponible'});

document.getElementById('apply').addEventListener('submit',async e=>{
  e.preventDefault();
  const msg=document.getElementById('msg');
  const fd=new FormData(e.target);
  const body={
    job_id: job? job.id : null,
    full_name: fd.get('full_name'),
    email: fd.get('email'),
    phone: fd.get('phone'),
    location: fd.get('location'),
    years_experience: Number(fd.get('years_experience')||0),
    salary_expectation: fd.get('salary')?Number(fd.get('salary')):null,
    headline: fd.get('headline'),
    source: 'pagina_publica',
    consent_status: document.getElementById('consent').checked?'granted':'pending',
    consent_basis: 'Consentimiento del candidato en la página de postulación'
  };
  if(!body.full_name||!body.email){msg.className='err';msg.textContent='Nombre y correo son obligatorios.';return}
  if(!job){msg.className='err';msg.textContent='La vacante no está disponible.';return}
  const r=await fetch('/api/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json();
  if(r.ok){msg.className='ok';msg.innerHTML='<strong>Postulación recibida.</strong> Guardamos tu perfil para este proceso. Te contactaremos si tu perfil avanza.';e.target.reset()}
  else{msg.className='err';msg.textContent=d.error||'No se pudo enviar la postulación.'}
});
</script>
</body></html>`
}
