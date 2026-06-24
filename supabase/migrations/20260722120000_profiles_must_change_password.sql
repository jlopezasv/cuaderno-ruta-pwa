-- Contraseña temporal: obligar cambio en primer acceso (usuarios oficina creados por API).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Si true: el usuario debe cambiar contraseña antes de usar la app. Lo activa /api/admin create_office_user (service role).';

CREATE OR REPLACE FUNCTION public.profiles_guard_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.must_change_password IS TRUE
     AND (OLD.must_change_password IS DISTINCT FROM TRUE)
     AND auth.uid() IS NOT NULL
     AND auth.uid() = NEW.id
  THEN
    RAISE EXCEPTION 'must_change_password solo puede activarlo un administrador';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profiles_guard_must_change_password ON public.profiles;
CREATE TRIGGER tr_profiles_guard_must_change_password
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_must_change_password();
