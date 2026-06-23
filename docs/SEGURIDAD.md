# Auditoría de seguridad — Cuaderno de Ruta

**Fecha:** 2026-06-05  
**Alcance:** Supabase (REAL `glyexutcypmhkndvmcxd`), Vercel (`tacografo-pro`), código en `main`  
**Método:** Revisión estática de 76 migraciones, `api/*`, `src/`, scripts de auditoría. Sin pentest ni ejecución en BD.

---

## Resumen ejecutivo

| Área | Estado | Prioridad |
|------|--------|-----------|
| RLS operativa (servicios/stops/evidencias) | Sólida, centrada en `user_can_access_servicio()` | Media (mantenimiento) |
| APIs públicas sin auth | Varias (`/api/chat`, `/api/cmr`, `/api/send-docs-email`) | **Alta** |
| Super-admin hardcodeado | Email/UID en migración y env | **Alta** |
| Divergencia DEMO vs REAL | Políticas más permisivas solo en demo | Media |
| Storage | Solo `user-photos` y `cmr` con RLS en migraciones | Media |
| Vista retención `v_retention_metrics_summary` | Posible SECURITY DEFINER (linter Supabase) | Media |

---

## 1. Tablas Supabase

### 1.1 Tablas creadas en migraciones (21)

| Tabla | Dominio | RLS | Riesgo | Impacto | Prob. | Solución |
|-------|---------|-----|--------|---------|-------|----------|
| `servicio_documentos_extra` | Docs expediente | Por servicio | Bajo | Medio | Baja | Mantener; auditar `user_can_access_servicio` |
| `documentacion_envios` | Mail cliente | Por servicio + append-only | Bajo | Medio | Baja | OK |
| `servicio_asignaciones` | Multi-conductor | Por servicio | Medio | Alto | Media | Revisar que asignaciones no amplíen acceso cross-tenant |
| `incidencias` | Operativa | Por servicio, sin DELETE | Bajo | Medio | Baja | OK append-only |
| `servicio_documentos_empresa` | Docs empresa | Empresa + servicio | Bajo | Medio | Baja | OK |
| `service_messages` | Chat interno | Por servicio | Medio | Medio | Media | Asegurar que no exista UPDATE/DELETE |
| `chat_service_read_receipts` | Lectura chat | Solo `auth.uid()` propio | Bajo | Bajo | Baja | OK (implementado 20260720) |
| `empresa_usuarios` | Oficina | Peer + manage helpers | Medio | Alto | Media | Validar `user_can_manage_empresa_usuarios` en prod |
| `agenda_comercial_*` (3) | CRM tenant | `user_can_access_empresa` | Bajo | Medio | Baja | OK |
| `admin_agenda_comercial_*` (3) | CRM global | `is_superadmin_agenda_user()` | **Alto** | Alto | Media | Sustituir hardcode por tabla de roles |
| `master_partes_transporte` | DCDT | Oficina + conductor empresa | Medio | Alto | Media | OK con `user_can_manage_dcdt_trafico` |
| `dcdt_servicio` | DCDT | Tráfico + conductor | Medio | Alto | Media | Separar UPDATE tráfico vs conductor |
| `retention_*` (4) | Retención datos | Solo `is_retention_admin()` | Medio | Alto | Baja | Corregir vista definer (ver §2) |

### 1.2 Tablas legacy / pre-migración (referenciadas en RLS)

