-- ===========================================================================
-- PROSPECÇÃO — o lote de 30 do Bolsão, registrado no repositório e corrigido
-- ===========================================================================
-- Decisão do dono (28/09/2026, conversa com o Lovable): o corretor pede um
-- lote de até 30 clientes do Bolsão numa zona; eles entram na cadência
-- (Lead chegou → D1 → D2 → D3); novo lote só quando o anterior zerar; carteira
-- de 65 cheia bloqueia. Base nova só por essa porta: resgate da Reserva e
-- "assumir" pelo Discador fecham para o corretor (a gestão segue podendo).
--
-- Decisão do dono (29/09/2026): "esses 30 que puxar não devem fazer parte da
-- base ativa do corretor".
--
-- ---------------------------------------------------------------------------
-- POR QUE ESTA MIGRATION EXISTE
-- ---------------------------------------------------------------------------
-- O Lovable aplicou em produção, em 28/09 às 19:33, duas migrations
-- (0016_prospeccao_lote_30 e 0017_fase0_admitir_porta_fechada) que ficaram
-- presas no branch `lovable-sync`: o PR da Academia entrou no main 52
-- segundos antes e o push do Lovable não passou. Resultado: o banco tinha o
-- lote e as portas fechadas, o app não tinha o botão, e o repositório não
-- tinha nada — o harness e o CI testavam um banco diferente do de produção.
--
-- Esta migration é idempotente para os dois mundos: num banco que já tem os
-- objetos do Lovable ela só corrige; num replay do zero (harness/CI) ela cria.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTAVA ERRADO NA VERSÃO DE PRODUÇÃO (e o que muda)
-- ---------------------------------------------------------------------------
-- 1. ZONA. O filtro comparava `COALESCE(l.zona, p.zona_smq)` com 'Leste'. O
--    campo do projeto é texto livre ("Zona Leste"), então quem só tinha zona
--    pelo empreendimento nunca entrava em lote nenhum, e o bairro do lead e a
--    `regiao` do projeto eram ignorados. Agora a zona sai da MESMA cascata de
--    `zona_do_lead` (zona do lead → bairro → projeto, tudo normalizado).
--
-- 2. STATUS FORA DA CADÊNCIA. O lote aceitava `qualificado` e
--    `qualificacao_corretor`, que `cadencia_iniciar` recusa: o cliente ganhava
--    dono e ficava fora da cadência, contando como "ficou" e sem travar o
--    próximo lote. Agora só entra o que a cadência aceita, e cada cliente é
--    conferido em D0 depois da atribuição; quem não entrou é desfeito.
--
-- 3. O LOTE PEGAVA O QUE NÃO ERA DO BOLSÃO. `_bolsao_elegivel` sozinho deixava
--    vir: lead PAGO (Facebook, Marquinhos, Impulso, SDR — pela Fatia 4 §6 vai
--    para outro corretor, nunca para o estoque), a fila da roleta
--    (`aguardando_corretor`), lead recém-chegado ainda sendo distribuído, lead
--    com exceção de distribuição em análise pela gestão e lead reservado agora
--    no Discador de outro corretor. Todos saem. Entra também o anti-ioiô do
--    Discador: o que o corretor devolveu (ou deixou vencer num lote) há menos
--    de `discador_anti_ioio_dias` não volta para ele.
--
-- 4. O SLA DE 15 MINUTOS TOMAVA O LOTE. O cliente entrava como
--    `aguardando_atendimento` com `data_distribuicao = now()` e, se fosse de
--    classe 'quente' (o padrão da coluna) ou `via_webhook`, a rotina
--    `redistribuir_sla_webhook` o passava para outro corretor 15 minutos úteis
--    depois. O lote agora grava `classe_lead = 'base'` (é o que o Bolsão é) e
--    `via_webhook = false` — o mesmo cuidado que o Discador já tinha.
--
-- 5. O LOTE VENCIDO IA PARA A ROLETA. Etapa vencida ou cadência incompleta
--    mandavam o cliente para `aguardando_corretor` — a fila da roleta, onde a
--    ordem é `created_at ASC`: 30 clientes antigos do Bolsão furavam a fila dos
--    leads pagos que chegaram hoje. Cliente de lote volta ao BOLSÃO, no status
--    em que estava antes do lote.
--
-- 6. 30 AVISOS DE UMA VEZ. Cada atribuição acendia um alerta e um push
--    "Novo lead recebido". O corretor acabou de pedir o lote; o toast basta.
--
-- 7. A ADMISSÃO DO ESTOQUE (Fase 0) QUEBRADA EM SILÊNCIO. A trava do Lovable
--    fazia `cadencia_fase0_admitir` devolver ZERO linhas, e o botão "Admitir
--    agora" do Painel da cadência caía em "a admissão não devolveu
--    resultado". A trava continua (decisão do dono), mas diz o porquê; o
--    ensaio em modo sombra volta a funcionar.
--
-- ---------------------------------------------------------------------------
-- "FORA DA BASE ATIVA" — O QUE ISSO QUER DIZER NO BANCO
-- ---------------------------------------------------------------------------
-- Enquanto o cliente do lote está na cadência (D0..D3) ele:
--   * não ocupa vaga da carteira de 65 (já era assim: é base em formação);
--   * NÃO ocupa a vaga de ENTRADA da formação (`cap_formacao`, 20). Sem isto,
--     pedir 30 enchia a formação e a roleta parava de mandar lead pago para o
--     corretor até o lote esvaziar — e a Fase 0 também travava;
--   * não conta no badge "Aguardando atendimento" do Modo Foco (a tela o tira
--     das três bases e o mostra no cartão do lote);
--   * vem DEPOIS dos clientes da carteira na Fila do Dia, no mesmo balde.
-- O tamanho do lote não depende mais das vagas: são 30 (ou o que a zona
-- tiver). A trava "carteira cheia bloqueia" continua — quem responde na
-- cadência sobe para os 65, e pedir lote com a carteira cheia é garantir que a
-- resposta não tenha vaga.
--
-- Quando o cliente responde ou avança de fase, ele sai da cadência e segue as
-- regras normais da carteira: é para isso que o lote existe.
--
-- `leads.prospeccao_lote_id` passa a ter um significado só: "o lote em que o
-- lead está com o dono ATUAL". Um gatilho o limpa quando o dono muda; o
-- histórico (quem veio em que lote, com que status) mora em
-- `prospeccao_lote_itens`.
--
-- ---------------------------------------------------------------------------
-- O QUE NÃO MUDA
-- ---------------------------------------------------------------------------
-- Roletas, redistribuição, SLA, cadastro manual, SDR, comissões e financeiro.
-- O `cadencia_execucao_log` continua gravando 'roleta' como destino do
-- vencido: é o caminho que o motor chamou; para cliente de lote o destino
-- real está em `distribution_log` (regra `lote_prospeccao_<motivo>`) e em
-- `lead_eventos` (`para_estado = 'bolsao'`).
--
-- Religar as portas antigas: UPDATE public.cadencia_config
--   SET portas_legadas_bolsao = true WHERE id = 1;
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0) A chave das portas antigas
-- ---------------------------------------------------------------------------
ALTER TABLE public.cadencia_config
  ADD COLUMN IF NOT EXISTS portas_legadas_bolsao boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cadencia_config.portas_legadas_bolsao IS
  'false (padrão desde 28/09/2026): base nova do corretor só pelo lote de '
  'prospecção — resgate da Reserva, "assumir" pelo Discador e admissão do '
  'estoque (Fase 0) ficam fechados para o corretor. true religa as três.';

