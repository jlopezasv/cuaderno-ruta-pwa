# Auditoría de seguridad — Supabase Data API, RLS y Storage

Documento vivo: refleja el estado del **repositorio** y las **migraciones SQL** versionadas. La comprobación definitiva de tablas o buckets que solo existen en el proyecto remoto debe hacerse en el **SQL Editor** de Supabase o con `pg_catalog` tras aplicar migraciones.

## 1. Resumen ejecutivo

| Área | Estado en código | Acción en proyecto remoto |
|------|-------------------|---------------------------|
| Ownership por servicio | `user_can_access_servicio(uuid)` en `20260514120000_rls_servicio_ownership_core.sql` | Aplicar migración; revisar políticas duplicadas en Dashboard |
| Storage `user-photos` / `cmr` | RLS en `storage.objects`, buckets `public = false` en `20260515190000_storage_and_legacy_rls.sql` | Eliminar políticas antiguas “abiertas” si existían; verificar `bucket_id` vs `name` |
| Legacy tablas (`user_id`) | RLS + grants en migración storage si la tabla existe | Confirmar columna `user_id`; si el nombre difiere, ajustar SQL |
| Service role en API | `push.mjs` valida ownership; `stripe.js` exige Bearer y coincide usuario | Configurar `SUPABASE_ANON_KEY` en Vercel para validación JWT |
| URLs firmadas (cliente) | CMR y fotos de perfil usan `object/sign` con expiración corta | No reactivar `getPublicUrl` para datos sensibles |
| Adjuntos email | `send-docs-email.js` solo descarga HTTPS a Storage Supabase | Si se usan CDN propias, ampliar allowlist con criterio explícito |

## 2. Modelo de ownership (producto)

- **Unidad de aislamiento conductor ↔ empresa**: el **servicio** (`servicios.id`).
- **Función canónica**: `public.user_can_access_servicio(servicio_uuid uuid)` — `SECURITY DEFINER`, `SET search_path = public` (ver migración core).
- **Conductor**: acceso si `servicios.conductor_id = auth.uid()`.
- **Empresa**: `empresas.owner_id` del `servicios.empresa_id`, o propietario de flota vía `conductor_empresa` cuando el servicio es de conductor de flota.

Documentación de estándar para tablas nuevas: `docs/SUPABASE_RLS_STANDARD.md`.

## 3. Inventario de tablas cubiertas por migraciones versionadas

### 3.1 Core RLS (`20260514120000_rls_servicio_ownership_core.sql`)

Incluye (entre otras): `documentacion_envios`, `servicio_documentos_extra`, `servicios`, `stops`, `evidencias`, `asignaciones` (si existe), `empresas`, `conductor_empresa`, `ubicaciones`, `profiles`, `push_tokens` (si existe).

Funciones / triggers `SECURITY DEFINER` en este archivo llevan `SET search_path = public`.

### 3.2 Legacy por `user_id` (`20260515190000_storage_and_legacy_rls.sql`)

Solo si `to_regclass` encuentra la tabla: `entries`, `gastos`, `km_logs`, `cmr_docs`, `subscriptions` — RLS + políticas SELECT/INSERT/UPDATE/DELETE para `user_id = auth.uid()` + `GRANT` a `authenticated` y `service_role`.

**Riesgo si el esquema real difiere**: la migración asume columna `user_id`. Ajustar manualmente si alguna tabla usa otro nombre (`owner_id`, etc.).

### 3.3 Tablas lógicas de producto (código / dominio)

En `src/domain/service/serviceExpediente.js` se referencian buckets lógicos: `cmr`, `incidencias`, `fotos`, `documentos`. **En migraciones actuales solo están endurecidos `user-photos` y `cmr` en Storage.** Si en Supabase existen buckets `evidencias`, `documentos`, `fotos`, `incidencias`, `uploads`, `PDFs`, etc., cada uno necesita:

1. `public = false` salvo decisión explícita de negocio.
2. Políticas en `storage.objects` separadas (SELECT / INSERT / UPDATE / DELETE).
3. Convención de clave: hoy las rutas son `{uid}/...`; enlazar a `user_can_access_servicio` vía `servicio_id` en la ruta o en `metadata` es **mejora futura** recomendada.

## 4. Storage — buckets y políticas

### 4.1 Aplicado en SQL versionado

- `UPDATE storage.buckets SET public = false` para nombres (o ids) `user-photos` y `cmr`.
- `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`.
- Políticas con prefijos estables (`stor_uph_*`, `stor_cmr_*`): propio UID en `split_part(name,'/',1)`, lectura adicional para **owner de flota** sobre objetos cuyo primer segmento es el UID de un conductor vinculado en `conductor_empresa`.

### 4.2 Pendiente en proyectos con más buckets

Auditar en Dashboard **cada** bucket (evidencias, documentos, fotos, PDFs, uploads, …): flag público y lista de políticas. Borrar políticas legacy del tipo “authenticated puede todo”.

### 4.3 Signed URLs (cliente)

- **CMR** (`cuaderno-ruta.jsx`): subida autenticada; URL de lectura vía `storage/v1/object/sign/cmr/...` (expiración acotada en petición).
- **Foto perfil** (`uploadUserPhoto.js`): firma con reintento; sin fallback a URL pública permanente si falla la firma.

