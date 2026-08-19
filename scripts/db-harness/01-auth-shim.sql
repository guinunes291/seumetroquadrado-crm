-- Shim do schema auth (GoTrue) — o mínimo que as migrations e RLS usam:
-- auth.users, auth.sessions, auth.uid(), auth.role(), auth.jwt(), auth.email().
-- A identidade é injetada nos testes via set_config('request.jwt.claims', ...).
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid,
  email text UNIQUE,
  encrypted_password text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  aud text DEFAULT 'authenticated',
  role text DEFAULT 'authenticated',
  email_confirmed_at timestamptz,
  confirmation_token text,
  recovery_token text,
  last_sign_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Compatibilidade com bancos do harness já criados antes destas colunas.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS instance_id uuid;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS confirmation_token text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_token text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_token_new text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_token_current text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_change text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_change_token text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS reauthentication_token text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_sso_user boolean NOT NULL DEFAULT false;
GRANT SELECT ON auth.users TO PUBLIC;

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON auth.sessions TO PUBLIC;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.email', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  );
$$;

-- ---------------------------------------------------------------------------
-- Usuários de PRODUÇÃO referenciados por migrations operacionais.
-- A migration 20260729185850 (chaveamento da final da Copa) insere confrontos
-- com os uuids reais de dois corretores; sem estas linhas, o replay do
-- harness quebra na FK copa_confrontos → auth.users. Os inserts rodam ANTES
-- das migrations (o trigger invite-only de handle_new_user ainda não existe),
-- e só existem aqui — produção já tem os usuários de verdade.
-- ---------------------------------------------------------------------------
DO $seed$
BEGIN
  -- Num banco JA migrado (replay local), o trigger invite-only de
  -- handle_new_user existe e barraria o insert; replica role o suprime.
  PERFORM set_config('session_replication_role', 'replica', true);
  INSERT INTO auth.users (id, email) VALUES
    ('6e09dcdf-0913-4482-b753-b98652be920e', 'andrew.copa@harness.local'),
    ('277f3912-db60-46b0-92ee-07f641ab10df', 'jefferson.copa@harness.local')
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('session_replication_role', 'origin', true);
END $seed$;
