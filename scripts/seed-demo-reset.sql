-- =============================================================================
-- RESET datos demo Cuaderno PWA (idempotente, solo UUIDs del namespace demo)
-- Ejecutar en Supabase SQL Editor como postgres / service_role
-- Orden: hijos → padres (respeta FKs)
-- =============================================================================

BEGIN;

-- UUIDs fijos (deben coincidir con scripts/seed-demo.sql)
-- Empresa: a0000000-0000-4000-8000-000000000001
-- Owner:   a0000000-0000-4000-8000-000000000010
-- Conductor: a0000000-0000-4000-8000-000000000020
-- Svc1: a0000000-0000-4000-8000-000000000101
-- Svc2: a0000000-0000-4000-8000-000000000102

DO $$
DECLARE
  v_empresa uuid := 'a0000000-0000-4000-8000-000000000001';
  v_owner uuid := 'a0000000-0000-4000-8000-000000000010';
  v_conductor uuid := 'a0000000-0000-4000-8000-000000000020';
  v_svc1 uuid := 'a0000000-0000-4000-8000-000000000101';
  v_svc2 uuid := 'a0000000-0000-4000-8000-000000000102';
  v_stop_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_stop_ids
  FROM public.stops
  WHERE servicio_id IN (v_svc1, v_svc2);

  IF v_stop_ids IS NOT NULL AND cardinality(v_stop_ids) > 0 THEN
    DELETE FROM public.evidencias WHERE stop_id = ANY (v_stop_ids);
  END IF;

  DELETE FROM public.servicio_documentos_extra
  WHERE servicio_id IN (v_svc1, v_svc2);

  DELETE FROM public.documentacion_envios
  WHERE servicio_id IN (v_svc1, v_svc2);

  IF to_regclass('public.servicio_asignaciones') IS NOT NULL THEN
    DELETE FROM public.servicio_asignaciones
    WHERE servicio_id IN (v_svc1, v_svc2);
  END IF;

  IF to_regclass('public.asignaciones') IS NOT NULL THEN
    DELETE FROM public.asignaciones
    WHERE servicio_id IN (v_svc1, v_svc2);
  END IF;

  DELETE FROM public.stops WHERE servicio_id IN (v_svc1, v_svc2);
  DELETE FROM public.servicios WHERE id IN (v_svc1, v_svc2);

  DELETE FROM public.ubicaciones
  WHERE user_id IN (v_owner, v_conductor)
     OR servicio_id IN (v_svc1, v_svc2);

  DELETE FROM public.conductor_empresa WHERE empresa_id = v_empresa;

  DELETE FROM public.empresas WHERE id = v_empresa;

  -- Perfiles demo (no borra auth.users — ver seed-demo-auth.sql)
  DELETE FROM public.profiles WHERE id IN (v_owner, v_conductor);

  RAISE NOTICE 'Reset demo OK (empresa %). Auth users no eliminados.', v_empresa;
END $$;

COMMIT;
