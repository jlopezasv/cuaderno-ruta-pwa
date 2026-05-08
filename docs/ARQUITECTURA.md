# ARQUITECTURA

# Estado actual

La aplicación es una PWA React + Vite orientada a:
- conductores profesionales
- empresas de transporte
- gestión de jornada
- normativa tacógrafo
- servicios y rutas
- documentación CMR

Actualmente gran parte de la lógica vive en:

src/cuaderno-ruta.jsx

El proyecto funciona como un monolito funcional:
- UI
- estado
- lógica de negocio
- sincronización
- Supabase
- servicios
- normativa
- empresa
- documentos

todo muy concentrado en el mismo archivo.

---

# Stack actual

## Frontend
- React
- Vite
- JavaScript
- PWA
- Service Worker

## Backend
- Vercel Functions
- Supabase
- Stripe
- APIs externas

## Persistencia
- Supabase
- localStorage

---

# Arquitectura actual

UI React
↓
Estado local hooks
↓
Lógica negocio integrada
↓
Supabase + localStorage
↓
Funciones api/
↓
Servicios externos

---

# Problemas actuales

## Monolito grande
src/cuaderno-ruta.jsx mezcla:
- UI
- sync
- negocio
- normativa
- fetch
- estado
- side effects

## Acoplamiento alto
La UI accede directamente a:
- Supabase
- fetch
- sync
- lógica normativa

## Contratos dispersos
Hay inconsistencias potenciales:
- /api/cmr
- /api/push
- actions admin

## Escalabilidad limitada
Difícil mantener:
- multi conductor
- relevos
- gestores flota
- dashboards complejos

---

# Arquitectura objetivo

Objetivo:
NO rehacer la app.

Objetivo real:
extraer gradualmente módulos y fronteras.

---

# Capas objetivo

## layouts/
Composición de alto nivel:
- EmpresaLayout
- ConductorLayout

## features/
Módulos funcionales:
- empresa
- conductor
- servicios
- documentos
- normativa

## domain/
Reglas puras:
- jornada
- planificación
- normativa
- timeline

Sin React.
Sin fetch.
Sin Supabase.

## data/
Infraestructura:
- supabase
- auth
- sync
- repositorios
- api clients

## shared/
Utilidades y componentes reutilizables.

---

# Estrategia

## NO hacer:
- big bang refactor
- redux complejo
- microservicios
- sobrearquitectura

## SÍ hacer:
- extracción incremental
- PRs pequeños
- mantener comportamiento
- mover primero, mejorar después

---

# Prioridades técnicas

## Fase 0
Blindar contratos API.

## Fase 1
Separar:
- Supabase
- auth
- sync

## Fase 2
Extraer dominio:
- normativa
- jornada
- planificación

## Fase 3
Separar layouts:
- empresa
- conductor

---

# Principios

- estabilidad primero
- UX estable
- cambios pequeños
- rollback simple
- smoke tests obligatorios
- una responsabilidad por PR

---

# Objetivo final

Construir una plataforma SaaS profesional de transporte preparada para:
- empresas
- conductores
- relevos
- multiusuario
- dashboards operativos
- escalabilidad gradual

---

# Contracts v1 (PR-01)

Objetivo de esta seccion:
- blindar contratos API reales antes de extraer infraestructura
- alinear frontend/backend sin rediseño masivo
- reducir riesgo de regresiones en produccion

Reglas de contrato para PR-01:
- mantener rutas actuales usadas por frontend
- estandarizar respuesta minima:
  - exito: `{ ok: true, ... }`
  - error: `{ ok: false, error: "mensaje", code: "ERROR_CODE" }`
- no cambiar UX ni navegacion
- no mover componentes grandes

## Inventario actual de endpoints usados por frontend

- `POST /api/admin`
- `POST /api/stripe`
- `POST /api/chat`
- `POST /api/cmr`
- `POST /api/push`

Nota: `auth` y `sync` hoy usan Supabase directo (`/auth/v1/*`, `/rest/v1/*`, `/storage/v1/*`), no `/api/*`.

## Contratos canonicos minimos por endpoint

### 1) Chat

- Ruta: `POST /api/chat`
- Quien lo usa: `ChatTab` (asistente normativo)
- Request:
  - `model?: string`
  - `max_tokens?: number`
  - `system?: string`
  - `messages: Array<{ role: "user" | "assistant" | "system", content: string }>`
- Response exito:
  - `{ ok: true, content: [{ text: string }], raw?: any }`
- Response error:
  - `{ ok: false, error: string, code: "CHAT_UPSTREAM_ERROR" | "CHAT_BAD_REQUEST" | "CHAT_INTERNAL" }`
- Estado actual:
  - funcional, pero envelope no uniforme

### 2) Stripe

- Ruta: `POST /api/stripe`
- Quien lo usa:
  - paywall / checkout
- Actions:
  - `create_checkout`
  - `check_subscription` (backend existente)
  - `webhook` (backend existente, llamado por Stripe)
- Request `create_checkout`:
  - `{ action: "create_checkout", user_id: string, email: string, plan: "monthly" | "annual" }`
- Response exito `create_checkout`:
  - `{ ok: true, url: string }`
- Response error:
  - `{ ok: false, error: string, code: "STRIPE_BAD_REQUEST" | "STRIPE_UPSTREAM" | "STRIPE_INTERNAL" }`
- Estado actual:
  - `create_checkout` OK
  - envelope no uniforme

### 3) Admin

