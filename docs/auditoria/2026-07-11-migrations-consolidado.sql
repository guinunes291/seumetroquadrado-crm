-- ============================================================================
-- Evolução do CRM (PR #69) — 18 migrações consolidadas (ordem de aplicação).
-- Cole TUDO no SQL editor do Supabase e clique em Run.
-- Fonte: supabase/migrations/20260711*.sql
--
-- Contexto: o código do PR #69 já está no ar, mas estas migrações nunca
-- foram aplicadas ao banco vivo — por isso o app falha ao chamar RPCs como
-- pipeline_snapshot_v2, transicionar_lead, aprovar_venda, salvar_modo_visita.
--
-- Antes de rodar: faça um backup (Database > Backups) ou registre um
-- snapshot lógico do projeto.
-- ============================================================================


-- ============================================================================
-- [1/18] 20260711120000_invite_only_lead_access.sql
-- ============================================================================

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

-- ============================================================================
-- [2/18] 20260711121000_push_outbox_claim.sql
-- ============================================================================

-- Claim atômico da push_outbox para impedir que dois crons processem a mesma
-- notificação simultaneamente. Uma lease expirada volta a ficar elegível caso
-- o worker caia antes de concluir o envio.

ALTER TABLE public.push_outbox
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

-- JWTs emitidos antes de um bloqueio continuam válidos até expirarem. As
-- policies antigas usavam apenas auth.uid(), portanto ainda expunham o texto
-- das notificações e permitiam manter subscriptions após o bloqueio.
DROP POLICY IF EXISTS "users manage own push subs" ON public.push_subscriptions;
CREATE POLICY "users manage own push subs"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (public.is_active_member(auth.uid()) AND auth.uid() = user_id)
  WITH CHECK (public.is_active_member(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "users read own push outbox" ON public.push_outbox;
CREATE POLICY "users read own push outbox"
  ON public.push_outbox FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()) AND auth.uid() = user_id);

-- Estes helpers SECURITY DEFINER nasceram com EXECUTE para PUBLIC. Sem o
-- revoke, qualquer cliente poderia injetar notificações arbitrárias para outro
-- usuário ou disparar o job global por RPC.
REVOKE ALL ON FUNCTION public.enqueue_push(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_push(uuid, text, text, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.gerar_pushes_agendamentos_proximos()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_pushes_agendamentos_proximos()
  TO service_role;
REVOKE ALL ON FUNCTION public.push_lead_distribuido() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_tarefa_criada() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_push_outbox_claim_ready
  ON public.push_outbox (created_at, next_attempt_at, lease_expires_at)
  WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_push_outbox(
  _limit integer DEFAULT 100,
  _lease_seconds integer DEFAULT 600
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  body text,
  url text,
  tag text,
  attempts integer,
  lease_token uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT po.id
    FROM public.push_outbox AS po
    WHERE po.sent_at IS NULL
      AND (po.next_attempt_at IS NULL OR po.next_attempt_at <= clock_timestamp())
      AND (po.lease_expires_at IS NULL OR po.lease_expires_at <= clock_timestamp())
    ORDER BY po.created_at ASC
    FOR UPDATE OF po SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 100)
  ), claimed AS (
    UPDATE public.push_outbox AS po
    SET lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp()
          + make_interval(secs => LEAST(GREATEST(COALESCE(_lease_seconds, 600), 30), 3600))
    FROM candidates AS c
    WHERE po.id = c.id
    RETURNING
      po.id,
      po.user_id,
      po.title,
      po.body,
      po.url,
      po.tag,
      po.attempts,
      po.lease_token
  )
  SELECT
    c.id,
    c.user_id,
    c.title,
    c.body,
    c.url,
    c.tag,
    c.attempts,
    c.lease_token
  FROM claimed AS c;
$$;

REVOKE ALL ON FUNCTION public.claim_push_outbox(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_push_outbox(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(integer, integer) TO service_role;

-- ============================================================================
-- [3/18] 20260711121500_documentacao_server_mediation.sql
-- ============================================================================

-- Arquivos de documentacao passam a ser mediados pelo servidor.
-- O navegador continua podendo editar o checklist via RLS, mas nao recebe
-- permissao direta em storage.objects. Cada upload cria uma versao imutavel e
-- o campo documentacoes.url aponta somente para a versao corrente.

CREATE TABLE IF NOT EXISTS public.documentacao_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documentacao_id uuid NOT NULL REFERENCES public.documentacoes(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  versao integer NOT NULL CHECK (versao > 0),
  object_path text NOT NULL UNIQUE CHECK (object_path <> ''),
  nome_original text NOT NULL CHECK (char_length(nome_original) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (
    mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  ),
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes BETWEEN 1 AND 15728640),
  enviado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ativa boolean NOT NULL DEFAULT true,
  removido_em timestamptz,
  removido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentacao_versoes_numero_unico UNIQUE (documentacao_id, versao),
  CONSTRAINT documentacao_versoes_remocao_consistente CHECK (
    (removido_em IS NULL AND removido_por IS NULL)
    OR (removido_em IS NOT NULL AND removido_por IS NOT NULL AND ativa = false)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_versao_ativa
  ON public.documentacao_versoes (documentacao_id)
  WHERE ativa;
CREATE INDEX IF NOT EXISTS idx_documentacao_versoes_lead_created
  ON public.documentacao_versoes (lead_id, created_at DESC);

ALTER TABLE public.documentacao_versoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documentacao_versoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.documentacao_versoes TO service_role;

-- Exclusão precisa remover objetos e registrar versões pelo handler servidor;
-- apagar só a linha pelo browser destruiria a trilha e deixaria blobs órfãos.
REVOKE DELETE ON public.documentacoes FROM authenticated;

-- Chamada exclusivamente com service role pelo handler servidor, depois que o
-- JWT do usuario e a carteira foram validados com o cliente RLS desse usuario.
CREATE OR REPLACE FUNCTION public.registrar_documentacao_upload(
  _documentacao_id uuid,
  _lead_id uuid,
  _object_path text,
  _nome_original text,
  _mime_type text,
  _tamanho_bytes bigint,
  _ator_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _versao integer;
BEGIN
  IF _ator_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _ator_id) THEN
    RAISE EXCEPTION 'ator invalido' USING ERRCODE = '22023';
  END IF;
  IF _mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
     OR _tamanho_bytes NOT BETWEEN 1 AND 15728640
     OR char_length(COALESCE(_nome_original, '')) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'arquivo invalido' USING ERRCODE = '22023';
  END IF;

  -- Serializa uploads concorrentes do mesmo item de checklist.
  PERFORM 1
  FROM public.documentacoes AS d
  WHERE d.id = _documentacao_id AND d.lead_id = _lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'documentacao nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.documentacao_versoes
  SET ativa = false
  WHERE documentacao_id = _documentacao_id AND ativa;

  SELECT COALESCE(max(v.versao), 0) + 1
  INTO _versao
  FROM public.documentacao_versoes AS v
  WHERE v.documentacao_id = _documentacao_id;

  INSERT INTO public.documentacao_versoes (
    documentacao_id, lead_id, versao, object_path, nome_original,
    mime_type, tamanho_bytes, enviado_por
  ) VALUES (
    _documentacao_id, _lead_id, _versao, _object_path, left(_nome_original, 255),
    _mime_type, _tamanho_bytes, _ator_id
  );

  UPDATE public.documentacoes
  SET url = _object_path,
      status = CASE WHEN status = 'pendente' THEN 'recebido' ELSE status END
  WHERE id = _documentacao_id;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id,
    'documentacao_upload',
    'Nova versao de documento recebida',
    _ator_id::text,
    jsonb_build_object(
      'documentacao_id', _documentacao_id,
      'versao', _versao,
      'mime_type', _mime_type,
      'tamanho_bytes', _tamanho_bytes
    )
  );

  RETURN _versao;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_documentacao_remocao(
  _documentacao_id uuid,
  _ator_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead_id uuid;
  _object_path text;
BEGIN
  IF _ator_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _ator_id) THEN
    RAISE EXCEPTION 'ator invalido' USING ERRCODE = '22023';
  END IF;

  -- Nunca confia apenas em documentacoes.url: essa coluna existia antes da
  -- mediação server-side e pode conter valor legado/manipulado. Só uma versão
  -- ativa pertencente ao mesmo item pode virar caminho de remoção.
  SELECT d.lead_id, v.object_path
  INTO _lead_id, _object_path
  FROM public.documentacoes AS d
  JOIN public.documentacao_versoes AS v
    ON v.documentacao_id = d.id
   AND v.lead_id = d.lead_id
   AND v.ativa
   AND v.object_path = d.url
  WHERE d.id = _documentacao_id
  FOR UPDATE OF d, v;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'documentacao nao possui arquivo privado' USING ERRCODE = '22023';
  END IF;

  UPDATE public.documentacao_versoes
  SET ativa = false, removido_em = now(), removido_por = _ator_id
  WHERE documentacao_id = _documentacao_id AND object_path = _object_path AND ativa;

  UPDATE public.documentacoes SET url = NULL WHERE id = _documentacao_id;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id,
    'documentacao_remocao',
    'Arquivo de documento removido',
    _ator_id::text,
    jsonb_build_object('documentacao_id', _documentacao_id)
  );

  RETURN _object_path;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_documentacao_upload(
  uuid, uuid, text, text, text, bigint, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_documentacao_upload(
  uuid, uuid, text, text, text, bigint, uuid
) TO service_role;
REVOKE ALL ON FUNCTION public.registrar_documentacao_remocao(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_documentacao_remocao(uuid, uuid)
  TO service_role;

-- ============================================================================
-- [4/18] 20260711122000_sales_approval_integrity.sql
-- ============================================================================

-- Integridade comercial: aprovação gerencial, máquina de estados e ledgers.
--
-- Esta migração mantém as tabelas/URLs existentes, mas muda a fonte de verdade:
-- uma venda só gera comissão, VGV e pontos depois de aprovada. Os efeitos são
-- append-only, idempotentes e reversíveis. O backfill preserva vendas legadas e
-- reconcilia `atividades_diarias` sem depender dos antigos triggers de INSERT.

-- ---------------------------------------------------------------------------
-- 1) Estado auditável da venda e unicidade por lead
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.status_venda AS ENUM (
    'rascunho', 'pendente', 'aprovada', 'rejeitada', 'cancelada'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS status_venda public.status_venda,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_decisao text,
  ADD COLUMN IF NOT EXISTS status_venda_updated_at timestamptz;

-- Impede que uma venda seja inserida entre a reconciliação de duplicatas e a
-- criação do índice parcial. O lock dura somente a transação da migration.
LOCK TABLE public.vendas IN SHARE ROW EXCLUSIVE MODE;

-- Vendas existentes já produziram efeitos no modelo anterior; por isso entram
-- como aprovadas. Distratos entram cancelados e serão estornados no ledger.
UPDATE public.vendas
SET status_venda = CASE
      WHEN distrato THEN 'cancelada'::public.status_venda
      ELSE 'aprovada'::public.status_venda
    END,
    aprovado_em = CASE
      WHEN aprovado_em IS NOT NULL THEN aprovado_em
      ELSE data_assinatura::timestamp AT TIME ZONE 'America/Sao_Paulo'
    END,
    motivo_decisao = CASE
      WHEN distrato THEN COALESCE(
        NULLIF(btrim(motivo_decisao), ''),
        NULLIF(btrim(motivo_distrato), ''),
        'Distrato legado'
      )
      ELSE motivo_decisao
    END,
    status_venda_updated_at = COALESCE(status_venda_updated_at, updated_at, created_at, now())
WHERE status_venda IS NULL;

-- Completa uma eventual execução parcial sem reclassificar decisões já feitas.
UPDATE public.vendas
SET aprovado_em = CASE
      WHEN status_venda IN (
        'aprovada'::public.status_venda,
        'cancelada'::public.status_venda
      ) THEN COALESCE(
        aprovado_em,
        data_assinatura::timestamp AT TIME ZONE 'America/Sao_Paulo'
      )
      ELSE aprovado_em
    END,
    motivo_decisao = CASE
      WHEN status_venda = 'cancelada'::public.status_venda
        THEN COALESCE(
          NULLIF(btrim(motivo_decisao), ''),
          NULLIF(btrim(motivo_distrato), ''),
          'Cancelamento legado'
        )
      ELSE motivo_decisao
    END,
    status_venda_updated_at = COALESCE(status_venda_updated_at, updated_at, created_at, now())
WHERE status_venda_updated_at IS NULL
   OR (
     status_venda IN ('aprovada'::public.status_venda, 'cancelada'::public.status_venda)
     AND aprovado_em IS NULL
   )
   OR (
     status_venda = 'cancelada'::public.status_venda
     AND NULLIF(btrim(motivo_decisao), '') IS NULL
   );

-- Duplicatas legadas são preservadas para auditoria, mas somente a venda mais
-- recente permanece ativa. O inventário permite revisão humana pós-rollout.
CREATE TABLE IF NOT EXISTS public.venda_integridade_conflitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  venda_preservada_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  venda_conflitante_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venda_integridade_conflitos_venda_uk UNIQUE (venda_conflitante_id),
  CONSTRAINT venda_integridade_conflitos_distintas_ck
    CHECK (venda_preservada_id <> venda_conflitante_id)
);

ALTER TABLE public.venda_integridade_conflitos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.venda_integridade_conflitos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.venda_integridade_conflitos TO authenticated;
GRANT ALL ON public.venda_integridade_conflitos TO service_role;

WITH ranked AS (
  SELECT
    v.id,
    v.lead_id,
    first_value(v.id) OVER (
      PARTITION BY v.lead_id
      ORDER BY v.data_assinatura DESC, v.created_at DESC, v.id DESC
    ) AS venda_preservada_id,
    row_number() OVER (
      PARTITION BY v.lead_id
      ORDER BY v.data_assinatura DESC, v.created_at DESC, v.id DESC
    ) AS rn
  FROM public.vendas AS v
  WHERE v.lead_id IS NOT NULL
    AND v.status_venda IN (
      'rascunho'::public.status_venda,
      'pendente'::public.status_venda,
      'aprovada'::public.status_venda
    )
)
INSERT INTO public.venda_integridade_conflitos (
  lead_id, venda_preservada_id, venda_conflitante_id, motivo
)
SELECT
  r.lead_id,
  r.venda_preservada_id,
  r.id,
  'Duplicata ativa encontrada no rollout; registro preservado como cancelado.'
FROM ranked AS r
WHERE r.rn > 1
ON CONFLICT (venda_conflitante_id) DO NOTHING;

UPDATE public.vendas AS v
SET status_venda = 'cancelada'::public.status_venda,
    motivo_decisao = COALESCE(
      NULLIF(btrim(v.motivo_decisao), ''),
      'Duplicata ativa encontrada no rollout; venda mais recente preservada.'
    ),
    status_venda_updated_at = now()
FROM public.venda_integridade_conflitos AS c
WHERE c.venda_conflitante_id = v.id
  AND v.status_venda IN (
    'rascunho'::public.status_venda,
    'pendente'::public.status_venda,
    'aprovada'::public.status_venda
  );

-- Um lead legado fechado sem venda atualmente aprovada não pode continuar
-- inflando relatórios que usam a etapa atual. Reabre para tratamento e deixa
-- evento explícito; leads com outra venda aprovada permanecem fechados.
WITH reabertos AS (
  UPDATE public.leads AS l
  SET status = 'em_atendimento'::public.lead_status,
      proxima_acao = 'Revisar fechamento sem venda aprovada',
      proximo_followup = now() + interval '1 day',
      ultima_interacao = now()
  WHERE l.deleted_at IS NULL
    AND l.status IN (
      'contrato_fechado'::public.lead_status,
      'pos_venda'::public.lead_status
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.lead_id = l.id
        AND v.status_venda = 'aprovada'::public.status_venda
    )
  RETURNING l.id
)
INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
SELECT
  r.id,
  'fechamento_reaberto',
  'Fechamento legado reaberto por ausência de venda aprovada.',
  'migration_sales_integrity',
  jsonb_build_object('migration', '20260711122000')
FROM reabertos AS r;

ALTER TABLE public.vendas
  ALTER COLUMN status_venda SET DEFAULT 'pendente'::public.status_venda,
  ALTER COLUMN status_venda SET NOT NULL,
  ALTER COLUMN status_venda_updated_at SET DEFAULT now(),
  ALTER COLUMN status_venda_updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vendas'::regclass
      AND conname = 'vendas_status_decisao_ck'
  ) THEN
    ALTER TABLE public.vendas
      ADD CONSTRAINT vendas_status_decisao_ck CHECK (
        (status_venda <> 'aprovada'::public.status_venda OR aprovado_em IS NOT NULL)
        AND (
          status_venda NOT IN (
            'rejeitada'::public.status_venda,
            'cancelada'::public.status_venda
          )
          OR NULLIF(btrim(motivo_decisao), '') IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.vendas VALIDATE CONSTRAINT vendas_status_decisao_ck;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_lead_ativa
  ON public.vendas (lead_id)
  WHERE lead_id IS NOT NULL
    AND status_venda IN (
      'rascunho'::public.status_venda,
      'pendente'::public.status_venda,
      'aprovada'::public.status_venda
    );

CREATE INDEX IF NOT EXISTS idx_vendas_status_data
  ON public.vendas (status_venda, data_assinatura DESC);

DROP POLICY IF EXISTS "venda_integridade_conflitos_select_gestao"
  ON public.venda_integridade_conflitos;
CREATE POLICY "venda_integridade_conflitos_select_gestao"
  ON public.venda_integridade_conflitos FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Ledgers append-only de comissão e métricas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissao_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissao_id uuid NOT NULL REFERENCES public.comissoes(id) ON DELETE RESTRICT,
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  beneficiario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  beneficiario_tipo text NOT NULL,
  evento text NOT NULL CHECK (evento IN ('credito', 'estorno')),
  valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissao_ledger_evento_uk UNIQUE (comissao_id, evento)
);

CREATE INDEX IF NOT EXISTS idx_comissao_ledger_venda_created
  ON public.comissao_ledger (venda_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comissao_ledger_beneficiario_created
  ON public.comissao_ledger (beneficiario_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.venda_metricas_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  evento text NOT NULL CHECK (evento IN ('credito', 'estorno')),
  dia date NOT NULL,
  vendas_delta integer NOT NULL CHECK (
    (evento = 'credito' AND vendas_delta = 1)
    OR (evento = 'estorno' AND vendas_delta = -1)
  ),
  vgv_delta numeric(14,2) NOT NULL CHECK (
    (evento = 'credito' AND vgv_delta >= 0)
    OR (evento = 'estorno' AND vgv_delta <= 0)
  ),
  origem text NOT NULL CHECK (origem IN ('legado', 'aprovacao', 'cancelamento')),
  idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venda_metricas_ledger_evento_uk UNIQUE (venda_id, evento)
);

CREATE INDEX IF NOT EXISTS idx_venda_metricas_ledger_corretor_dia
  ON public.venda_metricas_ledger (corretor_id, dia);

ALTER TABLE public.comissao_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_metricas_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.comissao_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.venda_metricas_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.comissao_ledger TO authenticated;
GRANT SELECT ON public.venda_metricas_ledger TO authenticated;
GRANT ALL ON public.comissao_ledger TO service_role;
GRANT ALL ON public.venda_metricas_ledger TO service_role;

DROP POLICY IF EXISTS "comissao_ledger_select_escopo" ON public.comissao_ledger;
CREATE POLICY "comissao_ledger_select_escopo"
  ON public.comissao_ledger FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      beneficiario_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.vendas AS v
        WHERE v.id = comissao_ledger.venda_id
          AND v.lead_id IS NOT NULL
          AND public.pode_acessar_lead(auth.uid(), v.lead_id)
      )
    )
  );

DROP POLICY IF EXISTS "venda_metricas_ledger_select_escopo"
  ON public.venda_metricas_ledger;
CREATE POLICY "venda_metricas_ledger_select_escopo"
  ON public.venda_metricas_ledger FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.id = venda_metricas_ledger.venda_id
        AND v.lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), v.lead_id)
    )
  );

CREATE OR REPLACE FUNCTION public.bloquear_mutacao_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'ledger imutável: registre um evento compensatório'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_mutacao_ledger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_comissao_ledger_imutavel ON public.comissao_ledger;
CREATE TRIGGER trg_comissao_ledger_imutavel
  BEFORE UPDATE OR DELETE ON public.comissao_ledger
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacao_ledger();

DROP TRIGGER IF EXISTS trg_venda_metricas_ledger_imutavel ON public.venda_metricas_ledger;
CREATE TRIGGER trg_venda_metricas_ledger_imutavel
  BEFORE UPDATE OR DELETE ON public.venda_metricas_ledger
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacao_ledger();

-- Registra o estado legado no ledger. Cancelamentos recebem crédito e estorno,
-- preservando a história sem contabilizar saldo atual.
INSERT INTO public.venda_metricas_ledger (
  venda_id, corretor_id, evento, dia, vendas_delta, vgv_delta,
  origem, idempotency_key, criado_por
)
SELECT
  v.id,
  v.corretor_id,
  'credito',
  (v.aprovado_em AT TIME ZONE 'America/Sao_Paulo')::date,
  1,
  GREATEST(v.valor_venda, 0),
  'legado',
  'venda:' || v.id::text || ':metricas:credito',
  v.aprovado_por
FROM public.vendas AS v
WHERE v.corretor_id IS NOT NULL
  AND v.status_venda IN ('aprovada'::public.status_venda, 'cancelada'::public.status_venda)
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.venda_metricas_ledger (
  venda_id, corretor_id, evento, dia, vendas_delta, vgv_delta,
  origem, idempotency_key, criado_por
)
SELECT
  v.id,
  v.corretor_id,
  'estorno',
  credito.dia,
  -1,
  -GREATEST(v.valor_venda, 0),
  'legado',
  'venda:' || v.id::text || ':metricas:estorno',
  v.aprovado_por
FROM public.vendas AS v
JOIN public.venda_metricas_ledger AS credito
  ON credito.venda_id = v.id AND credito.evento = 'credito'
WHERE v.corretor_id IS NOT NULL
  AND v.status_venda = 'cancelada'::public.status_venda
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.comissao_ledger (
  comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
  idempotency_key, criado_por, metadata
)
SELECT
  c.id,
  c.venda_id,
  c.beneficiario_id,
  c.tipo,
  'credito',
  GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
  'venda:' || c.venda_id::text || ':comissao:' || c.id::text || ':credito',
  v.aprovado_por,
  jsonb_build_object('origem', 'legado')
FROM public.comissoes AS c
JOIN public.vendas AS v ON v.id = c.venda_id
WHERE c.venda_id IS NOT NULL
  AND v.status_venda IN ('aprovada'::public.status_venda, 'cancelada'::public.status_venda)
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.comissao_ledger (
  comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
  idempotency_key, criado_por, metadata
)
SELECT
  c.id,
  c.venda_id,
  c.beneficiario_id,
  c.tipo,
  'estorno',
  GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
  'venda:' || c.venda_id::text || ':comissao:' || c.id::text || ':estorno',
  v.aprovado_por,
  jsonb_build_object('origem', 'legado')
FROM public.comissoes AS c
JOIN public.vendas AS v ON v.id = c.venda_id
WHERE c.venda_id IS NOT NULL
  AND (
    v.status_venda = 'cancelada'::public.status_venda
    OR c.status = 'cancelada'
  )
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE public.comissoes AS c
SET status = 'cancelada', updated_at = now()
FROM public.vendas AS v
WHERE v.id = c.venda_id
  AND v.status_venda IN ('rejeitada'::public.status_venda, 'cancelada'::public.status_venda)
  AND c.status <> 'cancelada';

-- Reconcilia somente as parcelas de venda/VGV. As demais atividades diárias
-- permanecem intactas; pontuação é recalculada com a configuração vigente.
INSERT INTO public.atividades_diarias (corretor_id, dia, vendas, vgv_dia)
SELECT
  l.corretor_id,
  l.dia,
  COALESCE(sum(l.vendas_delta), 0)::integer,
  COALESCE(sum(l.vgv_delta), 0)
FROM public.venda_metricas_ledger AS l
GROUP BY l.corretor_id, l.dia
ON CONFLICT (corretor_id, dia) DO UPDATE SET
  vendas = EXCLUDED.vendas,
  vgv_dia = EXCLUDED.vgv_dia,
  updated_at = now();

UPDATE public.atividades_diarias AS a
SET vendas = 0,
    vgv_dia = 0,
    updated_at = now()
WHERE (a.vendas <> 0 OR a.vgv_dia <> 0)
  AND NOT EXISTS (
    SELECT 1
    FROM public.venda_metricas_ledger AS l
    WHERE l.corretor_id = a.corretor_id AND l.dia = a.dia
  );

UPDATE public.atividades_diarias
SET pontuacao_total =
      ligacoes * public.pontos_de('ligacao')
    + whatsapps * public.pontos_de('whatsapp')
    + agendamentos * public.pontos_de('agendamento')
    + visitas * public.pontos_de('visita')
    + documentacoes * public.pontos_de('documentacao')
    + vendas * public.pontos_de('venda'),
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Efeitos de aprovação e estorno
-- ---------------------------------------------------------------------------
-- Nenhum efeito comercial nasce mais no INSERT da venda.
DROP TRIGGER IF EXISTS trg_gerar_comissoes_v2 ON public.vendas;
DROP TRIGGER IF EXISTS trg_comissoes_distrato ON public.vendas;
DROP TRIGGER IF EXISTS trg_pont_venda ON public.vendas;

