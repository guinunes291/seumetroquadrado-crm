
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legacy_user_id bigint,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS creci text,
  ADD COLUMN IF NOT EXISTS data_credenciamento date,
  ADD COLUMN IF NOT EXISTS data_descredenciamento date,
  ADD COLUMN IF NOT EXISTS situacao text,
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS codigo_indicacao text,
  ADD COLUMN IF NOT EXISTS limite_diario_leads integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS limite_diario_webhook integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS google_calendar_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perfil_completo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acessa_links_uteis boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_legacy_user_id_key
  ON public.profiles(legacy_user_id) WHERE legacy_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_key
  ON public.profiles(cpf) WHERE cpf IS NOT NULL AND cpf <> '';
