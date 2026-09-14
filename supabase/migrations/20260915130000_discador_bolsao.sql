-- ============================================================================
-- Discador 3C Plus — a base do discador é o BOLSÃO (decisão 2026-09-15)
-- ============================================================================
-- "A base que o discador deve gerar é tudo que está fora da carteira ativa
-- dos corretores." No modelo em três camadas (docs/ops/bolsao-oportunidades-
-- fatia4.md §1) isso é o Bolsão: a base SEM dono. A Reserva fica de fora de
-- propósito — ela ainda tem dono, e lead com dono só chega ao discador pela
-- régua de devolução (§6), nunca por um robô discando a carteira alheia.
--
-- O que muda em relação ao desenho anterior (fila = base do próprio
-- corretor): a fila deixa de ser montada no navegador com o JWT do corretor
-- (a RLS não deixa, e não deve deixar, o corretor ler o telefone de um lead
-- que não é dele) e passa a ser RESERVADA no servidor, pela edge function
-- tcplus-campanha com service_role, a partir da mesma população de
-- bolsao_v1 — uma regra só para "quem está no Bolsão".
--
-- Peças:
-- * _bolsao_elegivel(leads)  — o predicado do Bolsão, fatorado de bolsao_v1
--                              (que passa a usá-lo) para o discador não ter
--                              uma segunda cópia da regra.
-- * bolsao_discagem          — reservas: qual corretor está discando qual
--                              lead, em que modo/lista, até quando. Evita
--                              dois corretores discarem o mesmo cliente ao
--                              mesmo tempo e permite retomar a sessão.
-- (Nomenclatura: as RPCs que ESCREVEM chamam-se discador_bolsao_*, não
-- bolsao_*: a guarda de tests/db/bolsao.test.ts exige que toda função
-- bolsao* continue só leitura, e o discador é quem escreve.)
-- * discador_bolsao_reservar_v1 — pega o lote (os mais frios primeiro),
--                              pulando quem está com o SDR, quem foi discado
--                              há pouco, quem está reservado e quem o próprio
--                              corretor devolveu há pouco (anti-ioiô).
--                              service_role só: devolve o telefone inteiro.
-- * discador_bolsao_liberar_v1 — solta as reservas (parar / encerrar).
-- * bolsao_discagem_minha_v1 — a sessão do corretor, ANONIMIZADA (telefone
--                              mascarado, sem dono anterior): alimenta o
--                              cockpit um a um e o card "discador rodando".
-- * discador_bolsao_assumir_v1 — quando o cliente ATENDE, o lead entra na
--                              carteira de quem falou. Sem isso o corretor não
--                              consegue registrar o resultado (RLS) nem
--                              trabalhar o lead; e um lead do Bolsão não tem
--                              dono a quem tirar. Discar sem atender NÃO dá
--                              posse — senão o discador esvaziaria o Bolsão
--                              para dentro das carteiras sem ninguém falar
--                              com ninguém.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) O predicado do Bolsão, numa função só
-- ---------------------------------------------------------------------------
-- Mesmas cláusulas de bolsao_v1 (20260914120000 + 130000 + 140000), na mesma
-- ordem. INVOKER e sem grant para authenticated, no padrão de
-- _lead_venda_viva: quem chama são as RPCs DEFINER.
CREATE OR REPLACE FUNCTION public._bolsao_elegivel(l public.leads)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT l.corretor_id IS NULL
    AND l.deleted_at IS NULL
    AND NOT l.na_lixeira
    AND NOT COALESCE(l.opt_out, false)
    AND public.telefone_discavel(l.telefone)
    AND NOT public._lead_venda_viva(l.id)
    AND l.status NOT IN ('contrato_fechado'::public.lead_status,
                         'pos_venda'::public.lead_status)
    AND NOT (
      l.status = 'perdido'::public.lead_status
      AND public.motivo_perda_sem_retrabalho(l.motivo_perda_categoria)
    );
$$;

REVOKE ALL ON FUNCTION public._bolsao_elegivel(public.leads) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._bolsao_elegivel(public.leads) IS
  'Quem esta no Bolsao (base sem dono, discavel, sem opt-out, sem venda viva, '
  'nao fechado, perdido so com motivo retrabalhavel). Fonte unica para '
  'bolsao_v1 e para o discador.';