- Ruta: `POST /api/admin`
- Quien lo usa:
  - registro/login (bienvenida, reset password)
  - panel admin (usuarios/empresas)
  - panel empresa (invitar conductor)
- Actions usadas por frontend:
  - `reset_password`
  - `bienvenida`
  - `invite_conductor_solo`
  - `create_user`
  - `delete_user`
  - `delete_empresa`
  - `invite_conductor`
- Response exito canonic:
  - `{ ok: true, data?: any }`
- Response error canonic:
  - `{ ok: false, error: string, code: "ADMIN_BAD_REQUEST" | "ADMIN_FORBIDDEN" | "ADMIN_NOT_IMPLEMENTED" | "ADMIN_INTERNAL" }`
- Estado actual:
  - inconsistente/incompleto (solo `bienvenida` y `notify_nueva_empresa` implementadas)

### 4) CMR

- Ruta canonic: `POST /api/cmr`
- Quien lo usa:
  - `CmrScanner`
  - flujo docs servicio
- Request:
  - `{ image: string(base64 sin prefijo), mediaType?: string }`
- Response exito:
  - `{ ok: true, campos: Record<string, any> }`
- Response error:
  - `{ ok: false, error: string, code: "CMR_BAD_REQUEST" | "CMR_PARSE_ERROR" | "CMR_UPSTREAM" | "CMR_INTERNAL" }`
- Estado actual:
  - inconsistente de ruta (`cmr.js` en raiz, no `api/cmr.js`)

Nota operativa PR-01:
- `api/cmr.js` pasa a ser el endpoint canonico.
- `cmr.js` en raiz se mantiene temporalmente como legacy/fallback de compatibilidad.
- No eliminar `cmr.js` hasta cerrar la validacion completa de PR-01.

### 5) Push

- Ruta canonic: `POST /api/push`
- Quien lo usa:
  - registro y gestion de push notifications
- Actions:
  - `vapid_key`
  - `subscribe`
  - `schedule`
  - `cancel`
- Request `vapid_key`:
  - `{ action: "vapid_key" }`
- Response `vapid_key`:
  - `{ ok: true, publicKey: string }`
- Request `subscribe`:
  - `{ action: "subscribe", payload: { user_id: string, subscription: object } }`
- Request `schedule`:
  - `{ action: "schedule", payload: { user_id: string, fire_at: string(ISO), title: string, body: string, tag: string } }`
- Request `cancel`:
  - `{ action: "cancel", payload: { user_id: string, tag: string } }`
- Response general:
  - `{ ok: true }`
- Error general:
  - `{ ok: false, error: string, code: "PUSH_BAD_REQUEST" | "PUSH_NOT_IMPLEMENTED" | "PUSH_INTERNAL" }`
- Estado actual:
  - critico (endpoint ausente)

## Auth y Sync (contrato minimo actual)

### Auth (actualmente Supabase directo)

- Endpoints efectivos:
  - `POST ${SB_URL}/auth/v1/signup`
  - `POST ${SB_URL}/auth/v1/token?grant_type=password`
  - `POST ${SB_URL}/auth/v1/token?grant_type=refresh_token`
  - `POST ${SB_URL}/auth/v1/logout`
- Contrato operativo interno recomendado:
  - normalizar errores a `{ code, message }` en capa `data/session` (fase 1)
- Estado actual:
  - funcional, no unificado

### Sync (actualmente UI + Supabase + localStorage)

- Operaciones efectivas:
  - `sbSelect` sobre `profiles`, `entries`, `documentos`
  - `sbUpsert` sobre `entries`, `profiles`
  - merge local/cloud en cliente
- Contrato operativo interno recomendado:
  - `syncFromRemote(): Promise<{ ok: boolean, merged: number, errors?: string[] }>`
  - `saveLocalAndQueueRemote(...)`
  - sin cambiar comportamiento en PR-01

## Mapa de inconsistencias (priorizado)

### Criticas

- `POST /api/push` no existe.
- `POST /api/cmr` esperado por frontend, pero handler ubicado en `cmr.js` raiz.
- `POST /api/admin` recibe acciones no implementadas en backend.

### Medias

- envelopes de respuesta diferentes entre endpoints.
- acciones backend implementadas pero no usadas directamente (`notify_nueva_empresa`, `check_subscription`).

### Cosmeticas

- nombres/codigos de error no estandarizados.
- mensajes de error heterogeneos.

## Correcciones minimas aprobadas para PR-01 (sin reestructura)

- crear/alinear ruta `api/cmr.js` para que `/api/cmr` exista formalmente.
- crear `api/push.js` con soporte minimo para `vapid_key|subscribe|schedule|cancel`.
- completar `api/admin.js` para las acciones ya llamadas por frontend o devolver `ADMIN_NOT_IMPLEMENTED` controlado en endpoints no listos.
- normalizar responses de `admin`, `cmr`, `push`, `stripe` al envelope minimo.
- documentar payload/response de cada action en este archivo.

Fuera de alcance PR-01:
- extraer `supabaseClient`, `session`, `sync` (eso pertenece a PR-02/03/04)
- cambios de UX
- refactor de componentes grandes

## Criterios de aceptacion PR-01

- todas las rutas `/api/*` usadas por frontend existen y responden.
- ninguna action usada en frontend devuelve `Unknown action`.
- errores devuelven `ok:false` + `error` + `code`.
- smoke tests funcionales:
  - login/logout
  - registro + bienvenida
  - chat
  - cmr scan
  - push vapid/subscribe/schedule/cancel
  - checkout stripe