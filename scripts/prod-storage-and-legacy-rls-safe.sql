-- =============================================================================
-- PRODUCCIÓN: storage (user-photos, cmr) + RLS legacy — sin exigir owner de
-- storage.objects (error 42501 en SQL Editor de Supabase).
-- Equivalente a 20260515190000_storage_and_legacy_rls.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public._prod_safe_exec(p_sql text, p_label text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN
    RAISE NOTICE '[prod-safe skip %] %', coalesce(p_label, '?'), SQLERRM;
  WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      RAISE NOTICE '[prod-safe skip %] %', coalesce(p_label, '?'), SQLERRM;
    ELSE
      RAISE;
    END IF;
END;
$$;

-- Buckets privados (no requiere owner de objects)
SELECT public._prod_safe_exec($sql$
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public
$sql$, 'bucket user-photos');

SELECT public._prod_safe_exec($sql$
INSERT INTO storage.buckets (id, name, public)
VALUES ('cmr', 'cmr', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public
$sql$, 'bucket cmr');

SELECT public._prod_safe_exec($sql$
UPDATE storage.buckets
SET public = false
WHERE name IN ('user-photos', 'cmr')
   OR id::text IN ('user-photos', 'cmr')
$sql$, 'buckets private');

SELECT public._prod_safe_exec(
  'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY',
  'storage.objects RLS'
);

-- user-photos
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_sel_own" ON storage.objects', 'stor_uph');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_sel_fleet" ON storage.objects', 'stor_uph');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_ins" ON storage.objects', 'stor_uph');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_upd" ON storage.objects', 'stor_uph');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_del" ON storage.objects', 'stor_uph');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_uph_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_sel_own');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_uph_sel_fleet" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      INNER JOIN public.empresas e ON e.id = ce.empresa_id
      WHERE e.owner_id = auth.uid()
        AND ce.user_id::text = split_part(storage.objects.name, '/', 1)
        AND (ce.activo IS DISTINCT FROM false)
    )
  )
$p$, 'stor_uph_sel_fleet');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_uph_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_ins');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_uph_upd" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_upd');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_uph_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_del');

-- cmr
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_sel_own" ON storage.objects', 'stor_cmr');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_sel_fleet" ON storage.objects', 'stor_cmr');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_ins" ON storage.objects', 'stor_cmr');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_upd" ON storage.objects', 'stor_cmr');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_del" ON storage.objects', 'stor_cmr');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_cmr_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_sel_own');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_cmr_sel_fleet" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      INNER JOIN public.empresas e ON e.id = ce.empresa_id
      WHERE e.owner_id = auth.uid()
        AND ce.user_id::text = split_part(storage.objects.name, '/', 1)
        AND (ce.activo IS DISTINCT FROM false)
    )
  )
$p$, 'stor_cmr_sel_fleet');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_cmr_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_ins');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_cmr_upd" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_upd');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_cmr_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_del');

-- Legacy: solo si existe columna user_id
DO $$
BEGIN
  IF to_regclass('public.entries') IS NOT NULL THEN
    ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
    GRANT ALL ON public.entries TO service_role;
    DROP POLICY IF EXISTS entries_own_sel ON public.entries;
    DROP POLICY IF EXISTS entries_own_ins ON public.entries;
    DROP POLICY IF EXISTS entries_own_upd ON public.entries;
    DROP POLICY IF EXISTS entries_own_del ON public.entries;
    CREATE POLICY entries_own_sel ON public.entries FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY entries_own_ins ON public.entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY entries_own_upd ON public.entries FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY entries_own_del ON public.entries FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.gastos') IS NOT NULL THEN
    ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos TO authenticated;
    GRANT ALL ON public.gastos TO service_role;
    DROP POLICY IF EXISTS gastos_own_sel ON public.gastos;
    DROP POLICY IF EXISTS gastos_own_ins ON public.gastos;
    DROP POLICY IF EXISTS gastos_own_upd ON public.gastos;
    DROP POLICY IF EXISTS gastos_own_del ON public.gastos;
    CREATE POLICY gastos_own_sel ON public.gastos FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY gastos_own_ins ON public.gastos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY gastos_own_upd ON public.gastos FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY gastos_own_del ON public.gastos FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.km_logs') IS NOT NULL THEN
    ALTER TABLE public.km_logs ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.km_logs TO authenticated;
    GRANT ALL ON public.km_logs TO service_role;
    DROP POLICY IF EXISTS km_logs_own_sel ON public.km_logs;
    DROP POLICY IF EXISTS km_logs_own_ins ON public.km_logs;
    DROP POLICY IF EXISTS km_logs_own_upd ON public.km_logs;
    DROP POLICY IF EXISTS km_logs_own_del ON public.km_logs;
    CREATE POLICY km_logs_own_sel ON public.km_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY km_logs_own_ins ON public.km_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY km_logs_own_upd ON public.km_logs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY km_logs_own_del ON public.km_logs FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.cmr_docs') IS NOT NULL THEN
    ALTER TABLE public.cmr_docs ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.cmr_docs TO authenticated;
    GRANT ALL ON public.cmr_docs TO service_role;
    DROP POLICY IF EXISTS cmr_docs_own_sel ON public.cmr_docs;
    DROP POLICY IF EXISTS cmr_docs_own_ins ON public.cmr_docs;
    DROP POLICY IF EXISTS cmr_docs_own_upd ON public.cmr_docs;
    DROP POLICY IF EXISTS cmr_docs_own_del ON public.cmr_docs;
    CREATE POLICY cmr_docs_own_sel ON public.cmr_docs FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY cmr_docs_own_ins ON public.cmr_docs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY cmr_docs_own_upd ON public.cmr_docs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY cmr_docs_own_del ON public.cmr_docs FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
    GRANT ALL ON public.subscriptions TO service_role;
    DROP POLICY IF EXISTS subscriptions_own_sel ON public.subscriptions;
    DROP POLICY IF EXISTS subscriptions_own_ins ON public.subscriptions;
    DROP POLICY IF EXISTS subscriptions_own_upd ON public.subscriptions;
    DROP POLICY IF EXISTS subscriptions_own_del ON public.subscriptions;
    CREATE POLICY subscriptions_own_sel ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY subscriptions_own_ins ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY subscriptions_own_upd ON public.subscriptions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY subscriptions_own_del ON public.subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;