CREATE OR REPLACE FUNCTION public.bolsao_v1(
  _busca text DEFAULT NULL,
  _limite integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone_mascarado text,
  status public.lead_status,
  origem public.lead_origem,
  projeto_nome text,
  bairro text,
  zona text,
  parado_desde timestamptz,
  dias_parado integer,
  tem_interacao boolean,
  tem_contato boolean,
  em_triagem_sdr boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    l.id,
    l.nome,
    public.telefone_mascarado(l.telefone),
    l.status,
    l.origem,
    l.projeto_nome,
    l.bairro,
    l.zona,
    COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at),
    GREATEST(0, (EXTRACT(day FROM now()
      - COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato),
                 l.created_at)))::integer),
    l.ultima_interacao IS NOT NULL,
    l.ultimo_contato IS NOT NULL,
    l.sdr_id IS NOT NULL
  FROM public.leads AS l
  WHERE public.is_active_member(auth.uid())
    AND public._bolsao_elegivel(l)
    AND (
      NULLIF(btrim(COALESCE(_busca, '')), '') IS NULL
      OR l.search_text ILIKE '%' || btrim(_busca) || '%'
      OR public.telefone_digits(l.telefone)
           LIKE '%' || public.telefone_digits(_busca) || '%'
    )
  ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato),
                    l.created_at) ASC,
           l.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(_limite, 50), 200))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;

-- ---------------------------------------------------------------------------
-- 2) Reservas de discagem
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bolsao_discagem (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- campanha = lista de mailing no 3C Plus; um_a_um = click-to-call sequencial.
  modo text NOT NULL CHECK (modo IN ('campanha', 'um_a_um')),
  campaign_id text,
  list_id text,
  reservado_em timestamptz NOT NULL DEFAULT now(),
  -- Reserva com validade: sessão abandonada não tranca o lead para sempre.
  expira_em timestamptz NOT NULL,
  -- Carimbo de quando o lead entrou na carteira do corretor (atendeu).
  assumido_em timestamptz
);

CREATE INDEX IF NOT EXISTS bolsao_discagem_corretor_idx
  ON public.bolsao_discagem (corretor_id, expira_em);

-- Só a service_role toca na tabela; o corretor lê a própria sessão pela RPC
-- anonimizada bolsao_discagem_minha_v1.
ALTER TABLE public.bolsao_discagem ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bolsao_discagem FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bolsao_discagem TO service_role;

COMMENT ON TABLE public.bolsao_discagem IS
  'Reservas do discador sobre o Bolsao: qual corretor esta discando qual lead, em que modo/lista e ate quando. Escrita so pelas RPCs discador_bolsao_* (service_role); leitura do corretor pela RPC anonimizada bolsao_discagem_minha_v1.';

-- ---------------------------------------------------------------------------
-- 3) Reservar um lote
-- ---------------------------------------------------------------------------
-- Devolve o telefone INTEIRO (é o que sobe para o mailing), por isso é
-- service_role só — nunca callable do navegador. Ordem: o mais frio primeiro
-- (mesma régua de bolsao_v1). FOR UPDATE SKIP LOCKED serializa duas sessões
-- simultâneas sem uma esperar a outra; o ON CONFLICT só toma reserva
-- expirada.
CREATE OR REPLACE FUNCTION public.discador_bolsao_reservar_v1(
  _corretor uuid,
  _quantidade integer DEFAULT NULL,
  _modo text DEFAULT 'campanha',
  _campaign_id text DEFAULT NULL,
  _list_id text DEFAULT NULL
)
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone text,
  projeto_nome text,
  status public.lead_status,
  dias_parado integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _cfg jsonb := COALESCE(public.gestao_config_valor('bolsao'), '{}'::jsonb);
  _lote integer;
  _rediscagem_dias integer := COALESCE((_cfg ->> 'discador_rediscagem_dias')::integer, 7);
  _reserva_horas integer := COALESCE((_cfg ->> 'discador_reserva_horas')::integer, 24);
  _anti_ioio_dias integer := COALESCE((_cfg ->> 'discador_anti_ioio_dias')::integer, 30);