| Tabla | Dominio | Riesgo | Impacto | Prob. | Solución |
|-------|---------|--------|---------|-------|----------|
| `servicios` | Core | **Alto** (eje de seguridad) | Crítico | Media | Tests automatizados de `user_can_access_servicio` por rol |
| `stops` | Core | Medio | Alto | Media | Idem |
| `evidencias` | Core + incidencias | Medio | Alto | Media | Validar rama incidencias en políticas |
| `empresas` | Tenant | Medio | Alto | Media | En DEMO: `conductor_lee_empresa` muy amplia — no en prod |
| `conductor_empresa` | Flota | Bajo | Alto | Baja | OK owner/self |
| `profiles` | Auth | Medio | Alto | Media | `prof_sel` permite owner ver conductores vinculados |
| `ubicaciones` | GPS | Medio | Alto | Media | `ubi_sel_empresa_flota` expone GPS a owner |
| `entries`, `gastos`, `km_logs`, `cmr_docs` | Legacy tacógrafo | Bajo | Medio | Baja | Solo `user_id = auth.uid()` |
| `subscriptions` | Billing | Bajo | Medio | Baja | Solo propio |
| `push_tokens` | FCM | Bajo | Medio | Baja | Solo propio |
| `asignaciones` | Legacy multi | Medio | Medio | Baja | Si existe, alineada a servicio |

### 1.3 Vistas sensibles

| Vista | Riesgo | Impacto | Prob. | Solución |
|-------|--------|---------|-------|----------|
| `v_retention_metrics_summary` | **Alto** (SECURITY DEFINER efectivo) | Alto (agregados cross-tenant) | Alta si `GRANT SELECT` a `authenticated` | `security_invoker` + RPC con `is_retention_admin()` |
| `v_servicio_incidencias_resumen` | Medio | Medio | Media | Verificar grants y definición |

---

## 2. Políticas RLS

### 2.1 Primitivo central

**Función:** `user_can_access_servicio(uuid)` — `SECURITY DEFINER`, redefinida en ~15 migraciones.

| Aspecto | Riesgo | Impacto | Prob. | Solución |
|---------|--------|---------|-------|----------|
| Lógica compleja (conductor, owner, oficina, asignaciones, autónomo) | **Alto** | Crítico | Media | Inventario REAL vs migraciones; tests de regresión |
| DEMO: `SET row_security = off` en helpers (`20260620120000`) | **Alto** en demo | Alto en demo | Alta en demo | No aplicar en REAL; comparar con `compare-supabase-inventory.mjs` |
| Volatilidad STABLE vs VOLATILE | Medio | Medio | Media | Unificar definición canónica en una migración repair |

### 2.2 Políticas por dominio (resumen)

| Dominio | Políticas clave | Riesgo | Impacto | Prob. | Solución |
|---------|-----------------|--------|---------|-------|----------|
| **Servicios** | `srv_sel/ins/upd/del` | Medio | Crítico | Media | DEMO añade `office_user_can_insert_planned_servicio` — verificar solo en demo |
| **Stops / evidencias** | `stp_*`, `ev_*` | Bajo–Medio | Alto | Baja | Reparadas en `20260530180000`, `20260530190000` |
| **Empresas** | `emp_sel` owner; `emp_sel_oficina`; **`conductor_lee_empresa`** (demo) | **Alto** en demo | Alto | Alta en demo | `conductor_lee_empresa`: `auth.uid() IS NOT NULL` — enumeración de empresas |
| **Empresa usuarios** | `eu_sel`, `eu_ins`, `eu_upd`, `eu_sel_peer` | Medio | Alto | Media | Peer read necesario para UI; auditar escalada a manage |
| **Ubicaciones** | Self + `ubi_sel_empresa_flota` | Medio | Alto (privacidad) | Media | Documentar consentimiento conductor; minimizar retención |
| **DCDT** | `dcdt_sel`, `dcdt_upd_trafico`, `dcdt_upd_conductor` | Medio | Alto | Media | OK separación roles |
| **Admin agenda** | `aacp_*` → `is_superadmin_agenda_user()` | **Alto** | Alto | Media | RBAC configurable, no email fijo |
| **Retención** | `rfm_*`, `rac_*`, `rpc_*`, `rsl_*` | Medio | Alto | Baja | OK admin-only |
| **Chat** | `sm_sel/ins`, `csrr_*` | Bajo | Medio | Baja | OK |
| **Storage objects** | `stor_*` por bucket y prefijo UID | Medio | Alto | Media | Validar path traversal; fleet read limitado a owner |
| **Legacy** | `*_own_*` en entries, gastos, etc. | Bajo | Medio | Baja | OK |
| **Grants anon** | `REVOKE ALL` en `20260518160000` | — | — | — | Verificar que anon no tenga grants residuales en prod |

