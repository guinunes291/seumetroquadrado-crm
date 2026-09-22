-- ===========================================================================
-- CARTEIRA — base em formação: a cadência sai dos 65
-- ===========================================================================
-- Decisão do dono (22/09/2026):
--
--   "A carteira de 65 leads do corretor deve ter apenas leads avançados e
--    realmente tratados. Os toques de cadência entram numa BASE EM FORMAÇÃO;
--    vai para a base dos 65 apenas o que avançar de fase ou agendar para
--    frente."
--
-- Carteira ativa: 20260913120000 e seguintes. Cadência: 20260921120000 a
-- 20260924120000. Desenho: docs/ops/carteira-ativa-40-fatia3.md §11.
--
-- ---------------------------------------------------------------------------
-- O QUE A REGRA MUDA NO CLASSIFICADOR
-- ---------------------------------------------------------------------------
-- A faixa `sla` ("chegaram há até 72 h e ainda não levaram 3 tentativas", cap
-- 20) ERA a população que a cadência passou a governar: lead novo entra em D1
-- pelo gatilho de atribuição. Medido no harness antes deste arquivo:
--
--   lead novo da roleta:  cadencia_etapa=D1  faixa=sla  ativa=true
--
-- Ou seja, o lead que ninguém ainda conseguiu falar ocupava uma das 65 vagas.
-- A faixa `sla` sai e entra `formacao`: quem está em D1/D2/D3. Formação NÃO é
-- carteira ativa (não ocupa vaga dos 65) e NÃO é Reserva (não está guardado
-- esperando — está sendo trabalhado todo dia, com prazo). É um terceiro
-- estado, e os consumidores passam a distingui-lo.
--
-- Precedência: fundo > formacao > resgate > conversa > reserva. O fundo vem
-- antes porque status avançado é inequívoco; a formação vem antes de resgate
-- e conversa porque, com a saída automática abaixo, um lead que ainda está em
-- D1/D2/D3 é por construção um lead que NÃO avançou.
--
-- O cap de formação herda o número do `cap_sla` (20): é a mesma população com
-- outro nome, e herdar evita inventar um número novo. Se o admin tinha
-- ajustado `cap_sla`, o ajuste vem junto.
--
-- ---------------------------------------------------------------------------
-- 🔴 O FURO QUE ESTA REGRA FECHA: A CADÊNCIA NÃO SABIA QUE O LEAD AVANÇOU
-- ---------------------------------------------------------------------------
-- A única saída da cadência para a qualificação era o botão "Cliente
-- respondeu". Se o corretor agendava a visita pela ficha, o status ia para
-- `agendado` e `cadencia_etapa` continuava em D1. Quando o prazo do D1
-- vencia, `cadencia_vencidos` chamava `_cadencia_devolver_roleta`, que tira o
-- corretor e volta o status para `aguardando_corretor` — apagando a visita
-- e entregando o cliente a outro corretor. É o oposto do §4.1 do desenho da
-- carteira ("fundo do funil nunca é devolvido por robô").
--
-- "Avançou" passa a ter a MESMA definição de `lead_sem_proximo_passo` (fonte
-- única do "tem próximo passo") mais o status:
--
--   status muda para além da prospecção   -> gatilho BEFORE em leads
--     (novo/aguardando_* -> em_atendimento, qualificação, fundo, perdido)
--   próximo passo escrito no lead         -> mesmo gatilho BEFORE em leads
--     (`transicionar_lead` grava `proximo_followup` direto, sem tarefa)
--   tarefa com vencimento futuro          -> gatilho AFTER em tarefas
--   agendamento futuro                    -> gatilho AFTER em agendamentos
--
-- Uma exceção deliberada: tarefa AUTOMÁTICA não conta. Ela não é compromisso
-- do corretor com o cliente — é o sistema lembrando. Se algum dia voltar um
-- gatilho que cria tarefa para todo lead novo (como o de follow-up automático
-- que existiu até 20260708155905), a cadência não pode encerrar em massa.
--
-- A saída grava o MESMO evento do botão (`cadencia_etapa`, de_estado ->
-- 'respondeu'), com `via` dizendo por onde saiu. Sem isso o painel da
-- cadência subcontaria a taxa de resposta por etapa: quem agenda pela ficha
-- respondeu, só não apertou o botão.
--
-- ---------------------------------------------------------------------------
-- OS OUTROS LUGARES QUE ACUSAVAM A FORMAÇÃO
-- ---------------------------------------------------------------------------
-- A cadência não escreve `proxima_acao`/`proximo_followup`, por desenho
-- (20260921120100). Então, pela regra geral, TODO lead em cadência está "sem
-- próximo passo". Três leituras acusavam o corretor por isso:
--
--   regua_devolucao_candidatos_v1  lead admitido pela Fase 0, antes do 1º
--                                  toque, era candidato 'sem_passo' e ia para
--                                  o Bolsão no meio da cadência (reproduzido)
--   fila_equipe_v1                 coluna "sem próximo passo" do gestor
--   carteira_stats_por_corretor_v1 "sem passo vivo" e "ativa"
--
-- `lead_sem_proximo_passo` NÃO muda: é fonte única de três telas e mudar o
-- significado dela mudaria as três em silêncio. Quem muda são os consumidores,
-- cada um dizendo explicitamente que formação não entra.
--
-- Rollback: reaplicar as definições de 20260915150000 (classificador),
-- 20260913170118 (reserva, sombra, vagas), 20260914190000 (fila_equipe,
-- stats), 20260914200848 (régua), 20260923120000 (admissão) e dropar os três
-- gatilhos `trg_cadencia_sai_*`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Config: cap da formação e a parte dela que o estoque pode ocupar
-- ---------------------------------------------------------------------------
-- `valor` vem por ÚLTIMO no `||`: se o admin já tiver definido as chaves, o
-- valor dele fica. Só preenche o que não existe.
--
-- `cap_formacao_estoque` (metade do cap): a Fase 0 compete com a roleta pelas
-- mesmas vagas de formação, e um lead pago que chegou agora vale mais que um
-- lead de estoque parado há 20 dias. O estoque nunca enche a formação além
-- da metade — a outra metade é sempre da roleta.
UPDATE public.gestao_config
   SET valor = jsonb_build_object(
                 'cap_formacao',
                 COALESCE((valor ->> 'cap_formacao')::int, (valor ->> 'cap_sla')::int, 20),
                 'cap_formacao_estoque',
                 COALESCE((valor ->> 'cap_formacao_estoque')::int,
                          COALESCE((valor ->> 'cap_formacao')::int, (valor ->> 'cap_sla')::int, 20) / 2))
               || valor,
       atualizado_em = now()
 WHERE chave = 'carteira_ativa';

