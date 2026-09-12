-- ===========================================================================
-- HIGIENE DO FUNIL — config, régua e views de leitura (Fatia 1).
--
-- Regra estruturante: toda contagem da tela sai de VIEW no banco, nunca de
-- soma no cliente. São ~55 mil leads vivos: contar no navegador pagina errado,
-- e quando o motor de SLA chegar (Fatia 2) ele precisa ler EXATAMENTE o mesmo
-- número que a tela mostra, ou a divergência vira investigação em vez de ser
-- impossível por construção.
--
-- ---------------------------------------------------------------------------
-- O RELÓGIO: coalesce(ultima_interacao, ultimo_contato, created_at)
-- ---------------------------------------------------------------------------
-- Medido em 2026-09-11, o CRM tinha TRÊS réguas de "parado" convivendo:
--   1. gerar_alertas_leads_parados  → 5 dias, coalesce(ultima_interacao, created_at)
--   2. v_leads_parados (distrib. v2) → 7/30 dias por fase, ultima_atividade_em
--   3. a proposta original desta tela → 7 dias, coalesce(ultima_interacao, ultimo_contato)
--
-- Forma final: COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at).
-- Na prática GREATEST raramente muda o resultado, porque o trigger
-- atualizar_ultima_interacao_lead grava ultimo_contato como SUBCONJUNTO de
-- ultima_interacao (toda interação atualiza ultima_interacao; só as de contato
-- atualizam ultimo_contato) — logo ultimo_contato <= ultima_interacao para todo
-- dado nascido no CRM. A diferença aparece só em dado IMPORTADO, onde
-- ultimo_contato pode ser mais recente; ali GREATEST acerta e o coalesce erraria.
--
-- Escolhemos (1) estendida com ultimo_contato, e NÃO ultima_atividade_em, por
-- um motivo medido: ultima_atividade_em nasceu em 20260826120000 como
-- `NOT NULL DEFAULT now()` e a própria migration declara que a régua "NÃO é
-- retroativa". Ou seja, TODA a base anterior a 26/08 carrega o mesmo carimbo
-- de go-live. Usá-la aqui faria lead abandonado há meses parecer ativo desde
-- agosto — subcontagem silenciosa, exatamente o que esta tela existe para
-- evitar.
--
-- updated_at foi descartado pelo mesmo motivo, agravado: importação em massa
-- mexe nele e faria lead morto parecer recém-tocado.
--
-- LIMITE HONESTO desta métrica: transicionar_lead grava ultima_interacao =
-- now() em TODA mudança de status (20260904102000_sdr_motor.sql:61). Logo
-- dias_parado mede "tempo sem MOVIMENTO no sistema", não "tempo sem contato
-- com o cliente" — arrastar card no Kanban zera o relógio. A UI rotula
-- "sem movimento", nunca "sem contato": prometer contato seria vender uma
-- garantia que o dado não dá.
--
-- ---------------------------------------------------------------------------
-- ESCRITA EM LOTE (regra: timestamps idênticos ao segundo não são comportamento)
-- ---------------------------------------------------------------------------
-- Medição de 2026-09-11 encontrou 6.708 leads em 2026-07-26 16:59:54 e 6.287
-- em 2026-07-26 17:01:23 — 12.995 leads (22,4% da base) com relógio idêntico
-- ao segundo, atribuídos a 2 corretores. Sem marcar isso, a fila abriria numa
-- importação e a carteira desses 2 corretores apareceria como abandono.
-- A marcação vive na VIEW, não na tela, para que o motor da Fatia 2 enxergue
-- o mesmo flag e não arquive uma importação como se fosse abandono real.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Config: o prazo mora em UM lugar só.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.higiene_config (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  dias_parado_min integer NOT NULL DEFAULT 5  CHECK (dias_parado_min BETWEEN 1 AND 365),
  lote_min_leads  integer NOT NULL DEFAULT 50 CHECK (lote_min_leads >= 2),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.higiene_config.dias_parado_min IS
  'Dias sem movimento para um lead contar como parado. Lido pela tela E pelo alerta diário — fonte única.';
COMMENT ON COLUMN public.higiene_config.lote_min_leads IS
  'A partir de quantos leads com o MESMO timestamp (ao segundo) a marcação de escrita em lote dispara.';

INSERT INTO public.higiene_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.higiene_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS higiene_config_select ON public.higiene_config;
CREATE POLICY higiene_config_select ON public.higiene_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS higiene_config_update_gestao ON public.higiene_config;
CREATE POLICY higiene_config_update_gestao ON public.higiene_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.higiene_config TO authenticated;
GRANT UPDATE (dias_parado_min, lote_min_leads, atualizado_em) ON public.higiene_config TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) O relógio como FUNÇÃO — uma definição, dois consumidores.
--    STABLE (não IMMUTABLE): depende de now().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.higiene_dias_parado(
  _ultima_interacao timestamptz,
  _ultimo_contato   timestamptz,
  _created_at       timestamptz
) RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  -- GREATEST, não COALESCE encadeado: queremos o toque MAIS RECENTE, não o
  -- primeiro campo preenchido. Com coalesce, um lead com ultima_interacao de
  -- 40 dias e ultimo_contato de ontem aparecia como "parado há 40 dias"
  -- (reproduzido no harness antes da correção). GREATEST ignora NULL no
  -- Postgres, então serve de coalesce quando só um dos dois existe.
  SELECT GREATEST(0, floor(extract(epoch FROM (
           now() - COALESCE(GREATEST($1, $2), $3, now())
         )) / 86400)::int);
