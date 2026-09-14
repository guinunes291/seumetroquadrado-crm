-- ============================================================================
-- Discador sobre o Bolsão — "Atendidos": quem atende NÃO ganha dono
-- ============================================================================
-- Decisão do dono (2026-09-15): lead que atende o discador não entra na base
-- ativa do corretor. Ele vira um ATENDIDO — aparece numa aba própria para
-- quem falou com ele — mas continua no Bolsão, discável por outros
-- corretores, até que alguém avance o cliente de fase. A posse só acontece
-- nesse avanço: por padrão a partir de `agendado` (o CRM já trata agendado
-- como início do fundo do funil — docs/ops/carteira-ativa-40-fatia3.md §4.1 e
-- bolsao-oportunidades-fatia4.md §5.3); a lista de etapas é configuração
-- (gestao_config.bolsao.discador_posse_a_partir_de) para o dia em que a
-- régua for "estritamente depois de agendado".
--
-- Consequências que este desenho encarna:
-- * "Não entra nos 65" sai de graça: sem dono, o lead nunca é contado por
--   _carteira_classificar. Quando a posse chega (agendado), ele entra na faixa
--   fundo — e aí é trabalho do corretor, deve contar.
-- * O corretor trabalha o atendido SEM ser dono: a RLS de leads/interacoes
--   não deixaria; então as ações da aba passam por RPCs DEFINER que exigem
--   o registro de atendimento do próprio corretor (nota na timeline, ligar
--   de novo pelo CRM, assumir para agendar).
-- * Vários corretores podem ter o mesmo lead em "Atendidos" (o cliente
--   atendeu A hoje e B daqui a 8 dias). Quando um avança e ganha a posse, o
--   atendimento dos outros é encerrado com o motivo — a aba deles diz que o
--   lead ganhou dono, sem dizer quem (anonimato do Bolsão, §5.2).
--
-- Substitui a posse-ao-atender de 20260915130000 (discador_assume_ao_atender
-- sai da config; discador_bolsao_assumir_v1 continua, agora chamada só no
-- avanço de fase e pela aba de Atendidos).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Atendimentos do discador
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discador_atendimentos (
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  primeiro_atendimento_em timestamptz NOT NULL DEFAULT now(),
  ultimo_atendimento_em timestamptz NOT NULL DEFAULT now(),
  -- Chamadas distintas em que o cliente atendeu este corretor.
  atendimentos integer NOT NULL DEFAULT 1,
  ultima_chamada_id uuid REFERENCES public.chamadas(id) ON DELETE SET NULL,
  -- Encerrado quando o lead ganhou dono (posse_propria / posse_outro) ou
  -- saiu do Bolsão por outro caminho.
  encerrado_em timestamptz,
  encerrado_motivo text,
  PRIMARY KEY (lead_id, corretor_id)
);

CREATE INDEX IF NOT EXISTS discador_atendimentos_corretor_idx
  ON public.discador_atendimentos (corretor_id, encerrado_em, ultimo_atendimento_em DESC);
CREATE INDEX IF NOT EXISTS discador_atendimentos_lead_abertos_idx
  ON public.discador_atendimentos (lead_id) WHERE encerrado_em IS NULL;

ALTER TABLE public.discador_atendimentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.discador_atendimentos FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.discador_atendimentos TO service_role;

COMMENT ON TABLE public.discador_atendimentos IS
  'Leads do Bolsao que ATENDERAM o discador de um corretor (aba Atendidos). Nao da posse: o lead segue no Bolsao ate alguem avancar a fase. Escrita pelas RPCs discador_*; leitura do corretor por discador_atendidos_meus_v1 (anonimizada).';