-- ---------------------------------------------------------------------------
-- 2) Saída automática da cadência quando o lead avança por fora da tela
-- ---------------------------------------------------------------------------
-- A janela pré-resposta: os status em que `cadencia_iniciar` aceita começar.
-- Sair dela é avançar (ou perder).
CREATE OR REPLACE FUNCTION public._cadencia_status_na_janela(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _status IN ('novo', 'aguardando_atendimento', 'aguardando_corretor',
                     'em_atendimento', 'aguardando_retorno');
$$;

-- A PROSPECÇÃO dentro da janela: onde o lead está antes de alguém falar com
-- ele. Mover o lead DAQUI para qualquer status além é o corretor declarando
-- que começou a atender — é avançar de fase, mesmo que `em_atendimento` ainda
-- esteja dentro da janela.
--
-- Por que a janela e a prospecção são coisas diferentes: `cadencia_iniciar`
-- aceita `em_atendimento` e `aguardando_retorno` para que a Fase 0 possa pôr
-- na cadência o estoque parado nesses status há semanas. Esse lead está em
-- cadência de propósito, e o ESTADO dele não é avanço. Já a TRANSIÇÃO de
-- `novo` para `em_atendimento`, feita pela ficha durante a cadência, é.
CREATE OR REPLACE FUNCTION public._cadencia_status_prospeccao(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _status IN ('novo', 'aguardando_atendimento', 'aguardando_corretor');
$$;

-- Para onde a cadência vai quando o lead sai por fora do botão. Perda manual
-- não é resposta: vai para 'encerrado' e não entra na taxa de resposta.
CREATE OR REPLACE FUNCTION public._cadencia_destino_saida(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN _status = 'perdido' THEN 'encerrado' ELSE 'respondeu' END;
$$;

-- O evento é o MESMO que `cadencia_marcar_respondeu` grava — o painel conta
-- resposta por `payload.para_estado = 'respondeu'` e etapa por `de_estado`.
CREATE OR REPLACE FUNCTION public._cadencia_evento_saida(
  _lead uuid, _de text, _para text, _via text, _status text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead, 'cadencia_etapa',
    CASE
      WHEN _para = 'encerrado'
        THEN 'Lead marcado como perdido durante a cadência — cadência encerrada.'
      WHEN _via = 'status'
        THEN 'Lead avançou para ' || _status || ' fora da Fila do Dia — saiu da cadência para a carteira.'
      WHEN _via = 'tarefa'
        THEN 'Próximo passo agendado (tarefa) — lead saiu da cadência para a carteira.'
      WHEN _via = 'proximo_passo'
        THEN 'Próximo passo definido no lead — saiu da cadência para a carteira.'
      WHEN _via = 'agendamento'
        THEN 'Compromisso agendado com o cliente — lead saiu da cadência para a carteira.'
      ELSE 'Lead já tinha avançado — saiu da cadência para a carteira (' || _via || ').'
    END,
    'cadencia',
    jsonb_build_object('de_estado', _de, 'para_estado', _para, 'via', _via, 'status', _status)
  );
$$;

REVOKE ALL ON FUNCTION public._cadencia_evento_saida(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- A saída para os caminhos que NÃO estão num UPDATE de leads (tarefa,
-- agendamento, e a correção dos que já avançaram).
--
-- NÃO mexe no status, e isso é diferente do botão de propósito. O botão
-- "Cliente respondeu" passa `novo` para `em_atendimento` porque o corretor
-- DECLAROU que falou com o cliente. Aqui só se sabe que existe um passo
-- agendado — o que basta para sair da formação (é o "agendar para frente"
-- da regra), mas não para afirmar em que ponto da venda o lead está. Mudar o
-- status também gravaria uma transição na trilha do lead que ninguém fez: a
-- suíte pegou isso na mescla de duplicados, com uma interação a mais.
CREATE OR REPLACE FUNCTION public._cadencia_sair_por_avanco(_lead uuid, _via text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l record;
  _para text;
BEGIN
  SELECT id, cadencia_etapa, status::text AS status
    INTO _l
    FROM public.leads
   WHERE id = _lead
   FOR UPDATE;
  IF NOT FOUND OR _l.cadencia_etapa IS NULL OR _l.cadencia_etapa NOT IN ('D1','D2','D3') THEN
    RETURN false;
  END IF;

  _para := CASE
             WHEN public._cadencia_status_na_janela(_l.status) THEN 'respondeu'
             ELSE public._cadencia_destino_saida(_l.status)
           END;

  UPDATE public.leads
     SET cadencia_etapa    = _para,
         cadencia_prazo_ts = NULL
   WHERE id = _lead
     AND cadencia_etapa = _l.cadencia_etapa;

  PERFORM public._cadencia_evento_saida(_lead, _l.cadencia_etapa, _para, _via, _l.status);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._cadencia_sair_por_avanco(uuid, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._cadencia_sair_por_avanco(uuid, text) IS
  'Tira o lead de D1/D2/D3 quando ele avançou por fora do botão Cliente '
  'respondeu (tarefa humana futura, agendamento futuro, ou status fora da '
  'janela). Grava o mesmo evento do botão, com via. Sem grant: quem chama '
  'são os gatilhos e a correção desta migration.';

-- 2a) Status e próximo passo escrito no lead: BEFORE, no mesmo UPDATE. O
--     lead já está mudando; a etapa muda junto, na mesma linha, sem um
--     segundo UPDATE.
CREATE OR REPLACE FUNCTION public.tg_cadencia_sai_por_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _via text;
BEGIN
  -- `NEW.cadencia_etapa IS NOT DISTINCT FROM OLD` deixa passar quem já está
  -- mexendo na etapa no mesmo UPDATE: o botão, a devolução à roleta e o
  -- encerramento da própria cadência decidem o destino sozinhos.
  IF OLD.cadencia_etapa IS NULL
     OR OLD.cadencia_etapa NOT IN ('D1','D2','D3')
     OR NEW.cadencia_etapa IS DISTINCT FROM OLD.cadencia_etapa THEN
    RETURN NEW;
  END IF;

  -- Sair para qualquer status além da prospecção é avanço (ou perda). Voltar
  -- para `novo`/`aguardando_*` não é: é redistribuição, e quem redistribui
  -- já cuida da etapa.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public._cadencia_status_prospeccao(NEW.status::text) THEN
    _via := 'status';
  -- Próximo passo escrito direto no lead, no futuro. `proximo_followup` também
  -- é o espelho que `sync_proximo_followup` mantém a partir das tarefas —
  -- inclusive as AUTOMÁTICAS. Se o espelho aponta para uma tarefa automática,
  -- não é compromisso do corretor, e a exceção do gatilho de tarefas não pode
  -- entrar por esta porta.
  ELSIF NEW.proximo_followup IS DISTINCT FROM OLD.proximo_followup
     AND NEW.proximo_followup > now()
     AND NOT EXISTS (
       SELECT 1 FROM public.tarefas t
        WHERE t.lead_id = NEW.id
          AND t.origem_automatica
          AND t.deleted_at IS NULL
          AND t.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
          AND t.data_vencimento = NEW.proximo_followup) THEN
    _via := 'proximo_passo';
  ELSE
    RETURN NEW;
  END IF;

  NEW.cadencia_etapa    := public._cadencia_destino_saida(NEW.status::text);
  NEW.cadencia_prazo_ts := NULL;
  PERFORM public._cadencia_evento_saida(
    NEW.id, OLD.cadencia_etapa, NEW.cadencia_etapa, _via, NEW.status::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cadencia_sai_por_status ON public.leads;
CREATE TRIGGER trg_cadencia_sai_por_status
  BEFORE UPDATE OF status, proximo_followup ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_cadencia_sai_por_status();

-- 2b) Tarefa humana com vencimento futuro.
CREATE OR REPLACE FUNCTION public.tg_cadencia_sai_por_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND NOT COALESCE(NEW.origem_automatica, false)
     AND NEW.deleted_at IS NULL
     AND NEW.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
     AND NEW.data_vencimento IS NOT NULL
     AND NEW.data_vencimento > now()
     AND EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = NEW.lead_id AND l.cadencia_etapa IN ('D1','D2','D3')) THEN
    PERFORM public._cadencia_sair_por_avanco(NEW.lead_id, 'tarefa');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cadencia_sai_por_tarefa ON public.tarefas;
CREATE TRIGGER trg_cadencia_sai_por_tarefa
  AFTER INSERT OR UPDATE OF data_vencimento, status ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.tg_cadencia_sai_por_tarefa();

-- 2c) Agendamento futuro (visita, ligação marcada, reunião). Mesmo recorte de
--     `lead_sem_proximo_passo`.
CREATE OR REPLACE FUNCTION public.tg_cadencia_sai_por_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND NEW.deleted_at IS NULL
     AND NEW.data_inicio >= now()
     AND NEW.status::text NOT IN ('cancelado', 'realizado', 'nao_compareceu')
     AND EXISTS (SELECT 1 FROM public.leads l
                  WHERE l.id = NEW.lead_id AND l.cadencia_etapa IN ('D1','D2','D3')) THEN
    PERFORM public._cadencia_sair_por_avanco(NEW.lead_id, 'agendamento');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cadencia_sai_por_agendamento ON public.agendamentos;
CREATE TRIGGER trg_cadencia_sai_por_agendamento
  AFTER INSERT OR UPDATE OF data_inicio, status ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_cadencia_sai_por_agendamento();

-- 2d) Correção dos que JÁ avançaram antes deste arquivo. São os leads em
--     risco na próxima execução de `cadencia_vencidos` (11h): o gatilho
--     protege dali em diante, não os que já estão lá.
--
--     Olha o ESTADO, não a transição: status fora da janela, ou passo vivo
--     (tarefa humana futura, agendamento futuro, espelho futuro que não é
--     tarefa automática). `em_atendimento` parado não entra — é o estoque que
--     a Fase 0 admitiu de propósito.
--
--     Função, e não bloco anônimo, por dois motivos: a suíte consegue testar
--     o trecho que protege os leads reais, e o admin pode rodar de novo se um
--     dia algum caminho escrever passo com os gatilhos desligados.
CREATE OR REPLACE FUNCTION public.cadencia_corrigir_avancados()
RETURNS TABLE(por_status integer, por_passo integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _r record;
  _n_status int := 0;
  _n_passo int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin corrige a cadência' USING ERRCODE = '42501';
  END IF;

  FOR _r IN
    SELECT l.id,
           NOT public._cadencia_status_na_janela(l.status::text) AS por_status
      FROM public.leads l
     WHERE l.cadencia_etapa IN ('D1','D2','D3')
       AND l.deleted_at IS NULL
       AND (
         NOT public._cadencia_status_na_janela(l.status::text)
         OR EXISTS (SELECT 1 FROM public.tarefas t
                     WHERE t.lead_id = l.id
                       AND t.deleted_at IS NULL
                       AND NOT COALESCE(t.origem_automatica, false)
                       AND t.status IN ('pendente'::public.tarefa_status,
                                        'em_andamento'::public.tarefa_status)
                       AND t.data_vencimento > now())
         OR EXISTS (SELECT 1 FROM public.agendamentos a
                     WHERE a.lead_id = l.id
                       AND a.deleted_at IS NULL
                       AND a.data_inicio >= now()
                       AND a.status::text NOT IN ('cancelado', 'realizado', 'nao_compareceu'))
         OR (l.proximo_followup > now()
             AND NOT EXISTS (SELECT 1 FROM public.tarefas t
                              WHERE t.lead_id = l.id
                                AND t.origem_automatica
                                AND t.deleted_at IS NULL
                                AND t.status IN ('pendente'::public.tarefa_status,
                                                 'em_andamento'::public.tarefa_status)
                                AND t.data_vencimento = l.proximo_followup))
       )
  LOOP
    IF public._cadencia_sair_por_avanco(
         _r.id, 'correcao_' || CASE WHEN _r.por_status THEN 'status' ELSE 'passo' END) THEN
      IF _r.por_status THEN _n_status := _n_status + 1; ELSE _n_passo := _n_passo + 1; END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT _n_status, _n_passo;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_corrigir_avancados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_corrigir_avancados() TO authenticated, service_role;

DO $corrige$
DECLARE
  _r record;
BEGIN
  SELECT * INTO _r FROM public.cadencia_corrigir_avancados();
  RAISE NOTICE 'cadência: % lead(s) já avançados por status e % com passo combinado saíram da formação',
    _r.por_status, _r.por_passo;
END
$corrige$;

-- ---------------------------------------------------------------------------
-- 3) O classificador: `sla` sai, `formacao` entra
-- ---------------------------------------------------------------------------
-- Assinatura idêntica à de 20260915150000 — os cinco consumidores seguem
-- compilando. Tudo que não é a faixa nova está como estava.
CREATE OR REPLACE FUNCTION public._carteira_classificar(_corretor uuid)
 RETURNS TABLE(lead_id uuid, nome text, telefone text, status text, temperatura text, projeto_nome text, created_at timestamp with time zone, movimento timestamp with time zone, dias_parado integer, proximo_followup timestamp with time zone, valor numeric, faixa text, posicao integer, ativa boolean, motivo text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH cfg AS (
    SELECT
      COALESCE((c.v ->> 'teto')::int, 65)                            AS teto,
      COALESCE((c.v ->> 'cap_conversa')::int, 23)                    AS cap_conversa,
      COALESCE((c.v ->> 'cap_resgate')::int, 13)                     AS cap_resgate,
      COALESCE((c.v ->> 'conversa_dias')::int, 7)                    AS conversa_dias,
      COALESCE((c.v ->> 'devolver_sem_movimento_dias')::int, 30)     AS sem_movimento_dias,
      COALESCE((c.v ->> 'devolver_sem_proximo_passo_dias')::int, 2)  AS sem_passo_dias
    FROM (SELECT public.carteira_ativa_config() AS v) AS c
  ),
  vivos AS (
    SELECT
      l.id,
      l.nome,
      l.telefone,
      l.status::text                                                       AS status,
      l.temperatura::text                                                  AS temperatura,
      COALESCE(NULLIF(l.projeto_nome, ''), pr.nome)                        AS projeto_nome,
      l.created_at,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento,
      l.proximo_followup,
      CASE WHEN pr.sob_consulta THEN NULL ELSE pr.preco_a_partir END       AS valor,
      -- A base em formação: quem a cadência está trabalhando agora.
      (l.cadencia_etapa IN ('D1', 'D2', 'D3'))                              AS em_formacao,
      l.cadencia_etapa
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    WHERE l.corretor_id = _corretor
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
  ),
  -- "Respondeu" é caro de calcular (interacoes + mensagens + chamadas), e só
  -- pode ser verdade para quem teve movimento na janela da conversa. Restringir
  -- o conjunto ANTES da chamada é o que mantém a RPC dentro do timeout numa
  -- carteira de 1.500 leads. Formação fica de fora: a faixa dela não depende
  -- disso.
  recentes AS (
    SELECT v.id
    FROM vivos AS v, cfg
    WHERE v.movimento >= now() - make_interval(days => cfg.conversa_dias)
      AND NOT COALESCE(v.em_formacao, false)
  ),
  resp AS (
    SELECT r.lead_id, r.aguardando
    FROM public.conversas_aguardando_resposta(ARRAY(SELECT id FROM recentes)) AS r
  ),
  marcados AS (
    SELECT
      v.*,
      GREATEST(0, (EXTRACT(EPOCH FROM (now() - v.movimento)) / 86400)::int) AS dias_parado,
      COALESCE(rs.aguardando, false)                                        AS respondeu,
      (rg.lead_id IS NOT NULL)                                              AS resgatado,
      -- Regra única: tarefa VENCIDA não é próximo passo (20260914190000).
      public.lead_sem_proximo_passo(v.id) AS sem_proximo_passo
    FROM vivos AS v
    LEFT JOIN resp AS rs ON rs.lead_id = v.id
    LEFT JOIN public.carteira_resgates AS rg
      ON rg.lead_id = v.id AND rg.corretor_id = _corretor
  ),
  -- Faixa. Fundo antes de tudo — um lead em análise parado há 80 dias vale
  -- mais que 200 leads frios novos. Formação logo depois: com a saída
  -- automática da cadência, quem ainda está em D1/D2/D3 não avançou.
  comfaixa AS (
    SELECT
      m.*,
      CASE
        WHEN m.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')
          THEN 'fundo'
        WHEN COALESCE(m.em_formacao, false) THEN 'formacao'
        WHEN m.resgatado THEN 'resgate'
        WHEN m.respondeu OR NOT m.sem_proximo_passo
          THEN 'conversa'
        ELSE 'reserva'
      END AS faixa,
      cfg.teto,
      cfg.cap_conversa,
      cfg.cap_resgate,
      cfg.sem_movimento_dias,
      cfg.sem_passo_dias
    FROM marcados AS m, cfg
  ),
  -- Ordem DENTRO de cada faixa. Fundo: mais parado primeiro (é a chave da
  -- Fila Única). Conversa: quem espera há mais tempo.
  rankeado AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY c.faixa
        ORDER BY EXTRACT(EPOCH FROM c.movimento) ASC, c.id ASC
      )::int AS rank_faixa
    FROM comfaixa AS c
  ),
  -- Cabe na faixa? O fundo não tem cap. Formação nunca ocupa vaga dos 65 —
  -- o limite dela é de ENTRADA (carteira_vagas_entrada_v1), não de carteira.
  naFaixa AS (
    SELECT
      r.*,
      CASE r.faixa
        WHEN 'fundo'    THEN true
        WHEN 'resgate'  THEN r.rank_faixa <= r.cap_resgate
        WHEN 'conversa' THEN r.rank_faixa <= r.cap_conversa
        ELSE false
      END AS cabe_na_faixa,
      CASE r.faixa
        WHEN 'fundo'    THEN 1
        WHEN 'resgate'  THEN 2
        WHEN 'conversa' THEN 3
        ELSE 5
      END AS ordem_faixa
    FROM rankeado AS r
  ),
  final AS (
    SELECT
      n.*,
      CASE
        WHEN n.cabe_na_faixa THEN
          row_number() OVER (
            PARTITION BY n.cabe_na_faixa
            ORDER BY n.ordem_faixa ASC, n.rank_faixa ASC, n.id ASC
          )::int
        ELSE NULL
      END AS posicao
    FROM naFaixa AS n
  )
  SELECT
    f.id,
    f.nome,
    f.telefone,
    f.status,
    f.temperatura,
    f.projeto_nome,
    f.created_at,
    f.movimento,
    f.dias_parado,
    f.proximo_followup,
    f.valor,
    f.faixa,
    f.posicao,
    -- O fundo do funil NUNCA é o excedente (§4.1 do documento).
    (f.faixa = 'fundo' OR (f.posicao IS NOT NULL AND f.posicao <= f.teto)) AS ativa,
    CASE
      WHEN f.faixa = 'fundo'
        OR (f.posicao IS NOT NULL AND f.posicao <= f.teto) THEN NULL
      -- Formação não está "fora" por defeito: está no processo. O motivo diz
      -- onde, e os consumidores a separam da Reserva pela faixa.
      WHEN f.faixa = 'formacao'
        THEN 'em formação na cadência (' || f.cadencia_etapa || ')'
      -- (1) Fora por CAPACIDADE: o lead qualificou para uma faixa e não coube.
      WHEN f.faixa <> 'reserva' AND NOT f.cabe_na_faixa
        THEN 'faixa cheia (' || f.faixa || ')'
      WHEN f.faixa <> 'reserva'
        THEN 'acima do teto de ' || f.teto
      -- (2) Fora por ESTADO, do diagnóstico mais forte para o mais fraco.
      WHEN f.dias_parado >= f.sem_movimento_dias
        THEN 'sem movimento há ' || f.dias_parado || ' dias'
      WHEN f.sem_proximo_passo AND f.dias_parado >= f.sem_passo_dias
        THEN 'sem próximo passo definido'
      WHEN f.status IN ('novo', 'aguardando_atendimento')
        THEN 'nunca respondeu ao primeiro contato'
      ELSE 'sem conversa viva'
    END AS motivo
  FROM final AS f;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Os consumidores separam formação de Reserva
-- ---------------------------------------------------------------------------
-- A Reserva é "o que saiu de mim e o que eu quero de volta" (§3.4). Um lead
-- em D2 não saiu de ninguém; aparecer ali convidaria o corretor a "resgatar"
-- quem ele já está trabalhando.
CREATE OR REPLACE FUNCTION public.carteira_reserva_v1(
  _corretor uuid DEFAULT NULL,
  _busca text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone text,
  status text,
  temperatura text,
  projeto_nome text,
  created_at timestamptz,
  movimento timestamptz,
  dias_parado integer,
  valor numeric,
  motivo text,
  total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _alvo uuid := COALESCE(_corretor, auth.uid());
  _take integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  _skip integer := GREATEST(COALESCE(_offset, 0), 0);
  _q text := NULLIF(btrim(COALESCE(_busca, '')), '');
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.pode_acessar_corretor(_caller, _alvo) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH fora AS (
    SELECT c.*
    FROM public._carteira_classificar(_alvo) AS c
    WHERE NOT c.ativa
      AND c.faixa <> 'formacao'
      AND (
        _q IS NULL
        OR c.nome ILIKE '%' || _q || '%'
        OR (
          regexp_replace(_q, '\D', '', 'g') <> ''
          AND regexp_replace(COALESCE(c.telefone, ''), '\D', '', 'g')
                LIKE '%' || regexp_replace(_q, '\D', '', 'g') || '%'
        )
      )
  )
  SELECT f.lead_id, f.nome, f.telefone, f.status, f.temperatura, f.projeto_nome,
         f.created_at, f.movimento, f.dias_parado, f.valor, f.motivo,
         count(*) OVER () AS total
  FROM fora AS f
  ORDER BY f.movimento DESC, f.lead_id ASC
  LIMIT _take OFFSET _skip;
END;
$$;

-- A linha do gestor: "reserva" deixa de somar quem está em formação.
CREATE OR REPLACE FUNCTION public.carteira_sombra_v1()
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  teto integer,
  ativa integer,
  fundo integer,
  reserva integer,
  sem_movimento integer,
  sem_proximo_passo integer,
  em_jogo numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '20s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
  _teto integer;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  IF NOT _ve_tudo AND cardinality(_equipe) = 0 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _teto := COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 65);
  RETURN QUERY
  WITH corretores AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.ativo
      AND (
        (_ve_tudo AND public.has_role(p.id, 'corretor'::public.app_role))
        OR p.id = ANY(_equipe)
      )
  ),
  linhas AS (
    SELECT
      co.id      AS dono,
      cl.ativa   AS ativa,
      cl.faixa   AS faixa,
      cl.motivo  AS motivo,
      cl.valor   AS valor,
      (NOT cl.ativa AND cl.faixa <> 'formacao') AS na_reserva
    FROM corretores AS co
    CROSS JOIN LATERAL public._carteira_classificar(co.id) AS cl
  )
  SELECT
    co.id,
    co.nome,
    _teto,
    count(*) FILTER (WHERE l.ativa)::int,
    count(*) FILTER (WHERE l.faixa = 'fundo')::int,
    count(*) FILTER (WHERE l.na_reserva)::int,
    count(*) FILTER (WHERE l.na_reserva AND l.motivo LIKE 'sem movimento%')::int,
    count(*) FILTER (WHERE l.na_reserva AND l.motivo = 'sem próximo passo definido')::int,
    COALESCE(sum(l.valor) FILTER (WHERE l.ativa), 0)
  FROM corretores AS co
  LEFT JOIN linhas AS l ON l.dono = co.id
  GROUP BY co.id, co.nome
  ORDER BY count(*) FILTER (WHERE l.na_reserva) DESC, co.nome ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) A vaga de ENTRADA passa a ser a vaga da formação
