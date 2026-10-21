/* Postulación pública con carga de CV.
   Extrae el texto en el navegador (PDF con pdf.js, DOCX con mammoth, TXT directo)
   y envía el original en base64 + el texto a /api/public/apply.
   El texto es solo para lectura del reclutador: no decide nada por sí solo. */
(function () {
  var slug = document.body.getAttribute('data-slug') || ''
  var job = null
  var cvPayload = null
  var MAX = 3 * 1024 * 1024

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function $(id) { return document.getElementById(id) }

  /* ---------------- carga de la vacante ---------------- */
  fetch('/api/public/jobs/' + encodeURIComponent(slug))
    .then(function (r) { return r.json() })
    .then(function (j) {
      if (j.error) { $('title').textContent = 'Vacante no disponible'; return }
      job = j
      $('title').textContent = j.title
      $('sub').textContent = [j.org_name, j.location, j.modality].filter(Boolean).join(' · ')
      var crit = j.criteria || []
      $('detail').innerHTML =
        '<h2>Descripción del puesto</h2>' +
        '<p class="muted" style="white-space:pre-wrap">' + esc(j.description || 'Sin descripción detallada.') + '</p>' +
        (j.responsibilities ? '<h2 style="margin-top:18px">Funciones</h2><p class="muted" style="white-space:pre-wrap">' + esc(j.responsibilities) + '</p>' : '') +
        (crit.length ? '<h2 style="margin-top:18px">Qué evaluamos</h2><div class="meta">' +
          crit.map(function (c) {
            return '<span class="tag">' + esc(c.label) + (c.kind === 'mandatory' ? ' (excluyente)' : '') + '</span>'
          }).join('') + '</div>' : '')
    })
    .catch(function () { $('title').textContent = 'Vacante no disponible' })

  /* ---------------- extracción de texto ---------------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = function () { reject(new Error('No se pudo cargar ' + src)) }
      document.head.appendChild(s)
    })
  }

  async function pdfToText(arrayBuffer) {
    if (!window.pdfjsLib) {
      await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js')
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    }
    var pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
    var out = []
    var limit = Math.min(pdf.numPages, 8)
    for (var p = 1; p <= limit; p++) {
      var page = await pdf.getPage(p)
      var content = await page.getTextContent()
      out.push(content.items.map(function (i) { return i.str }).join(' '))
    }
    return out.join('\n').replace(/\s+/g, ' ').trim()
  }

  async function docxToText(arrayBuffer) {
    if (!window.mammoth) {
      await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js')
    }
    var res = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer })
    return String(res.value || '').replace(/\s+/g, ' ').trim()
  }

  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader()
      fr.onload = function () { resolve(fr.result) }
      fr.onerror = function () { reject(new Error('No se pudo leer el archivo')) }
      fr.readAsArrayBuffer(file)
    })
  }
  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader()
      fr.onload = function () { resolve(String(fr.result || '')) }
      fr.onerror = function () { reject(new Error('No se pudo leer el archivo')) }
      fr.readAsText(file)
    })
  }
  function toBase64(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer)
    var bin = ''
    var chunk = 0x8000
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    return btoa(bin)
  }

  function setState(html, bad) {
    var el = $('cvstate')
    el.hidden = false
    el.className = 'cvstate' + (bad ? ' bad' : '')
    el.innerHTML = html
  }

  async function handleFile(file) {
    if (!file) return
    cvPayload = null
    var drop = $('drop')
    drop.classList.remove('done')

    if (file.size > MAX) {
      setState('El archivo pesa ' + (file.size / 1048576).toFixed(1) + ' MB. El máximo es 3 MB.', true)
      return
    }

    var ext = (file.name.split('.').pop() || '').toLowerCase()
    setState('Leyendo <b>' + esc(file.name) + '</b>…', false)

    try {
      if (ext === 'pdf') {
        var buf = await readAsArrayBuffer(file)
        var text = ''
        try { text = await pdfToText(buf.slice(0)) } catch (e) { text = '' }
        cvPayload = { filename: file.name, mime: 'application/pdf', size: file.size, base64: toBase64(buf), text: text }
      } else if (ext === 'docx') {
        var buf2 = await readAsArrayBuffer(file)
        var text2 = ''
        try { text2 = await docxToText(buf2) } catch (e) { text2 = '' }
        cvPayload = { filename: file.name, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: file.size, base64: toBase64(buf2), text: text2 }
      } else if (ext === 'txt' || ext === 'rtf' || ext === 'doc') {
        var raw = await readAsText(file)
        var clean = raw.replace(/\\[a-z]+-?\d* ?/gi, ' ').replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim()
        cvPayload = { filename: file.name, mime: 'text/plain', size: file.size, base64: '', text: clean }
      } else {
        setState('Formato no soportado. Usa PDF, DOCX o TXT.', true)
        return
      }
      drop.classList.add('done')
      var n = (cvPayload.text || '').length
      if (n >= 200) {
        setState('✓ <b>' + esc(file.name) + '</b> leído · ' + n.toLocaleString('es-EC') + ' caracteres de texto detectados.', false)
      } else {
        setState('✓ <b>' + esc(file.name) + '</b> adjuntado. No pudimos leer texto (puede ser un escaneo); el archivo se guarda igual y podrás pegar el texto abajo.', false)
      }
      $('manual').open = n < 200
    } catch (e) {
      cvPayload = null
      setState('No se pudo leer el archivo: ' + esc(e.message), true)
    }
  }

  var drop = $('drop')
  var input = $('cvfile')
  input.addEventListener('change', function () { handleFile(input.files[0]) })
  ;['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('hot') })
  })
  ;['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('hot') })
  })
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  })

  /* ---------------- envío ---------------- */
  $('apply').addEventListener('submit', async function (e) {
    e.preventDefault()
    var msg = $('msg')
    var btn = $('submit')
    msg.className = ''
    msg.textContent = ''

    var fd = new FormData(e.target)
    var manual = ($('cvtext').value || '').trim()
    if (!cvPayload && manual.length < 40) {
      msg.className = 'err'
      msg.textContent = 'Adjunta tu CV (PDF, DOCX o TXT) para poder postular.'
      return
    }
    if (!$('consent').checked) {
      msg.className = 'err'
      msg.textContent = 'Debes autorizar el tratamiento de tus datos para continuar.'
      return
    }

    var cv = cvPayload
      ? { filename: cvPayload.filename, mime: cvPayload.mime, size: cvPayload.size, base64: cvPayload.base64 || '', text: manual || cvPayload.text }
      : { filename: 'cv-pegado.txt', mime: 'text/plain', size: manual.length, base64: '', text: manual }

    var body = {
      job_id: job ? job.id : null,
      full_name: (fd.get('full_name') || '').toString().trim(),
      email: (fd.get('email') || '').toString().trim(),
      phone: fd.get('phone'),
      location: fd.get('location'),
      years_experience: Number(fd.get('years_experience') || 0),
      salary_expectation: fd.get('salary') ? Number(fd.get('salary')) : null,
      headline: fd.get('headline'),
      consent_status: 'granted',
      cv: cv
    }

    if (!body.full_name || !body.email) {
      msg.className = 'err'
      msg.textContent = 'Nombre y correo son obligatorios.'
      return
    }
    if (!job) {
      msg.className = 'err'
      msg.textContent = 'La vacante no está disponible.'
      return
    }

    btn.disabled = true
    btn.textContent = 'Enviando…'
    try {
      var r = await fetch('/api/public/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      var d = await r.json()
      if (r.ok) {
        msg.className = 'ok'
        msg.innerHTML =
          '<strong>¡Postulación recibida!</strong><br>' +
          'Guardamos tu perfil y tu CV en la vacante <b>' + esc(job.title) + '</b>.' +
          (d.skills_detected ? '<br>Detectamos ' + d.skills_detected + ' habilidades en tu CV que el equipo revisará.' : '') +
          '<br><span style="font-size:13px">Te contactaremos al correo ' + esc(body.email) + ' si tu perfil avanza. Puedes postular a otras vacantes publicadas.</span>'
        e.target.reset()
        cvPayload = null
        $('cvstate').hidden = true
        drop.classList.remove('done')
        btn.textContent = 'Postulación enviada'
      } else {
        msg.className = 'err'
        msg.textContent = d.error || 'No se pudo enviar la postulación.'
        btn.disabled = false
        btn.textContent = 'Enviar postulación'
      }
    } catch (err) {
      msg.className = 'err'
      msg.textContent = 'Error de conexión. Revisa tu internet e inténtalo de nuevo.'
      btn.disabled = false
      btn.textContent = 'Enviar postulación'
    }
  })
})()
