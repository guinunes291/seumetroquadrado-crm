-- Shims da plataforma Supabase além de auth: storage e as extensões de
-- infraestrutura (pg_cron/pg_net entram como extensões fake — ver
-- fake-extensions/ — para que o CREATE EXTENSION das migrations funcione).
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO PUBLIC;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON storage.buckets TO PUBLIC;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN position('/' IN name) = 0 THEN '{}'::text[]
    ELSE (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
  END;
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)];
$$;

CREATE OR REPLACE FUNCTION storage.extension(name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT reverse(split_part(reverse(storage.filename(name)), '.', 1));
$$;
