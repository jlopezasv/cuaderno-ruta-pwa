# Resumen ejecutivo técnico — Cuaderno de Ruta (PWA)

**Audiencia:** revisión arquitectónica · **Alcance:** estado del repositorio (mayo 2026) · **Extensión:** ~5 páginas equivalentes

---

## 1. Stack completo

| Capa | Tecnología | Notas |
|------|------------|--------|
| **Frontend** | React 18, Vite 5, JavaScript (sin TypeScript) | Entry: `App.jsx` → lazy `cuaderno-ruta.jsx` (~17k líneas) |
| **UI modular** | `src/features/`, `src/layouts/`, `src/domain/` | Extracción incremental; el monolito sigue siendo el hub |
| **Backend datos** | **Supabase** (Postgres + PostgREST + Auth + Storage) | Proyecto referenciado: `glyexutcypmhkndvmcxd.supabase.co` |
| **Backend lógica** | **Vercel Serverless** (`api/*.js`, `api/push.mjs`) | CMR/OCR, chat IA, email docs, Stripe, admin, push FCM |
| **Auth** | Supabase Auth (REST `/auth/v1`) | Sesión en `localStorage` (`sb_session`); cliente usa `fetch` propio (`sbFetch`), **no** `@supabase/supabase-js` en runtime principal |
| **Storage** | Supabase Storage | Buckets endurecidos en migraciones: `user-photos`, `cmr` (privados, signed URLs) |
| **Deploy** | Vercel (`npm run deploy` → build + `vercel --prod`) | App pública referenciada: `tacografo-pro.vercel.app` |
| **Realtime** | **No usado en app** | Sin `supabase.channel()`; tracking y flota por **polling REST** |
| **Workers** | Service Worker (`public/sw.js`) + funciones Vercel | SW orientado a **push/notificaciones**, no a sync offline de negocio |
| **PWA** | `manifest.json`, SW, splash, `standalone` | Instalable; caché nominal (`cuaderno-v4`) |
| **Mapas** | **Leaflet 1.9.4** (CDN dinámico desde monolito) | Parkings / visualización; no Mapbox/Google Maps SDK |
| **OCR / visión CMR** | **Anthropic Claude** (`api/cmr.js`, modelo vision) | Extracción JSON de campos CMR desde imagen base64 |
| **IA conversacional** | **Anthropic Claude** (`api/chat.js`) | Proxy genérico; requiere `ANTHROPIC_API_KEY` en Vercel |
| **Push** | Firebase Cloud Messaging + `web-push` en `api/push.mjs` | SDK Firebase cargado bajo demanda (`fcmPush.js`) |
| **Pagos** | Stripe (`api/stripe.js`) | Tabla legacy `subscriptions` |
| **Persistencia local** | `localStorage` | Tacógrafo: `cuaderno_v7`; perfil; sesión; contexto empresa/conductor |

---

## 2. Flujo principal de negocio

```
Login (Supabase Auth)
    → Perfil (profiles) + contexto empresa | conductor (authContext)
    → [Empresa] Crear/asignar servicio (servicios, conductor_id opcional)
    → Paradas (stops) ordenadas, estados pendiente → llegado → completado
    → [Conductor] Inicio servicio (asignado → en_curso)
    → Por parada: llegada, evidencias (CMR / foto / incidencia), salida
    → Storage (user-photos / rutas CMR) + fila evidencias (JSON datos.doc_meta)
    → Expediente / PDF (dominio serviceExpediente — cliente, sin servidor PDF dedicado)
    → Tracking GPS → upsert ubicaciones (1 fila viva por user_id)
    → [Empresa] Panel flota: polling ubicaciones + estado servicios
    → Email documentación (api/send-docs-email + documentacion_envios)
    → Cierre servicio cuando no quedan paradas pendientes (completado)
```

**Sincronización operativa:** lecturas/escrituras vía `sbFetch` a PostgREST; eventos UI con listeners de dominio (`operationalEvidenciaSync`, refresh empresa). **No** hay cola offline unificada para servicios; el merge local fuerte es el **tacógrafo** (`entries` en `localStorage` + sync remota tabla `entries`).

**Meta operacional:** JSON en `servicios.referencia` bajo clave `__SRV_OP__` (planificación, ETA, desvíos).

---

## 3. Estructura Supabase

### 3.1 Tablas principales (operativas)

| Tabla | Rol |
|-------|-----|
| `profiles` | Usuario; `is_archived` (solo service_role vía trigger) |
| `empresas` | Flota; `owner_id`; `codigo_equipo` |
| `conductor_empresa` | Vínculo conductor ↔ empresa |
| `servicios` | Orden de viaje; `empresa_id`, `conductor_id` (nullable), `estado` |
| `stops` | Paradas por servicio |
| `evidencias` | Docs operativos por parada (`datos` JSON, `doc_meta`) |
| `servicio_documentos_extra` | Expediente no ligado a parada |
| `documentacion_envios` | Log envíos email (append-only) |
| `servicio_asignaciones` | Relevos / asignaciones futuras |
| `ubicaciones` | GPS vivo (`user_id` único, UPSERT) |