### 2.3 RPCs SECURITY DEFINER (escritura / elevación)

| Función | Gate | Riesgo | Impacto | Prob. | Solución |
|---------|------|--------|---------|-------|----------|
| `soltar_parada_conductor_guarded` | `user_can_access_servicio` | Medio | Alto | Baja | OK |
| `finalizar_participacion_conductor_guarded` | Idem | Medio | Alto | Baja | OK |
| `lookup_empresa_por_codigo` | `auth.uid()` | Medio | Medio | Media | Rate limit; no revelar empresas inexistentes |
| `retention_run_simulation` | `is_retention_admin()` | Medio | Medio | Baja | OK dry-run |
| `debug_servicio_insert_rls_context` | Autenticado | **Alto** | Medio | Media | Revocar en prod o restringir a superadmin |
| `debug_office_planned_insert` | DEMO | Medio | Bajo | Baja | Solo demo |

---

## 3. Buckets Storage

| Bucket | En migración | `public` | Políticas RLS | Riesgo | Impacto | Prob. | Solución |
|--------|--------------|----------|---------------|--------|---------|-------|----------|
| `user-photos` | Sí | `false` | 5 (own + fleet read) | Medio | Alto (fotos personales) | Media | Auditar prefijo `auth.uid()`; CSP en URLs firmadas |
| `cmr` | Sí | `false` | 5 (own + fleet read) | Medio | Alto (documentos) | Media | Idem |
| `expediente_firma` | Solo scripts demo | `false` | **Sin políticas en migraciones** | **Alto** | Alto | Media | Migración prod con mismas reglas que `cmr` |
| `documentos_empresa` (paths en código) | No bucket dedicado | — | — | Medio | Medio | Media | Definir bucket + RLS explícito |

---

## 4. Funciones API Vercel (`api/`)

| Ruta | Auth | Riesgo | Impacto | Prob. | Solución |
|------|------|--------|---------|-------|----------|
| `GET /api/dcdt-verify` | Ninguna (público) | Medio | Medio | Media | Token opaco; solo snapshot; rate limit Vercel |
| `GET /api/dcdt-download` | Ninguna (público) | Medio | Alto (PDF) | Media | `deca_public_id` no adivinable; expiración opcional |
| `POST /api/chat` | **Ninguna** | **Crítico** | Alto (coste API + abuso) | **Alta** | JWT obligatorio + rate limit + CORS restringido |
| `POST /api/cmr` | **Ninguna** | **Crítico** | Alto (coste Vision) | **Alta** | JWT + límite tamaño imagen + rate limit |
| `POST /api/send-docs-email` | **Ninguna** | **Alto** | Alto (spam, SSRF parcial) | Media | Bearer + validar `servicio_id` con service role y ownership |
| `POST /api/admin` | Mixto | **Alto** | Alto | Media | Ver acciones sin Bearer abajo |
| `POST /api/push` | Mixto | Medio | Medio | Media | OK en notify_* con checks |
| `POST /api/stripe` | JWT / webhook sig | Bajo | Alto | Baja | OK |
| `POST /api/superadmin` | JWT + allowlist | Medio | **Crítico** | Baja | Rotar UIDs; MFA en cuenta superadmin |

### 4.1 Detalle `api/admin.js` (acciones sensibles)

| Acción | Auth actual | Riesgo | Solución |
|--------|-------------|--------|----------|
| `bienvenida`, `notify_nueva_empresa` | Ninguna | Medio | Secret header o internal-only |
| `create_office_user` | Solo `caller_uid` en body | **Alto** | Bearer JWT + verificar caller server-side |
| `archive_user`, `delete_user` | Bearer + allowlist | Medio | OK |
| `purge_test_company` | Múltiples gates | Bajo | Bloqueado en `VERCEL_ENV=production` |

