#!/usr/bin/env node
/**
 * Genera seed.generated.sql con datos FICTICIOS de demostración para QUIPU.
 * Todas las personas y empresas son inventadas; los perfiles se marcan is_demo=1.
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const ITER = 100000
const stmts = []
const q = (v) => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  return "'" + String(v).replace(/'/g, "''") + "'"
}
const ins = (table, cols, vals) => stmts.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.map(q).join(',')});`)

const PASSWORD = 'Quipu2026!'
function hash(pw) {
  const salt = randomBytes(16)
  const h = pbkdf2Sync(pw, salt, ITER, 32, 'sha256')
  return { hash: h.toString('hex'), salt: salt.toString('hex') }
}

/* ---------------- organización ---------------- */
ins('organizations', ['id', 'name', 'country', 'timezone', 'currency', 'settings'], [
  1, 'Andina Retail S.A. (demo)', 'EC', 'America/Guayaquil', 'USD',
  JSON.stringify({ locale: 'es-EC', retention_months: 24, stale_days: 7 })
])

/* ---------------- usuarios ---------------- */
const users = [
  [1, 'Ana Cordero', 'admin@quipu.demo', 'admin'],
  [2, 'Luis Herrera', 'reclutador@quipu.demo', 'recruiter'],
  [3, 'Marta Salinas', 'gerente@quipu.demo', 'hiring_manager'],
  [4, 'Diego Paredes', 'evaluador@quipu.demo', 'assessor'],
  [5, 'Rocío Vega', 'auditor@quipu.demo', 'auditor']
]
for (const [id, name, email, role] of users) {
  const { hash: h, salt } = hash(PASSWORD)
  ins('users', ['id', 'org_id', 'email', 'name', 'role', 'password_hash', 'password_salt'], [id, 1, email, name, role, h, salt])
}

/* ---------------- vacantes ---------------- */
const jobs = [
  {
    id: 1, title: 'Analista Financiero Senior', area: 'Finanzas', location: 'Quito, Ecuador',
    modality: 'hibrido', seniority: 'Senior', salary_min: 1800, salary_max: 2400, status: 'published',
    slug: 'analista-financiero-senior',
    description: 'Buscamos un analista financiero con experiencia en cierre contable, conciliaciones y elaboración de reportes gerenciales bajo NIIF. El rol reporta a la Gerencia Financiera y trabaja junto a Tesorería y Compras.',
    responsibilities: 'Cierre contable mensual\nConciliaciones bancarias y de cuentas por cobrar\nElaboración de reportes gerenciales\nApoyo en presupuesto anual\nAnálisis de variaciones y costos'
  },
  {
    id: 2, title: 'Ejecutivo de Ventas B2B', area: 'Comercial', location: 'Guayaquil, Ecuador',
    modality: 'presencial', seniority: 'Semi senior', salary_min: 900, salary_max: 1300, status: 'published',
    slug: 'ejecutivo-ventas-b2b',
    description: 'Responsable de la gestión y crecimiento de una cartera de clientes corporativos en la región Costa, con seguimiento en CRM y cumplimiento de metas mensuales.',
    responsibilities: 'Prospección y gestión de cartera\nNegociación y cierre de contratos\nRegistro de actividad en CRM\nReporte semanal de pipeline'
  },
  {
    id: 3, title: 'Analista de Datos', area: 'Tecnología', location: 'Remoto (Ecuador)',
    modality: 'remoto', seniority: 'Semi senior', salary_min: 1500, salary_max: 2100, status: 'draft',
    slug: 'analista-de-datos',
    description: 'Perfil analítico para construir tableros, automatizar reportes y apoyar decisiones comerciales con datos confiables.',
    responsibilities: 'Modelado de datos\nTableros en Power BI\nConsultas SQL\nDocumentación de métricas'
  }
]
for (const j of jobs) {
  ins('jobs', ['id', 'org_id', 'title', 'area', 'location', 'country', 'modality', 'workday', 'contract_type',
    'seniority', 'salary_min', 'salary_max', 'description', 'responsibilities', 'status', 'public_slug',
    'recruiter_id', 'hiring_manager_id', 'opened_at'], [
    j.id, 1, j.title, j.area, j.location, 'EC', j.modality, 'jornada completa', 'indefinido', j.seniority,
    j.salary_min, j.salary_max, j.description, j.responsibilities, j.status, j.slug, 2, 3,
    j.status === 'published' ? '2026-09-15 10:00:00' : null
  ])
}

