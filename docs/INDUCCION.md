# Inducción a QUIPU · Memoria de Talento

Guía para empezar a usar la plataforma en una sesión de trabajo. QUIPU es un
ATS (seguimiento de candidatos) con **memoria de talento**: conserva el perfil
único de cada persona para no volver a empezar de cero en cada proceso.

---

## 1. Qué es y para quién

QUIPU está pensado para una **empresa de servicios de selección** que gestiona
procesos para varias empresas cliente.

- Cada **empresa cliente** es una *organización* con sus propios datos.
- Nada se mezcla: toda consulta filtra por `org_id`.
- Los datos de cada organización son invisibles para las demás, incluso para
  el mismo correo de usuario.

---

## 2. Entrar por primera vez

1. Abre `https://quipu-ats.pages.dev`
2. Si la base está vacía verás la pantalla **Preparar QUIPU**:
   - **Opción 1 – Demostración**: carga una empresa ficticia ("Andina Retail
     S.A. demo") con 14 candidatos, 3 vacantes, pruebas y entrevistas.
     Ideal para recorrer el flujo sin riesgo.
   - **Opción 2 – Organización real**: creas tu empresa y tu usuario
     administrador.
3. Con datos de demostración, el acceso es:
   - Correo: `admin@quipu.demo`
   - Contraseña: `Quipu2026!`

> Cambia esa contraseña desde **Configuración → Usuarios** en cuanto entres.

---

## 3. Los cinco roles

| Rol | Para quién | Puede hacer |
|---|---|---|
| **Administrador** | Dirección / TI | Todo, incluida auditoría y usuarios |
| **Reclutador** | Consultor de selección | Vacantes, candidatos, postulaciones, pruebas |
| **Responsable** | Jefe de área del cliente | Ver y opinar sobre sus vacantes |
| **Evaluador** | Especialista técnico | Calificar pruebas y entrevistas |
| **Auditor** | Cumplimiento | Solo lectura + registro de auditoría |

Los permisos se validan **en el servidor**, no en el navegador.

---

## 4. Recorrido completo de un proceso

### Paso 1 · Crear la vacante
`Vacantes → Nueva vacante`

- Datos del puesto: título, área, ubicación, modalidad, jornada, contrato, nivel.
- **Criterios de evaluación**, en dos tipos:
  - **Excluyentes** (obligatorios): no suman puntos, pero si no se cumplen el
    perfil se marca para revisión.
  - **Ponderados**: deben sumar 100 puntos entre todos.
- La vacante nace en **borrador**. No se puede publicar sin criterios: el
  sistema lo impide con un error explicado.
- Al publicar se genera un enlace público único (`/empleos/<slug>`).

### Paso 2 · El postulante sube su CV
Ver la sección 5 de este documento.

### Paso 3 · Revisar el pipeline
`Vacantes → (abrir vacante)` muestra el embudo por etapas. Cada postulación se
mueve entre etapas y **cada movimiento queda en el historial** con autor y
fecha.

### Paso 4 · Smart Match explicado
En la vacante, pestaña **Smart Match**: cada candidato recibe una puntuación
con su desglose.

- Muestra **evidencia** de dónde sale cada punto.
- Muestra **brechas**: qué falta y por qué.
- Si no hay datos suficientes, muestra **`sin_evaluar`**, nunca 0. Un 0 sería
  una acusación falsa.
- El sistema **nunca descarta a nadie automáticamente**. Siempre
  `requiresReview: true`.

### Paso 5 · Pruebas (Skill Lab)
`Skill Lab → Nueva prueba`

- **Opción múltiple**: se autocalifica.
- **Respuesta escrita / caso práctico**: requiere revisión humana.
- **Hoja de cálculo (.xlsx)**: el sistema verifica fórmulas y valores contra la
  rúbrica y devuelve evidencia por criterio. El resultado **queda en revisión**:
  la verificación automática es un apoyo, no la decisión.

### Paso 6 · Entrevistas
`Entrevistas`: agenda, guion y *scorecards* por competencia (escala 1–5).

### Paso 7 · Decidir y comunicar
- Contratar, rechazar (con motivo obligatorio) o enviar a **bolsa de talento**.
- El motivo de rechazo es obligatorio y queda auditado.
- El envío de correos requiere un proveedor configurado; si no existe, el
  sistema lo dice claramente en vez de fingir que envió.

### Paso 8 · Reportes
`Reportes`: embudo, tiempo de contratación (con tamaño de muestra visible),
resultados de pruebas, motivos de descarte y exportación CSV.

---

## 5. Cómo sube el CV un postulante

Este es el flujo completo, de principio a fin:

1. La empresa publica la vacante. El enlace público queda como
   `https://quipu-ats.pages.dev/empleos/<slug>`.
2. El postulante abre ese enlace **sin usuario ni contraseña**. También puede
   entrar por la bolsa general: `https://quipu-ats.pages.dev/empleos`.
3. Rellena: nombre, correo, teléfono, ciudad, años de experiencia, pretensión
   salarial y titular profesional.
4. En el recuadro **"Adjunta tu CV"** elige o arrastra el archivo:
   - Formatos: **PDF, DOCX, TXT** (máximo 3 MB).
   - El navegador **lee el texto** del archivo en el propio equipo del
     postulante (PDF con pdf.js, DOCX con mammoth).
   - Si el PDF es un **escaneo** (una imagen), no habrá texto: el sistema
     avisa y abre un campo para pegar el contenido a mano. El archivo original
     se guarda igual.
5. Marca la casilla de **autorización de datos** (obligatoria).
6. Pulsa **Enviar postulación**. El sistema:
   - Crea o **reutiliza el perfil único** (busca por correo dentro de la
     organización).
   - Registra la postulación en la primera etapa del pipeline.
   - Guarda el **archivo original en R2** (almacenamiento privado).
   - Guarda el **texto extraído** en D1 para que el reclutador lo lea.
   - Detecta habilidades del CV y las añade **sin verificar y sin puntuar**.
7. El reclutador lo ve en `Candidatos → (perfil) → Documentos`, con dos
   acciones: **Abrir archivo original** y **Ver texto**.

> Privacidad: el archivo no tiene URL pública. Solo se descarga con sesión
> iniciada y permiso `candidates:read`, y cada acceso queda en auditoría.

### Cómo sube un CV el reclutador (carga manual)
`Candidatos → (perfil) → Subir CV / extraer datos`: pega el texto, el sistema
extrae datos y **tú confirmas** cada campo antes de guardar. Ningún campo se
guarda automáticamente.

---

## 6. Memoria de talento (el diferenciador)

`Talent Memory` busca en **todo el histórico**: candidatos de procesos
anteriores, aunque hoy no estén postulando.

- Solo incluye a quien dio su **consentimiento**.
- Solo recomienda a quien **no** está ya postulando a esa vacante.
- Cada recomendación guarda su explicación y permite marcar
  **útil / incorrecta**, para medir la calidad del modelo.

---

## 7. Reglas del sistema que no se pueden romper

1. **Aislamiento por organización** en toda consulta.
2. **La IA no decide**: propone, explica y deja la decisión a una persona.
3. **Sin evidencia no hay cero**: se usa `sin_evaluar`.
4. **Todo cambio sensible queda en auditoría** con actor y fecha.
5. **El motivo de rechazo es obligatorio.**
6. **Los datos de demostración son ficticios y están etiquetados.**

---

## 8. Rutina semanal recomendada

| Cuándo | Qué |
|---|---|
| Lunes | Revisar vacantes publicadas y postulaciones nuevas |
| Martes | Ejecutar Smart Match en las vacantes abiertas |
| Miércoles | Enviar pruebas del Skill Lab y agendar entrevistas |
| Jueves | Revisar intentos pendientes de calificación |
| Viernes | Reportes: embudo, tiempo de contratación, motivos de descarte |

---

## 9. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| No puedo publicar una vacante | Faltan criterios. Añade al menos uno y vuelve a intentar. |
| El CV no muestra texto | Es un PDF escaneado. Abre el archivo original o pide el texto. |
| "Ya registramos una postulación tuya" | Es el perfil único evitando duplicados. Es correcto. |
| Un usuario no ve datos | Está en otra organización. El aislamiento es intencional. |
| Los correos no salen | Falta configurar `RESEND_API_KEY` (ver README). |
