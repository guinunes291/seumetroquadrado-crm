-- ============================================================================
-- Link de documentação do cliente
-- ============================================================================
-- Pedido do dono (15/10/2026): "um link deste [o de agendamento] para
-- documentação, onde o cliente consiga anexar a documentação através de um
-- link, e já vincular no sistema, criar o lead, com todos os dados".
-- Decisões: dados básicos (nome, telefone, e-mail, CPF e o perfil que monta a
-- lista de documentos); o lead novo nasce em Em atendimento e a regra da pasta
-- (3 documentos → Análise de crédito) segue valendo; o cliente manda aos
-- poucos.
--
-- DOIS LINKS.
--   * /documentos/<slug> — o link FIXO do corretor (como o de agendamento),
--     para mandar a qualquer cliente. O cliente informa os dados, o sistema
--     acha ou cria o lead (portas do registro mãe) e abre a pasta dele.
--   * /pasta/<token> — o link PESSOAL da pasta de UM lead. É onde o cliente
--     anexa os arquivos, hoje ou em outro dia (vale 30 dias). Sai do link fixo
--     depois do cadastro, ou o corretor manda pela aba Documentação de um lead
--     que já existe.
--
-- OS ARQUIVOS vão para o mesmo lugar dos do corretor: bucket privado
-- `documentacao`, uma versão imutável por envio (documentacao_versoes) e o
-- item do checklist (documentacoes) como "recebido". A versão do cliente não
-- tem usuário: enviado_por fica nulo e pelo_cliente = true. O cliente nunca
-- lê arquivo de volta — só vê a lista com o andamento de cada item.
--
-- A ETAPA. O cliente que preenche o cadastro ou manda documento RESPONDEU:
-- lead em prospecção (novo, aguardando_*) vai para Em atendimento pelo mesmo
-- caminho de sistema do link de agendamento (atualização sob
-- app.transicionar_lead, evento transicao_lead com origem 'resposta'), com a
-- tarefa "Conferir os documentos" como próximo passo. Como as outras entradas
-- de sistema (SDR, serviço), não passa pelo teto dos 65: o corretor não está
-- na tela para fazer a troca, e a regra da pasta tira o lead de lá quando o
-- 3º documento chega (trigger pasta_montada_after_doc, sem mudança).
--
-- SEGURANÇA. Tabelas fechadas para anon/authenticated; a página pública passa
-- pelo servidor (service_role) e só pelas funções estreitas. Slug e token são
-- aleatórios (96 e 192 bits) e ficam em claro para o corretor copiar a
-- qualquer hora — são feitos para circular no WhatsApp. O token só permite
-- ENVIAR arquivo e ver a lista de itens (sem nome do cliente, sem arquivo).
-- Limites por link e por pasta; o servidor confere o conteúdo do arquivo
-- (assinatura de PDF/JPEG/PNG/WebP), não só o tipo declarado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documentacao_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  revogado_em timestamptz,
  limite_janela_inicio timestamptz,
  limite_janela_requisicoes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentacao_links_slug_ck CHECK (slug ~ '^[A-Za-z0-9_-]{16}$'),
  CONSTRAINT documentacao_links_limite_ck CHECK (limite_janela_requisicoes BETWEEN 0 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_links_slug
  ON public.documentacao_links (slug);
-- Um link fixo ativo por corretor: trocar o link revoga o anterior.
CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_links_corretor_ativo
  ON public.documentacao_links (corretor_id)
  WHERE revogado_em IS NULL;

-- A pasta pessoal de um lead. Sem PII: os dados do cliente ficam no lead (com
-- a RLS de sempre); aqui só o vínculo, as respostas que montam a lista, a
-- validade e os contadores.
CREATE TABLE IF NOT EXISTS public.documentacao_pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Veio do link fixo (null = o corretor gerou pela aba Documentação).
  link_id uuid REFERENCES public.documentacao_links(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token text NOT NULL,
  perfil text,
  casado boolean,
  usa_fgts boolean,
  declara_ir boolean,
  expira_em timestamptz NOT NULL,
  revogado_em timestamptz,
  ultimo_envio_em timestamptz,
  ultimo_aviso_em timestamptz,
  limite_janela_inicio timestamptz,
  limite_janela_requisicoes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentacao_pastas_token_ck CHECK (token ~ '^[A-Za-z0-9_-]{32}$'),
  CONSTRAINT documentacao_pastas_perfil_ck CHECK (
    perfil IS NULL OR perfil IN ('clt', 'autonomo', 'empresario', 'aposentado')
  ),
  CONSTRAINT documentacao_pastas_limite_ck CHECK (limite_janela_requisicoes BETWEEN 0 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_pastas_token
  ON public.documentacao_pastas (token);
-- Uma pasta ativa por lead: o cliente que volta pelo link fixo cai na mesma.
CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_pastas_lead_ativa
  ON public.documentacao_pastas (lead_id)
  WHERE revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_documentacao_pastas_link_created
  ON public.documentacao_pastas (link_id, created_at DESC)
  WHERE link_id IS NOT NULL;

ALTER TABLE public.documentacao_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentacao_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentacao_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.documentacao_pastas FORCE ROW LEVEL SECURITY;

-- O navegador nunca lê estas tabelas: o corretor usa as RPCs abaixo e a
-- página pública passa pelo servidor.
REVOKE ALL ON public.documentacao_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.documentacao_pastas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.documentacao_links TO service_role;
GRANT ALL ON public.documentacao_pastas TO service_role;

-- A versão enviada pelo cliente não tem usuário. A trilha continua: a versão
-- aponta para a pasta e diz que veio do cliente.
ALTER TABLE public.documentacao_versoes
  ALTER COLUMN enviado_por DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS pelo_cliente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pasta_id uuid REFERENCES public.documentacao_pastas(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'documentacao_versoes_autor_ck'
                    AND conrelid = 'public.documentacao_versoes'::regclass) THEN
    ALTER TABLE public.documentacao_versoes
      ADD CONSTRAINT documentacao_versoes_autor_ck
      CHECK (enviado_por IS NOT NULL OR pelo_cliente);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_documentacao_versoes_pasta_created
  ON public.documentacao_versoes (pasta_id, created_at DESC)
  WHERE pasta_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Peças internas
-- ---------------------------------------------------------------------------

-- 32 caracteres base64url = 192 bits.
CREATE OR REPLACE FUNCTION public._documentacao_novo_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, public
AS $$
  SELECT translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
$$;

-- Itens que o cliente vê e pode enviar. A carta de aprovação de crédito é do
-- banco e o "não classificado" é a fila de revisão do corretor.
CREATE OR REPLACE FUNCTION public._documentacao_tipo_do_cliente(_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(_tipo, '') ~ '^[a-z][a-z0-9_]{1,39}$'
     AND _tipo NOT IN ('aprovacao_credito', 'nao_classificado');
$$;

CREATE OR REPLACE FUNCTION public._documentacao_perfil_label(_perfil text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE _perfil
    WHEN 'clt' THEN 'CLT'
    WHEN 'autonomo' THEN 'Autônomo / Informal'
    WHEN 'empresario' THEN 'Empresário / PJ'
    WHEN 'aposentado' THEN 'Aposentado / Pensionista'
  END;
$$;

-- A pasta pelo token, só se ainda vale: não revogada, no prazo e com o lead
-- vivo. Corretor trocado não derruba a pasta: ela é do cliente.
CREATE OR REPLACE FUNCTION public._documentacao_pasta_ativa(_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id
    FROM public.documentacao_pastas AS p
    JOIN public.leads AS l ON l.id = p.lead_id
   WHERE COALESCE(_token, '') ~ '^[A-Za-z0-9_-]{32}$'
     AND p.token = _token
     AND p.revogado_em IS NULL
     AND p.expira_em > now()
     AND l.deleted_at IS NULL
     AND NOT COALESCE(l.na_lixeira, false);
$$;

CREATE OR REPLACE FUNCTION public._documentacao_link_resumo(_link_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', l.id,
    'slug', l.slug,
    'created_at', l.created_at,
    'total_cadastros', (SELECT count(*) FROM public.documentacao_pastas p WHERE p.link_id = l.id),
    'ultimo_cadastro_em', (SELECT max(p.created_at) FROM public.documentacao_pastas p
                            WHERE p.link_id = l.id)
  )
  FROM public.documentacao_links AS l
  WHERE l.id = _link_id;
$$;

CREATE OR REPLACE FUNCTION public._documentacao_pasta_resumo(_pasta_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'token', p.token,
    'expira_em', p.expira_em,
    'expirada', p.expira_em <= now(),
    'created_at', p.created_at,
    'perfil', p.perfil,
    'pelo_link_fixo', p.link_id IS NOT NULL,
    'ultimo_envio_em', p.ultimo_envio_em,
    'arquivos_recebidos', (SELECT count(*) FROM public.documentacao_versoes v WHERE v.pasta_id = p.id)
  )
  FROM public.documentacao_pastas AS p
  WHERE p.id = _pasta_id;
$$;

-- O que a página do cliente mostra: o corretor do lead AGORA (se a carteira
-- mudou, o cliente fala com o novo), a validade e os itens com o andamento.
-- Nada do cliente (nem o nome) e nada dos arquivos.
CREATE OR REPLACE FUNCTION public._documentacao_pasta_publica(_pasta_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'corretor_nome', COALESCE(NULLIF(btrim(pr.nome), ''), 'Seu corretor'),
    'corretor_whatsapp', public.normalize_phone_smq(pr.telefone),
    'expira_em', p.expira_em,
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id,
               'tipo', d.tipo,
               'status', d.status,
               'tem_arquivo', (d.url IS NOT NULL OR d.arquivo_path IS NOT NULL),
               'atualizado_em', d.updated_at)
             ORDER BY d.created_at, d.id)
        FROM public.documentacoes AS d
       WHERE d.lead_id = p.lead_id
         AND public._documentacao_tipo_do_cliente(d.tipo)
    ), '[]'::jsonb)
  )
  FROM public.documentacao_pastas AS p
  JOIN public.leads AS l ON l.id = p.lead_id
  LEFT JOIN public.profiles AS pr ON pr.id = l.corretor_id
  WHERE p.id = _pasta_id;
$$;

-- Cria só os itens que o lead ainda não tem (em qualquer status): voltar pelo
-- link ou trocar a resposta nunca duplica o checklist.
CREATE OR REPLACE FUNCTION public._documentacao_aplicar_checklist(_lead_id uuid, _tipos text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _n integer;
BEGIN
  INSERT INTO public.documentacoes (lead_id, corretor_id, tipo, status)
  SELECT _lead_id, l.corretor_id, x.tipo, 'pendente'
    FROM (SELECT DISTINCT t AS tipo FROM unnest(_tipos) AS t) AS x
    JOIN public.leads AS l ON l.id = _lead_id
   WHERE public._documentacao_tipo_do_cliente(x.tipo)
     AND NOT EXISTS (
       SELECT 1 FROM public.documentacoes AS d WHERE d.lead_id = _lead_id AND d.tipo = x.tipo
     );
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- O cliente respondeu (cadastro, respostas ou arquivo). Garante o próximo
-- passo — uma tarefa de documentação aberta; o espelho proximo_followup sai
-- dela — e tira da prospecção para Em atendimento (a cadência sai sozinha
-- pelo gatilho tg_cadencia_sai_por_status). Etapa adiante não regride.
CREATE OR REPLACE FUNCTION public._documentacao_cliente_respondeu(_lead_id uuid, _prazo interval)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.leads%ROWTYPE;
  _prev text := COALESCE(current_setting('app.transicionar_lead', true), '');
BEGIN
  SELECT * INTO _l FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND OR _l.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF _l.corretor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tarefas AS t
     WHERE t.lead_id = _lead_id
       AND t.deleted_at IS NULL
       AND t.tipo = 'documentacao'::public.tarefa_tipo
       AND t.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
  ) THEN
    INSERT INTO public.tarefas
      (corretor_id, lead_id, titulo, descricao, tipo, prioridade, status,
       data_vencimento, origem_automatica, criado_por)
    VALUES
      (_l.corretor_id, _lead_id, 'Conferir os documentos de ' || _l.nome,
       'O cliente está enviando os documentos pelo link da pasta.',
       'documentacao'::public.tarefa_tipo, 'alta'::public.tarefa_prioridade,
       'pendente'::public.tarefa_status, now() + _prazo, true, _l.corretor_id);
  END IF;

  IF _l.status IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status,
                   'aguardando_corretor'::public.lead_status,
                   'aguardando_retorno'::public.lead_status) THEN
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET status = 'em_atendimento'::public.lead_status,
           proxima_acao = 'Conferir os documentos enviados pelo cliente',
           ultima_interacao = now()
     WHERE id = _lead_id;
    PERFORM set_config('app.transicionar_lead', _prev, true);
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead_id, 'transicao_lead',
      'Lead movido de ' || _l.status::text || ' para em_atendimento.',
      'link_documentacao',
      jsonb_build_object('de_status', _l.status, 'para_status', 'em_atendimento',
                         'motivo', 'O cliente respondeu pelo link de documentação',
                         'alterado_por', NULL, 'origem', 'resposta'));
  ELSE
    UPDATE public.leads SET ultima_interacao = now() WHERE id = _lead_id;
  END IF;
