-- Archivado lógico de perfiles (conductores/usuarios): evita DELETE y FK rotas.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_archived IS
  'Si true: oculto en listados operativos y sin uso de app; mantiene id y relaciones (servicios, evidencias, etc.).';

UPDATE public.profiles SET is_archived = false WHERE is_archived IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_list
  ON public.profiles (updated_at DESC)
  WHERE (is_archived = false);

-- Solo el backend (JWT role service_role) puede cambiar is_archived.
CREATE OR REPLACE FUNCTION public.profiles_enforce_is_archived_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce((auth.jwt() ->> 'role'), '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    NEW.is_archived := false;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF OLD.is_archived IS NOT DISTINCT FROM NEW.is_archived THEN
    RETURN NEW;
  END IF;
  IF coalesce((auth.jwt() ->> 'role'), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'is_archived solo puede modificarse desde administración (service_role)'
    USING ERRCODE = '42501';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_enforce_is_archived_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_profiles_enforce_is_archived ON public.profiles;
CREATE TRIGGER tr_profiles_enforce_is_archived
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_enforce_is_archived_change();