-- ---------------------------------------------------------------------------
-- 1) Os lotes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospeccao_lotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES public.profiles(id),
  zona        text NOT NULL,
  solicitados integer NOT NULL DEFAULT 30,
  entregues   integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'prospeccao_lotes_zona_check'
       AND conrelid = 'public.prospeccao_lotes'::regclass
  ) THEN
    ALTER TABLE public.prospeccao_lotes
      ADD CONSTRAINT prospeccao_lotes_zona_check
      CHECK (zona IN ('Norte', 'Sul', 'Leste', 'Oeste', 'Centro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prospeccao_lotes_corretor_idx
  ON public.prospeccao_lotes (corretor_id, created_at DESC);

ALTER TABLE public.prospeccao_lotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospeccao_lotes FROM anon;
GRANT SELECT ON public.prospeccao_lotes TO authenticated;
GRANT ALL ON public.prospeccao_lotes TO service_role;

-- A policy do Lovable abria TODOS os lotes para qualquer gestor; o escopo da
-- casa é o do time (pode_acessar_corretor), como na carteira.
DROP POLICY IF EXISTS "lotes: dono ou gestao le" ON public.prospeccao_lotes;
DROP POLICY IF EXISTS "prospeccao_lotes: dono ou escopo le" ON public.prospeccao_lotes;
CREATE POLICY "prospeccao_lotes: dono ou escopo le" ON public.prospeccao_lotes
  FOR SELECT TO authenticated
  USING (public.pode_acessar_corretor(auth.uid(), corretor_id));

COMMENT ON TABLE public.prospeccao_lotes IS
  'Lote de prospecção: um pedido de até 30 clientes do Bolsão numa zona, feito '
  'pelo corretor no Modo Foco. Escrita só por prospeccao_pedir_lote.';

-- ---------------------------------------------------------------------------
-- 2) O que veio em cada lote (o histórico que o lead não guarda)
-- ---------------------------------------------------------------------------
-- As colunas `*_anterior` existem para a volta: cliente de lote que vence
-- volta ao Bolsão exatamente como estava. A data de distribuição entra junto
-- porque a rotina de distribuição automática só deixa em paz o lead cuja
-- exceção foi arquivada DEPOIS da última distribuição — voltar com a data do
-- lote o jogaria de novo na roleta.
CREATE TABLE IF NOT EXISTS public.prospeccao_lote_itens (
  lote_id                     uuid NOT NULL REFERENCES public.prospeccao_lotes(id) ON DELETE CASCADE,
  lead_id                     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status_anterior             public.lead_status NOT NULL,
  classe_anterior             text NOT NULL,
  data_distribuicao_anterior  timestamptz,
  recebimento_anterior        timestamptz,
  entregue_em                 timestamptz NOT NULL DEFAULT now(),
  devolvido_em                timestamptz,
  PRIMARY KEY (lote_id, lead_id)
);

CREATE INDEX IF NOT EXISTS prospeccao_lote_itens_lead_idx
  ON public.prospeccao_lote_itens (lead_id);

ALTER TABLE public.prospeccao_lote_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospeccao_lote_itens FROM anon, authenticated;
GRANT ALL ON public.prospeccao_lote_itens TO service_role;

COMMENT ON TABLE public.prospeccao_lote_itens IS
  'Cada cliente entregue num lote de prospecção, com o estado anterior (para '
  'a volta ao Bolsão) e quando voltou. Lido só pelas RPCs do lote.';

-- ---------------------------------------------------------------------------
-- 3) O lead sabe em que lote está
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS prospeccao_lote_id uuid REFERENCES public.prospeccao_lotes(id);

CREATE INDEX IF NOT EXISTS leads_prospeccao_lote_idx
  ON public.leads (prospeccao_lote_id) WHERE prospeccao_lote_id IS NOT NULL;

COMMENT ON COLUMN public.leads.prospeccao_lote_id IS
  'Lote de prospecção em que o lead está com o dono ATUAL. O gatilho '
  'trg_prospeccao_lote_solta_ao_trocar_dono limpa quando o dono muda; o '
  'histórico fica em prospeccao_lote_itens.';

-- Lote pedido pela versão do Lovable (se houve algum): registra o histórico
-- com o estado atual, que é o melhor que se sabe, e protege do SLA quem ainda
-- está na cadência.
INSERT INTO public.prospeccao_lote_itens (lote_id, lead_id, status_anterior, classe_anterior, entregue_em)
SELECT l.prospeccao_lote_id, l.id, l.status, l.classe_lead, COALESCE(l.data_distribuicao, now())
  FROM public.leads AS l
 WHERE l.prospeccao_lote_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.leads AS l
   SET classe_lead = 'base', via_webhook = false
 WHERE l.prospeccao_lote_id IS NOT NULL
   AND l.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3')
   AND (l.classe_lead <> 'base' OR l.via_webhook);

-- "Este lead está trabalhando o lote agora": uma definição, usada por todas as
-- contagens abaixo e pelo Modo Foco (que aplica a mesma regra no PostgREST).
CREATE OR REPLACE FUNCTION public._prospeccao_em_lote(_lote uuid, _etapa text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _lote IS NOT NULL AND COALESCE(_etapa IN ('D0', 'D1', 'D2', 'D3'), false);
$$;

-- ---------------------------------------------------------------------------
-- 4) Trocou de dono, saiu do lote
-- ---------------------------------------------------------------------------
-- Sem isto, o lead que vence, volta ao Bolsão e é distribuído a outro corretor
-- carregaria o lote do primeiro — e sairia da formação do segundo, do badge
-- dele e da ordem normal da Fila do Dia dele. O UPDATE que ENTREGA o lote muda
-- as duas colunas juntas e passa direto.
CREATE OR REPLACE FUNCTION public.tg_prospeccao_lote_solta_ao_trocar_dono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.prospeccao_lote_id IS NOT NULL
     AND NEW.corretor_id IS DISTINCT FROM OLD.corretor_id
     AND NEW.prospeccao_lote_id IS NOT DISTINCT FROM OLD.prospeccao_lote_id THEN
    NEW.prospeccao_lote_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prospeccao_lote_solta_ao_trocar_dono ON public.leads;
