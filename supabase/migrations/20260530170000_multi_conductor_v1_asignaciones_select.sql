-- =============================================================================
-- Multi-Conductor V1 — visibilidad por servicio_asignaciones
--
-- Objetivo:
--   Un servicio puede tener varios conductores (1 principal en servicios.conductor_id
--   + N colaboradores en servicio_asignaciones). Esta función añade una cláusula:
--   cualquier conductor con fila en servicio_asignaciones para ese servicio también
--   puede acceder (SELECT) al servicio (y por tanto a sus stops, evidencias, etc.).
--
-- ROBUSTEZ: se reconstruye con subconsultas inline (solo dependen de las tablas
--   servicios / conductor_empresa / empresas + user_can_access_empresa), sin
--   depender de funciones auxiliares que pudieran no existir en DEMO.
--   Cláusulas conservadas:
--     • conductor principal (servicios.conductor_id = auth.uid())  -> cubre también autónomo propio
--     • dueño de la empresa
--     • conductor activo de la empresa del servicio
--     • jefe del conductor asignado
--   Cláusula nueva:
--     • conductor con fila en servicio_asignaciones (multi-conductor V1)
--
-- No cambia: estado, FIFO, lógica operacional, expediente. Solo amplía visibilidad.
-- Idempotente (CREATE OR REPLACE). Ejecutar en el SQL Editor de DEMO.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_can_access_servicio(servicio_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        (s.conductor_id IS NOT NULL AND s.conductor_id = auth.uid())
        OR public.user_can_access_empresa(s.empresa_id)
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.conductor_empresa ce
            WHERE ce.empresa_id = s.empresa_id
              AND ce.user_id = auth.uid()
              AND (ce.activo IS DISTINCT FROM false)
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE s.conductor_id IS NOT NULL
            AND ce.user_id = s.conductor_id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id IS NOT NULL
            AND e.owner_id = auth.uid()
        )
        -- Multi-Conductor V1: conductor colaborador asignado vía servicio_asignaciones
        OR EXISTS (
          SELECT 1
          FROM public.servicio_asignaciones sa
          WHERE sa.servicio_id = s.id
            AND sa.conductor_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.user_can_access_servicio(uuid) IS
  'Conductor principal; dueño empresa; conductor activo de la empresa; jefe del conductor asignado; o conductor con fila en servicio_asignaciones (multi-conductor V1).';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated, service_role;
