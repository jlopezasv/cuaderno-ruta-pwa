-- Validación post-migración: sync operativa conductor ↔ empresa
-- Ejecutar en Supabase → SQL Editor (o: supabase db execute --file scripts/validar-sync-operativa.sql)

-- 1) Política de lectura flota en ubicaciones
SELECT
  pol.polname AS policy_name,
  pol.polcmd AS cmd,
  CASE pol.polpermissive WHEN true THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS permissive
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND cls.relname = 'ubicaciones'
  AND pol.polname = 'ubi_sel_empresa_flota';

-- Debe devolver 1 fila. Si 0 filas, aplicar migración:
-- supabase/migrations/20260518200000_ubicaciones_select_empresa_flota.sql

-- 2) Todas las políticas SELECT sobre ubicaciones (debe coexistir ubi_sel + ubi_sel_empresa_flota)
SELECT pol.polname, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND cls.relname = 'ubicaciones'
  AND pol.polcmd = 'r'
ORDER BY pol.polname;

-- 3) Muestra (solo lectura) últimas ubicaciones con contexto operativo — revisar empresa_id / servicio_id
SELECT
  u.user_id,
  u.empresa_id,
  u.servicio_id,
  u.event_type,
  u.ts,
  u.lat,
  u.lon
FROM public.ubicaciones u
ORDER BY u.ts DESC NULLS LAST
LIMIT 15;

-- 4) Conductores activos por empresa (referencia para cruzar con 3)
SELECT
  ce.empresa_id,
  ce.user_id,
  ce.activo,
  e.nombre AS empresa_nombre
FROM public.conductor_empresa ce
JOIN public.empresas e ON e.id = ce.empresa_id
WHERE ce.activo IS DISTINCT FROM false
ORDER BY ce.updated_at DESC NULLS LAST
LIMIT 20;

-- 5) Servicios en curso o asignados con referencia (ETA operativa en referencia.operational_eta)
SELECT
  s.id,
  s.conductor_id,
  s.empresa_id,
  s.estado,
  (s.referencia->'operational_eta' IS NOT NULL) AS tiene_operational_eta
FROM public.servicios s
WHERE s.estado IN ('asignado', 'en_curso')
ORDER BY s.updated_at DESC NULLS LAST
LIMIT 15;