$$;

COMMENT ON FUNCTION public.higiene_dias_parado(timestamptz, timestamptz, timestamptz) IS
  'Dias sem movimento. Definição ÚNICA do relógio de higiene — a view e o alerta diário chamam esta função, não repetem o coalesce.';

GRANT EXECUTE ON FUNCTION public.higiene_dias_parado(timestamptz, timestamptz, timestamptz)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Régua por fase: peso e ação. Espelha src/lib/priority.ts (PESO_ETAPA) e
--    src/lib/follow-up.ts (texto da ação). É TABELA, não CASE em SQL, por dois
--    motivos: (a) a Fatia 3 edita isto sem deploy; (b) tests/db/higiene-funil
--    compara peso a peso com o TS e quebra o CI se divergirem — a duplicação
--    existe, mas não pode silenciar.
-- ---------------------------------------------------------------------------
-- status tipado com o ENUM (não text): torna impossível semear uma fase que
-- não existe, e o JOIN com leads.status dispensa cast.
CREATE TABLE IF NOT EXISTS public.higiene_regra_fase (
  status        public.lead_status PRIMARY KEY,
  peso          integer NOT NULL CHECK (peso BETWEEN 0 AND 100),
  acao_sugerida text NOT NULL,
  ativa         boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.higiene_regra_fase IS
  'Peso e ação por fase na fila de higiene. Pesos espelham PESO_ETAPA de src/lib/priority.ts.';

-- ON CONFLICT DO NOTHING: re-aplicar a migration não desfaz edição feita na tela.
INSERT INTO public.higiene_regra_fase (status, peso, acao_sugerida) VALUES
  ('analise_credito',       25, 'Cobrar retorno do crédito. Se o cliente sumiu, registrar motivo e liberar a pasta'),
  ('visita_realizada',      22, 'Visitou e não avançou. Definir próximo passo: proposta ou crédito'),
  -- proposta_enviada NÃO existe em PESO_ETAPA (é status legado, fora do funil
  -- do corretor). Peso 20 escolhido aqui porque follow-up.ts o trata como
  -- prioridade "alta" com vencimento de 2 dias, igual a visita_realizada.
  -- O teste de paridade ignora esta linha de propósito.
  ('proposta_enviada',      20, 'Acompanhar a proposta enviada'),
  ('agendado',              16, 'Visita com data vencida. Confirmar ou remarcar em 48h'),
  ('qualificacao_corretor', 11, 'Qualificar: perfil, renda e urgência'),
  ('aguardando_retorno',    10, 'Retomar contato')
ON CONFLICT (status) DO NOTHING;

ALTER TABLE public.higiene_regra_fase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS higiene_regra_fase_select ON public.higiene_regra_fase;
CREATE POLICY higiene_regra_fase_select ON public.higiene_regra_fase
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS higiene_regra_fase_update_admin ON public.higiene_regra_fase;
CREATE POLICY higiene_regra_fase_update_admin ON public.higiene_regra_fase
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.higiene_regra_fase TO authenticated;
GRANT UPDATE (peso, acao_sugerida, ativa, atualizado_em) ON public.higiene_regra_fase TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) v_higiene_base — a definição ÚNICA de "vivo" e "parado".
--    As views seguintes derivam daqui. Repetir a regra em cada uma é
--    exatamente como elas divergem com o tempo.
--    security_invoker: quem consulta enxerga só o que a RLS de leads permite,
--    então um corretor que chamar a view pela API vê apenas a própria carteira.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_higiene_base
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.nome,
  l.telefone,
  l.status,
  l.temperatura,
  l.corretor_id,
  l.projeto_id,
  l.created_at,
  l.proximo_followup,
  GREATEST(l.ultima_interacao, l.ultimo_contato)                       AS parado_desde,
  (l.ultima_interacao IS NULL AND l.ultimo_contato IS NULL)            AS nunca_tocado,
  public.higiene_dias_parado(l.ultima_interacao, l.ultimo_contato, l.created_at) AS dias_parado,
  (public.higiene_dias_parado(l.ultima_interacao, l.ultimo_contato, l.created_at)
     >= (SELECT dias_parado_min FROM public.higiene_config WHERE id))  AS parado,
  -- Escrita em lote: quantos outros leads VIVOS carregam o mesmo instante ao
  -- segundo. A janela é calculada depois do WHERE, então só conta entre leads
  -- que a tela realmente mostra.
  (count(*) OVER (PARTITION BY date_trunc('second',
      COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)))
     >= (SELECT lote_min_leads FROM public.higiene_config WHERE id))   AS escrita_em_lote