/* ---------------- criterios ---------------- */
const criteria = [
  // Vacante 1
  [1, 1, 'mandatory', 'education', 'Formación en contabilidad, finanzas o auditoría', 'Título de tercer nivel en áreas afines', 0, '["contabilidad","finanzas","auditoria","cpa"]', null],
  [1, 1, 'mandatory', 'technical', 'Experiencia con NIIF', 'Normativa internacional aplicada al cierre', 0, '["niif","ifrs"]', null],
  [1, 1, 'weighted', 'experience', 'Experiencia relevante en análisis financiero', 'Cierre contable, conciliaciones y reportes', 25, '["analisis financiero","conciliacion","cierre contable","presupuesto"]', 3],
  [1, 1, 'weighted', 'technical', 'Excel avanzado', 'Fórmulas, tablas dinámicas, búsquedas', 25, '["excel","buscarx","tabla dinamica","sumar.si.conjunto"]', null],
  [1, 1, 'weighted', 'technical', 'Conocimiento tributario local', 'Declaraciones y normativa del SRI', 20, '["tributacion","sri","impuestos"]', null],
  [1, 1, 'weighted', 'competency', 'Comunicación con otras áreas', 'Reportes y trabajo con Tesorería y Compras', 15, '["comunicacion","reportes","colaboracion"]', null],
  [1, 1, 'weighted', 'other', 'Herramientas de BI', 'Power BI o similar', 15, '["power bi","tableau","looker"]', null],
  // Vacante 2
  [2, 2, 'mandatory', 'experience', 'Experiencia en venta consultiva B2B', 'Venta a empresas, no retail', 0, '["ventas b2b","venta consultiva","corporativo"]', 2],
  [2, 2, 'weighted', 'experience', 'Cumplimiento de metas comerciales', 'Historial verificable de cuota', 35, '["metas","cuota","cumplimiento"]', 2],
  [2, 2, 'weighted', 'technical', 'Manejo de CRM', 'Registro y seguimiento de oportunidades', 20, '["crm","salesforce","hubspot","pipedrive"]', null],
  [2, 2, 'weighted', 'competency', 'Negociación', 'Cierre y manejo de objeciones', 25, '["negociacion","cierre","objeciones"]', null],
  [2, 2, 'weighted', 'other', 'Conocimiento del mercado Costa', 'Cartera y relacionamiento local', 20, '["guayaquil","costa","region costa"]', null],
  // Vacante 3
  [3, 3, 'mandatory', 'technical', 'SQL', 'Consultas y modelado básico', 0, '["sql","postgresql","mysql"]', null],
  [3, 3, 'weighted', 'technical', 'Visualización de datos', 'Power BI o Tableau', 40, '["power bi","tableau","looker"]', null],
  [3, 3, 'weighted', 'experience', 'Automatización de reportes', 'Experiencia con datos de negocio', 30, '["automatizacion","etl","reportes"]', 1],
  [3, 3, 'weighted', 'competency', 'Comunicación de hallazgos', 'Traducir datos a decisiones', 30, '["comunicacion","storytelling","presentaciones"]', null]
]
for (const c of criteria) {
  ins('job_criteria', ['org_id', 'job_id', 'kind', 'category', 'label', 'description', 'weight', 'keywords', 'min_years'], c)
}

