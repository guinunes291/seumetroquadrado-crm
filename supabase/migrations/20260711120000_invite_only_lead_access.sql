-- Segurança de identidade e carteira.
--
-- Esta migração é deliberadamente aditiva e reexecutável. Contas já existentes
-- continuam ativas; novos usuários só recebem papel/equipe quando consomem um
-- convite válido. `profiles.ativo` continua significando elegibilidade para a
-- operação/roleta e não é usado como estado de autenticação.

-- ---------------------------------------------------------------------------
-- 1) Estados de conta e convite
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.status_conta AS ENUM ('pendente', 'ativa', 'bloqueada');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.convite_crm_estado AS ENUM ('pendente', 'aceito', 'revogado', 'expirado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_conta public.status_conta;

-- Backfill único: a migração não deve bloquear usuários que já estavam no CRM.
UPDATE public.profiles
SET status_conta = 'ativa'::public.status_conta
WHERE status_conta IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN status_conta SET DEFAULT 'pendente'::public.status_conta,
  ALTER COLUMN status_conta SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_status_conta
  ON public.profiles (status_conta);

-- Membership é independente de profiles.ativo. SECURITY DEFINER evita que uma
-- policy que chama a função recursione no próprio RLS de profiles.
CREATE OR REPLACE FUNCTION public.is_active_member(
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.profiles AS p
       WHERE p.id = _user_id
         AND p.status_conta = 'ativa'::public.status_conta
     );
$$;

REVOKE ALL ON FUNCTION public.is_active_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_member(uuid) TO authenticated, service_role;

-- Todos os RLS legados que usam has_role passam a negar imediatamente contas
-- pendentes/bloqueadas, mesmo enquanto um JWT antigo ainda não expirou.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_active_member(_user_id)
     AND EXISTS (
       SELECT 1
       FROM public.user_roles AS ur
       WHERE ur.user_id = _user_id
         AND ur.role = _role
     );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- RPC sem enum no contrato de retorno, própria para beforeLoad/AuthProvider.
CREATE OR REPLACE FUNCTION public.conta_atual_ativa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_active_member(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.conta_atual_ativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conta_atual_ativa() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Convites auditáveis e invite-only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.convites_crm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (btrim(email) <> ''),
  email_normalizado text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  papel public.app_role NOT NULL,
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE SET NULL,
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  estado public.convite_crm_estado NOT NULL DEFAULT 'pendente',
  aceito_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aceito_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT convites_crm_aceite_consistente CHECK (
    (estado = 'aceito'::public.convite_crm_estado AND aceito_por IS NOT NULL AND aceito_em IS NOT NULL)
    OR
    (estado <> 'aceito'::public.convite_crm_estado AND aceito_por IS NULL AND aceito_em IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_convites_crm_email_pendente
  ON public.convites_crm (email_normalizado)
  WHERE estado = 'pendente'::public.convite_crm_estado;

CREATE INDEX IF NOT EXISTS idx_convites_crm_equipe_estado
  ON public.convites_crm (equipe_id, estado, expira_em);

ALTER TABLE public.convites_crm ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.convites_crm FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.convites_crm TO authenticated;
GRANT INSERT (email, papel, equipe_id, expira_em) ON public.convites_crm TO authenticated;
-- Alterações de estado/validade são exclusivas do fluxo server-side. Uma
-- policy de UPDATE não compensa um grant de coluna: o cliente ainda conseguiria
-- prolongar ou revogar convites diretamente.
REVOKE UPDATE ON public.convites_crm FROM authenticated;
GRANT ALL ON public.convites_crm TO service_role;

DROP POLICY IF EXISTS "convites_crm_select_escopo" ON public.convites_crm;
CREATE POLICY "convites_crm_select_escopo"
  ON public.convites_crm FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superintendente')
    OR (
      public.has_role(auth.uid(), 'gestor')
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS gestor
        WHERE gestor.id = auth.uid()
          AND (
            (gestor.equipe_id IS NOT NULL AND gestor.equipe_id = convites_crm.equipe_id)
            OR EXISTS (
              SELECT 1 FROM public.equipes AS e
              WHERE e.id = convites_crm.equipe_id AND e.gestor_id = auth.uid()
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS "convites_crm_insert_escopo" ON public.convites_crm;
CREATE POLICY "convites_crm_insert_escopo"
  ON public.convites_crm FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND estado = 'pendente'::public.convite_crm_estado
    AND expira_em > now()
    AND expira_em <= now() + interval '30 days'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
      OR (
        public.has_role(auth.uid(), 'gestor')
        AND papel = 'corretor'::public.app_role
        AND equipe_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.profiles AS gestor
          WHERE gestor.id = auth.uid()
            AND (
              gestor.equipe_id = convites_crm.equipe_id
              OR EXISTS (
                SELECT 1 FROM public.equipes AS e
                WHERE e.id = convites_crm.equipe_id AND e.gestor_id = auth.uid()
              )
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "convites_crm_update_escopo" ON public.convites_crm;
CREATE POLICY "convites_crm_update_escopo"
  ON public.convites_crm FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superintendente')
    OR (
      public.has_role(auth.uid(), 'gestor')
      AND papel = 'corretor'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS gestor
        WHERE gestor.id = auth.uid()
          AND (
            gestor.equipe_id = convites_crm.equipe_id
            OR EXISTS (
              SELECT 1 FROM public.equipes AS e
              WHERE e.id = convites_crm.equipe_id AND e.gestor_id = auth.uid()
            )
          )
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superintendente')
    OR (
      public.has_role(auth.uid(), 'gestor')
      AND papel = 'corretor'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS gestor
        WHERE gestor.id = auth.uid()
          AND (
            gestor.equipe_id = convites_crm.equipe_id
            OR EXISTS (
              SELECT 1 FROM public.equipes AS e
              WHERE e.id = convites_crm.equipe_id AND e.gestor_id = auth.uid()
            )
          )
      )
    )
  );

DROP TRIGGER IF EXISTS trg_convites_crm_updated_at ON public.convites_crm;
CREATE TRIGGER trg_convites_crm_updated_at
  BEFORE UPDATE ON public.convites_crm
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sem convite: cria somente profile pendente, sem papel e sem equipe. Convite
-- válido é consumido atomicamente pelo e-mail normalizado.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _convite public.convites_crm%ROWTYPE;
BEGIN
  INSERT INTO public.profiles (id, email, nome, equipe_id, status_conta)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.id::text || '@sem-email.invalid'),
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data->>'nome'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
      split_part(COALESCE(NEW.email, NEW.id::text), '@', 1)
    ),
    NULL,
    'pendente'::public.status_conta
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT c.*
  INTO _convite
  FROM public.convites_crm AS c
  WHERE c.email_normalizado = lower(btrim(NEW.email))
    AND c.estado = 'pendente'::public.convite_crm_estado
    AND c.expira_em > now()
  ORDER BY c.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.profiles
    SET email = COALESCE(NEW.email, email),
        equipe_id = _convite.equipe_id,
        status_conta = 'ativa'::public.status_conta
    WHERE id = NEW.id;

    -- Em um INSERT normal não há papel anterior; o DELETE também torna a
    -- função fail-safe se o profile tiver sido pré-provisionado pelo backend.
    DELETE FROM public.user_roles WHERE user_id = NEW.id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _convite.papel)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.convites_crm
    SET estado = 'aceito'::public.convite_crm_estado,
        aceito_por = NEW.id,
        aceito_em = now()
    WHERE id = _convite.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3) Profile: leitura consciente do estado e edição própria por RPC limitada
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Usuários autenticados podem ver profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_active_or_self" ON public.profiles;
CREATE POLICY "profiles_select_active_or_self"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_active_member(auth.uid()));

DROP POLICY IF EXISTS "Usuário pode atualizar o próprio profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public.atualizar_meu_perfil(
  p_nome text,
  p_telefone text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _profile public.profiles;
BEGIN
  IF NOT public.is_active_member(auth.uid()) THEN
    RAISE EXCEPTION 'conta inativa'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_nome), '') IS NULL OR char_length(btrim(p_nome)) > 120 THEN
    RAISE EXCEPTION 'nome deve ter entre 1 e 120 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF p_telefone IS NOT NULL AND char_length(btrim(p_telefone)) > 40 THEN
    RAISE EXCEPTION 'telefone excede 40 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF p_avatar_url IS NOT NULL AND char_length(btrim(p_avatar_url)) > 2048 THEN
    RAISE EXCEPTION 'avatar_url excede 2048 caracteres'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET nome = btrim(p_nome),
      telefone = NULLIF(btrim(p_telefone), ''),
      avatar_url = NULLIF(btrim(p_avatar_url), '')
  WHERE id = auth.uid()
  RETURNING * INTO _profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile não encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN _profile;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_meu_perfil(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_meu_perfil(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Autorização central da carteira
-- ---------------------------------------------------------------------------
-- Valida o NOVO corretor_id sem reconsultar a linha de leads. Isto é essencial
-- no WITH CHECK de UPDATE: consultar o lead pelo id pode enxergar a versão OLD
-- e permitir uma transferência para fora do escopo.
CREATE OR REPLACE FUNCTION public.pode_atribuir_lead(
  _user_id uuid,
  _corretor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_active_member(_user_id)
     AND (
       public.has_role(_user_id, 'admin'::public.app_role)
       OR public.has_role(_user_id, 'superintendente'::public.app_role)
       OR (
         public.has_role(_user_id, 'corretor'::public.app_role)
         AND _corretor_id = _user_id
       )
       OR (
         public.has_role(_user_id, 'gestor'::public.app_role)
         AND _corretor_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.profiles AS gestor
           JOIN public.profiles AS corretor ON corretor.id = _corretor_id
           WHERE gestor.id = _user_id
             AND (
               (gestor.equipe_id IS NOT NULL AND gestor.equipe_id = corretor.equipe_id)
               OR EXISTS (
                 SELECT 1
                 FROM public.equipes AS e
                 WHERE e.id = corretor.equipe_id
                   AND e.gestor_id = _user_id
               )
             )
         )
       )
     );
$$;

REVOKE ALL ON FUNCTION public.pode_atribuir_lead(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_atribuir_lead(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pode_acessar_lead(
  _user_id uuid,
  _lead_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_active_member(_user_id)
     AND EXISTS (
       SELECT 1
       FROM public.leads AS l
       WHERE l.id = _lead_id
         AND (
           l.corretor_id = _user_id
           OR public.has_role(_user_id, 'admin'::public.app_role)
           OR public.has_role(_user_id, 'superintendente'::public.app_role)
           OR (
             public.has_role(_user_id, 'gestor'::public.app_role)
             AND l.corretor_id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM public.profiles AS gestor
               JOIN public.profiles AS corretor ON corretor.id = l.corretor_id
               WHERE gestor.id = _user_id
                 AND (
                   (gestor.equipe_id IS NOT NULL AND gestor.equipe_id = corretor.equipe_id)
                   OR EXISTS (
                     SELECT 1
                     FROM public.equipes AS e
                     WHERE e.id = corretor.equipe_id
                       AND e.gestor_id = _user_id
                   )
                 )
             )
           )
         )
     );
$$;

REVOKE ALL ON FUNCTION public.pode_acessar_lead(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_acessar_lead(uuid, uuid) TO authenticated, service_role;

-- Policies anteriores eram cumulativas (OR); todas precisam sair antes da
-- policy central para o escopo de equipe não ser reaberto por um nome legado.
DROP POLICY IF EXISTS "Admin/gestor podem ver todos os leads" ON public.leads;
DROP POLICY IF EXISTS "Admin/gestor podem inserir leads" ON public.leads;
DROP POLICY IF EXISTS "Admin/gestor podem atualizar leads" ON public.leads;
DROP POLICY IF EXISTS "Admin pode deletar leads" ON public.leads;
DROP POLICY IF EXISTS "Corretor vê seus leads" ON public.leads;
DROP POLICY IF EXISTS "Corretor atualiza seus leads" ON public.leads;
DROP POLICY IF EXISTS "Corretor pode inserir seus leads" ON public.leads;
DROP POLICY IF EXISTS "leads_select_carteira" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_carteira" ON public.leads;
DROP POLICY IF EXISTS "leads_update_carteira" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_admin" ON public.leads;

CREATE POLICY "leads_select_carteira"
  ON public.leads FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), id));

CREATE POLICY "leads_insert_carteira"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.pode_atribuir_lead(auth.uid(), corretor_id));

CREATE POLICY "leads_update_carteira"
  ON public.leads FOR UPDATE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), id))
  WITH CHECK (public.pode_atribuir_lead(auth.uid(), corretor_id));