### 3.2 Relaciones críticas

```
empresas (1) ──< conductor_empresa >── (N) profiles
empresas (1) ──< servicios.conductor_id / empresa_id
servicios (1) ──< stops (1) ──< evidencias
servicios (1) ──< servicio_documentos_extra
servicios (1) ──< documentacion_envios
servicios (1) ──< servicio_asignaciones
profiles (1) ── (1) ubicaciones [user_id]
```

### 3.3 Storage buckets

| Bucket | Uso |
|--------|-----|
| `user-photos` | Fotos perfil, docs extra, pipeline operacional comprimido |
| `cmr` | CMR escaneados (legacy path en código) |

Políticas `stor_uph_*` / `stor_cmr_*`: primer segmento de ruta = `auth.uid()`; lectura flota para `owner_id` de empresa.

### 3.4 RLS importantes

- **Modelo canónico:** `user_can_access_servicio(uuid)` — conductor, dueño empresa, o jefe del conductor asignado.
- **INSERT servicios:** `user_can_insert_servicio(empresa_id, conductor_id)` — incluye servicio sin conductor (`pendiente_asignacion`).
- **Tablas por servicio:** policies `srv_*`, `stp_*`, `ev_*`, `sde_*`, `de_*`, `sa_*`.
- **Empresa / flota:** `emp_*`, `ce_*`, `ubi_sel_empresa_flota`.
- **Legacy (si existen tablas):** `*_own_*` por `user_id` — **fuente habitual de error ownership en DEMO**.

### 3.5 Funciones SQL críticas

| Función | Propósito |
|---------|-----------|
| `user_can_access_servicio(uuid)` | Gate RLS operativo |
| `user_can_access_empresa(uuid)` | Owner empresa |
| `user_can_insert_servicio(uuid, uuid)` | INSERT servicios |
| `documentacion_envios_bi_set_meta()` | Trigger INSERT envíos |
| `profiles_enforce_is_archived_change()` | Bloquea cambio `is_archived` sin service_role |
| Legacy (REAL): `handle_new_user`, `es_jefe_de`, `generar_codigo_equipo` | Auth/onboarding antiguo |

Migraciones versionadas: `supabase/migrations/` (17 archivos, may 2026).

---

## 4. Partes legacy

| Área | Detalle | Riesgo |
|------|---------|--------|
| **Monolito** | `src/cuaderno-ruta.jsx` — UI + tacógrafo + sync + empresa + mapas | Mantenimiento, regresiones |
| **Tablas** | `entries`, `gastos`, `km_logs`, `cmr_docs`, `subscriptions`, `documentos`, `asignaciones`, `push_*` | RLS/GRANT en migraciones asume `user_id` y **owner distinto** en DEMO |
| **Cliente REST** | `sbFetch` manual vs SDK; anon key **embebida** en `supabaseClient.js` | JWT debug activo (`SBFETCH_AUTH_DEBUG`); fallback anon si no hay sesión |
| **Doble modelo docs** | `servicio_documentos_extra`: `url` vs `archivo_url`, `creado_por` vs `conductor_id` | Inserts con fallback legacy en dominio |
| **Tacógrafo local** | `cuaderno_v7` + tablas `entries` remotas | Dos fuentes de verdad para jornada |
| **Stripe / subscriptions** | Consulta directa en monolito | Acoplamiento pagos ↔ UI |
| **CMR tabla `cmr_docs`** | Coexiste con evidencias modernas | Duplicidad conceptual |
| **Ownership mezclado** | Migración `revoke_anon_table_grants` + legacy storage RLS | `ERROR: must be owner of table` en SQL Editor DEMO |
| **API CORS** | `Access-Control-Allow-Origin: *` en varias functions | Superficie amplia si se abusa |

---

## 5. Partes modernas y estables

- **Dominio operativo extraído:** `src/domain/service/*`, `src/domain/documents/*`, `src/domain/fleet/*` — expediente, ETA, desvíos, meta `__SRV_OP__`, normalización docs extra.
- **Features UI:** `OperationalEvidenciasStop`, `ActiveServicePanel`, `EmpresaLayout`, `ServiceExtraDocumentsBlock`, modales mail.
- **RLS por servicio:** migraciones `20260514120000` + `20260521150000` + repair `20260523120000` — modelo claro conductor/empresa/flota.
- **Upload unificado (en progreso):** `uploadUserPhoto.compressImageToJpegBlob`, `uploadOperationalDocument`, trazas `operationalDocumentTrace`.
- **Scripts alineación DEMO:** `demo-safe-align.sql`, inventario/compare, seeds demo idempotentes.
- **Documentación operativa:** `docs/WORKFLOW_OPERATIVO.md`, `SECURITY_AUDIT.md`, `SUPABASE_RLS_STANDARD.md`.

