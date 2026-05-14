-- =============================================================================
-- Endurecer GRANTs: anon sin acceso operativo a tablas internas; authenticated
-- solo DML estándar (sin TRIGGER / REFERENCES / TRUNCATE). service_role total.
--
-- No toca: auth.*, storage.*, realtime publication (privilegios de tabla ≠
-- suscripción Realtime), ni funciones RPC. PostgREST con JWT sigue usando
-- el rol authenticated.
-- =============================================================================

DO $body$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'asignaciones',
    'conductor_empresa',
    'documentos',
    'empresas',
    'entries',
    'evidencias',
    'gastos',
    'parkings',
    'profiles',
    'push_schedule',
    'push_subscriptions',
    'push_tokens',
    'servicios',
    'stops',
    'subscriptions',
    'ubicaciones'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    -- anon: sin lectura ni escritura en tablas de negocio (RLS no sustituye GRANT)
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);

    -- authenticated: quitar privilegios que una app SaaS no usa en tablas de datos
    EXECUTE format(
      'REVOKE TRIGGER, REFERENCES, TRUNCATE ON TABLE public.%I FROM authenticated',
      tbl
    );

    -- Reafirmar DML para PostgREST / supabase-js (idempotente)
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      tbl
    );

    -- Backend / Edge con service_role
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
  END LOOP;
END
$body$;

-- Append-only: authenticated solo SELECT + INSERT (reaplicar tras REVOKE ALL implícito no usado aquí)
DO $body$
BEGIN
  IF to_regclass('public.documentacion_envios') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE public.documentacion_envios FROM anon';
  EXECUTE 'REVOKE TRIGGER, REFERENCES, TRUNCATE ON TABLE public.documentacion_envios FROM authenticated';
  EXECUTE 'GRANT SELECT, INSERT ON TABLE public.documentacion_envios TO authenticated';
  EXECUTE 'REVOKE UPDATE, DELETE ON TABLE public.documentacion_envios FROM authenticated';
  EXECUTE 'GRANT ALL ON TABLE public.documentacion_envios TO service_role';
END
$body$;

-- Expediente extra por servicio (mismo perfil DML que el resto de tablas operativas)
DO $body$
BEGIN
  IF to_regclass('public.servicio_documentos_extra') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE public.servicio_documentos_extra FROM anon';
  EXECUTE 'REVOKE TRIGGER, REFERENCES, TRUNCATE ON TABLE public.servicio_documentos_extra FROM authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.servicio_documentos_extra TO authenticated';
  EXECUTE 'GRANT ALL ON TABLE public.servicio_documentos_extra TO service_role';
END
$body$;