FROM public.leads l
WHERE l.deleted_at IS NULL
  AND l.na_lixeira = false        -- arquivar_leads_sem_contato_30d grava na_lixeira=true
  AND l.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido');

COMMENT ON VIEW public.v_higiene_base IS
  'Base única da higiene: quem está vivo, há quantos dias sem movimento, se nunca foi tocado e se o relógio veio de escrita em lote.';

-- ---------------------------------------------------------------------------
-- 5) v_higiene_resumo — o cabeçalho. Separa NUNCA TOCADO de ABANDONADO de
--    propósito: são dois problemas com donos diferentes (distribuição x
--    corretor) e somá-los num número só troca uma cegueira por outra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_higiene_resumo
WITH (security_invoker = true) AS
SELECT
  count(*)                                                          AS vivos,
  count(*) FILTER (WHERE corretor_id IS NULL)                       AS sem_corretor,
  count(*) FILTER (WHERE corretor_id IS NOT NULL)                   AS em_carteira,
  count(*) FILTER (WHERE parado)                                    AS parados,
  count(*) FILTER (WHERE parado AND nunca_tocado)                   AS parados_nunca_tocados,
  count(*) FILTER (WHERE parado AND NOT nunca_tocado)               AS parados_abandonados,
  count(*) FILTER (WHERE parado AND escrita_em_lote)                AS parados_em_lote,
  count(*) FILTER (WHERE parado AND corretor_id IS NOT NULL)        AS parados_em_carteira,
  count(*) FILTER (WHERE parado AND status = 'em_atendimento')      AS parados_em_atendimento,
  (SELECT dias_parado_min FROM public.higiene_config WHERE id)      AS prazo_dias,
  now()                                                             AS medido_em
FROM public.v_higiene_base;

COMMENT ON VIEW public.v_higiene_resumo IS
  'Cabeçalho da tela. medido_em existe porque a base se move (jobs de distribuição e SDR escrevem durante o dia): número sem hora vira promessa falsa.';

