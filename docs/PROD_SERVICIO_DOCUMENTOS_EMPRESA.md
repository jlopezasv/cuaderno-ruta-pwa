# Producción — `servicio_documentos_empresa`

## ¿Es segura la migración demo (`20260531140000_…_demo.sql`)?

**Sí, a nivel de datos y RLS**, siempre que en producción existan ya:

- Tablas `servicios`, `empresas`
- Funciones `user_can_access_servicio(uuid)` y `user_can_access_empresa(uuid)`

La migración demo **no contiene UUIDs ni refs de proyecto demo**. Solo lleva comentarios de cabecera/comentario de tabla que dicen «DEMO» (cosmético).

| Criterio | Demo SQL | Notas |
|----------|----------|--------|
| Sin hardcode demo | ✅ | Ningún `empresa_id` / `owner_id` fijo |
| `CREATE TABLE IF NOT EXISTS` | ✅ | No pisa datos si la tabla ya existe |
| Índices | ✅ | `servicio_id`, `empresa_id` |
| RLS empresa/conductor | ✅ | SELECT vía servicio; INSERT/DELETE solo empresa |
| No borra datos | ✅ | Sin `DROP TABLE`, sin `DELETE`, sin `ALTER` destructivo |
| Políticas idempotentes | ✅ | `DROP POLICY IF EXISTS` solo en esta tabla |

**Mejora recomendada para prod:** usar `20260531150000_servicio_documentos_empresa.sql` (mismo esquema + índice `(servicio_id, created_at DESC)` y comentarios de producción).

## SQL exacto en Supabase **producción**

1. Dashboard → proyecto **REAL** (no demo) → **SQL Editor**.
2. Pegar y ejecutar **todo** el archivo:

`supabase/migrations/20260531150000_servicio_documentos_empresa.sql`

3. Comprobar:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'servicio_documentos_empresa'
ORDER BY ordinal_position;

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa';
```

Debe haber políticas `sdemp_sel`, `sdemp_ins`, `sdemp_del`.

## Storage (no va en esta migración)

La app sube a bucket `user-photos` con ruta:

`{auth.uid()}/documentos_empresa/{empresa_id}/{servicio_id}/…`

Eso encaja con las políticas existentes de `20260515190000_storage_and_legacy_rls.sql` (primer segmento = `auth.uid()`). **No hace falta migración storage adicional** si ese archivo ya está en prod.

## UI en producción

La UI usa `isEmpresaServicioDocumentsEnabled(servicio)` (`src/config/empresaServicioDocuments.js`): visible si el servicio tiene `empresa_id` (flota), en demo y producción.

Desplegar front en `tacografo-pro` con `VITE_APP_ENV=production` tras cambios de código.

## Si ya ejecutaste el SQL demo en producción por error

Es el mismo esquema. No hace falta volver a crear la tabla. Opcional:

```sql
COMMENT ON TABLE public.servicio_documentos_empresa IS
  'Documentos subidos por la empresa al servicio. Almacenamiento en bucket operativo (ruta documentos_empresa/{empresa_id}/{servicio_id}/).';

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_empresa_servicio_created
  ON public.servicio_documentos_empresa (servicio_id, created_at DESC);
```