CREATE TRIGGER trg_prospeccao_lote_solta_ao_trocar_dono
  BEFORE UPDATE OF corretor_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_prospeccao_lote_solta_ao_trocar_dono();

-- ---------------------------------------------------------------------------
-- 5) Os avisos por lead calam dentro do lote
-- ---------------------------------------------------------------------------
-- Idênticas às vigentes, com a saída antecipada quando a transação é a de um
-- lote (`app.prospeccao_lote`, local à transação).
CREATE OR REPLACE FUNCTION public.alerta_lead_distribuido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.prospeccao_lote', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.corretor_id IS NOT NULL
     AND (OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (
      NEW.corretor_id,
      'lead_novo',
      'Novo lead recebido',
      COALESCE(NEW.nome, 'Lead sem nome') || ' foi atribuído a você.',
      '/leads/' || NEW.id::text,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.push_lead_distribuido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.prospeccao_lote', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.corretor_id IS NOT NULL AND (OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    PERFORM public.enqueue_push(
      NEW.corretor_id,
      'Novo lead recebido',
      COALESCE(NEW.nome, 'Lead sem nome') || COALESCE(' · ' || NEW.telefone, ''),
      '/leads/' || NEW.id::text,
      'lead-' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Quem pode vir num lote
-- ---------------------------------------------------------------------------
-- A zona pela mesma cascata de `zona_do_lead` (20260813100000), recebendo os
-- campos já lidos em vez de reler o lead por id — o lote avalia a base sem
-- dono inteira.
CREATE OR REPLACE FUNCTION public._prospeccao_zona(
  _zona_lead text, _bairro text, _zona_projeto text, _regiao_projeto text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    public.zona_normalizar(_zona_lead),
    public.zona_do_bairro(_bairro),
    public.zona_normalizar(COALESCE(NULLIF(btrim(_zona_projeto), ''), _regiao_projeto))
  );
$$;

-- A zona de um lead, lendo o projeto dele. Sobre o próprio lead de propósito:
-- vira filtro do scan de leads, e não do join com projetos (ver o pedido).
CREATE OR REPLACE FUNCTION public._prospeccao_zona_do_lead(l public.leads)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT public._prospeccao_zona(l.zona, l.bairro, p.zona_smq, p.regiao)
    FROM (SELECT 1) AS um
    LEFT JOIN public.projetos AS p ON p.id = l.projeto_id;
$$;

-- A regra inteira num lugar só (o pedido de lote aplica, o teste exercita).
--   * Bolsão de verdade: `_bolsao_elegivel` (sem dono, telefone discável, sem
--     opt-out, sem venda viva, sem arquivado, fora da reativação);
--   * entra na cadência: sem etapa e num status que `cadencia_iniciar` aceita
--     — menos `aguardando_corretor`, que é a fila da roleta;
--   * não é pago (Fatia 4 §6) nem está com o SDR;
--   * não está sendo distribuído agora: criado há mais de um dia e sem
--     exceção de distribuição aberta (a gestão está olhando);
--   * ninguém está discando agora (reserva viva do Discador);
--   * anti-ioiô: não foi devolvido POR ESTE corretor, nem vencido num lote
--     dele, há menos de `_anti_ioio_dias`.
-- COST alto: é a parte cara do pedido (várias subconsultas por linha); o
-- planejador deixa por último o que custa mais dentro de um mesmo filtro.
CREATE OR REPLACE FUNCTION public._prospeccao_lote_elegivel(
  l public.leads, _corretor uuid, _anti_ioio_dias integer
)
RETURNS boolean
LANGUAGE sql
STABLE
COST 1000
SET search_path = pg_catalog, public
AS $$
  SELECT l.corretor_id IS NULL
     AND l.sdr_id IS NULL
     AND l.cadencia_etapa IS NULL
     AND l.status IN ('novo'::public.lead_status,
                      'aguardando_atendimento'::public.lead_status,
                      'em_atendimento'::public.lead_status,
                      'aguardando_retorno'::public.lead_status)
     AND l.created_at < now() - interval '1 day'
     AND NOT public.lead_origem_paga(l.origem, l.sdr_entregue_em)
     AND public._bolsao_elegivel(l)
     AND NOT EXISTS (
       SELECT 1 FROM public.distribuicao_excecoes AS e
        WHERE e.lead_id = l.id AND e.status IN ('pendente', 'em_analise'))
     AND NOT EXISTS (
       SELECT 1 FROM public.bolsao_discagem AS d
        WHERE d.lead_id = l.id AND d.expira_em > now())
     AND NOT EXISTS (
       SELECT 1 FROM public.devolucao_log AS dl
        WHERE dl.lead_id = l.id
          AND dl.corretor_anterior_id = _corretor
          AND dl.aplicado
          AND dl.created_at > now() - make_interval(days => _anti_ioio_dias))
     AND NOT EXISTS (
       SELECT 1 FROM public.prospeccao_lote_itens AS i
         JOIN public.prospeccao_lotes AS pl ON pl.id = i.lote_id
        WHERE i.lead_id = l.id
          AND pl.corretor_id = _corretor
          AND i.devolvido_em > now() - make_interval(days => _anti_ioio_dias));
$$;

REVOKE ALL ON FUNCTION public._prospeccao_lote_elegivel(public.leads, uuid, integer) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) O placar de um lote
-- ---------------------------------------------------------------------------
--   em_cadencia  ainda com o corretor, em D0..D3
--   ficaram      ainda com o corretor, fora da cadência e não perdido
--                (respondeu, agendou, avançou)
--   sairam       o resto: voltou ao Bolsão, foi para a reativação, perdido,
--                lixeira, outro dono
-- A soma dos três é sempre `entregues`.
CREATE OR REPLACE FUNCTION public._prospeccao_lote_placar(_lote uuid)
RETURNS TABLE(entregues integer, em_cadencia integer, ficaram integer, sairam integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH x AS (
    SELECT
      COALESCE(l.corretor_id = pl.corretor_id
               AND l.prospeccao_lote_id = pl.id
               AND l.deleted_at IS NULL
               AND NOT l.na_lixeira, false)                          AS comigo,
      public._prospeccao_em_lote(l.prospeccao_lote_id, l.cadencia_etapa) AS em_cad,
      (l.status = 'perdido'::public.lead_status)                       AS perdido
    FROM public.prospeccao_lote_itens AS i
    JOIN public.prospeccao_lotes AS pl ON pl.id = i.lote_id
    JOIN public.leads AS l ON l.id = i.lead_id
    WHERE i.lote_id = _lote
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE x.comigo AND x.em_cad)::int,
         count(*) FILTER (WHERE x.comigo AND NOT x.em_cad AND NOT x.perdido)::int,
         count(*) FILTER (WHERE NOT x.comigo OR (NOT x.em_cad AND x.perdido))::int
  FROM x;
$$;

REVOKE ALL ON FUNCTION public._prospeccao_lote_placar(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) O cartão do Modo Foco
-- ---------------------------------------------------------------------------
-- Mantém as chaves da versão de 28/09 (a tela antiga continua lendo) e ganha
-- `em_cadencia_total` (a trava olha TODOS os lotes, não só o último),
-- `tamanho` e `portas_legadas`.
CREATE OR REPLACE FUNCTION public.prospeccao_lote_status_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _me uuid := auth.uid();
  _lote public.prospeccao_lotes%ROWTYPE;
  _teto integer := COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 65);
  _vagas integer;
  _corretor boolean;
  _em_total integer;
  _entregues integer := 0;
  _em integer := 0;
  _ficaram integer := 0;
  _sairam integer := 0;
  _motivo text;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  _corretor := public.is_active_member(_me)
               AND public.has_role(_me, 'corretor'::public.app_role)
               AND public._cadencia_dono_ativo(_me);
  _vagas := public.carteira_vagas_v1(_me);

  SELECT count(*)::int INTO _em_total
    FROM public.leads AS l
   WHERE l.corretor_id = _me
     AND public._prospeccao_em_lote(l.prospeccao_lote_id, l.cadencia_etapa)
     AND l.deleted_at IS NULL
     AND NOT l.na_lixeira;

  SELECT * INTO _lote
    FROM public.prospeccao_lotes AS pl
   WHERE pl.corretor_id = _me
   ORDER BY pl.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    SELECT p.entregues, p.em_cadencia, p.ficaram, p.sairam
      INTO _entregues, _em, _ficaram, _sairam
      FROM public._prospeccao_lote_placar(_lote.id) AS p;
  END IF;

  _motivo := CASE
    WHEN NOT _corretor THEN 'so_corretor'
    WHEN _em_total > 0 THEN 'lote_em_andamento'
    WHEN _vagas <= 0 THEN 'carteira_cheia'
  END;

  RETURN jsonb_build_object(
    'lote_id', _lote.id,
    'zona', _lote.zona,
    'criado_em', _lote.created_at,
    'entregues', _entregues,
    'em_cadencia', _em,
    'ficaram', _ficaram,
    'sairam', _sairam,
    'em_cadencia_total', _em_total,
    'vagas', _vagas,
    'teto', _teto,
    'tamanho', 30,
    'pode_pedir', _motivo IS NULL,
    'motivo', _motivo,
    'portas_legadas', COALESCE(
      (SELECT c.portas_legadas_bolsao FROM public.cadencia_config AS c WHERE c.id = 1), false));
END;
$$;

REVOKE ALL ON FUNCTION public.prospeccao_lote_status_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospeccao_lote_status_v1() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) Pedir o lote
-- ---------------------------------------------------------------------------
-- Cada cliente é entregue numa subtransação: se ele não chegar em D0 (ou mudar
-- de mãos no meio do caminho), aquele cliente é desfeito e o lote segue com os
-- outros. Qualquer outro erro derruba o pedido inteiro — silenciar erro
-- desconhecido aqui esconderia defeito de verdade.
CREATE OR REPLACE FUNCTION public.prospeccao_pedir_lote(_zona text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _me uuid := auth.uid();
  _z text := public.zona_normalizar(_zona);
  _st jsonb;
  _lote uuid;
  _n integer := 0;
  _l record;
  _etapa text;
  _tamanho constant integer := 30;
  _anti integer := COALESCE(
    (public.gestao_config_valor('bolsao') ->> 'discador_anti_ioio_dias')::int, 30);
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _z IS NULL THEN
    RAISE EXCEPTION 'zona invalida: %', _zona USING ERRCODE = '22023';
  END IF;

  -- Dois cliques do mesmo corretor não viram dois lotes.
  PERFORM pg_advisory_xact_lock(hashtext('prospeccao_lote:' || _me::text));

  _st := public.prospeccao_lote_status_v1();
  IF NOT (_st ->> 'pode_pedir')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', _st ->> 'motivo');
  END IF;

  INSERT INTO public.prospeccao_lotes (corretor_id, zona, solicitados)
  VALUES (_me, _z, _tamanho)
  RETURNING id INTO _lote;

  PERFORM set_config('app.prospeccao_lote', 'on', true);

  FOR _l IN
    -- Três filtros sobre o próprio lead, que o planejador aplica do mais
    -- barato ao mais caro (é o COST de cada função): colunas → zona → regra
    -- inteira. Assim a regra, com várias subconsultas por linha, só roda para
    -- quem já é da zona pedida.
    SELECT l.id, l.status, l.classe_lead, l.corretores_que_tentaram,
           l.data_distribuicao, l.timestamp_recebimento
      FROM public.leads AS l
     WHERE l.corretor_id IS NULL
       AND l.sdr_id IS NULL
       AND l.cadencia_etapa IS NULL
       AND l.deleted_at IS NULL
       AND NOT l.na_lixeira
       AND public._prospeccao_zona_do_lead(l) = _z
       AND public._prospeccao_lote_elegivel(l, _me, _anti)
     -- A mesma ordem do Bolsão e do Discador: o parado há mais tempo primeiro.
     ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) ASC,
              l.id ASC
     LIMIT _tamanho
     FOR UPDATE OF l SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.prospeccao_lote_itens
        (lote_id, lead_id, status_anterior, classe_anterior,
         data_distribuicao_anterior, recebimento_anterior)
      VALUES
        (_lote, _l.id, _l.status, _l.classe_lead,
         _l.data_distribuicao, _l.timestamp_recebimento);

      -- classe 'base' + via_webhook false: o SLA de 15 minutos não toma o
      -- cliente do lote (item 4 do cabeçalho). O gatilho de atribuição põe o
      -- lead em D0 neste mesmo UPDATE.
      UPDATE public.leads
         SET corretor_id               = _me,
             prospeccao_lote_id        = _lote,
             data_distribuicao         = now(),
             timestamp_recebimento     = now(),
             tentativas_redistribuicao = 0,
             via_webhook               = false,
             classe_lead               = 'base',
             corretores_que_tentaram   = CASE
               WHEN _me = ANY (COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]))
                 THEN _l.corretores_que_tentaram
               ELSE array_append(COALESCE(_l.corretores_que_tentaram, ARRAY[]::uuid[]), _me)
             END
       WHERE id = _l.id AND corretor_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'lead mudou de mãos' USING ERRCODE = 'SMQL1';
      END IF;

      IF _l.status = 'novo'::public.lead_status THEN
        PERFORM public.transicionar_lead(
          _l.id, 'aguardando_atendimento'::public.lead_status, 'Lote de prospecção');
      END IF;

      SELECT l.cadencia_etapa INTO _etapa FROM public.leads AS l WHERE l.id = _l.id;
      IF _etapa IS DISTINCT FROM 'D0' THEN
        RAISE EXCEPTION 'lead fora da cadência' USING ERRCODE = 'SMQL1';
      END IF;

      -- O cliente saiu do Bolsão: atendimentos abertos no Discador se encerram,
      -- como quando alguém assume por lá.
      UPDATE public.discador_atendimentos AS a
         SET encerrado_em = now(),
             encerrado_motivo = CASE WHEN a.corretor_id = _me THEN 'posse_propria' ELSE 'posse_outro' END
       WHERE a.lead_id = _l.id AND a.encerrado_em IS NULL;

      INSERT INTO public.distribution_log
        (lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado)
      VALUES
        (_l.id, _me, 'manual'::public.distribuicao_tipo,
         'Lote de prospecção (Zona ' || _z || ')', 'lote_prospeccao', 'sucesso');

      _n := _n + 1;
    EXCEPTION WHEN SQLSTATE 'SMQL1' THEN
      NULL;
    END;
  END LOOP;

  PERFORM set_config('app.prospeccao_lote', 'off', true);

  IF _n = 0 THEN
    DELETE FROM public.prospeccao_lotes WHERE id = _lote;
    RETURN jsonb_build_object('ok', false, 'motivo', 'zona_vazia', 'zona', _z);
  END IF;

  UPDATE public.prospeccao_lotes SET entregues = _n WHERE id = _lote;

  RETURN jsonb_build_object(
    'ok', true, 'lote_id', _lote, 'entregues', _n, 'solicitados', _tamanho, 'zona', _z);
