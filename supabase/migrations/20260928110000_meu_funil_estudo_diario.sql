-- Meu Funil — estudo diário obrigatório do corretor.
--
-- VERSÃO: nasceu como 20260927120000, número que colidiu com
-- 20260927120000_aprovacao_credito_dados (#215, mesclado minutos antes). O
-- runner identifica migration pela versão: com duas iguais, a segunda é
-- tratada como já aplicada e pulada. Renomeada para 20260928110000. O corpo é
-- idempotente (CREATE OR REPLACE / IF NOT EXISTS / DROP ... IF EXISTS), então
-- reaplicar num banco onde ela já rodou não muda nada.
--
-- Todo dia (fim de semana inclusive), antes das metas do dia, o corretor abre
-- o PRÓPRIO funil:
-- conversão por etapa, conversão por origem e a "matemática da venda"
-- (quantos leads / conversas / agendamentos / visitas / pastas para 1 venda).
--
-- Duas peças:
--   1. public.meu_funil_estudo(_dias) — leitura auto-escopada (auth.uid()).
--   2. public.funil_estudo_diario     — registro "estudei hoje" (1 linha por
--      corretor por dia), que destrava o CRM e dá à gestão o histórico de
--      quem estudou e qual foco escolheu.
--
-- RÉGUA (coorte de lead, não contagem de eventos):
--   "Dos leads que você RECEBEU no período, quantos CHEGARAM a cada etapa."
--   Recebido = COALESCE(data_distribuicao, created_at) na janela — mesma régua
--   de leads_recebidos em metrics.performance_corretor_mensal.
--   Etapas CUMULATIVAS: quem chegou à pasta também conta como quem agendou e
--   visitou. É o que torna "X agendamentos para 1 venda" sempre >= 1; na
--   contagem de eventos um lead que pulou etapa fazia a razão sair abaixo de 1.
--
-- POR QUE NÃO metrics.funil_coorte_mensal: aquela MV compara o ORDINAL de
-- funil_ordem com limiares fixos (>= 7 = venda), escritos antes da etapa
-- 'qualificacao_corretor' (20260811151000) empurrar a numeração. Aqui o
-- estágio sai de CONJUNTOS NOMEADOS de status — renumerar funil_ordem não
-- muda o resultado.
--
-- BASE IMPORTADA x FUNIL REAL:
--   origem 'importacao' e 'google_sheets' são cargas em lote (centenas de
--   contatos frios de uma vez). Somadas ao funil, fazem o corretor "precisar"
--   de 400 leads para 1 venda quando, no lead que chega quente, precisa de 30.
--   Elas saem do funil real e viram um bloco próprio ('base'). Exceção: lead
--   de base que o SDR reaqueceu e entregou (sdr_entregue_em) é oportunidade de
--   verdade e volta para o funil real — a mesma régua do grupo 'estoque' da
--   carteira ativa (20260925120000).

-- ---------------------------------------------------------------------------
-- Estágio do funil do corretor (1..6) a partir de um status nomeado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_funil_estagio(_status text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN _status IN ('qualificacao_corretor', 'em_atendimento', 'qualificado') THEN 2
    WHEN _status = 'agendado' THEN 3
    WHEN _status IN ('visita_realizada', 'proposta_enviada') THEN 4
    WHEN _status = 'analise_credito' THEN 5
    WHEN _status IN ('contrato_fechado', 'pos_venda') THEN 6
    ELSE 1
  END::smallint;
$$;
COMMENT ON FUNCTION public.meu_funil_estagio(text) IS
  'Estágio cumulativo do Meu Funil: 1 recebido, 2 conversou, 3 agendou, 4 visitou, 5 pasta (análise de crédito), 6 venda. Conjuntos nomeados de status — imune à renumeração de funil_ordem.';

-- ---------------------------------------------------------------------------
-- Coorte por lead (uso interno): um lead por linha com grupo e estágio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._meu_funil_coorte(
  _ini timestamptz,
  _fim timestamptz,
  _corretores uuid[]
)
RETURNS TABLE(
  lead_id uuid,
  corretor_id uuid,
  origem text,
  grupo text,
  estagio smallint,
  perdido boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.corretor_id,
    l.origem::text,
    CASE
      WHEN l.origem::text IN ('importacao', 'google_sheets') AND l.sdr_entregue_em IS NULL
        THEN 'base'
      ELSE 'real'
    END,
    GREATEST(
      -- Status atual (o piso), limitado à pasta: card em "contrato fechado"
      -- com a venda distratada não é venda — venda só pela regra `vendeu`.
      LEAST(public.meu_funil_estagio(l.status::text), 5),
      -- Maior etapa por onde o lead já passou (perdido depois de visitar
      -- continua contando a visita). Venda pelo histórico NÃO conta: um
      -- distrato deixa a transição para trás — venda vem das linhas abaixo.
      h.estagio_hist,
      -- Cliente respondeu (mensagem/ligação de ENTRADA) = conversa real,
      -- mesmo que o corretor não tenha movido o card.
      CASE WHEN h.respondeu THEN 2 ELSE 1 END,
      -- Agenda é fonte da verdade de agendamento e visita.
      CASE WHEN h.visitou THEN 4 WHEN h.agendou THEN 3 ELSE 1 END,
      CASE WHEN h.vendeu THEN 6 ELSE 1 END
    )::smallint,
    (l.status = 'perdido')
  FROM public.leads l
  CROSS JOIN LATERAL (
    SELECT
      -- COALESCE antes do LEAST: LEAST ignora NULL, e um lead SEM transição
      -- sairia com estágio 5 (pasta) em vez de 1.
      (SELECT LEAST(COALESCE(max(public.meu_funil_estagio(t.para_status::text)), 1), 5)
         FROM public.lead_status_transitions t
        WHERE t.lead_id = l.id) AS estagio_hist,
      EXISTS (SELECT 1 FROM public.interacoes i
               WHERE i.lead_id = l.id
                 AND i.direcao = 'entrada'
                 AND i.deleted_at IS NULL) AS respondeu,
      EXISTS (SELECT 1 FROM public.agendamentos a
               WHERE a.lead_id = l.id
                 AND a.tipo IN ('visita', 'reuniao')
                 AND NOT a.auto_gerado
                 AND a.deleted_at IS NULL
                 AND a.status <> 'cancelado') AS agendou,
      EXISTS (SELECT 1 FROM public.agendamentos a
               WHERE a.lead_id = l.id
                 AND a.tipo = 'visita'
                 AND a.status = 'realizado'
                 AND a.deleted_at IS NULL) AS visitou,
      (
        EXISTS (SELECT 1 FROM public.vendas v
                 WHERE v.lead_id = l.id
                   AND v.status_venda IN ('pendente', 'aprovada')
                   AND NOT v.distrato)
        OR (
          -- Legado sem linha em vendas: o status fechado vale, desde que não
          -- haja venda distratada/rejeitada/cancelada para o lead.
          l.status IN ('contrato_fechado', 'pos_venda')
          AND NOT EXISTS (SELECT 1 FROM public.vendas v
                           WHERE v.lead_id = l.id
                             AND (v.distrato OR v.status_venda IN ('rejeitada', 'cancelada')))
        )
      ) AS vendeu
  ) h
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.corretor_id = ANY(_corretores)
    AND COALESCE(l.data_distribuicao, l.created_at) >= _ini
    AND COALESCE(l.data_distribuicao, l.created_at) < _fim;
$$;
REVOKE ALL ON FUNCTION public._meu_funil_coorte(timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._meu_funil_coorte(timestamptz, timestamptz, uuid[]) TO service_role;
COMMENT ON FUNCTION public._meu_funil_coorte(timestamptz, timestamptz, uuid[]) IS
  'Uso interno de meu_funil_estudo: uma linha por lead recebido na janela, com grupo (real/base) e estágio cumulativo. Sem grant para authenticated — o escopo é decidido pela RPC pública.';

-- ---------------------------------------------------------------------------
-- RPC pública: o funil do PRÓPRIO usuário + a referência do time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_funil_estudo(_dias int DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _janela int := LEAST(365, GREATEST(7, COALESCE(_dias, 90)));
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _ini_dia date := _hoje - (_janela - 1);
  _ini timestamptz := (_ini_dia::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _fim timestamptz := ((_hoje + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _mes_ini date := date_trunc('month', _hoje)::date;
  _corretores uuid[];
  _minhas jsonb;
  _time jsonb;
  _vendas_mes int;
  _meta_mes int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Por origem, só do caller.
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.grupo DESC, x.recebidos DESC), '[]'::jsonb)
    INTO _minhas
  FROM (
    SELECT
      c.origem,
      c.grupo,
      count(*)::int                                 AS recebidos,
      count(*) FILTER (WHERE c.estagio >= 2)::int   AS conversou,
      count(*) FILTER (WHERE c.estagio >= 3)::int   AS agendou,
      count(*) FILTER (WHERE c.estagio >= 4)::int   AS visitou,
      count(*) FILTER (WHERE c.estagio >= 5)::int   AS pasta,
      count(*) FILTER (WHERE c.estagio >= 6)::int   AS vendas,
      count(*) FILTER (WHERE c.perdido)::int        AS perdidos
    FROM public._meu_funil_coorte(_ini, _fim, ARRAY[_uid]) c
    GROUP BY c.origem, c.grupo
  ) x;

  -- Referência do time: todos os corretores ativos, por grupo (sem nomes nem
  -- ids — é a régua de comparação, mesmo nível de exposição de
  -- metas_dia_taxas).
  SELECT array_agg(DISTINCT ur.user_id) INTO _corretores
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
   WHERE ur.role = 'corretor'
     AND p.status_conta = 'ativa';

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    INTO _time
  FROM (
    SELECT
      c.grupo,
      count(DISTINCT c.corretor_id)::int            AS corretores,
      count(*)::int                                 AS recebidos,
      count(*) FILTER (WHERE c.estagio >= 2)::int   AS conversou,
      count(*) FILTER (WHERE c.estagio >= 3)::int   AS agendou,
      count(*) FILTER (WHERE c.estagio >= 4)::int   AS visitou,
      count(*) FILTER (WHERE c.estagio >= 5)::int   AS pasta,
      count(*) FILTER (WHERE c.estagio >= 6)::int   AS vendas,
      count(*) FILTER (WHERE c.perdido)::int        AS perdidos
    FROM public._meu_funil_coorte(_ini, _fim, COALESCE(_corretores, ARRAY[]::uuid[])) c
    GROUP BY c.grupo
  ) x;

  -- Mês corrente (eventos, não coorte): vendas assinadas no mês — mesma
  -- régua de metas_dia_taxas — e a meta mensal que a gestão lançou em metas.
  SELECT count(*)::int INTO _vendas_mes
    FROM public.vendas v
   WHERE v.corretor_id = _uid
     AND v.status_venda IN ('pendente', 'aprovada')
     AND NOT v.distrato
     AND v.data_assinatura >= _mes_ini
     AND v.data_assinatura <= _hoje;

  SELECT max(m.meta_vendas)::int INTO _meta_mes
    FROM public.metas m
   WHERE m.corretor_id = _uid
     AND m.ano = EXTRACT(YEAR FROM _hoje)::int
     AND m.mes = EXTRACT(MONTH FROM _hoje)::int;

  RETURN jsonb_build_object(
    'dias', _janela,
    'inicio', _ini_dia,
    'fim', _hoje,
    'minhas', _minhas,
    'time', _time,
    'mes', jsonb_build_object(
      'inicio', _mes_ini,
      'vendas', COALESCE(_vendas_mes, 0),
      'meta_vendas', _meta_mes
    ),
    'atualizado_em', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.meu_funil_estudo(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_funil_estudo(int) TO authenticated, service_role;
COMMENT ON FUNCTION public.meu_funil_estudo(int) IS
  'Meu Funil (estudo diário do corretor): coorte dos leads RECEBIDOS nos últimos _dias (7..365), por origem e grupo (real × base importada), etapas cumulativas; referência agregada do time por grupo; vendas e meta do mês corrente. Auto-escopo por auth.uid().';

-- ---------------------------------------------------------------------------
-- Registro do estudo diário
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funil_estudo_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Dia em America/Sao_Paulo (calculado no cliente com esse fuso).
  dia date NOT NULL,
  -- Etapa que o corretor escolheu atacar hoje depois de ler o funil.
  foco text NOT NULL CHECK (foco IN ('volume', 'conversar', 'agendar', 'visitar', 'pasta', 'fechar')),
  -- Compromisso livre ("vou ligar para os 12 que não responderam").
  compromisso text CHECK (compromisso IS NULL OR char_length(compromisso) <= 500),
  -- Quanto tempo a tela ficou aberta até concluir — a gestão distingue quem
  -- leu de quem só clicou.
  segundos_na_tela integer NOT NULL DEFAULT 0 CHECK (segundos_na_tela >= 0),
  concluido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funil_estudo_diario_uk UNIQUE (corretor_id, dia)
);

CREATE INDEX IF NOT EXISTS idx_funil_estudo_diario_dia
  ON public.funil_estudo_diario (dia DESC, corretor_id);

GRANT SELECT, INSERT, UPDATE ON public.funil_estudo_diario TO authenticated;
GRANT ALL ON public.funil_estudo_diario TO service_role;

ALTER TABLE public.funil_estudo_diario ENABLE ROW LEVEL SECURITY;

-- Leitura: mesmo recorte de metas_dia_corretor (próprio, admin/super, gestor
-- da equipe).
DROP POLICY IF EXISTS "funil_estudo: leitura no escopo" ON public.funil_estudo_diario;
CREATE POLICY "funil_estudo: leitura no escopo" ON public.funil_estudo_diario
  FOR SELECT TO authenticated
  USING (
    corretor_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superintendente')
    OR (
      public.has_role(auth.uid(), 'gestor')
      AND corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "funil_estudo: corretor registra o proprio" ON public.funil_estudo_diario;
CREATE POLICY "funil_estudo: corretor registra o proprio" ON public.funil_estudo_diario
  FOR INSERT TO authenticated
  WITH CHECK (corretor_id = auth.uid());

DROP POLICY IF EXISTS "funil_estudo: corretor ajusta o proprio" ON public.funil_estudo_diario;
CREATE POLICY "funil_estudo: corretor ajusta o proprio" ON public.funil_estudo_diario
  FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid())
  WITH CHECK (corretor_id = auth.uid());

DROP TRIGGER IF EXISTS trg_funil_estudo_diario_updated ON public.funil_estudo_diario;
CREATE TRIGGER trg_funil_estudo_diario_updated
  BEFORE UPDATE ON public.funil_estudo_diario
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.funil_estudo_diario IS
  'Estudo diário do Meu Funil: uma linha por corretor por dia, gravada ao concluir a leitura obrigatória (foco escolhido, compromisso e tempo de tela).';
