-- ===========================================================================
-- CADÊNCIA D1/D2/D3 E REATIVAÇÃO — Fatia 1: fundação (schema, sem motor)
-- ===========================================================================
-- Desenho: docs/ops/cadencia-followup-reativacao.md.
--
-- A regra de negócio: todo lead ativo na carteira tem exatamente uma próxima
-- ação com prazo, e sai da carteira só por um destino definido. A cadência é
-- de três etapas (D1, D2, D3), 7 tentativas no total, e termina em um destes
-- lugares: qualificação (o cliente respondeu), base de reativação (cumpriu
-- 100% sem retorno) ou roleta (o corretor deixou vencer).
--
-- ---------------------------------------------------------------------------
-- ONDE ISSO MORA (a pergunta em aberto do documento, §"Pontos a confirmar")
-- ---------------------------------------------------------------------------
-- O documento pergunta se o motor fica no CRM ou num banco operacional à
-- parte, porque supunha o CRM em MySQL/TiDB via Drizzle. Não é o caso: este
-- CRM é Postgres (Supabase), e o motor de higiene (20260912120000), a régua
-- de devolução (20260914144023) e o motor de SDR (20260904102000) já rodam
-- aqui por pg_cron. A cadência entra no MESMO banco, sem espelho e sem
-- sincronização — não há segunda fonte para divergir.
--
-- ---------------------------------------------------------------------------
-- CADÊNCIA × RÉGUA DE 13 TOQUES: QUEM MANDA EM QUE JANELA
-- ---------------------------------------------------------------------------
-- O CRM já tem a régua de follow-up de 13 toques (20260827130000), com fila
-- do dia própria e esgotamento na 13ª. Ela e a cadência se contradiriam para
-- o lead que nunca respondeu: uma manda insistir por semanas, a outra encerra
-- em 3 dias.
--
-- A divisão decidida em 21/09/2026: a CADÊNCIA governa a janela PRÉ-RESPOSTA
-- (do momento em que o lead ganha corretor até ele responder ou sair da
-- carteira). Assim que o corretor registra "Cliente respondeu", o lead sai da
-- cadência (`cadencia_etapa = 'respondeu'`) e a RÉGUA assume o follow-up
-- consultivo — que é para o que ela foi calibrada: gaps por temperatura e
-- multiplicador por etapa de funil, coisas que só fazem sentido com um
-- cliente que já conversa.
--
-- Por isso `cadencia_etapa` é campo PRÓPRIO e não um valor de `leads.status`:
-- o status diz onde o lead está na venda, a etapa diz o que o corretor faz
-- agora. Um lead pode estar `em_atendimento` e em D2 ao mesmo tempo.
--
-- ---------------------------------------------------------------------------
-- O QUE NÃO SE CRIOU DE PROPÓSITO
-- ---------------------------------------------------------------------------
-- O documento pede uma tabela `perdas` com CHECK de motivos. O CRM já tem
-- `leads.motivo_perda_categoria` com CHECK desde 20260704211316, e a migration
-- 20260914150000 existe justamente para matar a SEGUNDA cópia da regra de
-- motivos que havia nascido. Criar `perdas` agora recriaria o problema que
-- aquela migration pagou para resolver. Em vez disso, esta migration ESTENDE
-- o domínio existente com os três motivos que a cadência introduz e que não
-- tinham equivalente. Os demais motivos do documento já existem com outro
-- nome, e o mapeamento está registrado abaixo.
--
-- Também não se criou `lead_realocacoes` nem `fila_aviso_redistribuicao`: o
-- equivalente vivo é `devolucao_log` + o handoff throttled de
-- `transferir_leads` (20260919120000). O motor (Fatia 2) grava ali.
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT em tudo.
-- Rollback: dropar as duas tabelas novas, as colunas `cadencia_*`,
-- `reativado` e `arquivado_em` de `leads`, e restaurar o CHECK de
-- motivo_perda_categoria para a lista de 20260704211316.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Configuração: os prazos moram em UM lugar só
-- ---------------------------------------------------------------------------
-- Mesmo padrão de higiene_config: mudar a janela de descanso ou a tolerância
-- de vencimento é um UPDATE nesta linha, não um deploy. Linha única (id = 1)
-- porque a cadência é da casa inteira — não há cadência por equipe, e fingir
-- que há convidaria a operação a ter três réguas de novo.
CREATE TABLE IF NOT EXISTS public.cadencia_config (
  id                integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modo              text     NOT NULL DEFAULT 'sombra' CHECK (modo IN ('sombra','ativo')),
  descanso_dias     integer  NOT NULL DEFAULT 15 CHECK (descanso_dias BETWEEN 0 AND 180),
  espera_pos_d3_h   integer  NOT NULL DEFAULT 24 CHECK (espera_pos_d3_h BETWEEN 1 AND 168),
  tolerancia_venc_d integer  NOT NULL DEFAULT 1  CHECK (tolerancia_venc_d BETWEEN 0 AND 30),
  intervalo_min_lig interval NOT NULL DEFAULT '2 minutes',
  -- Teto por corretor na carga diária da Fase 0 (estoque parado 7-30 dias).
  -- Sem teto, a Fila do Dia abre com 200 itens e o corretor desiste no
  -- primeiro dia — o risco que o §"Fase 0" do documento nomeia.
  lote_estoque_dia  integer  NOT NULL DEFAULT 15 CHECK (lote_estoque_dia BETWEEN 1 AND 200),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cadencia_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.cadencia_config IS
  'Parâmetros da cadência D1/D2/D3. Linha única. modo=sombra|ativo, como o '
  'motor de higiene e a régua de devolução.';
COMMENT ON COLUMN public.cadencia_config.modo IS
  'sombra: o motor calcula e loga em cadencia_execucao_log, sem tocar em lead '
  'nenhum. ativo: aplica. Nada age sozinho antes de 7 dias em sombra.';
COMMENT ON COLUMN public.cadencia_config.espera_pos_d3_h IS
  'Horas após a mensagem de encerramento do D3 antes de mandar para descanso. '
  'Existe para dar ao cliente a chance de responder à própria mensagem que '
  'avisa que o atendimento acabou — é quando mais gente responde.';
COMMENT ON COLUMN public.cadencia_config.intervalo_min_lig IS
  'Intervalo mínimo entre duas ligações para que a segunda conte como '
  'tentativa nova. Evita o corretor ligar duas vezes seguidas só para fechar '
  'a etapa.';

ALTER TABLE public.cadencia_config ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.cadencia_config TO authenticated;
GRANT ALL    ON public.cadencia_config TO service_role;

-- Leitura para todo mundo autenticado: a Fila do Dia do CORRETOR precisa do
-- intervalo mínimo entre ligações para desenhar o contador de progresso da
-- etapa. Escrita só gestão, pela RPC abaixo.
DROP POLICY IF EXISTS "cadencia_config leitura autenticada" ON public.cadencia_config;
CREATE POLICY "cadencia_config leitura autenticada"
  ON public.cadencia_config FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2) Tentativas: a fonte da verdade da cadência