---

## 6. Riesgos actuales

| Dominio | Riesgo | Severidad |
|---------|--------|-----------|
| **Seguridad** | Anon key en repo; debug auth en producción; CORS `*` en APIs | Alta |
| **RLS** | Tablas sin migrar; políticas duplicadas; ejecución SQL sin ownership en DEMO | Alta |
| **Storage** | Buckets lógicos en código (`fotos`, `incidencias`) vs solo 2 migrados | Media |
| **Escalabilidad** | Monolito + polling GPS/flota; sin realtime | Media |
| **Performance** | PDF/expediente en cliente; imágenes canvas; panel empresa N+1 fetch | Media |
| **Mobile** | GPS timeout; permisos cámara PWA; ficheros grandes en memoria | Media |
| **Offline** | SW no cachea API; servicios requieren red; solo tacógrafo local parcial | Media |
| **Service Worker** | Push sí; precache operativo limitado | Baja–Media |
| **IA/OCR** | Dependencia Anthropic; coste/latencia; datos CMR salen a tercero | Media (compliance) |
| **Entornos** | Misma URL Supabase hardcodeada en cliente; DEMO vs REAL no parametrizado en build | Alta (operaciones) |

---

## 7. Arquitectura de entornos

| Entorno | Estado en código | Base de datos |
|---------|------------------|---------------|
| **REAL (prod)** | `glyexutcypmhkndvmcxd.supabase.co`, deploy Vercel prod | Migraciones aplicadas manualmente / SQL Editor |
| **DEMO** | Splash «CUADERNO DE RUTA DEMO»; seeds `scripts/seed-demo*.sql` | Proyecto Supabase separado (esperado); alineación vía `demo-safe-align.sql` |
| **Local** | `vite` / `vite preview` | Misma URL que prod salvo override `window.__SB_URL__` |

**Deploy flow:** commit → `npm run build` → Vercel static + serverless `api/` → cliente apunta a Supabase fijo.

**Migraciones:** carpeta `supabase/migrations/`; no hay CLI obligatorio en CI — riesgo de drift REAL/DEMO. Herramientas: `audit-supabase-inventory.sql`, `compare-supabase-inventory.mjs`, `demo-safe-align.sql` (sin GRANT/legacy).

---

## 8. Diagrama textual de arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│  PWA (React/Vite) — navegador móvil / desktop                   │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ cuaderno-    │  │ features/       │  │ domain/          │  │
│  │ ruta.jsx     │──│ layouts/        │──│ service, docs,   │  │
│  │ (monolito)   │  │ Operational*    │  │ fleet, mail      │  │
│  └──────┬───────┘  └────────┬────────┘  └────────┬─────────┘  │
│         │                   │                     │             │
│         │    sbFetch + localStorage (sb_session, cuaderno_v7)  │
└─────────┼───────────────────┼─────────────────────┼───────────┘
          │                   │                     │
          v                   v                     v
┌─────────────────┐   ┌───────────────┐    ┌────────────────────┐
│ Supabase        │   │ Service Worker │    │ Vercel Functions  │
│ · Auth          │   │ · Push FCM     │    │ · /api/cmr (IA)   │
│ · PostgREST     │   │ · Notif local  │    │ · /api/chat       │
│ · Storage       │   └───────────────┘    │ · /api/push       │
│ · Postgres+RLS  │                          │ · send-docs-email │
└────────┬────────┘                          │ · stripe, admin   │
         │                                   └─────────┬─────────┘
         │                                             │
         v                                             v
   [servicios · stops · evidencias · ubicaciones]   [Anthropic · FCM · SMTP]
```

---

## Conclusión para auditoría

La aplicación es una **PWA monolítica en transición**: el producto operativo (servicios, paradas, evidencias, flota, expediente) ya tiene **fronteras de dominio y RLS por servicio** claras en SQL versionado, pero el runtime sigue centralizado en `cuaderno-ruta.jsx`, con **persistencia híbrida** (Supabase + localStorage tacógrafo) y **sin realtime ni offline operativo completo**.

Prioridades recomendadas para hardening: (1) parametrizar entornos y retirar secrets del bundle, (2) aplicar solo `demo-safe-align.sql` en DEMO, (3) reducir superficie legacy en migraciones, (4) completar unificación upload/evidencias y buckets Storage, (5) continuar extracción del monolito sin big-bang.

---

*Generado para revisión arquitectónica · Repositorio `cuaderno-pwa` · Mayo 2026*