-- Fechar o lead deixa de contar venda por transição; a aprovação abaixo passa a
-- ser a única origem de `vendas` e `vgv_dia`.
CREATE OR REPLACE FUNCTION public.pont_after_transicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _dia date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.corretor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.para_status = 'visita_realizada'::public.lead_status THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _vis => 1);
  ELSIF NEW.para_status = 'analise_credito'::public.lead_status THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _doc => 1);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pont_after_transicao() FROM PUBLIC, anon, authenticated;

-- Reescreve o gerador existente no schema V2. Ele é deliberadamente inerte
-- enquanto a venda não está aprovada.
CREATE OR REPLACE FUNCTION public.gerar_comissoes_para_venda(_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _v public.vendas%ROWTYPE;
  _corretor_nome text;
  _gerente_id uuid;
  _gerente_nome text;
  _super_id uuid;
  _super_nome text;
BEGIN
  SELECT * INTO _v
  FROM public.vendas
  WHERE id = _venda_id
  FOR UPDATE;

  IF NOT FOUND OR _v.status_venda <> 'aprovada'::public.status_venda THEN
    RETURN;
  END IF;

  SELECT p.nome INTO _corretor_nome
  FROM public.profiles AS p
  WHERE p.id = _v.corretor_id;

  SELECT e.gestor_id INTO _gerente_id
  FROM public.profiles AS p
  JOIN public.equipes AS e ON e.id = p.equipe_id
  WHERE p.id = _v.corretor_id;

  IF _gerente_id IS NOT NULL THEN
    SELECT p.nome INTO _gerente_nome
    FROM public.profiles AS p
    WHERE p.id = _gerente_id;
  END IF;

  IF (
    SELECT count(*)
    FROM public.user_roles AS ur
    JOIN public.profiles AS p ON p.id = ur.user_id
    WHERE ur.role = 'superintendente'::public.app_role
      AND p.status_conta = 'ativa'::public.status_conta
  ) = 1 THEN
    SELECT ur.user_id INTO _super_id
    FROM public.user_roles AS ur
    JOIN public.profiles AS p ON p.id = ur.user_id
    WHERE ur.role = 'superintendente'::public.app_role
      AND p.status_conta = 'ativa'::public.status_conta;

    SELECT p.nome INTO _super_nome
    FROM public.profiles AS p
    WHERE p.id = _super_id;
  END IF;

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _v.corretor_id, _corretor_nome, 'corretor', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_corretor, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_corretor, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_corretor, 0) / 100, 2), _v.valor_venda
  WHERE (_v.corretor_id IS NOT NULL OR COALESCE(_v.percentual_corretor, 0) > 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'corretor'
    );

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _gerente_id, _gerente_nome, 'gerente', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_gerente, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_gerente, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_gerente, 0) / 100, 2), _v.valor_venda
  WHERE COALESCE(_v.percentual_gerente, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'gerente'
    );

  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto,
    valor_liquido, contrato_vgv
  )
  SELECT
    _v.id, _v.lead_id, _super_id, _super_nome, 'superintendente', 'pendente',
    _v.valor_venda, COALESCE(_v.percentual_superintendente, 0),
    round(_v.valor_venda * COALESCE(_v.percentual_superintendente, 0) / 100, 2), 0,
    round(_v.valor_venda * COALESCE(_v.percentual_superintendente, 0) / 100, 2), _v.valor_venda
  WHERE COALESCE(_v.percentual_superintendente, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes AS c
      WHERE c.venda_id = _v.id AND c.tipo = 'superintendente'
    );

  INSERT INTO public.comissao_ledger (
    comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
    idempotency_key, criado_por, metadata
  )
  SELECT
    c.id,
    _v.id,
    c.beneficiario_id,
    c.tipo,
    'credito',
    GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
    'venda:' || _v.id::text || ':comissao:' || c.id::text || ':credito',
    _v.aprovado_por,
    jsonb_build_object('status_venda', _v.status_venda::text)
  FROM public.comissoes AS c
  WHERE c.venda_id = _v.id
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_comissoes_para_venda(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validar_mutacao_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _via_rpc boolean := COALESCE(
    current_setting('app.aprovar_venda', true) = 'on', false
  );
  _legacy_distrato boolean := false;
  _gestao boolean := public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.role() = 'authenticated'
       AND NEW.status_venda NOT IN (
         'rascunho'::public.status_venda, 'pendente'::public.status_venda
       ) THEN
      RAISE EXCEPTION 'venda deve iniciar como rascunho ou pendente'
        USING ERRCODE = '42501';
    END IF;
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
    NEW.motivo_decisao := NULL;
    NEW.status_venda_updated_at := now();
    RETURN NEW;
  END IF;

  IF auth.role() = 'authenticated' THEN
    IF NEW.lead_id IS DISTINCT FROM OLD.lead_id
       OR NEW.corretor_id IS DISTINCT FROM OLD.corretor_id
       OR NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id THEN
      RAISE EXCEPTION 'vínculos da venda são imutáveis'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status_venda = 'aprovada'::public.status_venda
       AND (
         NEW.valor_venda IS DISTINCT FROM OLD.valor_venda
         OR NEW.data_assinatura IS DISTINCT FROM OLD.data_assinatura
         OR NEW.projeto_id IS DISTINCT FROM OLD.projeto_id
         OR NEW.projeto_nome IS DISTINCT FROM OLD.projeto_nome
         OR NEW.percentual_comissao IS DISTINCT FROM OLD.percentual_comissao
         OR NEW.percentual_corretor IS DISTINCT FROM OLD.percentual_corretor
         OR NEW.percentual_gerente IS DISTINCT FROM OLD.percentual_gerente
         OR NEW.percentual_superintendente IS DISTINCT FROM OLD.percentual_superintendente
       ) THEN
      RAISE EXCEPTION 'venda aprovada é imutável; cancele e registre uma correção'
        USING ERRCODE = '42501';
    END IF;

    -- Compatibilidade temporária com o botão legado de distrato. Somente gestão
    -- pode usá-lo e o trigger converte a ação em cancelamento auditado.
    IF NEW.distrato AND NOT OLD.distrato
       AND OLD.status_venda = 'aprovada'::public.status_venda
       AND NEW.status_venda = OLD.status_venda THEN
      IF NOT _gestao THEN
        RAISE EXCEPTION 'somente gestão pode cancelar venda'
          USING ERRCODE = '42501';
      END IF;
      NEW.status_venda := 'cancelada'::public.status_venda;
      NEW.motivo_decisao := COALESCE(
        NULLIF(btrim(NEW.motivo_distrato), ''), 'Distrato registrado no fluxo legado'
      );
      NEW.data_distrato := COALESCE(NEW.data_distrato, current_date);
      _legacy_distrato := true;
    ELSIF NEW.distrato IS DISTINCT FROM OLD.distrato
          AND NOT _via_rpc THEN
      RAISE EXCEPTION 'use a RPC aprovar_venda para alterar o distrato'
        USING ERRCODE = '42501';
    ELSIF NEW.status_venda IS DISTINCT FROM OLD.status_venda AND NOT _via_rpc THEN
      RAISE EXCEPTION 'use a RPC aprovar_venda para alterar o estado da venda'
        USING ERRCODE = '42501';
    END IF;

    IF NOT _via_rpc AND NOT _legacy_distrato
       AND (
         NEW.aprovado_por IS DISTINCT FROM OLD.aprovado_por
         OR NEW.aprovado_em IS DISTINCT FROM OLD.aprovado_em
         OR NEW.motivo_decisao IS DISTINCT FROM OLD.motivo_decisao
         OR NEW.status_venda_updated_at IS DISTINCT FROM OLD.status_venda_updated_at
         OR NEW.data_distrato IS DISTINCT FROM OLD.data_distrato
         OR NEW.motivo_distrato IS DISTINCT FROM OLD.motivo_distrato
       ) THEN
      RAISE EXCEPTION 'campos de decisão da venda são controlados pela RPC'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status_venda = 'cancelada'::public.status_venda
       AND NOT NEW.distrato THEN
      RAISE EXCEPTION 'cancelamento de venda não pode ser desfeito'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status_venda IS DISTINCT FROM OLD.status_venda THEN
    NEW.status_venda_updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_mutacao_venda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_mutacao_venda ON public.vendas;
CREATE TRIGGER trg_validar_mutacao_venda
  BEFORE INSERT OR UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.validar_mutacao_venda();

CREATE OR REPLACE FUNCTION public.validar_mutacao_comissao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated'
     OR current_setting('app.commercial_effects', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.venda_id IS DISTINCT FROM OLD.venda_id
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.beneficiario_id IS DISTINCT FROM OLD.beneficiario_id
     OR NEW.beneficiario_nome IS DISTINCT FROM OLD.beneficiario_nome
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.valor_base IS DISTINCT FROM OLD.valor_base
     OR NEW.percentual IS DISTINCT FROM OLD.percentual
     OR NEW.valor_comissao IS DISTINCT FROM OLD.valor_comissao
     OR NEW.percentual_desconto IS DISTINCT FROM OLD.percentual_desconto
     OR NEW.valor_liquido IS DISTINCT FROM OLD.valor_liquido
     OR NEW.contrato_vgv IS DISTINCT FROM OLD.contrato_vgv THEN
    RAISE EXCEPTION 'valores da comissão são controlados pelo ledger'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'pendente' AND NEW.status = 'paga' AND NEW.data_pagamento IS NOT NULL)
       OR (OLD.status = 'paga' AND NEW.status = 'pendente' AND NEW.data_pagamento IS NULL)
     ) THEN
    RAISE EXCEPTION 'transição de comissão inválida'
      USING ERRCODE = '22023';
  END IF;

  IF (NEW.status = 'paga' AND NEW.data_pagamento IS NULL)
     OR (NEW.status = 'pendente' AND NEW.data_pagamento IS NOT NULL) THEN
    RAISE EXCEPTION 'status e data de pagamento são inconsistentes'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_mutacao_comissao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_mutacao_comissao ON public.comissoes;
CREATE TRIGGER trg_validar_mutacao_comissao
  BEFORE UPDATE ON public.comissoes
  FOR EACH ROW EXECUTE FUNCTION public.validar_mutacao_comissao();

CREATE OR REPLACE FUNCTION public.aplicar_efeitos_status_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _ledger_id uuid;
  _dia date;
BEGIN
  IF NEW.status_venda = OLD.status_venda THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.commercial_effects', 'on', true);
  PERFORM set_config('app.transicionar_lead', 'on', true);

  IF NEW.status_venda = 'aprovada'::public.status_venda THEN
    PERFORM public.gerar_comissoes_para_venda(NEW.id);

    _dia := (NEW.aprovado_em AT TIME ZONE 'America/Sao_Paulo')::date;
    INSERT INTO public.venda_metricas_ledger (
      venda_id, corretor_id, evento, dia, vendas_delta, vgv_delta,
      origem, idempotency_key, criado_por
    )
    VALUES (
      NEW.id, NEW.corretor_id, 'credito', _dia, 1, NEW.valor_venda,
      'aprovacao', 'venda:' || NEW.id::text || ':metricas:credito', NEW.aprovado_por
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO _ledger_id;

    IF _ledger_id IS NOT NULL THEN
      PERFORM public.bump_atividade(
        NEW.corretor_id, _dia, _ven => 1, _vgv => NEW.valor_venda
      );
    END IF;

    UPDATE public.leads
    SET status = 'contrato_fechado'::public.lead_status,
        proxima_acao = NULL,
        proximo_followup = NULL,
        ultima_interacao = now()
    WHERE id = NEW.lead_id
      AND status NOT IN (
        'contrato_fechado'::public.lead_status,
        'pos_venda'::public.lead_status
      );

    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (
      NEW.lead_id,
      'venda_aprovada',
      'Venda aprovada pela gestão.',
      'aprovar_venda',
      jsonb_build_object('venda_id', NEW.id, 'valor_venda', NEW.valor_venda)
    );

  ELSIF OLD.status_venda = 'aprovada'::public.status_venda
        AND NEW.status_venda = 'cancelada'::public.status_venda THEN
    -- Garante crédito antes do estorno inclusive para comissões adicionadas por
    -- service_role depois da aprovação.
    INSERT INTO public.comissao_ledger (
      comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
      idempotency_key, criado_por, metadata
    )
    SELECT
      c.id, NEW.id, c.beneficiario_id, c.tipo, 'credito',
      GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
      'venda:' || NEW.id::text || ':comissao:' || c.id::text || ':credito',
      NEW.aprovado_por, jsonb_build_object('origem', 'recuperacao')
    FROM public.comissoes AS c
    WHERE c.venda_id = NEW.id
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO public.comissao_ledger (
      comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor,
      idempotency_key, criado_por, metadata
    )
    SELECT
      c.id, NEW.id, c.beneficiario_id, c.tipo, 'estorno',
      GREATEST(COALESCE(c.valor_liquido, c.valor_comissao, 0), 0),
      'venda:' || NEW.id::text || ':comissao:' || c.id::text || ':estorno',
      auth.uid(), jsonb_build_object('motivo', NEW.motivo_decisao)
    FROM public.comissoes AS c
    WHERE c.venda_id = NEW.id
    ON CONFLICT (idempotency_key) DO NOTHING;

    UPDATE public.comissoes
    SET status = 'cancelada', updated_at = now()
    WHERE venda_id = NEW.id AND status <> 'cancelada';

    SELECT l.dia INTO _dia
    FROM public.venda_metricas_ledger AS l
    WHERE l.venda_id = NEW.id AND l.evento = 'credito';

    IF _dia IS NULL THEN
      RAISE EXCEPTION 'crédito de métricas ausente para venda aprovada %', NEW.id
        USING ERRCODE = '55000';
    END IF;

    _ledger_id := NULL;
    INSERT INTO public.venda_metricas_ledger (
      venda_id, corretor_id, evento, dia, vendas_delta, vgv_delta,
      origem, idempotency_key, criado_por
    )
    VALUES (
      NEW.id, NEW.corretor_id, 'estorno', _dia, -1, -NEW.valor_venda,
      'cancelamento', 'venda:' || NEW.id::text || ':metricas:estorno', auth.uid()
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO _ledger_id;

    IF _ledger_id IS NOT NULL THEN
      PERFORM public.bump_atividade(
        NEW.corretor_id, _dia, _ven => -1, _vgv => -NEW.valor_venda
      );
    END IF;

    UPDATE public.leads
    SET status = 'em_atendimento'::public.lead_status,
        proxima_acao = 'Revisar venda cancelada',
        proximo_followup = now(),
        ultima_interacao = now()
    WHERE id = NEW.lead_id
      AND status IN (
        'contrato_fechado'::public.lead_status,
        'pos_venda'::public.lead_status
      );

    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (
      NEW.lead_id,
      'venda_cancelada',
      NEW.motivo_decisao,
      'aprovar_venda',
      jsonb_build_object('venda_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_efeitos_status_venda()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_aplicar_efeitos_status_venda ON public.vendas;
CREATE TRIGGER trg_aplicar_efeitos_status_venda
  AFTER UPDATE OF status_venda ON public.vendas
  FOR EACH ROW
  WHEN (OLD.status_venda IS DISTINCT FROM NEW.status_venda)
  EXECUTE FUNCTION public.aplicar_efeitos_status_venda();

-- ---------------------------------------------------------------------------
-- 4) RPC gerencial de aprovação/cancelamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprovar_venda(
  p_venda_id uuid,
  p_decisao public.status_venda,
  p_motivo text DEFAULT NULL
)
RETURNS public.vendas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _venda public.vendas%ROWTYPE;
  _resultado public.vendas%ROWTYPE;
  _uid uuid := auth.uid();
BEGIN
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'gestor'::public.app_role)
    OR public.has_role(_uid, 'superintendente'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'aprovação de venda exige papel de gestão'
      USING ERRCODE = '42501';
  END IF;

  IF p_decisao IS NULL THEN
    RAISE EXCEPTION 'decisão é obrigatória'
      USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NOT NULL AND char_length(btrim(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'motivo excede 1000 caracteres'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _venda
  FROM public.vendas
  WHERE id = p_venda_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda não encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  IF _venda.lead_id IS NULL
     OR NOT public.pode_acessar_lead(_uid, _venda.lead_id) THEN
    RAISE EXCEPTION 'venda fora do escopo da gestão'
      USING ERRCODE = '42501';
  END IF;

  IF p_decisao NOT IN (
    'aprovada'::public.status_venda,
    'rejeitada'::public.status_venda,
    'cancelada'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'decisão deve ser aprovada, rejeitada ou cancelada'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao = _venda.status_venda THEN
    RETURN _venda;
  END IF;

  IF _venda.status_venda IN (
    'rejeitada'::public.status_venda,
    'cancelada'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'venda em estado terminal não pode ser reaberta'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao IN (
    'aprovada'::public.status_venda,
    'rejeitada'::public.status_venda
  ) AND _venda.status_venda NOT IN (
    'rascunho'::public.status_venda,
    'pendente'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'transição de estado da venda inválida'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao = 'cancelada'::public.status_venda
     AND _venda.status_venda <> 'aprovada'::public.status_venda THEN
    RAISE EXCEPTION 'somente venda aprovada pode ser cancelada'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao IN (
    'rejeitada'::public.status_venda,
    'cancelada'::public.status_venda
  ) AND NULLIF(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'motivo é obrigatório para rejeitar ou cancelar'
      USING ERRCODE = '22023';
  END IF;

  IF p_decisao = 'aprovada'::public.status_venda THEN
    IF _venda.lead_id IS NULL OR _venda.corretor_id IS NULL
       OR _venda.valor_venda <= 0
       OR _venda.data_assinatura > current_date THEN
      RAISE EXCEPTION 'venda incompleta ou inválida para aprovação'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.leads AS l
      WHERE l.id = _venda.lead_id
        AND l.corretor_id = _venda.corretor_id
        AND l.deleted_at IS NULL
        AND l.status <> 'perdido'::public.lead_status
    ) THEN
      RAISE EXCEPTION 'venda não corresponde à carteira atual do lead'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('app.aprovar_venda', 'on', true);

  UPDATE public.vendas
  SET status_venda = p_decisao,
      aprovado_por = CASE
        WHEN p_decisao = 'aprovada'::public.status_venda THEN _uid
        ELSE aprovado_por
      END,
      aprovado_em = CASE
        WHEN p_decisao = 'aprovada'::public.status_venda THEN now()
        ELSE aprovado_em
      END,
      motivo_decisao = CASE
        WHEN p_decisao = 'aprovada'::public.status_venda
          THEN NULLIF(btrim(p_motivo), '')
        ELSE btrim(p_motivo)
      END,
      distrato = CASE
        WHEN p_decisao = 'cancelada'::public.status_venda THEN true
        ELSE distrato
      END,
      data_distrato = CASE
        WHEN p_decisao = 'cancelada'::public.status_venda THEN current_date
        ELSE data_distrato
      END,
      motivo_distrato = CASE
        WHEN p_decisao = 'cancelada'::public.status_venda THEN btrim(p_motivo)
        ELSE motivo_distrato
      END
  WHERE id = p_venda_id
  RETURNING * INTO _resultado;

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_venda(uuid, public.status_venda, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_venda(uuid, public.status_venda, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Máquina de estados transacional do lead
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transicao_lead_permitida(
  p_de public.lead_status,
  p_para public.lead_status,
  p_gestao boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_de = p_para THEN true
    WHEN p_de::text = 'aguardando_corretor'
      THEN p_para::text = ANY (ARRAY['novo','aguardando_atendimento','em_atendimento','perdido'])
    WHEN p_de::text = 'novo'
      THEN p_para::text = ANY (ARRAY['aguardando_atendimento','em_atendimento','qualificado','perdido'])
    WHEN p_de::text = 'aguardando_atendimento'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificado','perdido'])
    WHEN p_de::text = 'em_atendimento'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','qualificado','agendado','perdido'])
    WHEN p_de::text = 'aguardando_retorno'
      THEN p_para::text = ANY (ARRAY['em_atendimento','qualificado','agendado','perdido'])
    WHEN p_de::text = 'qualificado'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','agendado','visita_realizada','proposta_enviada','analise_credito','perdido'])
    WHEN p_de::text = 'agendado'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','visita_realizada','perdido'])
    WHEN p_de::text = 'visita_realizada'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','agendado','proposta_enviada','analise_credito','perdido'])
    WHEN p_de::text = 'proposta_enviada'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','analise_credito','contrato_fechado','perdido'])
    WHEN p_de::text = 'analise_credito'
      THEN p_para::text = ANY (ARRAY['aguardando_retorno','proposta_enviada','contrato_fechado','perdido'])
    WHEN p_de::text = 'contrato_fechado'
      THEN p_gestao AND p_para::text = 'pos_venda'
    WHEN p_de::text IN ('perdido','pos_venda')
      THEN p_gestao AND p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno'])
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.transicao_lead_permitida(
  public.lead_status, public.lead_status, boolean
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.transicionar_lead(
  p_lead_id uuid,
  p_novo_status public.lead_status,
  p_motivo text DEFAULT NULL,
  p_proxima_acao text DEFAULT NULL,
  p_proximo_followup timestamptz DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _resultado public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _service_role boolean := COALESCE(auth.role() = 'service_role', false);
  _gestao boolean;
  _acao_final text;
  _followup_final timestamptz;
BEGIN
  IF NOT _service_role AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa'
      USING ERRCODE = '42501';
  END IF;

  IF p_novo_status IS NULL THEN
    RAISE EXCEPTION 'novo status é obrigatório'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT _service_role AND NOT public.pode_acessar_lead(_uid, p_lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada'
      USING ERRCODE = '42501';
  END IF;

  _gestao := _service_role
    OR public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'gestor'::public.app_role)
    OR public.has_role(_uid, 'superintendente'::public.app_role);

  IF NOT public.transicao_lead_permitida(_lead.status, p_novo_status, _gestao) THEN
    RAISE EXCEPTION 'transição de % para % não permitida', _lead.status, p_novo_status
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_status = 'perdido'::public.lead_status
     AND NULLIF(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'motivo é obrigatório ao perder um lead'
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN (
    'contrato_fechado'::public.lead_status,
    'pos_venda'::public.lead_status
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.vendas AS v
    WHERE v.lead_id = p_lead_id
      AND v.status_venda = 'aprovada'::public.status_venda
  ) THEN
    RAISE EXCEPTION 'lead só pode ser fechado após aprovação da venda'
      USING ERRCODE = '23514';
  END IF;

  IF p_novo_status IN (
    'contrato_fechado'::public.lead_status,
    'pos_venda'::public.lead_status
  ) AND NOT _gestao THEN
    RAISE EXCEPTION 'fechamento e pós-venda exigem papel de gestão'
      USING ERRCODE = '42501';
  END IF;

  IF p_proxima_acao IS NOT NULL AND char_length(btrim(p_proxima_acao)) > 500 THEN
    RAISE EXCEPTION 'próxima ação excede 500 caracteres'
      USING ERRCODE = '22023';
  END IF;

  IF p_proximo_followup IS NOT NULL
     AND p_proximo_followup <= now()
     AND p_novo_status NOT IN (
       'contrato_fechado'::public.lead_status,
       'pos_venda'::public.lead_status,
       'perdido'::public.lead_status
     ) THEN
    RAISE EXCEPTION 'follow-up deve estar no futuro'
      USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NOT NULL AND char_length(btrim(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'motivo excede 1000 caracteres'
      USING ERRCODE = '22023';
  END IF;

  _acao_final := COALESCE(NULLIF(btrim(p_proxima_acao), ''), _lead.proxima_acao);
  _followup_final := COALESCE(p_proximo_followup, _lead.proximo_followup);

  IF p_novo_status = 'aguardando_retorno'::public.lead_status
     AND (_followup_final IS NULL OR _followup_final <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro'
      USING ERRCODE = '22023';
  END IF;

  IF p_novo_status IN (
    'em_atendimento'::public.lead_status,
    'aguardando_retorno'::public.lead_status,
    'qualificado'::public.lead_status,
    'agendado'::public.lead_status,
    'visita_realizada'::public.lead_status,
    'proposta_enviada'::public.lead_status,
    'analise_credito'::public.lead_status
  ) AND _acao_final IS NULL AND _followup_final IS NULL THEN
    RAISE EXCEPTION 'informe próxima ação ou follow-up'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);

  UPDATE public.leads
  SET status = p_novo_status,
      motivo_perdido = CASE
        WHEN p_novo_status = 'perdido'::public.lead_status THEN btrim(p_motivo)
        WHEN _lead.status = 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perdido
      END,
      motivo_perda_categoria = CASE
        WHEN _lead.status = 'perdido'::public.lead_status
             AND p_novo_status <> 'perdido'::public.lead_status THEN NULL
        ELSE motivo_perda_categoria
      END,
      proxima_acao = CASE
        WHEN p_novo_status IN (
          'contrato_fechado'::public.lead_status,
          'pos_venda'::public.lead_status,
          'perdido'::public.lead_status
        ) THEN NULL
        ELSE _acao_final
      END,
      proximo_followup = CASE
        WHEN p_novo_status IN (
          'contrato_fechado'::public.lead_status,
          'pos_venda'::public.lead_status,
          'perdido'::public.lead_status
        ) THEN NULL
        ELSE _followup_final
      END,
      ultima_interacao = now()
  WHERE id = p_lead_id
  RETURNING * INTO _resultado;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    p_lead_id,
    'transicao_lead',
    'Lead movido de ' || _lead.status::text || ' para ' || p_novo_status::text || '.',
    'transicionar_lead',
    jsonb_strip_nulls(jsonb_build_object(
      'de_status', _lead.status,
      'para_status', p_novo_status,
      'motivo', NULLIF(btrim(p_motivo), ''),
      'proxima_acao', _resultado.proxima_acao,
      'proximo_followup', _resultado.proximo_followup,
      'alterado_por', _uid
    ))
  );

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.transicionar_lead(
  uuid, public.lead_status, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transicionar_lead(
  uuid, public.lead_status, text, text, timestamptz
) TO authenticated;

-- Defesa transversal: nem UPDATE direto, nem função legada pode fechar um lead
-- sem que exista uma venda aprovada no mesmo transaction snapshot.
CREATE OR REPLACE FUNCTION public.proteger_fechamento_sem_venda_aprovada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IN (
      'contrato_fechado'::public.lead_status,
      'pos_venda'::public.lead_status
    )
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NOT EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.lead_id = NEW.id
        AND v.status_venda = 'aprovada'::public.status_venda
    ) THEN
    RAISE EXCEPTION 'lead só pode ser fechado após aprovação da venda'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_fechamento_sem_venda_aprovada()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proteger_fechamento_sem_venda_aprovada ON public.leads;
CREATE TRIGGER trg_proteger_fechamento_sem_venda_aprovada
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.proteger_fechamento_sem_venda_aprovada();

-- ---------------------------------------------------------------------------
-- 6) RLS fail-closed de vendas e comissões
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "vendas_select" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete" ON public.vendas;
DROP POLICY IF EXISTS "vendas_select_own_or_gestor" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_auth" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_own_or_gestor" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update_own_or_gestor" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete_gestor" ON public.vendas;
DROP POLICY IF EXISTS "vendas_select_integridade" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_integridade" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update_integridade" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete_integridade" ON public.vendas;

CREATE POLICY "vendas_select_integridade"
  ON public.vendas FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND lead_id IS NOT NULL
    AND public.pode_acessar_lead(auth.uid(), lead_id)
  );

CREATE POLICY "vendas_insert_integridade"
  ON public.vendas FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_member(auth.uid())
    AND criado_por_id = auth.uid()
    AND lead_id IS NOT NULL
    AND corretor_id IS NOT NULL
    AND status_venda IN (
      'rascunho'::public.status_venda,
      'pendente'::public.status_venda
    )
    AND public.pode_acessar_lead(auth.uid(), lead_id)
    AND EXISTS (
      SELECT 1
      FROM public.leads AS l
      WHERE l.id = vendas.lead_id
        AND l.corretor_id = vendas.corretor_id
    )
  );

CREATE POLICY "vendas_update_integridade"
  ON public.vendas FOR UPDATE TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND lead_id IS NOT NULL
    AND public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
      OR public.has_role(auth.uid(), 'superintendente')
      OR (
        corretor_id = auth.uid()
        AND status_venda IN (
          'rascunho'::public.status_venda,
          'pendente'::public.status_venda
        )
      )
    )
  )
  WITH CHECK (
    public.is_active_member(auth.uid())
    AND lead_id IS NOT NULL
    AND public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
      OR public.has_role(auth.uid(), 'superintendente')
      OR (
        corretor_id = auth.uid()
        AND status_venda IN (
          'rascunho'::public.status_venda,
          'pendente'::public.status_venda
        )
      )
    )
  );

CREATE POLICY "vendas_delete_integridade"
  ON public.vendas FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND status_venda IN (
      'rascunho'::public.status_venda,
      'rejeitada'::public.status_venda
    )
  );

DROP POLICY IF EXISTS "comissoes_select" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_manage" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_select_own_or_gestor" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_insert_gestor" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_update_gestor" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_delete_admin" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_select_integridade" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_update_integridade" ON public.comissoes;

REVOKE INSERT, DELETE ON public.comissoes FROM authenticated;

CREATE POLICY "comissoes_select_integridade"
  ON public.comissoes FOR SELECT TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      beneficiario_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.vendas AS v
        WHERE v.id = comissoes.venda_id
          AND v.lead_id IS NOT NULL
          AND public.pode_acessar_lead(auth.uid(), v.lead_id)
      )
    )
  );

CREATE POLICY "comissoes_update_integridade"
  ON public.comissoes FOR UPDATE TO authenticated
  USING (
    public.is_active_member(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
      OR public.has_role(auth.uid(), 'superintendente')
    )
    AND EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.id = comissoes.venda_id
        AND v.lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), v.lead_id)
    )
  )
  WITH CHECK (
    public.is_active_member(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
      OR public.has_role(auth.uid(), 'superintendente')
    )
    AND EXISTS (
      SELECT 1
      FROM public.vendas AS v
      WHERE v.id = comissoes.venda_id
        AND v.lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), v.lead_id)
    )
  );