-- ---------------------------------------------------------------------------
-- Cada ligação e cada mensagem vira uma linha. `ts` é SEMPRE do servidor
-- (DEFAULT now(), e a RPC de registro não aceita data do cliente): é isso, e
-- só isso, que torna a validação dos 100% confiável. Se o corretor pudesse
-- digitar a data, "cumpriu a cadência" viraria autodeclaração e a saída para
-- a reativação — que não conta como perda dele — viraria a porta de fuga
-- preferida de quem não trabalhou o lead.
--
-- Por que tabela nova e não reaproveitar `interacoes`: a cadência precisa
-- saber a QUE ETAPA cada tentativa pertence, e `interacoes` não tem esse
-- conceito nem deve ter (ela é o histórico geral do lead, alimentado por
-- bot, SDR, importação e corretor). Derivar a etapa por data daria certo até
-- o primeiro lead cuja cadência atravessa um fim de semana.
CREATE TABLE IF NOT EXISTS public.cadencia_tentativas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Nullable e SET NULL, ao contrário do documento: a tentativa do DISCADOR
  -- não tem corretor, e a tentativa de um corretor desligado é histórico que
  -- precisa sobreviver a ele (senão o denominador do indicador de cumprimento
  -- muda sozinho quando alguém sai da casa).
  corretor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  etapa       text NOT NULL CHECK (etapa IN ('D1','D2','D3')),
  canal       text NOT NULL CHECK (canal IN ('ligacao','whatsapp')),
  resultado   text NOT NULL CHECK (resultado IN (
                'nao_atendeu','caixa_postal','ocupado','atendeu',
                'enviada','numero_invalido')),
  template_id uuid REFERENCES public.templates_mensagem(id) ON DELETE SET NULL,
  ts          timestamptz NOT NULL DEFAULT now(),
  origem      text NOT NULL DEFAULT 'crm' CHECK (origem IN ('crm','discador','importacao')),
  -- Ciclo da cadência a que esta tentativa pertence (1 = primeira passagem,
  -- 2 = voltou reativado). Sem isso, um lead reativado nasceria com as 7
  -- tentativas do ciclo anterior já contadas e "cumpriria 100%" sem ninguém
  -- ter ligado uma vez.
  ciclo       integer NOT NULL DEFAULT 1 CHECK (ciclo >= 1),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Consulta quente: "esta etapa deste lead está completa?" — roda a cada
