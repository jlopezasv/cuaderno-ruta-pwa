# Comparar Supabase REAL vs DEMO

Herramientas para detectar **tablas, columnas, buckets, policies RLS, triggers y funciones** faltantes en DEMO respecto a REAL, y aplicar SQL **incremental** sin borrar datos.

## 1. Exportar inventario

En **SQL Editor** de cada proyecto (REAL y DEMO), ejecuta:

`scripts/audit-supabase-inventory.sql`

Copia el JSON de la columna `inventory` y guárdalo como:

- `inventory/real.json`
- `inventory/demo.json`

(O con `psql` y variables de conexión directa Postgres — ver abajo.)

## 2. Comparar y generar parche

```bash
node scripts/compare-supabase-inventory.mjs inventory/real.json inventory/demo.json
```

Salida:

| Archivo | Contenido |
|---------|-----------|
| `inventory/gap-report.md` | Informe legible (qué falta en DEMO) |
| `inventory/demo-gap-fill.sql` | `ALTER TABLE … ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`, buckets |

Si faltan **políticas, funciones o triggers**, el informe indica ejecutar además el bundle completo del repo.

## 3. Aplicar en DEMO (orden recomendado)

Si aparece **`ERROR: must be owner of table`**, usa solo:

**`scripts/demo-safe-align.sql`**

- Sin `GRANT` / `REVOKE` / `ALTER OWNER`
- Omite tablas legacy (`entries`, `subscriptions`, `push_*`, etc.)
- Solo tablas operativas + policies + funciones + storage
- Omite con `NOTICE` lo que no puedas alterar por ownership

Alternativa (proyecto con permisos completos):

1. `inventory/demo-gap-fill.sql` — solo lo que el diff detectó.
2. `scripts/demo-align-incremental.sql` — bundle completo (17 migraciones). **No hace DELETE ni DROP TABLE.**

Opcional: datos de prueba → `seed-demo-auth.sql` → `seed-demo.sql` (ver comentarios en cada archivo).

## Export automático con psql

```bash
set SUPABASE_DB_URL_REAL=postgresql://postgres.[ref-real]:[pass]@...
set SUPABASE_DB_URL_DEMO=postgresql://postgres.[ref-demo]:[pass]@...
node scripts/compare-supabase-inventory.mjs --export
node scripts/compare-supabase-inventory.mjs inventory/real.json inventory/demo.json
```

(La URL está en Supabase → Project Settings → Database → Connection string.)

## Inventario canónico del repo (REAL esperado)

Referencia si DEMO se creó sin migraciones:

| Tipo | Objetos principales |
|------|---------------------|
| **Tablas nuevas** | `servicio_documentos_extra`, `documentacion_envios`, `servicio_asignaciones` |
| **Columnas** | `profiles.is_archived`, `empresas.codigo_equipo`, `documentacion_envios.empresa_id`, columnas `ubicaciones.*` operativas, columnas extra en `servicio_documentos_extra` |
| **Buckets** | `user-photos`, `cmr` (privados) |
| **Funciones** | `user_can_access_empresa`, `user_can_access_servicio`, `user_can_insert_servicio`, `documentacion_envios_bi_set_meta`, `profiles_enforce_is_archived_change`, `_empresa_codigo_base`, `empresas_bi_codigo_equipo_fn` (+ legacy `handle_new_user`, `es_jefe_de`, `generar_codigo_equipo` si existen en REAL) |
| **Triggers** | `documentacion_envios_bi_set_meta`, `tr_profiles_enforce_is_archived`, `empresas_bi_codigo_equipo` |
| **Policies** | Prefijos `srv_`, `stp_`, `ev_`, `sde_`, `de_`, `sa_`, `emp_`, `ce_`, `ubi_`, `prof_`, `stor_uph_`, `stor_cmr_`, `ubi_sel_empresa_flota`, legacy `*_own_*` |

Regenerar el bundle alineado tras cambiar migraciones:

```bash
node scripts/build-demo-align-incremental.mjs
```

## Nota sobre `supabase_audit/`

Carpeta con capturas parciales del proyecto REAL (mayo 2026). No sustituye el inventario JSON; úsala como referencia histórica.