-- ---------------------------------------------------------------------------
-- Antes: min(teto − ativa, cap_sla − sla). Lead novo nascia na faixa SLA,
-- dentro dos 65, então a entrada disputava vaga com a carteira.
--
-- Agora lead novo nasce em FORMAÇÃO, fora dos 65. Duas regras, nesta ordem:
--
--   1. Carteira de 65 cheia -> 0. É o princípio do §2.3: quem está afogado em
--      negócio avançado não recebe mais. Continua valendo porque quem responde
--      na formação SOBE para os 65 — mandar lead novo para uma carteira cheia
--      é garantir que a resposta dele não tenha vaga.
--   2. Senão -> cap_formacao − em formação.
--
-- Uma regra, dois chamadores: a roleta de estoque (distribuir_estoque_roleta)
-- e a admissão da Fase 0. Os números entram por parâmetro para que quem já
-- classificou a carteira não pague a classificação duas vezes.
CREATE OR REPLACE FUNCTION public._carteira_vaga_entrada(_ocupadas integer, _em_formacao integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (SELECT public.carteira_ativa_config() AS v)
  SELECT CASE
           WHEN _ocupadas >= COALESCE((SELECT (cfg.v ->> 'teto')::int FROM cfg), 65) THEN 0
           ELSE GREATEST(0,
                  COALESCE((SELECT (cfg.v ->> 'cap_formacao')::int FROM cfg),
                           (SELECT (cfg.v ->> 'cap_sla')::int FROM cfg), 20)
                  - _em_formacao)
         END;
$$;

CREATE OR REPLACE FUNCTION public.carteira_vagas_entrada_v1(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH atual AS (SELECT c.ativa, c.faixa FROM public._carteira_classificar(_corretor) AS c)
  SELECT public._carteira_vaga_entrada(
    (SELECT count(*)::int FROM atual WHERE atual.ativa),
    (SELECT count(*)::int FROM atual WHERE atual.faixa = 'formacao'));
$$;

COMMENT ON FUNCTION public.carteira_vagas_entrada_v1(uuid) IS
  'Quantos leads NOVOS cabem agora: 0 se a carteira de 65 está cheia; senão '
  'cap_formacao menos quem já está em formação (D1/D2/D3). Formação não '
  'ocupa vaga dos 65 — só o que avança sobe para eles.';

-- O placar da formação para a tela (anel da Fila Única). Uma classificação só.
CREATE OR REPLACE FUNCTION public.carteira_formacao_v1(_corretor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _alvo uuid := COALESCE(_corretor, auth.uid());
  _ocupadas integer;
  _formacao integer;
  _cfg jsonb := public.carteira_ativa_config();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.pode_acessar_corretor(_caller, _alvo) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) FILTER (WHERE c.ativa)::int,
         count(*) FILTER (WHERE c.faixa = 'formacao')::int
    INTO _ocupadas, _formacao
    FROM public._carteira_classificar(_alvo) AS c;
  RETURN jsonb_build_object(
    'em_formacao',   _formacao,
    'cap_formacao',  COALESCE((_cfg ->> 'cap_formacao')::int, (_cfg ->> 'cap_sla')::int, 20),
    'ocupadas',      _ocupadas,
    'teto',          COALESCE((_cfg ->> 'teto')::int, 65),
    'vagas_entrada', public._carteira_vaga_entrada(_ocupadas, _formacao));
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_formacao_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_formacao_v1(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) As telas do gestor param de acusar a formação
-- ---------------------------------------------------------------------------
-- fila_equipe_v1: idêntica a 20260914190000, com a formação fora de "sem
-- próximo passo". O passo do lead em formação é o prazo da etapa, que a
-- cadência controla e cobra — não uma falha do corretor.
CREATE OR REPLACE FUNCTION public.fila_equipe_v1()
 RETURNS TABLE(corretor_id uuid, nome text, carteira_ativa integer, vencidos integer, sem_proximo_passo integer, fundo_parado integer, em_jogo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  _ve_tudo := public.ve_carteira_completa(_caller);
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);
  IF NOT _ve_tudo AND cardinality(_equipe) = 0 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH corretores AS (
    SELECT p.id, p.nome
    FROM public.profiles AS p
    WHERE p.ativo
      AND (
        (_ve_tudo AND public.has_role(p.id, 'corretor'::public.app_role))
        OR p.id = ANY(_equipe)
        OR p.id = _caller
      )
  ),
  vivos AS (
    SELECT
      l.id,
      l.corretor_id,
      l.status,
      l.proximo_followup,
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS movimento,
      CASE WHEN pr.sob_consulta THEN NULL ELSE pr.preco_a_partir END AS valor,
      (l.cadencia_etapa IN ('D1', 'D2', 'D3')) AS em_formacao
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    WHERE l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
      AND (
        (l.corretor_id IS NULL AND _ve_tudo)
        OR l.corretor_id = _caller
        OR l.corretor_id = ANY(_equipe)
        OR (_ve_tudo AND l.corretor_id IS NOT NULL)
      )
  ),
  marcados AS (
    SELECT
      v.corretor_id,
      v.valor,
      (v.proximo_followup IS NOT NULL AND v.proximo_followup < now()) AS vencido,
      -- Regra única: tarefa VENCIDA não é próximo passo (20260914190000).
      -- Formação fora: o passo dela é o prazo da etapa da cadência.
      (NOT COALESCE(v.em_formacao, false) AND public.lead_sem_proximo_passo(v.id)) AS sem_passo,
      (
        v.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')
        AND v.movimento < now() - interval '5 days'
      ) AS fundo
    FROM vivos AS v
  ),
  agg AS (
    SELECT
      m.corretor_id,
      count(*)::integer AS carteira_ativa,
      count(*) FILTER (WHERE m.vencido)::integer AS vencidos,
      count(*) FILTER (WHERE m.sem_passo)::integer AS sem_proximo_passo,
      count(*) FILTER (WHERE m.fundo)::integer AS fundo_parado,
      COALESCE(sum(m.valor), 0)::numeric AS em_jogo
    FROM marcados AS m
    GROUP BY m.corretor_id
  ),
  linhas AS (
    SELECT
      c.id AS corretor_id,
      c.nome,
      COALESCE(a.carteira_ativa, 0) AS carteira_ativa,
      COALESCE(a.vencidos, 0) AS vencidos,
      COALESCE(a.sem_proximo_passo, 0) AS sem_proximo_passo,
      COALESCE(a.fundo_parado, 0) AS fundo_parado,
      COALESCE(a.em_jogo, 0)::numeric AS em_jogo
    FROM corretores AS c
    LEFT JOIN agg AS a ON a.corretor_id = c.id
    UNION ALL
    -- O estoque sem dono só para quem vê a operação inteira.
    SELECT NULL::uuid, 'Sem corretor'::text, a.carteira_ativa, 0, 0, 0, a.em_jogo
    FROM agg AS a
    WHERE a.corretor_id IS NULL AND _ve_tudo
  )
  SELECT
    li.corretor_id,
    li.nome,
    li.carteira_ativa,
    li.vencidos,
    li.sem_proximo_passo,
    li.fundo_parado,
    li.em_jogo
  FROM linhas AS li
  ORDER BY (li.corretor_id IS NULL), li.fundo_parado DESC, li.vencidos DESC, li.nome;
END;
$function$;

-- carteira_stats_por_corretor_v1: idêntica a 20260914190000, com a formação
-- contada como PROSPECÇÃO — que é o que ela é (pré-resposta) — e portanto
-- fora de "ativa" e de "sem passo vivo".
CREATE OR REPLACE FUNCTION public.carteira_stats_por_corretor_v1()
RETURNS TABLE (
  corretor_id uuid,
  total bigint,
  ativa bigint,
  acima_do_teto bigint,
  sem_passo_vivo bigint,
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
      l.id,
      l.corretor_id,
      l.status::text AS st,
      (l.status IN ('agendado'::public.lead_status,
                    'visita_realizada'::public.lead_status,
                    'proposta_enviada'::public.lead_status,
                    'analise_credito'::public.lead_status)) AS eh_fundo,
      COALESCE(l.cadencia_etapa IN ('D1', 'D2', 'D3'), false) AS em_formacao,
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
      -- Formação é prospecção: pré-resposta, fora dos 65.
      (b.st IN ('novo','aguardando_atendimento','aguardando_corretor')
       OR (b.em_formacao AND NOT b.eh_fundo)) AS eh_prospeccao,
      (b.st IN ('contrato_fechado','pos_venda')) AS eh_ganho,
      (b.st = 'perdido') AS eh_perdido,
      -- CASE curto-circuita: a checagem de próximo passo só roda para quem
      -- está em tratativa, não para a base inteira da casa.
      CASE
        WHEN b.st NOT IN ('novo','aguardando_atendimento','aguardando_corretor',
                          'contrato_fechado','pos_venda','perdido')
         AND NOT b.em_formacao
         AND b.parado_desde > now() - make_interval(
               days => CASE WHEN b.eh_fundo THEN _d_av ELSE _d_ini END)
        THEN public.lead_sem_proximo_passo(b.id)
        ELSE false
      END AS sem_passo
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
      count(*) FILTER (WHERE c.sem_passo)::bigint AS sem_passo_vivo,
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
    a.sem_passo_vivo,
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

-- ---------------------------------------------------------------------------
-- 7) A régua de devolução não toca lead em formação
-- ---------------------------------------------------------------------------
-- Idêntica a 20260914200848 mais uma cláusula. Lead em D1/D2/D3 tem dono de
-- processo — a cadência — e saídas próprias (roleta por etapa vencida,
-- reativação por cadência cumprida). Duas réguas sobre o mesmo lead é o
-- conflito que fez um lead admitido pela Fase 0 aparecer como candidato
-- 'sem_passo' antes do primeiro toque.
CREATE OR REPLACE FUNCTION public.regua_devolucao_candidatos_v1()
RETURNS TABLE(lead_id uuid, corretor_id uuid, origem text, status text,
              grupo text, destino text, motivo text,
              dias_parado integer, corte_dias integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH cfg AS (
    SELECT
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'bolsao') ->> 'devolver_estoque_dias'
      )::int, 30) AS estoque_dias,
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'bolsao') ->> 'devolver_pago_dias'
      )::int, 60) AS pago_dias,
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'carteira_ativa') ->> 'devolver_sem_proximo_passo_dias'
      )::int, 7) AS sem_passo_dias
  ),
  base AS (
    SELECT
      l.id,
      l.corretor_id,
      l.origem::text AS origem,
      l.status::text AS status,
      GREATEST(0, (EXTRACT(EPOCH FROM (now() - t.toque)) / 86400)::int) AS dias_parado,
      GREATEST(0, (EXTRACT(EPOCH FROM (
        now() - GREATEST(t.toque, COALESCE(v.venc_max, t.toque))
      )) / 86400)::int) AS dias_sem_passo,
      public.lead_sem_proximo_passo(l.id) AS sem_passo,
      CASE
        WHEN l.origem::text IN ('facebook', 'chatbot', 'impulso_smq')
          OR l.sdr_entregue_em IS NOT NULL THEN 'pago'
        WHEN l.origem::text IN ('importacao', 'google_sheets', 'outro') THEN 'estoque'
        ELSE 'conquistado'
      END AS grupo
    FROM public.leads AS l
    CROSS JOIN LATERAL (
      SELECT COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS toque
    ) AS t
    LEFT JOIN LATERAL (
      SELECT max(tr.data_vencimento) AS venc_max
      FROM public.tarefas AS tr
      WHERE tr.lead_id = l.id
        AND tr.deleted_at IS NULL
        AND tr.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
        AND tr.data_vencimento IS NOT NULL
        AND tr.data_vencimento < now()
    ) AS v ON true
    WHERE l.corretor_id IS NOT NULL
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      -- congelados: venda registrada e finalizados
      AND l.status NOT IN (
        'contrato_fechado'::public.lead_status,
        'pos_venda'::public.lead_status,
        'perdido'::public.lead_status
      )
      -- fundo do funil nunca sai automaticamente
      AND l.status NOT IN (
        'agendado'::public.lead_status,
        'visita_realizada'::public.lead_status,
        'proposta_enviada'::public.lead_status,
        'analise_credito'::public.lead_status
      )
      -- base em formação: a cadência é a dona e tem as próprias saídas
      AND (l.cadencia_etapa IS NULL OR l.cadencia_etapa NOT IN ('D1', 'D2', 'D3'))
      AND NOT public._lead_venda_viva(l.id)
  )
  SELECT
    b.id,
    b.corretor_id,
    b.origem,
    b.status,
    b.grupo,
    CASE WHEN b.grupo = 'pago' THEN 'roleta' ELSE 'bolsao' END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN 'parado' ELSE 'sem_passo' END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN b.dias_parado ELSE b.dias_sem_passo END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         ELSE c.sem_passo_dias END
  FROM base AS b, cfg AS c
  WHERE b.grupo <> 'conquistado'
    AND (
      b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
      OR (b.sem_passo AND b.dias_sem_passo >= c.sem_passo_dias)
    );