-- clique do corretor e a cada 5 min no motor.
CREATE INDEX IF NOT EXISTS cadencia_tentativas_lead_etapa_idx
  ON public.cadencia_tentativas (lead_id, ciclo, etapa, ts);
-- Produtividade por corretor e o indicador "tempo até a 1ª tentativa".
CREATE INDEX IF NOT EXISTS cadencia_tentativas_corretor_idx
  ON public.cadencia_tentativas (corretor_id, ts DESC);

COMMENT ON TABLE public.cadencia_tentativas IS
  'Fonte da verdade da cadência: uma linha por ligação/mensagem. ts é sempre '
  'do servidor — a validação dos 100% depende disso.';
COMMENT ON COLUMN public.cadencia_tentativas.ciclo IS
  'Espelha leads.cadencia_ciclo no momento do registro. Lead reativado '
  'recomeça em ciclo 2 e não herda as tentativas do ciclo 1.';

ALTER TABLE public.cadencia_tentativas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.cadencia_tentativas TO authenticated;
GRANT ALL    ON public.cadencia_tentativas TO service_role;

-- Mesma régua de `interacoes`: quem enxerga o lead enxerga as tentativas.
-- INSERT não é liberado para `authenticated` de propósito — quem escreve é a
-- RPC `cadencia_registrar_tentativa` (DEFINER, Fatia 3), que carimba o `ts`
-- do servidor. Liberar INSERT direto devolveria ao cliente o poder de
-- escolher a data e desmontaria a validação dos 100%.
DROP POLICY IF EXISTS "cadencia_tentativas leitura por acesso ao lead" ON public.cadencia_tentativas;
CREATE POLICY "cadencia_tentativas leitura por acesso ao lead"
  ON public.cadencia_tentativas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = cadencia_tentativas.lead_id
        AND l.corretor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Estado da cadência no lead
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cadencia_etapa     text,
  ADD COLUMN IF NOT EXISTS cadencia_inicio_ts timestamptz,
  ADD COLUMN IF NOT EXISTS cadencia_prazo_ts  timestamptz,
  ADD COLUMN IF NOT EXISTS cadencia_ciclo     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reativado          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arquivado_em       timestamptz;

-- CHECK em passo separado para a migration ser reaplicável sem erro.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_cadencia_etapa_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_cadencia_etapa_check CHECK (
        cadencia_etapa IS NULL OR cadencia_etapa IN (
          'D1','D2','D3','respondeu','descanso','reativacao','arquivado','encerrado'
        )
      );
  END IF;
END $$;

-- O índice que ordena a Fila do Dia. PARCIAL de propósito: só quem está em
-- cadência ativa entra. Com ~55 mil leads vivos, indexar o resto seria pagar
-- escrita em toda a base para servir uma tela que só olha três estados.
CREATE INDEX IF NOT EXISTS leads_cadencia_prazo_idx
  ON public.leads (corretor_id, cadencia_prazo_ts)
  WHERE cadencia_etapa IN ('D1','D2','D3');