---

## 5. Roles existentes

### 5.1 Capa aplicación (`profiles.tipo_cuenta`)

| Rol / tipo | Shell UI | Riesgo | Impacto | Prob. | Solución |
|------------|----------|--------|---------|-------|----------|
| `conductor` | Conductor | Bajo | — | — | — |
| `autonomo_pro` | Conductor + crear servicios | Medio | Medio | Media | RLS autónomo en `servicios` |
| `empresa` (owner) | Empresa + opcional conductor | Medio | Alto | Media | `empresa_status` pending en prod |
| Superadmin (`PropietarioLayout`) | Panel propietario | **Alto** | Crítico | Baja | `ADMIN_PANEL_USER_IDS` + email |

### 5.2 Oficina (`empresa_usuarios.rol`)

| Rol | Permisos típicos | Riesgo | Impacto | Prob. | Solución |
|-----|------------------|--------|---------|-------|----------|
| `jefe_flota` | Gestión usuarios, DCDT, insert servicios (demo) | Medio | Alto | Media | Auditar INSERT servicios en REAL |
| `trafico` | DCDT, planificación, chat | Medio | Alto | Media | OK |
| `administrativo` | Lectura limitada (sin asignar) | Bajo | Medio | Baja | Confirmar gates en `accountModel` |

### 5.3 Features UI (`FEATURE_KEYS`)

Gates en cliente — **no sustituyen RLS**. Riesgo: UI oculta acciones pero API directa PostgREST podría intentar bypass → mitigado por RLS si está bien.

### 5.4 Supabase Auth roles

| Rol | Uso | Riesgo | Solución |
|-----|-----|--------|----------|
| `authenticated` | Usuarios JWT | — | Revocar grants innecesarios |
| `anon` | Público | Medio | Verificar sin grants en tablas sensibles |
| `service_role` | APIs serverless | **Alto** | Solo en Vercel env; nunca en cliente |

---

## 6. Rutas públicas (aplicación)

| Ruta / condición | Componente | Auth | Riesgo | Impacto | Prob. | Solución |
|------------------|------------|------|--------|---------|-------|----------|
| `?dcdt-v=` / `#dcdt-v/` | `DcdtVerifyPublicPage` | **Pública** | Medio | Medio | Media | Solo datos snapshot; sin PII excesiva |
| Default (`cuaderno-ruta.jsx`) | Login si sin sesión | Semi-pública | Bajo | — | — | `isPublicRegistrationAllowed()` |
| `?equipo=`, `?join=`, `?code=` | Deep link → login | Semi-pública | Bajo | Bajo | Código equipo no es secreto fuerte |
| `?pago=ok` | Stripe return | Requiere sesión | Bajo | Medio | Baja | OK |
| Tabs (`?tab=servicio`) | **No parseadas en app** | — | Bajo | Bajo | SW usa postMessage |

**No hay React Router** — superficie de ataque limitada a query params.

---

## 7. Enlaces públicos cliente

| Enlace | Formato | Riesgo | Impacto | Prob. | Solución |
|--------|---------|--------|---------|-------|----------|
| Verificación DeCA (QR) | `{origin}?dcdt-v={token}` | Medio | Medio | Media | Token largo; estado `validado` / `incluido_en_expediente` |
| Descarga PDF DeCA | `{base}/api/dcdt-download?id={deca_public_id}` | Medio | Alto | Media | UUID; no listable |
| Deep link equipo | `{origin}/?equipo={codigo}` | Medio | Medio | Media | Código corto — fuerza bruta teórica |
| Expediente cliente | **No hay URL pública** | Bajo | — | — | Solo email adjunto autenticado |
| Stripe return | `tacografo-pro.vercel.app?pago=ok` | Bajo | Medio | Baja | Hardcoded en `api/stripe.js` |