END;
$$;

-- Por que um envio para a pasta não pode entrar (NULL = pode). Mesma regra na
-- validação antes do upload e no registro depois dele.
CREATE OR REPLACE FUNCTION public._documentacao_upload_recusa(
  _pasta public.documentacao_pastas,
  _documentacao_id uuid,
  _tipo text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _d public.documentacoes%ROWTYPE;
BEGIN
  -- Teto da pasta: segura robô e engano sem travar o uso real (uma pasta
  -- MCMV completa tem uns 15 arquivos).
  IF (SELECT count(*) FROM public.documentacao_versoes v
       WHERE v.pasta_id = _pasta.id AND v.created_at > now() - interval '1 hour') >= 40
     OR (SELECT count(*) FROM public.documentacao_versoes v WHERE v.pasta_id = _pasta.id) >= 150 THEN
    RETURN 'limite_pasta';
  END IF;

  IF _documentacao_id IS NOT NULL THEN
    SELECT * INTO _d FROM public.documentacoes WHERE id = _documentacao_id;
    -- Aprovado não se troca pelo link: o corretor já conferiu.
    IF NOT FOUND OR _d.lead_id <> _pasta.lead_id
       OR NOT public._documentacao_tipo_do_cliente(_d.tipo)
       OR _d.status NOT IN ('pendente', 'recebido', 'reprovado') THEN
      RETURN 'item_invalido';
    END IF;
    RETURN NULL;
  END IF;

  -- Arquivo a mais de um item (outro holerite, o verso do RG) ou "outro".
  IF NOT public._documentacao_tipo_do_cliente(_tipo) THEN
    RETURN 'item_invalido';
  END IF;
  IF (SELECT count(*) FROM public.documentacoes d
       WHERE d.lead_id = _pasta.lead_id AND d.tipo = _tipo) >= 12 THEN
    RETURN 'limite_item';
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) RPCs do corretor (authenticated)
-- ---------------------------------------------------------------------------

