-- DEMO: reparar vehículo Conductor 2 en flota Transportes Demo
-- Ejecutar en SQL Editor del proyecto Supabase DEMO (postgres / service_role).
-- Idempotente: solo toca filas del user_id indicado.

BEGIN;

-- 1) Diagnóstico: todas las filas Conductor 2 Demo
SELECT
  ce.id,
  ce.user_id,
  ce.empresa_id,
  e.nombre AS empresa_nombre,
  ce.matricula,
  ce.remolque,
  ce.activo,
  ce.created_at
FROM public.conductor_empresa ce
LEFT JOIN public.empresas e ON e.id = ce.empresa_id
WHERE ce.user_id = '285cb3f1-adb9-4fe4-8e6f-d97f3ba2a7f9'
ORDER BY ce.empresa_id, ce.activo DESC, ce.created_at DESC;

-- 2) Perfil conductor (fuente de verdad si flota quedó vacía)
SELECT id, nombre, matricula, remolque, tipo_vehiculo
FROM public.profiles
WHERE id = '285cb3f1-adb9-4fe4-8e6f-d97f3ba2a7f9';

-- 3) Rellenar fila(s) activa(s) vacía(s) desde profiles
UPDATE public.conductor_empresa ce
SET
  matricula = COALESCE(NULLIF(TRIM(p.matricula), ''), ce.matricula),
  remolque = CASE
    WHEN COALESCE(p.tipo_vehiculo, 'articulado') = 'rigido' THEN NULL
    ELSE COALESCE(NULLIF(TRIM(p.remolque), ''), ce.remolque)
  END
FROM public.profiles p
WHERE p.id = '285cb3f1-adb9-4fe4-8e6f-d97f3ba2a7f9'
  AND ce.user_id = p.id
  AND ce.activo = true
  AND (
    COALESCE(TRIM(ce.matricula), '') = ''
    OR ce.remolque IS NULL
  );

-- 4) Desactivar duplicados (conserva 1 fila activa por empresa: la que tenga datos, luego la más reciente)
WITH ranked AS (
  SELECT
    ce.id,
    ce.empresa_id,
    ROW_NUMBER() OVER (
      PARTITION BY ce.empresa_id
      ORDER BY
        CASE
          WHEN COALESCE(TRIM(ce.matricula), '') <> '' OR ce.remolque IS NOT NULL THEN 0
          ELSE 1
        END,
        ce.created_at DESC
    ) AS rn
  FROM public.conductor_empresa ce
  WHERE ce.user_id = '285cb3f1-adb9-4fe4-8e6f-d97f3ba2a7f9'
    AND ce.activo = true
)
UPDATE public.conductor_empresa ce
SET activo = false
FROM ranked r
WHERE ce.id = r.id
  AND r.rn > 1;

-- 5) Verificación post-reparación
SELECT
  ce.id,
  ce.empresa_id,
  e.nombre AS empresa_nombre,
  ce.matricula,
  ce.remolque,
  ce.activo,
  ce.created_at
FROM public.conductor_empresa ce
LEFT JOIN public.empresas e ON e.id = ce.empresa_id
WHERE ce.user_id = '285cb3f1-adb9-4fe4-8e6f-d97f3ba2a7f9'
ORDER BY ce.empresa_id, ce.activo DESC, ce.created_at DESC;

COMMIT;
