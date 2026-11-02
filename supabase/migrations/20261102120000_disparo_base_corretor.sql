-- =============================================================================
-- Disparo da base do corretor ("Marquinhos do corretor"), Fase 1
-- =============================================================================
-- Pedido do dono (02/11/2026): o corretor importa a base dele no CRM, o
-- Marquinhos dispara pela API oficial do WhatsApp e todo lead que avançar vai
-- direto para o corretor que importou.
--
-- Decisões do dono (02/11/2026):
--   * número: o do Marquinhos, por enquanto;
--   * custo: a empresa paga os primeiros 1000 contatos disparados, depois
--     50/50 com o corretor (só a regra fica aqui; a conta entra na Fase 2,
--     com o envio);
--   * piloto com 1 corretor (lista em disparo_base_pilotos);
--   * corretor desligado/inativo: o lead qualificado vai para a roleta.
--
-- O problema que esta migration resolve antes de qualquer envio:
-- registrar_volta_campanha mandava a pessoa que já está no CRM para um
-- REGISTRO FILHO na roleta, SEM os corretores que já a têm. O cliente da base
-- da Ana que respondesse ao disparo e fosse qualificado pelo Marquinhos ia
-- parar com outro corretor. Ramo novo, [BASE DO CORRETOR]: quando quem chega
-- é o Marquinhos (origem 'chatbot') e a pessoa recebeu um disparo da base de
-- um corretor nos últimos N dias, o lead fica com esse corretor.
--
-- O que nasce aqui:
--   1. disparo_base_config: chaves da operação (cota da empresa, rateio,
--      janela de resposta, limite diário por corretor).
--   2. disparo_base_pilotos: quem pode usar (piloto).
--   3. disparos_base / disparos_base_itens: a campanha do corretor e um item
--      por contato, com o status do envio (Fase 2 preenche o envio).
--   4. importar_base_corretor_lote: a base entra na carteira do corretor como
--      base fria — status "aguardando_retorno", classe 'base', sem alerta, sem
--      push, sem cadência e fora do repasse por SLA (que só olha classe
--      'quente' em aguardando_atendimento). Telefone de outra carteira, já no
--      CRM sem ser dele, ou com opt-out é BLOQUEADO e volta no relatório.
--   5. registrar_volta_campanha: o ramo [BASE DO CORRETOR].
--
-- Escrita só por RPC SECURITY DEFINER: as tabelas têm RLS de leitura (o
-- corretor vê os próprios disparos; admin vê tudo) e nenhuma policy de
-- escrita. A importação roda com service role chamada pela server function,
-- como a importação CSV do admin (AGENTS.md): sem auth.uid() o gatilho que
-- força "aguardando_atendimento" na captação própria não dispara.
--
-- Idempotente. Espelhada em drizzle/migrations/0128.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Configuração
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disparo_base_config (
  chave      text PRIMARY KEY,
  valor      jsonb NOT NULL,
  descricao  text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.disparo_base_config (chave, valor, descricao) VALUES
  ('cota_empresa_contatos', '1000'::jsonb,
   'Contatos disparados pagos 100% pela empresa (somando todos os corretores).'),
  ('rateio_corretor_apos_cota', '0.5'::jsonb,
   'Parte do custo paga pelo corretor depois da cota da empresa (0.5 = 50/50).'),
  ('janela_resposta_dias', '30'::jsonb,
   'Por quantos dias depois do envio a qualificação do Marquinhos volta para o corretor que disparou.'),
  ('limite_diario_corretor', '150'::jsonb,
   'Máximo de contatos novos disparados por corretor por dia (protege a qualidade do número).'),
  ('max_contatos_por_disparo', '2000'::jsonb,
   'Tamanho máximo de uma base importada num disparo.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public._disparo_base_cfg(_chave text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT valor FROM public.disparo_base_config WHERE chave = _chave;
$function$;

-- -----------------------------------------------------------------------------
-- 2. Piloto
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disparo_base_pilotos (
  corretor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo       boolean NOT NULL DEFAULT true,
  criado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.disparo_base_e_piloto(_corretor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.disparo_base_pilotos p
     WHERE p.corretor_id = _corretor AND p.ativo)
    AND public._dono_ativo(_corretor);
$function$;

-- Admin liga/desliga o piloto de um corretor.
CREATE OR REPLACE FUNCTION public.disparo_base_definir_piloto(_corretor uuid, _ativo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores definem o piloto do disparo.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _corretor) THEN
    RAISE EXCEPTION 'Corretor não encontrado.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.disparo_base_pilotos (corretor_id, ativo, criado_por)
  VALUES (_corretor, _ativo, auth.uid())
  ON CONFLICT (corretor_id) DO UPDATE SET ativo = EXCLUDED.ativo;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3. Disparos e itens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disparos_base (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 120),
  status        text NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','enviando','pausado','concluido','cancelado')),
  -- Fase 2: modelo de mensagem aprovado pela Meta e as variáveis.
  modelo        text,
  variaveis     jsonb NOT NULL DEFAULT '{}'::jsonb,
  projeto_id    uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  declarou_base_propria boolean NOT NULL DEFAULT false,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disparos_base_corretor_idx
  ON public.disparos_base (corretor_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.disparos_base_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disparo_id    uuid NOT NULL REFERENCES public.disparos_base(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Como o lead chegou ao disparo: nasceu na importação ou já era do corretor.
  origem_item   text NOT NULL CHECK (origem_item IN ('novo','ja_na_carteira')),
  status        text NOT NULL DEFAULT 'na_fila'
                CHECK (status IN ('na_fila','enviado','entregue','lido','respondeu',
                                  'qualificado','falha','saiu')),
  -- ID da mensagem na Meta (wamid), para casar os status de entrega.
  provider_message_id text UNIQUE,
  erro          text,
  tentativas    int NOT NULL DEFAULT 0,
  enviado_em    timestamptz,
  entregue_em   timestamptz,
  lido_em       timestamptz,
  respondeu_em  timestamptz,
  qualificado_em timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (disparo_id, lead_id)
);
CREATE INDEX IF NOT EXISTS disparos_base_itens_lead_idx
  ON public.disparos_base_itens (lead_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS disparos_base_itens_fila_idx
  ON public.disparos_base_itens (disparo_id, status);

-- -----------------------------------------------------------------------------
-- RLS: leitura do próprio corretor e do admin; escrita só por RPC.
-- -----------------------------------------------------------------------------
ALTER TABLE public.disparo_base_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparo_base_pilotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparos_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparos_base_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "disparo_base_config leitura" ON public.disparo_base_config;
CREATE POLICY "disparo_base_config leitura" ON public.disparo_base_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "disparo_base_pilotos leitura" ON public.disparo_base_pilotos;
CREATE POLICY "disparo_base_pilotos leitura" ON public.disparo_base_pilotos
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "disparos_base leitura" ON public.disparos_base;
CREATE POLICY "disparos_base leitura" ON public.disparos_base
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "disparos_base_itens leitura" ON public.disparos_base_itens;
CREATE POLICY "disparos_base_itens leitura" ON public.disparos_base_itens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.disparos_base d
     WHERE d.id = disparo_id
       AND (d.corretor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

REVOKE ALL ON public.disparo_base_config, public.disparo_base_pilotos,
              public.disparos_base, public.disparos_base_itens FROM anon;
GRANT SELECT ON public.disparo_base_config, public.disparo_base_pilotos,
                public.disparos_base, public.disparos_base_itens TO authenticated;
GRANT ALL ON public.disparo_base_config, public.disparo_base_pilotos,
             public.disparos_base, public.disparos_base_itens TO service_role;

-- -----------------------------------------------------------------------------
-- 4a. Criar o disparo (o próprio corretor, piloto)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparo_base_criar(_nome text, _declarou_base_propria boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.disparo_base_e_piloto(auth.uid()) THEN
    RAISE EXCEPTION 'O disparo da base ainda está em piloto e não está liberado para você.'
      USING ERRCODE = '42501';
  END IF;
  -- LGPD: o corretor declara que a base é dele e que os contatos aceitaram
  -- ser procurados. Sem a declaração, não nasce disparo.
  IF NOT COALESCE(_declarou_base_propria, false) THEN
    RAISE EXCEPTION 'Confirme que a base é sua e que os contatos aceitaram ser procurados.'
      USING ERRCODE = '22023';
  END IF;
  IF _nome IS NULL OR length(btrim(_nome)) = 0 THEN
    RAISE EXCEPTION 'Dê um nome ao disparo.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.disparos_base (corretor_id, nome, declarou_base_propria)
  VALUES (auth.uid(), left(btrim(_nome), 120), true)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4b. Importar a base (service role, pela server function)
-- -----------------------------------------------------------------------------
-- _rows: [{linha, nome, telefone, email, zona, renda}] — até 500 por chamada.
-- Retorno: {novos, ja_na_carteira, bloqueados: [{linha,nome,telefone,motivo}],
--           erros: [{linha,nome,telefone,motivo}]}
-- Motivos de bloqueio: outra_carteira | ja_no_crm | pediu_para_sair |
--                      repetido_na_planilha | limite_do_disparo
CREATE OR REPLACE FUNCTION public.importar_base_corretor_lote(
  _corretor uuid, _disparo uuid, _rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  i int := 0;
  v_nome text; v_tel text; v_email text; v_zona text; v_renda text;
  _chave text;
  _lead uuid;
  _outro uuid;
  _qtd int;
  _max int := COALESCE((public._disparo_base_cfg('max_contatos_por_disparo') #>> '{}')::int, 2000);
  _novos int := 0;
  _ja int := 0;
  _bloq jsonb := '[]'::jsonb;
  _erros jsonb := '[]'::jsonb;
  _status text;
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 500 THEN
    RAISE EXCEPTION 'Lote inválido (máx. 500 linhas).' USING ERRCODE = '22023';
  END IF;
  IF NOT public.disparo_base_e_piloto(_corretor) THEN
    RAISE EXCEPTION 'O disparo da base não está liberado para este corretor.' USING ERRCODE = '42501';
  END IF;
  SELECT d.status INTO _status FROM public.disparos_base d
   WHERE d.id = _disparo AND d.corretor_id = _corretor
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Disparo não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF _status <> 'rascunho' THEN
    RAISE EXCEPTION 'Este disparo já começou; crie outro para importar mais contatos.' USING ERRCODE = '22023';
  END IF;

  -- Base do corretor não é entrega de lead: sem alerta/push de "novo lead"
  -- (o mesmo interruptor do lote de prospecção) e o corretor é o dono por
  -- definição (captação própria), então a guarda de região não se aplica.
  PERFORM set_config('app.prospeccao_lote', 'on', true);
  PERFORM set_config('app.zona_override', 'on', true);

  SELECT count(*) INTO _qtd FROM public.disparos_base_itens WHERE disparo_id = _disparo;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    i := i + 1;
    v_nome  := nullif(btrim(r->>'nome'), '');
    v_tel   := nullif(regexp_replace(coalesce(r->>'telefone', ''), '\D', '', 'g'), '');
    v_email := nullif(lower(btrim(r->>'email')), '');
    v_zona  := nullif(btrim(r->>'zona'), '');
    v_renda := nullif(btrim(r->>'renda'), '');
    BEGIN
      IF v_nome IS NULL THEN RAISE EXCEPTION 'nome vazio'; END IF;
      IF v_tel IS NULL OR length(v_tel) < 10 OR length(v_tel) > 13 THEN
        RAISE EXCEPTION 'telefone sem DDD ou inválido';
      END IF;
      _chave := public.cliente_chave_do_telefone(v_tel);
      IF _chave IS NULL THEN RAISE EXCEPTION 'telefone inválido'; END IF;

      IF _qtd >= _max THEN
        _bloq := _bloq || jsonb_build_object('linha', coalesce((r->>'linha')::int, i),
                   'nome', v_nome, 'telefone', r->>'telefone', 'motivo', 'limite_do_disparo');
        CONTINUE;
      END IF;

      -- O mesmo cadeado da pessoa que o registro mãe usa.
      PERFORM pg_advisory_xact_lock(hashtext('cliente:' || _chave));

      -- Pediu para não ser procurado (cliente ou qualquer registro dele).
      IF EXISTS (SELECT 1 FROM public.clientes c WHERE c.chave_telefone = _chave AND c.opt_out)
         OR EXISTS (SELECT 1 FROM public.leads l
                     JOIN public.clientes c ON c.id = l.cliente_id
                    WHERE c.chave_telefone = _chave AND COALESCE(l.opt_out, false)) THEN
        _bloq := _bloq || jsonb_build_object('linha', coalesce((r->>'linha')::int, i),
                   'nome', v_nome, 'telefone', r->>'telefone', 'motivo', 'pediu_para_sair');
        CONTINUE;
      END IF;

      -- Já é do corretor: entra no disparo sem duplicar (o registro mais recente vivo).
      SELECT l.id INTO _lead FROM public.leads l
        JOIN public.clientes c ON c.id = l.cliente_id
       WHERE c.chave_telefone = _chave AND l.corretor_id = _corretor
         AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
       ORDER BY (l.status::text <> 'perdido') DESC, l.created_at DESC
       LIMIT 1;

      IF _lead IS NULL THEN
        -- Está no CRM com outro corretor (aberto): nunca entra.
        SELECT l.corretor_id INTO _outro FROM public.leads l
          JOIN public.clientes c ON c.id = l.cliente_id
         WHERE c.chave_telefone = _chave
           AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
         ORDER BY (l.corretor_id IS NOT NULL) DESC, l.created_at DESC
         LIMIT 1;
        IF FOUND THEN
          _bloq := _bloq || jsonb_build_object('linha', coalesce((r->>'linha')::int, i),
                     'nome', v_nome, 'telefone', r->>'telefone',
                     'motivo', CASE WHEN _outro IS NOT NULL THEN 'outra_carteira' ELSE 'ja_no_crm' END);
          CONTINUE;
        END IF;

        INSERT INTO public.leads (nome, telefone, email, zona, renda_informada, origem, status,
                                  classe_lead, corretor_id, canal_entrada, import_batch_id)
        VALUES (v_nome, v_tel, v_email, v_zona, v_renda, 'captacao_corretor', 'aguardando_retorno',
                'base', _corretor, 'importacao', _disparo)
        RETURNING id INTO _lead;
        -- Base fria não é tarefa do corretor: quem faz o primeiro contato é
        -- o Marquinhos. A cadência começa quando o cliente for qualificado.
        UPDATE public.leads
           SET cadencia_etapa = NULL, cadencia_inicio_ts = NULL, cadencia_prazo_ts = NULL
         WHERE id = _lead AND cadencia_etapa IS NOT NULL;

        INSERT INTO public.disparos_base_itens (disparo_id, lead_id, origem_item)
        VALUES (_disparo, _lead, 'novo');
        _novos := _novos + 1;
      ELSE
        INSERT INTO public.disparos_base_itens (disparo_id, lead_id, origem_item)
        VALUES (_disparo, _lead, 'ja_na_carteira')
        ON CONFLICT (disparo_id, lead_id) DO NOTHING;
        IF NOT FOUND THEN
          _bloq := _bloq || jsonb_build_object('linha', coalesce((r->>'linha')::int, i),
                     'nome', v_nome, 'telefone', r->>'telefone', 'motivo', 'repetido_na_planilha');
          CONTINUE;
        END IF;
        _ja := _ja + 1;
      END IF;
      _qtd := _qtd + 1;
    EXCEPTION
      WHEN OTHERS THEN
        _erros := _erros || jsonb_build_object('linha', coalesce((r->>'linha')::int, i),
                    'nome', v_nome, 'telefone', r->>'telefone', 'motivo', SQLERRM);
    END;
  END LOOP;

  UPDATE public.disparos_base SET atualizado_em = now() WHERE id = _disparo;
  RETURN jsonb_build_object('novos', _novos, 'ja_na_carteira', _ja,
                            'bloqueados', _bloq, 'erros', _erros);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4c. Resumo do custeio (empresa até a cota, depois rateio)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparo_base_custeio()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT COALESCE((public._disparo_base_cfg('cota_empresa_contatos') #>> '{}')::int, 1000) AS cota,
           COALESCE((public._disparo_base_cfg('rateio_corretor_apos_cota') #>> '{}')::numeric, 0.5) AS rateio
  ), env AS (
    SELECT count(*)::int AS enviados FROM public.disparos_base_itens WHERE enviado_em IS NOT NULL
  )
  SELECT jsonb_build_object(
    'cota_empresa', cfg.cota,
    'enviados', env.enviados,
    'restante_na_cota', GREATEST(cfg.cota - env.enviados, 0),
    'rateio_corretor_apos_cota', cfg.rateio,
    'corretor_paga_agora', CASE WHEN env.enviados >= cfg.cota THEN cfg.rateio ELSE 0 END)
  FROM cfg, env;
$function$;

-- -----------------------------------------------------------------------------
-- 5. Volta pela campanha: [BASE DO CORRETOR]
-- -----------------------------------------------------------------------------
-- Corpo vigente (20261020120000) + o ramo marcado. Ordem: reenvio →
-- negociação avançada → [BASE DO CORRETOR] → filho na roleta.
CREATE OR REPLACE FUNCTION public.registrar_volta_campanha(_lead jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _chave text := public.cliente_chave_do_telefone(_lead ->> 'telefone');
  _cid uuid;
  _id uuid;
  _tem boolean;
  _form jsonb;
  _herdados jsonb;
  _tentaram uuid[];
  _r jsonb;
  _cols text;
  _desconhecidas text;
  -- [BASE DO CORRETOR]
  _item record;
  _janela int;
BEGIN
  IF _lead IS NULL OR jsonb_typeof(_lead) <> 'object' THEN
    RAISE EXCEPTION 'registrar_volta_campanha: _lead precisa ser um objeto' USING ERRCODE = '22023';
  END IF;
  -- Telefone que não identifica ninguém: lead novo, como sempre foi.
  IF _chave IS NULL THEN
    RETURN jsonb_build_object('acao', 'cliente_novo');
  END IF;

  -- O mesmo cadeado do gatilho de vínculo: duas entradas da mesma pessoa ao
  -- mesmo tempo passam uma de cada vez, e a segunda já vê a primeira.
  PERFORM pg_advisory_xact_lock(hashtext('cliente:' || _chave));

  SELECT c.id INTO _cid FROM public.clientes AS c WHERE c.chave_telefone = _chave;
  _tem := _cid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.cliente_id = _cid
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
  );
  IF NOT _tem THEN
    RETURN jsonb_build_object('acao', 'cliente_novo');
  END IF;

  -- Reenvio: a mesma entrada chegando de novo.
  SELECT l.id INTO _id FROM public.leads AS l
   WHERE l.cliente_id = _cid AND l.via_webhook
     AND l.created_at >= now() - interval '10 minutes'
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
   ORDER BY l.created_at DESC LIMIT 1;
  IF _id IS NOT NULL THEN
    -- [DONO INATIVO 12/10/2026] Dono bloqueado/inativo nunca é devolvido.
    PERFORM public._reatribuir_se_dono_inativo(_id);
    RETURN jsonb_build_object('acao', 'reenvio', 'lead_id', _id, 'cliente_id', _cid,
      'corretor_id', (SELECT l.corretor_id FROM public.leads AS l
                       WHERE l.id = _id AND public._dono_ativo(l.corretor_id)));
  END IF;

  _id := public._cliente_lead_avancado(_cid);
  IF _id IS NOT NULL THEN
    -- [DONO INATIVO 12/10/2026] "Fica com o dono" só vale para dono ativo.
    PERFORM public._reatribuir_se_dono_inativo(_id);
    RETURN jsonb_build_object('acao', 'negociacao_avancada', 'lead_id', _id, 'cliente_id', _cid,
      'corretor_id', (SELECT l.corretor_id FROM public.leads AS l
                       WHERE l.id = _id AND public._dono_ativo(l.corretor_id)));
  END IF;

  -- [BASE DO CORRETOR 02/11/2026] Quem chega é o Marquinhos e a pessoa
  -- recebeu, dentro da janela, um disparo da base de um corretor: o lead
  -- fica com esse corretor. Dono inativo: a roleta (decisão do dono).
  IF COALESCE(_lead ->> 'origem', '') = 'chatbot' THEN
    _janela := COALESCE((public._disparo_base_cfg('janela_resposta_dias') #>> '{}')::int, 30);
    SELECT i.id AS item_id, i.disparo_id, l.id AS lead_id, l.corretor_id, l.status::text AS status
      INTO _item
      FROM public.disparos_base_itens AS i
      JOIN public.disparos_base AS d ON d.id = i.disparo_id
      JOIN public.leads AS l ON l.id = i.lead_id
     WHERE l.cliente_id = _cid
       AND l.corretor_id = d.corretor_id
       AND i.enviado_em IS NOT NULL
       AND i.enviado_em >= now() - make_interval(days => _janela)
       AND i.status <> 'saiu'
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
       AND l.status::text <> 'perdido'
     ORDER BY i.enviado_em DESC
     LIMIT 1;

    IF _item.item_id IS NOT NULL THEN
      UPDATE public.disparos_base_itens
         SET status = 'qualificado', qualificado_em = COALESCE(qualificado_em, now()),
             respondeu_em = COALESCE(respondeu_em, now())
       WHERE id = _item.item_id;

      IF public._dono_ativo(_item.corretor_id) THEN
        -- Sai da base fria: vira lead quente "qualificado" com o dono. Status
        -- que o corretor já trabalhou não volta para trás.
        UPDATE public.leads
           SET classe_lead = 'quente',
               status = CASE WHEN status::text IN ('novo','aguardando_retorno','aguardando_atendimento')
                             THEN 'qualificado'::public.lead_status ELSE status END,
               data_distribuicao = COALESCE(data_distribuicao, now())
         WHERE id = _item.lead_id;
      ELSE
        -- Classe quente antes da roleta: base iria para a roleta 'base'.
        UPDATE public.leads SET classe_lead = 'quente' WHERE id = _item.lead_id;
        PERFORM public._reatribuir_se_dono_inativo(_item.lead_id);
      END IF;

      RETURN jsonb_build_object('acao', 'base_do_corretor', 'lead_id', _item.lead_id,
        'cliente_id', _cid, 'disparo_id', _item.disparo_id,
        'corretor_id', (SELECT l.corretor_id FROM public.leads AS l
                         WHERE l.id = _item.lead_id AND public._dono_ativo(l.corretor_id)));
    END IF;
  END IF;

  -- O filho da campanha.
  _form := jsonb_strip_nulls(_lead - ARRAY[
    'id', 'cliente_id', 'registro_adicional', 'corretor_id', 'corretores_que_tentaram',
    'status', 'deleted_at', 'na_lixeira', 'created_at', 'updated_at', 'opt_out']);

  SELECT string_agg(k, ', ' ORDER BY k) INTO _desconhecidas
    FROM jsonb_object_keys(_form) AS k
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_attribute AS a
      WHERE a.attrelid = 'public.leads'::regclass AND a.attname = k
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '');
  IF _desconhecidas IS NOT NULL THEN
    RAISE EXCEPTION 'registrar_volta_campanha: campos que leads não tem: %', _desconhecidas
      USING ERRCODE = '22023';
  END IF;

  -- Da mãe, o que o formulário não trouxe; o lugar de interesse vem do anúncio.
  SELECT COALESCE(jsonb_object_agg(e.key, e.value -> 'valor'), '{}'::jsonb) INTO _herdados
    FROM public.clientes AS c, jsonb_each(c.dados) AS e
   WHERE c.id = _cid
     AND e.key = ANY (public._cliente_campos())
     AND e.key <> ALL (ARRAY['zona', 'bairro', 'projeto_nome', 'construtora'])
     AND NOT (_form ? e.key);

  SELECT COALESCE(array_agg(DISTINCT l.corretor_id), ARRAY[]::uuid[]) INTO _tentaram
    FROM public.leads AS l
   WHERE l.cliente_id = _cid AND l.corretor_id IS NOT NULL
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
     AND l.status::text <> 'perdido';

  _r := _herdados || _form || jsonb_build_object(
    'cliente_id', _cid,
    'registro_adicional', true,
    'corretores_que_tentaram', to_jsonb(_tentaram));

  SELECT string_agg(quote_ident(k), ', ' ORDER BY k) INTO _cols FROM jsonb_object_keys(_r) AS k;
  EXECUTE format(
    'INSERT INTO public.leads (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.leads, $1) RETURNING id',
    _cols)
    USING _r INTO _id;

  INSERT INTO public.cliente_eventos (cliente_id, lead_id, campo, valor_novo)
  VALUES (_cid, _id, '_registro_filho', jsonb_build_object(
    'adicional', true, 'porta', 'campanha',
    'campos_herdados', (SELECT count(*) FROM jsonb_object_keys(_herdados)),
    'corretores_excluidos', cardinality(_tentaram)));

  RETURN jsonb_build_object(
    'acao', 'registro_filho', 'lead_id', _id, 'cliente_id', _cid,
    'campos_herdados', COALESCE(
      (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(_herdados) AS k), '[]'::jsonb),
    'corretores_excluidos', cardinality(_tentaram));
END;
$function$;

-- -----------------------------------------------------------------------------
-- Permissões das funções
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._disparo_base_cfg(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disparo_base_e_piloto(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disparo_base_definir_piloto(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disparo_base_criar(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importar_base_corretor_lote(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disparo_base_custeio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_volta_campanha(jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._disparo_base_cfg(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.disparo_base_e_piloto(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disparo_base_definir_piloto(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disparo_base_criar(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_base_corretor_lote(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.disparo_base_custeio() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_volta_campanha(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