-- Varredura do motor de encerramento e do de vencidos (sem corretor no filtro).
CREATE INDEX IF NOT EXISTS leads_cadencia_etapa_prazo_idx
  ON public.leads (cadencia_etapa, cadencia_prazo_ts)
  WHERE cadencia_etapa IN ('D1','D2','D3');

COMMENT ON COLUMN public.leads.cadencia_etapa IS
  'O que o corretor deve fazer agora. Independente de leads.status, que diz '
  'onde o lead está na venda. NULL = fora da cadência.';
COMMENT ON COLUMN public.leads.cadencia_prazo_ts IS
  'Fim do dia (fuso São Paulo) em que a etapa vence. Ordena a Fila do Dia.';
COMMENT ON COLUMN public.leads.cadencia_ciclo IS
  '1 = primeira passagem. 2 = voltou pela reativação. Cumprir 100% no ciclo 2 '
  'sem retorno manda para o arquivo, não para uma segunda reativação.';
COMMENT ON COLUMN public.leads.reativado IS
  'Lead que voltou à roleta pela base de reativação. A Fila do Dia mostra a '
  'etiqueta "Reativado" e a anotação do SDR.';

-- ---------------------------------------------------------------------------
-- 4) Motivos de perda: estender o domínio que já existe
-- ---------------------------------------------------------------------------
-- Mapeamento entre o documento e o domínio vivo — três motivos são novos, os
-- demais já existiam com outro nome:
--
--   documento              CRM
--   ---------------------  --------------------------------------------------
--   sem_retorno_cadencia   NOVO  (é a saída "no processo", recuperável)
--   numero_invalido        NOVO  (hoje cairia em 'outro' e sumiria do relatório)
--   opt_out                NOVO  (hoje cairia em 'outro'; é o que barra o discador)
--   sem_interesse          sem_perfil
--   sem_renda              credito_renda
--   restricao_credito      credito_score
--   comprou_outro          comprou_concorrente
--   duplicado              (não é perda: o dedup faz merge, não perde)
--   outro                  outro
--
-- Só os três NOVOS entram. Acrescentar apelidos para os que já existem
-- devolveria à base duas palavras para a mesma coisa — exatamente o que
-- 20260914150000 removeu.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_motivo_perda_categoria_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_motivo_perda_categoria_check
  CHECK (
    motivo_perda_categoria IS NULL OR motivo_perda_categoria IN (
      'sem_contato','sumiu_pos_proposta','credito_score','credito_renda',
      'estourou_teto','ja_possui_imovel','preco_parcela','comprou_concorrente',
      'timing_adiou','sem_perfil','outro',
      -- Novos, trazidos pela cadência:
      'sem_retorno_cadencia','numero_invalido','opt_out'
    )
  );

