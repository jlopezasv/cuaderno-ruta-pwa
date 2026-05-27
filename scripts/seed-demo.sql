-- =============================================================================
-- SEED DEMO — Cuaderno PWA (QA / desarrollo)
-- =============================================================================
-- Requisitos:
--   1) Migraciones aplicadas (supabase/migrations)
--   2) Opcional: scripts/seed-demo-auth.sql (usuarios Auth)
--   3) Reset previo: scripts/seed-demo-reset.sql
--
-- Login QA:
--   Empresa:    demo-empresa@cuaderno.test    / DemoCuaderno2026!
--   Conductor:  demo-conductor@cuaderno.test  / DemoCuaderno2026!
--   Autónomo PRO: demo-autonomo@cuaderno.test / DemoCuaderno2026!
--
-- Idempotente: ON CONFLICT / upserts por UUID fijo.
-- Sin dependencias del frontend.
-- =============================================================================

BEGIN;

-- ─── UUIDs fijos (namespace demo) ───────────────────────────────────────────
-- Empresa     a0000000-0000-4000-8000-000000000001
-- Owner       a0000000-0000-4000-8000-000000000010
-- Conductor   a0000000-0000-4000-8000-000000000020
-- Autónomo PRO a0000000-0000-4000-8000-000000000030
-- Servicio A  a0000000-0000-4000-8000-000000000101  (creado CON conductor)
-- Servicio B  a0000000-0000-4000-8000-000000000102  (sin conductor → asignado)
-- Stop A1 carga    a0000000-0000-4000-8000-000000000201
-- Stop A2 descarga a0000000-0000-4000-8000-000000000202
-- Stop B1 carga    a0000000-0000-4000-8000-000000000211
-- Stop B2 descarga a0000000-0000-4000-8000-000000000212
-- Evidencias     a0000000-0000-4000-8000-000000000301 .. 304
-- Extra doc      a0000000-0000-4000-8000-000000000401

DO $$
DECLARE
  v_empresa uuid := 'a0000000-0000-4000-8000-000000000001';
  v_owner uuid := 'a0000000-0000-4000-8000-000000000010';
  v_conductor uuid := 'a0000000-0000-4000-8000-000000000020';
  v_svc1 uuid := 'a0000000-0000-4000-8000-000000000101';
  v_svc2 uuid := 'a0000000-0000-4000-8000-000000000102';
  v_stop_a1 uuid := 'a0000000-0000-4000-8000-000000000201';
  v_stop_a2 uuid := 'a0000000-0000-4000-8000-000000000202';
  v_stop_b1 uuid := 'a0000000-0000-4000-8000-000000000211';
  v_stop_b2 uuid := 'a0000000-0000-4000-8000-000000000212';
  v_now timestamptz := now();
  v_trip_start timestamptz := v_now - interval '3 hours';
  v_assigned_at timestamptz := v_now - interval '26 hours';
  v_created_b timestamptz := v_now - interval '48 hours';
  v_photo_url text := 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&q=85';
  v_plan jsonb;
  v_eta jsonb;
  v_meta_base jsonb;
  v_ref_svc1 text;
  v_ref_svc2 text;
  v_stop_meta_entrada text;
  v_stop_meta_salida text;
