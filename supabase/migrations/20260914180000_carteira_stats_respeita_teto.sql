-- ============================================================================
-- Gestão de carteira: a carteira ativa respeita o teto de 65
-- ============================================================================
-- `carteira_stats_por_corretor_v1` (20260914170000) contava como "ativa" TUDO
-- que está em tratativa com sinal de vida — sem teto. Mas a regra da operação
-- é que o corretor tem no máximo `capacidade_leads_ativos_por_corretor` (65)
-- em tratativa; o que passa disso não é carteira ativa, é excedente.
--
-- Colunas novas, e nenhuma delas esconde nada:
--
--   `ativa`         passa a ser LEAST(em tratativa, teto) — o que ele deve
--                   trabalhar hoje.
--   `acima_do_teto` é o excedente. Ele NÃO some da tela: vira um número
--                   próprio, porque um corretor com 90 em tratativa é
--                   informação de gestão, não detalhe a esconder. Mostrar 65
--                   e calar os 25 seria a tela mentindo por omissão.
--   `teto`          sai na resposta para a tela não precisar fixar 65 no
--                   código: o dia em que a gestão mudar a config, a tela
--                   acompanha sozinha.
--   `dias_atendimento` / `dias_avancado` saem pelo mesmo motivo. A tela
--                   precisa separar "em tratativa" de "parado" na LISTA de
--                   leads, e se ela fixar 7/30 no código passa a existir um
--                   segundo lugar guardando o prazo — que é exatamente a
--                   divergência que este arquivo evita no teto.
--
-- O teto vem de `gestao_config_valor('capacidade_leads_ativos_por_corretor')`,
-- a MESMA fonte que `carteira_ativa_config()` usa desde a Fatia 3. Um segundo
-- lugar guardando o mesmo número faria a Fila Única mostrar um teto e a gestão
-- outro no dia em que a config mudasse.
--
-- O teto é POR CORRETOR. A linha dos leads sem dono (`corretor_id IS NULL`)
-- não é a carteira de ninguém, então ela NÃO é limitada: cortar o balcão em 65
-- seria inventar um número que não existe.
--
-- QUAIS 65 são os ativos, quando há excedente, é decidido por
-- `carteira_ativa_v1` pelas faixas (fundo -> resgate -> conversa -> sla). Esta
-- RPC é um agregado por corretor: ela conta quantos, não escolhe quais.
-- ============================================================================

DROP FUNCTION IF EXISTS public.carteira_stats_por_corretor_v1();

CREATE OR REPLACE FUNCTION public.carteira_stats_por_corretor_v1()
RETURNS TABLE (
  corretor_id uuid,
  total bigint,
  ativa bigint,
  acima_do_teto bigint,
  prospeccao bigint,
  parada bigint,
  fundo bigint,
  ganhos bigint,
  perdidos bigint,
  teto integer,
  dias_atendimento integer,
  dias_avancado integer
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
  _teto  int := GREATEST(
    COALESCE((public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int, 65), 1);
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
      b.eh_fundo,
      -- Recente pela régua da própria fase: o fundo do funil tem 30 dias,
      -- o resto tem 7. Mesmos prazos que a devolução aplica.
      (b.parado_desde > now() - make_interval(
         days => CASE WHEN b.eh_fundo THEN _d_av ELSE _d_ini END)) AS recente,
      (b.st IN ('novo','aguardando_atendimento','aguardando_corretor')) AS eh_prospeccao,
      (b.st IN ('contrato_fechado','pos_venda')) AS eh_ganho,
      (b.st = 'perdido') AS eh_perdido
    FROM base AS b
  ),
  agregado AS (
    SELECT
      c.corretor_id AS dono,
      count(*)::bigint AS total,
      -- Em tratativa, SEM teto: é a matéria-prima das duas colunas seguintes.
      count(*) FILTER (
        WHERE NOT c.eh_prospeccao AND NOT c.eh_ganho AND NOT c.eh_perdido
          AND c.recente)::bigint AS em_tratativa,
      count(*) FILTER (WHERE c.eh_prospeccao)::bigint AS prospeccao,
      -- PARADA: o que a régua de devolução leva. Fundo parado conta aqui
      -- também — é o grupo que mais custa dinheiro parado.
      count(*) FILTER (
        WHERE NOT c.eh_prospeccao AND NOT c.eh_ganho AND NOT c.eh_perdido
          AND NOT c.recente)::bigint AS parada,
      count(*) FILTER (WHERE c.eh_fundo)::bigint AS fundo,
      count(*) FILTER (WHERE c.eh_ganho)::bigint AS ganhos,
      count(*) FILTER (WHERE c.eh_perdido)::bigint AS perdidos
    FROM classificado AS c
    GROUP BY c.corretor_id
  )
  SELECT
    a.dono,
    a.total,
    -- O teto é por corretor; a linha do balcão (sem dono) não é limitada.
    CASE WHEN a.dono IS NULL THEN a.em_tratativa
         ELSE LEAST(a.em_tratativa, _teto::bigint) END,
    CASE WHEN a.dono IS NULL THEN 0::bigint
         ELSE GREATEST(a.em_tratativa - _teto::bigint, 0::bigint) END,
    a.prospeccao,
    a.parada,
    a.fundo,
    a.ganhos,
    a.perdidos,
    _teto,
    _d_ini,
    _d_av
  FROM agregado AS a;
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_stats_por_corretor_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_stats_por_corretor_v1()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_stats_por_corretor_v1() IS
  'Carteira por corretor: ativa (limitada ao teto), acima_do_teto, prospeccao '
  'e parada, mais o teto e os prazos da regua de posse. O teto vem de '
  'gestao_config, a mesma fonte da Fila Unica.';

-- O teto e os prazos têm que sair de um lugar só. Se alguém fixar 65 ou 7/30
-- aqui dentro, a Fila Única e a gestão passam a discordar no dia em que a
-- config mudar — e ninguém descobre isso olhando a tela.
DO $guard$
DECLARE
  _src text := (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'carteira_stats_por_corretor_v1');
BEGIN
  IF _src NOT LIKE '%capacidade_leads_ativos_por_corretor%' THEN
    RAISE EXCEPTION 'O teto da gestão precisa vir de gestao_config, não do código.';
  END IF;
  IF _src NOT LIKE '%posse_dias_atendimento%' OR _src NOT LIKE '%posse_dias_avancado%' THEN
    RAISE EXCEPTION 'Os prazos precisam vir de distribuicao_settings, não do código.';
  END IF;
END;
$guard$;