-- O link fixo (null = ainda não criou).
CREATE OR REPLACE FUNCTION public.meu_documentacao_link()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de documentação é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO _id FROM public.documentacao_links
   WHERE corretor_id = _uid AND revogado_em IS NULL;
  IF _id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public._documentacao_link_resumo(_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_meu_documentacao_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de documentação é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  -- Dois cliques, duas abas: um link só.
  PERFORM pg_advisory_xact_lock(hashtext('documentacao_link:' || _uid::text));
  SELECT id INTO _id FROM public.documentacao_links
   WHERE corretor_id = _uid AND revogado_em IS NULL;
  IF _id IS NULL THEN
    INSERT INTO public.documentacao_links (corretor_id, slug)
    VALUES (_uid, public._agendamento_link_novo_slug())
    RETURNING id INTO _id;
  END IF;
  RETURN public._documentacao_link_resumo(_id);
END;
$$;

-- Revoga o link fixo (o endereço antigo para de abrir na hora) e cria outro.
-- As pastas já abertas continuam valendo: são dos clientes.
CREATE OR REPLACE FUNCTION public.trocar_meu_documentacao_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de documentação é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('documentacao_link:' || _uid::text));
  UPDATE public.documentacao_links
     SET revogado_em = now(), updated_at = now()
   WHERE corretor_id = _uid AND revogado_em IS NULL;
  INSERT INTO public.documentacao_links (corretor_id, slug)
  VALUES (_uid, public._agendamento_link_novo_slug())
  RETURNING id INTO _id;
  RETURN public._documentacao_link_resumo(_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.desativar_meu_documentacao_link()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NOT public._agendamento_link_corretor_apto(_uid) THEN
    RAISE EXCEPTION 'link de documentação é do corretor com conta ativa' USING ERRCODE = '42501';
  END IF;
  UPDATE public.documentacao_links
     SET revogado_em = now(), updated_at = now()
   WHERE corretor_id = _uid AND revogado_em IS NULL;
  RETURN FOUND;
END;
$$;

-- A pasta do lead, como está (null = nunca gerada ou revogada). Quem pode ver
-- o lead pode ver e mandar o link da pasta dele.
CREATE OR REPLACE FUNCTION public.consultar_pasta_do_lead(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF NOT public.is_active_member(_uid) OR NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO _id FROM public.documentacao_pastas
   WHERE lead_id = _lead_id AND revogado_em IS NULL;
  IF _id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public._documentacao_pasta_resumo(_id);
END;
$$;

-- Gera a pasta (na primeira vez) e renova a validade para 30 dias a partir de
-- agora: mandar o link de novo é dar mais prazo ao cliente.
CREATE OR REPLACE FUNCTION public.link_pasta_do_lead(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF NOT public.is_active_member(_uid) OR NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = _lead_id AND l.deleted_at IS NULL
                    AND NOT COALESCE(l.na_lixeira, false)) THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('documentacao_pasta:' || _lead_id::text));

  UPDATE public.documentacao_pastas
     SET expira_em = GREATEST(expira_em, now() + interval '30 days'), updated_at = now()
   WHERE lead_id = _lead_id AND revogado_em IS NULL
  RETURNING id INTO _id;
  IF _id IS NULL THEN
    INSERT INTO public.documentacao_pastas (lead_id, criado_por, token, expira_em)
    VALUES (_lead_id, _uid, public._documentacao_novo_token(), now() + interval '30 days')
    RETURNING id INTO _id;
  END IF;
  RETURN public._documentacao_pasta_resumo(_id);
END;
$$;

-- Link da pasta vazou ou foi para a pessoa errada: revoga e gera outro, com as
-- mesmas respostas. Os arquivos já enviados ficam no lead.
CREATE OR REPLACE FUNCTION public.trocar_link_pasta_do_lead(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _antiga public.documentacao_pastas%ROWTYPE;
  _id uuid;
BEGIN
  IF NOT public.is_active_member(_uid) OR NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = _lead_id AND l.deleted_at IS NULL
                    AND NOT COALESCE(l.na_lixeira, false)) THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('documentacao_pasta:' || _lead_id::text));

  UPDATE public.documentacao_pastas
     SET revogado_em = now(), updated_at = now()
   WHERE lead_id = _lead_id AND revogado_em IS NULL
  RETURNING * INTO _antiga;

  INSERT INTO public.documentacao_pastas (
    lead_id, link_id, criado_por, token, perfil, casado, usa_fgts, declara_ir, expira_em
  ) VALUES (
    _lead_id, _antiga.link_id, _uid, public._documentacao_novo_token(), _antiga.perfil,
    _antiga.casado, _antiga.usa_fgts, _antiga.declara_ir, now() + interval '30 days'
  )
  RETURNING id INTO _id;
  RETURN public._documentacao_pasta_resumo(_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) RPCs da página pública (service_role, chamadas pelo servidor)