$function$;

-- ---------------------------------------------------------------------------
-- 8) A admissão da Fase 0 entra pela vaga da formação
-- ---------------------------------------------------------------------------
-- Idêntica a 20260923120000 até o recorte por corretor. A cota de cada um
-- passa a ser o MENOR entre:
--
--   _teto (lote_estoque_dia)                o ritmo que o admin escolheu
--   cap_formacao_estoque − em formação       o estoque nunca passa da metade
--                                            da formação; a outra é da roleta
--   carteira_vagas_entrada_v1                 0 quando a carteira de 65 está
--                                            cheia — não adianta formar lead
--                                            que não terá vaga ao responder
--
-- É isto que responde à pergunta dos 215 por corretor: o estoque entra na
-- velocidade em que a formação se esvazia, e nunca empurra os 65.
CREATE OR REPLACE FUNCTION public.cadencia_fase0_admitir(
  _modo         text DEFAULT NULL,
  _por_corretor integer DEFAULT NULL
)
RETURNS TABLE(lote_id uuid, modo text, corretores integer, admitidos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _teto integer;
  _cap_est integer;
  _lote uuid := gen_random_uuid();
  _c record;
  _ok boolean;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;
  _teto := GREATEST(COALESCE(_por_corretor, _cfg.lote_estoque_dia, 15), 1);
  _cap_est := GREATEST(COALESCE(
    (public.carteira_ativa_config() ->> 'cap_formacao_estoque')::int,
    COALESCE((public.carteira_ativa_config() ->> 'cap_formacao')::int, 20) / 2), 0);

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin admite estoque na cadência' USING ERRCODE = '42501';
  END IF;

  FOR _c IN
    WITH k AS (
      SELECT x.lead_id, x.corretor_id, x.dias_parado,
             row_number() OVER (PARTITION BY x.corretor_id
                                ORDER BY x.dias_parado ASC, x.lead_id) AS pos
      FROM public.cadencia_fase0_classificar() AS x
      WHERE x.destino = 'cadencia'
    ),
    cota AS (
      SELECT d.corretor_id,
             LEAST(
               _teto,
               GREATEST(0, _cap_est - (
                 SELECT count(*)::int FROM public.leads AS l
                  WHERE l.corretor_id = d.corretor_id
                    AND l.cadencia_etapa IN ('D1', 'D2', 'D3')
                    AND l.deleted_at IS NULL
                    AND l.na_lixeira = false)),
               public.carteira_vagas_entrada_v1(d.corretor_id)
             ) AS n
      FROM (SELECT DISTINCT k.corretor_id FROM k) AS d
    )
    SELECT k.lead_id, k.corretor_id, k.dias_parado, cota.n AS cota
    FROM k
    JOIN cota ON cota.corretor_id = k.corretor_id
    WHERE k.pos <= cota.n
  LOOP
    _ok := false;
    IF _m = 'ativo' THEN
      _ok := public.cadencia_iniciar(_c.lead_id);
    END IF;

    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'fase0', _c.lead_id, _c.corretor_id, NULL, 'D1', 'admissao_estoque', _m, _ok,
       jsonb_build_object('dias_parado', _c.dias_parado, 'teto_por_corretor', _teto,
                          'cota_formacao', _c.cota, 'etapa_aplicada', 'D1'));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m,
         count(DISTINCT g.corretor_id)::int,
         count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

COMMENT ON FUNCTION public.cadencia_fase0_admitir(text, integer) IS
  'Admite o estoque na cadência (base em formação) por corretor: o menor '
  'entre lote_estoque_dia, a parte da formação reservada ao estoque '
  '(cap_formacao_estoque) e a vaga de entrada (0 com a carteira de 65 '
  'cheia). Do mais quente para o mais frio. Admin apenas.';

NOTIFY pgrst, 'reload schema';