BEGIN
  -- ─── Plan + ETA (estructura compatible con app) ─────────────────────────
  v_plan := jsonb_build_object(
    'status', 'ok',
    'route_plan_status', 'ready',
    'snapshot_at', v_now,
    'input_origin', 'Madrid, España',
    'input_destination', 'Valencia, España',
    'planned_origin', 'Madrid',
    'planned_destination', 'Valencia',
    'planned_km', 356,
    'planned_drive_min', 270,
    'planned_drive_time', '4h 30min',
    'planned_eta', (v_now + interval '5 hours')::text,
    'planned_eta_label', 'Hoy · ETA demo',
    'planned_breaks', 1,
    'planned_daily_rest', false,
    'planned_daily_rest_label', 'Sin descanso diario previsto',
    'planned_summary', '356 km · 4h 30min conducción · 1 pausa',
    'planned_route', jsonb_build_object(
      'legs', jsonb_build_array(jsonb_build_object(
        'from', 'Madrid', 'to', 'Valencia', 'km', 356, 'mins', 270, 'real', true
      )),
      'coords', jsonb_build_array(
        jsonb_build_array(-3.7038, 40.4168),
        jsonb_build_array(-0.3763, 39.4699)
      )
    ),
    'confidence', 'high',
    'velocidad', 80,
    'demo_seed', true
  );

  v_eta := jsonb_build_object(
    'status', 'ok',
    'eta', (v_now + interval '4 hours')::text,
    'eta_ts', (v_now + interval '4 hours')::text,
    'eta_label', 'Hoy · 16:30 (demo)',
    'label', 'Hoy · 16:30 (demo)',
    'confidence', 'medium',
    'source', 'demo_seed',
    'event_type', 'demo_seed',
    'calculated_at', v_now,
    'updated_at', v_now,
    'last_eta_refresh_at', v_now,
    'lat', 40.42,
    'lon', -3.70,
    'precision_m', 15,
    'planned_eta', (v_now + interval '5 hours')::text,
    'delta_min', -30,
    'remaining_mins', 240,
    'remaining_km', 280
  );

  v_meta_base := jsonb_build_object(
    'demo_seed', true,
    'schema_seed_version', 1,
    'operational_trip_started_at', v_trip_start,
    'operational_plan', v_plan,
    'operational_plan_confirmed_at', v_trip_start,
    'operational_eta', v_eta,
    'cliente', 'Cliente Demo QA',
    'referencia_cliente', 'REF-CLIENTE-DEMO-001'
  );

  v_ref_svc1 := 'DEMO-CON-001' || E'\n__SRV_OP__:' || (v_meta_base || jsonb_build_object(
    'conductor_assigned_at', v_trip_start,
    'conductor_assigned_id', v_conductor,
    'conductor_assigned_label', 'Carlos Demo Conductor'
  ))::text;

  v_ref_svc2 := 'DEMO-SIN-COND-002' || E'\n__SRV_OP__:' || (v_meta_base || jsonb_build_object(
    'conductor_assigned_at', v_assigned_at,
    'conductor_assigned_id', v_conductor,
    'conductor_assigned_label', 'Carlos Demo Conductor',
    'empresa_assign_bootstrap_at', v_assigned_at
  ))::text;

  v_stop_meta_entrada := 'Muelle demo · entrada registrada' || E'\n\n__CUADERNO_OP__:' || jsonb_build_object(
    'inicio_operacion_at', (v_now - interval '2 hours'),
    'entrada_geo', jsonb_build_object('lat', 40.45, 'lon', -3.72, 'accuracy_m', 12, 'captured_at', v_now)
  )::text;

  v_stop_meta_salida := 'Muelle demo · salida registrada' || E'\n\n__CUADERNO_OP__:' || jsonb_build_object(
    'salida_geo', jsonb_build_object('lat', 40.46, 'lon', -3.71, 'accuracy_m', 10, 'captured_at', v_now)
  )::text;

  -- ─── 1 Empresa ───────────────────────────────────────────────────────────
  INSERT INTO public.empresas (id, nombre, cif, owner_id, codigo_equipo)
  VALUES (v_empresa, 'Cuaderno Demo QA', 'B12345678', v_owner, 'DEMO-QA')
  ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    owner_id = EXCLUDED.owner_id,
    codigo_equipo = EXCLUDED.codigo_equipo;

  -- ─── 2 Perfiles ──────────────────────────────────────────────────────────
  INSERT INTO public.profiles (id, nombre, tipo_cuenta, empresa, matricula, updated_at, is_archived, can_drive, empresa_status)
  VALUES
    (v_owner, 'Ana Demo Empresa', 'empresa', 'Cuaderno Demo QA', NULL, v_now, false, true, 'approved'),
    (v_conductor, 'Carlos Demo Conductor', 'conductor', 'Cuaderno Demo QA', '1234-DEMO', v_now, false, false, NULL),
    (v_autonomo, 'Laura Demo Autónomo PRO', 'autonomo_pro', NULL, '5678-DEMO', v_now, false, false, NULL)
  ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    tipo_cuenta = EXCLUDED.tipo_cuenta,
    empresa = EXCLUDED.empresa,
    matricula = EXCLUDED.matricula,
    updated_at = v_now,
    is_archived = false,
    can_drive = EXCLUDED.can_drive,
    empresa_status = EXCLUDED.empresa_status;

  -- ─── 3 conductor_empresa ───────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.conductor_empresa WHERE empresa_id = v_empresa AND user_id = v_conductor) THEN
    UPDATE public.conductor_empresa SET activo = true WHERE empresa_id = v_empresa AND user_id = v_conductor;
  ELSE
    INSERT INTO public.conductor_empresa (empresa_id, user_id, activo)
    VALUES (v_empresa, v_conductor, true);
  END IF;

  -- ─── 4 Servicios ───────────────────────────────────────────────────────────
  INSERT INTO public.servicios (
    id, empresa_id, conductor_id, estado, origen, destino, referencia, fecha_inicio
  ) VALUES (
    v_svc1, v_empresa, v_conductor, 'en_curso',
    'Madrid, España', 'Valencia, España', v_ref_svc1, v_trip_start
  )
  ON CONFLICT (id) DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    conductor_id = EXCLUDED.conductor_id,
    estado = EXCLUDED.estado,
    origen = EXCLUDED.origen,
    destino = EXCLUDED.destino,
    referencia = EXCLUDED.referencia,
    fecha_inicio = EXCLUDED.fecha_inicio;

  -- Servicio B: planificado sin conductor → asignado después (conductor_assigned_at en __SRV_OP__)
  INSERT INTO public.servicios (
    id, empresa_id, conductor_id, estado, origen, destino, referencia, fecha_inicio
  ) VALUES (
    v_svc2, v_empresa, v_conductor, 'en_curso',
    'Barcelona, España', 'Zaragoza, España', v_ref_svc2, v_assigned_at
  )
  ON CONFLICT (id) DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    conductor_id = EXCLUDED.conductor_id,
    estado = EXCLUDED.estado,
    referencia = EXCLUDED.referencia;

  -- Columnas opcionales identidad servicio
  BEGIN
    UPDATE public.servicios SET
      cliente = 'Cliente Demo QA',
      service_number = CASE id
        WHEN v_svc1 THEN 'DEMO-CON-001'
        WHEN v_svc2 THEN 'DEMO-SIN-COND-002'
      END,
      referencia_cliente = 'REF-CLIENTE-DEMO-001'
    WHERE id IN (v_svc1, v_svc2);
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  -- ─── 5 Paradas ─────────────────────────────────────────────────────────────
  INSERT INTO public.stops (
    id, servicio_id, orden, tipo, nombre, direccion, notas, estado,
    hora_llegada_real, hora_salida_real
  ) VALUES
    (v_stop_a1, v_svc1, 1, 'carga', 'Planta Demo Madrid', 'Polígono Demo, Madrid',
     v_stop_meta_entrada, 'completado', v_now - interval '2 hours', v_now - interval '90 minutes'),
    (v_stop_a2, v_svc1, 2, 'descarga', 'Hub Demo Valencia', 'Puerto Demo, Valencia',
     NULL, 'pendiente', NULL, NULL),
    (v_stop_b1, v_svc2, 1, 'carga', 'Terminal Demo BCN', 'Zona Franca Demo, Barcelona',
     v_stop_meta_salida, 'completado', v_now - interval '20 hours', v_now - interval '18 hours'),
    (v_stop_b2, v_svc2, 2, 'descarga', 'Depósito Demo ZGZ', 'Mercancías Demo, Zaragoza',
     NULL, 'pendiente', NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    servicio_id = EXCLUDED.servicio_id,
    orden = EXCLUDED.orden,
    tipo = EXCLUDED.tipo,
    nombre = EXCLUDED.nombre,
    estado = EXCLUDED.estado,
    notas = EXCLUDED.notas,
    hora_llegada_real = EXCLUDED.hora_llegada_real,
    hora_salida_real = EXCLUDED.hora_salida_real;

  -- ─── 6 Asignaciones ───────────────────────────────────────────────────────
  IF to_regclass('public.servicio_asignaciones') IS NOT NULL THEN
    DELETE FROM public.servicio_asignaciones WHERE servicio_id IN (v_svc1, v_svc2);
    INSERT INTO public.servicio_asignaciones (id, servicio_id, conductor_id, stop_id, tipo_asignacion, created_at)
    VALUES
      ('a0000000-0000-4000-8000-000000000501', v_svc1, v_conductor, NULL, 'principal', v_trip_start),
      ('a0000000-0000-4000-8000-000000000502', v_svc2, v_conductor, NULL, 'principal', v_assigned_at);
  END IF;

  IF to_regclass('public.asignaciones') IS NOT NULL THEN
    DELETE FROM public.asignaciones WHERE servicio_id IN (v_svc1, v_svc2);
    INSERT INTO public.asignaciones (servicio_id, conductor_id, tipo, estado, created_at)
    VALUES
      (v_svc1, v_conductor, 'principal', 'activa', v_trip_start),
      (v_svc2, v_conductor, 'principal', 'activa', v_assigned_at);
  END IF;

  -- ─── 7 Evidencias (foto color + CMR + incidencia) ─────────────────────────
  DELETE FROM public.evidencias WHERE id IN (
    'a0000000-0000-4000-8000-000000000301',
    'a0000000-0000-4000-8000-000000000302',
    'a0000000-0000-4000-8000-000000000303',
    'a0000000-0000-4000-8000-000000000304'
  );

  INSERT INTO public.evidencias (id, stop_id, tipo, url, nota, datos, created_at)
  VALUES
    (
      'a0000000-0000-4000-8000-000000000301',
      v_stop_a1, 'foto', v_photo_url, 'Foto demo color — parada carga',
      jsonb_build_object(
        'doc_meta', jsonb_build_object(
          'schema_version', 1,
          'display_name', 'Foto_demo_carga_Madrid',
          'mime_type', 'image/jpeg',
          'size_bytes', 245000,
          'size_preview_bytes', 245000,
          'preview_url', v_photo_url,
          'original_url', v_photo_url,
          'upload_pipeline', 'foto_file_reader_jpeg',
          'tipo_documento', 'foto',
          'ciudad', 'Planta Demo Madrid',
          'evento_operacional', 'Foto operativa',
          'demo_seed', true
        )
      ),
      v_now - interval '100 minutes'
    ),
    (
      'a0000000-0000-4000-8000-000000000302',
      v_stop_a1, 'cmr', v_photo_url, 'CMR demo escaneado',
      jsonb_build_object(
        'num_cmr', 'CMR-DEMO-8842',
        'remitente', 'Remitente Demo SL',
        'destinatario', 'Destinatario Demo SA',
        'doc_meta', jsonb_build_object(
          'schema_version', 1,
          'display_name', 'CMR_demo_8842',
          'mime_type', 'image/jpeg',
          'preview_url', v_photo_url,
          'tipo_documento', 'cmr',
          'demo_seed', true
        )
      ),
      v_now - interval '95 minutes'
    ),
    (
      'a0000000-0000-4000-8000-000000000303',
      v_stop_b1, 'foto', v_photo_url, 'Foto tras asignación tardía',
      jsonb_build_object(
        'doc_meta', jsonb_build_object(
          'schema_version', 1,
          'display_name', 'Foto_demo_BCN',
          'mime_type', 'image/jpeg',
          'preview_url', v_photo_url,
          'original_url', v_photo_url,
          'upload_pipeline', 'foto_file_reader_jpeg',
          'tipo_documento', 'foto',
          'demo_seed', true
        )
      ),
      v_now - interval '17 hours'
    ),
    (
      'a0000000-0000-4000-8000-000000000304',
      v_stop_a2, 'incidencia', NULL, 'Retraso menor en descarga (demo)',
      jsonb_build_object('texto', 'Espera en muelle por documentación — demo QA'),
      v_now - interval '30 minutes'
    );

  -- ─── 8 Documento extra (servicio A) ───────────────────────────────────────
  DELETE FROM public.servicio_documentos_extra WHERE id = 'a0000000-0000-4000-8000-000000000401';

  INSERT INTO public.servicio_documentos_extra (
    id, servicio_id, empresa_id, conductor_id, tipo, descripcion,
    archivo_url, url, archivo_nombre, mime_type, size_bytes, datos, created_at
  ) VALUES (
    'a0000000-0000-4000-8000-000000000401',
    v_svc1, v_empresa, v_conductor, 'ticket',
    'Ticket repostaje demo QA',
    v_photo_url, v_photo_url,
    'ticket_demo.jpg', 'image/jpeg', 180000,
    jsonb_build_object('demo_seed', true, 'source', 'seed-demo.sql'),
    v_now - interval '80 minutes'
  );

  -- ─── 9 Ubicación operativa (opcional) ─────────────────────────────────────
  IF to_regclass('public.ubicaciones') IS NOT NULL THEN
    INSERT INTO public.ubicaciones (
      user_id, empresa_id, servicio_id, lat, lon, precision_m, event_type, ts
    ) VALUES (
      v_conductor, v_empresa, v_svc1, 40.42, -3.70, 12, 'entrada_muelle', v_now - interval '2 hours'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      lat = EXCLUDED.lat,
      lon = EXCLUDED.lon,
      precision_m = EXCLUDED.precision_m,
      empresa_id = EXCLUDED.empresa_id,
      servicio_id = EXCLUDED.servicio_id,
      event_type = EXCLUDED.event_type,
      ts = EXCLUDED.ts;
  END IF;

  RAISE NOTICE 'Seed demo completado. Empresa % · Servicios %, %', v_empresa, v_svc1, v_svc2;
END $$;

-- ─── Verificación ───────────────────────────────────────────────────────────
SELECT 'empresas' AS tabla, count(*)::int AS filas FROM public.empresas
  WHERE id = 'a0000000-0000-4000-8000-000000000001'
UNION ALL SELECT 'profiles', count(*)::int FROM public.profiles
  WHERE id IN ('a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000020')
UNION ALL SELECT 'conductor_empresa', count(*)::int FROM public.conductor_empresa
  WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001'
UNION ALL SELECT 'servicios', count(*)::int FROM public.servicios
  WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001'
UNION ALL SELECT 'stops', count(*)::int FROM public.stops
  WHERE servicio_id IN (
    'a0000000-0000-4000-8000-000000000101',
    'a0000000-0000-4000-8000-000000000102'
  )
UNION ALL SELECT 'evidencias', count(*)::int FROM public.evidencias e
  JOIN public.stops s ON s.id = e.stop_id
  WHERE s.servicio_id IN (
    'a0000000-0000-4000-8000-000000000101',
    'a0000000-0000-4000-8000-000000000102'
  )
UNION ALL SELECT 'servicio_documentos_extra', count(*)::int FROM public.servicio_documentos_extra
  WHERE servicio_id = 'a0000000-0000-4000-8000-000000000101';

SELECT id, estado, conductor_id IS NOT NULL AS tiene_conductor,
       position('__SRV_OP__' in coalesce(referencia, '')) > 0 AS tiene_srv_op,
       left(referencia, 40) AS ref_preview
FROM public.servicios
WHERE id IN (
  'a0000000-0000-4000-8000-000000000101',
  'a0000000-0000-4000-8000-000000000102'
);

COMMIT;