-- ---------------------------------------------------------------------------
-- 2) Registrar o atendimento (webhook, service_role)
-- ---------------------------------------------------------------------------
-- Idempotente por chamada: os dois eventos da mesma ligação (conectada e
-- histórico) contam UM atendimento.
CREATE OR REPLACE FUNCTION public.discador_bolsao_atender_v1(
  _lead uuid,
  _corretor uuid,
  _chamada uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l record;
BEGIN
  IF _corretor IS NULL OR NOT public.is_active_member(_corretor) THEN
    RAISE EXCEPTION 'corretor inexistente ou inativo' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.corretor_id, l.deleted_at, l.na_lixeira
    INTO _l
  FROM public.leads AS l
  WHERE l.id = _lead;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _l.deleted_at IS NOT NULL OR _l.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_fora_da_base');
  END IF;
  -- Lead com dono não é atendido do Bolsão: é ligação da carteira de alguém.
  IF _l.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false,
      'motivo', CASE WHEN _l.corretor_id = _corretor THEN 'ja_e_seu' ELSE 'tem_dono' END);
  END IF;

  INSERT INTO public.discador_atendimentos (lead_id, corretor_id, ultima_chamada_id)
  VALUES (_lead, _corretor, _chamada)
  ON CONFLICT (lead_id, corretor_id) DO UPDATE
    SET ultimo_atendimento_em = now(),
        atendimentos = CASE
          WHEN EXCLUDED.ultima_chamada_id IS NOT NULL
           AND EXCLUDED.ultima_chamada_id IS NOT DISTINCT FROM public.discador_atendimentos.ultima_chamada_id
            THEN public.discador_atendimentos.atendimentos
          ELSE public.discador_atendimentos.atendimentos + 1
        END,
        ultima_chamada_id = COALESCE(EXCLUDED.ultima_chamada_id, public.discador_atendimentos.ultima_chamada_id),
        encerrado_em = NULL,
        encerrado_motivo = NULL;

  RETURN jsonb_build_object('ok', true, 'motivo', 'atendido');
END;
$$;

REVOKE ALL ON FUNCTION public.discador_bolsao_atender_v1(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discador_bolsao_atender_v1(uuid, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Assumir: agora encerra os atendimentos (o lead deixou o Bolsão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discador_bolsao_assumir_v1(
  _lead uuid,
  _corretor uuid,
  _motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l record;
BEGIN
  IF _corretor IS NULL OR NOT public.is_active_member(_corretor) THEN
    RAISE EXCEPTION 'corretor inexistente ou inativo' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.corretor_id, l.status, l.sdr_id, l.deleted_at, l.na_lixeira,
         l.corretores_que_tentaram
    INTO _l
  FROM public.leads AS l
  WHERE l.id = _lead
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _l.deleted_at IS NOT NULL OR _l.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_fora_da_base');
  END IF;
  IF _l.corretor_id = _corretor THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'ja_e_seu');
  END IF;
  IF _l.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tem_dono');
  END IF;
  IF _l.sdr_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'em_triagem_sdr');
  END IF;
  IF public._lead_venda_viva(_lead) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'venda_viva');
  END IF;

  UPDATE public.leads
     SET corretor_id = _corretor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         tentativas_redistribuicao = 0,
         via_webhook = false,
         corretores_que_tentaram = CASE
           WHEN _corretor = ANY (COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
             THEN _l.corretores_que_tentaram
           ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _corretor)
         END
   WHERE id = _lead;

  UPDATE public.bolsao_discagem AS d
     SET assumido_em = now()
   WHERE d.lead_id = _lead;

  -- O lead saiu do Bolsão: os atendimentos abertos se encerram — o de quem
  -- assumiu como "posse própria", os dos outros como "posse de outro" (a aba
  -- deles mostra que ganhou dono, sem dizer quem).
  UPDATE public.discador_atendimentos AS a
     SET encerrado_em = now(),
         encerrado_motivo = CASE WHEN a.corretor_id = _corretor THEN 'posse_propria' ELSE 'posse_outro' END
   WHERE a.lead_id = _lead AND a.encerrado_em IS NULL;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado)
  VALUES
    (_lead, _corretor, 'automatica'::public.distribuicao_tipo,
     COALESCE(NULLIF(btrim(_motivo), ''), 'Discador: avançou de fase'),
     'discador_bolsao', 'sucesso');

  IF _l.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status) THEN
    PERFORM public.transicionar_lead(
      _lead, 'aguardando_atendimento'::public.lead_status,
      'Assumido pelo discador (Bolsão)');
  END IF;

  RETURN jsonb_build_object('ok', true, 'motivo', 'assumido',
                            'status_anterior', _l.status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) A aba Atendidos do corretor (anonimizada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discador_atendidos_meus_v1()
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone_mascarado text,
  status public.lead_status,
  projeto_nome text,
  dias_parado integer,
  primeiro_atendimento_em timestamptz,
  ultimo_atendimento_em timestamptz,
  atendimentos integer,
  outros_corretores integer,
  tem_dono boolean,
  dono_sou_eu boolean,
  ainda_no_bolsao boolean,
  encerrado_em timestamptz,
  encerrado_motivo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    a.lead_id,
    l.nome,
    public.telefone_mascarado(l.telefone),
    l.status,
    l.projeto_nome,
    GREATEST(0, (EXTRACT(day FROM now()
      - COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)))::integer),
    a.primeiro_atendimento_em,
    a.ultimo_atendimento_em,
    a.atendimentos,
    (SELECT count(*)::integer FROM public.discador_atendimentos AS o
      WHERE o.lead_id = a.lead_id AND o.corretor_id <> a.corretor_id AND o.encerrado_em IS NULL),
    l.corretor_id IS NOT NULL,
    -- Lead sem dono compara NULL = uid -> NULL; a aba quer um booleano honesto.
    COALESCE(l.corretor_id = auth.uid(), false),
    public._bolsao_elegivel(l),
    a.encerrado_em,
    a.encerrado_motivo
  FROM public.discador_atendimentos AS a
  JOIN public.leads AS l ON l.id = a.lead_id
  WHERE public.is_active_member(auth.uid())
    AND a.corretor_id = auth.uid()
    AND l.deleted_at IS NULL
    AND NOT l.na_lixeira
    -- Encerrados ficam visíveis por 30 dias, com o motivo.
    AND (a.encerrado_em IS NULL OR a.encerrado_em > now() - interval '30 days')
  ORDER BY (a.encerrado_em IS NULL) DESC, a.ultimo_atendimento_em DESC, a.lead_id ASC;
