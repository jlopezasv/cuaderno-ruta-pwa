-- v3: añade user_can_access_servicio (SELECT / return=representation) al diagnóstico RPC

CREATE OR REPLACE FUNCTION public.debug_servicio_insert_rls_context(
  p_empresa_id uuid DEFAULT NULL,
  p_conductor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_conductor uuid;
  v_tipo text;
  v_profile_exists_invoker boolean;
  v_jwt_sub text;
  v_insert_policies jsonb;
BEGIN
  v_uid := auth.uid();
  v_conductor := COALESCE(p_conductor_id, v_uid);
  v_jwt_sub := COALESCE(
    nullif(trim(current_setting('request.jwt.claim.sub', true)), ''),
    v_uid::text
  );

  SELECT pr.tipo_cuenta
  INTO v_tipo
  FROM public.profiles pr
  WHERE pr.id = v_uid
  LIMIT 1;

  v_profile_exists_invoker := FOUND;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', p.policyname,
        'roles', p.roles,
        'cmd', p.cmd,
        'permissive', p.permissive,
        'with_check', p.with_check
      )
      ORDER BY p.policyname
    ),
    '[]'::jsonb
  )
  INTO v_insert_policies
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'servicios'
    AND p.cmd IN ('INSERT', 'ALL');

  RETURN jsonb_build_object(
    'ts', now(),
    'database', current_database(),
    'auth_uid', v_uid,
    'auth_role', auth.role(),
    'session_user', session_user,
    'current_user', current_user,
    'jwt_sub', v_jwt_sub,
    'jwt_role', nullif(trim(current_setting('request.jwt.claim.role', true)), ''),
    'jwt_sub_equals_auth_uid',
      v_uid IS NOT NULL
      AND v_jwt_sub IS NOT NULL
      AND v_jwt_sub::uuid = v_uid,
    'profile_exists_invoker', v_profile_exists_invoker,
    'tipo_cuenta_invoker', v_tipo,
    'user_profile_is_autonomo_pro', public.user_profile_is_autonomo_pro(),
    'user_can_insert_servicio',
      public.user_can_insert_servicio(p_empresa_id, v_conductor),
    'user_can_insert_servicio_null_auth_uid',
      public.user_can_insert_servicio(NULL, v_uid),
    'hint_return_representation',
      'POST con Prefer return=representation exige SELECT (srv_sel) tras INSERT; can_insert puede ser true y fallar igual.',
    'insert_policies', v_insert_policies,
    'insert_policy_count', jsonb_array_length(v_insert_policies),
    'params', jsonb_build_object(
      'p_empresa_id', p_empresa_id,
      'p_conductor_id', p_conductor_id,
      'effective_conductor_id', v_conductor
    ),
    'autonomo_branch_checks', jsonb_build_object(
      'auth_uid_not_null', v_uid IS NOT NULL,
      'empresa_id_is_null', p_empresa_id IS NULL,
      'conductor_equals_auth', v_conductor IS NOT NULL AND v_conductor = v_uid,
      'user_profile_is_autonomo_pro', public.user_profile_is_autonomo_pro()
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.debug_servicio_insert_rls_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_servicio_insert_rls_context(uuid, uuid) TO authenticated;