No exponer CMR, facturas, POD ni expediente con enlaces públicos permanentes.

## 5. Funciones `SECURITY DEFINER`

Revisar en Supabase **Functions** cualquier función no versionada aquí. En migraciones del repo, las definidas como `SECURITY DEFINER` incluyen `search_path = public`:

- `user_can_access_servicio`
- `documentacion_envios_bi_set_meta`

## 6. Uso de `service_role` en backend

| Archivo | Uso | Validación previa |
|---------|-----|-------------------|
| `api/push.mjs` | Cliente Supabase con service key para FCM / tokens | `getUser` con Bearer; `notify_assignment` → `assertCallerMayNotifyAssignment` |
| `api/stripe.js` | REST con service key sobre `subscriptions` | `create_checkout` y `check_subscription` requieren `Authorization: Bearer` + JWT válido (anon + `getUser`); `user_id` del body no puede contradecir el JWT; webhook solo Stripe firmado |
| `api/send-docs-email.js` | Resend (no Supabase) | Allowlist HTTPS a `/storage/v1/` en host Supabase del proyecto |

**Recordatorio**: `service_role` **no** está sujeto a RLS. Toda ruta que lo use debe replicar las reglas de negocio o delegar en datos ya filtrados por el usuario autenticado.

Variables recomendadas en Vercel (o equivalente):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (misma clave anon que el cliente; necesaria para validar Bearer en `stripe.js`)
- `SUPABASE_SERVICE_ROLE_KEY` (unificar nombre; se acepta fallback `SUPABASE_SERVICE_KEY` por compatibilidad)

## 7. Auditoría global (checklist SQL remoto)

Ejecutar o adaptar en SQL Editor (requiere permisos sobre catálogo del proyecto):

```sql
-- Tablas en public sin RLS
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;
```

Para políticas: `SELECT * FROM pg_policies WHERE schemaname = 'public';`  
Para grants: `information_schema.table_privileges` filtrando `grantee IN ('authenticated','anon','service_role')`.

## 8. Riesgos corregidos (esta iteración)

- Migración storage: `DO` blocks con sintaxis PL/pgSQL correcta (`END;` + cierre `$$`).
- Buckets `user-photos` y `cmr` forzados a no públicos; políticas granulares en `storage.objects`.
- Tablas legacy condicionadas con RLS por `user_id` cuando existen.
- `api/stripe.js`: cierre de IDOR sobre `check_subscription` / metadata de checkout mediante JWT obligatorio.
- `api/send-docs-email.js`: mitigación SSRF en descarga de adjuntos (solo Storage Supabase HTTPS).

## 9. Riesgos pendientes / decisiones

1. **Buckets adicionales** no cubiertos por la migración 20260515190000: añadir políticas equivalentes o consolidar archivos en buckets ya cubiertos.
2. **Políticas duplicadas o permisivas** creadas manualmente en el pasado en el proyecto: revisión manual en Dashboard.
3. **`create_checkout` sin Bearer**: ahora responde 401; el cliente debe enviar `Authorization` (actualizado en `PaywallScreen` y banner de prueba).
4. **`api/cmr.js` / `api/chat.js`**: no usan Supabase; el riesgo es abuso de API externa (rate limit, API keys) — fuera de RLS.
5. **`api/admin.js`**: correo de bienvenida sin vínculo fuerte a “solo mi usuario”; evaluar secreto compartido o desactivar en producción si no se usa.

## 10. Checklist para nuevas migraciones (Supabase / SaaS)

Reutilizar y ampliar `docs/SUPABASE_RLS_STANDARD.md`. Mínimo:

1. [ ] `GRANT` explícitos a `authenticated` (solo lo necesario) y `ALL` a `service_role` si aplica servidor.
2. [ ] `REVOKE ALL ... FROM PUBLIC` cuando proceda.
3. [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
4. [ ] Políticas **separadas** por comando (SELECT / INSERT / UPDATE / DELETE), sin “authenticated ve todo”.
5. [ ] Columnas de ownership: `servicio_id` o `empresa_id` / `user_id` según modelo; `created_by` donde tenga sentido.
6. [ ] `created_at` / `updated_at` (timestamptz).
7. [ ] Funciones `SECURITY DEFINER` con `SET search_path = public` y `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE` mínimo.
8. [ ] Storage: bucket no público; políticas en `storage.objects`; rutas y metadatos alineados con `user_can_access_servicio` si el objeto pertenece a un servicio.
9. [ ] Ningún endpoint propio que use `service_role` sin validar identidad y autorización de negocio.

## 11. Orden sugerido de despliegue

1. Backup del proyecto Supabase.
2. `20260513120000_servicio_extra_docs_mail.sql` (si aún no está aplicada) — o crear tablas solo desde migraciones consolidadas.
3. `20260514120000_rls_servicio_ownership_core.sql`
4. `20260515190000_storage_and_legacy_rls.sql`
5. Variables de entorno en hosting (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`).
6. Prueba manual: login conductor / empresa, subida CMR, lectura firma, push, stripe checkout (con sesión).

---

*Última actualización del documento alineada con migraciones `20260514120000_*`, `20260515190000_*` y APIs `push.mjs`, `stripe.js`, `send-docs-email.js`.*
