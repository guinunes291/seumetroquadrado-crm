-- ============================================================================
-- Gestão de carteira: separar o que é carteira do que é prospecção
-- ============================================================================
-- `leads_stats_por_corretor` (a RPC que a tela de Leads por corretor usa hoje)
-- devolve quatro números: total, em_atendimento, aguardando, ganhos, perdidos.
-- Medido em 14/09/2026, o "aguardando" da casa são 6.186 leads com dono — e é
-- ele que domina a tela e esconde o que interessa.
--
-- O problema não é a contagem, é a pergunta. "Aguardando atendimento" mistura
-- duas coisas que o novo modelo separa:
--
--   PROSPECÇÃO — lead que chegou e ainda não teve primeiro contato. É trabalho
--   de topo de funil, mora em /prospeccao, e não deveria ocupar a leitura de
--   carteira do gestor.
--
--   CARTEIRA — o que está em tratativa: qualificação, atendimento e fundo do
--   funil, COM atividade recente. É por isso que o gestor abre a tela.
--
-- E um terceiro grupo que hoje não tem nome e é o mais importante de ver:
--
--   PARADA — com dono, fora do fundo, sem atividade no prazo. É exatamente o
--   que a régua de devolução leva embora. Dar um número a isso transforma a
--   tela num painel de higiene: o gestor vê a limpeza acontecer.
--
-- Os prazos são os mesmos da régua de posse (`posse_dias_atendimento` e
-- `posse_dias_avancado`, 7 e 30) — a tela e a régua não podem contar tempo de
-- formas diferentes, ou o gestor vê um número e a operação executa outro.
--
-- O relógio é o mesmo da higiene, da Fila Única e do Bolsão:
-- `COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)`.
--
-- A RPC antiga continua existindo e não muda: outras telas a usam, e trocar
-- a semântica dela por baixo seria a pior forma de fazer esta mudança.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.carteira_stats_por_corretor_v1()
RETURNS TABLE (
  corretor_id uuid,
  total bigint,
  ativa bigint,
  prospeccao bigint,
  parada bigint,
  fundo bigint,
  ganhos bigint,
  perdidos bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _gestor boolean;
  _equipe uuid[];
  _d_ini int := COALESCE((public.get_dist_setting('posse_dias_atendimento') #>> '{}')::int, 7);
  _d_av  int := COALESCE((public.get_dist_setting('posse_dias_avancado') #>> '{}')::int, 30);
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _gestor  := public.has_role(_caller, 'gestor'::public.app_role);
  -- Escopo igual ao da RPC antiga: fora da gestão devolve 42501, nunca uma
  -- lista vazia. Lista vazia e "não pode ver" levam a decisões opostas.
  IF NOT (_ve_tudo OR _gestor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  WITH base AS (
    SELECT
      l.corretor_id,
      l.status::text AS st,
      (l.status IN ('agendado'::public.lead_status,
                    'visita_realizada'::public.lead_status,
                    'proposta_enviada'::public.lead_status,
                    'analise_credito'::public.lead_status)) AS eh_fundo,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS parado_desde
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND (
        _ve_tudo
        OR l.corretor_id = _caller
        OR l.corretor_id = ANY(_equipe)
        OR l.corretor_id IS NULL
      )
  ),
  classificado AS (
    SELECT
      b.corretor_id,
      b.st,
      b.eh_fundo,
      -- Recente pela régua da própria fase: o fundo do funil tem 30 dias,
      -- o resto tem 7. Mesmos prazos que a devolução aplica.
      (b.parado_desde > now() - make_interval(
         days => CASE WHEN b.eh_fundo THEN _d_av ELSE _d_ini END)) AS recente,
      (b.st IN ('novo','aguardando_atendimento','aguardando_corretor')) AS eh_prospeccao,
      (b.st IN ('contrato_fechado','pos_venda')) AS eh_ganho,
      (b.st = 'perdido') AS eh_perdido
    FROM base AS b
  )
  SELECT
    c.corretor_id,
    count(*)::bigint,
    -- ATIVA: em tratativa e com sinal de vida.
    count(*) FILTER (
      WHERE NOT c.eh_prospeccao AND NOT c.eh_ganho AND NOT c.eh_perdido
        AND c.recente)::bigint,
    count(*) FILTER (WHERE c.eh_prospeccao)::bigint,
    -- PARADA: o que a régua de devolução leva. Fundo parado conta aqui
    -- também — é o grupo que mais custa dinheiro parado.
    count(*) FILTER (
      WHERE NOT c.eh_prospeccao AND NOT c.eh_ganho AND NOT c.eh_perdido
        AND NOT c.recente)::bigint,
    count(*) FILTER (WHERE c.eh_fundo)::bigint,
    count(*) FILTER (WHERE c.eh_ganho)::bigint,
    count(*) FILTER (WHERE c.eh_perdido)::bigint
  FROM classificado AS c
  GROUP BY c.corretor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_stats_por_corretor_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_stats_por_corretor_v1()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_stats_por_corretor_v1() IS
  'Carteira por corretor separada em ativa / prospecção / parada, com os '
  'mesmos prazos da régua de posse. Ver docs/ops/bolsao-oportunidades-fatia4.md.';