-- Critério comercial da roleta: uma proposta pendente nunca qualifica o
-- corretor como vendedor do mês anterior.
CREATE OR REPLACE FUNCTION public.vendas_mes_anterior()
RETURNS TABLE (corretor_id uuid, qtd bigint, total numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.is_active_member(_caller)
       OR NOT (
         public.has_role(_caller, 'admin'::public.app_role)
         OR public.has_role(_caller, 'gestor'::public.app_role)
         OR public.has_role(_caller, 'superintendente'::public.app_role)
       ) THEN
      RAISE EXCEPTION 'forbidden'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v.corretor_id,
    count(*)::bigint,
    COALESCE(sum(v.valor_venda), 0)
  FROM public.vendas AS v
  WHERE v.status_venda = 'aprovada'::public.status_venda
    AND v.distrato = false
    AND v.corretor_id IS NOT NULL
    AND v.data_assinatura >= (
      date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month'
    )::date
    AND v.data_assinatura < (
      date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
    )::date
  GROUP BY v.corretor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_mes_anterior() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_mes_anterior() TO authenticated, service_role;

COMMENT ON COLUMN public.vendas.status_venda IS
  'Estado gerencial. Comissão, VGV, ranking e meta só mudam em aprovada.';
COMMENT ON TABLE public.comissao_ledger IS
  'Ledger append-only e idempotente de créditos e estornos de comissão.';
COMMENT ON TABLE public.venda_metricas_ledger IS
  'Ledger append-only que materializa venda/VGV em atividades_diarias após aprovação.';

-- ============================================================================
-- [5/18] 20260711123000_invite_operations.sql
-- ============================================================================

-- Operações server-side do ciclo de vida de contas. As funções abaixo não são
-- APIs de browser: somente service_role pode executá-las, depois que a Edge
-- Function valida o JWT e o papel do autor.

CREATE TABLE IF NOT EXISTS public.conta_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status_anterior public.status_conta,
  status_novo public.status_conta NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conta_auditoria_usuario_created
  ON public.conta_auditoria (usuario_id, created_at DESC);
ALTER TABLE public.conta_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conta_auditoria FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.conta_auditoria TO service_role;

CREATE OR REPLACE FUNCTION public.ativar_convite_por_email(_convite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _convite public.convites_crm%ROWTYPE;
  _usuario_id uuid;
  _email text;
BEGIN
  SELECT * INTO _convite
  FROM public.convites_crm
  WHERE id = _convite_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'convite nao encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF _convite.estado = 'aceito'::public.convite_crm_estado THEN
    RETURN _convite.aceito_por;
  END IF;
  IF _convite.estado <> 'pendente'::public.convite_crm_estado THEN
    RAISE EXCEPTION 'convite indisponivel' USING ERRCODE = '22023';
  END IF;
  IF _convite.expira_em <= now() THEN
    UPDATE public.convites_crm
    SET estado = 'expirado'::public.convite_crm_estado
    WHERE id = _convite.id;
    RETURN NULL;
  END IF;

  SELECT u.id, u.email
  INTO _usuario_id, _email
  FROM auth.users AS u
  WHERE lower(btrim(u.email)) = _convite.email_normalizado
  ORDER BY u.created_at ASC
  LIMIT 1;
  IF _usuario_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.profiles (id, email, nome, equipe_id, status_conta)
  VALUES (
    _usuario_id,
    _email,
    split_part(_email, '@', 1),
    _convite.equipe_id,
    'ativa'::public.status_conta
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      equipe_id = EXCLUDED.equipe_id,
      status_conta = 'ativa'::public.status_conta;

  DELETE FROM public.user_roles WHERE user_id = _usuario_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_usuario_id, _convite.papel)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.convites_crm
  SET estado = 'aceito'::public.convite_crm_estado,
      aceito_por = _usuario_id,
      aceito_em = now()
  WHERE id = _convite.id;

  RETURN _usuario_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_status_conta(
  _usuario_id uuid,
  _status public.status_conta,
  _autor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _anterior public.status_conta;
BEGIN
  IF _autor_id IS NULL OR _usuario_id IS NULL THEN
    RAISE EXCEPTION 'usuario e autor sao obrigatorios' USING ERRCODE = '22023';
  END IF;

  SELECT status_conta INTO _anterior
  FROM public.profiles
  WHERE id = _usuario_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF _status = 'bloqueada'::public.status_conta
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _usuario_id AND role = 'admin'::public.app_role
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_roles AS ur
       JOIN public.profiles AS p ON p.id = ur.user_id
       WHERE ur.role = 'admin'::public.app_role
         AND ur.user_id <> _usuario_id
         AND p.status_conta = 'ativa'::public.status_conta
     ) THEN
    RAISE EXCEPTION 'nao e permitido bloquear o ultimo admin ativo'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.profiles
  SET status_conta = _status,
      ativo = CASE WHEN _status = 'bloqueada'::public.status_conta THEN false ELSE ativo END
  WHERE id = _usuario_id;

  INSERT INTO public.conta_auditoria (usuario_id, autor_id, status_anterior, status_novo)
  VALUES (_usuario_id, _autor_id, _anterior, _status);

  IF _status <> 'ativa'::public.status_conta THEN
    -- Revoga refresh tokens/sessões no GoTrue. JWTs já emitidos continuam sendo
    -- negados imediatamente por is_active_member/has_role/RLS.
    DELETE FROM auth.sessions WHERE user_id = _usuario_id;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ativar_convite_por_email(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_convite_por_email(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.definir_status_conta(uuid, public.status_conta, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_status_conta(uuid, public.status_conta, uuid)
  TO service_role;

-- ============================================================================
-- [6/18] 20260711123500_related_lead_rls.sql
-- ============================================================================

-- Propaga o mesmo escopo de carteira para dados satélites do lead. Policies
-- antigas eram baseadas apenas no papel "gestor" e, por OR cumulativo, davam
-- acesso à organização inteira.

CREATE OR REPLACE FUNCTION public.pode_acessar_corretor(
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
     AND _corretor_id IS NOT NULL
     AND (
       _user_id = _corretor_id
       OR public.has_role(_user_id, 'admin'::public.app_role)
       OR public.has_role(_user_id, 'superintendente'::public.app_role)
       OR (
         public.has_role(_user_id, 'gestor'::public.app_role)
         AND EXISTS (
           SELECT 1
           FROM public.profiles AS gestor
           JOIN public.profiles AS corretor ON corretor.id = _corretor_id
           WHERE gestor.id = _user_id
             AND (
               (gestor.equipe_id IS NOT NULL AND gestor.equipe_id = corretor.equipe_id)
               OR EXISTS (
                 SELECT 1 FROM public.equipes AS e
                 WHERE e.id = corretor.equipe_id AND e.gestor_id = _user_id
               )
             )
         )
       )
     );
$$;
REVOKE ALL ON FUNCTION public.pode_acessar_corretor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_acessar_corretor(uuid, uuid)
  TO authenticated, service_role;

-- A versão anterior era SECURITY DEFINER e tratava qualquer gestor como
-- global. RLS da tabela não protege funções definer, portanto o gate de origem
-- e destino precisa acontecer dentro da própria operação transacional.
CREATE OR REPLACE FUNCTION public.transferir_leads(_ids uuid[], _corretor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _l record;
  _n integer := 0;
  _ativo boolean;
  _nome text;
BEGIN
  IF _corretor IS NULL THEN
    RAISE EXCEPTION 'corretor destino obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF _caller IS NOT NULL AND (
    NOT public.is_active_member(_caller)
    OR NOT (
      public.has_role(_caller, 'admin')
      OR public.has_role(_caller, 'superintendente')
      OR public.has_role(_caller, 'gestor')
    )
    OR NOT public.pode_atribuir_lead(_caller, _corretor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT
    p.ativo AND p.status_conta = 'ativa'::public.status_conta,
    p.nome
  INTO _ativo, _nome
  FROM public.profiles AS p
  WHERE p.id = _corretor;
  IF _ativo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'corretor destino inexistente ou inativo' USING ERRCODE = '22023';
  END IF;

  FOR _l IN
    SELECT id, corretor_id, corretores_que_tentaram
    FROM public.leads
    WHERE id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
    ORDER BY id
    FOR UPDATE
  LOOP
    IF _caller IS NOT NULL AND NOT public.pode_acessar_lead(_caller, _l.id) THEN
      RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
    END IF;

    UPDATE public.leads
    SET corretor_anterior_id = _l.corretor_id,
        corretor_id = _corretor,
        data_distribuicao = now(),
        timestamp_recebimento = now(),
        tentativas_redistribuicao = 0,
        via_webhook = false,
        corretores_que_tentaram = CASE
          WHEN _corretor = ANY(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
            THEN _l.corretores_que_tentaram
          ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
        END
    WHERE id = _l.id;

    -- Filas operacionais usam o responsável denormalizado. Mantém somente os
    -- itens ainda acionáveis com a nova carteira; histórico concluído permanece
    -- atribuído a quem o executou.
    UPDATE public.agendamentos
    SET corretor_id = _corretor,
        updated_at = now()
    WHERE lead_id = _l.id
      AND status IN (
        'agendado'::public.agendamento_status,
        'confirmado'::public.agendamento_status,
        'remarcado'::public.agendamento_status
      );

    UPDATE public.tarefas
    SET corretor_id = _corretor,
        updated_at = now()
    WHERE lead_id = _l.id
      AND status IN (
        'pendente'::public.tarefa_status,
        'em_andamento'::public.tarefa_status
      );

    INSERT INTO public.distribution_log(
      lead_id, corretor_id, tipo, motivo, distribuido_por_id, regra_aplicada, resultado
    ) VALUES (
      _l.id, _corretor, 'manual', 'Transferência manual', _caller,
      'transferencia_manual', 'sucesso'
    );

    UPDATE public.distribuicao_excecoes
    SET status = 'resolvida',
        resolvida_em = now(),
        resolvida_por = _caller,
        resolucao = 'Transferido manualmente para ' || _nome
    WHERE lead_id = _l.id AND status IN ('pendente', 'em_analise');

    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.transferir_leads(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_leads(uuid[], uuid)
  TO authenticated, service_role;

-- O timer de SLA roda no navegador, mas não pode ser usado como oráculo para
-- redistribuir um lead de outra carteira. Mantém a idempotência do motor e
-- acrescenta o mesmo gate central antes de bloquear/alterar a linha.
CREATE OR REPLACE FUNCTION public.disparar_repasse_sla_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _lead record;
  _res jsonb;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.pode_acessar_lead(_caller, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.via_webhook, l.data_distribuicao,
         l.tentativas_redistribuicao, dc.timeout_minutos
  INTO _lead
  FROM public.leads AS l
  LEFT JOIN public.distribuicao_config AS dc ON dc.origem = l.origem
  WHERE l.id = _lead_id
    AND l.deleted_at IS NULL
    AND l.na_lixeira = false
  FOR UPDATE OF l;

  IF NOT FOUND
     OR _lead.via_webhook IS DISTINCT FROM true
     OR _lead.status <> 'aguardando_atendimento'
     OR _lead.corretor_id IS NULL
     OR _lead.data_distribuicao IS NULL
     OR _lead.timeout_minutos IS NULL
     OR COALESCE(_lead.tentativas_redistribuicao, 0) >= 3
     OR _lead.data_distribuicao >= now() - (_lead.timeout_minutos || ' minutes')::interval THEN
    RETURN false;
  END IF;

  UPDATE public.leads
  SET corretores_que_tentaram = array_append(
    COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id
  )
  WHERE id = _lead_id
    AND NOT (corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])));

  _res := public._distribuir_lead_v3(
    _lead_id,
    'redistribuicao',
    NULL,
    NULL,
    _caller,
    'sla_webhook_imediato',
    jsonb_build_object(
      'sla_minutos', _lead.timeout_minutos,
      'corretor_anterior_sla', _lead.corretor_id
    )
  );

  IF (_res->>'ok')::boolean THEN
    UPDATE public.leads
    SET status = 'aguardando_atendimento',
        tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1
    WHERE id = _lead_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.disparar_repasse_sla_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disparar_repasse_sla_lead(uuid)
  TO authenticated, service_role;

-- Agenda --------------------------------------------------------------------
DROP POLICY IF EXISTS "agendamentos_select_proprios_ou_admin" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_insert_autenticado" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_update_responsavel_ou_admin" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_delete_admin_gestor" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_select_carteira" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_insert_carteira" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_update_carteira" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_delete_carteira" ON public.agendamentos;

CREATE POLICY "agendamentos_select_carteira" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "agendamentos_insert_carteira" ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    criado_por_id = auth.uid()
    AND (
      (
        lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), lead_id)
        AND public.pode_atribuir_lead(auth.uid(), corretor_id)
      )
      OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
    )
  );
CREATE POLICY "agendamentos_update_carteira" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  )
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "agendamentos_delete_carteira" ON public.agendamentos
  FOR DELETE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );

-- Tarefas -------------------------------------------------------------------
DROP POLICY IF EXISTS "Corretores veem suas tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "Corretores criam tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "Corretores atualizam suas tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "Admin/gestor deletam tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_select_carteira" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_insert_carteira" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_update_carteira" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_delete_carteira" ON public.tarefas;

CREATE POLICY "tarefas_select_carteira" ON public.tarefas FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "tarefas_insert_carteira" ON public.tarefas FOR INSERT TO authenticated
  WITH CHECK (
    (criado_por IS NULL OR criado_por = auth.uid())
    AND (
      (
        lead_id IS NOT NULL
        AND public.pode_acessar_lead(auth.uid(), lead_id)
        AND public.pode_atribuir_lead(auth.uid(), corretor_id)
      )
      OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
    )
  );
CREATE POLICY "tarefas_update_carteira" ON public.tarefas FOR UPDATE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  )
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "tarefas_delete_carteira" ON public.tarefas FOR DELETE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );

-- Timeline e histórico ------------------------------------------------------
DROP POLICY IF EXISTS "Admins e gestores veem todas interacoes" ON public.interacoes;
DROP POLICY IF EXISTS "Corretor ve interacoes dos seus leads" ON public.interacoes;
DROP POLICY IF EXISTS "Autenticados criam interacoes em leads visiveis" ON public.interacoes;
DROP POLICY IF EXISTS "Autor edita propria interacao" ON public.interacoes;
DROP POLICY IF EXISTS "Autor ou admin remove interacao" ON public.interacoes;
DROP POLICY IF EXISTS "interacoes_select_carteira" ON public.interacoes;
DROP POLICY IF EXISTS "interacoes_insert_carteira" ON public.interacoes;
DROP POLICY IF EXISTS "interacoes_update_carteira" ON public.interacoes;
DROP POLICY IF EXISTS "interacoes_delete_carteira" ON public.interacoes;

CREATE POLICY "interacoes_select_carteira" ON public.interacoes FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "interacoes_insert_carteira" ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "interacoes_update_carteira" ON public.interacoes FOR UPDATE TO authenticated
  USING (
    public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      autor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  )
  WITH CHECK (
    public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      autor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );
CREATE POLICY "interacoes_delete_carteira" ON public.interacoes FOR DELETE TO authenticated
  USING (
    public.pode_acessar_lead(auth.uid(), lead_id)
    AND (
      autor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );

DROP POLICY IF EXISTS "Admin/gestor veem todas as transicoes"
  ON public.lead_status_transitions;
DROP POLICY IF EXISTS "Corretor ve transicoes dos seus leads"
  ON public.lead_status_transitions;
DROP POLICY IF EXISTS "lead_status_transitions_select_carteira"
  ON public.lead_status_transitions;
CREATE POLICY "lead_status_transitions_select_carteira"
  ON public.lead_status_transitions FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

DROP POLICY IF EXISTS "Admin/gestor veem log completo" ON public.distribution_log;
DROP POLICY IF EXISTS "Corretor vê o próprio log" ON public.distribution_log;
DROP POLICY IF EXISTS "Service e admin/gestor inserem log" ON public.distribution_log;
DROP POLICY IF EXISTS "distribution_log_select_carteira" ON public.distribution_log;
REVOKE INSERT ON public.distribution_log FROM authenticated;
CREATE POLICY "distribution_log_select_carteira" ON public.distribution_log
  FOR SELECT TO authenticated USING (public.pode_acessar_lead(auth.uid(), lead_id));

-- Entidades comerciais ligadas ao lead ------------------------------------
DROP POLICY IF EXISTS "visitas_select" ON public.visitas;
DROP POLICY IF EXISTS "visitas_insert" ON public.visitas;
DROP POLICY IF EXISTS "visitas_update" ON public.visitas;
DROP POLICY IF EXISTS "visitas_select_carteira" ON public.visitas;
DROP POLICY IF EXISTS "visitas_insert_carteira" ON public.visitas;
DROP POLICY IF EXISTS "visitas_update_carteira" ON public.visitas;
CREATE POLICY "visitas_select_carteira" ON public.visitas FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "visitas_insert_carteira" ON public.visitas FOR INSERT TO authenticated
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "visitas_update_carteira" ON public.visitas FOR UPDATE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  )
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );

DROP POLICY IF EXISTS "analises_select" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_insert" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_update" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_select_own_or_gestor" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_insert_auth" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_insert_own_or_gestor" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_update_own_or_gestor" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_delete_gestor" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_select_carteira" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_insert_carteira" ON public.analises_credito;
DROP POLICY IF EXISTS "analises_update_carteira" ON public.analises_credito;
CREATE POLICY "analises_select_carteira" ON public.analises_credito FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "analises_insert_carteira" ON public.analises_credito FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "analises_update_carteira" ON public.analises_credito FOR UPDATE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id))
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));

DROP POLICY IF EXISTS "propostas_select" ON public.propostas;
DROP POLICY IF EXISTS "propostas_insert" ON public.propostas;
DROP POLICY IF EXISTS "propostas_update" ON public.propostas;
DROP POLICY IF EXISTS "propostas_select_carteira" ON public.propostas;
DROP POLICY IF EXISTS "propostas_insert_carteira" ON public.propostas;
DROP POLICY IF EXISTS "propostas_update_carteira" ON public.propostas;
CREATE POLICY "propostas_select_carteira" ON public.propostas FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "propostas_insert_carteira" ON public.propostas FOR INSERT TO authenticated
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );
CREATE POLICY "propostas_update_carteira" ON public.propostas FOR UPDATE TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id))
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  )
  WITH CHECK (
    (
      lead_id IS NOT NULL
      AND public.pode_acessar_lead(auth.uid(), lead_id)
      AND public.pode_atribuir_lead(auth.uid(), corretor_id)
    )
    OR (lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id))
  );

DROP POLICY IF EXISTS "propvis_select" ON public.propostas_visitantes;
DROP POLICY IF EXISTS "propvis_insert" ON public.propostas_visitantes;
DROP POLICY IF EXISTS "propvis_select_carteira" ON public.propostas_visitantes;
DROP POLICY IF EXISTS "propvis_insert_carteira" ON public.propostas_visitantes;
CREATE POLICY "propvis_select_carteira" ON public.propostas_visitantes
  FOR SELECT TO authenticated
  USING (public.pode_acessar_corretor(auth.uid(), corretor_id));
CREATE POLICY "propvis_insert_carteira" ON public.propostas_visitantes
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_corretor(auth.uid(), COALESCE(corretor_id, auth.uid())));

-- Oferta ativa e logs do copiloto ------------------------------------------
DROP POLICY IF EXISTS "oal_select" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_insert" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_update" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_delete" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_select_carteira" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_insert_carteira" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_update_carteira" ON public.oferta_ativa_leads;
DROP POLICY IF EXISTS "oal_delete_carteira" ON public.oferta_ativa_leads;
CREATE POLICY "oal_select_carteira" ON public.oferta_ativa_leads FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "oal_insert_carteira" ON public.oferta_ativa_leads FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "oal_update_carteira" ON public.oferta_ativa_leads FOR UPDATE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id))
  WITH CHECK (public.pode_acessar_lead(auth.uid(), lead_id));
CREATE POLICY "oal_delete_carteira" ON public.oferta_ativa_leads FOR DELETE TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

DROP POLICY IF EXISTS "copiloto_eventos_admin_read" ON public.copiloto_eventos;
DROP POLICY IF EXISTS "copiloto_eventos_select_carteira" ON public.copiloto_eventos;
CREATE POLICY "copiloto_eventos_select_carteira" ON public.copiloto_eventos
  FOR SELECT TO authenticated
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