/* ---------------- etapas ---------------- */
const stageNames = ['Nueva postulación', 'Revisión', 'Evaluación inicial', 'Prueba técnica', 'Entrevista', 'Referencias', 'Oferta', 'Contratado', 'Reserva (talento)', 'Descartado']
const stageKind = (n) => n === 'Contratado' ? 'hired' : n === 'Descartado' ? 'rejected' : n === 'Reserva (talento)' ? 'talent_pool' : 'normal'
for (const j of jobs) {
  stageNames.forEach((n, i) => {
    ins('job_stages', ['org_id', 'job_id', 'name', 'position', 'kind'], [1, j.id, n, i, stageKind(n)])
  })
}

/* ---------------- candidatos ficticios ---------------- */
const candidates = [
  { id: 1, name: 'María José Andrade', email: 'maria.andrade@example.com', phone: '0991234567', loc: 'Quito', years: 6, headline: 'Contadora pública con experiencia en NIIF y cierre contable', consent: 'granted', summary: 'Contadora con 6 años en empresas comerciales. Cierre contable mensual, conciliaciones bancarias y reportes gerenciales bajo NIIF.' },
  { id: 2, name: 'Carlos Zambrano', email: 'carlos.zambrano@example.com', phone: '0987654321', loc: 'Guayaquil', years: 4, headline: 'Analista financiero · Excel avanzado y Power BI', consent: 'granted', summary: 'Analista con foco en automatización de reportes. Construyó tableros en Power BI para el área comercial.' },
  { id: 3, name: 'Andrea Ponce', email: 'andrea.ponce@example.com', phone: '0991112233', loc: 'Quito', years: 8, headline: 'Jefa de contabilidad · NIIF y tributación', consent: 'granted', summary: 'Supervisión de equipos contables, auditorías externas y cumplimiento tributario.' },
  { id: 4, name: 'Jorge Villacís', email: 'jorge.villacis@example.com', phone: '0994445566', loc: 'Ambato', years: 2, headline: 'Asistente contable en transición', consent: 'pending', summary: 'Dos años en registro contable y conciliaciones básicas. Busca crecer en análisis financiero.' },
  { id: 5, name: 'Gabriela Torres', email: 'gabriela.torres@example.com', phone: '0982223344', loc: 'Guayaquil', years: 5, headline: 'Ejecutiva comercial B2B · cartera corporativa', consent: 'granted', summary: 'Gestión de cartera de 40 clientes corporativos en la Costa, con cumplimiento sostenido de cuota.' },
  { id: 6, name: 'Ricardo Mendoza', email: 'ricardo.mendoza@example.com', phone: '0995556677', loc: 'Guayaquil', years: 7, headline: 'Key Account Manager · venta consultiva', consent: 'granted', summary: 'Negociación de contratos anuales y desarrollo de nuevos segmentos.' },
  { id: 7, name: 'Paola Cedeño', email: 'paola.cedeno@example.com', phone: '0987778899', loc: 'Manta', years: 3, headline: 'Ejecutiva de ventas retail en transición a B2B', consent: 'granted', summary: 'Ventas en tienda y atención al cliente. Busca moverse a venta corporativa.' },
  { id: 8, name: 'Esteban Ruiz', email: 'esteban.ruiz@example.com', phone: '0993334455', loc: 'Quito', years: 4, headline: 'Analista de datos · SQL y Power BI', consent: 'granted', summary: 'Modelado de datos y tableros para operaciones. Automatización de reportes con SQL.' },
  { id: 9, name: 'Daniela Mora', email: 'daniela.mora@example.com', phone: '0981112244', loc: 'Quito', years: 3, headline: 'Analista BI · Tableau y Python', consent: 'granted', summary: 'Análisis exploratorio y visualización. Python para limpieza de datos.' },
  { id: 10, name: 'Sofía Alvarado', email: 'sofia.alvarado@example.com', phone: '0996667788', loc: 'Cuenca', years: 9, headline: 'Auditora financiera · NIIF y control interno', consent: 'granted', summary: 'Auditoría externa en firma internacional. Transición al sector corporativo.' },
  { id: 11, name: 'Marco Benítez', email: 'marco.benitez@example.com', phone: '0983331144', loc: 'Loja', years: 1, headline: 'Egresado de administración', consent: 'revoked', summary: 'Sin experiencia formal relevante. Revocó su consentimiento: no contactar.' },
  { id: 12, name: 'Lucía Espinoza', email: 'lucia.espinoza@example.com', phone: '0998889900', loc: 'Quito', years: 5, headline: 'Especialista en tributación y SRI', consent: 'granted', summary: 'Declaraciones mensuales, defensa en requerimientos y planificación fiscal.' },
  { id: 13, name: 'Fernando Ochoa', email: 'fernando.ochoa@example.com', phone: '0984443322', loc: 'Guayaquil', years: 6, headline: 'Supervisor de logística · cadena de suministro', consent: 'granted', summary: 'Gestión de inventarios y distribución en la Costa. Habilidades transferibles de análisis de costos.' },
  { id: 14, name: 'Camila Reyes', email: 'camila.reyes@example.com', phone: '0992221100', loc: 'Quito', years: 2, headline: 'Asistente administrativa con Excel intermedio', consent: 'granted', summary: 'Reportes operativos y control de gastos.' }
]
for (const c of candidates) {
  ins('candidates', ['id', 'org_id', 'full_name', 'email', 'phone', 'location', 'country', 'headline', 'summary',
    'years_experience', 'availability', 'salary_expectation', 'source', 'consent_status', 'consent_basis',
    'consent_date', 'do_not_contact', 'is_demo'], [
    c.id, 1, c.name, c.email, c.phone, c.loc, 'EC', c.headline, c.summary, c.years,
    c.id % 3 === 0 ? '30 días' : 'inmediata', 1200 + c.years * 150, c.id <= 8 ? 'postulacion' : 'importacion',
    c.consent, c.consent === 'granted' ? 'Consentimiento del titular para procesos de selección' : null,
    c.consent === 'granted' ? '2026-09-10T10:00:00Z' : null, c.consent === 'revoked' ? 1 : 0, 1
  ])
}