-- A régua do "não reaborda" ganha os dois motivos que realmente proíbem
-- reabordagem. `sem_retorno_cadencia` fica FORA de propósito: é justamente o
-- motivo do lead que VAI para a reativação — marcá-lo como sem retrabalho
-- esvaziaria a base de reativação no dia seguinte ao go-live.
CREATE OR REPLACE FUNCTION public.motivo_perda_sem_retrabalho(_motivo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(_motivo, 'outro')
    IN ('ja_possui_imovel', 'comprou_concorrente', 'sem_perfil',
        'numero_invalido', 'opt_out');
$$;

COMMENT ON FUNCTION public.motivo_perda_sem_retrabalho(text) IS
  'Motivos de perda em que reabordar é incômodo, não oportunidade. Mesma '
  'lista que o motor de SDR (20260904102000) aplica ao reciclar perdidos. '
  'numero_invalido e opt_out entraram com a cadência (20260921120000); '
  'sem_retorno_cadencia fica FORA — é o motivo de quem vai para a reativação.';

-- ---------------------------------------------------------------------------
-- 5) Base de reativação
-- ---------------------------------------------------------------------------
-- Recebe só dois tipos de lead: quem cumpriu a cadência 100% sem retorno e,
-- uma única vez, o estoque parado há mais de 30 dias. Nunca é trabalhada pelo
-- corretor — é do discador (3C Plus) e do SDR.
--
-- Por que uma tabela e não só o Bolsão: o Bolsão responde "quem não tem
-- dono", e é isso que ele deve responder. A reativação precisa de três coisas
-- que não são do Bolsão e que sujariam o conceito dele — a janela de descanso
-- (`elegivel_em`), a ficha das 7 tentativas (`horarios_tentados`) e o ciclo
-- próprio do SDR (aguardando → em_discagem → com_sdr → reativado/sem_retorno).
-- A ENTREGA, porém, é pelo discador que já existe: a view da Fatia 3 alimenta
-- o mesmo caminho do Bolsão, para não haver duas integrações com o 3C.
CREATE TABLE IF NOT EXISTS public.reativacao_fila (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  entrou_em             timestamptz NOT NULL DEFAULT now(),
  -- entrou_em + cadencia_config.descanso_dias. A mensagem do D3 diz ao
  -- cliente que o atendimento foi encerrado; ligar logo depois aumenta
  -- bloqueio e denúncia do número no 3C.
  elegivel_em           timestamptz NOT NULL,
  origem                text NOT NULL CHECK (origem IN ('cadencia_cumprida','estoque_30d')),
  empreendimento        text,
  faixa_renda           text,
  prioridade            integer NOT NULL DEFAULT 5 CHECK (prioridade BETWEEN 1 AND 9),
  horarios_tentados     jsonb,
  status                text NOT NULL DEFAULT 'aguardando' CHECK (status IN (
                          'aguardando','em_discagem','com_sdr','reativado',
                          'sem_retorno','arquivado')),
  tentativas_reativacao integer NOT NULL DEFAULT 0 CHECK (tentativas_reativacao >= 0),
  sdr_id                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sdr_notas             text,
  finalizado_em         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Um lead não entra duas vezes na fila enquanto a entrada anterior não
-- terminou. O documento propõe `unique (lead_id, entrou_em)`, que não impede
-- nada na prática (dois inserts no mesmo lead a segundos de distância passam).
-- O índice parcial abaixo é a trava que a regra realmente pede.
CREATE UNIQUE INDEX IF NOT EXISTS reativacao_fila_lead_aberta_uq
  ON public.reativacao_fila (lead_id)
  WHERE status IN ('aguardando','em_discagem','com_sdr');

-- A fila do discador: elegível hoje, maior renda primeiro.
CREATE INDEX IF NOT EXISTS reativacao_fila_elegivel_idx
  ON public.reativacao_fila (status, elegivel_em, prioridade);

COMMENT ON TABLE public.reativacao_fila IS
  'Base de reativação: leads que cumpriram a cadência 100% sem retorno (mais '
  'a carga única do estoque parado). Trabalhada pelo discador e pelo SDR, '
  'nunca pelo corretor.';
COMMENT ON COLUMN public.reativacao_fila.prioridade IS
  '1 = maior renda. Espelha a ordem da planilha de follow-up.';
COMMENT ON COLUMN public.reativacao_fila.horarios_tentados IS
  'Resumo das 7 tentativas (faixas de horário e dias da semana já gastos). O '
  'discador usa para tentar as faixas que ainda não foram tentadas; o SDR usa '
  'para não repetir o gancho que já foi ignorado.';

DROP TRIGGER IF EXISTS trg_reativacao_fila_updated_at ON public.reativacao_fila;
CREATE TRIGGER trg_reativacao_fila_updated_at
  BEFORE UPDATE ON public.reativacao_fila
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reativacao_fila ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.reativacao_fila TO authenticated;
GRANT ALL    ON public.reativacao_fila TO service_role;

-- Gestão e SDR leem. O CORRETOR não: o lead que entrou aqui saiu da carteira
-- dele de propósito, e deixá-lo acompanhar a fila convidaria à pergunta
-- "posso pegar de volta?", que a regra responde com não.
DROP POLICY IF EXISTS "reativacao_fila leitura gestao e sdr" ON public.reativacao_fila;
CREATE POLICY "reativacao_fila leitura gestao e sdr"
  ON public.reativacao_fila FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR sdr_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 6) Templates das três mensagens
-- ---------------------------------------------------------------------------
-- Os textos ficam em `templates_mensagem` (o `biblioteca_mensagens` do
-- documento), marcados por contexto. Versionar aqui deixa o teste A/B pronto
-- para depois sem mexer em código: trocar o texto é um UPDATE.
ALTER TABLE public.templates_mensagem
  ADD COLUMN IF NOT EXISTS contexto text;

