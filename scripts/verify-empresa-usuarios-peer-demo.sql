-- Verificación DEMO: policy eu_sel_peer_demo en empresa_usuarios
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.empresa_usuarios'::regclass
  AND polname = 'eu_sel_peer_demo';

-- Conteo usuarios por empresa (ejecutar como service_role o sin RLS en editor)
SELECT empresa_id, rol, activo, count(*) AS n
FROM public.empresa_usuarios
GROUP BY empresa_id, rol, activo
ORDER BY empresa_id, rol;