const skillsByCandidate = {
  1: [['contabilidad', 5, 6, 1], ['niif', 4, 5, 1], ['excel', 4, 6, 0], ['conciliacion', 5, 6, 0], ['power bi', 3, 2, 0], ['tributacion', 3, 3, 0]],
  2: [['excel', 5, 4, 1], ['power bi', 4, 3, 1], ['analisis financiero', 4, 4, 0], ['sql', 3, 2, 0], ['presupuesto', 3, 3, 0]],
  3: [['contabilidad', 5, 8, 1], ['niif', 5, 7, 1], ['tributacion', 4, 6, 0], ['auditoria', 4, 5, 0], ['excel', 4, 8, 0]],
  4: [['excel', 3, 2, 0], ['conciliacion', 3, 2, 0], ['contabilidad', 3, 2, 0]],
  5: [['ventas b2b', 4, 5, 1], ['negociacion', 4, 5, 1], ['crm', 4, 4, 0], ['metas', 4, 5, 0]],
  6: [['venta consultiva', 5, 7, 1], ['negociacion', 5, 7, 0], ['crm', 4, 5, 1], ['metas', 5, 7, 0]],
  7: [['ventas', 3, 3, 0], ['atencion al cliente', 4, 3, 0], ['excel', 2, 2, 0]],
  8: [['sql', 4, 4, 1], ['power bi', 4, 3, 1], ['python', 3, 2, 0], ['automatizacion', 3, 3, 0]],
  9: [['tableau', 4, 3, 1], ['python', 4, 3, 0], ['sql', 3, 3, 0], ['power bi', 3, 2, 0]],
  10: [['auditoria', 5, 9, 1], ['niif', 5, 8, 1], ['control interno', 4, 7, 0], ['excel', 4, 9, 0]],
  11: [['excel', 2, 1, 0]],
  12: [['tributacion', 5, 5, 1], ['sri', 5, 5, 1], ['contabilidad', 4, 5, 0], ['excel', 3, 5, 0]],
  13: [['logistica', 4, 6, 0], ['cadena de suministro', 4, 6, 0], ['inventarios', 4, 5, 0], ['excel', 4, 6, 1]],
  14: [['excel', 3, 2, 0], ['atencion al cliente', 3, 2, 0]]
}
for (const [cid, list] of Object.entries(skillsByCandidate)) {
  for (const [name, level, years, verified] of list) {
    ins('candidate_skills', ['org_id', 'candidate_id', 'name', 'level', 'years', 'source', 'verified'], [
      1, Number(cid), name, level, years, verified ? 'prueba' : 'declarado', verified
    ])
  }
}