CREATE POLICY "leads_delete_admin"
  ON public.leads FOR DELETE TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Documentações, timeline e staging da landing
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "docs_select" ON public.documentacoes;
DROP POLICY IF EXISTS "docs_insert" ON public.documentacoes;
DROP POLICY IF EXISTS "docs_update" ON public.documentacoes;
DROP POLICY IF EXISTS "docs_select_carteira" ON public.documentacoes;
DROP POLICY IF EXISTS "docs_insert_carteira" ON public.documentacoes;
DROP POLICY IF EXISTS "docs_update_carteira" ON public.documentacoes;
DROP POLICY IF EXISTS "docs_delete_carteira" ON public.documentacoes;

CREATE POLICY "docs_select_carteira"
  ON public.documentacoes FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "docs_insert_carteira"
  ON public.documentacoes FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "docs_update_carteira"
  ON public.documentacoes FOR UPDATE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id))
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "docs_delete_carteira"
  ON public.documentacoes FOR DELETE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

DROP POLICY IF EXISTS "lead_eventos read auth" ON public.lead_eventos;
DROP POLICY IF EXISTS "lead_eventos insert auth" ON public.lead_eventos;
DROP POLICY IF EXISTS "lead_eventos admin manage" ON public.lead_eventos;
DROP POLICY IF EXISTS "lead_eventos_select_carteira" ON public.lead_eventos;
DROP POLICY IF EXISTS "lead_eventos_insert_carteira" ON public.lead_eventos;

