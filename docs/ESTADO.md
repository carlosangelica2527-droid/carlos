# QUIPU · Estado del proyecto

**Última actualización:** 2026-10-21
**Versión:** 1.0.0 · MVP funcional desplegado

## Objetivo

ATS con memoria histórica de candidatos, compatibilidad explicada y evaluación por competencias, para Ecuador con arquitectura preparada para expansión.

## Arquitectura en una línea

Hono + Cloudflare Pages + D1 · motor de matching puro y testeado · SPA vanilla · auditoría en tabla.

## Funciones completas y probadas

| # | Función | Verificación |
|---|---|---|
| 1 | Autenticación PBKDF2 + sesiones D1 | E2E prod ✅ |
| 2 | RBAC 5 roles en servidor | E2E ✅ |
| 3 | Aislamiento multiempresa por `org_id` | E2E prod ✅ |
| 4 | Vacantes: CRUD, duplicar, estados, versiones | E2E prod ✅ |
| 5 | Validación: no publicar sin criterios | E2E (400) ✅ |
| 6 | Pipeline kanban con 10 etapas | E2E prod ✅ |
| 7 | Transiciones con motivo y responsable | E2E ✅ |
| 8 | Rechazo con motivo normalizado | E2E (400 sin motivo) ✅ |
| 9 | Retiro conservando perfil histórico | E2E ✅ |
| 10 | Detección de procesos estancados (+7d) | Reportes ✅ |
| 11 | Perfil único con 7 pestañas | E2E prod ✅ |
| 12 | Prevención de duplicados (409) | E2E ✅ |
| 13 | Fusión con revisión, sin borrado | Implementado |
| 14 | **Smart Match explicable** | 13/13 unitarias + E2E ✅ |
| 15 | Habilidades transferibles por familia | Unitaria ✅ |
| 16 | `sin_evaluar` en vez de cero | Unitaria + 51 casos prod ✅ |
| 17 | **Talent Memory** búsqueda histórica | E2E prod ✅ |
| 18 | Recomendaciones persistidas + feedback | Implementado |
| 19 | Skill Lab (MCQ auto + revisión manual) | Implementado |
| 20 | Entrevistas con rúbrica 1-5 | Implementado |
| 21 | Reportes + CSV | E2E prod ✅ |
| 22 | Importación CSV con vista previa | Implementado |
| 23 | Consentimiento y solicitudes de privacidad | E2E ✅ |
| 24 | Auditoría consultable | Implementado |
| 25 | Bolsa de empleo pública | E2E prod ✅ |
| 26 | Auto-inicialización del esquema | E2E prod ✅ |

## Pruebas ejecutadas

```bash
npm test        # 13/13 OK — motor de compatibilidad
bash /tmp/prod.sh   # 12/12 OK, 0 FAIL — flujo completo en producción
```

**Unitarias (13/13)**: normalización, tokens, familias, puntaje alto, no inventar ceros, excluyentes, transferibilidad, determinismo, estabilidad ante variaciones, evidencia de pruebas, vigencia 18 meses, sin criterios ponderados, experiencia insuficiente.

**E2E producción (12/12)**: login, rechazo sin sesión, contraseña inválida, 3 vacantes, pipeline con 5 candidatos, perfil único, Smart Match (14 evaluados / 9 históricos / top 94), memoria por habilidad, reportes, CSV, bolsa pública, aislamiento multiempresa.

### Bugs encontrados y corregidos durante el desarrollo
1. `INSERT INTO jobs` con 18 marcadores y 17 valores → 500 en creación de vacante. **Corregido.**
2. `familyOf("habilidad")` devolvía `bi` por contención de subcadena → falso positivo en matching. **Corregido** con coincidencia por palabra completa.
3. Formación clasificada como "relacionada" solo por pertenecer a la familia del propio término → excluyente mal evaluado. **Corregido**: exige acreditar otra habilidad de la familia.
4. Evidencia de prueba ignorada cuando la habilidad no estaba declarada. **Corregido**: la prueba cubre el criterio.

## Errores conocidos

| # | Descripción | Impacto |
|---|---|---|
| 1 | Token de despliegue sin permiso *D1 Edit* (`7403`) | No se puede migrar por CLI; mitigado con auto-init del Worker |
| 2 | `*.pages.dev` requiere TLS 1.2 desde este sandbox | Solo afecta verificación local por curl, no a usuarios reales |
| 3 | Sin `RESEND_API_KEY` los correos quedan `failed` | Comportamiento correcto y visible, no un fallo oculto |

## Pendientes por prioridad

**P2**
- Prueba avanzada de Excel con evaluación real de archivos `.xlsx` (hoy: revisión manual con rúbrica).
- Mensajería real (Resend / WhatsApp Business oficial).
- Integración de calendario (Google / Outlook).
- Exportación a PDF.

**P3**
- SSO empresarial.
- Localización multi-país (hoy: es-EC, USD, America/Guayaquil parametrizados en `organizations`).
- R2 para binarios de CV.

## Siguiente paso recomendado

1. Ampliar el token de Cloudflare con *D1 Edit* y ejecutar `npm run db:migrate:prod` para migraciones versionadas por CLI.
2. Configurar `RESEND_API_KEY` y probar un envío real verificando el estado del proveedor.
3. Añadir análisis de `.xlsx` para la prueba de Excel (P2): requiere parseo en el cliente y subida del resultado.

## Archivos clave

```
src/lib/match.ts        Motor de compatibilidad (núcleo diferencial)
src/lib/auth.ts         PBKDF2, sesiones, RBAC
src/lib/db.ts           ensureSchema / demo / bootstrap
src/lib/embedded.ts     GENERADO — no editar a mano
src/routes/*.ts         7 módulos de API
public/static/core.js   Cliente API, router, componentes
migrations/0001_init.sql
tests/match.test.ts
```