const expByCandidate = {
  1: [['Analista contable senior', 'Comercial Andina Cía. Ltda.', '2021-03-01', null, 1, 'Cierre contable mensual, conciliaciones bancarias y reportes bajo NIIF.']],
  2: [['Analista financiero', 'Distribuidora del Pacífico', '2022-06-01', null, 1, 'Reportes gerenciales y automatización en Power BI.']],
  3: [['Jefa de contabilidad', 'Grupo Sierra', '2019-01-01', null, 1, 'Supervisión de 5 personas, auditoría externa y cumplimiento tributario.']],
  4: [['Asistente contable', 'Servicios Contables Quito', '2023-02-01', null, 1, 'Registro de facturación y conciliaciones básicas.']],
  5: [['Ejecutiva comercial', 'Corporación Litoral', '2021-04-01', null, 1, 'Cartera de 40 clientes corporativos en la Costa.']],
  6: [['Key Account Manager', 'Soluciones Industriales S.A.', '2018-08-01', null, 1, 'Negociación de contratos anuales y desarrollo de cuentas clave.']],
  7: [['Asesora de ventas', 'Retail Manta', '2023-01-01', null, 1, 'Ventas en tienda, atención al cliente y postventa.']],
  8: [['Analista de datos', 'TechAndes', '2022-03-01', null, 1, 'Modelado de datos y tableros en Power BI para operaciones.']],
  9: [['Analista BI', 'DataSur', '2023-05-01', null, 1, 'Tableros en Tableau y análisis exploratorio con Python.']],
  10: [['Auditora senior', 'Firma Auditores Asociados', '2017-01-01', null, 1, 'Auditoría de estados financieros bajo NIIF.']],
  11: [['Practicante administrativo', 'Municipio de Loja', '2025-01-01', '2025-07-01', 0, 'Apoyo administrativo.']],
  12: [['Especialista tributaria', 'Consultores Tributarios EC', '2020-02-01', null, 1, 'Declaraciones y atención de requerimientos del SRI.']],
  13: [['Supervisor de logística', 'Importadora Costa', '2019-09-01', null, 1, 'Inventarios, distribución y control de costos de transporte.']],
  14: [['Asistente administrativa', 'Servicios Generales Quito', '2024-01-01', null, 1, 'Control de gastos y reportes operativos.']]
}
for (const [cid, list] of Object.entries(expByCandidate)) {
  for (const e of list) {
    ins('candidate_experiences', ['org_id', 'candidate_id', 'title', 'company', 'start_date', 'end_date', 'is_current', 'description'], [1, Number(cid), ...e])
  }
}

