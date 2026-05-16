| pg_get_functiondef                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(p_empresa_id uuid, p_conductor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (
      public.user_can_access_empresa(p_empresa_id)
      AND (
        p_conductor_id IS NULL
        OR p_conductor_id = 'b0000002-0002-4002-8002-000000000001'::uuid
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          WHERE ce.empresa_id = p_empresa_id
            AND ce.user_id = p_conductor_id
            AND (ce.activo IS DISTINCT FROM false)
        )
        OR p_conductor_id = auth.uid()
      )
    )
    OR (
      p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND (
        p_empresa_id IS NULL
        OR public.user_can_access_empresa(p_empresa_id)
      )
    )
    OR (
      p_conductor_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.conductor_empresa ce
        INNER JOIN public.empresas e ON e.id = ce.empresa_id
        WHERE ce.user_id = p_conductor_id
          AND (ce.activo IS DISTINCT FROM false)
          AND e.owner_id IS NOT NULL
          AND e.owner_id = auth.uid()
          AND (p_empresa_id IS NULL OR ce.empresa_id = p_empresa_id)
      )
    );
$function$
 |