**Bases canónicas:** demo `cuaderno-demo-ab.vercel.app`, prod `tacografo-pro.vercel.app` (`VITE_DECA_PUBLIC_BASE_URL`).

---

## 8. Variables de entorno (ángulo seguridad)

### 8.1 Cliente (`VITE_*`) — expuestas en bundle

| Variable | Riesgo | Impacto | Prob. | Solución |
|----------|--------|---------|-------|----------|
| `VITE_SUPABASE_URL` | Bajo | — | — | Esperado |
| `VITE_SUPABASE_ANON_KEY` | Bajo | — | — | Esperado; RLS es la barrera |
| `VITE_ALLOW_PROD_SUPABASE` | Medio | Alto si mal usado | Baja | Solo build prod |
| `VITE_ADMIN_PANEL_USER_IDS` | **Alto** | Alto | Media | No exponer UIDs sensibles; usar claim JWT |
| `VITE_SUPERADMIN_EMAIL` | Medio | Medio | Media | Preferir solo server-side |
| `VITE_FIREBASE_*` | Bajo | Medio | Baja | Restringir dominio en Firebase console |
| `VITE_DECA_PUBLIC_BASE_URL` | Bajo | Bajo | Baja | OK |
| `VITE_ENABLE_PURGE_TEST_COMPANY` | **Alto** | Crítico | Baja | Nunca `true` en prod build |

### 8.2 Servidor (Vercel) — secretas

| Variable | Riesgo | Impacto | Prob. | Solución |
|----------|--------|---------|-------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | **Crítico** | Crítico | Baja | Rotación periódica; mínimo uso |
| `ANTHROPIC_API_KEY` | **Alto** | Alto | Media | Proteger endpoints que la usan |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | **Alto** | Alto | Baja | OK |
| `BREVO_API_KEY` / `RESEND_API_KEY` | Medio | Medio | Baja | OK |
| `FCM_SERVER_KEY` / `GOOGLE_APPLICATION_CREDENTIALS` | Medio | Medio | Baja | OK |
| `ADMIN_PANEL_USER_IDS` | **Alto** | Alto | Baja | Lista corta; auditar |
| `ALLOW_PURGE_TEST_COMPANY` | **Alto** | Crítico | Baja | `0` en prod |

### 8.3 Scripts locales (no en Vercel)

`SUPABASE_DB_URL_REAL`, `SUPABASE_DB_URL_DEMO` — **críticas**; solo en `.env.local` / CI secreto.

---

## 9. Matriz de priorización seguridad

| # | Hallazgo | Severidad |
|---|----------|-----------|
| 1 | `/api/chat` y `/api/cmr` sin autenticación | Crítica |
| 2 | `create_office_user` sin Bearer JWT | Alta |
| 3 | `/api/send-docs-email` sin auth | Alta |
| 4 | `conductor_lee_empresa` en DEMO (`auth.uid() IS NOT NULL`) | Alta (demo) |
| 5 | Superadmin por email/UID hardcodeado | Alta |
| 6 | `v_retention_metrics_summary` SECURITY DEFINER | Media–Alta |
| 7 | Bucket `expediente_firma` sin RLS en migraciones | Media |
| 8 | Funciones debug expuestas a `authenticated` | Media |
| 9 | `VITE_ADMIN_PANEL_USER_IDS` en bundle cliente | Media |
| 10 | Divergencia migraciones DEMO/REAL no inventariada | Media |

---

## 10. Scripts de auditoría recomendados

```bash
# Inventario JSON completo (ejecutar en SQL Editor REAL, exportar JSON)
scripts/audit-supabase-inventory.sql

# Comparar REAL vs DEMO
node scripts/compare-supabase-inventory.mjs

# Preflight prod
scripts/preflight-prod-sql-audit.sql
scripts/preflight-prod-final-checklist.sql
```

---

*Documento generado por auditoría estática. No sustituye pentest ni revisión legal (RGPD, GPS conductores).*