END;
$$;

REVOKE ALL ON FUNCTION public.prospeccao_pedir_lote(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospeccao_pedir_lote(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.prospeccao_pedir_lote(text) IS
  'Entrega ao corretor autenticado até 30 clientes do Bolsão da zona pedida, '
  'direto na cadência (D0), fora da carteira ativa e da vaga de entrada da '
  'formação. Travas em prospeccao_lote_status_v1; regra de quem vem em '
  '_prospeccao_lote_elegivel.';

-- ---------------------------------------------------------------------------
-- 10) Os lotes no Painel da cadência (gestão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prospeccao_lotes_painel_v1(_limite integer DEFAULT 30)
RETURNS TABLE(
  lote_id uuid,
  corretor_id uuid,
  corretor_nome text,
  zona text,
  criado_em timestamptz,
  entregues integer,
  em_cadencia integer,
  ficaram integer,
  sairam integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(_uid, 'admin'::public.app_role)
          OR public.has_role(_uid, 'gestor'::public.app_role)
          OR public.has_role(_uid, 'superintendente'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT pl.id, pl.corretor_id, pr.nome, pl.zona, pl.created_at,
         pc.entregues, pc.em_cadencia, pc.ficaram, pc.sairam
    FROM public.prospeccao_lotes AS pl
    JOIN public.profiles AS pr ON pr.id = pl.corretor_id
    CROSS JOIN LATERAL public._prospeccao_lote_placar(pl.id) AS pc
   WHERE public.pode_acessar_corretor(_uid, pl.corretor_id)
   ORDER BY pl.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.prospeccao_lotes_painel_v1(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospeccao_lotes_painel_v1(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11) Fora da base: a vaga de entrada da formação não conta o lote
-- ---------------------------------------------------------------------------
-- Idênticas a 20260925120000, com a formação contada sem os clientes de lote.
CREATE OR REPLACE FUNCTION public.carteira_vagas_entrada_v1(_corretor uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH atual AS (
    SELECT c.ativa, c.faixa, l.prospeccao_lote_id, l.cadencia_etapa
      FROM public._carteira_classificar(_corretor) AS c
      JOIN public.leads AS l ON l.id = c.lead_id
  )
  SELECT public._carteira_vaga_entrada(
    (SELECT count(*)::int FROM atual WHERE atual.ativa),
    (SELECT count(*)::int FROM atual
      WHERE atual.faixa = 'formacao'
        AND NOT public._prospeccao_em_lote(atual.prospeccao_lote_id, atual.cadencia_etapa)));
$function$;

COMMENT ON FUNCTION public.carteira_vagas_entrada_v1(uuid) IS
  'Quantos leads NOVOS cabem agora: 0 se a carteira de 65 está cheia; senão '
  'cap_formacao menos quem já está em formação (D0..D3). Formação não ocupa '
  'vaga dos 65, e cliente de lote de prospecção não ocupa nem a de entrada.';

CREATE OR REPLACE FUNCTION public.carteira_formacao_v1(_corretor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _alvo uuid := COALESCE(_corretor, auth.uid());
  _ocupadas integer;
  _formacao integer;
  _lote integer;
  _cfg jsonb := public.carteira_ativa_config();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.pode_acessar_corretor(_caller, _alvo) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) FILTER (WHERE c.ativa)::int,
         count(*) FILTER (WHERE c.faixa = 'formacao'
                            AND NOT public._prospeccao_em_lote(l.prospeccao_lote_id, l.cadencia_etapa))::int,
         count(*) FILTER (WHERE c.faixa = 'formacao'
                            AND public._prospeccao_em_lote(l.prospeccao_lote_id, l.cadencia_etapa))::int
    INTO _ocupadas, _formacao, _lote
    FROM public._carteira_classificar(_alvo) AS c
    JOIN public.leads AS l ON l.id = c.lead_id;
  RETURN jsonb_build_object(
    'em_formacao',   _formacao,
    'em_lote_prospeccao', _lote,
    'cap_formacao',  COALESCE((_cfg ->> 'cap_formacao')::int, (_cfg ->> 'cap_sla')::int, 20),
    'ocupadas',      _ocupadas,
    'teto',          COALESCE((_cfg ->> 'teto')::int, 65),
    'vagas_entrada', public._carteira_vaga_entrada(_ocupadas, _formacao));
END;
$function$;

-- A admissão do estoque (Fase 0): a cota da formação não conta o lote, e a
-- trava das portas antigas passa a falar em vez de devolver zero linhas.
CREATE OR REPLACE FUNCTION public.cadencia_fase0_admitir(_modo text DEFAULT NULL::text, _por_corretor integer DEFAULT NULL::integer)
 RETURNS TABLE(lote_id uuid, modo text, corretores integer, admitidos integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  -- Portas antigas fechadas (28/09/2026): o ensaio segue valendo, a admissão
  -- de verdade diz por que não roda.
  IF _m = 'ativo' AND NOT COALESCE(_cfg.portas_legadas_bolsao, false) THEN
    RAISE EXCEPTION 'Admissão do estoque desligada: desde 28/09/2026 a base nova do corretor chega pelo lote de prospecção. Para religar, cadencia_config.portas_legadas_bolsao = true.'
      USING ERRCODE = '55000';
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
                    AND l.cadencia_etapa IN ('D0', 'D1', 'D2', 'D3')
                    AND NOT public._prospeccao_em_lote(l.prospeccao_lote_id, l.cadencia_etapa)
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
      (_lote, 'fase0', _c.lead_id, _c.corretor_id, NULL, 'D0', 'admissao_estoque', _m, _ok,
       jsonb_build_object('dias_parado', _c.dias_parado, 'teto_por_corretor', _teto,
                          'cota_formacao', _c.cota, 'etapa_aplicada', 'D0'));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m,
         count(DISTINCT g.corretor_id)::int,
         count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 12) Cliente de lote que não foi trabalhado volta ao Bolsão
-- ---------------------------------------------------------------------------
-- Chamada pelos três caminhos que devolvem à roleta (etapa vencida, cadência
-- incompleta, corretor inativo). Volta ao status, à classe e à data de
-- distribuição de antes do lote;
-- o gatilho do item 4 solta o lote do lead; o item fica marcado como
-- devolvido, o que alimenta o anti-ioiô do próximo pedido.
CREATE OR REPLACE FUNCTION public._prospeccao_devolver_bolsao(_lead uuid, _corretor uuid, _motivo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lote uuid;
  _item public.prospeccao_lote_itens%ROWTYPE;
  _ok boolean;
BEGIN
  SELECT l.prospeccao_lote_id INTO _lote
    FROM public.leads AS l
   WHERE l.id = _lead AND l.corretor_id = _corretor;
  IF _lote IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO _item
    FROM public.prospeccao_lote_itens AS i
   WHERE i.lote_id = _lote AND i.lead_id = _lead;

  -- Mesma regra de _cadencia_devolver_roleta: a etapa é limpa no MESMO UPDATE
  -- que solta o corretor.
  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id      = corretor_id,
         corretor_id               = NULL,
         status                    = COALESCE(_item.status_anterior, status),
         classe_lead               = COALESCE(_item.classe_anterior, classe_lead),
         data_distribuicao         = CASE WHEN _item.lead_id IS NULL THEN data_distribuicao
                                          ELSE _item.data_distribuicao_anterior END,
         timestamp_recebimento     = CASE WHEN _item.lead_id IS NULL THEN timestamp_recebimento
                                          ELSE _item.recebimento_anterior END,
         tentativas_redistribuicao = 0,
         cadencia_etapa            = NULL,
         cadencia_prazo_ts         = NULL,
         cadencia_inicio_ts        = NULL
   WHERE id = _lead AND corretor_id = _corretor;
  _ok := FOUND;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  IF NOT _ok THEN
    RETURN false;
  END IF;

  UPDATE public.prospeccao_lote_itens
     SET devolvido_em = now()
   WHERE lote_id = _lote AND lead_id = _lead;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead, NULL, 'redistribuicao'::public.distribuicao_tipo,
     'Lote de prospecção: ' || _motivo || ' — cliente volta ao Bolsão',
     'base', 'lote_prospeccao_' || _motivo, 'sucesso');

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead, 'cadencia_etapa',
          'Cliente do lote de prospecção voltou ao Bolsão (' || _motivo || ').',
          'cadencia',
          jsonb_build_object('para_estado', 'bolsao', 'motivo', _motivo,
                             'lote', _lote, 'corretor_anterior', _corretor));

  IF _corretor IS NOT NULL AND _motivo <> 'corretor_inativo' THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (_corretor, 'distribuicao'::public.alerta_tipo,
            'Cliente do lote voltou ao Bolsão',
            'A cadência do lote não foi cumprida no prazo e o cliente voltou ao Bolsão.',
            '/leads/' || _lead, _lead);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._prospeccao_devolver_bolsao(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Idêntica a 20260921120100, com o desvio do lote na entrada.
CREATE OR REPLACE FUNCTION public._cadencia_devolver_roleta(_lead uuid, _corretor uuid, _motivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE _ok boolean;
BEGIN
  -- Cliente de lote de prospecção veio do Bolsão e volta para lá: na roleta
  -- ele furaria a fila dos leads pagos (20261005120000, item 5).
  IF EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.id = _lead AND l.corretor_id = _corretor AND l.prospeccao_lote_id IS NOT NULL
  ) THEN
    RETURN public._prospeccao_devolver_bolsao(_lead, _corretor, _motivo);
  END IF;

  -- A etapa é limpa NO MESMO UPDATE que solta o corretor. Se fossem dois
  -- comandos, existiria um instante com lead sem dono e ainda em D2 — e o
  -- gatilho de atribuição, ao chegar o dono novo, recusaria iniciar a
  -- cadência (ele ignora quem já está em cadência). O lead entraria na
  -- carteira do próximo corretor mudo, sem prazo e sem próxima ação.
  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id      = corretor_id,
         corretor_id               = NULL,
         status                    = 'aguardando_corretor'::public.lead_status,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram   = ARRAY[corretor_id],
         cadencia_etapa            = NULL,
         cadencia_prazo_ts         = NULL,
         cadencia_inicio_ts        = NULL
   WHERE id = _lead AND corretor_id = _corretor;
  _ok := FOUND;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  IF NOT _ok THEN
    RETURN false;
  END IF;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead, NULL, 'redistribuicao'::public.distribuicao_tipo,
     'Cadência: ' || _motivo, 'roleta', 'cadencia_' || _motivo, 'sucesso');

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead, 'cadencia_etapa',
          'Lead devolvido à roleta pela cadência (' || _motivo || ').',
          'cadencia',
          jsonb_build_object('para_estado', 'roleta', 'motivo', _motivo));

  -- O aviso ao corretor que perdeu o lead. O documento fala da
  -- `fila_aviso_redistribuicao` agrupada a cada 10 min; aqui o equivalente
  -- vivo é `alertas`, que a navegação já conta e agrupa por usuário.
  IF _corretor IS NOT NULL THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (_corretor, 'distribuicao'::public.alerta_tipo,
            'Lead devolvido à roleta',
            'A etapa da cadência venceu e o lead voltou para a roleta da campanha.',
            '/leads/' || _lead, _lead);
  END IF;

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 13) Fila do Dia: o lote vem depois da carteira, e o card sabe que é lote
-- ---------------------------------------------------------------------------
-- Idêntica a 20261001120000, com a chave `lote` no card.
CREATE OR REPLACE FUNCTION public._cadencia_item(_lead uuid, _fim_hoje timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', l.id,
    'nome', l.nome,
    'telefone', l.telefone,
    'email', l.email,
    'status', l.status::text,
    'etapa', l.cadencia_etapa,
    'ciclo', l.cadencia_ciclo,
    'reativado', l.reativado,
    'projeto_nome', l.projeto_nome,
    'faixa_mcmv', l.faixa_mcmv,
    'renda_estimada', l.renda_estimada,
    'prazo', l.cadencia_prazo_ts,
    'atrasado', (l.cadencia_prazo_ts < date_trunc('day', _fim_hoje)),
    'proxima_acao', l.proxima_acao,
    'telefone_suspeito', public.telefone_suspeito(l.telefone),
    -- Cliente de lote de prospecção (20261005120000): a tela marca o card.
    'lote', (l.prospeccao_lote_id IS NOT NULL),
    -- As ligações já respeitam o intervalo mínimo, senão o contador diria 2 e
    -- a etapa não fecharia — e o corretor não entenderia por quê.
    'ligacoes_validas', (
      SELECT count(*) FROM (
        SELECT tt.ts - lag(tt.ts) OVER (ORDER BY tt.ts) AS gap
        FROM public.cadencia_tentativas tt
        WHERE tt.lead_id = l.id AND tt.etapa = l.cadencia_etapa
          AND tt.ciclo = l.cadencia_ciclo AND tt.canal = 'ligacao'
      ) g, public.cadencia_config c
      WHERE c.id = 1 AND (g.gap IS NULL OR g.gap >= c.intervalo_min_lig)
    ),
    'whatsapp_enviado', EXISTS (
      SELECT 1 FROM public.cadencia_tentativas tt
      WHERE tt.lead_id = l.id AND tt.etapa = l.cadencia_etapa
        AND tt.ciclo = l.cadencia_ciclo AND tt.canal = 'whatsapp'
    ),
    'etapa_completa', public.cadencia_etapa_completa(l.id, l.cadencia_etapa)
  )
  FROM public.leads l
  WHERE l.id = _lead;
$function$;

-- Idêntica a 20261001120000, com o lote depois da carteira dentro de cada
-- balde. Sem isto, na mesma etapa o desempate `created_at ASC` punha os 30
-- clientes antigos do Bolsão na frente do lead pago que chegou hoje.
CREATE OR REPLACE FUNCTION public.cadencia_fila_v1(_corretor uuid DEFAULT NULL::uuid, _take integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _target uuid := COALESCE(_corretor, auth.uid());
  _fim_hoje timestamptz := public.cadencia_fim_do_dia(now(), 0);
  _itens jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _target <> _uid AND NOT public.pode_acessar_corretor(_uid, _target) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _take := LEAST(GREATEST(COALESCE(_take, 200), 1), 500);

  SELECT COALESCE(jsonb_agg(public._cadencia_item(s.id, _fim_hoje) ORDER BY s.ordem), '[]'::jsonb)
    INTO _itens
  FROM (
    SELECT
      l.id,
      row_number() OVER (
        ORDER BY
          -- 1: atrasado, 2: vence hoje. Quem vence depois de hoje não entra.
          CASE WHEN l.cadencia_prazo_ts < date_trunc('day', _fim_hoje) THEN 1 ELSE 2 END,
          -- Dentro do balde, a carteira antes do lote de prospecção.
          (l.prospeccao_lote_id IS NOT NULL),
          -- atrasados: o mais antigo primeiro
          CASE WHEN l.cadencia_prazo_ts < date_trunc('day', _fim_hoje)
               THEN l.cadencia_prazo_ts END ASC NULLS LAST,
          -- vencendo hoje: Lead chegou antes de D1, D1 antes de D2, D2 antes
          -- de D3. Lead novo esfria mais rápido.
          CASE l.cadencia_etapa WHEN 'D0' THEN 0 WHEN 'D1' THEN 1 WHEN 'D2' THEN 2 ELSE 3 END,
          -- desempate: maior renda primeiro
          public.cadencia_prioridade_reativacao(l.id) ASC,
          l.created_at ASC
      ) AS ordem
    FROM public.leads l
    WHERE l.corretor_id = _target
      AND l.cadencia_etapa IN ('D0','D1','D2','D3')
      AND l.cadencia_prazo_ts IS NOT NULL
      AND l.cadencia_prazo_ts <= _fim_hoje
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY ordem
    LIMIT _take
  ) s;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'corretor_id', _target,
    'itens', _itens
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 14) O badge do Modo Foco não conta o lote
-- ---------------------------------------------------------------------------
-- Idêntica a 20260830150000, com o lote fora de `atendimento`: o cartão do
-- Modo Foco tira o lote das três bases, e o badge precisa bater com o cartão.
CREATE OR REPLACE FUNCTION public.nav_pendencias()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tudo boolean := false;
  _escopo uuid[];
  _atendimento int := 0;
  _tarefas int := 0;
  _agenda int := 0;
  _aprov int := 0;
  _followups int := 0;
  _mensagens int := 0;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RETURN jsonb_build_object('atendimento',0,'tarefas_vencidas',0,'agenda_hoje',0,'aprovacoes',0,'followups',0,'mensagens_aguardando',0);
  END IF;

  _tudo := public.ve_carteira_completa(_uid);
  IF NOT _tudo THEN
    SELECT array_agg(DISTINCT c) INTO _escopo
    FROM (
      SELECT _uid AS c
      UNION
      SELECT public.corretores_do_gestor(_uid)
    ) s
    WHERE c IS NOT NULL;
    _escopo := COALESCE(_escopo, ARRAY[_uid]);
  END IF;

  SELECT count(*) INTO _atendimento
  FROM public.leads l
  WHERE l.status = 'aguardando_atendimento'
    AND l.na_lixeira = false
    AND NOT public._prospeccao_em_lote(l.prospeccao_lote_id, l.cadencia_etapa)
    AND (_tudo OR l.corretor_id = ANY(_escopo));

  -- v4: SÓ tarefas que não são de contato — as de contato são o domínio do
  -- contador `followups` (a régua), e um esforço não acende dois badges.
  SELECT count(*) INTO _tarefas
  FROM public.tarefas t
  WHERE t.status NOT IN ('concluida','cancelada')
    AND t.deleted_at IS NULL
    AND t.tipo NOT IN ('follow_up','ligacao','whatsapp','email')
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento < now()
    AND (_tudo OR t.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _agenda
  FROM public.agendamentos a
  WHERE a.status = 'agendado'
    AND a.deleted_at IS NULL
    AND (a.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
        = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (_tudo OR a.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _aprov
  FROM public.vendas v
  WHERE v.status_venda = 'pendente'
    AND (_tudo OR v.corretor_id = ANY(_escopo));

  -- Follow-ups do DIA: LEADS com tarefa de contato aberta vencendo até hoje
  -- (BRT) — vencidas inclusas (inalterado da v3).
  SELECT count(DISTINCT COALESCE(t.lead_id, t.id)) INTO _followups
  FROM public.tarefas t
  WHERE t.status NOT IN ('concluida','cancelada')
    AND t.deleted_at IS NULL
    AND t.tipo IN ('follow_up','ligacao','whatsapp','email')
    AND t.data_vencimento IS NOT NULL
    AND (t.data_vencimento AT TIME ZONE 'America/Sao_Paulo')::date
        <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (_tudo OR t.corretor_id = ANY(_escopo));

  -- v5: conversas aguardando resposta pela FONTE ÚNICA, num passe set-based
  -- (a base inteira de um admin não aguenta função por lead). Leads da fila
  -- de entrada ficam fora (o badge `atendimento` da Prospecção é o dono);
  -- etapas terminais contam — cliente que escreve depois do fim da jornada
  -- acende aqui, e o botão de apagar (responder/marcar tratada) vive na
  -- Central.
  SELECT count(*) INTO _mensagens
  FROM public.conversas_aguardando_resposta(ARRAY(
    SELECT l.id
    FROM public.leads l
    WHERE l.na_lixeira = false
      AND l.deleted_at IS NULL
      AND l.status NOT IN ('novo', 'aguardando_atendimento')
      AND (_tudo OR l.corretor_id = ANY(_escopo))
  )) ca
  WHERE ca.aguardando;

  RETURN jsonb_build_object(
    'atendimento', _atendimento,
    'tarefas_vencidas', _tarefas,
    'agenda_hoje', _agenda,
    'aprovacoes', _aprov,
    'followups', _followups,
    'mensagens_aguardando', _mensagens
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 15) As portas antigas, fechadas para o corretor (registro de 28/09)
-- ---------------------------------------------------------------------------
-- Idênticas às vigentes (20260913120000 e 20260915140000) com a trava do
-- Lovable. A gestão segue podendo; `portas_legadas_bolsao = true` religa.
CREATE OR REPLACE FUNCTION public.carteira_resgatar(_lead uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _dono uuid;
  _vagas integer;
  _cap integer;
  _usados integer;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE((SELECT c.portas_legadas_bolsao FROM public.cadencia_config AS c WHERE c.id = 1), false)
     AND NOT (public.has_role(_caller, 'admin'::public.app_role)
              OR public.has_role(_caller, 'gestor'::public.app_role)
              OR public.has_role(_caller, 'superintendente'::public.app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'porta_fechada_use_lote');
  END IF;

  SELECT l.corretor_id INTO _dono
  FROM public.leads AS l
  WHERE l.id = _lead AND l.deleted_at IS NULL AND l.na_lixeira = false;

  IF _dono IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_sem_dono_ou_inexistente');
  END IF;
  IF _dono <> _caller THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _cap := COALESCE((public.carteira_ativa_config() ->> 'cap_resgate')::int, 13);
  SELECT count(*)::int INTO _usados
  FROM public.carteira_resgates AS r WHERE r.corretor_id = _caller;

  IF _usados >= _cap AND NOT EXISTS (
    SELECT 1 FROM public.carteira_resgates AS r
    WHERE r.corretor_id = _caller AND r.lead_id = _lead
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cap_resgate_atingido', 'cap', _cap);
  END IF;

  _vagas := public.carteira_vagas_v1(_caller);

  INSERT INTO public.carteira_resgates (corretor_id, lead_id)
  VALUES (_caller, _lead)
  ON CONFLICT (corretor_id, lead_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', _lead,
    'vagas_antes', _vagas,
    'vagas_agora', public.carteira_vagas_v1(_caller));
END;
$function$;

CREATE OR REPLACE FUNCTION public.discador_bolsao_assumir_v1(_lead uuid, _corretor uuid, _motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _l record;
BEGIN
  IF _corretor IS NULL OR NOT public.is_active_member(_corretor) THEN
    RAISE EXCEPTION 'corretor inexistente ou inativo' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE((SELECT c.portas_legadas_bolsao FROM public.cadencia_config AS c WHERE c.id = 1), false)
     AND NOT (public.has_role(_corretor, 'admin'::public.app_role)
              OR public.has_role(_corretor, 'gestor'::public.app_role)
              OR public.has_role(_corretor, 'superintendente'::public.app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'porta_fechada_use_lote');
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
$function$;

-- ---------------------------------------------------------------------------
-- 16) Guardas
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _def text;
BEGIN
  _def := pg_get_functiondef('public._cadencia_devolver_roleta(uuid,uuid,text)'::regprocedure);
  IF position('_prospeccao_devolver_bolsao' IN _def) = 0 THEN
    RAISE EXCEPTION 'lote: _cadencia_devolver_roleta sem o desvio para o Bolsão';
  END IF;
  _def := pg_get_functiondef('public.prospeccao_pedir_lote(text)'::regprocedure);
  IF position('_prospeccao_zona_do_lead' IN _def) = 0 OR position('_prospeccao_lote_elegivel' IN _def) = 0 THEN
    RAISE EXCEPTION 'lote: prospeccao_pedir_lote sem a zona pela cascata ou sem a regra de elegibilidade';
  END IF;
  IF position('classe_lead' IN _def) = 0 OR position('via_webhook' IN _def) = 0 THEN
    RAISE EXCEPTION 'lote: prospeccao_pedir_lote sem a proteção do SLA (classe base, via_webhook)';
  END IF;
  _def := pg_get_functiondef('public.carteira_vagas_entrada_v1(uuid)'::regprocedure);
  IF position('_prospeccao_em_lote' IN _def) = 0 THEN
    RAISE EXCEPTION 'lote: carteira_vagas_entrada_v1 ainda conta o lote na formação';
  END IF;
  IF to_regprocedure('public.tg_prospeccao_lote_solta_ao_trocar_dono()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prospeccao_lote_solta_ao_trocar_dono') THEN
    RAISE EXCEPTION 'lote: gatilho que solta o lote na troca de dono ausente';
  END IF;
END;
$guard$;