-- Buscas/duplicatas SECURITY DEFINER também respeitam a carteira ------------
CREATE OR REPLACE FUNCTION public.detectar_duplicatas_leads()
RETURNS TABLE (grupo_chave text, tipo text, quantidade bigint, lead_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH acessiveis AS (
    SELECT l.*
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND public.pode_acessar_lead(auth.uid(), l.id)
  )
  SELECT regexp_replace(telefone, '\D', '', 'g'), 'telefone'::text,
         count(*), array_agg(id ORDER BY created_at)
  FROM acessiveis
  WHERE telefone IS NOT NULL AND telefone <> ''
  GROUP BY regexp_replace(telefone, '\D', '', 'g')
  HAVING count(*) > 1
  UNION ALL
  SELECT lower(trim(email)), 'email'::text,
         count(*), array_agg(id ORDER BY created_at)
  FROM acessiveis
  WHERE email IS NOT NULL AND email <> ''
  GROUP BY lower(trim(email))
  HAVING count(*) > 1;
$$;
REVOKE ALL ON FUNCTION public.detectar_duplicatas_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detectar_duplicatas_leads() TO authenticated;

CREATE OR REPLACE FUNCTION public.mesclar_leads(_lead_destino uuid, _lead_origem uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL
     OR NOT (
       public.has_role(_caller, 'admin')
       OR public.has_role(_caller, 'superintendente')
       OR public.has_role(_caller, 'gestor')
     )
     OR NOT public.pode_acessar_lead(_caller, _lead_destino)
     OR NOT public.pode_acessar_lead(_caller, _lead_origem) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _lead_destino = _lead_origem THEN
    RAISE EXCEPTION 'destino e origem iguais' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.leads
  WHERE id IN (_lead_destino, _lead_origem)
  ORDER BY id FOR UPDATE;
  UPDATE public.interacoes SET lead_id = _lead_destino WHERE lead_id = _lead_origem;
  UPDATE public.tarefas SET lead_id = _lead_destino WHERE lead_id = _lead_origem;
  UPDATE public.agendamentos SET lead_id = _lead_destino WHERE lead_id = _lead_origem;
  UPDATE public.leads
  SET deleted_at = now(),
      observacoes = COALESCE(observacoes, '') || E'\n[Mesclado no lead '
        || _lead_destino::text || ']'
  WHERE id = _lead_origem;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mesclar_leads(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesclar_leads(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) TO service_role;

-- Mantém a redistribuição especializada de perda, mas impede que o RPC legado
-- aceite um gestor de outra equipe. O wrapper faz o mesmo gate central antes
-- de entrar no motor transacional existente.
REVOKE EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text)
  TO service_role;
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido_v2(
  _lead_id uuid,
  _categoria text,
  _detalhe text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.pode_acessar_lead(auth.uid(), _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(_categoria), '') IS NULL THEN
    RAISE EXCEPTION 'motivo de perda obrigatorio' USING ERRCODE = '22023';
  END IF;
  RETURN public.marcar_lead_perdido(_lead_id, _categoria, _detalhe);
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_lead_perdido_v2(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido_v2(uuid, text, text)
  TO authenticated;

-- A função interna de oferta nunca deve ser chamável como API e filtra o
-- chamador mesmo quando executada dentro de outra SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public._oferta_ativa_query(_filtros jsonb, _corretor uuid)
RETURNS SETOF public.leads
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _statuses text[];
  _temps text[];
  _projetos uuid[];
  _origens text[];
  _sem_dias integer;
BEGIN
  _statuses := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'status','[]')));
  _temps := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'temperatura','[]')));
  _projetos := ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(_filtros->'projetoId','[]'))::uuid
  );
  _origens := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'origem','[]')));
  _sem_dias := NULLIF(_filtros->>'semInteracaoHaDias','')::integer;

  RETURN QUERY
  SELECT l.* FROM public.leads AS l
  WHERE public.pode_acessar_lead(auth.uid(), l.id)
    AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_corretor IS NULL OR l.corretor_id = _corretor)
    AND (cardinality(_statuses) = 0 OR l.status::text = ANY(_statuses))
    AND (cardinality(_temps) = 0 OR l.temperatura::text = ANY(_temps))
    AND (cardinality(_projetos) = 0 OR l.projeto_id = ANY(_projetos))
    AND (cardinality(_origens) = 0 OR l.origem::text = ANY(_origens))
    AND (
      _sem_dias IS NULL OR l.ultima_interacao IS NULL
      OR l.ultima_interacao < now() - make_interval(days => _sem_dias)
    );
