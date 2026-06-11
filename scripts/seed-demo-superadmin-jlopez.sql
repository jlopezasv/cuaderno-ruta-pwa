-- =============================================================================
-- Superadmin DEMO: jlopezasv@gmail.com (mismo UID que producción)
-- Supabase SQL Editor · SOLO proyecto DEMO (fezacjtbavgdosncxlzw)
--
-- Contraseña demo: DemoCuaderno2026!
-- Tras ejecutar: login en https://cuaderno-demo-ab.vercel.app → Panel Propietario
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

DO $$
DECLARE
  v_superadmin uuid := '4b63a6e5-2e02-44e7-af61-b169583f40f5';
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  v_email text := 'jlopezasv@gmail.com';
  v_pw text := crypt('DemoCuaderno2026!', gen_salt('bf'));
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users no existe — ¿proyecto Supabase DEMO correcto?';
  END IF;

  -- Si el email existía con otro UID (registro previo), liberar email
  DELETE FROM auth.identities
  WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE lower(email) = lower(v_email) AND id <> v_superadmin
  );
  DELETE FROM auth.users
  WHERE lower(email) = lower(v_email) AND id <> v_superadmin;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_instance, v_superadmin, 'authenticated', 'authenticated',
    v_email, v_pw,
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nombre":"José"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
    updated_at = now();

  IF to_regclass('auth.identities') IS NOT NULL THEN
    DELETE FROM auth.identities
    WHERE user_id = v_superadmin AND provider = 'email';
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_superadmin, v_superadmin::text, v_superadmin,
      jsonb_build_object('sub', v_superadmin::text, 'email', v_email),
      'email', now(), now(), now()
    );
  END IF;

  INSERT INTO public.profiles (id, nombre, tipo_cuenta, updated_at, is_archived, can_drive)
  VALUES (v_superadmin, 'José', 'autonomo', now(), false, false)
  ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    updated_at = now(),
    is_archived = false;

  RAISE NOTICE 'Superadmin demo listo: % / DemoCuaderno2026!', v_email;
END $$;

COMMIT;