const eduByCandidate = {
  1: [['Contabilidad y Auditoría', 'Pontificia Universidad Católica del Ecuador', 'Tercer nivel', 2018]],
  2: [['Finanzas', 'Universidad de Guayaquil', 'Tercer nivel', 2020]],
  3: [['Contabilidad y Auditoría', 'Universidad Central del Ecuador', 'Tercer nivel', 2015]],
  4: [['Tecnología en Contabilidad', 'Instituto Tecnológico Superior', 'Tecnología', 2022]],
  5: [['Administración de Empresas', 'Universidad Católica de Santiago de Guayaquil', 'Tercer nivel', 2019]],
  6: [['Ingeniería Comercial', 'ESPOL', 'Tercer nivel', 2016]],
  7: [['Marketing', 'Universidad Laica Eloy Alfaro', 'Tercer nivel', 2022]],
  8: [['Ingeniería en Sistemas', 'Escuela Politécnica Nacional', 'Tercer nivel', 2021]],
  9: [['Estadística', 'Universidad Central del Ecuador', 'Tercer nivel', 2022]],
  10: [['CPA', 'Universidad de Cuenca', 'Tercer nivel', 2014]],
  11: [['Administración', 'Universidad Nacional de Loja', 'Tercer nivel', 2025]],
  12: [['Tributación', 'Universidad Andina Simón Bolívar', 'Cuarto nivel', 2019]],
  13: [['Logística y Transporte', 'Universidad de Guayaquil', 'Tercer nivel', 2017]],
  14: [['Administración', 'Instituto Superior Quito', 'Tecnología', 2023]]
}
for (const [cid, list] of Object.entries(eduByCandidate)) {
  for (const e of list) {
    ins('candidate_education', ['org_id', 'candidate_id', 'program', 'institution', 'level', 'year'], [1, Number(cid), ...e])
  }
}

/* ---------------- postulaciones + eventos ---------------- */
// stage ids: job1 → 1..10, job2 → 11..20, job3 → 21..30
const apps = [
  { id: 1, job: 1, cand: 1, stage: 5, source: 'postulacion', days: 21, status: 'active' },
  { id: 2, job: 1, cand: 2, stage: 4, source: 'postulacion', days: 18, status: 'active' },
  { id: 3, job: 1, cand: 4, stage: 10, source: 'postulacion', days: 25, status: 'rejected', reason: 'Experiencia insuficiente' },
  { id: 4, job: 1, cand: 10, stage: 5, source: 'referido', days: 12, status: 'active' },
  { id: 5, job: 1, cand: 12, stage: 3, source: 'importacion', days: 9, status: 'active' },
  { id: 6, job: 2, cand: 5, stage: 15, source: 'postulacion', days: 14, status: 'active' },
  { id: 7, job: 2, cand: 6, stage: 17, source: 'referido', days: 20, status: 'active' },
  { id: 8, job: 2, cand: 7, stage: 12, source: 'postulacion', days: 6, status: 'active' },
  { id: 9, job: 2, cand: 13, stage: 10 + 10, source: 'postulacion', days: 30, status: 'rejected', reason: 'No cumple requisitos excluyentes' }
]
for (const a of apps) {
  const applied = `datetime('now','-${a.days} days')`
  stmts.push(`INSERT INTO applications (id, org_id, job_id, candidate_id, stage_id, status, source, owner_id, applied_at, updated_at, last_activity_at, rejection_reason)
    VALUES (${a.id},1,${a.job},${a.cand},${a.stage},'${a.status}','${a.source}',2,${applied},${applied},${a.days > 7 ? `datetime('now','-${a.days - 3} days')` : applied},${a.reason ? q(a.reason) : 'NULL'});`)
  stmts.push(`INSERT INTO application_events (org_id, application_id, to_stage, action, actor_id, note, created_at) VALUES (1,${a.id},'Nueva postulación','created',2,'Postulación registrada',${applied});`)
  if (a.stage !== (a.job === 1 ? 1 : 11)) {
    stmts.push(`INSERT INTO application_events (org_id, application_id, from_stage, to_stage, action, actor_id, reason, created_at) VALUES (1,${a.id},'Nueva postulación','Revisión','stage_change',2,NULL,datetime('now','-${a.days - 2} days'));`)
  }
}