$$;

REVOKE ALL ON FUNCTION public.discador_atendidos_meus_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discador_atendidos_meus_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.discador_atendidos_meus_v1() IS
  'Aba Atendidos: leads do Bolsao que atenderam o discador do proprio corretor, anonimizados (telefone mascarado, sem dono). Encerrados (ganharam dono) ficam 30 dias com o motivo.';

-- ---------------------------------------------------------------------------
-- 5) Nota na timeline de um atendido (sem posse)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discador_atendido_nota_v1(
  _lead uuid,
  _conteudo text,
  _tipo text DEFAULT 'nota'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(_conteudo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'conteúdo obrigatório' USING ERRCODE = '22023';
  END IF;
  IF _tipo NOT IN ('ligacao', 'whatsapp', 'nota') THEN
    RAISE EXCEPTION 'tipo inválido: %', _tipo USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.discador_atendimentos AS a
    WHERE a.lead_id = _lead AND a.corretor_id = _uid AND a.encerrado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'lead não é um atendido seu' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _lead, _uid, _tipo::public.interacao_tipo,
    CASE WHEN _tipo = 'nota' THEN 'interna' ELSE 'saida' END::public.interacao_direcao,
    'Atendido do discador (Bolsão)',
    btrim(_conteudo),
    jsonb_build_object('fonte', 'discador_atendido')
  )
  RETURNING id INTO _id;

  RETURN jsonb_build_object('ok', true, 'interacao_id', _id);
END;
$$;

REVOKE ALL ON FUNCTION public.discador_atendido_nota_v1(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discador_atendido_nota_v1(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Assumir pela aba: só quem atendeu, e só para avançar de fase
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discador_atendido_assumir_v1(_lead uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.discador_atendimentos AS a
    WHERE a.lead_id = _lead AND a.corretor_id = _uid AND a.encerrado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'lead não é um atendido seu' USING ERRCODE = '42501';
  END IF;
  RETURN public.discador_bolsao_assumir_v1(
    _lead, _uid, 'Discador: corretor assumiu o atendido para avançar de fase');
END;
$$;

REVOKE ALL ON FUNCTION public.discador_atendido_assumir_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discador_atendido_assumir_v1(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Configuração: posse a partir de qual etapa
-- ---------------------------------------------------------------------------
UPDATE public.gestao_config
   SET valor = (valor - 'discador_assume_ao_atender')
               || jsonb_build_object(
                    'discador_posse_a_partir_de',
                    jsonb_build_array('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')),
       descricao = COALESCE(descricao, '') ||
         ' discador_posse_a_partir_de: etapas em que o lead atendido pelo discador ganha dono (quem avancou); antes disso segue no Bolsao, discavel por outros.'
 WHERE chave = 'bolsao'
   AND NOT (valor ? 'discador_posse_a_partir_de');

DO $guard$
BEGIN
  IF to_regprocedure('public.discador_bolsao_atender_v1(uuid, uuid, uuid)') IS NULL
     OR to_regprocedure('public.discador_atendidos_meus_v1()') IS NULL
     OR to_regprocedure('public.discador_atendido_nota_v1(uuid, text, text)') IS NULL
     OR to_regprocedure('public.discador_atendido_assumir_v1(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Discador/Atendidos: RPC esperada nao foi criada.';
  END IF;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
