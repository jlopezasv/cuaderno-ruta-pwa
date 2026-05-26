DROP POLICY IF EXISTS "ev_sel" ON public.evidencias;
DROP POLICY IF EXISTS "ev_ins" ON public.evidencias;
DROP POLICY IF EXISTS "ev_upd" ON public.evidencias;
DROP POLICY IF EXISTS "ev_del" ON public.evidencias;

CREATE POLICY "ev_sel" ON public.evidencias
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  );

CREATE POLICY "ev_ins" ON public.evidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    AND (
      evidencias.incidencia_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.incidencias inc
        WHERE inc.id = evidencias.incidencia_id
          AND inc.servicio_id = (
            SELECT st2.servicio_id FROM public.stops st2 WHERE st2.id = evidencias.stop_id
          )
          AND public.user_can_access_servicio(inc.servicio_id)
      )
    )
  );

CREATE POLICY "ev_upd" ON public.evidencias
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    AND (
      evidencias.incidencia_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.incidencias inc
        WHERE inc.id = evidencias.incidencia_id
          AND public.user_can_access_servicio(inc.servicio_id)
      )
    )
  );

CREATE POLICY "ev_del" ON public.evidencias
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  );

CREATE OR REPLACE VIEW public.v_servicio_incidencias_resumen AS
SELECT
  s.id AS servicio_id,
  s.empresa_id,
  s.estado AS servicio_estado_actual,
  s.conductor_id AS servicio_conductor_id_actual,
  COUNT(i.id)::integer AS total_incidencias,
  MAX(i.registrado_en) AS ultima_incidencia_en,
  (
    SELECT i2.titulo
    FROM public.incidencias i2
    WHERE i2.servicio_id = s.id
    ORDER BY i2.registrado_en DESC, i2.created_at DESC
    LIMIT 1
  ) AS ultimo_titulo,
  (
    SELECT i2.conductor_nombre
    FROM public.incidencias i2
    WHERE i2.servicio_id = s.id
    ORDER BY i2.registrado_en DESC, i2.created_at DESC
    LIMIT 1
  ) AS ultimo_conductor_nombre,
  (
    SELECT COUNT(*)::integer
    FROM public.evidencias e
    INNER JOIN public.incidencias i3 ON i3.id = e.incidencia_id
    WHERE i3.servicio_id = s.id
  ) AS total_fotos,
  EXISTS (
    SELECT 1
    FROM public.evidencias e
    INNER JOIN public.incidencias i3 ON i3.id = e.incidencia_id
    WHERE i3.servicio_id = s.id
  ) AS tiene_fotos
FROM public.servicios s
INNER JOIN public.incidencias i ON i.servicio_id = s.id
GROUP BY s.id, s.empresa_id, s.estado, s.conductor_id;

COMMENT ON VIEW public.v_servicio_incidencias_resumen IS
  'Agregado por servicio con incidencias. servicio_estado_actual = servicios.estado en tiempo real.';

ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.incidencias TO authenticated;
GRANT ALL ON public.incidencias TO service_role;
GRANT SELECT ON public.v_servicio_incidencias_resumen TO authenticated;
GRANT ALL ON public.v_servicio_incidencias_resumen TO service_role;

DROP POLICY IF EXISTS "inc_sel" ON public.incidencias;
DROP POLICY IF EXISTS "inc_ins" ON public.incidencias;

CREATE POLICY "inc_sel" ON public.incidencias
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "inc_ins" ON public.incidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_servicio(servicio_id)
    AND empresa_id = (
      SELECT sv.empresa_id FROM public.servicios sv WHERE sv.id = servicio_id
    )
    AND (
      stop_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.stops st
        WHERE st.id = stop_id AND st.servicio_id = incidencias.servicio_id
      )
    )
  );