-- ---------------------------------------------------------------------------

-- Limite distribuído ANTES de qualquer leitura ou escrita: 120 requisições
-- por minuto por link fixo e por pasta. O lock da linha serializa instâncias
-- serverless.
CREATE OR REPLACE FUNCTION public.consumir_documentacao_link_requisicao(_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _link public.documentacao_links%ROWTYPE;
  _agora timestamptz := clock_timestamp();
  _inicio timestamptz;
  _quantidade integer;
BEGIN
  IF _slug IS NULL OR _slug !~ '^[A-Za-z0-9_-]{16}$' THEN
    RETURN 'not_found';
  END IF;
  SELECT * INTO _link
    FROM public.documentacao_links
   WHERE slug = _slug AND revogado_em IS NULL
   FOR UPDATE;
  IF NOT FOUND OR NOT public._agendamento_link_corretor_apto(_link.corretor_id) THEN
    RETURN 'not_found';
  END IF;

  IF _link.limite_janela_inicio IS NULL
     OR _link.limite_janela_inicio <= _agora - interval '1 minute' THEN
    _inicio := _agora;
    _quantidade := 1;
  ELSE
    _inicio := _link.limite_janela_inicio;
    _quantidade := _link.limite_janela_requisicoes + 1;
  END IF;
  IF _quantidade > 120 THEN
    RETURN 'rate_limited';
  END IF;

  UPDATE public.documentacao_links
     SET limite_janela_inicio = _inicio, limite_janela_requisicoes = _quantidade
   WHERE id = _link.id;
  RETURN 'allowed';
END;
$$;

CREATE OR REPLACE FUNCTION public.consumir_documentacao_pasta_requisicao(_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _pasta public.documentacao_pastas%ROWTYPE;
  _agora timestamptz := clock_timestamp();
  _inicio timestamptz;
  _quantidade integer;
BEGIN
  SELECT * INTO _pasta
    FROM public.documentacao_pastas
   WHERE id = public._documentacao_pasta_ativa(_token)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF _pasta.limite_janela_inicio IS NULL
     OR _pasta.limite_janela_inicio <= _agora - interval '1 minute' THEN
    _inicio := _agora;
    _quantidade := 1;
  ELSE
    _inicio := _pasta.limite_janela_inicio;
    _quantidade := _pasta.limite_janela_requisicoes + 1;
  END IF;
  IF _quantidade > 120 THEN
    RETURN 'rate_limited';
  END IF;

  UPDATE public.documentacao_pastas
     SET limite_janela_inicio = _inicio, limite_janela_requisicoes = _quantidade
   WHERE id = _pasta.id;
  RETURN 'allowed';
END;
$$;

-- Projeção pública do link fixo: só o nome do corretor.
CREATE OR REPLACE FUNCTION public.obter_documentacao_link_publico(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'corretor_nome', COALESCE(NULLIF(btrim(p.nome), ''), 'Seu corretor')
  )
  FROM public.documentacao_links AS l
  LEFT JOIN public.profiles AS p ON p.id = l.corretor_id
  WHERE l.slug = _slug
    AND COALESCE(_slug, '') ~ '^[A-Za-z0-9_-]{16}$'
    AND l.revogado_em IS NULL
    AND public._agendamento_link_corretor_apto(l.corretor_id);
$$;

-- O cadastro pelo link fixo. Tudo numa transação: lead (portas do registro
-- mãe), pasta, checklist, etapa, tarefa, linha do tempo e aviso ao corretor.
-- Erro de negócio volta como {ok:false, motivo} (sem exceção), para a rota
-- responder sem log de PII. A lista de tipos vem do servidor, que a monta com
-- a mesma função do CRM (checklistPorPerfil); aqui só se confere o formato.
CREATE OR REPLACE FUNCTION public.iniciar_documentacao_pelo_link(
  _slug text,
  _nome text,
  _telefone text,
  _email text,
  _cpf text,
  _perfil text,
  _casado boolean,
  _usa_fgts boolean,
  _declara_ir boolean,
  _tipos text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.documentacao_links%ROWTYPE;
  _cliente public.clientes%ROWTYPE;
  _lead public.leads%ROWTYPE;
  _pasta public.documentacao_pastas%ROWTYPE;
  _r public.leads;
  _vals jsonb;
  _adicional boolean;
  _lead_novo boolean := false;
  _nome_l text := regexp_replace(btrim(COALESCE(_nome, '')), '\s+', ' ', 'g');
  _email_l text := lower(btrim(COALESCE(_email, '')));
  _tel text := regexp_replace(COALESCE(_telefone, ''), '\D', '', 'g');
  _cpf_d text := regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g');
  _perfil_label text := public._documentacao_perfil_label(_perfil);
  _tel_fmt text;
  _cpf_fmt text;
  _chave text;
  _novos integer;
  _divergencias text[] := '{}';
  _prev_zona text := COALESCE(current_setting('app.zona_override', true), '');
BEGIN
  -- 0) Última fronteira da entrada (a rota já validou com o mesmo critério).
  IF _slug IS NULL OR _slug !~ '^[A-Za-z0-9_-]{16}$'
     OR char_length(_nome_l) NOT BETWEEN 5 AND 120 OR position(' ' IN _nome_l) = 0
     OR char_length(_email_l) > 160 OR _email_l !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR length(_tel) NOT IN (10, 11)
     OR NOT public._cpf_valido(_cpf_d)
     OR _perfil_label IS NULL
     OR _casado IS NULL OR _usa_fgts IS NULL OR _declara_ir IS NULL
     OR _tipos IS NULL OR cardinality(_tipos) NOT BETWEEN 1 AND 30
     OR EXISTS (SELECT 1 FROM unnest(_tipos) AS t WHERE NOT public._documentacao_tipo_do_cliente(t)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalid_input');
  END IF;

  -- 1) O link (lock: serializa os cadastros do mesmo corretor).
  SELECT * INTO _l
    FROM public.documentacao_links
   WHERE slug = _slug AND revogado_em IS NULL
   FOR UPDATE;
  IF NOT FOUND OR NOT public._agendamento_link_corretor_apto(_l.corretor_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'not_found');
  END IF;

  -- 2) Teto de pastas novas por link: segura robô e brincadeira sem travar o
  --    uso real. Quem volta com o mesmo telefone cai na pasta que já tem.
  IF (SELECT count(*) FROM public.documentacao_pastas p
       WHERE p.link_id = _l.id AND p.created_at > now() - interval '1 hour') >= 10
     OR (SELECT count(*) FROM public.documentacao_pastas p
          WHERE p.link_id = _l.id AND p.created_at > now() - interval '1 day') >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'limite_link');
  END IF;

  -- 3) O lead, pelas portas do registro mãe (as mesmas do link de agendamento).
  _tel_fmt := CASE length(_tel)
    WHEN 11 THEN format('(%s) %s-%s', substr(_tel, 1, 2), substr(_tel, 3, 5), substr(_tel, 8, 4))
    ELSE format('(%s) %s-%s', substr(_tel, 1, 2), substr(_tel, 3, 4), substr(_tel, 7, 4))
  END;
  _cpf_fmt := format('%s.%s.%s-%s', substr(_cpf_d, 1, 3), substr(_cpf_d, 4, 3),
                     substr(_cpf_d, 7, 3), substr(_cpf_d, 10, 2));

  -- A chave da mãe sai do telefone NORMALIZADO, como no gatilho; mesmo lock.
  _chave := public.cliente_chave_telefone(COALESCE(public.normalize_phone_smq(_tel), _tel));
  PERFORM pg_advisory_xact_lock(hashtext('cliente:' || _chave));
  SELECT * INTO _cliente FROM public.clientes WHERE chave_telefone = _chave;

  PERFORM set_config('app.zona_override', 'on', true);

  IF _cliente.id IS NOT NULL THEN
    SELECT l.* INTO _lead
      FROM public.leads AS l
     WHERE l.cliente_id = _cliente.id
       AND l.corretor_id = _l.corretor_id
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
       AND l.status::text <> 'perdido'
     ORDER BY l.updated_at DESC
     LIMIT 1;

    IF _lead.id IS NULL THEN
      IF public._cliente_lead_avancado(_cliente.id, _l.corretor_id) IS NOT NULL THEN
        PERFORM set_config('app.zona_override', _prev_zona, true);
        RETURN jsonb_build_object('ok', false, 'motivo', 'nao_permitido');
      END IF;

      -- Registro filho: a mesma regra de criar_registro_filho (herda os dados
      -- da mãe); o formulário completa só o que a mãe não tem.
      PERFORM pg_advisory_xact_lock(hashtext('cliente_filho:' || _cliente.id::text));
      _adicional := EXISTS (
        SELECT 1 FROM public.leads AS l
         WHERE l.cliente_id = _cliente.id
           AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
      );
      SELECT COALESCE(jsonb_object_agg(e.key, e.value -> 'valor'), '{}'::jsonb) INTO _vals
        FROM jsonb_each(_cliente.dados) AS e
       WHERE e.key = ANY (public._cliente_campos());
      _r := jsonb_populate_record(NULL::public.leads, _vals);

      INSERT INTO public.leads (
        cliente_id, registro_adicional, corretor_id, status, origem,
        data_distribuicao, timestamp_recebimento,
        nome, telefone, email, cpf,
        projeto_nome,
        renda_informada, renda_estimada, tipo_renda, faixa_mcmv,
        usa_fgts, tem_fgts, fgts_valor, entrada_disponivel, decisor,
        zona, bairro, dorms_desejados, precisa_vaga, prioridades,
        objecoes, resumo_qualificacao, construtora, consentimento_lgpd,
        opt_out
      ) VALUES (
        _cliente.id, _adicional, _l.corretor_id, 'aguardando_atendimento'::public.lead_status,
        'documentacao_self_service'::public.lead_origem,
        now(), now(),
        COALESCE(_r.nome, _cliente.nome, _nome_l),
        COALESCE(_cliente.telefone, _cliente.telefone_e164, _tel_fmt),
        COALESCE(_r.email, _cliente.email, _email_l),
        COALESCE(_r.cpf, _cliente.cpf, _cpf_fmt),
        _r.projeto_nome,
        _r.renda_informada, _r.renda_estimada, COALESCE(_r.tipo_renda, _perfil_label), _r.faixa_mcmv,
        COALESCE(_r.usa_fgts, false) OR _usa_fgts, _r.tem_fgts, _r.fgts_valor,
        _r.entrada_disponivel, _r.decisor,
        _r.zona, _r.bairro, _r.dorms_desejados, _r.precisa_vaga, COALESCE(_r.prioridades, '{}'),
        COALESCE(_r.objecoes, '{}'), _r.resumo_qualificacao, _r.construtora,
        COALESCE(_r.consentimento_lgpd, true),
        _cliente.opt_out
      )
      RETURNING * INTO _lead;

      INSERT INTO public.cliente_eventos (cliente_id, lead_id, corretor_id, autor_id, campo, valor_novo)
      VALUES (_cliente.id, _lead.id, _l.corretor_id, NULL, '_registro_filho',
              jsonb_build_object('adicional', _adicional, 'via', 'link_documentacao',
                                 'campos_herdados', (SELECT count(*) FROM jsonb_object_keys(_vals))));
      _lead_novo := true;
    ELSE
      -- Registro do próprio corretor: só completa o que está vazio.
      UPDATE public.leads
         SET email = COALESCE(NULLIF(btrim(email), ''), _email_l),
             cpf = COALESCE(NULLIF(btrim(cpf), ''), _cpf_fmt),
             tipo_renda = COALESCE(NULLIF(btrim(tipo_renda), ''), _perfil_label),
             usa_fgts = usa_fgts OR _usa_fgts,
             consentimento_lgpd = COALESCE(consentimento_lgpd, true)
       WHERE id = _lead.id
      RETURNING * INTO _lead;
    END IF;
  ELSE
    -- Pessoa nova: o gatilho trg_zz_cliente_vincular cria a mãe.
    INSERT INTO public.leads (
      nome, telefone, email, cpf, origem, corretor_id, status,
      data_distribuicao, timestamp_recebimento, consentimento_lgpd, tipo_renda, usa_fgts
    ) VALUES (
      _nome_l, _tel_fmt, _email_l, _cpf_fmt, 'documentacao_self_service'::public.lead_origem,
      _l.corretor_id, 'aguardando_atendimento'::public.lead_status,
      now(), now(), true, _perfil_label, _usa_fgts
    )
    RETURNING * INTO _lead;
    _lead_novo := true;
  END IF;

  PERFORM set_config('app.zona_override', _prev_zona, true);

  -- O que o cliente digitou e a ficha já tinha diferente: vai na linha do
  -- tempo, para o corretor conferir (o CPF só aparece quando diverge).
  IF lower(btrim(_lead.nome)) <> lower(_nome_l) THEN
    _divergencias := _divergencias || ('Nome informado: ' || _nome_l);
  END IF;
  IF COALESCE(lower(btrim(_lead.email)), '') <> _email_l THEN
    _divergencias := _divergencias || ('E-mail informado: ' || _email_l);
  END IF;
  IF regexp_replace(COALESCE(_lead.cpf, ''), '\D', '', 'g') <> _cpf_d THEN
    _divergencias := _divergencias || ('CPF informado: ' || _cpf_fmt);
  END IF;

  -- 4) A pasta: a ativa do lead (renovada) ou uma nova. As respostas mais
  --    recentes do cliente ficam registradas.
  PERFORM pg_advisory_xact_lock(hashtext('documentacao_pasta:' || _lead.id::text));
  UPDATE public.documentacao_pastas
     SET perfil = _perfil, casado = _casado, usa_fgts = _usa_fgts, declara_ir = _declara_ir,
         expira_em = GREATEST(expira_em, now() + interval '30 days'), updated_at = now()
   WHERE lead_id = _lead.id AND revogado_em IS NULL
  RETURNING * INTO _pasta;
  IF _pasta.id IS NULL THEN
    INSERT INTO public.documentacao_pastas (
      lead_id, link_id, token, perfil, casado, usa_fgts, declara_ir, expira_em
    ) VALUES (
      _lead.id, _l.id, public._documentacao_novo_token(), _perfil, _casado, _usa_fgts,
      _declara_ir, now() + interval '30 days'
    )
    RETURNING * INTO _pasta;
  END IF;

  -- 5) O checklist, a etapa e o próximo passo.
  _novos := public._documentacao_aplicar_checklist(_lead.id, _tipos);
  PERFORM public._documentacao_cliente_respondeu(_lead.id, interval '1 day');

  -- 6) Linha do tempo e aviso no celular do corretor. A tag do push é a do
  --    "Novo lead recebido": a notificação mais completa substitui a outra.
  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (_lead.id, NULL, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
          'Sistema: cliente abriu a pasta de documentos',
          concat_ws(E'\n',
            'O cliente se cadastrou no seu link de documentos (perfil ' || _perfil_label
              || CASE WHEN _casado THEN ', casado ou em união estável' ELSE '' END
              || CASE WHEN _usa_fgts THEN ', vai usar FGTS' ELSE '' END
              || CASE WHEN _declara_ir THEN ', declara IR' ELSE '' END
              || ') e já pode enviar os arquivos.',
            CASE WHEN _novos > 0 THEN _novos || ' item(ns) novo(s) no checklist.' END,
            CASE WHEN cardinality(_divergencias) > 0
                 THEN E'Dados diferentes da ficha (confira com o cliente):\n'
                      || array_to_string(_divergencias, E'\n') END),
          jsonb_build_object('fonte', 'link_documentacao', 'lead_novo', _lead_novo,
                             'pasta_id', _pasta.id));
  PERFORM public.enqueue_push(
    _l.corretor_id,
    'Cliente no seu link de documentos',
    _lead.nome || ' abriu a pasta para enviar os documentos',
    '/leads/' || _lead.id::text,
    'lead-' || _lead.id::text);

  RETURN jsonb_build_object('ok', true, 'token', _pasta.token);