-- ---------------------------------------------------------------------------
-- 6) v_higiene_fila — a fila que sangra.
--
--    NÃO filtra por temperatura, e isso é deliberado. `temperatura` é coluna
--    DERIVADA, reescrita a cada 10 minutos por recalcular_temperatura_leads,
--    onde 'quente' é ser agendado/visita_realizada/analise_credito OU ter
--    interação nas últimas 24h. Consequências medidas em 2026-09-11:
--      • "morno e parado 7+ dias" é impossível por construção — o zero que
--        aparecia no diagnóstico era tautologia, não medição;
--      • filtrar por temperatura='quente' escondia 1.018 leads parados em
--        aguardando_retorno / proposta_enviada / qualificacao_corretor,
--        contra ~210 que a fila mostrava. Escondia 5x mais do que mostrava —
--        e justamente as fases do estrangulamento do funil.
--    temperatura segue EXPOSTA como contexto; nunca como filtro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_higiene_fila
WITH (security_invoker = true) AS
SELECT
  b.id            AS lead_id,
  b.nome,
  b.telefone,
  b.status,
  b.temperatura,
  b.dias_parado,
  b.parado_desde,
  b.nunca_tocado,
  b.escrita_em_lote,
  b.proximo_followup,
  b.corretor_id,
  p.nome          AS corretor_nome,
  pr.nome         AS projeto_nome,
  r.peso,
  r.acao_sugerida,
  CASE
    WHEN r.peso >= 22 THEN 1   -- analise_credito, visita_realizada: dinheiro na mesa
    WHEN r.peso >= 16 THEN 2   -- proposta_enviada, agendado
    ELSE 3                     -- qualificacao_corretor, aguardando_retorno
  END             AS prioridade
FROM public.v_higiene_base b
JOIN public.higiene_regra_fase r ON r.status = b.status AND r.ativa
LEFT JOIN public.profiles p  ON p.id = b.corretor_id
LEFT JOIN public.projetos  pr ON pr.id = b.projeto_id
WHERE b.parado;

COMMENT ON VIEW public.v_higiene_fila IS
  'Fila de ação: leads parados em fase com regra ativa. Filtra por FASE, nunca por temperatura (coluna derivada e reescrita por cron).';

-- ---------------------------------------------------------------------------
-- 7) v_higiene_pastas_travadas — venda quase feita, parada por papel.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_higiene_pastas_travadas
WITH (security_invoker = true) AS
SELECT
  l.id                                   AS lead_id,
  l.nome                                 AS lead_nome,
  l.telefone,
  l.status                               AS lead_status,
  l.corretor_id,
  p.nome                                 AS corretor_nome,
  count(*)                               AS docs_pendentes,
  count(DISTINCT d.tipo)                 AS tipos_distintos,
  string_agg(DISTINCT d.tipo, ', ')      AS o_que_falta,
  max(d.updated_at)                      AS ultimo_movimento,
  public.higiene_dias_parado(max(d.updated_at), NULL, max(d.created_at)) AS dias_sem_movimento,
  (l.corretor_id IS NULL)                AS sem_corretor,
  (count(*) > count(DISTINCT d.tipo))    AS pasta_duplicada,
  (l.status = 'contrato_fechado')        AS fechado_com_pendencia
FROM public.documentacoes d
JOIN public.leads l
  ON l.id = d.lead_id AND l.deleted_at IS NULL AND l.na_lixeira = false
LEFT JOIN public.profiles p ON p.id = l.corretor_id
WHERE d.status = 'pendente'
GROUP BY l.id, l.nome, l.telefone, l.status, l.corretor_id, p.nome;

COMMENT ON VIEW public.v_higiene_pastas_travadas IS
  'Pastas com documento pendente. Inclui contrato_fechado de propósito: venda assinada com papel em aberto é o caso mais caro.';

GRANT SELECT ON
  public.v_higiene_base,
  public.v_higiene_resumo,
  public.v_higiene_fila,
  public.v_higiene_pastas_travadas
TO authenticated;