/* ---------------- notas ---------------- */
ins('notes', ['org_id', 'candidate_id', 'application_id', 'body', 'visibility', 'author_id'], [
  1, 1, 1, 'Entrevista inicial muy sólida en cierre contable. Confirmar disponibilidad para viajar a planta.', 'internal', 2
])
ins('notes', ['org_id', 'candidate_id', 'application_id', 'body', 'visibility', 'author_id'], [
  1, 2, 2, 'Trajo ejemplos concretos de automatización. Verificar nivel de SQL en la prueba técnica.', 'internal', 3
])
ins('notes', ['org_id', 'candidate_id', 'body', 'visibility', 'author_id'], [
  1, 6, 'Referido por el gerente comercial. Historial de cumplimiento consistente.', 'internal', 2
])

/* ---------------- pruebas ---------------- */
ins('assessments', ['id', 'org_id', 'title', 'type', 'job_id', 'description', 'instructions', 'duration_min', 'pass_score', 'version', 'status', 'created_by'], [
  1, 1, 'Excel intermedio — conciliación y análisis', 'mcq', 1,
  'Evalúa fórmulas, búsquedas y criterios de conciliación aplicados al cierre mensual.',
  'Responde las 6 preguntas. Puedes usar Excel como apoyo. Se evalúa exactitud del criterio, no la velocidad.',
  30, 70, 1, 'active', 4
])
ins('assessments', ['id', 'org_id', 'title', 'type', 'job_id', 'description', 'instructions', 'duration_min', 'pass_score', 'version', 'status', 'created_by'], [
  2, 1, 'Caso práctico — cierre contable con diferencia', 'written', 1,
  'Caso con una diferencia de 1.240 USD entre mayor y auxiliar.',
  'Explica el procedimiento de detección, las verificaciones y cómo documentarías el ajuste. Se califica con rúbrica.',
  45, 70, 1, 'active', 4
])

const q1 = [
  ['¿Qué función permite buscar un valor en la primera columna de una tabla y devolver otra columna?', ['BUSCARV / BUSCARX', 'SUMA', 'CONTAR.SI', 'IZQUIERDA'], 0],
  ['Al concatenar criterios en SUMAR.SI.CONJUNTO, ¿qué operador se usa para "mayor o igual que"?', ['">="', '"="', '"<>"', '"+"'], 0],
  ['Una tabla dinámica sirve principalmente para…', ['Resumir y agrupar grandes volúmenes de datos', 'Cambiar el formato de una celda', 'Crear macros', 'Proteger la hoja'], 0],
  ['En una conciliación bancaria, la diferencia entre saldo en libros y extracto puede originarse por…', ['Partidas en tránsito y cheques no cobrados', 'Un error de formato de fecha', 'El ancho de la columna', 'El color de la celda'], 0],
  ['¿Cuál fórmula cuenta celdas que cumplen dos condiciones?', ['CONTAR.SI.CONJUNTO', 'CONTAR', 'SUMA', 'PROMEDIO'], 0],
  ['Para limpiar espacios sobrantes en un texto se usa…', ['ESPACIOS o RECORTAR', 'REDONDEAR', 'TEXTO', 'ABS'], 0]
]
let qi = 1
for (const [prompt, options, correct] of q1) {
  ins('assessment_questions', ['id', 'org_id', 'assessment_id', 'prompt', 'kind', 'options', 'correct_index', 'points'], [
    qi++, 1, 1, prompt, 'mcq', JSON.stringify(options), correct, 1
  ])
}
ins('assessment_questions', ['org_id', 'assessment_id', 'prompt', 'kind', 'options', 'correct_index', 'points', 'rubric'], [
  1, 2, 'Describe cómo detectarías y documentarías la diferencia de 1.240 USD.', 'open', '[]', null, 10,
  'Exactitud (40%): identifica partidas en tránsito y errores de registro. Procedimiento (30%): pasos lógicos y verificables. Interpretación (20%): explica el impacto. Presentación (10%): documentación clara.'
])