END;
$$;

-- A pasta pública pelo token (null = não existe, revogada ou vencida).
CREATE OR REPLACE FUNCTION public.obter_pasta_publica(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public._documentacao_pasta_publica(public._documentacao_pasta_ativa(_token));
$$;

-- O cliente que chegou pelo link da aba (pasta sem lista) responde o perfil:
-- entram os itens que faltam. Também serve para corrigir a resposta depois.
CREATE OR REPLACE FUNCTION public.definir_perfil_pasta(
  _token text,
  _perfil text,
  _casado boolean,
  _usa_fgts boolean,
  _declara_ir boolean,
  _tipos text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _pasta public.documentacao_pastas%ROWTYPE;
  _perfil_label text := public._documentacao_perfil_label(_perfil);
BEGIN
  IF _perfil_label IS NULL OR _casado IS NULL OR _usa_fgts IS NULL OR _declara_ir IS NULL
     OR _tipos IS NULL OR cardinality(_tipos) NOT BETWEEN 1 AND 30
     OR EXISTS (SELECT 1 FROM unnest(_tipos) AS t WHERE NOT public._documentacao_tipo_do_cliente(t)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalid_input');
  END IF;
  SELECT * INTO _pasta FROM public.documentacao_pastas
   WHERE id = public._documentacao_pasta_ativa(_token)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'not_found');
  END IF;

  UPDATE public.documentacao_pastas
     SET perfil = _perfil, casado = _casado, usa_fgts = _usa_fgts, declara_ir = _declara_ir,
         updated_at = now()
   WHERE id = _pasta.id;
  UPDATE public.leads
     SET tipo_renda = COALESCE(NULLIF(btrim(tipo_renda), ''), _perfil_label),
         usa_fgts = usa_fgts OR _usa_fgts
   WHERE id = _pasta.lead_id;
  PERFORM public._documentacao_aplicar_checklist(_pasta.lead_id, _tipos);
  PERFORM public._documentacao_cliente_respondeu(_pasta.lead_id, interval '1 day');

  RETURN jsonb_build_object('ok', true) || public._documentacao_pasta_publica(_pasta.id);
END;
$$;

-- Antes do upload: a pasta vale, o item aceita arquivo e o teto não estourou.
-- Devolve o lead para o servidor montar o caminho do objeto.
CREATE OR REPLACE FUNCTION public.validar_upload_pasta(
  _token text,
  _documentacao_id uuid DEFAULT NULL,
  _tipo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _pasta public.documentacao_pastas%ROWTYPE;
  _recusa text;
BEGIN
  SELECT * INTO _pasta FROM public.documentacao_pastas
   WHERE id = public._documentacao_pasta_ativa(_token);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'not_found');
  END IF;
  _recusa := public._documentacao_upload_recusa(_pasta, _documentacao_id, _tipo);
  IF _recusa IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', _recusa);
  END IF;
  RETURN jsonb_build_object('ok', true, 'lead_id', _pasta.lead_id);
END;
$$;

-- Depois do upload: a versão, o item como recebido, a etapa e o aviso. Tudo
-- revalidado sob o lock da pasta (o estado pode ter mudado no meio). Item a
-- mais (_documentacao_id nulo) nasce com o id que o servidor usou no caminho.
CREATE OR REPLACE FUNCTION public.registrar_upload_pasta(
  _token text,
  _object_path text,
  _nome_original text,
  _mime_type text,
  _tamanho_bytes bigint,
  _documentacao_id uuid DEFAULT NULL,
  _novo_documentacao_id uuid DEFAULT NULL,
  _tipo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _pasta public.documentacao_pastas%ROWTYPE;
  _lead public.leads%ROWTYPE;
  _recusa text;
  _doc_id uuid;
  _versao integer;
  _ext text;
BEGIN
  SELECT * INTO _pasta FROM public.documentacao_pastas
   WHERE id = public._documentacao_pasta_ativa(_token)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'not_found');
  END IF;

  _ext := CASE _mime_type
    WHEN 'application/pdf' THEN 'pdf' WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' END;
  _doc_id := COALESCE(_documentacao_id, _novo_documentacao_id);
  IF _ext IS NULL OR _doc_id IS NULL
     OR _tamanho_bytes NOT BETWEEN 1 AND 15728640
     OR char_length(COALESCE(_nome_original, '')) NOT BETWEEN 1 AND 255
     OR _object_path IS DISTINCT FROM (
          _pasta.lead_id::text || '/' || _doc_id::text || '/'
          || substring(_object_path from '[^/]+$'))
     OR substring(_object_path from '[^/]+$')
          !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.' || _ext || '$') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalid_input');
  END IF;

  _recusa := public._documentacao_upload_recusa(_pasta, _documentacao_id, _tipo);
  IF _recusa IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', _recusa);
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _pasta.lead_id;

  IF _documentacao_id IS NULL THEN
    INSERT INTO public.documentacoes (id, lead_id, corretor_id, tipo, status)
    VALUES (_novo_documentacao_id, _pasta.lead_id, _lead.corretor_id, _tipo, 'pendente');
  END IF;

  -- O cliente respondeu: sai da prospecção ANTES do item virar recebido, para
  -- a regra da pasta (3 documentos → Análise de crédito) achar o lead numa
  -- etapa de onde ela pode seguir.
  PERFORM public._documentacao_cliente_respondeu(_pasta.lead_id, interval '4 hours');

  PERFORM 1 FROM public.documentacoes WHERE id = _doc_id FOR UPDATE;
  UPDATE public.documentacao_versoes SET ativa = false WHERE documentacao_id = _doc_id AND ativa;
  SELECT COALESCE(max(v.versao), 0) + 1 INTO _versao
    FROM public.documentacao_versoes AS v WHERE v.documentacao_id = _doc_id;
  INSERT INTO public.documentacao_versoes (
    documentacao_id, lead_id, versao, object_path, nome_original, mime_type,
    tamanho_bytes, enviado_por, pelo_cliente, pasta_id
  ) VALUES (
    _doc_id, _pasta.lead_id, _versao, _object_path, left(_nome_original, 255), _mime_type,
    _tamanho_bytes, NULL, true, _pasta.id
  );

  -- arquivo_path sai: o caminho que vale é o da versão (o assinador do CRM
  -- prefere arquivo_path, que numa linha do WhatsApp apontaria o arquivo velho).
  UPDATE public.documentacoes
     SET url = _object_path,
         arquivo_path = NULL,
         arquivo_nome = left(_nome_original, 255),
         mime_type = _mime_type,
         tamanho_bytes = _tamanho_bytes,
         origem = 'link_cliente',
         recebido_em = now(),
         status = 'recebido'
   WHERE id = _doc_id;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_pasta.lead_id, 'documentacao_upload', 'Documento enviado pelo cliente no link da pasta',
          'link_documentacao',
          jsonb_build_object('documentacao_id', _doc_id, 'versao', _versao,
                             'mime_type', _mime_type, 'tamanho_bytes', _tamanho_bytes,
                             'pasta_id', _pasta.id));

  -- Um aviso por leva (30 minutos): o cliente costuma mandar vários seguidos.
  IF _pasta.ultimo_aviso_em IS NULL OR _pasta.ultimo_aviso_em < now() - interval '30 minutes' THEN
    INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
    VALUES (_pasta.lead_id, NULL, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
            'Sistema: documentos enviados pelo cliente',
            'O cliente está enviando documentos pelo link da pasta. Confira na aba Documentação.',
            jsonb_build_object('fonte', 'link_documentacao', 'pasta_id', _pasta.id));
    IF _lead.corretor_id IS NOT NULL THEN
      PERFORM public.enqueue_push(
        _lead.corretor_id,
        'Documentos chegando',
        _lead.nome || ' está enviando documentos pelo link',
        '/leads/' || _pasta.lead_id::text,
        'lead-docs-' || _pasta.lead_id::text);
    END IF;
    UPDATE public.documentacao_pastas
       SET ultimo_aviso_em = now(), ultimo_envio_em = now(), updated_at = now()
     WHERE id = _pasta.id;
  ELSE
    UPDATE public.documentacao_pastas
       SET ultimo_envio_em = now(), updated_at = now()
     WHERE id = _pasta.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'documentacao_id', _doc_id, 'versao', _versao);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Permissões
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._documentacao_novo_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_tipo_do_cliente(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_perfil_label(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_pasta_ativa(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_link_resumo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_pasta_resumo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_pasta_publica(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_aplicar_checklist(uuid, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_cliente_respondeu(uuid, interval)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._documentacao_upload_recusa(public.documentacao_pastas, uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.meu_documentacao_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_meu_documentacao_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trocar_meu_documentacao_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desativar_meu_documentacao_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consultar_pasta_do_lead(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_pasta_do_lead(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trocar_link_pasta_do_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_documentacao_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_meu_documentacao_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trocar_meu_documentacao_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.desativar_meu_documentacao_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_pasta_do_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_pasta_do_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trocar_link_pasta_do_lead(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.consumir_documentacao_link_requisicao(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consumir_documentacao_pasta_requisicao(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obter_documentacao_link_publico(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iniciar_documentacao_pelo_link(
  text, text, text, text, text, text, boolean, boolean, boolean, text[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obter_pasta_publica(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.definir_perfil_pasta(text, text, boolean, boolean, boolean, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_upload_pasta(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_upload_pasta(
  text, text, text, text, bigint, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_documentacao_link_requisicao(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consumir_documentacao_pasta_requisicao(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.obter_documentacao_link_publico(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.iniciar_documentacao_pelo_link(
  text, text, text, text, text, text, boolean, boolean, boolean, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.obter_pasta_publica(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.definir_perfil_pasta(text, text, boolean, boolean, boolean, text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_upload_pasta(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_upload_pasta(
  text, text, text, text, bigint, uuid, uuid, text
) TO service_role;

COMMENT ON TABLE public.documentacao_links IS
  'Link fixo de documentação do corretor (/documentos/<slug>). Slug público de propósito; revogável.';
COMMENT ON TABLE public.documentacao_pastas IS
  'Pasta pessoal de documentos de um lead (/pasta/<token>): o cliente envia arquivos por 30 dias. Sem PII.';
COMMENT ON COLUMN public.documentacao_versoes.pelo_cliente IS
  'Versão enviada pelo próprio cliente no link da pasta (sem usuário; pasta_id diz qual).';