-- Timeline é append-only para usuários; service_role continua podendo fazer
-- manutenção por bypass de RLS.
REVOKE UPDATE, DELETE ON public.lead_eventos FROM authenticated;
CREATE POLICY "lead_eventos_select_carteira"
  ON public.lead_eventos FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "lead_eventos_insert_carteira"
  ON public.lead_eventos FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));

DROP POLICY IF EXISTS "Admins/gestores veem leads landing" ON public.leads_landing;
DROP POLICY IF EXISTS "Autenticados veem leads landing" ON public.leads_landing;
DROP POLICY IF EXISTS "Admins/gestores atualizam leads landing" ON public.leads_landing;
DROP POLICY IF EXISTS "Admins deletam leads landing" ON public.leads_landing;
DROP POLICY IF EXISTS "leads_landing_select_escopo" ON public.leads_landing;
DROP POLICY IF EXISTS "leads_landing_update_escopo" ON public.leads_landing;
DROP POLICY IF EXISTS "leads_landing_delete_global" ON public.leads_landing;

-- Linhas ainda sem lead não têm equipe no schema atual; por isso são
-- fail-closed para gestor e visíveis somente a admin/superintendente.
CREATE POLICY "leads_landing_select_escopo"
  ON public.leads_landing FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
      OR (
        lead_id IS NULL
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'superintendente')
        )
      )
    )
  );

