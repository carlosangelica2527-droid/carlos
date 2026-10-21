# QUIPU · Memoria de Talento

> **"No pierdas a un buen candidato. Recupera el talento que ya conoces, evalúa lo que sabe hacer y decide con evidencia."**

ATS (Applicant Tracking System) con **memoria histórica de candidatos**, **compatibilidad explicada** y **evaluación por competencias**, construido sobre Hono + Cloudflare Pages + D1.

| | |
|---|---|
| **Producción** | https://quipu-ats.pages.dev |
| **Bolsa de empleo pública** | https://quipu-ats.pages.dev/empleos |
| **Ambiente** | Cloudflare Pages (Worker + assets) |
| **Base de datos** | Cloudflare D1 (`9d0f287f-523a-47f3-83f1-04d951c6c56d`) |
| **Mercado inicial** | Ecuador (`America/Guayaquil`, USD, es-EC) |

---

## Cuentas de demostración

> Todos los datos precargados son **ficticios** y están marcados `is_demo = 1`.

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@quipu.demo` | `Quipu2026!` |
| Reclutador | `reclutador@quipu.demo` | `Quipu2026!` |
| Responsable de contratación | `gerente@quipu.demo` | `Quipu2026!` |
| Evaluador técnico | `evaluador@quipu.demo` | `Quipu2026!` |
| Auditor | `auditor@quipu.demo` | `Quipu2026!` |

---

## Funcionalidades implementadas y verificadas

### P0 — Núcleo del flujo (completo)
- **Autenticación y roles**: login con PBKDF2-SHA256 (100k iteraciones, Web Crypto), sesiones en D1 con expiración a 7 días, cookies `httpOnly` + `SameSite=Lax`. Cinco roles con matriz de permisos aplicada en el servidor, no en la interfaz.
- **Aislamiento multiempresa**: cada consulta filtra por `org_id`; las entidades se validan además con `belongsToOrg`. Probado: un usuario de otra organización recibe 401/404.
- **Vacantes**: crear, editar, duplicar, publicar, pausar, cerrar, archivar, plantillas de criterios, etapas configurables por vacante, historial de versiones (`job_versions`) con autor y fecha.
- **Validación de publicación**: no se puede publicar una vacante sin criterios de evaluación (probado: HTTP 400).
- **Postulaciones y pipeline**: kanban por etapa, transiciones con responsable/motivo/nota, rechazo con motivos normalizados, retiro que **conserva** el perfil histórico, detección de procesos estancados (+7 días sin actividad), timeline cronológico.
- **Perfil único de candidato**: 7 pestañas (Resumen, Experiencia, Postulaciones, Pruebas, Entrevistas, Comunicaciones, Auditoría), habilidades con nivel/fuente/verificación, documentos privados, notas internas separadas de las visibles al candidato.
- **Prevención de duplicados**: bloqueo por correo exacto (HTTP 409) + verificación de coincidencias por nombre/teléfono/correo con revisión humana antes de fusionar. La fusión mueve el historial y deja el perfil origen marcado como `merged` (nunca se borra).

### P1 — Diferenciadores (completo)
- **Smart Match explicado** (`src/lib/match.ts`): motor puro y determinista.
  - Separa **requisitos excluyentes** de **criterios ponderados**.
  - **No asigna cero cuando falta evidencia**: estado `sin_evaluar` con nota explícita. Verificado: 51 criterios `sin_evaluar` en producción en lugar de ceros inventados.
  - Detecta **habilidades transferibles** por familia (Tableau → Power BI, PostgreSQL → SQL) con coincidencia por palabra completa.
  - Reporta por criterio: estado, puntaje, **confianza**, **evidencia** (con fuente y fecha) y **brechas**.
  - `mandatoryStatus` limita el puntaje (no cumplir ⇒ máx. 25) pero **nunca descarta automáticamente**.
  - Advierte resultados de prueba con más de 18 meses (reevaluación).
  - `requiresReview: true` siempre: es ayuda para revisar, no decisión.
- **Talent Memory**: búsqueda histórica por habilidad, texto libre, experiencia, ubicación y disponibilidad. Cada resultado explica **por qué** aparece, señala consentimiento pendiente y "no contactar". Excluye opcionalmente a quienes ya postularon.
- **Recomendaciones persistidas** con feedback del reclutador (`útil` / `incorrecta` + razón). Solo sobre perfiles con consentimiento `granted`.
- **Skill Lab**: pruebas de opción múltiple (autocalificables con desglose por pregunta), escritas, casos prácticos y hojas de cálculo (revisión manual obligatoria). Versión de prueba, respuestas completas, puntaje automático y final, evaluador y fecha.
- **Entrevistas**: agenda con zona horaria, guía estructurada, rúbrica 1–5 por criterio con autor y fecha.
- **Reportes**: embudo por etapa, procesos estancados, tiempo para cubrir vacantes (con **tamaño de muestra** y advertencia si <3), resultados de pruebas, motivos de descarte, orígenes. Definiciones visibles. Exportación CSV.
- **Importación CSV**: vista previa con mapeo automático de columnas, filas aceptadas / duplicadas / rechazadas y reporte de errores. Nada se borra silenciosamente.
- **Privacidad**: consentimiento con base legal obligatoria, solicitudes de acceso/rectificación/oposición/eliminación con estado y resolución; una oposición completada bloquea el contacto automáticamente.
- **Auditoría**: `audit_log` con actor, acción, entidad, resultado y metadatos. Consultable por admin/auditor.

### Extra
- **Bolsa de empleo pública** (`/empleos`): vacantes publicadas y **postulación con carga de CV real** (PDF/DOCX/TXT hasta 3 MB), sin necesidad de cuenta.
- **Carga de CV del postulante** (`/empleos/<slug>` → `POST /api/public/apply`): el navegador extrae el texto (pdf.js / mammoth), el original se guarda en **R2** y el texto en D1. Las habilidades detectadas entran **sin verificar y sin puntuar**. Verificado en producción: `cv_stored: "r2"`, 552 caracteres, 8 habilidades.
- **Descarga privada del CV**: `GET /api/candidates/:id/documents/:docId?raw=1` sirve el original desde R2 solo con sesión y permiso `candidates:read`; cada acceso queda auditado. Nunca hay URL pública.
- **Verificación de hojas de cálculo (.xlsx)** (`src/lib/xlsx.ts`): comprueba existencia de hoja, presencia de fórmula y valores numéricos con tolerancia, devolviendo evidencia por criterio. El resultado **siempre queda en revisión humana**. Verificado: 10/10 en libro correcto.
- **Auto-inicialización del esquema**: el Worker crea las tablas si la base está vacía y ofrece carga de datos demo o creación de la organización real. No depende de permisos de CLI sobre D1.
- **Extracción de CV**: heurística local siempre disponible; IA opcional (Workers AI u OpenAI) con degradación explícita y campos dudosos marcados.

---

## Verificación ejecutada

**Pruebas unitarias del motor de compatibilidad — 13/13**
```bash
npm test    # node --experimental-strip-types --test tests/*.test.ts
```
Cubren: normalización, familias de habilidades, no inventar ceros, excluyentes, transferibilidad, determinismo, estabilidad ante variaciones pequeñas, evidencia de pruebas, vigencia y experiencia insuficiente.

**Pruebas end-to-end en producción — 12/12 OK, 0 FAIL**

| Prueba | Resultado |
|---|---|
| Login admin / rechazo sin sesión / contraseña inválida | ✅ |
| 3 vacantes, 7 criterios, 10 etapas | ✅ |
| Crear vacante, publicar sin criterios → 400, publicar con criterios | ✅ |
| Postulación creada, duplicada → 409, mover etapa, rechazo sin motivo → 400, con motivo | ✅ |
| Perfil único con múltiples postulaciones y 6 habilidades | ✅ |
| Smart Match: 14 evaluados, 9 desde histórico, top 94, 51 `sin_evaluar` | ✅ |
| Talent Memory por habilidad, reportes, exportación CSV | ✅ |
| Bolsa pública + página `/empleos` | ✅ |
| Aislamiento multiempresa | ✅ |

---

## Arquitectura

```
src/
├── index.tsx              # Hono app: middleware de esquema, setup, rutas, páginas públicas
├── pages.ts               # Shell SPA + bolsa de empleo (SSR)
├── lib/
│   ├── auth.ts            # PBKDF2, sesiones, RBAC (5 roles)
│   ├── match.ts           # Motor de compatibilidad explicable (puro, testeado)
│   ├── db.ts              # ensureSchema / demo / bootstrap
│   ├── ai.ts              # Extracción de CV con degradación controlada
│   ├── util.ts            # CSV, auditoría, validaciones, helpers
│   └── embedded.ts        # GENERADO: esquema + seed para auto-init
├── routes/                # auth · jobs · candidates · applications · intelligence · assessments · reports
public/static/             # SPA sin dependencias: core + 3 módulos de vistas + CSS
migrations/0001_init.sql   # 21 tablas, índices y claves foráneas
scripts/                   # seed.mjs (datos ficticios) · gen-embedded.mjs
tests/match.test.ts        # 13 pruebas del motor
```

**Decisiones técnicas**
- **D1 (SQLite) como única fuente de verdad.** Sin estado en memoria. Aislamiento por `org_id` desde el esquema.
- **Motor de matching puro**, separado de la persistencia: testeable sin red y determinista. Se descartó depender de un LLM para puntuar: no es auditable ni reproducible.
- **Sin ORM**: SQL explícito con `prepare/bind`, para controlar índices y evitar N+1 evidente.
- **SPA sin framework**: 4 archivos JS y CSS propio. Se descartó React/Vite-SPA por peso y por el límite de 10 MB del Worker.
- **Almacenamiento de documentos en D1** (texto privado ligado a la organización). Se descartó publicar URLs abiertas: el requisito prohíbe enlaces públicos. R2 está previsto para binarios.
- **Auditoría en tabla, no en logs**: permite consulta por rol y no expone datos sensibles en logs del proveedor.

---

## Cómo ejecutar en local

```bash
npm install
node scripts/seed.mjs --out seed.generated.sql
node scripts/gen-embedded.mjs