/* intentos: mezcla de correctas para generar puntajes distintos */
function attemptAnswers(assessmentId, correctCount, total) {
  const a = {}
  for (let i = 1; i <= total; i++) a[i] = i <= correctCount ? 0 : 1
  return a
}
ins('attempts', ['id', 'org_id', 'assessment_id', 'candidate_id', 'application_id', 'answers', 'auto_score', 'max_score', 'final_score', 'status', 'assessment_version'], [
  1, 1, 1, 1, 1, JSON.stringify(attemptAnswers(1, 5, 6)), 5, 6, 5, 'graded', 1
])
ins('attempts', ['id', 'org_id', 'assessment_id', 'candidate_id', 'application_id', 'answers', 'auto_score', 'max_score', 'final_score', 'status', 'assessment_version'], [
  2, 1, 1, 2, 2, JSON.stringify(attemptAnswers(1, 6, 6)), 6, 6, 6, 'graded', 1
])
ins('attempts', ['id', 'org_id', 'assessment_id', 'candidate_id', 'application_id', 'answers', 'auto_score', 'max_score', 'final_score', 'status', 'assessment_version'], [
  3, 1, 2, 1, 1, JSON.stringify({ 7: 'Revisaría partidas en tránsito, cheques no cobrados y diferencias de registro. Documentaría cada partida con soporte y propondría el ajuste con aprobación.' }), 0, 10, null, 'review_required', 1
])

/* ---------------- entrevista + rúbrica ---------------- */
stmts.push(`INSERT INTO interviews (id, org_id, application_id, candidate_id, job_id, scheduled_at, duration_min, timezone, mode, interviewer_id, status, guide)
  VALUES (1,1,1,1,1,datetime('now','+2 days'),45,'America/Guayaquil','videollamada',3,'scheduled','1. Experiencia en cierre contable mensual.\n2. Caso: diferencia en conciliación bancaria.\n3. Trabajo con Tesorería y Compras.\n4. Expectativas y disponibilidad.');`)
stmts.push(`INSERT INTO interviews (id, org_id, application_id, candidate_id, job_id, scheduled_at, duration_min, timezone, mode, interviewer_id, status, guide)
  VALUES (2,1,6,5,2,datetime('now','-3 days'),45,'America/Guayaquil','presencial',3,'completed','1. Gestión de cartera corporativa.\n2. Negociación de contrato anual.\n3. Manejo de objeciones.');`)
ins('scorecards', ['org_id', 'interview_id', 'criterion', 'score', 'comment', 'author_id'], [1, 2, 'Conocimiento técnico del puesto', 4, 'Buen dominio de venta consultiva y ciclo de venta largo.', 3])
ins('scorecards', ['org_id', 'interview_id', 'criterion', 'score', 'comment', 'author_id'], [1, 2, 'Negociación', 5, 'Ejemplo concreto de renegociación de contrato con mejora de margen.', 3])
ins('scorecards', ['org_id', 'interview_id', 'criterion', 'score', 'comment', 'author_id'], [1, 2, 'Comunicación', 4, 'Clara y estructurada.', 3])

/* ---------------- solicitud de privacidad ---------------- */
ins('retention_requests', ['org_id', 'candidate_id', 'type', 'status', 'detail', 'assigned_to'], [
  1, 11, 'opposition', 'in_progress', 'El titular solicita no ser contactado en futuros procesos.', 2
])

/* ---------------- auditoría inicial ---------------- */
ins('audit_log', ['org_id', 'actor_id', 'actor_email', 'action', 'entity', 'entity_id', 'result', 'meta'], [
  1, 1, 'admin@quipu.demo', 'seed_demo_data', 'organizations', '1', 'ok', JSON.stringify({ note: 'Datos ficticios de demostración cargados' })
])

const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'seed.generated.sql'
const header = `-- QUIPU · datos ficticios de demostración (generado automáticamente)\n-- Todas las personas y empresas son inventadas. Password de demo: ${PASSWORD}\nPRAGMA foreign_keys = OFF;\n`
writeFileSync(out, header + stmts.join('\n') + '\n')
console.log(`Generado ${out} con ${stmts.length} sentencias.`)
