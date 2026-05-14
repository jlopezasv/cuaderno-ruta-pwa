-- =============================================================================
-- Storage (user-photos, cmr) + tablas legacy con ownership user_id.
-- Prerrequisito: public.user_can_access_servicio (migración 20260514120000…).
-- Verificar en Dashboard que existan buckets "user-photos" y "cmr".
-- =============================================================================

UPDATE storage.buckets
SET public = false
WHERE name IN ('user-photos', 'cmr')
   OR id::text IN ('user-photos', 'cmr');

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- user-photos
DROP POLICY IF EXISTS "stor_uph_sel_own" ON storage.objects;
DROP POLICY IF EXISTS "stor_uph_sel_fleet" ON storage.objects;
DROP POLICY IF EXISTS "stor_uph_ins" ON storage.objects;
DROP POLICY IF EXISTS "stor_uph_upd" ON storage.objects;
DROP POLICY IF EXISTS "stor_uph_del" ON storage.objects;

CREATE POLICY "stor_uph_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

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
  );

CREATE POLICY "stor_uph_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "stor_uph_upd" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "stor_uph_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- cmr
DROP POLICY IF EXISTS "stor_cmr_sel_own" ON storage.objects;
DROP POLICY IF EXISTS "stor_cmr_sel_fleet" ON storage.objects;
DROP POLICY IF EXISTS "stor_cmr_ins" ON storage.objects;
DROP POLICY IF EXISTS "stor_cmr_upd" ON storage.objects;
DROP POLICY IF EXISTS "stor_cmr_del" ON storage.objects;

CREATE POLICY "stor_cmr_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

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
  );

CREATE POLICY "stor_cmr_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "stor_cmr_upd" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "stor_cmr_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Legacy: solo si existe columna user_id (ajustar migración manual si el esquema difiere)
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