BEGIN
  IF _corretor IS NULL OR NOT public.is_active_member(_corretor) THEN
    RAISE EXCEPTION 'corretor inexistente ou inativo' USING ERRCODE = '42501';
  END IF;
  IF _modo NOT IN ('campanha', 'um_a_um') THEN
    RAISE EXCEPTION 'modo inválido: %', _modo USING ERRCODE = '22023';
  END IF;
  _lote := LEAST(GREATEST(COALESCE(_quantidade, (_cfg ->> 'discador_lote')::integer, 200), 1), 500);

  RETURN QUERY
  WITH candidatos AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.projeto_nome,
      l.status,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS parado_desde
    FROM public.leads AS l
    WHERE public._bolsao_elegivel(l)
      -- Não atropela um SDR que já está com o lead na mão.
      AND l.sdr_id IS NULL
      -- Ninguém mais está discando este lead agora.
      AND NOT EXISTS (
        SELECT 1 FROM public.bolsao_discagem AS d
        WHERE d.lead_id = l.id AND d.expira_em > now()
      )
      -- Discado há pouco (por qualquer corretor, atendido ou não): espera.
      AND NOT EXISTS (
        SELECT 1 FROM public.chamadas AS c
        WHERE c.lead_id = l.id
          AND c.criado_em > now() - make_interval(days => _rediscagem_dias)
      )
      -- Anti-ioiô: o lead que este corretor devolveu há pouco não volta
      -- para ele pelo discador (mesma régua do puxar, §5.2 do documento).
      AND NOT EXISTS (
        SELECT 1 FROM public.devolucao_log AS dl
        WHERE dl.lead_id = l.id
          AND dl.corretor_anterior_id = _corretor
          AND dl.aplicado
          AND dl.created_at > now() - make_interval(days => _anti_ioio_dias)
      )
    ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) ASC,
             l.id ASC
    LIMIT _lote
    FOR UPDATE OF l SKIP LOCKED
  ),
  reservados AS (
    INSERT INTO public.bolsao_discagem
      (lead_id, corretor_id, modo, campaign_id, list_id, expira_em)
    SELECT c.id, _corretor, _modo, _campaign_id, _list_id,
           now() + make_interval(hours => _reserva_horas)
    FROM candidatos AS c
    ON CONFLICT (lead_id) DO UPDATE
      SET corretor_id = EXCLUDED.corretor_id,
          modo = EXCLUDED.modo,
          campaign_id = EXCLUDED.campaign_id,
          list_id = EXCLUDED.list_id,
          reservado_em = now(),
          expira_em = EXCLUDED.expira_em,
          assumido_em = NULL
      WHERE public.bolsao_discagem.expira_em <= now()
    RETURNING public.bolsao_discagem.lead_id AS reservado_id
  )
  SELECT
    c.id,
    c.nome,
    c.telefone,
    c.projeto_nome,
    c.status,
    GREATEST(0, (EXTRACT(day FROM now() - c.parado_desde))::integer)
  FROM candidatos AS c
  JOIN reservados AS r ON r.reservado_id = c.id
  ORDER BY c.parado_desde ASC, c.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.discador_bolsao_reservar_v1(uuid, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discador_bolsao_reservar_v1(uuid, integer, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.discador_bolsao_reservar_v1(uuid, integer, text, text, text) IS
  'Reserva um lote do Bolsao para o discador do corretor (os mais frios primeiro; pula SDR, rediscagem recente, reservados e anti-ioio). Devolve telefone inteiro: service_role so (tcplus-campanha).';

-- ---------------------------------------------------------------------------
-- 4) Liberar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discador_bolsao_liberar_v1(
  _corretor uuid,
  _list_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _n integer;
BEGIN
  IF _corretor IS NULL THEN
    RAISE EXCEPTION 'corretor obrigatório' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.bolsao_discagem AS d
  WHERE d.corretor_id = _corretor
    AND (_list_id IS NULL OR d.list_id = _list_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.discador_bolsao_liberar_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discador_bolsao_liberar_v1(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) A sessão do corretor, anonimizada
-- ---------------------------------------------------------------------------
-- O que o cockpit um a um e o card "discador rodando" mostram: nome, telefone
-- MASCARADO (a discagem passa pelo CRM — a máscara é o que mantém a carteira
-- auditável, §5.2 do documento), status, projeto, frieza, e o que já
-- aconteceu na sessão (discado / atendido / entrou na carteira).
CREATE OR REPLACE FUNCTION public.bolsao_discagem_minha_v1()
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone_mascarado text,
  status public.lead_status,
  projeto_nome text,
  dias_parado integer,
  modo text,
  list_id text,
  reservado_em timestamptz,
  expira_em timestamptz,
  assumido_em timestamptz,
  discado boolean,
  atendido boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    d.lead_id,
    l.nome,
    public.telefone_mascarado(l.telefone),
    l.status,
    l.projeto_nome,
    GREATEST(0, (EXTRACT(day FROM now()
      - COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)))::integer),
    d.modo,
    d.list_id,
    d.reservado_em,
    d.expira_em,
    d.assumido_em,
    EXISTS (
      SELECT 1 FROM public.chamadas AS c
      WHERE c.lead_id = d.lead_id AND c.corretor_id = d.corretor_id
        AND c.criado_em >= d.reservado_em
    ),
    EXISTS (
      SELECT 1 FROM public.chamadas AS c
      WHERE c.lead_id = d.lead_id AND c.corretor_id = d.corretor_id
        AND c.criado_em >= d.reservado_em
        AND c.status IN ('atendida', 'falando', 'concluida')
    )
  FROM public.bolsao_discagem AS d
  JOIN public.leads AS l ON l.id = d.lead_id
  WHERE public.is_active_member(auth.uid())
    AND d.corretor_id = auth.uid()
    AND d.expira_em > now()
  ORDER BY d.reservado_em ASC,
           COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) ASC,
           d.lead_id ASC;
$$;

REVOKE ALL ON FUNCTION public.bolsao_discagem_minha_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bolsao_discagem_minha_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.bolsao_discagem_minha_v1() IS
  'A sessao de discagem do proprio corretor sobre o Bolsao, anonimizada (telefone mascarado, sem dono anterior). Alimenta o cockpit um a um e o card do discador.';

-- ---------------------------------------------------------------------------
-- 6) Assumir: quem atende entra na carteira de quem falou
-- ---------------------------------------------------------------------------
-- Chamada pelo webhook tcplus-webhook (service_role) no primeiro atendimento
-- real. Guarda: só lead SEM dono, fora da triagem do SDR e sem venda viva —
-- um lead com dono nunca troca de mão por aqui (isso é transferência, e
-- passa pela gestão). Status novo/aguardando_corretor vira
-- aguardando_atendimento pela RPC oficial (é a caixa de entrada do
-- corretor); os demais ficam como estão até a qualificação mover.
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

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado)
  VALUES
    (_lead, _corretor, 'automatica'::public.distribuicao_tipo,
     COALESCE(NULLIF(btrim(_motivo), ''), 'Discador: cliente atendeu'),
     'discador_bolsao', 'sucesso');

  IF _l.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status) THEN
    PERFORM public.transicionar_lead(
      _lead, 'aguardando_atendimento'::public.lead_status,
      'Atendido pelo discador (Bolsão)');
  END IF;

  RETURN jsonb_build_object('ok', true, 'motivo', 'assumido',
                            'status_anterior', _l.status);
