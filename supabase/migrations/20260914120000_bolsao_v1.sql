-- ============================================================================
-- Bolsão de oportunidades — Fatia 4, PASSO 1: só leitura
-- ============================================================================
-- Desenho e medições: docs/ops/bolsao-oportunidades-fatia4.md.
--
-- O modelo em três camadas: carteira ativa (65, com dono, trabalho diário),
-- Reserva (com dono, excedente qualificado esperando vaga) e Bolsão (SEM dono,
-- base geral da casa, matéria-prima do discador e da equipe de SDR).
--
-- Esta migration NÃO muda o dono de lead nenhum. Nada aqui escreve em `leads`.
-- Ela dá nome e forma ao que já existe — a casa tem 40.046 leads sem dono
-- hoje — e responde duas das perguntas do §8 do documento antes de a virada
-- acontecer. Puxar, transferir e a régua de devolução são os passos 3 a 6.
--
-- Por que só leitura primeiro (§9): virar antes de o Bolsão ser utilizável é
-- tirar lead do corretor sem dar nada em troca. A ordem aqui não é preciosismo
-- técnico — é o que decide se a equipe compra a mudança.
--
-- O Bolsão NÃO é conceito novo no schema. `leads.classe_lead` já vale
-- 'quente' | 'base' desde 20260826120000, e o motor de SDR, a régua de
-- follow-up e a distribuição v2 já devolvem lead para a base exatamente
-- assim: corretor_anterior_id := corretor_id, corretor_id := NULL,
-- classe_lead := 'base'. Esta fatia nomeia o trilho que já estava lá.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Congelamento por venda
-- ---------------------------------------------------------------------------
-- "Não devemos mexer em leads com status de venda já" — a regra nº 1 da
-- diretoria, e a de maior precedência no §4 do documento.
--
-- Venda viva é exatamente o conjunto que o índice `uq_vendas_lead_ativa` já
-- protege: rascunho, pendente ou aprovada. Reusar esse recorte (em vez de
-- inventar outro) garante que o congelamento e a unicidade de venda falem da
-- mesma coisa, e o índice parcial responde a consulta sem varrer `vendas`.
--
-- Distrato é a exceção da exceção: a venda caiu, o lead volta a ser lead.
--
-- INVOKER e sem grant para `authenticated`, no padrão de
-- `_carteira_classificar`: quem chama de fora são as RPCs DEFINER abaixo, que
-- devolvem o congelamento como COLUNA. Exposta como função pública, ela viraria
-- uma sonda: qualquer corretor poderia varrer uuids perguntando "esse tem
-- venda?" sobre leads que não enxerga.
CREATE OR REPLACE FUNCTION public._lead_venda_viva(_lead uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendas AS v
    WHERE v.lead_id = _lead
      AND v.status_venda IN ('rascunho'::public.status_venda,
                             'pendente'::public.status_venda,
                             'aprovada'::public.status_venda)
      AND NOT v.distrato
  );
$$;

