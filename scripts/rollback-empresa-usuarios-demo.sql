-- =============================================================================
-- ROLLBACK DEMO: multiusuario oficina (empresa_usuarios)
-- Ejecutar SOLO en proyecto Supabase DEMO (ref fezacjtbavgdosncxlzw).
-- NUNCA en producción (glyexutcypmhkndvmcxd).
--
-- Orden: policies → función → índices/columna → tabla
-- =============================================================================

-- Guardia: abortar si parece el proyecto REAL (ajustar si el ref demo cambia).
DO $$
BEGIN
  IF current_database() ILIKE '%prod%'
     OR EXISTS (
       SELECT 1
       FROM pg_settings
       WHERE name = 'app.settings.project_ref'
         AND setting = 'glyexutcypmhkndvmcxd'
     )
  THEN
    RAISE EXCEPTION 'ABORT: posible entorno PRODUCCIÓN. Solo ejecutar en DEMO.';
  END IF;
END;
$$;

-- ─── 1) Policies en empresa_usuarios ─────────────────────────────────────────
DROP POLICY IF EXISTS eu_sel ON public.empresa_usuarios;
DROP POLICY IF EXISTS eu_ins ON public.empresa_usuarios;
DROP POLICY IF EXISTS eu_upd ON public.empresa_usuarios;

-- ─── 2) Policy añadida en empresas (oficina demo) ───────────────────────────
DROP POLICY IF EXISTS emp_sel_oficina_demo ON public.empresas;

-- ─── 3) Función helper ───────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.user_can_manage_empresa_usuarios(uuid);

-- ─── 4) Columna responsable_user_id en servicios ─────────────────────────────
DROP INDEX IF EXISTS public.idx_servicios_responsable_user;

ALTER TABLE public.servicios
  DROP COLUMN IF EXISTS responsable_user_id;

-- ─── 5) Tabla empresa_usuarios (índices se eliminan con la tabla) ───────────
DROP TABLE IF EXISTS public.empresa_usuarios;

-- ─── 6) Verificación post-rollback ───────────────────────────────────────────
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'empresa_usuarios'
) AS tabla_empresa_usuarios_aun_existe;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'servicios'
    AND column_name = 'responsable_user_id'
) AS columna_responsable_user_id_aun_existe;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'user_can_manage_empresa_usuarios'
) AS funcion_user_can_manage_aun_existe;