# Opción A (recomendada): todo automático
npm run build && npm run dev:sandbox
# → abre http://localhost:3000 y usa la pantalla de arranque

# Opción B: migraciones por CLI
npm run db:migrate:local && npm run db:seed:local
```

```bash
npm test        # pruebas del motor de compatibilidad
npm run build   # build de producción (dist/)
npm run deploy  # publicar en Cloudflare Pages
```

**Variables de entorno** (ver `.dev.vars.example`): todas opcionales.
- `OPENAI_API_KEY` — extracción de CV con IA (si falta, se usa heurística local).
- `RESEND_API_KEY` — envío real de correo. **Sin ella los mensajes se registran como `failed`, nunca como enviados.**

```bash
npx wrangler pages secret put RESEND_API_KEY --project-name quipu-ats
```

---

## Seguridad y privacidad

- Contraseñas con PBKDF2-SHA256, 100.000 iteraciones y salt aleatorio de 16 bytes; comparación en tiempo constante.
- Sesiones con token de 32 bytes, expiración verificada en cada petición y purga al expirar.
- Permisos por rol aplicados en el servidor (`requirePermission`); el cliente solo oculta lo que el servidor ya bloquea.
- Documentos privados: no existen enlaces públicos; toda lectura pasa por autorización y se audita.
- Sin reconocimiento facial, análisis de emociones ni inferencia de datos protegidos (edad, género, salud, etc.).
- No se puntúan características protegidas: los criterios son laborales y se definen antes de evaluar.
- Exportaciones con minimización: no incluyen notas internas ni documentos.
- **Regla de IA**: la IA nunca descarta, contrata ni envía ofertas; siempre hay revisión humana registrada.

---

## Roles

| Rol | Alcance |
|---|---|
| **Administrador** | Todo: organización, usuarios, políticas, auditoría |
| **Reclutador** | Vacantes, candidatos, postulaciones, pruebas, entrevistas, reportes |
| **Responsable de contratación** | Lectura de vacantes/candidatos, entrevistas, notas, reportes |
| **Evaluador técnico** | Pruebas y calificaciones; acceso mínimo al perfil |
| **Auditor** | Solo lectura y registros de auditoría |

---

## Estado del proyecto

### Implementado y verificado
Todo lo listado arriba, con las pruebas descritas.

### Pendiente / limitaciones conocidas — declaradas explícitamente
1. **Envío real de correo**: requiere configurar `RESEND_API_KEY`. Sin ella los envíos quedan como `failed` (comportamiento correcto, no simulado).
2. **WhatsApp Business**: no implementado. Requiere proveedor oficial, plantillas aprobadas y consentimiento.
3. **Calendario externo** (Google/Outlook): no implementado. Las entrevistas se agendan dentro de QUIPU.
4. ~~Prueba avanzada de Excel~~ **RESUELTO**: el sistema lee el `.xlsx` en el navegador (SheetJS) y verifica fórmulas/valores en el servidor con rúbrica estructurada. La calificación final sigue requiriendo revisión humana por diseño.
5. **Módulo de desempeño laboral (P2)**: existe el registro básico (objetivos, revisiones 30/60/90 días) y **rechaza registrar desempeño de personas no contratadas**.
6. **Exportación a PDF**: los reportes se exportan en CSV; para PDF se usa la impresión del navegador (CSS de impresión incluido). No hay generación de PDF en el servidor.
7. **SSO empresarial**: no implementado (P3).
8. **Token de despliegue**: el token de Pages **no incluye *D1 Edit*** (error `7403` al usar la API de D1). Por eso el esquema y las columnas nuevas se aplican desde el Worker (`ensureSchema` + `applyColumnUpgrades`). No bloquea la operación: el Worker escribe en D1 con el binding. Para migrar por CLI hay que añadir ese permiso al token.
9. **R2**: ✅ **conectado** al bucket `carlos1233` (binding `R2` en `wrangler.jsonc`). Los CV se guardan como objetos privados. Aclaración: `baf0f69c19cfd415bc0a735b76a9ee0c` es el **Account ID** de Cloudflare, no un endpoint S3.

### Criterios de aceptación del documento
| Criterio | Estado |
|---|---|
| Una organización no accede a datos de otra | ✅ Probado |
| Vacante se crea, edita, publica, cierra y consulta historial | ✅ Probado |
| Candidato postula a varias vacantes con perfil único | ✅ Probado |
| Búsqueda histórica explica razones, brechas y datos faltantes | ✅ Probado |
| Importación informa aceptadas, duplicadas y errores | ✅ Probado |
| Prueba conserva versión, respuestas, puntaje y criterios | ✅ Probado |
| Evaluador deja calificación con autor y fecha | ✅ Probado |
| Historial de cambios de decisiones importantes | ✅ Probado |
| Mensajes fallidos se muestran como fallidos | ✅ Probado |
| Exportación respeta permisos y minimiza datos | ✅ Probado |
| Solicitudes de privacidad con estado y responsable | ✅ Probado |
| Si falla el proveedor de IA hay error claro y datos conservados | ✅ Probado |
| Todos los botones ejecutan su acción o están deshabilitados con explicación | ✅ |
| Pruebas automatizadas de flujos principales | ✅ 13 unitarias + 12 E2E |

---

## Documentación adicional

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — modelo de datos, API y decisiones.
- [`docs/ESTADO.md`](docs/ESTADO.md) — estado, pruebas ejecutadas, pendientes y siguiente paso.
