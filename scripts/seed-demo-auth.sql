-- =============================================================================
-- Usuarios Auth para seed demo (opcional, ejecutar ANTES de seed-demo.sql)
-- Supabase SQL Editor · rol postgres
-- Contraseña ambos: DemoCuaderno2026!
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

DO $$
DECLARE
  v_owner uuid := 'a0000000-0000-4000-8000-000000000010';
  v_conductor uuid := 'a0000000-0000-4000-8000-000000000020';
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  v_pw text := crypt('DemoCuaderno2026!', gen_salt('bf'));
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users no existe — ¿proyecto Supabase correcto?';
  END IF;

  -- Empresa owner
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_instance, v_owner, 'authenticated', 'authenticated',
    'demo-empresa@cuaderno.test', v_pw,
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nombre":"Ana Demo Empresa"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    updated_at = now();

  -- Conductor
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_instance, v_conductor, 'authenticated', 'authenticated',
    'demo-conductor@cuaderno.test', v_pw,
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nombre":"Carlos Demo Conductor"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    updated_at = now();

  -- Identidades email (Supabase Auth)
  IF to_regclass('auth.identities') IS NOT NULL THEN
    BEGIN
      INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_owner::text, v_owner,
        jsonb_build_object('sub', v_owner::text, 'email', 'demo-empresa@cuaderno.test'),
        'email', now(), now(), now()
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'auth.identities empresa: %', SQLERRM;
    END;
    BEGIN
      INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_conductor::text, v_conductor,
        jsonb_build_object('sub', v_conductor::text, 'email', 'demo-conductor@cuaderno.test'),
        'email', now(), now(), now()
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'auth.identities conductor: %', SQLERRM;
    END;
  END IF;

  RAISE NOTICE 'Auth demo: demo-empresa@cuaderno.test / demo-conductor@cuaderno.test · pass DemoCuaderno2026!';
END $$;

COMMIT;