CREATE UNIQUE INDEX IF NOT EXISTS templates_mensagem_contexto_ativo_uq
  ON public.templates_mensagem (contexto)
  WHERE contexto IS NOT NULL AND ativo;

COMMENT ON COLUMN public.templates_mensagem.contexto IS
  'Marca o template usado por um fluxo automático (cadencia_D1, cadencia_D2, '
  'cadencia_D3). Único entre os ativos: dois textos ativos para a mesma etapa '
  'fariam a Fila do Dia escolher um deles por sorte da ordenação.';

INSERT INTO public.templates_mensagem (nome, canal, conteudo, contexto, ativo)
VALUES
  ('Cadência D1 — abertura', 'whatsapp',
   'Oi, {nome}! Tudo bem? Aqui é da Seu Metro Quadrado. Você pediu informações sobre o {empreendimento} e acabei de tentar te ligar. Consigo te explicar as condições em poucos minutos. Fica melhor eu te ligar hoje às 12h ou às 18h?',
   'cadencia_D1', true),
  ('Cadência D2 — insistência', 'whatsapp',
   '{nome}, tentei falar com você de novo hoje sobre o {empreendimento}. Já deixei separadas as condições de entrada e a simulação da parcela para te mostrar. Posso te ligar às 12h ou prefere às 19h?',
   'cadencia_D2', true),
  ('Cadência D3 — encerramento', 'whatsapp',
   '{nome}, como não consegui falar com você, vou encerrar seu atendimento por aqui para não te incomodar. Se ainda quiser saber do {empreendimento}, é só responder esta mensagem que eu retomo com prioridade. Obrigado!',
   'cadencia_D3', true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Telefone suspeito
-- ---------------------------------------------------------------------------
-- Lead com telefone suspeito entra na cadência com a próxima ação "contatar
-- por e-mail" e NÃO mostra o botão de WhatsApp. Sem isso, o corretor gasta as
-- 7 tentativas num número que nunca existiu e o lead sai para a reativação
-- como se tivesse sido trabalhado — poluindo justamente a base que o discador
-- vai consumir.
--
-- IMMUTABLE e sobre `telefone_digits`, o mesmo normalizador do dedup e do
-- Bolsão: um normalizador só na casa.
CREATE OR REPLACE FUNCTION public.telefone_suspeito(_telefone text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  WITH d AS (SELECT public.telefone_digits(_telefone) AS n)
  SELECT
    CASE
      WHEN (SELECT n FROM d) IS NULL OR length((SELECT n FROM d)) < 10 THEN true
      -- Dígito repetido do começo ao fim (0000000000, 99999999999).
      WHEN (SELECT n FROM d) ~ '^(.)\1+$' THEN true
      -- Prefixo de teste que a operação viu nascer em formulário
      -- (docs/ops/cadencia-followup-reativacao.md §Travas).
      --
      -- LIMITE CONHECIDO, registrado de propósito: `telefone_digits` só
      -- remove não-dígitos — não prefixa DDI. Logo isto casa com um número
      -- gravado COM o 55 (5511955551234) e não casa com o mesmo número sem
      -- ele (11955551234). O efeito colateral é que um celular real da faixa
      -- (11) 95555-xxxx gravado em E.164 seria marcado como suspeito e
      -- perderia o botão de WhatsApp. A Fase 0 conta quantos leads reais
      -- caem aqui antes de o modo ativo entrar; se houver algum, esta linha
      -- vira lista configurável em cadencia_config em vez de regra fixa.
      WHEN (SELECT n FROM d) LIKE '551195555%' THEN true
      -- Corpo do número (sem DDD) com um dígito só: (11) 99999-9999.
      WHEN right((SELECT n FROM d), 8) ~ '^(.)\1+$' THEN true
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.telefone_suspeito(text) IS
  'Telefone que não vale gastar a cadência: curto demais, dígito repetido ou '
  'prefixo de teste. Lead assim entra com próxima ação por e-mail e sem botão '
  'de WhatsApp (docs/ops/cadencia-followup-reativacao.md §Travas).';