END;
$$;
REVOKE ALL ON FUNCTION public._oferta_ativa_query(jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oferta_ativa_query(jsonb, uuid) TO service_role;

-- ============================================================================
-- [7/18] 20260711124000_scale_read_models_v2.sql
-- ============================================================================

-- Read models paginados para leads, pipeline e indicadores.
--
-- Todos os contratos deste arquivo sao aditivos, usam cursor keyset (sem
-- OFFSET) e falham fechados para contas pendentes/bloqueadas. As funcoes sao
-- SECURITY DEFINER somente para conseguirem aplicar o mesmo escopo central de
-- carteira sem depender de policies antigas; nenhuma delas ignora
-- pode_acessar_lead().

-- O indice parcial atende tanto a primeira pagina de uma etapa quanto as
-- paginas seguintes ordenadas por (created_at, id). O segundo indice evita que
-- filtros por corretor degenerem em varredura do pipeline inteiro.
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage_cursor_v2
  ON public.leads (status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND na_lixeira = false;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_owner_stage_cursor_v2
  ON public.leads (corretor_id, status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND na_lixeira = false;

CREATE INDEX IF NOT EXISTS idx_leads_followup_open_v2
  ON public.leads (corretor_id, proximo_followup)
  WHERE deleted_at IS NULL
    AND na_lixeira = false
    AND proximo_followup IS NOT NULL
    AND status NOT IN ('contrato_fechado', 'pos_venda', 'perdido');

-- ---------------------------------------------------------------------------
-- 1) Busca global de leads: no maximo 50 itens, relevancia deterministica e
--    cursor (score, created_at, id). O cursor e opaco para a UI, mas continua
--    legivel/auditavel em JSON.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_search_v2(
  _query text DEFAULT NULL,
  _status public.lead_status DEFAULT NULL,
  _origem public.lead_origem DEFAULT NULL,
  _temperatura public.lead_temperatura DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _somente_sem_corretor boolean DEFAULT false,
  _na_lixeira boolean DEFAULT false,
  _periodo_inicio timestamptz DEFAULT NULL,
  _periodo_fim timestamptz DEFAULT NULL,
  _cursor jsonb DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _q text;
  _q_digits text;
  _q_pattern text;
  _q_digits_pattern text;
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
  _cursor_score integer;
  _cursor_created_at timestamptz;
  _cursor_id uuid;
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF _periodo_inicio IS NOT NULL
     AND _periodo_fim IS NOT NULL
     AND _periodo_inicio >= _periodo_fim THEN
    RAISE EXCEPTION 'periodo_inicio deve ser anterior a periodo_fim'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(COALESCE(_query, '')) > 200 THEN
    RAISE EXCEPTION 'busca excede 200 caracteres' USING ERRCODE = '22023';
  END IF;

  _q := lower(public.immutable_unaccent(btrim(COALESCE(_query, ''))));
  _q_digits := regexp_replace(COALESCE(_query, ''), '\D', '', 'g');
  _q_pattern := '%' || replace(
    replace(replace(_q, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';
  _q_digits_pattern := '%' || _q_digits || '%';

  IF _cursor IS NOT NULL THEN
    IF jsonb_typeof(_cursor) <> 'object'
       OR NOT (_cursor ? 'score')
       OR NOT (_cursor ? 'created_at')
       OR NOT (_cursor ? 'id') THEN
      RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END IF;

    BEGIN
      _cursor_score := (_cursor ->> 'score')::integer;
      _cursor_created_at := (_cursor ->> 'created_at')::timestamptz;
      _cursor_id := (_cursor ->> 'id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END;

    IF _cursor_score IS NULL OR _cursor_created_at IS NULL OR _cursor_id IS NULL THEN
      RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  WITH scored AS (
    SELECT
      l.id,
      l.nome,
      l.email,
      l.telefone,
      l.status,
      l.origem,
      l.temperatura,
      l.corretor_id,
      l.projeto_id,
      l.projeto_nome,
      l.proxima_acao,
      l.proximo_followup,
      l.ultima_interacao,
      l.created_at,
      l.updated_at,
      CASE
        WHEN _q = '' THEN 0
        WHEN lower(public.immutable_unaccent(l.nome)) = _q THEN 1000
        WHEN _q_digits <> ''
          AND regexp_replace(l.telefone, '\D', '', 'g') = _q_digits THEN 950
        WHEN strpos(lower(public.immutable_unaccent(l.nome)), _q) = 1 THEN 800
        WHEN strpos(l.search_text, _q) > 0 THEN 600
        WHEN _q_digits <> ''
          AND strpos(regexp_replace(l.telefone, '\D', '', 'g'), _q_digits) > 0 THEN 500
        ELSE 0
      END::integer AS relevance_score
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = COALESCE(_na_lixeira, false)
      AND (_status IS NULL OR l.status = _status)
      AND (_origem IS NULL OR l.origem = _origem)
      AND (_temperatura IS NULL OR l.temperatura = _temperatura)
      AND (_corretor_id IS NULL OR l.corretor_id = _corretor_id)
      AND (NOT COALESCE(_somente_sem_corretor, false) OR l.corretor_id IS NULL)
      AND (_projeto_id IS NULL OR l.projeto_id = _projeto_id)
      AND (_periodo_inicio IS NULL OR l.created_at >= _periodo_inicio)
      AND (_periodo_fim IS NULL OR l.created_at < _periodo_fim)
      AND (
        _q = ''
        OR l.search_text LIKE _q_pattern ESCAPE E'\\'
        OR (
          _q_digits <> ''
          AND l.search_text LIKE _q_digits_pattern
        )
      )
      AND public.pode_acessar_lead(_caller, l.id)
  ), after_cursor AS (
    SELECT s.*
    FROM scored AS s
    WHERE _cursor IS NULL
       OR (s.relevance_score, s.created_at, s.id)
          < (_cursor_score, _cursor_created_at, _cursor_id)
  ), page AS (
    SELECT a.*
    FROM after_cursor AS a
    ORDER BY a.relevance_score DESC, a.created_at DESC, a.id DESC
    LIMIT (_take + 1)
  ), visible AS (
    SELECT p.*
    FROM page AS p
    ORDER BY p.relevance_score DESC, p.created_at DESC, p.id DESC
    LIMIT _take
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'nome', v.nome,
            'email', v.email,
            'telefone', v.telefone,
            'status', v.status,
            'origem', v.origem,
            'temperatura', v.temperatura,
            'corretor_id', v.corretor_id,
            'projeto_id', v.projeto_id,
            'projeto_nome', v.projeto_nome,
            'proxima_acao', v.proxima_acao,
            'proximo_followup', v.proximo_followup,
            'ultima_interacao', v.ultima_interacao,
            'created_at', v.created_at,
            'updated_at', v.updated_at,
            'score', v.relevance_score
          )
          ORDER BY v.relevance_score DESC, v.created_at DESC, v.id DESC
        )
        FROM visible AS v
      ),
      '[]'::jsonb
    ),
    'has_more', (SELECT count(*) > _take FROM page),
    'next_cursor', CASE
      WHEN (SELECT count(*) > _take FROM page) THEN (
        SELECT jsonb_build_object(
          'score', v.relevance_score,
          'created_at', v.created_at,
          'id', v.id
        )
        FROM visible AS v
        ORDER BY v.relevance_score ASC, v.created_at ASC, v.id ASC
        LIMIT 1
      )
      ELSE NULL
    END,
    'limit', _take,
    'score_semantics', 'search_relevance'
  )
  INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_search_v2(
  text, public.lead_status, public.lead_origem, public.lead_temperatura,
  uuid, uuid, boolean, boolean, timestamptz, timestamptz, jsonb, integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.leads_search_v2(
  text, public.lead_status, public.lead_origem, public.lead_temperatura,
  uuid, uuid, boolean, boolean, timestamptz, timestamptz, jsonb, integer
) TO authenticated;

COMMENT ON FUNCTION public.leads_search_v2(
  text, public.lead_status, public.lead_origem, public.lead_temperatura,
  uuid, uuid, boolean, boolean, timestamptz, timestamptz, jsonb, integer
) IS 'Busca autorizada de leads com cursor keyset (score, created_at, id) e pagina maxima de 50; score e relevancia de busca, nao probabilidade de conversao.';

-- ---------------------------------------------------------------------------
-- 2) Snapshot compacto do pipeline. Retorna sempre uma linha por valor do enum,
--    inclusive etapas vazias, sem transferir os leads para o navegador.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pipeline_snapshot_v2(
  _query text DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL
)
RETURNS TABLE(
  etapa public.lead_status,
  quantidade bigint,
  followups_vencidos bigint,
  sem_proxima_acao bigint,
  parados_ha_7_dias bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _q text := lower(public.immutable_unaccent(btrim(COALESCE(_query, ''))));
  _q_pattern text;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF char_length(COALESCE(_query, '')) > 200 THEN
    RAISE EXCEPTION 'busca excede 200 caracteres' USING ERRCODE = '22023';
  END IF;

  _q_pattern := '%' || replace(
    replace(replace(_q, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';

  RETURN QUERY
  WITH etapas AS (
    SELECT unnest(enum_range(NULL::public.lead_status)) AS etapa
  ), base AS (
    SELECT
      l.status,
      l.proximo_followup,
      l.proxima_acao,
      l.ultima_interacao,
      l.created_at
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND (_corretor_id IS NULL OR l.corretor_id = _corretor_id)
      AND (_projeto_id IS NULL OR l.projeto_id = _projeto_id)
      AND (_q = '' OR l.search_text LIKE _q_pattern ESCAPE E'\\')
      AND public.pode_acessar_lead(_caller, l.id)
  ), agregado AS (
    SELECT
      b.status AS etapa,
      count(*)::bigint AS quantidade,
      count(*) FILTER (
        WHERE b.proximo_followup IS NOT NULL
          AND b.proximo_followup < now()
          AND b.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
      )::bigint AS followups_vencidos,
      count(*) FILTER (
        WHERE NULLIF(btrim(b.proxima_acao), '') IS NULL
          AND b.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
      )::bigint AS sem_proxima_acao,
      count(*) FILTER (
        WHERE COALESCE(b.ultima_interacao, b.created_at) < now() - interval '7 days'
          AND b.status NOT IN ('novo', 'contrato_fechado', 'pos_venda', 'perdido')
      )::bigint AS parados_ha_7_dias
    FROM base AS b
    GROUP BY b.status
  )
  SELECT
    e.etapa,
    COALESCE(a.quantidade, 0::bigint),
    COALESCE(a.followups_vencidos, 0::bigint),
    COALESCE(a.sem_proxima_acao, 0::bigint),
    COALESCE(a.parados_ha_7_dias, 0::bigint)
  FROM etapas AS e
  LEFT JOIN agregado AS a ON a.etapa = e.etapa
  ORDER BY e.etapa;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_snapshot_v2(text, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.pipeline_snapshot_v2(text, uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Cards de uma etapa: no maximo 20 itens por chamada e cursor estavel
--    (created_at, id). A primeira chamada usa cursor NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pipeline_stage_page_v2(
  _status public.lead_status,
  _query text DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _cursor jsonb DEFAULT NULL,
  _limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _q text := lower(public.immutable_unaccent(btrim(COALESCE(_query, ''))));
  _q_pattern text;
  _take integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 20);
  _cursor_created_at timestamptz;
  _cursor_id uuid;
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'status obrigatorio' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(_query, '')) > 200 THEN
    RAISE EXCEPTION 'busca excede 200 caracteres' USING ERRCODE = '22023';
  END IF;

  _q_pattern := '%' || replace(
    replace(replace(_q, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';

  IF _cursor IS NOT NULL THEN
    IF jsonb_typeof(_cursor) <> 'object'
       OR NOT (_cursor ? 'created_at')
       OR NOT (_cursor ? 'id') THEN
      RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END IF;

    BEGIN
      _cursor_created_at := (_cursor ->> 'created_at')::timestamptz;
      _cursor_id := (_cursor ->> 'id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END;

    IF _cursor_created_at IS NULL OR _cursor_id IS NULL THEN
      RAISE EXCEPTION 'cursor invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  WITH page AS (
    SELECT
      l.id,
      l.nome,
      l.email,
      l.telefone,
      l.status,
      l.origem,
      l.temperatura,
      l.corretor_id,
      l.projeto_id,
      l.projeto_nome,
      l.observacoes,
      l.proxima_acao,
      l.proximo_followup,
      l.ultima_interacao,
      l.data_distribuicao,
      l.tentativas_redistribuicao,
      l.via_webhook,
      l.created_at
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status = _status
      AND (_corretor_id IS NULL OR l.corretor_id = _corretor_id)
      AND (_projeto_id IS NULL OR l.projeto_id = _projeto_id)
      AND (_q = '' OR l.search_text LIKE _q_pattern ESCAPE E'\\')
      AND (
        _cursor IS NULL
        OR (l.created_at, l.id) < (_cursor_created_at, _cursor_id)
      )
      AND public.pode_acessar_lead(_caller, l.id)
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT (_take + 1)
  ), visible AS (
    SELECT p.*
    FROM page AS p
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT _take
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC, v.id DESC)
        FROM visible AS v
      ),
      '[]'::jsonb
    ),
    'has_more', (SELECT count(*) > _take FROM page),
    'next_cursor', CASE
      WHEN (SELECT count(*) > _take FROM page) THEN (
        SELECT jsonb_build_object('created_at', v.created_at, 'id', v.id)
        FROM visible AS v
        ORDER BY v.created_at ASC, v.id ASC
        LIMIT 1
      )
      ELSE NULL
    END,
    'limit', _take,
    'status', _status
  )
  INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_stage_page_v2(
  public.lead_status, text, uuid, uuid, jsonb, integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.pipeline_stage_page_v2(
  public.lead_status, text, uuid, uuid, jsonb, integer
) TO authenticated;

COMMENT ON FUNCTION public.pipeline_stage_page_v2(
  public.lead_status, text, uuid, uuid, jsonb, integer
) IS 'Pagina de ate 20 cards de uma etapa, ordenada por (created_at, id) e restrita a carteira autorizada.';

-- ---------------------------------------------------------------------------
-- 4) Ranking compacto. A fonte e atividades_diarias: a migration de aprovacao
--    de vendas deve manter esse ledger somente a partir de vendas aprovadas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ranking_periodo_v2(
  _inicio date,
  _fim date,
  _limit integer DEFAULT 50
)
RETURNS TABLE(
  posicao bigint,
  corretor_id uuid,
  nome text,
  pontuacao bigint,
  ligacoes bigint,
  whatsapps bigint,
  agendamentos bigint,
  visitas bigint,
  documentacoes bigint,
  vendas bigint,
  vgv numeric,
  leads bigint,
  alteracoes bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _inicio > _fim THEN
    RAISE EXCEPTION 'periodo invalido' USING ERRCODE = '22023';
  END IF;
  IF (_fim - _inicio) > 730 THEN
    RAISE EXCEPTION 'periodo excede 731 dias' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH escopo AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.status_conta = 'ativa'::public.status_conta
      AND EXISTS (
        SELECT 1
        FROM public.user_roles AS papel
        WHERE papel.user_id = p.id
          AND papel.role = 'corretor'::public.app_role
      )
      AND (
        p.id = _caller
        OR public.has_role(_caller, 'admin'::public.app_role)
        OR public.has_role(_caller, 'superintendente'::public.app_role)
        OR (
          public.has_role(_caller, 'gestor'::public.app_role)
          AND (
            EXISTS (
              SELECT 1
              FROM public.profiles AS gestor
              WHERE gestor.id = _caller
                AND gestor.equipe_id IS NOT NULL
                AND gestor.equipe_id = p.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipes AS e
              WHERE e.gestor_id = _caller
                AND e.id = p.equipe_id
            )
          )
        )
      )
  ), leads_agregado AS (
    SELECT l.corretor_id, count(*)::bigint AS leads
    FROM public.leads AS l
    WHERE l.created_at >= (_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND l.created_at < ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND public.pode_acessar_lead(_caller, l.id)
    GROUP BY l.corretor_id
  ), transicoes_agregado AS (
    SELECT t.corretor_id, count(*)::bigint AS alteracoes
    FROM public.lead_status_transitions AS t
    WHERE t.created_at >= (_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND t.created_at < ((_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND public.pode_acessar_lead(_caller, t.lead_id)
    GROUP BY t.corretor_id
  ), agregado AS (
    SELECT
      e.id AS corretor_id,
      e.nome,
      COALESCE(sum(a.pontuacao_total), 0)::bigint AS pontuacao,
      COALESCE(sum(a.ligacoes), 0)::bigint AS ligacoes,
      COALESCE(sum(a.whatsapps), 0)::bigint AS whatsapps,
      COALESCE(sum(a.agendamentos), 0)::bigint AS agendamentos,
      COALESCE(sum(a.visitas), 0)::bigint AS visitas,
      COALESCE(sum(a.documentacoes), 0)::bigint AS documentacoes,
      COALESCE(sum(a.vendas), 0)::bigint AS vendas,
      COALESCE(sum(a.vgv_dia), 0)::numeric AS vgv,
      COALESCE(max(la.leads), 0)::bigint AS leads,
      COALESCE(max(ta.alteracoes), 0)::bigint AS alteracoes
    FROM escopo AS e
    LEFT JOIN public.atividades_diarias AS a
      ON a.corretor_id = e.id
     AND a.dia BETWEEN _inicio AND _fim
    LEFT JOIN leads_agregado AS la ON la.corretor_id = e.id
    LEFT JOIN transicoes_agregado AS ta ON ta.corretor_id = e.id
    GROUP BY e.id, e.nome
  ), ranqueado AS (
    SELECT
      dense_rank() OVER (
        ORDER BY a.pontuacao DESC, a.vendas DESC, a.vgv DESC
      ) AS posicao,
      a.*
    FROM agregado AS a
  )
  SELECT
    r.posicao,
    r.corretor_id,
    r.nome,
    r.pontuacao,
    r.ligacoes,
    r.whatsapps,
    r.agendamentos,
    r.visitas,
    r.documentacoes,
    r.vendas,
    r.vgv,
    r.leads,
    r.alteracoes
  FROM ranqueado AS r
  ORDER BY r.posicao, r.corretor_id
  LIMIT _take;
END;
$$;

REVOKE ALL ON FUNCTION public.ranking_periodo_v2(date, date, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ranking_periodo_v2(date, date, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Metricas compactas do periodo, sem materializar eventos no cliente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.metricas_periodo_v2(
  _inicio date,
  _fim date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _inicio_ts timestamptz;
  _fim_exclusive timestamptz;
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _inicio > _fim THEN
    RAISE EXCEPTION 'periodo invalido' USING ERRCODE = '22023';
  END IF;
  IF (_fim - _inicio) > 730 THEN
    RAISE EXCEPTION 'periodo excede 731 dias' USING ERRCODE = '22023';
  END IF;

  _inicio_ts := _inicio::timestamp AT TIME ZONE 'America/Sao_Paulo';
  _fim_exclusive := (_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  WITH escopo_corretores AS (
    SELECT p.id
    FROM public.profiles AS p
    WHERE p.status_conta = 'ativa'::public.status_conta
      AND (
        p.id = _caller
        OR public.has_role(_caller, 'admin'::public.app_role)
        OR public.has_role(_caller, 'superintendente'::public.app_role)
        OR (
          public.has_role(_caller, 'gestor'::public.app_role)
          AND (
            EXISTS (
              SELECT 1
              FROM public.profiles AS gestor
              WHERE gestor.id = _caller
                AND gestor.equipe_id IS NOT NULL
                AND gestor.equipe_id = p.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipes AS e
              WHERE e.gestor_id = _caller
                AND e.id = p.equipe_id
            )
          )
        )
      )
  ), leads_periodo AS (
    SELECT
      l.id,
      l.status,
      l.proxima_acao,
      l.proximo_followup
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.created_at >= _inicio_ts
      AND l.created_at < _fim_exclusive
      AND public.pode_acessar_lead(_caller, l.id)
  ), totais_leads AS (
    SELECT
      count(*)::bigint AS recebidos,
      count(*) FILTER (WHERE status = 'contrato_fechado')::bigint AS fechados,
      count(*) FILTER (WHERE status = 'perdido')::bigint AS perdidos,
      count(*) FILTER (
        WHERE status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
          AND NULLIF(btrim(proxima_acao), '') IS NULL
      )::bigint AS sem_proxima_acao,
      count(*) FILTER (
        WHERE status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
          AND proximo_followup IS NOT NULL
          AND proximo_followup < now()
      )::bigint AS followups_vencidos
    FROM leads_periodo
  ), totais_atividades AS (
    SELECT
      COALESCE(sum(a.ligacoes), 0)::bigint AS ligacoes,
      COALESCE(sum(a.whatsapps), 0)::bigint AS whatsapps,
      COALESCE(sum(a.agendamentos), 0)::bigint AS agendamentos,
      COALESCE(sum(a.visitas), 0)::bigint AS visitas,
      COALESCE(sum(a.documentacoes), 0)::bigint AS documentacoes,
      COALESCE(sum(a.vendas), 0)::bigint AS vendas,
      COALESCE(sum(a.vgv_dia), 0)::numeric AS vgv,
      COALESCE(sum(a.pontuacao_total), 0)::bigint AS pontuacao
    FROM public.atividades_diarias AS a
    WHERE a.dia BETWEEN _inicio AND _fim
      AND EXISTS (
        SELECT 1 FROM escopo_corretores AS e WHERE e.id = a.corretor_id
      )
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('inicio', _inicio, 'fim', _fim),
    'leads_recebidos', l.recebidos,
    'fechados', l.fechados,
    'perdidos', l.perdidos,
    'sem_proxima_acao', l.sem_proxima_acao,
    'followups_vencidos', l.followups_vencidos,
    'ligacoes', a.ligacoes,
    'whatsapps', a.whatsapps,
    'agendamentos', a.agendamentos,
    'visitas', a.visitas,
    'documentacoes', a.documentacoes,
    'vendas', a.vendas,
    'vgv', a.vgv,
    'pontuacao', a.pontuacao,
    'conversao_percentual', CASE
      WHEN l.recebidos = 0 THEN 0::numeric
      ELSE round((a.vendas::numeric / l.recebidos::numeric) * 100, 1)
    END
  )
  INTO _result
  FROM totais_leads AS l
  CROSS JOIN totais_atividades AS a;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.metricas_periodo_v2(date, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.metricas_periodo_v2(date, date)
  TO authenticated;

-- ============================================================================
-- [8/18] 20260711125000_api_clientes.sql
-- ============================================================================

-- Clientes externos da API publica: credenciais individuais, escopos e restricoes.
-- O segredo em texto puro nunca entra no banco; somente SHA-256 hexadecimal.

DO $$
BEGIN
  CREATE TYPE public.api_cliente_escopo AS ENUM (
    'leads:read',
    'leads:write',
    'events:write',
    'sales:read',
    'commissions:read',
    'metrics:read'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.api_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 120),
  -- lowercase hex(sha256(secret)); nunca armazene o segredo original.
  segredo_hash text NOT NULL UNIQUE
    CHECK (segredo_hash ~ '^[0-9a-f]{64}$'),
  -- Identificador operacional nao secreto (ex.: ultimos 8 chars do hash).
  segredo_prefixo text NOT NULL CHECK (length(segredo_prefixo) BETWEEN 4 AND 24),
  ativo boolean NOT NULL DEFAULT true,
  valido_de timestamptz NOT NULL DEFAULT now(),
  valido_ate timestamptz,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo_revogacao text,
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE RESTRICT,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE RESTRICT,
  rotacionado_de_id uuid REFERENCES public.api_clientes(id) ON DELETE SET NULL,
  substituido_por_id uuid REFERENCES public.api_clientes(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_clientes_validade_check
    CHECK (valido_ate IS NULL OR valido_ate > valido_de),
  CONSTRAINT api_clientes_revogacao_check
    CHECK (revogado_em IS NULL OR ativo = false)
);

CREATE TABLE IF NOT EXISTS public.api_cliente_escopos (
  cliente_id uuid NOT NULL REFERENCES public.api_clientes(id) ON DELETE CASCADE,
  escopo public.api_cliente_escopo NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (cliente_id, escopo)
);

CREATE TABLE IF NOT EXISTS public.api_cliente_auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id uuid REFERENCES public.api_clientes(id) ON DELETE SET NULL,
  escopo public.api_cliente_escopo,
  metodo text NOT NULL CHECK (length(metodo) BETWEEN 1 AND 12),
  rota text NOT NULL CHECK (length(rota) BETWEEN 1 AND 500),
  resultado text NOT NULL CHECK (resultado IN ('autorizado', 'negado', 'erro')),
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  -- Hash SHA-256 do IP, sem armazenar o endereco em claro.
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  request_id text CHECK (request_id IS NULL OR length(request_id) <= 128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_clientes_ativos_idx
  ON public.api_clientes (ativo, valido_ate)
  WHERE revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS api_clientes_equipe_idx
  ON public.api_clientes (equipe_id)
  WHERE ativo AND revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS api_clientes_projeto_idx
  ON public.api_clientes (projeto_id)
  WHERE ativo AND revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS api_cliente_auditoria_cliente_created_idx
  ON public.api_cliente_auditoria (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_cliente_auditoria_created_idx
  ON public.api_cliente_auditoria (created_at DESC);

DROP TRIGGER IF EXISTS trg_api_clientes_updated ON public.api_clientes;
CREATE TRIGGER trg_api_clientes_updated
  BEFORE UPDATE ON public.api_clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.api_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_clientes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_cliente_escopos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_cliente_escopos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_cliente_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_cliente_auditoria FORCE ROW LEVEL SECURITY;

-- Nenhuma policy para anon/authenticated: credenciais e auditoria sao server-only.
REVOKE ALL ON public.api_clientes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_cliente_escopos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_cliente_auditoria FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.api_cliente_auditoria_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_clientes TO service_role;
GRANT ALL ON public.api_cliente_escopos TO service_role;
GRANT ALL ON public.api_cliente_auditoria TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.api_cliente_auditoria_id_seq TO service_role;

COMMENT ON TABLE public.api_clientes IS
  'Credenciais de integracoes externas. segredo_hash e SHA-256; segredo em claro e proibido.';
COMMENT ON COLUMN public.api_clientes.segredo_hash IS
  'SHA-256 hexadecimal lowercase do X-API-Key; nunca registrar ou retornar o segredo.';
COMMENT ON TABLE public.api_cliente_auditoria IS
  'Trilha de autenticacao da API sem payload e sem PII em claro.';

-- ============================================================================
-- [9/18] 20260711126000_landing_webhook_hardening.sql
-- ============================================================================

-- Hardening do webhook publico da landing.
--
-- O navegador envia somente o token publico do Turnstile e uma
-- Idempotency-Key aleatoria. Segredos, IPs crus e respostas com PII nunca sao
-- persistidos nestas estruturas. Todas as funcoes abaixo sao exclusivas do
-- service_role usado pela rota server-side.

-- A hash da idempotency key fica permanentemente no staging para impedir duas
-- linhas de lead mesmo se o registro temporario de replay ja tiver expirado.
ALTER TABLE public.leads_landing
  ADD COLUMN IF NOT EXISTS idempotency_key_hash text,
  ADD COLUMN IF NOT EXISTS idempotency_request_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_landing_idempotency_hash_format'
      AND conrelid = 'public.leads_landing'::regclass
  ) THEN
    ALTER TABLE public.leads_landing
      ADD CONSTRAINT leads_landing_idempotency_hash_format CHECK (
        (idempotency_key_hash IS NULL AND idempotency_request_hash IS NULL)
        OR (
          idempotency_key_hash ~ '^[0-9a-f]{64}$'
          AND idempotency_request_hash ~ '^[0-9a-f]{64}$'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_landing_idempotency_key_hash
  ON public.leads_landing (idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.landing_webhook_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  request_count integer NOT NULL CHECK (request_count > 0),
  window_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT landing_webhook_rate_window_valid
    CHECK (expires_at > window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_landing_webhook_rate_limits_expiry
  ON public.landing_webhook_rate_limits (expires_at);

CREATE TABLE IF NOT EXISTS public.landing_webhook_idempotency (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing', 'completed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  response_status smallint,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT landing_webhook_idempotency_state_valid CHECK (
    (
      state = 'processing'
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND response_status IS NULL
      AND response_body IS NULL
    )
    OR (
      state = 'completed'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND response_status IS NOT NULL
      AND response_status BETWEEN 200 AND 599
      AND response_body IS NOT NULL
      AND jsonb_typeof(response_body) = 'object'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_landing_webhook_idempotency_expiry
  ON public.landing_webhook_idempotency (expires_at);

ALTER TABLE public.landing_webhook_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_webhook_idempotency ENABLE ROW LEVEL SECURITY;

-- O navegador só precisa marcar o status operacional do staging. Sem este
-- recorte, o GRANT UPDATE histórico também permitiria adulterar hashes de
-- idempotência; DELETE removeria a chave permanente e reabriria requisições
-- já processadas.
REVOKE INSERT, UPDATE, DELETE ON public.leads_landing FROM authenticated;
GRANT UPDATE (status) ON public.leads_landing TO authenticated;

REVOKE ALL ON public.landing_webhook_rate_limits
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.landing_webhook_idempotency
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_webhook_rate_limits
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_webhook_idempotency
  TO service_role;

-- Janela fixa iniciada na primeira requisicao. O UPSERT serializa duas
-- requisicoes simultaneas para a mesma hash e devolve a contagem ja consumida.
CREATE OR REPLACE FUNCTION public.consume_landing_webhook_rate_limit(
  _key_hash text,
  _max_requests integer,
  _window_seconds integer
)
RETURNS TABLE(
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _now timestamptz := clock_timestamp();
  _row public.landing_webhook_rate_limits%ROWTYPE;
BEGIN
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'key_hash invalida' USING ERRCODE = '22023';
  END IF;
  IF _max_requests IS NULL OR _max_requests < 1 OR _max_requests > 1000 THEN
    RAISE EXCEPTION 'max_requests invalido' USING ERRCODE = '22023';
  END IF;
  IF _window_seconds IS NULL OR _window_seconds < 1 OR _window_seconds > 3600 THEN
    RAISE EXCEPTION 'window_seconds invalido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.landing_webhook_rate_limits AS current_window (
    key_hash,
    request_count,
    window_started_at,
    expires_at
  )
  VALUES (
    _key_hash,
    1,
    _now,
    _now + make_interval(secs => _window_seconds)
  )
  ON CONFLICT (key_hash) DO UPDATE
  SET request_count = CASE
        WHEN current_window.expires_at <= _now THEN 1
        ELSE current_window.request_count + 1
      END,
      window_started_at = CASE
        WHEN current_window.expires_at <= _now THEN _now
        ELSE current_window.window_started_at
      END,
      expires_at = CASE
        WHEN current_window.expires_at <= _now
          THEN _now + make_interval(secs => _window_seconds)
        ELSE current_window.expires_at
      END
  RETURNING * INTO _row;

  RETURN QUERY SELECT
    _row.request_count <= _max_requests,
    GREATEST(_max_requests - _row.request_count, 0),
    CASE
      WHEN _row.request_count <= _max_requests THEN 0
      ELSE GREATEST(
        ceil(extract(epoch FROM (_row.expires_at - _now)))::integer,
        1
      )
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_landing_webhook_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_landing_webhook_rate_limit(text, integer, integer)
  TO service_role;

-- Claim atomico da Idempotency-Key. A linha e bloqueada ate o fim da RPC; uma
-- chamada concorrente espera e entao recebe replay/in_progress, nunca um
-- segundo claim. Lease permite recuperar uma execucao interrompida.
CREATE OR REPLACE FUNCTION public.begin_landing_webhook_request(
  _key_hash text,
  _request_hash text,
  _ttl_seconds integer DEFAULT 86400,
  _lease_seconds integer DEFAULT 180
)
RETURNS TABLE(
  disposition text,
  response_status integer,
  response_body jsonb,
  lease_token uuid,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _now timestamptz := clock_timestamp();
  _new_lease uuid := gen_random_uuid();
  _inserted integer;
  _row public.landing_webhook_idempotency%ROWTYPE;
BEGIN
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$'
     OR _request_hash IS NULL OR _request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'hash invalida' USING ERRCODE = '22023';
  END IF;
  IF _ttl_seconds IS NULL OR _ttl_seconds < 300 OR _ttl_seconds > 604800 THEN
    RAISE EXCEPTION 'ttl invalido' USING ERRCODE = '22023';
  END IF;
  IF _lease_seconds IS NULL OR _lease_seconds < 30 OR _lease_seconds > 600 THEN
    RAISE EXCEPTION 'lease invalida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.landing_webhook_idempotency (
    key_hash,
    request_hash,
    state,
    lease_token,
    lease_expires_at,
    expires_at
  )
  VALUES (
    _key_hash,
    _request_hash,
    'processing',
    _new_lease,
    _now + make_interval(secs => _lease_seconds),
    _now + make_interval(secs => _ttl_seconds)
  )
  ON CONFLICT (key_hash) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  IF _inserted = 1 THEN
    RETURN QUERY SELECT 'acquired', NULL::integer, NULL::jsonb,
      _new_lease, 0;
    RETURN;
  END IF;

  SELECT * INTO _row
  FROM public.landing_webhook_idempotency AS i
  WHERE i.key_hash = _key_hash
  FOR UPDATE;

  -- A limpeza pode ter removido uma linha expirada entre o ON CONFLICT e o
  -- SELECT. Reinsere uma vez; se outra requisicao vencer a corrida, bloqueia a
  -- linha dela e segue pelo mesmo fluxo abaixo.
  IF NOT FOUND THEN
    _new_lease := gen_random_uuid();
    INSERT INTO public.landing_webhook_idempotency (
      key_hash,
      request_hash,
      state,
      lease_token,
      lease_expires_at,
      expires_at
    )
    VALUES (
      _key_hash,
      _request_hash,
      'processing',
      _new_lease,
      _now + make_interval(secs => _lease_seconds),
      _now + make_interval(secs => _ttl_seconds)
    )
    ON CONFLICT (key_hash) DO NOTHING;
    GET DIAGNOSTICS _inserted = ROW_COUNT;

    IF _inserted = 1 THEN
      RETURN QUERY SELECT 'acquired', NULL::integer, NULL::jsonb,
        _new_lease, 0;
      RETURN;
    END IF;

    SELECT * INTO _row
    FROM public.landing_webhook_idempotency AS i
    WHERE i.key_hash = _key_hash
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'falha ao adquirir idempotencia'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  IF _row.request_hash <> _request_hash THEN
    RETURN QUERY SELECT 'conflict', NULL::integer, NULL::jsonb,
      NULL::uuid, 0;
    RETURN;
  END IF;

  IF _row.state = 'completed' AND _row.expires_at > _now THEN
    RETURN QUERY SELECT 'replay', _row.response_status::integer,
      _row.response_body, NULL::uuid, 0;
    RETURN;
  END IF;

  IF _row.state = 'processing' AND _row.lease_expires_at > _now THEN
    RETURN QUERY SELECT 'in_progress', NULL::integer, NULL::jsonb,
      NULL::uuid,
      GREATEST(
        ceil(extract(epoch FROM (_row.lease_expires_at - _now)))::integer,
        1
      );
    RETURN;
  END IF;

  _new_lease := gen_random_uuid();
  UPDATE public.landing_webhook_idempotency
  SET state = 'processing',
      request_hash = _request_hash,
      lease_token = _new_lease,
      lease_expires_at = _now + make_interval(secs => _lease_seconds),
      response_status = NULL,
      response_body = NULL,
      updated_at = _now,
      expires_at = _now + make_interval(secs => _ttl_seconds)
  WHERE key_hash = _key_hash;

  RETURN QUERY SELECT 'acquired', NULL::integer, NULL::jsonb,
    _new_lease, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_landing_webhook_request(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_landing_webhook_request(text, text, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_landing_webhook_request(
  _key_hash text,
  _request_hash text,
  _lease_token uuid,
  _response_status integer,
  _response_body jsonb,
  _ttl_seconds integer DEFAULT 86400
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _updated integer;
BEGIN
  IF _response_status IS NULL
     OR _response_body IS NULL
     OR _response_status < 200 OR _response_status > 599
     OR jsonb_typeof(_response_body) <> 'object'
     OR octet_length(_response_body::text) > 4096
     OR NOT (_response_body ? 'ok')
     OR jsonb_typeof(_response_body -> 'ok') <> 'boolean'
     OR (
       _response_body ? 'accepted'
       AND jsonb_typeof(_response_body -> 'accepted') <> 'boolean'
     )
     OR (
       _response_body ? 'error'
       AND (
         jsonb_typeof(_response_body -> 'error') <> 'string'
         OR char_length(_response_body ->> 'error') > 64
       )
     )
     OR (
       _response_body ? 'retry_after_s'
       AND jsonb_typeof(_response_body -> 'retry_after_s') <> 'number'
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(_response_body) AS response_key(key)
       WHERE response_key.key NOT IN ('ok', 'accepted', 'error', 'retry_after_s')
     ) THEN
    RAISE EXCEPTION 'resposta invalida' USING ERRCODE = '22023';
  END IF;
  IF _ttl_seconds IS NULL OR _ttl_seconds < 300 OR _ttl_seconds > 604800 THEN
    RAISE EXCEPTION 'ttl invalido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.landing_webhook_idempotency
  SET state = 'completed',
      lease_token = NULL,
      lease_expires_at = NULL,
      response_status = _response_status,
      response_body = _response_body,
      updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + make_interval(secs => _ttl_seconds)
  WHERE key_hash = _key_hash
    AND request_hash = _request_hash
    AND state = 'processing'
    AND lease_token = _lease_token;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_landing_webhook_request(
  text, text, uuid, integer, jsonb, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_landing_webhook_request(
  text, text, uuid, integer, jsonb, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_landing_webhook_request(
  _key_hash text,
  _request_hash text,
  _lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _deleted integer;
BEGIN
  DELETE FROM public.landing_webhook_idempotency
  WHERE key_hash = _key_hash
    AND request_hash = _request_hash
    AND state = 'processing'
    AND lease_token = _lease_token;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.release_landing_webhook_request(text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_landing_webhook_request(text, text, uuid)
  TO service_role;

-- Chamar por cron (por exemplo, a cada hora). SKIP LOCKED permite mais de um
-- worker sem bloquear requisicoes em andamento.
CREATE OR REPLACE FUNCTION public.cleanup_landing_webhook_state(
  _batch_size integer DEFAULT 1000
)
RETURNS TABLE(idempotency_deleted integer, rate_limits_deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _take integer := LEAST(GREATEST(COALESCE(_batch_size, 1000), 1), 5000);
  _idempotency_deleted integer;
  _rate_limits_deleted integer;
BEGIN
  WITH expired AS (
    SELECT i.key_hash
    FROM public.landing_webhook_idempotency AS i
    WHERE i.expires_at <= clock_timestamp()
    ORDER BY i.expires_at
    LIMIT _take
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.landing_webhook_idempotency AS i
  USING expired AS e
  WHERE i.key_hash = e.key_hash;
  GET DIAGNOSTICS _idempotency_deleted = ROW_COUNT;

  WITH expired AS (
    SELECT r.key_hash
    FROM public.landing_webhook_rate_limits AS r
    WHERE r.expires_at <= clock_timestamp()
    ORDER BY r.expires_at
    LIMIT _take
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.landing_webhook_rate_limits AS r
  USING expired AS e
  WHERE r.key_hash = e.key_hash;
  GET DIAGNOSTICS _rate_limits_deleted = ROW_COUNT;

  RETURN QUERY SELECT _idempotency_deleted, _rate_limits_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_landing_webhook_state(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_landing_webhook_state(integer)
  TO service_role;

-- ============================================================================
-- [10/18] 20260711127000_atendimento_inbox_v2.sql
-- ============================================================================

-- Inbox comercial calculada no banco.
--
-- Remove os antigos caps de 400 leads/1.000 interacoes: todos os leads ativos
-- do corretor autorizado participam das contagens e da deduplicacao, enquanto
-- apenas os primeiros itens de cada fila atravessam a rede.

CREATE INDEX IF NOT EXISTS idx_interacoes_lead_latest_active_v2
  ON public.interacoes (lead_id, ocorreu_em DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentacoes_lead_open_v2
  ON public.documentacoes (lead_id)
  WHERE status IN ('pendente', 'reprovado');

CREATE OR REPLACE FUNCTION public.atendimento_inbox_v2(
  _corretor_id uuid DEFAULT NULL,
  _limit_per_queue integer DEFAULT 15
)
RETURNS TABLE(
  fila text,
  total_count bigint,
  items jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _target uuid := COALESCE(_corretor_id, auth.uid());
  _take integer := LEAST(GREATEST(COALESCE(_limit_per_queue, 15), 1), 30);
  _now timestamptz := statement_timestamp();
BEGIN
  IF NOT public.is_active_member(_caller)
     OR NOT public.pode_acessar_corretor(_caller, _target) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH queue_defs(fila, ordem) AS (
    VALUES
      ('responder'::text, 1),
      ('followups'::text, 2),
      ('esfriando'::text, 3),
      ('docs'::text, 4)
  ), base AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.email,
      l.status,
      l.temperatura,
      l.ultima_interacao,
      l.proximo_followup,
      l.projeto_nome,
      l.created_at,
      l.corretor_id,
      l.origem,
      l.renda_informada,
      l.entrada_disponivel,
      l.usa_fgts,
      ultima.direcao AS ultima_direcao,
      ultima.ocorreu_em AS ultima_ocorreu_em,
      COALESCE(docs.quantidade, 0::bigint) AS docs_pendentes,
      CASE
        WHEN l.ultima_interacao IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - l.ultima_interacao)) / 86400)::integer
        )
      END AS dias_sem_contato,
      CASE
        WHEN ultima.ocorreu_em IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - ultima.ocorreu_em)) / 60)::bigint
        )
      END AS minutos_desde_resposta,
      CASE
        WHEN l.proximo_followup IS NULL THEN NULL
        ELSE GREATEST(
          0,
          floor(extract(epoch FROM (_now - l.proximo_followup)) / 60)::bigint
        )
      END AS minutos_followup_vencido
    FROM public.leads AS l
    LEFT JOIN LATERAL (
      SELECT i.direcao, i.ocorreu_em
      FROM public.interacoes AS i
      WHERE i.lead_id = l.id
        AND i.deleted_at IS NULL
      ORDER BY i.ocorreu_em DESC, i.id DESC
      LIMIT 1
    ) AS ultima ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::bigint AS quantidade
      FROM public.documentacoes AS d
      WHERE d.lead_id = l.id
        AND d.status IN ('pendente', 'reprovado')
    ) AS docs ON true
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.corretor_id = _target
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
      AND public.pode_acessar_lead(_caller, l.id)
  ), classified AS (
    SELECT
      b.*,
      CASE
        WHEN b.ultima_direcao = 'entrada'::public.interacao_direcao
          THEN 'responder'
        WHEN b.proximo_followup IS NOT NULL AND b.proximo_followup <= _now
          THEN 'followups'
        WHEN b.temperatura IN (
          'quente'::public.lead_temperatura,
          'morno'::public.lead_temperatura
        ) AND b.dias_sem_contato >= 3
          THEN 'esfriando'
        WHEN b.docs_pendentes > 0
          THEN 'docs'
        ELSE NULL
      END::text AS fila,
      LEAST(
        100,
        GREATEST(
          0,
          CASE b.temperatura::text
            WHEN 'quente' THEN 35
            WHEN 'morno' THEN 15
            ELSE 0
          END
          + CASE b.status::text
            WHEN 'analise_credito' THEN 25
            WHEN 'visita_realizada' THEN 22
            WHEN 'agendado' THEN 16
            WHEN 'em_atendimento' THEN 12
            WHEN 'aguardando_retorno' THEN 10
            WHEN 'qualificado' THEN 10
            WHEN 'aguardando_atendimento' THEN 6
            WHEN 'novo' THEN 6
            ELSE 0
          END
          + CASE
            WHEN b.ultima_interacao IS NULL THEN 12
            WHEN b.dias_sem_contato >= 1 THEN LEAST(20, b.dias_sem_contato * 4)
            ELSE 0
          END
        )
      )::integer AS score
    FROM base AS b
  ), with_reason AS (
    SELECT
      c.*,
      CASE
        WHEN c.score >= 60 THEN 'alta'
        WHEN c.score >= 35 THEN 'media'
        ELSE 'baixa'
      END::text AS tier,
      CASE c.fila
        WHEN 'responder' THEN
          'respondeu ' || CASE
            WHEN c.minutos_desde_resposta < 60
              THEN 'há ' || c.minutos_desde_resposta || 'min'
            WHEN c.minutos_desde_resposta < 1440
              THEN 'há ' || floor(c.minutos_desde_resposta / 60.0)::bigint || 'h'
            ELSE 'há ' || floor(c.minutos_desde_resposta / 1440.0)::bigint || 'd'
          END || ' e aguarda retorno'
        WHEN 'followups' THEN
          'follow-up combinado venceu ' || CASE
            WHEN c.minutos_followup_vencido < 60
              THEN 'há ' || c.minutos_followup_vencido || 'min'
            WHEN c.minutos_followup_vencido < 1440
              THEN 'há ' || floor(c.minutos_followup_vencido / 60.0)::bigint || 'h'
            ELSE 'há ' || floor(c.minutos_followup_vencido / 1440.0)::bigint || 'd'
          END
        WHEN 'esfriando' THEN
          c.temperatura::text || ' sem contato há ' || c.dias_sem_contato || ' dia(s)'
        WHEN 'docs' THEN
          c.docs_pendentes || ' documento(s) pendente(s) travando a pasta'
        ELSE NULL
      END::text AS motivo
    FROM classified AS c
    WHERE c.fila IS NOT NULL
  ), ranked AS (
    SELECT
      r.*,
      row_number() OVER (
        PARTITION BY r.fila
        ORDER BY
          r.score DESC,
          CASE r.fila
            WHEN 'responder' THEN r.ultima_ocorreu_em
            WHEN 'followups' THEN r.proximo_followup
            ELSE COALESCE(r.ultima_interacao, r.created_at)
          END ASC NULLS LAST,
          r.id
      ) AS row_number
    FROM with_reason AS r
  ), aggregated AS (
    SELECT
      r.fila,
      count(*)::bigint AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'lead', jsonb_build_object(
              'id', r.id,
              'nome', r.nome,
              'telefone', r.telefone,
              'email', r.email,
              'status', r.status,
              'temperatura', r.temperatura,
              'ultima_interacao', r.ultima_interacao,
              'proximo_followup', r.proximo_followup,
              'projeto_nome', r.projeto_nome,
              'created_at', r.created_at,
              'corretor_id', r.corretor_id,
              'origem', r.origem,
              'renda_informada', r.renda_informada,
              'entrada_disponivel', r.entrada_disponivel,
              'usa_fgts', r.usa_fgts
            ),
            'score', r.score,
            'tier', r.tier,
            'motivo', r.motivo,
            'docsPendentes', r.docs_pendentes
          )
          ORDER BY r.row_number
        ) FILTER (WHERE r.row_number <= _take),
        '[]'::jsonb
      ) AS items
    FROM ranked AS r
    GROUP BY r.fila
  )
  SELECT
    q.fila,
    COALESCE(a.total_count, 0::bigint),
    COALESCE(a.items, '[]'::jsonb)
  FROM queue_defs AS q
  LEFT JOIN aggregated AS a ON a.fila = q.fila
  ORDER BY q.ordem;
END;
$$;

REVOKE ALL ON FUNCTION public.atendimento_inbox_v2(uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.atendimento_inbox_v2(uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.atendimento_inbox_v2(uuid, integer)
  IS 'Inbox deduplicada: contagens completas e no maximo 30 itens por fila, restrita ao corretor autorizado.';

-- ============================================================================
-- [11/18] 20260711130000_lead_status_transition_guard.sql
-- ============================================================================

-- Defesa transversal da máquina de estados.
--
-- O navegador continua podendo editar os demais campos de um lead, mas uma
-- alteração de `leads.status` só passa quando a própria transação foi aberta
-- por `transicionar_lead`, pela aprovação/cancelamento de venda ou pelo fluxo
-- especializado e auditado de perda. A atribuição inicial da distribuição é a
-- única compatibilidade estrutural: novo sem dono -> aguardando com dono.

CREATE OR REPLACE FUNCTION public.validar_status_lead_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _role text := COALESCE(auth.role(), '');
  _autorizado boolean := COALESCE(
    current_setting('app.transicionar_lead', true) = 'on', false
  );
  _atribuicao_inicial boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- service_role e sessões SQL administrativas são fronteiras internas. As
  -- APIs públicas que usam service_role validam cliente/escopo antes da RPC.
  IF _role NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF _autorizado THEN
    RETURN NEW;
  END IF;

  _atribuicao_inicial := OLD.corretor_id IS NULL
    AND NEW.corretor_id IS NOT NULL
    AND OLD.status IN (
      'novo'::public.lead_status,
      'aguardando_corretor'::public.lead_status
    )
    AND NEW.status = 'aguardando_atendimento'::public.lead_status
    AND (
      NEW.corretor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
    );

  IF _atribuicao_inicial THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'status do lead só pode ser alterado por transicionar_lead'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.validar_status_lead_via_rpc()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_status_lead_via_rpc ON public.leads;
CREATE TRIGGER trg_validar_status_lead_via_rpc
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validar_status_lead_via_rpc();

-- A API pública tem uma única transição suportada: perda. Ela não recebe o
-- status como argumento, portanto uma credencial de integração nunca consegue
-- usar esta RPC para avançar/fechar o funil. O gate de cliente/equipe/projeto é
-- aplicado pelo handler antes desta chamada service_role-only.
CREATE OR REPLACE FUNCTION public.transicionar_lead_api_perda(
  p_lead_id uuid,
  p_categoria text,
  p_motivo text DEFAULT NULL,
  p_data_perda timestamptz DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _motivo text := COALESCE(NULLIF(btrim(p_motivo), ''), NULLIF(btrim(p_categoria), ''));
  _resultado public.leads%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_categoria), '') IS NULL
     OR char_length(btrim(p_categoria)) > 120 THEN
    RAISE EXCEPTION 'categoria de perda inválida'
      USING ERRCODE = '22023';
  END IF;

  IF _motivo IS NULL THEN
    RAISE EXCEPTION 'motivo de perda obrigatório'
      USING ERRCODE = '22023';
  END IF;

  IF p_data_perda IS NOT NULL AND p_data_perda > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'data da perda não pode estar no futuro'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.transicionar_lead(
    p_lead_id,
    'perdido'::public.lead_status,
    _motivo,
    NULL,
    NULL
  );

  UPDATE public.leads
  SET motivo_perda_categoria = btrim(p_categoria),
      motivo_perdido = NULLIF(btrim(p_motivo), ''),
      data_perda = COALESCE(p_data_perda, now())
  WHERE id = p_lead_id
  RETURNING * INTO _resultado;

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.transicionar_lead_api_perda(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transicionar_lead_api_perda(uuid, text, text, timestamptz)
  TO service_role;

-- Defesa para ambientes que tenham aplicado uma revisão intermediária da
-- migration anterior: service_role só recebe o wrapper restrito acima.
REVOKE EXECUTE ON FUNCTION public.transicionar_lead(
  uuid, public.lead_status, text, text, timestamptz
) FROM service_role;

-- Compatibilidade controlada: este fluxo ainda precisa redistribuir o lead
-- depois da perda. Ele abre a mesma flag transacional e mantém o gate central
-- de carteira. O RPC legado interno continua inacessível ao navegador.
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido_v2(
  _lead_id uuid,
  _categoria text,
  _detalhe text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _service_role boolean := COALESCE(auth.role() = 'service_role', false);
  _motivo text := COALESCE(NULLIF(btrim(_detalhe), ''), btrim(_categoria));
BEGIN
  IF NOT _service_role
     AND NOT public.pode_acessar_lead(auth.uid(), _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(_categoria), '') IS NULL THEN
    RAISE EXCEPTION 'motivo de perda obrigatório'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);
  PERFORM public.transicionar_lead(
    _lead_id,
    'perdido'::public.lead_status,
    _motivo,
    NULL,
    NULL
  );
  RETURN public.marcar_lead_perdido(_lead_id, _categoria, _detalhe);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_lead_perdido_v2(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido_v2(uuid, text, text)
  TO authenticated, service_role;

-- ============================================================================
-- [12/18] 20260711131000_samiq_governance.sql
-- ============================================================================

-- Governanca do SamiQ: configuracao versionada, quota distribuida e metricas
-- pseudonimas de tokens/custo. Nenhuma tabela guarda prompt do usuario,
-- contexto de lead, resposta do modelo, telefone, e-mail ou CPF.

CREATE TABLE IF NOT EXISTS public.samiq_prompt_versions (
  version text PRIMARY KEY CHECK (version ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  model_id text NOT NULL CHECK (char_length(model_id) BETWEEN 3 AND 160),
  system_prompt text NOT NULL CHECK (char_length(system_prompt) BETWEEN 100 AND 12000),
  action_prompts jsonb NOT NULL CHECK (jsonb_typeof(action_prompts) = 'object'),
  max_output_tokens integer NOT NULL DEFAULT 700
    CHECK (max_output_tokens BETWEEN 64 AND 4000),
  pricing_version text,
  input_cost_micros_per_million bigint
    CHECK (input_cost_micros_per_million IS NULL OR input_cost_micros_per_million >= 0),
  output_cost_micros_per_million bigint
    CHECK (output_cost_micros_per_million IS NULL OR output_cost_micros_per_million >= 0),
  active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_samiq_prompt_single_active
  ON public.samiq_prompt_versions (active)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.samiq_politica (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_requests_user_10m integer NOT NULL DEFAULT 20
    CHECK (max_requests_user_10m BETWEEN 1 AND 200),
  max_requests_team_10m integer NOT NULL DEFAULT 200
    CHECK (max_requests_team_10m BETWEEN 1 AND 5000),
  max_tokens_user_day integer NOT NULL DEFAULT 60000
    CHECK (max_tokens_user_day BETWEEN 1000 AND 10000000),
  max_tokens_team_day integer NOT NULL DEFAULT 600000
    CHECK (max_tokens_team_day BETWEEN 1000 AND 100000000),
  max_cost_user_micros_day bigint
    CHECK (max_cost_user_micros_day IS NULL OR max_cost_user_micros_day > 0),
  max_cost_team_micros_day bigint
    CHECK (max_cost_team_micros_day IS NULL OR max_cost_team_micros_day > 0),
  reservation_ttl_seconds integer NOT NULL DEFAULT 300
    CHECK (reservation_ttl_seconds BETWEEN 60 AND 1800),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.samiq_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]{2,63}$'),
  prompt_version text NOT NULL REFERENCES public.samiq_prompt_versions(version) ON DELETE RESTRICT,
  model_id text NOT NULL CHECK (char_length(model_id) BETWEEN 3 AND 160),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'completed', 'failed')),
  reserved_input_tokens integer NOT NULL CHECK (reserved_input_tokens BETWEEN 1 AND 50000),
  reserved_output_tokens integer NOT NULL CHECK (reserved_output_tokens BETWEEN 1 AND 4000),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens BETWEEN 0 AND 200000),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens BETWEEN 0 AND 200000),
  input_cost_micros_per_million bigint
    CHECK (input_cost_micros_per_million IS NULL OR input_cost_micros_per_million >= 0),
  output_cost_micros_per_million bigint
    CHECK (output_cost_micros_per_million IS NULL OR output_cost_micros_per_million >= 0),
  estimated_cost_micros bigint CHECK (estimated_cost_micros IS NULL OR estimated_cost_micros >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms BETWEEN 0 AND 600000),
  error_code text CHECK (
    error_code IS NULL OR (
      char_length(error_code) <= 64
      AND error_code ~ '^[a-z0-9_:-]+$'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT samiq_execucao_final_consistente CHECK (
    (
      status = 'reserved'
      AND completed_at IS NULL
      AND input_tokens IS NULL
      AND output_tokens IS NULL
    )
    OR
    (
      status IN ('completed', 'failed')
      AND completed_at IS NOT NULL
      AND input_tokens IS NOT NULL
      AND output_tokens IS NOT NULL
      AND (status <> 'completed' OR error_code IS NULL)
    )
  ),
  CONSTRAINT samiq_execucao_expiry_valid CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_samiq_execucoes_user_created
  ON public.samiq_execucoes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samiq_execucoes_team_created
  ON public.samiq_execucoes (equipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samiq_execucoes_action_created
  ON public.samiq_execucoes (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samiq_execucoes_expiry
  ON public.samiq_execucoes (expires_at)
  WHERE status = 'reserved';

ALTER TABLE public.samiq_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samiq_politica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samiq_execucoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.samiq_prompt_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.samiq_politica FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.samiq_execucoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.samiq_prompt_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.samiq_politica TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.samiq_execucoes TO service_role;

DROP TRIGGER IF EXISTS trg_samiq_prompt_versions_updated ON public.samiq_prompt_versions;
CREATE TRIGGER trg_samiq_prompt_versions_updated
  BEFORE UPDATE ON public.samiq_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_samiq_politica_updated ON public.samiq_politica;
CREATE TRIGGER trg_samiq_politica_updated
  BEFORE UPDATE ON public.samiq_politica
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.samiq_politica (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.samiq_prompt_versions (
  version,
  model_id,
  system_prompt,
  action_prompts,
  max_output_tokens,
  pricing_version,
  input_cost_micros_per_million,
  output_cost_micros_per_million,
  active
)
VALUES (
  'samiq-2026-07-v1',
  'google/gemini-3-flash-preview',
  $system$Você é o SamiQ, copiloto comercial da imobiliária Seu Metro Quadrado (SMQ), especialista em vendas de imóveis Minha Casa Minha Vida e lançamentos em São Paulo. Fala português do Brasil, direto e prático, como um gerente comercial experiente que respeita o tempo do corretor. Não invente dados ausentes, não prometa condições específicas de financiamento e não use markdown pesado. Nunca chame o cliente de lead em uma mensagem. Você não possui ferramentas de escrita: nunca envie mensagens, nunca altere dados e nunca afirme ter executado uma ação. Apenas produza sugestões que serão obrigatoriamente revisadas e confirmadas por uma pessoa. Quando dados pessoais forem substituídos por marcadores, preserve os marcadores e não tente inferir o valor original.$system$,
  jsonb_build_object(
    'resumo_cliente', $action$Resuma este cliente em até 6 linhas: perfil minimizado, busca, capacidade financeira, momento no funil, objeções e risco principal. Termine com uma recomendação prática.$action$,
    'mensagem_sugerida', $action$Escreva uma mensagem de WhatsApp pronta para revisão, adequada ao momento do cliente. Máximo 5 linhas curtas, tom cordial e chamada clara para o próximo passo. Use apenas o primeiro nome fornecido ou omita a saudação nominal.$action$,
    'responder_objecao', $action$Proponha uma resposta empática e segura à objeção em até 4 linhas. Use a biblioteca fornecida como base e sugira a pergunta de avanço seguinte.$action$,
    'proximo_passo', $action$Diga o próximo melhor passo comercial e o motivo em até 4 linhas. Seja específico sobre ação, momento e canal, sem alegar que a ação já foi executada.$action$,
    'projeto_ideal', $action$Indique 2 ou 3 empreendimentos compatíveis usando apenas perfil e catálogo fornecidos, com um argumento por opção. Se os dados forem insuficientes, diga o que falta.$action$,
    'checklist_docs', $action$Monte o checklist de documentos considerando somente os status fornecidos. Liste pendências primeiro e itens concluídos depois. Termine com uma sugestão curta de cobrança para revisão.$action$,
    'recuperar_frio', $action$Proponha um gancho de reativação e uma mensagem curta de reaproximação para revisão, sem parecer cobrança e sem afirmar que foi enviada.$action$,
    'script_ligacao', $action$Monte um roteiro curto: abertura, três perguntas, contorno da objeção provável e fechamento com compromisso. Use tópicos curtos.$action$,
    'analise_funil', $action$Analise as contagens do funil: maior gargalo, ponto saudável e duas ações práticas para a semana. Máximo 8 linhas.$action$,
    'prioridade_dia', $action$Com base na fila compacta priorizada, indique em ordem quem abordar e a sugestão de abordagem em uma linha. Máximo 6 itens.$action$,
    'pergunta_livre', $action$Responda objetivamente com foco em vendas imobiliárias MCMV em São Paulo. Se depender de dados ausentes, diga o que falta.$action$
  ),
  700,
  NULL,
  NULL,
  NULL,
  true
)
ON CONFLICT (version) DO NOTHING;

-- Reserva atomica. Advisory locks serializam usuarios da mesma equipe entre
-- instancias serverless; contagens e budgets nao dependem de memoria local.
CREATE OR REPLACE FUNCTION public.samiq_reservar_execucao(
  _user_id uuid,
  _action text,
  _estimated_input_tokens integer DEFAULT 10000,
  _requested_output_tokens integer DEFAULT NULL
)
RETURNS TABLE(
  allowed boolean,
  denial_reason text,
  retry_after_seconds integer,
  execution_id uuid,
  prompt_version text,
  model_id text,
  system_prompt text,
  action_prompt text,
  max_output_tokens integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _now timestamptz := clock_timestamp();
  _day_start timestamptz;
  _day_end timestamptz;
  _team_id uuid;
  _prompt public.samiq_prompt_versions%ROWTYPE;
  _policy public.samiq_politica%ROWTYPE;
  _output_tokens integer;
  _user_requests integer;
  _team_requests integer;
  _user_oldest timestamptz;
  _team_oldest timestamptz;
  _user_tokens bigint;
  _team_tokens bigint;
  _user_cost bigint;
  _team_cost bigint;
  _reserved_cost bigint;
  _execution_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_active_member(_user_id) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _action IS NULL OR _action !~ '^[a-z][a-z0-9_]{2,63}$' THEN
    RAISE EXCEPTION 'acao invalida' USING ERRCODE = '22023';
  END IF;
  IF _estimated_input_tokens IS NULL
     OR _estimated_input_tokens < 1
     OR _estimated_input_tokens > 50000 THEN
    RAISE EXCEPTION 'estimativa de tokens invalida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT _prompt
  FROM public.samiq_prompt_versions AS p
  WHERE p.active = true
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF NOT (_prompt.action_prompts ? _action) THEN
    RAISE EXCEPTION 'acao sem prompt versionado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT _policy FROM public.samiq_politica WHERE id = 1;
  SELECT p.equipe_id INTO _team_id FROM public.profiles AS p WHERE p.id = _user_id;

  IF _requested_output_tokens IS NOT NULL AND _requested_output_tokens < 1 THEN
    RAISE EXCEPTION 'output tokens invalido' USING ERRCODE = '22023';
  END IF;
  _output_tokens := LEAST(
    COALESCE(_requested_output_tokens, _prompt.max_output_tokens),
    _prompt.max_output_tokens
  );

  _day_start := date_trunc('day', _now AT TIME ZONE 'America/Sao_Paulo')
    AT TIME ZONE 'America/Sao_Paulo';
  _day_end := _day_start + interval '1 day';

  -- Ordem fixa (equipe, usuario) evita deadlock entre chamadas simultaneas.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('samiq:team:' || COALESCE(_team_id::text, 'sem-equipe'), 0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('samiq:user:' || _user_id::text, 0));

  UPDATE public.samiq_execucoes
  SET status = 'failed',
      -- Se o processo morreu depois do gateway, não sabemos o consumo real.
      -- Mantemos a reserva conservadora no budget em vez de apagar custo.
      input_tokens = reserved_input_tokens,
      output_tokens = reserved_output_tokens,
      error_code = 'reservation_expired',
      completed_at = _now
  WHERE status = 'reserved'
    AND expires_at <= _now
    AND (
      user_id = _user_id
      OR equipe_id IS NOT DISTINCT FROM _team_id
    );

  SELECT count(*)::integer, min(e.created_at)
  INTO _user_requests, _user_oldest
  FROM public.samiq_execucoes AS e
  WHERE e.user_id = _user_id
    AND e.created_at >= _now - interval '10 minutes';

  SELECT count(*)::integer, min(e.created_at)
  INTO _team_requests, _team_oldest
  FROM public.samiq_execucoes AS e
  WHERE e.equipe_id IS NOT DISTINCT FROM _team_id
    AND e.created_at >= _now - interval '10 minutes';

  IF _user_requests >= _policy.max_requests_user_10m THEN
    RETURN QUERY SELECT false, 'user_rate_limit',
      GREATEST(1, ceil(extract(epoch FROM (_user_oldest + interval '10 minutes' - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF _team_requests >= _policy.max_requests_team_10m THEN
    RETURN QUERY SELECT false, 'team_rate_limit',
      GREATEST(1, ceil(extract(epoch FROM (_team_oldest + interval '10 minutes' - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT
    COALESCE(sum(COALESCE(e.input_tokens, e.reserved_input_tokens)
      + COALESCE(e.output_tokens, e.reserved_output_tokens)), 0)::bigint,
    COALESCE(sum(e.estimated_cost_micros), 0)::bigint
  INTO _user_tokens, _user_cost
  FROM public.samiq_execucoes AS e
  WHERE e.user_id = _user_id
    AND e.created_at >= _day_start
    AND e.created_at < _day_end;

  SELECT
    COALESCE(sum(COALESCE(e.input_tokens, e.reserved_input_tokens)
      + COALESCE(e.output_tokens, e.reserved_output_tokens)), 0)::bigint,
    COALESCE(sum(e.estimated_cost_micros), 0)::bigint
  INTO _team_tokens, _team_cost
  FROM public.samiq_execucoes AS e
  WHERE e.equipe_id IS NOT DISTINCT FROM _team_id
    AND e.created_at >= _day_start
    AND e.created_at < _day_end;

  IF _prompt.input_cost_micros_per_million IS NOT NULL
     AND _prompt.output_cost_micros_per_million IS NOT NULL THEN
    _reserved_cost := ceil(
      (_estimated_input_tokens::numeric * _prompt.input_cost_micros_per_million::numeric
       + _output_tokens::numeric * _prompt.output_cost_micros_per_million::numeric) / 1000000
    )::bigint;
  ELSE
    _reserved_cost := NULL;
  END IF;

  IF _user_tokens + _estimated_input_tokens + _output_tokens
     > _policy.max_tokens_user_day THEN
    RETURN QUERY SELECT false, 'user_token_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF _team_tokens + _estimated_input_tokens + _output_tokens
     > _policy.max_tokens_team_day THEN
    RETURN QUERY SELECT false, 'team_token_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_user_micros_day IS NOT NULL
     AND _user_cost + _reserved_cost > _policy.max_cost_user_micros_day THEN
    RETURN QUERY SELECT false, 'user_cost_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF _reserved_cost IS NOT NULL
     AND _policy.max_cost_team_micros_day IS NOT NULL
     AND _team_cost + _reserved_cost > _policy.max_cost_team_micros_day THEN
    RETURN QUERY SELECT false, 'team_cost_budget',
      GREATEST(1, ceil(extract(epoch FROM (_day_end - _now)))::integer),
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.samiq_execucoes (
    id,
    user_id,
    equipe_id,
    action,
    prompt_version,
    model_id,
    reserved_input_tokens,
    reserved_output_tokens,
    input_cost_micros_per_million,
    output_cost_micros_per_million,
    estimated_cost_micros,
    expires_at
  )
  VALUES (
    _execution_id,
    _user_id,
    _team_id,
    _action,
    _prompt.version,
    _prompt.model_id,
    _estimated_input_tokens,
    _output_tokens,
    _prompt.input_cost_micros_per_million,
    _prompt.output_cost_micros_per_million,
    _reserved_cost,
    _now + make_interval(secs => _policy.reservation_ttl_seconds)
  );

  RETURN QUERY SELECT
    true,
    NULL::text,
    0,
    _execution_id,
    _prompt.version,
    _prompt.model_id,
    _prompt.system_prompt,
    _prompt.action_prompts ->> _action,
    _output_tokens;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_reservar_execucao(uuid, text, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.samiq_finalizar_execucao(
  _user_id uuid,
  _execution_id uuid,
  _status text,
  _input_tokens integer DEFAULT 0,
  _output_tokens integer DEFAULT 0,
  _latency_ms integer DEFAULT 0,
  _error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _execution public.samiq_execucoes%ROWTYPE;
  _cost bigint;
BEGIN
  IF _status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'status invalido' USING ERRCODE = '22023';
  END IF;
  IF _input_tokens IS NULL OR _input_tokens < 0 OR _input_tokens > 200000
     OR _output_tokens IS NULL OR _output_tokens < 0 OR _output_tokens > 200000
     OR _latency_ms IS NULL OR _latency_ms < 0 OR _latency_ms > 600000 THEN
    RAISE EXCEPTION 'metrica invalida' USING ERRCODE = '22023';
  END IF;
  IF _error_code IS NOT NULL AND (
    char_length(_error_code) > 64 OR _error_code !~ '^[a-z0-9_:-]+$'
  ) THEN
    RAISE EXCEPTION 'error_code invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _execution
  FROM public.samiq_execucoes AS e
  WHERE e.id = _execution_id AND e.user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF _execution.status <> 'reserved' THEN
    RETURN _execution.status = _status;
  END IF;

  IF _execution.input_cost_micros_per_million IS NOT NULL
     AND _execution.output_cost_micros_per_million IS NOT NULL THEN
    _cost := ceil(
      (_input_tokens::numeric * _execution.input_cost_micros_per_million::numeric
       + _output_tokens::numeric * _execution.output_cost_micros_per_million::numeric) / 1000000
    )::bigint;
  ELSE
    _cost := NULL;
  END IF;

  UPDATE public.samiq_execucoes
  SET status = _status,
      input_tokens = _input_tokens,
      output_tokens = _output_tokens,
      estimated_cost_micros = _cost,
      latency_ms = _latency_ms,
      error_code = CASE WHEN _status = 'failed'
        THEN COALESCE(_error_code, 'generation_failed')
        ELSE NULL
      END,
      completed_at = clock_timestamp()
  WHERE id = _execution_id AND status = 'reserved';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_finalizar_execucao(
  uuid, uuid, text, integer, integer, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_finalizar_execucao(
  uuid, uuid, text, integer, integer, integer, text
) TO service_role;

-- ============================================================================
-- [13/18] 20260711132000_vitrine_publica.sql
-- ============================================================================

-- Vitrine pública segura: shortlist de 2–3 projetos vinculada internamente a
-- um lead, mas sem PII na URL ou na resposta pública. O token bruto existe
-- apenas no processo que cria o link; o banco persiste somente SHA-256.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace
      AND typname = 'vitrine_evento_tipo'
  ) THEN
    CREATE TYPE public.vitrine_evento_tipo AS ENUM (
      'abertura',
      'projeto_visto',
      'cta_clicado'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.vitrine_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  token_hash text NOT NULL,
  expira_em timestamptz NOT NULL,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ultimo_acesso_em timestamptz,
  total_aberturas integer NOT NULL DEFAULT 0 CHECK (total_aberturas >= 0),
  total_eventos integer NOT NULL DEFAULT 0 CHECK (total_eventos BETWEEN 0 AND 1000),
  total_requisicoes integer NOT NULL DEFAULT 0 CHECK (total_requisicoes BETWEEN 0 AND 20000),
  limite_janela_inicio timestamptz,
  limite_janela_requisicoes integer NOT NULL DEFAULT 0
    CHECK (limite_janela_requisicoes BETWEEN 0 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vitrine_links_token_hash_formato_ck
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT vitrine_links_validade_ck
    CHECK (expira_em > created_at AND expira_em <= created_at + interval '30 days'),
  CONSTRAINT vitrine_links_revogacao_ck
    CHECK (
      (revogado_em IS NULL AND revogado_por IS NULL)
      OR (revogado_em IS NOT NULL)
    )
);

-- Compatibilidade com eventual aplicação de uma revisão intermediária desta
-- migration no ambiente vivo desconhecido.
ALTER TABLE public.vitrine_links
  ADD COLUMN IF NOT EXISTS total_eventos integer NOT NULL DEFAULT 0
    CHECK (total_eventos BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS total_requisicoes integer NOT NULL DEFAULT 0
    CHECK (total_requisicoes BETWEEN 0 AND 20000),
  ADD COLUMN IF NOT EXISTS limite_janela_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS limite_janela_requisicoes integer NOT NULL DEFAULT 0
    CHECK (limite_janela_requisicoes BETWEEN 0 AND 60);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vitrine_links_token_hash
  ON public.vitrine_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_vitrine_links_lead_created
  ON public.vitrine_links (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitrine_links_validos
  ON public.vitrine_links (expira_em)
  WHERE revogado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.vitrine_link_projetos (
  link_id uuid NOT NULL REFERENCES public.vitrine_links(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  ordem smallint NOT NULL CHECK (ordem BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, projeto_id),
  CONSTRAINT uq_vitrine_link_projetos_ordem UNIQUE (link_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_vitrine_link_projetos_projeto
  ON public.vitrine_link_projetos (projeto_id, link_id);

CREATE TABLE IF NOT EXISTS public.vitrine_link_eventos (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  link_id uuid NOT NULL REFERENCES public.vitrine_links(id) ON DELETE CASCADE,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE RESTRICT,
  tipo public.vitrine_evento_tipo NOT NULL,
  cta_tipo text,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vitrine_link_eventos_contexto_ck CHECK (
    (tipo = 'abertura' AND projeto_id IS NULL AND cta_tipo IS NULL)
    OR (tipo = 'projeto_visto' AND projeto_id IS NOT NULL AND cta_tipo IS NULL)
    OR (
      tipo = 'cta_clicado'
      AND projeto_id IS NOT NULL
      AND cta_tipo IN ('book', 'tabela_precos', 'contato')
    )
  )
);

ALTER TABLE public.vitrine_link_eventos
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;
UPDATE public.vitrine_link_eventos
SET idempotency_key = gen_random_uuid()
WHERE idempotency_key IS NULL;
ALTER TABLE public.vitrine_link_eventos
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vitrine_eventos_idempotencia
  ON public.vitrine_link_eventos (link_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_vitrine_link_eventos_link_created
  ON public.vitrine_link_eventos (link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitrine_link_eventos_projeto_created
  ON public.vitrine_link_eventos (projeto_id, created_at DESC)
  WHERE projeto_id IS NOT NULL;

ALTER TABLE public.vitrine_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitrine_link_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitrine_link_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitrine_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vitrine_link_projetos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vitrine_link_eventos FORCE ROW LEVEL SECURITY;

-- O navegador nunca consulta estas tabelas. A service role chama somente as
-- funções estreitas abaixo depois de autenticar o usuário ou validar o hash.
REVOKE ALL ON public.vitrine_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vitrine_link_projetos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vitrine_link_eventos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.vitrine_links TO service_role;
GRANT ALL ON public.vitrine_link_projetos TO service_role;
GRANT ALL ON public.vitrine_link_eventos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vitrine_link_eventos_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.criar_vitrine_link(
  _ator_id uuid,
  _lead_id uuid,
  _token_hash text,
  _projeto_ids uuid[],
  _expira_em timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link_id uuid;
  _quantidade integer;
  _projetos_validos integer;
BEGIN
  IF _ator_id IS NULL
     OR NOT public.is_active_member(_ator_id)
     OR NOT public.pode_acessar_lead(_ator_id, _lead_id) THEN
    RAISE EXCEPTION 'vitrine_link_forbidden' USING ERRCODE = '42501';
  END IF;

  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'vitrine_token_hash_invalido' USING ERRCODE = '22023';
  END IF;

  _quantidade := cardinality(_projeto_ids);
  IF _quantidade IS NULL OR _quantidade < 2 OR _quantidade > 3
     OR array_position(_projeto_ids, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT id) FROM unnest(_projeto_ids) AS ids(id)) <> _quantidade THEN
    RAISE EXCEPTION 'vitrine_shortlist_invalida' USING ERRCODE = '22023';
  END IF;

  IF _expira_em <= now() OR _expira_em > now() + interval '30 days' THEN
    RAISE EXCEPTION 'vitrine_validade_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
    INTO _projetos_validos
    FROM public.projetos p
   WHERE p.id = ANY (_projeto_ids)
     AND p.ativo = true
     AND p.deleted_at IS NULL;

  IF _projetos_validos <> _quantidade THEN
    RAISE EXCEPTION 'vitrine_projeto_indisponivel' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.vitrine_links (
    lead_id, criado_por, token_hash, expira_em
  ) VALUES (
    _lead_id, _ator_id, lower(_token_hash), _expira_em
  )
  RETURNING id INTO _link_id;

  INSERT INTO public.vitrine_link_projetos (link_id, projeto_id, ordem)
  SELECT _link_id, item.projeto_id, item.ordem::smallint
    FROM unnest(_projeto_ids) WITH ORDINALITY AS item(projeto_id, ordem);

  RETURN _link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_vitrine_link(uuid, uuid, text, uuid[], timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_vitrine_link(uuid, uuid, text, uuid[], timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.revogar_vitrine_link(
  _ator_id uuid,
  _link_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lead_id uuid;
BEGIN
  SELECT vl.lead_id
    INTO _lead_id
    FROM public.vitrine_links vl
   WHERE vl.id = _link_id;

  IF _lead_id IS NULL
     OR NOT public.is_active_member(_ator_id)
     OR NOT public.pode_acessar_lead(_ator_id, _lead_id) THEN
    RETURN false;
  END IF;

  UPDATE public.vitrine_links
     SET revogado_em = now(), revogado_por = _ator_id
   WHERE id = _link_id
     AND revogado_em IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revogar_vitrine_link(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_vitrine_link(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.listar_vitrine_links(
  _ator_id uuid,
  _lead_id uuid
)
RETURNS TABLE (
  id uuid,
  expira_em timestamptz,
  revogado_em timestamptz,
  created_at timestamptz,
  projetos jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_active_member(_ator_id)
     OR NOT public.pode_acessar_lead(_ator_id, _lead_id) THEN
    RAISE EXCEPTION 'vitrine_link_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    vl.id,
    vl.expira_em,
    vl.revogado_em,
    vl.created_at,
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'ordem', vlp.ordem
      ) ORDER BY vlp.ordem
    ) AS projetos
  FROM public.vitrine_links vl
  JOIN public.vitrine_link_projetos vlp ON vlp.link_id = vl.id
  JOIN public.projetos p ON p.id = vlp.projeto_id
  WHERE vl.lead_id = _lead_id
  GROUP BY vl.id
  ORDER BY vl.created_at DESC
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_vitrine_links(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_vitrine_links(uuid, uuid)
  TO service_role;

-- Limite distribuído aplicado ANTES de servir qualquer payload ou aceitar
-- evento. O lock da linha serializa instâncias serverless e o teto vitalício
-- mantém o custo de um link comprometido estritamente limitado.
CREATE OR REPLACE FUNCTION public.consumir_vitrine_requisicao(
  _token_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link public.vitrine_links%ROWTYPE;
  _agora timestamptz := clock_timestamp();
  _inicio timestamptz;
  _quantidade integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO _link
  FROM public.vitrine_links
  WHERE token_hash = lower(_token_hash)
    AND revogado_em IS NULL
    AND expira_em > _agora
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF _link.total_requisicoes >= 20000 THEN RETURN 'exhausted'; END IF;

  IF _link.limite_janela_inicio IS NULL
     OR _link.limite_janela_inicio <= _agora - interval '1 minute' THEN
    _inicio := _agora;
    _quantidade := 1;
  ELSE
    _inicio := _link.limite_janela_inicio;
    _quantidade := _link.limite_janela_requisicoes + 1;
  END IF;

  IF _quantidade > 60 THEN RETURN 'rate_limited'; END IF;

  UPDATE public.vitrine_links
  SET limite_janela_inicio = _inicio,
      limite_janela_requisicoes = _quantidade,
      total_requisicoes = total_requisicoes + 1
  WHERE id = _link.id;

  RETURN 'allowed';
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_vitrine_requisicao(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_vitrine_requisicao(text)
  TO service_role;

-- Projeção pública fechada. Não inclui lead_id, criado_por, token_hash,
-- observações, argumentos internos, endereço completo ou webhook_token.
CREATE OR REPLACE FUNCTION public.obter_vitrine_publica(_token_hash text)
RETURNS TABLE (
  expira_em timestamptz,
  projetos jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    vl.expira_em,
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'construtora', p.construtora,
        'bairro', p.bairro,
        'cidade', p.cidade,
        'zona', p.zona_smq,
        'dorms_min', p.dorms_min,
        'dorms_max', p.dorms_max,
        'metragem_min', p.metragem_min,
        'metragem_max', p.metragem_max,
        'preco_a_partir', p.preco_a_partir,
        'sob_consulta', p.sob_consulta,
        'status_preco', p.status_preco,
        'status_entrega', p.status_entrega,
        'mes_entrega', p.mes_entrega,
        'ano_entrega', p.ano_entrega,
        'renda_minima', p.renda_minima,
        'diferenciais', p.diferenciais,
        'book_url', p.book_url,
        'tabela_precos_url', p.tabela_precos_url
      ) ORDER BY vlp.ordem
    ) AS projetos
  FROM public.vitrine_links vl
  JOIN public.vitrine_link_projetos vlp ON vlp.link_id = vl.id
  JOIN public.projetos p ON p.id = vlp.projeto_id
  WHERE vl.token_hash = lower(_token_hash)
    AND lower(_token_hash) ~ '^[0-9a-f]{64}$'
    AND vl.revogado_em IS NULL
    AND vl.expira_em > now()
    AND p.ativo = true
    AND p.deleted_at IS NULL
  GROUP BY vl.id;
$$;

REVOKE ALL ON FUNCTION public.obter_vitrine_publica(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_vitrine_publica(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_vitrine_evento(
  _token_hash text,
  _idempotency_key uuid,
  _tipo public.vitrine_evento_tipo,
  _projeto_id uuid DEFAULT NULL,
  _cta_tipo text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link_id uuid;
  _total_eventos integer;
  _inseridos integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$'
     OR _idempotency_key IS NULL THEN
    RETURN false;
  END IF;

  SELECT vl.id, vl.total_eventos
    INTO _link_id, _total_eventos
    FROM public.vitrine_links vl
   WHERE vl.token_hash = lower(_token_hash)
     AND vl.revogado_em IS NULL
     AND vl.expira_em > now()
   FOR UPDATE;

  IF _link_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vitrine_link_eventos e
    WHERE e.link_id = _link_id AND e.idempotency_key = _idempotency_key
  ) THEN
    RETURN true;
  END IF;

  IF _total_eventos >= 1000 THEN RETURN false; END IF;

  -- Limite distribuído por link. O lock acima serializa a contagem e impede
  -- que um token válido seja usado para crescer a tabela sem teto.
  IF (
    SELECT count(*)
      FROM public.vitrine_link_eventos e
     WHERE e.link_id = _link_id
       AND e.created_at >= now() - interval '1 minute'
  ) >= 120 THEN
    RETURN false;
  END IF;

  IF _tipo = 'abertura' THEN
    IF _projeto_id IS NOT NULL OR _cta_tipo IS NOT NULL THEN RETURN false; END IF;
  ELSE
    IF _projeto_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM public.vitrine_link_projetos vlp
       WHERE vlp.link_id = _link_id AND vlp.projeto_id = _projeto_id
    ) THEN
      RETURN false;
    END IF;
    IF _tipo = 'projeto_visto' AND _cta_tipo IS NOT NULL THEN RETURN false; END IF;
    IF _tipo = 'cta_clicado'
       AND _cta_tipo NOT IN ('book', 'tabela_precos', 'contato') THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.vitrine_link_eventos (
    link_id, projeto_id, tipo, cta_tipo, idempotency_key
  ) VALUES (
    _link_id, _projeto_id, _tipo, _cta_tipo, _idempotency_key
  )
  ON CONFLICT (link_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS _inseridos = ROW_COUNT;

  IF _inseridos = 0 THEN RETURN true; END IF;

  UPDATE public.vitrine_links
  SET total_eventos = total_eventos + 1
  WHERE id = _link_id;

  IF _tipo = 'abertura' THEN
    UPDATE public.vitrine_links
       SET ultimo_acesso_em = now(), total_aberturas = total_aberturas + 1
     WHERE id = _link_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_vitrine_evento(
  text, uuid, public.vitrine_evento_tipo, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_vitrine_evento(
  text, uuid, public.vitrine_evento_tipo, uuid, text
) TO service_role;

-- Alvo para cron diário: elimina telemetria antiga somente de links já
-- expirados/revogados. O teto de 1.000 eventos por link continua protegendo o
-- banco mesmo se o agendamento operacional atrasar.
CREATE OR REPLACE FUNCTION public.limpar_vitrine_eventos_expirados(
  _antes timestamptz DEFAULT now() - interval '90 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _removidos integer;
BEGIN
  IF _antes > now() - interval '30 days' THEN
    RAISE EXCEPTION 'janela minima de retencao e 30 dias' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.vitrine_link_eventos AS evento
  USING public.vitrine_links AS link
  WHERE evento.link_id = link.id
    AND evento.created_at < _antes
    AND (link.revogado_em IS NOT NULL OR link.expira_em < now());
  GET DIAGNOSTICS _removidos = ROW_COUNT;
  RETURN _removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamptz)
  TO service_role;

COMMENT ON TABLE public.vitrine_links IS
  'Links temporários de shortlist. token_hash é SHA-256; o token bruto nunca é persistido.';
COMMENT ON TABLE public.vitrine_link_eventos IS
  'Sinais públicos sem PII, ligados ao lead apenas por vitrine_links no domínio interno.';

-- ============================================================================
-- [14/18] 20260711133000_modo_visita.sql
-- ============================================================================

-- Modo Visita: execução assistida em campo, sem armazenar áudio bruto.
--
-- A escrita passa exclusivamente pela RPC abaixo. Ela valida a carteira,
-- serializa a conclusão da visita e, quando solicitado, move o lead pela
-- máquina de estados na mesma transação.

CREATE TABLE IF NOT EXISTS public.visita_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL UNIQUE
    REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  nota_transcrita text,
  observacoes text,
  status text NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'concluida')),
  proxima_etapa public.lead_status,
  proxima_acao text,
  proximo_followup timestamptz,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  criada_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  atualizada_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(checklist) = 'object'),
  CHECK (char_length(COALESCE(nota_transcrita, '')) <= 5000),
  CHECK (char_length(COALESCE(observacoes, '')) <= 5000),
  CHECK (char_length(COALESCE(proxima_acao, '')) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_visita_execucoes_lead
  ON public.visita_execucoes(lead_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_visita_execucoes_corretor
  ON public.visita_execucoes(corretor_id, updated_at DESC);

ALTER TABLE public.visita_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visita_execucoes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visita_execucoes_select_carteira"
  ON public.visita_execucoes;
CREATE POLICY "visita_execucoes_select_carteira"
  ON public.visita_execucoes FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

-- Nenhuma escrita direta do navegador: a RPC mantém agenda, execução e lead
-- consistentes e auditáveis.
REVOKE ALL ON TABLE public.visita_execucoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.visita_execucoes TO authenticated;
GRANT ALL ON TABLE public.visita_execucoes TO service_role;

-- Mantém a execução alinhada quando o agendamento é transferido ou quando a
-- deduplicação mescla o lead de origem no destino. Sem isso, o lead_id
-- denormalizado da execução poderia apontar para a carteira antiga.
CREATE OR REPLACE FUNCTION public.sincronizar_execucao_com_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.lead_id IS NULL AND EXISTS (
    SELECT 1 FROM public.visita_execucoes WHERE agendamento_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'visita executada não pode ser desvinculada do lead'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    UPDATE public.visita_execucoes
    SET lead_id = NEW.lead_id,
        corretor_id = NEW.corretor_id,
        atualizada_por = COALESCE(auth.uid(), atualizada_por),
        updated_at = now()
    WHERE agendamento_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_execucao_com_agendamento()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sincronizar_execucao_com_agendamento
  ON public.agendamentos;
CREATE TRIGGER trg_sincronizar_execucao_com_agendamento
  AFTER UPDATE OF lead_id, corretor_id ON public.agendamentos
  FOR EACH ROW
  WHEN (
    OLD.lead_id IS DISTINCT FROM NEW.lead_id
    OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id
  )
  EXECUTE FUNCTION public.sincronizar_execucao_com_agendamento();

CREATE OR REPLACE FUNCTION public.salvar_modo_visita(
  p_agendamento_id uuid,
  p_checklist jsonb DEFAULT '{}'::jsonb,
  p_nota_transcrita text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_concluir boolean DEFAULT false,
  p_proxima_etapa public.lead_status DEFAULT NULL,
  p_proxima_acao text DEFAULT NULL,
  p_proximo_followup timestamptz DEFAULT NULL
)
RETURNS public.visita_execucoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _agenda public.agendamentos%ROWTYPE;
  _lead public.leads%ROWTYPE;
  _resultado public.visita_execucoes%ROWTYPE;
  _checklist jsonb := COALESCE(p_checklist, '{}'::jsonb);
  _ja_concluida boolean := false;
BEGIN
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _agenda
  FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND deleted_at IS NULL
    AND tipo = 'visita'::public.agendamento_tipo
  FOR UPDATE;

  IF NOT FOUND OR _agenda.lead_id IS NULL THEN
    RAISE EXCEPTION 'visita vinculada a lead não encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  -- lead_id é a fonte de autorização. O corretor_id da agenda/execução é
  -- histórico denormalizado e não pode manter acesso depois de transferência.
  IF NOT public.pode_acessar_lead(_uid, _agenda.lead_id) THEN
    RAISE EXCEPTION 'visita fora da carteira autorizada'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(_checklist) <> 'object'
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(_checklist) AS item(chave, valor)
       WHERE item.chave NOT IN (
         'horario_confirmado',
         'documentos_separados',
         'simulacao_revisada',
         'projeto_apresentado',
         'objecoes_registradas'
       )
       OR jsonb_typeof(item.valor) <> 'boolean'
     ) THEN
    RAISE EXCEPTION 'checklist inválido' USING ERRCODE = '22023';
  END IF;

  IF char_length(COALESCE(p_nota_transcrita, '')) > 5000
     OR char_length(COALESCE(p_observacoes, '')) > 5000
     OR char_length(COALESCE(p_proxima_acao, '')) > 500 THEN
    RAISE EXCEPTION 'conteúdo da visita excede o limite'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead
  FROM public.leads
  WHERE id = _agenda.lead_id
  FOR UPDATE;

  SELECT * INTO _resultado
  FROM public.visita_execucoes
  WHERE agendamento_id = _agenda.id
  FOR UPDATE;
  _ja_concluida := FOUND AND _resultado.status = 'concluida';

  -- Repetir a confirmação (duplo toque/retry de rede) é idempotente: nunca
  -- tenta mover o lead uma segunda vez.
  IF _ja_concluida THEN
    RETURN _resultado;
  END IF;

  IF _agenda.status NOT IN (
    'agendado'::public.agendamento_status,
    'confirmado'::public.agendamento_status
  ) THEN
    RAISE EXCEPTION 'somente visita agendada ou confirmada pode ser executada'
      USING ERRCODE = '22023';
  END IF;

  IF p_concluir AND p_proxima_etapa IS NULL THEN
    RAISE EXCEPTION 'próxima etapa é obrigatória ao concluir'
      USING ERRCODE = '22023';
  END IF;

  IF p_concluir
     AND p_proxima_etapa = 'aguardando_retorno'::public.lead_status
     AND (p_proximo_followup IS NULL OR p_proximo_followup <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visita_execucoes AS execucao (
    agendamento_id,
    lead_id,
    corretor_id,
    checklist,
    nota_transcrita,
    observacoes,
    status,
    proxima_etapa,
    proxima_acao,
    proximo_followup,
    concluida_em,
    criada_por,
    atualizada_por
  ) VALUES (
    _agenda.id,
    _agenda.lead_id,
    _agenda.corretor_id,
    _checklist,
    NULLIF(btrim(p_nota_transcrita), ''),
    NULLIF(btrim(p_observacoes), ''),
    CASE WHEN p_concluir THEN 'concluida' ELSE 'em_andamento' END,
    CASE WHEN p_concluir THEN p_proxima_etapa ELSE NULL END,
    CASE WHEN p_concluir THEN NULLIF(btrim(p_proxima_acao), '') ELSE NULL END,
    CASE WHEN p_concluir THEN p_proximo_followup ELSE NULL END,
    CASE WHEN p_concluir THEN now() ELSE NULL END,
    _uid,
    _uid
  )
  ON CONFLICT (agendamento_id) DO UPDATE
  SET checklist = EXCLUDED.checklist,
      nota_transcrita = EXCLUDED.nota_transcrita,
      observacoes = EXCLUDED.observacoes,
      status = CASE
        WHEN execucao.status = 'concluida' THEN execucao.status
        ELSE EXCLUDED.status
      END,
      proxima_etapa = COALESCE(execucao.proxima_etapa, EXCLUDED.proxima_etapa),
      proxima_acao = COALESCE(execucao.proxima_acao, EXCLUDED.proxima_acao),
      proximo_followup = COALESCE(execucao.proximo_followup, EXCLUDED.proximo_followup),
      concluida_em = COALESCE(execucao.concluida_em, EXCLUDED.concluida_em),
      atualizada_por = _uid,
      updated_at = now()
  RETURNING execucao.* INTO _resultado;

  IF p_concluir AND _agenda.status <> 'realizado'::public.agendamento_status THEN
    UPDATE public.agendamentos
    SET status = 'realizado'::public.agendamento_status,
        realizado_em = now(),
        updated_at = now()
    WHERE id = _agenda.id;
  END IF;

  IF p_concluir AND _lead.status IS DISTINCT FROM p_proxima_etapa THEN
    PERFORM public.transicionar_lead(
      _agenda.lead_id,
      p_proxima_etapa,
      'Conclusão registrada no Modo Visita',
      NULLIF(btrim(p_proxima_acao), ''),
      p_proximo_followup
    );
  END IF;

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz
) TO authenticated;

COMMENT ON TABLE public.visita_execucoes IS
  'Checklist e notas revisadas do Modo Visita; áudio bruto nunca é persistido.';
COMMENT ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz
) IS
  'Salva a visita e, ao concluir, atualiza agenda e lead atomicamente com autorização de carteira.';

-- ============================================================================
-- [15/18] 20260711134000_fechamento_sinais_calibrados.sql
-- ============================================================================

-- Sinais de fechamento calibrados por resultados comerciais observados.
--
-- A taxa historica abaixo nunca e apresentada como probabilidade individual.
-- Ela mede a conversao observada, em ate 90 dias, dos leads que entraram em
-- cada etapa. Somente vendas aprovadas contam como conversao. Quando a carteira
-- autorizada nao oferece ao menos 30 observacoes maduras, o contrato devolve um
-- indice heuristico explicitamente identificado como tal.

CREATE INDEX IF NOT EXISTS idx_vendas_aprovadas_lead_calibracao
  ON public.vendas (lead_id, aprovado_em)
  WHERE lead_id IS NOT NULL
    AND status_venda = 'aprovada'::public.status_venda;

CREATE OR REPLACE FUNCTION public.fechamento_sinais_v1(
  _limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 50);
  _result jsonb;
BEGIN
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  WITH etapas_radar(status, indice_base, rotulo) AS (
    VALUES
      ('analise_credito'::public.lead_status, 72, 'Em analise de credito'::text),
      ('proposta_enviada'::public.lead_status, 60, 'Proposta enviada'::text),
      ('visita_realizada'::public.lead_status, 48, 'Visita realizada'::text),
      ('agendado'::public.lead_status, 35, 'Visita agendada'::text),
      ('qualificado'::public.lead_status, 24, 'Qualificado'::text),
      ('aguardando_retorno'::public.lead_status, 16, 'Aguardando retorno'::text),
      ('em_atendimento'::public.lead_status, 14, 'Em atendimento'::text)
  ), entradas_coorte AS (
    -- Uma observacao por lead/etapa. A janela contem 365 dias completos de
    -- coortes, cada uma ja acompanhada durante todo o horizonte de 90 dias.
    SELECT
      t.lead_id,
      t.para_status AS status,
      min(t.created_at) AS entrada_em
    FROM public.lead_status_transitions AS t
    JOIN etapas_radar AS e ON e.status = t.para_status
    WHERE t.created_at >= now() - interval '455 days'
      AND t.created_at < now() - interval '90 days'
    GROUP BY t.lead_id, t.para_status
  ), entradas_maduras AS (
    -- Autoriza uma vez por lead/etapa, depois da deduplicacao do historico.
    SELECT e.*
    FROM entradas_coorte AS e
    JOIN public.leads AS historico ON historico.id = e.lead_id
    WHERE historico.deleted_at IS NULL
      AND public.pode_acessar_lead(_caller, historico.id)
  ), amostra_por_etapa AS (
    SELECT
      e.status,
      count(*)::integer AS amostra,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM public.vendas AS v
          WHERE v.lead_id = e.lead_id
            AND v.status_venda = 'aprovada'::public.status_venda
            AND v.aprovado_em >= e.entrada_em
            AND v.aprovado_em <= e.entrada_em + interval '90 days'
        )
      )::integer AS vendas_aprovadas
    FROM entradas_maduras AS e
    GROUP BY e.status
  ), leads_ativos AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.status,
      l.temperatura,
      l.ultima_interacao,
      l.proximo_followup,
      l.projeto_nome,
      e.indice_base,
      e.rotulo,
      COALESCE(a.amostra, 0) AS amostra,
      COALESCE(a.vendas_aprovadas, 0) AS vendas_aprovadas,
      COALESCE(d.pendentes, 0) AS documentos_pendentes
    FROM public.leads AS l
    JOIN etapas_radar AS e ON e.status = l.status
    LEFT JOIN amostra_por_etapa AS a ON a.status = l.status
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS pendentes
      FROM public.documentacoes AS d
      WHERE d.lead_id = l.id
        AND d.status IN ('pendente', 'reprovado')
    ) AS d ON true
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND public.pode_acessar_lead(_caller, l.id)
  ), fatores AS (
    SELECT
      l.*,
      (
        CASE l.temperatura::text
          WHEN 'quente' THEN 15
          WHEN 'frio' THEN -12
          ELSE 0
        END
        + CASE
            WHEN l.ultima_interacao IS NULL THEN -10
            WHEN l.ultima_interacao >= now() - interval '2 days' THEN 10
            WHEN l.ultima_interacao < now() - interval '14 days' THEN -18
            WHEN l.ultima_interacao < now() - interval '7 days' THEN -8
            ELSE 0
          END
        + CASE
            WHEN l.proximo_followup >= now() THEN 5
            ELSE 0
          END
      )::integer AS ajuste_engajamento,
      array_remove(ARRAY[
        l.rotulo,
        CASE l.temperatura::text
          WHEN 'quente' THEN 'Temperatura quente'
          WHEN 'frio' THEN 'Temperatura fria'
          ELSE NULL
        END,
        CASE
          WHEN l.ultima_interacao IS NULL THEN 'Sem interacao registrada'
          WHEN l.ultima_interacao >= now() - interval '2 days' THEN 'Interacao nos ultimos 2 dias'
          WHEN l.ultima_interacao < now() - interval '14 days'
            THEN floor(extract(epoch FROM (now() - l.ultima_interacao)) / 86400)::integer
              || ' dias sem interacao'
          WHEN l.ultima_interacao < now() - interval '7 days'
            THEN floor(extract(epoch FROM (now() - l.ultima_interacao)) / 86400)::integer
              || ' dias sem interacao'
          ELSE NULL
        END,
        CASE
          WHEN l.proximo_followup >= now() THEN 'Follow-up programado'
          ELSE NULL
        END
      ], NULL)::text[] AS fatores
    FROM leads_ativos AS l
  ), calculados AS (
    SELECT
      f.*,
      CASE
        WHEN f.amostra >= 30 THEN LEAST(100, GREATEST(0, round(
          (100.0 * f.vendas_aprovadas / NULLIF(f.amostra, 0))
          + (f.ajuste_engajamento * 0.5)
        )::integer))
        ELSE LEAST(100, GREATEST(0, f.indice_base + f.ajuste_engajamento))
      END AS indice,
      CASE
        WHEN f.amostra >= 30 THEN 'historico_calibrado'
        ELSE 'heuristico'
      END AS metodo,
      CASE
        WHEN f.amostra >= 30
          THEN round(100.0 * f.vendas_aprovadas / NULLIF(f.amostra, 0), 1)
        ELSE NULL
      END AS taxa_historica_pct
    FROM fatores AS f
  ), ordenados AS (
    SELECT
      c.*,
      CASE
        WHEN c.indice >= 55 THEN 'alta'
        WHEN c.indice >= 30 THEN 'media'
        ELSE 'baixa'
      END AS nivel
    FROM calculados AS c
  ), visiveis AS (
    SELECT o.*
    FROM ordenados AS o
    ORDER BY o.indice DESC, o.ultima_interacao DESC NULLS LAST, o.id DESC
    LIMIT _take
  )
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'nome', v.nome,
            'telefone', v.telefone,
            'status', v.status,
            'temperatura', v.temperatura,
            'ultima_interacao', v.ultima_interacao,
            'proximo_followup', v.proximo_followup,
            'projeto_nome', v.projeto_nome,
            'indice', v.indice,
            'nivel', v.nivel,
            'metodo', v.metodo,
            'taxa_historica_pct', v.taxa_historica_pct,
            'amostra_etapa', v.amostra,
            'vendas_aprovadas_etapa', v.vendas_aprovadas,
            'documentos_pendentes', v.documentos_pendentes,
            'fatores', to_jsonb(v.fatores)
          )
          ORDER BY v.indice DESC, v.ultima_interacao DESC NULLS LAST, v.id DESC
        )
        FROM visiveis AS v
      ),
      '[]'::jsonb
    ),
    'total_count', (SELECT count(*) FROM ordenados),
    'contagens', jsonb_build_object(
      'alta', (SELECT count(*) FROM ordenados WHERE nivel = 'alta'),
      'media', (SELECT count(*) FROM ordenados WHERE nivel = 'media'),
      'baixa', (SELECT count(*) FROM ordenados WHERE nivel = 'baixa')
    ),
    'limit', _take,
    'amostra_minima', 30,
    'janela_coorte_dias', 365,
    'horizonte_conversao_dias', 90,
    'indice_semantica', 'sinal_de_priorizacao_nao_probabilidade'
  )
  INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.fechamento_sinais_v1(integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fechamento_sinais_v1(integer)
  TO authenticated;

COMMENT ON FUNCTION public.fechamento_sinais_v1(integer) IS
  'Retorna ate 50 sinais de fechamento da carteira autorizada. Usa somente vendas aprovadas para taxa historica; indice e sinal de priorizacao, nunca probabilidade individual.';

-- ============================================================================
-- [16/18] 20260711135000_projetos_vitrine_rich_media.sql
-- ============================================================================

-- Conteúdo comercial rico para a Vitrine. Campos são opcionais para rollout
-- aditivo; a aplicação continua exibindo fallback quando o catálogo antigo não
-- possui mídia ou comissão configurada.

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS capa_url text,
  ADD COLUMN IF NOT EXISTS galeria_urls text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS percentual_comissao numeric(6,3),
  ADD COLUMN IF NOT EXISTS disponibilidade_resumo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_capa_url_tamanho_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_capa_url_tamanho_ck
      CHECK (capa_url IS NULL OR char_length(capa_url) <= 2048);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_galeria_urls_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_galeria_urls_ck
      CHECK (cardinality(galeria_urls) <= 12);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_percentual_comissao_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_percentual_comissao_ck
      CHECK (percentual_comissao IS NULL OR percentual_comissao BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_disponibilidade_resumo_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_disponibilidade_resumo_ck
      CHECK (
        disponibilidade_resumo IS NULL
        OR char_length(btrim(disponibilidade_resumo)) BETWEEN 1 AND 160
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.projetos.capa_url IS
  'Imagem principal HTTPS do empreendimento; publicação externa ainda passa pela allowlist server-side.';
COMMENT ON COLUMN public.projetos.galeria_urls IS
  'Até 12 imagens; publicação externa ainda passa pela allowlist server-side.';
COMMENT ON COLUMN public.projetos.percentual_comissao IS
  'Percentual comercial interno exibido somente no CRM autenticado.';
COMMENT ON COLUMN public.projetos.disponibilidade_resumo IS
  'Resumo curto e revisado da disponibilidade atual.';

CREATE OR REPLACE FUNCTION public.obter_vitrine_publica(_token_hash text)
RETURNS TABLE (
  expira_em timestamptz,
  projetos jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    vl.expira_em,
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'construtora', p.construtora,
        'bairro', p.bairro,
        'cidade', p.cidade,
        'zona', p.zona_smq,
        'dorms_min', p.dorms_min,
        'dorms_max', p.dorms_max,
        'metragem_min', p.metragem_min,
        'metragem_max', p.metragem_max,
        'preco_a_partir', p.preco_a_partir,
        'sob_consulta', p.sob_consulta,
        'status_preco', p.status_preco,
        'status_entrega', p.status_entrega,
        'mes_entrega', p.mes_entrega,
        'ano_entrega', p.ano_entrega,
        'renda_minima', p.renda_minima,
        'disponibilidade_resumo', p.disponibilidade_resumo,
        'capa_url', p.capa_url,
        'galeria_urls', p.galeria_urls,
        'diferenciais', p.diferenciais,
        'book_url', p.book_url,
        'tabela_precos_url', p.tabela_precos_url
      ) ORDER BY vlp.ordem
    ) AS projetos
  FROM public.vitrine_links vl
  JOIN public.vitrine_link_projetos vlp ON vlp.link_id = vl.id
  JOIN public.projetos p ON p.id = vlp.projeto_id
  WHERE vl.token_hash = lower(_token_hash)
    AND lower(_token_hash) ~ '^[0-9a-f]{64}$'
    AND vl.revogado_em IS NULL
    AND vl.expira_em > now()
    AND p.ativo = true
    AND p.deleted_at IS NULL
  GROUP BY vl.id;
$$;

REVOKE ALL ON FUNCTION public.obter_vitrine_publica(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_vitrine_publica(text)
  TO service_role;

-- ============================================================================
-- [17/18] 20260711136000_projetos_webhook_token_lockdown.sql
-- ============================================================================

-- Privilégios de coluna são aditivos: revogar apenas
-- SELECT(webhook_token)/UPDATE(webhook_token) não neutraliza o antigo grant na
-- tabela inteira. Substituímos os grants por allowlists sem o segredo.

REVOKE SELECT, INSERT, UPDATE ON TABLE public.projetos FROM authenticated;

GRANT SELECT (
  id, nome, slug, construtora, cidade, regiao, bairro, endereco, logradouro,
  numero, observacoes, ativo, metragem_min, metragem_max, dorms_min, dorms_max,
  suites, tipologia, tipo_extra, vagas, vagas_min, vagas_max, vagas_observacao,
  preco_a_partir, preco_inicial, sob_consulta, status_entrega, mes_entrega,
  ano_entrega, fonte, zona_smq, perfil_ideal, argumentos_venda, diferenciais,
  renda_minima, status_preco, entrega_status, book_url, tabela_precos_url, lat,
  lng, created_at, updated_at, criado_por, deleted_at, capa_url, galeria_urls,
  percentual_comissao, disponibilidade_resumo
) ON TABLE public.projetos TO authenticated;

GRANT INSERT (
  id, nome, slug, construtora, cidade, regiao, bairro, endereco, logradouro,
  numero, observacoes, ativo, metragem_min, metragem_max, dorms_min, dorms_max,
  suites, tipologia, tipo_extra, vagas, vagas_min, vagas_max, vagas_observacao,
  preco_a_partir, preco_inicial, sob_consulta, status_entrega, mes_entrega,
  ano_entrega, fonte, zona_smq, perfil_ideal, argumentos_venda, diferenciais,
  renda_minima, status_preco, entrega_status, book_url, tabela_precos_url, lat,
  lng, created_at, updated_at, criado_por, deleted_at, capa_url, galeria_urls,
  percentual_comissao, disponibilidade_resumo
) ON TABLE public.projetos TO authenticated;

GRANT UPDATE (
  nome, slug, construtora, cidade, regiao, bairro, endereco, logradouro, numero,
  observacoes, ativo, metragem_min, metragem_max, dorms_min, dorms_max, suites,
  tipologia, tipo_extra, vagas, vagas_min, vagas_max, vagas_observacao,
  preco_a_partir, preco_inicial, sob_consulta, status_entrega, mes_entrega,
  ano_entrega, fonte, zona_smq, perfil_ideal, argumentos_venda, diferenciais,
  renda_minima, status_preco, entrega_status, book_url, tabela_precos_url, lat,
  lng, updated_at, deleted_at, capa_url, galeria_urls, percentual_comissao,
  disponibilidade_resumo
) ON TABLE public.projetos TO authenticated;

COMMENT ON COLUMN public.projetos.webhook_token IS
  'Segredo server-side: leitura/regeneração somente pelas RPCs de gestão; nunca por SELECT do browser.';

-- ============================================================================
-- [18/18] 20260711137000_vitrine_rollout_upgrade.sql
-- ============================================================================

-- Finalizador aditivo da Vitrine.
--
-- Esta migration existe para ambientes em que uma revisão intermediária das
-- migrations 132/135 já foi registrada. Ela também é segura no reset limpo:
-- todas as colunas são garantidas com IF NOT EXISTS, os dados são normalizados
-- antes dos NOT NULL/checks e as funções públicas são substituídas pela versão
-- final fail-closed.

ALTER TABLE public.vitrine_links
  ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz,
  ADD COLUMN IF NOT EXISTS total_aberturas integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_eventos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_requisicoes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_janela_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS limite_janela_requisicoes integer DEFAULT 0;

ALTER TABLE public.vitrine_link_eventos
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS capa_url text,
  ADD COLUMN IF NOT EXISTS galeria_urls text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS percentual_comissao numeric(6,3),
  ADD COLUMN IF NOT EXISTS disponibilidade_resumo text;

-- Reconcilia os contadores com a telemetria que já existe. Os tetos são
-- saturados em vez de descartar eventos históricos: links acima do limite
-- ficam imediatamente bloqueados para novos eventos.
WITH contagens AS (
  SELECT
    evento.link_id,
    count(*)::integer AS total_eventos,
    count(*) FILTER (WHERE evento.tipo = 'abertura')::integer AS total_aberturas
  FROM public.vitrine_link_eventos AS evento
  GROUP BY evento.link_id
)
UPDATE public.vitrine_links AS link
SET
  total_aberturas = GREATEST(
    COALESCE(link.total_aberturas, 0),
    COALESCE(contagens.total_aberturas, 0),
    0
  ),
  total_eventos = LEAST(
    1000,
    GREATEST(
      COALESCE(link.total_eventos, 0),
      COALESCE(contagens.total_eventos, 0),
      0
    )
  ),
  total_requisicoes = LEAST(20000, GREATEST(COALESCE(link.total_requisicoes, 0), 0)),
  limite_janela_inicio = CASE
    WHEN link.limite_janela_inicio IS NULL
      OR link.limite_janela_inicio <= clock_timestamp() - interval '1 minute'
      THEN NULL
    ELSE link.limite_janela_inicio
  END,
  limite_janela_requisicoes = CASE
    WHEN link.limite_janela_inicio IS NULL
      OR link.limite_janela_inicio <= clock_timestamp() - interval '1 minute'
      THEN 0
    ELSE LEAST(60, GREATEST(COALESCE(link.limite_janela_requisicoes, 0), 0))
  END
FROM contagens
WHERE contagens.link_id = link.id;

-- Links sem eventos não aparecem no CTE acima, mas ainda podem vir de uma
-- revisão intermediária com NULL ou valores fora dos limites.
UPDATE public.vitrine_links AS link
SET
  total_aberturas = GREATEST(COALESCE(link.total_aberturas, 0), 0),
  total_eventos = LEAST(1000, GREATEST(COALESCE(link.total_eventos, 0), 0)),
  total_requisicoes = LEAST(20000, GREATEST(COALESCE(link.total_requisicoes, 0), 0)),
  limite_janela_inicio = CASE
    WHEN link.limite_janela_inicio IS NULL
      OR link.limite_janela_inicio <= clock_timestamp() - interval '1 minute'
      THEN NULL
    ELSE link.limite_janela_inicio
  END,
  limite_janela_requisicoes = CASE
    WHEN link.limite_janela_inicio IS NULL
      OR link.limite_janela_inicio <= clock_timestamp() - interval '1 minute'
      THEN 0
    ELSE LEAST(60, GREATEST(COALESCE(link.limite_janela_requisicoes, 0), 0))
  END;

ALTER TABLE public.vitrine_links
  ALTER COLUMN total_aberturas SET DEFAULT 0,
  ALTER COLUMN total_aberturas SET NOT NULL,
  ALTER COLUMN total_eventos SET DEFAULT 0,
  ALTER COLUMN total_eventos SET NOT NULL,
  ALTER COLUMN total_requisicoes SET DEFAULT 0,
  ALTER COLUMN total_requisicoes SET NOT NULL,
  ALTER COLUMN limite_janela_requisicoes SET DEFAULT 0,
  ALTER COLUMN limite_janela_requisicoes SET NOT NULL;

-- Chaves ausentes ou repetidas podem existir em uma revisão que criou a
-- coluna antes do índice. Cada evento legado recebe uma chave própria.
UPDATE public.vitrine_link_eventos
SET idempotency_key = gen_random_uuid()
WHERE idempotency_key IS NULL;

WITH repetidas AS (
  SELECT
    evento.id,
    row_number() OVER (
      PARTITION BY evento.link_id, evento.idempotency_key
      ORDER BY evento.id
    ) AS ocorrencia
  FROM public.vitrine_link_eventos AS evento
)
UPDATE public.vitrine_link_eventos AS evento
SET idempotency_key = gen_random_uuid()
FROM repetidas
WHERE repetidas.id = evento.id
  AND repetidas.ocorrencia > 1;

ALTER TABLE public.vitrine_link_eventos
  ALTER COLUMN idempotency_key SET NOT NULL;

-- Um nome novo evita confiar em um índice homônimo, porém incompleto, de uma
-- revisão intermediária. O ON CONFLICT da função final pode usar qualquer um
-- dos índices únicos equivalentes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vitrine_eventos_idempotencia_rollout
  ON public.vitrine_link_eventos (link_id, idempotency_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_link_eventos'::regclass
      AND conname = 'uq_vitrine_eventos_idempotencia_rollout'
  ) THEN
    ALTER TABLE public.vitrine_link_eventos
      ADD CONSTRAINT uq_vitrine_eventos_idempotencia_rollout
      UNIQUE USING INDEX uq_vitrine_eventos_idempotencia_rollout;
  END IF;
END;
$$;

-- Normaliza a galeria sem apagar projetos: NULL vira lista vazia; itens nulos,
-- vazios ou maiores que 2 KiB são ignorados; espaços externos são removidos e
-- a ordem original dos primeiros doze itens válidos é preservada.
UPDATE public.projetos AS projeto
SET galeria_urls = COALESCE(
  (
    SELECT array_agg(normalizada.url ORDER BY normalizada.ordem)
    FROM (
      SELECT btrim(item.url) AS url, item.ordem
      FROM unnest(COALESCE(projeto.galeria_urls, '{}'::text[]))
        WITH ORDINALITY AS item(url, ordem)
      WHERE item.url IS NOT NULL
        AND char_length(btrim(item.url)) BETWEEN 1 AND 2048
      ORDER BY item.ordem
      LIMIT 12
    ) AS normalizada
  ),
  '{}'::text[]
);

ALTER TABLE public.projetos
  ALTER COLUMN galeria_urls SET DEFAULT '{}'::text[],
  ALTER COLUMN galeria_urls SET NOT NULL;

CREATE OR REPLACE FUNCTION public.vitrine_galeria_urls_validas(_urls text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT
    _urls IS NOT NULL
    AND cardinality(_urls) <= 12
    AND array_position(_urls, NULL) IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(_urls) AS item(url)
      WHERE item.url <> btrim(item.url)
        OR char_length(item.url) NOT BETWEEN 1 AND 2048
    );
$$;

REVOKE ALL ON FUNCTION public.vitrine_galeria_urls_validas(text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vitrine_galeria_urls_validas(text[])
  TO authenticated, service_role;

-- Constraints com nomes exclusivos deste finalizador não dependem dos nomes
-- automáticos (ou do conteúdo) usados por uma revisão anterior.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_links'::regclass
      AND conname = 'vitrine_links_aberturas_rollout_ck'
  ) THEN
    ALTER TABLE public.vitrine_links
      ADD CONSTRAINT vitrine_links_aberturas_rollout_ck
      CHECK (total_aberturas >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_links'::regclass
      AND conname = 'vitrine_links_eventos_rollout_ck'
  ) THEN
    ALTER TABLE public.vitrine_links
      ADD CONSTRAINT vitrine_links_eventos_rollout_ck
      CHECK (total_eventos BETWEEN 0 AND 1000) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_links'::regclass
      AND conname = 'vitrine_links_requisicoes_rollout_ck'
  ) THEN
    ALTER TABLE public.vitrine_links
      ADD CONSTRAINT vitrine_links_requisicoes_rollout_ck
      CHECK (total_requisicoes BETWEEN 0 AND 20000) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vitrine_links'::regclass
      AND conname = 'vitrine_links_janela_rollout_ck'
  ) THEN
    ALTER TABLE public.vitrine_links
      ADD CONSTRAINT vitrine_links_janela_rollout_ck
      CHECK (
        limite_janela_requisicoes BETWEEN 0 AND 60
        AND (limite_janela_inicio IS NOT NULL OR limite_janela_requisicoes = 0)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_galeria_urls_rollout_ck'
  ) THEN
    ALTER TABLE public.projetos
      ADD CONSTRAINT projetos_galeria_urls_rollout_ck
      CHECK (public.vitrine_galeria_urls_validas(galeria_urls)) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.vitrine_links
  VALIDATE CONSTRAINT vitrine_links_aberturas_rollout_ck;
ALTER TABLE public.vitrine_links
  VALIDATE CONSTRAINT vitrine_links_eventos_rollout_ck;
ALTER TABLE public.vitrine_links
  VALIDATE CONSTRAINT vitrine_links_requisicoes_rollout_ck;
ALTER TABLE public.vitrine_links
  VALIDATE CONSTRAINT vitrine_links_janela_rollout_ck;
ALTER TABLE public.projetos
  VALIDATE CONSTRAINT projetos_galeria_urls_rollout_ck;

-- Limite distribuído aplicado antes de servir payload ou registrar evento.
CREATE OR REPLACE FUNCTION public.consumir_vitrine_requisicao(
  _token_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link public.vitrine_links%ROWTYPE;
  _agora timestamptz := clock_timestamp();
  _inicio timestamptz;
  _quantidade integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$' THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO _link
  FROM public.vitrine_links
  WHERE token_hash = lower(_token_hash)
    AND revogado_em IS NULL
    AND expira_em > _agora
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF _link.total_requisicoes >= 20000 THEN RETURN 'exhausted'; END IF;

  IF _link.limite_janela_inicio IS NULL
     OR _link.limite_janela_inicio <= _agora - interval '1 minute' THEN
    _inicio := _agora;
    _quantidade := 1;
  ELSE
    _inicio := _link.limite_janela_inicio;
    _quantidade := _link.limite_janela_requisicoes + 1;
  END IF;

  IF _quantidade > 60 THEN RETURN 'rate_limited'; END IF;

  UPDATE public.vitrine_links
  SET limite_janela_inicio = _inicio,
      limite_janela_requisicoes = _quantidade,
      total_requisicoes = total_requisicoes + 1
  WHERE id = _link.id;

  RETURN 'allowed';
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_vitrine_requisicao(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_vitrine_requisicao(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_vitrine_evento(
  _token_hash text,
  _idempotency_key uuid,
  _tipo public.vitrine_evento_tipo,
  _projeto_id uuid DEFAULT NULL,
  _cta_tipo text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link_id uuid;
  _total_eventos integer;
  _inseridos integer;
BEGIN
  IF _token_hash IS NULL OR lower(_token_hash) !~ '^[0-9a-f]{64}$'
     OR _idempotency_key IS NULL OR _tipo IS NULL THEN
    RETURN false;
  END IF;

  SELECT link.id, link.total_eventos
  INTO _link_id, _total_eventos
  FROM public.vitrine_links AS link
  WHERE link.token_hash = lower(_token_hash)
    AND link.revogado_em IS NULL
    AND link.expira_em > clock_timestamp()
  FOR UPDATE;

  IF _link_id IS NULL THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vitrine_link_eventos AS evento
    WHERE evento.link_id = _link_id
      AND evento.idempotency_key = _idempotency_key
  ) THEN
    RETURN true;
  END IF;

  IF _total_eventos >= 1000 THEN RETURN false; END IF;

  IF (
    SELECT count(*)
    FROM public.vitrine_link_eventos AS evento
    WHERE evento.link_id = _link_id
      AND evento.created_at >= clock_timestamp() - interval '1 minute'
  ) >= 120 THEN
    RETURN false;
  END IF;

  IF _tipo = 'abertura' THEN
    IF _projeto_id IS NOT NULL OR _cta_tipo IS NOT NULL THEN RETURN false; END IF;
  ELSE
    IF _projeto_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.vitrine_link_projetos AS item
      WHERE item.link_id = _link_id
        AND item.projeto_id = _projeto_id
    ) THEN
      RETURN false;
    END IF;

    IF _tipo = 'projeto_visto' AND _cta_tipo IS NOT NULL THEN RETURN false; END IF;
    IF _tipo = 'cta_clicado'
       AND _cta_tipo NOT IN ('book', 'tabela_precos', 'contato') THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.vitrine_link_eventos (
    link_id, projeto_id, tipo, cta_tipo, idempotency_key
  ) VALUES (
    _link_id, _projeto_id, _tipo, _cta_tipo, _idempotency_key
  )
  ON CONFLICT (link_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS _inseridos = ROW_COUNT;

  IF _inseridos = 0 THEN RETURN true; END IF;

  UPDATE public.vitrine_links
  SET
    total_eventos = total_eventos + 1,
    ultimo_acesso_em = CASE WHEN _tipo = 'abertura' THEN clock_timestamp()
      ELSE ultimo_acesso_em END,
    total_aberturas = total_aberturas
      + CASE WHEN _tipo = 'abertura' THEN 1 ELSE 0 END
  WHERE id = _link_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_vitrine_evento(
  text, uuid, public.vitrine_evento_tipo, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_vitrine_evento(
  text, uuid, public.vitrine_evento_tipo, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.limpar_vitrine_eventos_expirados(
  _antes timestamptz DEFAULT now() - interval '90 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _removidos integer;
BEGIN
  IF _antes > now() - interval '30 days' THEN
    RAISE EXCEPTION 'janela minima de retencao e 30 dias' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.vitrine_link_eventos AS evento
  USING public.vitrine_links AS link
  WHERE evento.link_id = link.id
    AND evento.created_at < _antes
    AND (link.revogado_em IS NOT NULL OR link.expira_em < now());
  GET DIAGNOSTICS _removidos = ROW_COUNT;

  RETURN _removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.consumir_vitrine_requisicao(text) IS
  'Reserva distribuída de requisição pública; somente o backend service_role executa.';
COMMENT ON FUNCTION public.registrar_vitrine_evento(
  text, uuid, public.vitrine_evento_tipo, uuid, text
) IS 'Evento público idempotente, limitado e sem PII; somente service_role executa.';
COMMENT ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamptz) IS
  'Retenção de telemetria de links expirados/revogados; somente service_role executa.';
