-- Roles e schemas base que o Supabase provê e as migrations assumem.
-- Idempotente: pode rodar sobre um cluster já preparado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- BYPASSRLS espelha o service_role real do Supabase.
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN;
  END IF;
  -- Papel da plataforma Lovable Cloud referenciado por GRANTs de migrations.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN;
  END IF;
END
$$;

-- O superusuário do harness precisa poder SET ROLE para os papéis de teste.
GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;

-- Extensões reais usadas pelas migrations (contrib padrão).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Publication que as migrations alteram com ALTER PUBLICATION ... ADD TABLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- No Supabase, "extensions" faz parte do search_path padrão do banco.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET search_path TO "$user", public, extensions',
    current_database()
  );
END
$$;
SET search_path TO "$user", public, extensions;
