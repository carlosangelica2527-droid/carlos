# QUIPU · Arquitectura y decisiones técnicas

## 1. Contexto y restricciones reales

Antes de elegir tecnología se inspeccionó el entorno:

| Restricción detectada | Consecuencia en el diseño |
|---|---|
| Cloudflare Workers: sin filesystem, sin procesos, sin `child_process` | Persistencia exclusiva en D1; nada de archivos locales |
| Límite de 10 MB comprimido por Worker | SPA en 4 archivos JS propios (~167 KB), sin React ni bundlers de UI |
| 10–30 ms de CPU por petición | Matching en O(n·m) con n≤500 y m≤25 criterios; sin ML en caliente |
| Token de despliegue sin permiso *D1 Edit* (`7403`) | El Worker inicializa su propio esquema (`ensureSchema`) |
| Sin proveedor de correo ni claves de IA configuradas | Degradación explícita, nunca simulación |

## 2. Stack

- **Hono 4** sobre **Cloudflare Pages** (Worker + assets estáticos)
- **Cloudflare D1** (SQLite) — 21 tablas, claves foráneas e índices
- **SPA vanilla**: `core.js` (cliente API, router, componentes), `views1-3.js`, `app.css`
- **Sin ORM**: SQL explícito con `prepare/bind`

### Alternativas descartadas y por qué
| Alternativa | Motivo del descarte |
|---|---|
| Next.js / SvelteKit | Sin despliegue de un clic; toolchain frágil; excede el límite de peso |
| PostgreSQL / Supabase | El requisito pide D1 del usuario; añade latencia y un servicio externo |
| LLM para puntuar candidatos | No es auditable ni determinista; el documento exige explicaciones verificables |
| ORM (Drizzle/Prisma) | La generación de SQL oculta los índices; el volumen no lo justifica |
| R2 para CV | Los CV llegan como texto pegado o CSV; D1 cubre el MVP. R2 queda para binarios |

## 3. Modelo de datos

```
organizations ──┬── users ── sessions
                ├── jobs ──┬── job_criteria      (mandatory | weighted)
                │          ├── job_stages         (pipeline configurable)
                │          ├── job_versions       (snapshot + autor)
                │          └── applications ──┬── application_events
                ├── candidates ──┬── candidate_skills      (nivel 1-5, fuente, verificado)
                │                ├── candidate_experiences
                │                ├── candidate_education
                │                ├── documents             (privado, ligado a org)
                │                └── notes                 (internal | candidate)
                ├── assessments ── assessment_questions ── attempts
                ├── interviews ── scorecards
                ├── recommendations      (factores JSON + feedback)
                ├── communications       (status: queued | sent | failed)
                ├── retention_requests   (access | rectification | opposition | deletion)
                ├── employee_performance (solo contratados)
                └── audit_log
```

**Aislamiento multiempresa**: `org_id` en toda entidad de negocio; cada consulta lo incluye en el `WHERE`. `belongsToOrg()` añade verificación de pertenencia antes de operar sobre un ID. Un usuario no puede alcanzar datos de otra organización ni manipulando IDs.

**Versionado**: `job_versions` guarda un snapshot completo (vacante + criterios + etapas) en cada guardado, con autor y fecha.

## 4. Motor de compatibilidad (`src/lib/match.ts`)

Módulo **puro**: sin red, sin D1, determinista. Recibe criterios + evidencia y devuelve factores explicados.

```
para cada criterio:
  experience + minYears → compara años, estados cumple/parcial/no_cumple
  education             → coincidencia de término; familia solo si acredita OTRA habilidad
  technical/competency  → 4 niveles de evidencia:
      1. habilidad registrada (nivel + verificado + años)   → confianza alta/media
      2. mención en experiencia declarada                   → parcial
      3. habilidad transferible de la misma familia         → parcial, confianza baja
      4. coincidencia parcial de tokens                     → parcial, confianza baja
  sin coincidencia       → busca prueba que cubra el criterio
  sin nada               → 'sin_evaluar' con score = null  (NUNCA 0)
```

Puntaje: media ponderada **solo sobre el peso evaluado**; `coverage` informa qué proporción se pudo evaluar.

Reglas de honestidad implementadas:
- `no_cumple` en excluyente ⇒ puntaje limitado a 25, `requiresReview: true`, sin descarte automático.
- `coverage < 0.4` ⇒ puntaje limitado a 55 y advertencia explícita.
- Pruebas con más de 18 meses ⇒ advertencia de reevaluación.
- Coincidencia por **palabra completa** (corrige el falso positivo `habilidad` ⊃ `bi` detectado en pruebas).

## 5. API principal

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/auth/login` · `/logout` | público |
| GET | `/api/setup/status` | público |
| POST | `/api/setup/demo` · `/api/setup/bootstrap` | solo base vacía |
| GET/POST/PATCH | `/api/jobs` · `/api/jobs/:id` | `jobs:read/write` |
| POST | `/api/jobs/:id/status` · `/duplicate` | `jobs:write` |
| GET | `/api/jobs/:id/pipeline` · `/versions` | `jobs:read` |
| GET | `/api/jobs/:id/matches` | `memory:read` |
| POST | `/api/jobs/:id/recommendations` | `memory:read` |
| GET/POST | `/api/candidates` · `/candidates/:id` | `candidates:read/write` |
| POST | `/api/candidates/check-duplicates` · `/merge` · `/import/preview` · `/import` | según rol |
| POST | `/api/cv/extract` | `candidates:write` |
| GET/POST | `/api/applications` · `/applications/:id` | `applications:read/write` |
| POST | `/api/applications/:id/move` · `/reject` · `/withdraw` · `/communicate` | `applications:write` |
| GET | `/api/memory/search` | `memory:read` |
| GET/POST | `/api/assessments` · `/assessments/:id/attempts` | `assessments:read/write` |
| POST | `/api/attempts/:id/review` | `assessments:write` |
| GET/POST | `/api/interviews` · `/interviews/:id/scorecards` | `interviews:read/write` |
| GET | `/api/reports/overview` · `/time-to-hire` · `/tests` · `/rejections` | `reports:read` |
| GET | `/api/reports/export.csv?what=applications\|jobs\|rejections` | `reports:read` |
| GET/POST/PATCH | `/api/privacy/requests` | `privacy:write` |
| GET | `/api/audit` | admin / auditor |
| GET | `/api/public/jobs` · `/public/jobs/:slug` | público |

## 6. Seguridad

- **Contraseñas**: PBKDF2-SHA256, 100.000 iteraciones, salt 16 bytes, comparación en tiempo constante.
- **Sesiones**: token de 32 bytes, expiración a 7 días verificada en cada petición, purga al expirar.
- **RBAC**: 5 roles con matriz de permisos evaluada en el servidor.
- **Cabeceras**: cookie `httpOnly`, `SameSite=Lax`, `secure` en HTTPS.
- **Documentos**: sin enlaces públicos; lectura autorizada y auditada.
- **Minimización**: la exportación excluye notas internas y documentos.
- **Auditoría**: cada acción relevante (login, cambios de etapa, consentimiento, exportación, fusión) queda en `audit_log`.

## 7. Operación

- **Auto-inicialización**: `ensureSchema` crea las 52 sentencias del esquema si `users` no existe; se ejecuta una vez por isolate.
- **Carga demo**: 200 sentencias en bloques de 40 (límite de batch de D1). Rechazada si la base tiene datos.
- **Migraciones**: `migrations/0001_init.sql` versionado; `npm run db:migrate:local|prod`.
- **Respaldo**: `npx wrangler d1 export quipu-db --remote --output backup-$(date +%F).sql`.
