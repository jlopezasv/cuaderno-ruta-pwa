# Release baseline producción — migraciones y alcance

**Commit baseline:** ver tag `v1.0.0-baseline` / rama `main` tras merge desde `develop`.  
**Supabase REAL:** `glyexutcypmhkndvmcxd`  
**Vercel prod:** `tacografo-pro.vercel.app`  
**NO aplicar en prod:** migraciones `debug_*`, seeds demo, scripts `repair-*` salvo datos contaminados.

---

## Checklist exacto — migraciones producción (29 archivos, orden obligatorio)

Ejecutar en Supabase SQL Editor (proyecto REAL) **en este orden**:

| # | Archivo |
|---|---------|
| 1 | `supabase/migrations/20260513120000_servicio_extra_docs_mail.sql` |
| 2 | `supabase/migrations/20260514120000_rls_servicio_ownership_core.sql` |
| 3 | `supabase/migrations/20260515190000_storage_and_legacy_rls.sql` |
| 4 | `supabase/migrations/20260516120000_profiles_is_archived.sql` |
| 5 | `supabase/migrations/20260517130000_ubicaciones_operativa_columns.sql` |
| 6 | `supabase/migrations/20260518120000_servicios_empresa_id_optional.sql` |
| 7 | `supabase/migrations/20260518140000_empresas_codigo_equipo.sql` |
| 8 | `supabase/migrations/20260518160000_revoke_anon_table_grants.sql` |
| 9 | `supabase/migrations/20260518200000_ubicaciones_select_empresa_flota.sql` |
| 10 | `supabase/migrations/20260519120000_evidencias_doc_meta.sql` |
| 11 | `supabase/migrations/20260519120000_servicio_documentos_extra_schema_align.sql` |
| 12 | `supabase/migrations/20260520130000_extra_docs_empresa_select.sql` |
| 13 | `supabase/migrations/20260521120000_servicio_sin_conductor_y_asignaciones.sql` |
| 14 | `supabase/migrations/20260521140000_servicios_rls_pendiente_asignacion.sql` |
| 15 | `supabase/migrations/20260521150000_servicios_rls_sin_conductor_definitivo.sql` |
| 16 | `supabase/migrations/20260521160000_servicios_estado_pendiente_asignacion.sql` |
| 17 | `supabase/migrations/20260522120000_stops_rls_conductor_empresa.sql` |
| 18 | `supabase/migrations/20260522130000_servicios_estado_cerrado.sql` |
| 19 | `supabase/migrations/20260523120000_repair_servicios_rls_functions.sql` |
| 20 | `supabase/migrations/20260525130000_fase1_cerrado_to_completado.sql` |
| 21 | `supabase/migrations/20260526120000_incidencias_operativas.sql` |
| 22 | `supabase/migrations/20260527120000_profiles_can_drive.sql` |
| 23 | `supabase/migrations/20260528120000_product1_account_types.sql` |
| 24 | `supabase/migrations/20260528140000_autonomo_pro_servicios_rls_repair.sql` |
| 25 | `supabase/migrations/20260529120000_servicios_rls_autonomo_pro_ownership.sql` |
| 26 | `supabase/migrations/20260529180000_fix_user_can_insert_servicio_autonomo_pro.sql` |
| 27 | `supabase/migrations/20260529200000_user_can_insert_servicio_definitive.sql` |
| 28 | `supabase/migrations/20260530150000_incidencias_autonomo_pro.sql` |
| 29 | `supabase/migrations/20260530160000_autonomo_pro_servicio_tenant_enforce.sql` |

### Excluidos de producción (solo demo / diagnóstico)

| Archivo | Motivo |
|---------|--------|
| `20260530120000_debug_servicio_insert_rls_context.sql` | RPC diagnóstico |
| `20260530130000_debug_servicio_insert_rls_context_v2.sql` | idem |
| `20260530140000_debug_servicio_insert_rls_context_v3.sql` | idem |

### Verificación post-apply

```sql
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'user_can_access_servicio',
    'user_can_insert_servicio',
    'user_profile_is_autonomo_pro',
    'incidencias_validate_servicio_stop',
    'servicios_enforce_autonomo_pro_own_tenant'
  )
ORDER BY 1;

SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.servicios'::regclass
  AND NOT tgisinternal;

SELECT is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'incidencias' AND column_name = 'empresa_id';
-- Esperado: YES
```

---

## Resumen de cambios incluidos en el baseline (código)

### PRODUCT-1 / cuentas

- Tipos: `conductor`, `autonomo_pro`, `empresa`
- Shells y features (`accountModel`, `resolveAccountCapabilities`)
- `can_drive` + `empresa_status` (empresa pendiente/aprobada)

### Tenanting Autónomo PRO

- INSERT: `empresa_id` siempre `NULL` (cliente + trigger `servicios_bi_autonomo_pro_own_tenant`)
- Listados autónomo: `empresa_id=is.null`
- Panel empresa: solo servicios con `empresa_id` del tenant
- Ubicaciones: sin inferir `conductor_empresa` en servicios autónomos

### OperationalSummaryLite

- Módulo `src/modules/operational-lite/`
- Gates: `CAN_VIEW_OPERATIONAL_LITE` (Autónomo PRO, shell conductor)
- Tab Servicio + Docs → documento operacional + PDF

### Incidencias

- Tabla `incidencias`, vista resumen empresa
- `empresa_id` nullable + validación autónomo (`20260530150000`)

### Ownership / RLS (estado final en DB)

- `user_can_access_servicio`, `user_can_insert_servicio` (definitivo 29200000)
- `user_profile_is_autonomo_pro`, `servicio_is_autonomo_pro_owned`

### Hardening release (este commit)

- Eliminados panel RPC RLS debug, diagnósticos INSERT, logs operativos en producción
- `devOnlyLog` para trazas solo en `import.meta.env.DEV`

---

## Variables Vercel producción

```
VITE_APP_ENV=production
APP_ENV=production
VITE_ALLOW_PROD_SUPABASE=1
ALLOW_PROD_SUPABASE=1
VITE_SUPABASE_URL=https://glyexutcypmhkndvmcxd.supabase.co
(+ anon/service keys REAL)
```

**No configurar:** `VITE_DEMO_*`, seeds, `debug_servicio_insert_rls_context`.