CREATE POLICY "leads_landing_update_escopo"
  ON public.leads_landing FOR UPDATE TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
      OR (
        lead_id IS NULL
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'superintendente')
        )
      )
    )
  )
  WITH CHECK (
    public.is_active_member(auth.uid())
    AND (
      (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
      OR (
        lead_id IS NULL
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'superintendente')
        )
      )
    )
  );

CREATE POLICY "leads_landing_delete_global"
  ON public.leads_landing FOR DELETE TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Storage privado, fail-closed até a mediação server-side
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.documentacao_storage_autorizado(
  _user_id uuid,
  _object_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _partes text[];
  _lead_id uuid;
  _documentacao_id uuid;
BEGIN
  IF _user_id IS NULL OR _object_name IS NULL THEN
    RETURN false;
  END IF;

  _partes := string_to_array(_object_name, '/');
  IF array_length(_partes, 1) <> 3 OR NULLIF(_partes[3], '') IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    _lead_id := _partes[1]::uuid;
    _documentacao_id := _partes[2]::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN RETURN false;
  END;

  RETURN public.pode_acessar_lead(_user_id, _lead_id)
     AND EXISTS (
       SELECT 1
       FROM public.documentacoes AS d
       WHERE d.id = _documentacao_id
         AND d.lead_id = _lead_id
     );
END;
$$;

CREATE OR REPLACE FUNCTION public.documentacao_upload_valido(_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  _size_text text;
BEGIN
  _size_text := _metadata->>'size';
  IF _size_text IS NULL OR _size_text !~ '^[0-9]+$' THEN
    RETURN false;
  END IF;

  RETURN lower(COALESCE(_metadata->>'mimetype', '')) IN (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
    )
    AND _size_text::bigint BETWEEN 1 AND 15728640;
EXCEPTION
  WHEN numeric_value_out_of_range THEN RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.documentacao_storage_autorizado(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.documentacao_storage_autorizado(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.documentacao_upload_valido(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.documentacao_upload_valido(jsonb) TO service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentacao', 'documentacao', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Compatível também com versões antigas do schema do Storage que ainda não
-- expõem allowed_mime_types/file_size_limit.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets'
      AND column_name = 'file_size_limit'
  ) THEN
    EXECUTE 'UPDATE storage.buckets SET file_size_limit = $1 WHERE id = $2'
      USING 15728640::bigint, 'documentacao';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets'
      AND column_name = 'allowed_mime_types'
  ) THEN
    EXECUTE 'UPDATE storage.buckets SET allowed_mime_types = $1 WHERE id = $2'
      USING ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[], 'documentacao';
  END IF;
END $$;

DROP POLICY IF EXISTS "documentacao_objects_select" ON storage.objects;
DROP POLICY IF EXISTS "documentacao_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "documentacao_objects_update" ON storage.objects;
DROP POLICY IF EXISTS "documentacao_objects_delete" ON storage.objects;

-- Intencionalmente não há CREATE POLICY para authenticated neste bucket.
-- Upload/download/replace/delete devem passar por código server-side com
-- service_role, que valida `pode_acessar_lead`, path, MIME e tamanho antes de
-- tocar o Storage. Sem essa mediação, toda chamada direta do browser é negada.
