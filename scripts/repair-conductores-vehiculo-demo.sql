-- DEMO: reparar vehículo en flota (perfil → conductor_empresa) para conductores Demo.
-- Ejecutar en SQL Editor del proyecto Supabase DEMO.
-- Idempotente.

BEGIN;

-- Conductor 1 Demo
SELECT id, nombre, matricula, remolque, tipo_vehiculo
FROM public.profiles
WHERE id = '7cda6b18-9016-40bd-a560-3c409be0b2fd';

UPDATE public.conductor_empresa ce
SET
  matricula = COALESCE(NULLIF(TRIM(p.matricula), ''), ce.matricula),
  remolque = CASE
    WHEN COALESCE(p.tipo_vehiculo, 'articulado') = 'rigido' THEN NULL
    ELSE COALESCE(NULLIF(TRIM(p.remolque), ''), ce.remolque)
  END
FROM public.profiles p
WHERE p.id = '7cda6b18-9016-40bd-a560-3c409be0b2fd'
  AND ce.user_id = p.id
  AND ce.activo = true
  AND (
    COALESCE(TRIM(ce.matricula), '') = ''
    OR COALESCE(TRIM(ce.remolque), '') = ''
  );

-- Conductor 2 Demo (mismo criterio)
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
    OR COALESCE(TRIM(ce.remolque), '') = ''
  );

-- Verificación
SELECT ce.user_id, p.nombre, ce.matricula, ce.remolque, ce.activo
FROM public.conductor_empresa ce
JOIN public.profiles p ON p.id = ce.user_id
WHERE ce.user_id IN (
  '7cda6b18-9016-40bd-a560-3c409be0b2fd',
  '285cb3f1-adb9-4fe4-8e6f-d97f3ba2a7f9'
)
  AND ce.activo = true
ORDER BY p.nombre;

COMMIT;
