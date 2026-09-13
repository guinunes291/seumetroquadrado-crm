-- ============================================================================
-- Bolsão — o lead parado em "fechado" não vai para o discador
-- ============================================================================
-- Ajuste de 20260914120000, motivado pela primeira medição em produção
-- (13/09/2026): `congelados_por_venda = 116` numa base viva de 58.168.
--
-- 116 parecia baixo demais, e a primeira hipótese foi venda legada sem
-- `vendas.lead_id` (a coluna é nullable e `legacy_id` existe). A hipótese está
-- ERRADA, e vale registrar por quê: as DUAS portas de entrada em
-- `contrato_fechado`/`pos_venda` já exigem venda aprovada apontando para o
-- lead — o trigger `trg_proteger_fechamento_insert` (20260719120000) no INSERT,
-- e `transicionar_lead` na transição, que é o único caminho para mudar status.
-- Logo, 116 é provavelmente o número real de vendas vivas desta casa, não um
-- furo de medição.
--
-- O furo que sobra é estreito e real: venda **cancelada, rejeitada ou
-- distratada** não reverte o status do lead. Ele fica parado em
-- `contrato_fechado` sem nenhuma venda viva — e `_lead_venda_viva` (correta em
-- respeitar o distrato) deixa de congelá-lo. No passo 1 isso significa que ele
-- entraria na lista do discador.
--
-- E aqui a resposta certa NÃO é congelar por status. Congelar por status
-- desfaria justamente a regra do distrato: negócio que caiu devolve o lead à
-- operação, e essa é a intenção. O que não pode acontecer é o discador ligar
-- para alguém que o CRM ainda descreve como "contrato fechado" — quem vê a
-- tela não tem como saber que a venda caiu.
--
-- Então são duas perguntas diferentes, e esta migration as mantém separadas:
--
--   `_lead_venda_viva(id)`  — POSSE. Respeita distrato. É o que vai reger a
--                             virada (passo 5) e a régua de devolução.
--   filtro de status aqui   — DISCAGEM. Lead que o CRM chama de fechado não
--                             entra na lista, mesmo sem venda viva. O conserto
--                             é a gestão corrigir o status, não o robô ligar.
--
-- Uma função só respondendo as duas seria a divergência que este repo
-- documenta contra: ela acertaria a lista e erraria a virada.
--
-- `status_de_venda_sem_venda_viva` no diagnóstico mede exatamente esse
-- descasamento — leads cujo status mente sobre a realidade. É número para a
-- gestão zerar, não para o código conviver com ele.
-- ============================================================================

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
    AND l.corretor_id IS NULL
    AND l.deleted_at IS NULL
    AND NOT l.na_lixeira
    AND NOT COALESCE(l.opt_out, false)
    AND public.telefone_discavel(l.telefone)
    AND NOT public._lead_venda_viva(l.id)
    -- Discagem: o CRM ainda chama este lead de fechado. Mesmo que a venda
    -- tenha caído, quem olha a tela não sabe disso — e um robô ligando para
    -- "contrato fechado" é constrangimento com o cliente, não oportunidade.
    AND l.status NOT IN ('contrato_fechado'::public.lead_status,
                         'pos_venda'::public.lead_status)
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
-- Diagnóstico: o descasamento entre status e venda, dimensionado
-- ---------------------------------------------------------------------------
-- A forma do retorno muda, e Postgres não deixa CREATE OR REPLACE trocar OUT
-- parameters: tem que derrubar antes.
DROP FUNCTION IF EXISTS public.bolsao_diagnostico_v1();

CREATE OR REPLACE FUNCTION public.bolsao_diagnostico_v1()
RETURNS TABLE (
  base_viva integer,
  com_dono integer,
  sem_dono integer,
  congelados_por_venda integer,
  status_de_venda integer,
  status_de_venda_sem_venda_viva integer,
  bolsao_elegivel integer,
  sem_dono_sem_telefone integer,
  sem_dono_opt_out integer,
  estoque_com_dono integer,
  estoque_com_dono_no_fundo integer,
  estoque_com_dono_congelado integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH vivos AS (
    SELECT
      l.id,
      l.corretor_id,
      l.status,
      l.origem,
      COALESCE(l.opt_out, false)           AS opt_out,
      public.telefone_discavel(l.telefone) AS discavel,
      l.status IN ('contrato_fechado'::public.lead_status,
                   'pos_venda'::public.lead_status) AS status_de_venda,
      public._lead_venda_viva(l.id)                 AS congelado
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND NOT l.na_lixeira
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'gestor')
        OR public.has_role(auth.uid(), 'superintendente')
      )
      AND public.is_active_member(auth.uid())
  ),
  estoque AS (
    SELECT v.*
    FROM vivos AS v
    WHERE v.corretor_id IS NOT NULL
      AND v.origem IN ('importacao'::public.lead_origem,
                       'google_sheets'::public.lead_origem,
                       'outro'::public.lead_origem)
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE corretor_id IS NOT NULL)::integer,
    count(*) FILTER (WHERE corretor_id IS NULL)::integer,
    count(*) FILTER (WHERE congelado)::integer,
    count(*) FILTER (WHERE status_de_venda)::integer,
    -- O status mente: diz fechado, mas não há venda viva por trás.
    count(*) FILTER (WHERE status_de_venda AND NOT congelado)::integer,
    count(*) FILTER (WHERE corretor_id IS NULL AND discavel
                       AND NOT opt_out AND NOT congelado
                       AND NOT status_de_venda)::integer,
    count(*) FILTER (WHERE corretor_id IS NULL AND NOT discavel)::integer,
    count(*) FILTER (WHERE corretor_id IS NULL AND opt_out)::integer,
    (SELECT count(*) FROM estoque)::integer,
    (SELECT count(*) FROM estoque
      WHERE status IN ('agendado'::public.lead_status,
                       'visita_realizada'::public.lead_status,
                       'proposta_enviada'::public.lead_status,
                       'analise_credito'::public.lead_status))::integer,
    (SELECT count(*) FROM estoque WHERE congelado)::integer
  FROM vivos;
$$;

REVOKE ALL ON FUNCTION public.bolsao_diagnostico_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bolsao_diagnostico_v1()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.bolsao_diagnostico_v1() IS
  'Dimensiona a virada do Bolsão. `status_de_venda_sem_venda_viva` mede leads '
  'cujo status diz fechado sem venda viva por trás — número para a gestão '
  'zerar. Ver docs/ops/bolsao-oportunidades-fatia4.md §11.';

DO $guard$
BEGIN
  -- A posse continua sendo decidida por venda viva, que respeita distrato.
  -- Se alguém trocar isso por um congelamento por status, a regra do distrato
  -- morre em silêncio: negócio que caiu deixa de devolver o lead.
  IF to_regprocedure('public._lead_venda_viva(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Bolsão: _lead_venda_viva sumiu — a posse perdeu a regra do distrato.';
  END IF;
END;
$guard$;