REVOKE ALL ON FUNCTION public._lead_venda_viva(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._lead_venda_viva(uuid) IS
  'Lead congelado por venda viva (rascunho/pendente/aprovada, sem distrato). '
  'Interno: as RPCs do Bolsão devolvem isto como coluna. Ver '
  'docs/ops/bolsao-oportunidades-fatia4.md §4.';

-- ---------------------------------------------------------------------------
-- 2) Telefone discável
-- ---------------------------------------------------------------------------
-- O Bolsão só vale o que o discador consegue discar. 10 dígitos é o piso de um
-- fixo com DDD; 11 é o celular. Reusa `telefone_digits`, que já é a função que
-- o dedup usa — um normalizador só na casa.
CREATE OR REPLACE FUNCTION public.telefone_discavel(_telefone text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT length(public.telefone_digits(_telefone)) BETWEEN 10 AND 13;
$$;

-- Máscara para a tela do Bolsão: o corretor vê que há telefone e reconhece o
-- número se já falou com o cliente, mas não consegue LIGAR sem puxar o lead.
-- Sem isso, "puxar" vira opcional — bastaria copiar o número da tela e ligar
-- por fora do CRM, que é justamente como a carteira deixa de ser auditável.
CREATE OR REPLACE FUNCTION public.telefone_mascarado(_telefone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN length(public.telefone_digits(_telefone)) < 6 THEN NULL
    ELSE '(' || substr(public.telefone_digits(_telefone), 1, 2) || ') '
      || repeat('•', length(public.telefone_digits(_telefone)) - 6)
      || substr(public.telefone_digits(_telefone),
                length(public.telefone_digits(_telefone)) - 3, 4)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3) O Bolsão
-- ---------------------------------------------------------------------------
-- Quem está no Bolsão hoje: lead vivo, SEM dono, com telefone discável, sem
-- opt-out e sem venda viva.
--
-- `opt_out` é exclusão dura e não negociável: o Bolsão alimenta discador e
-- SDR, e lead que pediu para não ser contatado não pode entrar nessa fila.
-- É a mesma guarda que o motor de SDR já aplica (20260904102000).
--
-- ANONIMATO: nem `corretor_id` nem `corretor_anterior_id` saem daqui, e o
-- telefone sai mascarado. `em_triagem_sdr` existe para o discador não atropelar
-- um SDR que já está com o lead na mão.
--
-- DEFINER com guarda de membro ativo: o Bolsão é a base geral da casa, e é
-- proposital que ele mostre lead que NÃO é seu — é para isso que ele serve. A
-- guarda é `is_active_member`, não `pode_acessar_lead`, mas o preço disso é
-- pago na coluna: o que sai é despersonalizado.
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
    AND (
      NULLIF(btrim(COALESCE(_busca, '')), '') IS NULL
      OR l.search_text ILIKE '%' || btrim(_busca) || '%'
      OR public.telefone_digits(l.telefone)
           LIKE '%' || public.telefone_digits(_busca) || '%'
    )
  -- O mais frio primeiro: numa base de mineração, quem está parado há mais
  -- tempo é quem menos corre risco de atropelar conversa viva. É um primeiro
  -- corte, para calibrar com o que a tela de busca medir (§9, passo 2).
  ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato),
                    l.created_at) ASC,
           l.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(_limite, 50), 200))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.bolsao_v1(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bolsao_v1(text, integer, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.bolsao_v1(text, integer, integer) IS
  'Base geral sem dono — discador e SDR. Anonimizada: sem corretor, telefone '
  'mascarado. Ver docs/ops/bolsao-oportunidades-fatia4.md §1 e §5.';

-- ---------------------------------------------------------------------------
-- 4) Diagnóstico da virada
-- ---------------------------------------------------------------------------
-- Responde as medições 1 e 2 do §8 do documento — as que faltavam para
-- dimensionar a virada — e é repetível: ela vai ser rodada de novo no dia de
-- virar, e depois, para comparar.
--
-- A terceira medição do §8 (distribuição de `ultima_interacao` dentro dos
-- 2.304 com 3+ toques) saiu de cena: ela existia para calibrar
-- `puxar_frio_dias`, e a diretoria fixou o prazo em 7 dias.
--
-- ESTOQUE, no sentido do §4: importacao, google_sheets e outro. Não são canais
-- de aquisição, são despejos de dados. Todo o resto — facebook, chatbot,
-- impulso_smq (custeado pela empresa), SDR, captação do corretor, indicação,
-- plantão, whatsapp, telefone, site, ação de rua — é lead conquistado ou pago,
-- e não vira estoque comum.
CREATE OR REPLACE FUNCTION public.bolsao_diagnostico_v1()
RETURNS TABLE (
  base_viva integer,
  com_dono integer,
  sem_dono integer,
  congelados_por_venda integer,
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
      COALESCE(l.opt_out, false)          AS opt_out,
      public.telefone_discavel(l.telefone) AS discavel,
      public._lead_venda_viva(l.id)        AS congelado
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
    count(*) FILTER (WHERE corretor_id IS NULL AND discavel
                       AND NOT opt_out AND NOT congelado)::integer,
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
  'Dimensiona a virada do Bolsão (§8 de docs/ops/bolsao-oportunidades-fatia4.md). '
  'Só gestão: fora dela devolve zeros, não erro — é um painel, não um gate.';

-- ---------------------------------------------------------------------------
-- 5) Guarda de sanidade
-- ---------------------------------------------------------------------------
-- Nada aqui pode escrever em `leads`. Se uma revisão futura transformar uma
-- destas funções em VOLATILE, é porque alguém começou a escrever — e o passo 1
-- deixou de ser só leitura sem ninguém perceber.
DO $guard$
DECLARE
  _volatil text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO _volatil
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('bolsao_v1', 'bolsao_diagnostico_v1',
                      '_lead_venda_viva', 'telefone_discavel',
                      'telefone_mascarado')
    AND p.provolatile = 'v';

  IF _volatil IS NOT NULL THEN
    RAISE EXCEPTION
      'Fatia 4 passo 1 é só leitura, mas estas funções são VOLATILE: %',
      _volatil;
  END IF;

  IF to_regprocedure('public.bolsao_v1(text, integer, integer)') IS NULL
     OR to_regprocedure('public.bolsao_diagnostico_v1()') IS NULL THEN
    RAISE EXCEPTION 'Bolsão: RPC esperada não foi criada.';
  END IF;
END;
$guard$;
