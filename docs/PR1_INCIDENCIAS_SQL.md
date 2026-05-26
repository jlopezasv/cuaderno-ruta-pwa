# PR-1 — Incidencias operativas (SQL)

## SQL canónico validado en Demo

| Rol | Ruta absoluta (workspace) |
|-----|---------------------------|
| **Ejecutar en Supabase (Demo y Producción)** | `c:\Users\usuario\Desktop\cuaderno-pwa\scripts\sql-pr1-incidencias-demo-FINAL.sql` |
| SHA-256 (referencia) | `66D0D90C2A6ED74B8FA667EC69162365F181A7FB3BC3579A0B4E60B7C6009C93` |

Este archivo es el **único** SQL que debe aplicarse en Supabase para PR-1:

- Incluye **preflight** (`empresas`, `servicios`, `stops`, `evidencias`, `user_can_access_servicio`).
- Va en **transacción** (`BEGIN` … `COMMIT`).
- Es **idempotente** (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).
- Fue el script unificado creado tras UAT parcial en Demo; la validación post-ejecución está en `scripts/validar-pr1-demo-post.sql`.

**No usar** en Producción los trozos históricos `sql-demo-paso1-*.sql` / `sql-demo-paso2-incidencias.sql` (solo sirvieron durante el despliegue parcial en Demo).

## Migración en repo (no idéntica al validado)

| Archivo | Notas |
|---------|--------|
| `supabase/migrations/20260526120000_incidencias_operativas.sql` | Copia de referencia para el repositorio. **No es byte-a-byte igual** al FINAL (sin preflight, sin `BEGIN`/`COMMIT`, menos `DROP POLICY` defensivos). SHA-256: `B88D52EB7F850CFD95C9260B34168B86EB7EAB804D11F6E8BC5A180139A9C9C1` |

Para Producción, **no sustituir** el FINAL por la migración.

## Contenido de PR-1

- Tabla `public.incidencias`
- Columna `public.evidencias.incidencia_id` (fotos adjuntas, `tipo=foto`)
- Vista `public.v_servicio_incidencias_resumen` (`total_incidencias`, `total_fotos`, `servicio_estado_actual`, …)
- RLS: SELECT/INSERT en `incidencias`; políticas `evidencias` ampliadas (`ev_sel`, `ev_ins`, `ev_upd`, `ev_del`)
- Triggers de coherencia servicio/parada/adjunto

## Aplicar en Supabase (SQL Editor)

1. Proyecto correcto (**Demo** `fezacjtbavgdosncxlzw` o **Producción** — nunca al revés).
2. **SQL Editor** → **New query**.
3. Abrir `scripts/sql-pr1-incidencias-demo-FINAL.sql` en el repo y pegar **todo** el contenido (437 líneas).
4. **Run** → debe terminar en **Success** (sin error en rojo).
5. Ejecutar comprobación: `scripts/validar-pr1-demo-post.sql` (solo lectura).

## Aplicar vía psql (opcional)

```powershell
cd c:\Users\usuario\Desktop\cuaderno-pwa
$env:SUPABASE_DB_URL = "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
node scripts/apply-sql-file.mjs scripts/sql-pr1-incidencias-demo-FINAL.sql
```

Sustituir connection string por la de **Producción** (Dashboard → Project Settings → Database → URI).  
`apply-sql-file.mjs` usa `SUPABASE_DB_URL_DEMO` o `SUPABASE_DB_URL`; para prod conviene `SUPABASE_DB_URL`.

## Verificación mínima

```sql
SELECT to_regclass('public.incidencias') IS NOT NULL AS tabla_ok;
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'evidencias' AND column_name = 'incidencia_id'
) AS columna_ok;
SELECT to_regclass('public.v_servicio_incidencias_resumen') IS NOT NULL AS vista_ok;
SELECT COUNT(*)::int FROM public.incidencias;
```

## Producción

1. Ventana de mantenimiento acordada (el script redefine políticas `evidencias`).
2. Backup o snapshot de BD.
3. Ejecutar **exactamente** `scripts/sql-pr1-incidencias-demo-FINAL.sql` (mismo archivo que Demo).
4. Ejecutar `scripts/validar-pr1-demo-post.sql`.
5. Desplegar app (`develop` / release con PR-2 incidencias) **después** de que el SQL esté aplicado.

## Scripts auxiliares (repo)

| Archivo | Uso |
|---------|-----|
| `scripts/validar-pr1-demo-post.sql` | Checks post-migración |
| `scripts/validar-incidencias-pr1.sql` | Validación alternativa |
| `scripts/sql-demo-paso1-incidencias.sql` | Histórico — no usar en prod |
| `scripts/sql-demo-paso1-resto.sql` | Histórico — no usar en prod |
| `scripts/sql-demo-paso2-incidencias.sql` | Histórico — no usar en prod |
| `scripts/apply-sql-file.mjs` | Runner psql |