END;
$$;

REVOKE ALL ON FUNCTION public.discador_bolsao_assumir_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discador_bolsao_assumir_v1(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.discador_bolsao_assumir_v1(uuid, uuid, text) IS
  'Lead do Bolsao que ATENDEU o discador entra na carteira de quem falou (so lead sem dono, fora do SDR, sem venda viva). Chamada pelo tcplus-webhook. Log em distribution_log (regra discador_bolsao).';

-- ---------------------------------------------------------------------------
-- 7) Configuração (gestao_config.bolsao) — sem sobrescrever o que existe
-- ---------------------------------------------------------------------------
UPDATE public.gestao_config
   SET valor = valor || jsonb_build_object(
         'discador_lote', 200,
         'discador_rediscagem_dias', 7,
         'discador_reserva_horas', 24,
         'discador_anti_ioio_dias', 30,
         'discador_assume_ao_atender', true
       ),
       descricao = COALESCE(descricao, '') ||
         ' Discador: discador_lote (leads por sessao), discador_rediscagem_dias (nao redisca quem foi discado ha menos de N dias), discador_reserva_horas (validade da reserva), discador_anti_ioio_dias, discador_assume_ao_atender (lead que atende entra na carteira de quem falou).'
 WHERE chave = 'bolsao'
   AND NOT (valor ? 'discador_lote');

-- ---------------------------------------------------------------------------
-- 8) Guarda de sanidade
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF (SELECT p.provolatile FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'bolsao_v1') = 'v' THEN
    RAISE EXCEPTION 'bolsao_v1 continua so leitura: nao pode virar VOLATILE.';
  END IF;
  IF to_regprocedure('public.discador_bolsao_reservar_v1(uuid, integer, text, text, text)') IS NULL
     OR to_regprocedure('public.discador_bolsao_assumir_v1(uuid, uuid, text)') IS NULL
     OR to_regprocedure('public.bolsao_discagem_minha_v1()') IS NULL THEN
    RAISE EXCEPTION 'Discador/Bolsao: RPC esperada nao foi criada.';
  END IF;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
