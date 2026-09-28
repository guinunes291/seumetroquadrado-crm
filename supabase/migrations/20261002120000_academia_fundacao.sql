-- ===========================================================================
-- ACADEMIA SMQ · Fatia 1 · camada de dados (fundação)
-- ===========================================================================
-- Cria tabelas, views, RLS e RPCs do módulo Academia. Não toca em nenhuma
-- tabela existente (leads, profiles, roletas, sla_*, onboarding_concluido_em).
--
-- Origem: docs/academia/apoio/01-migration-academia.sql, com as 12 adaptações
-- da seção 7 de docs/academia/fatia0-fechamento.md aplicadas. Decisões do dono
-- em docs/academia/fatia0-respostas.md.
--
-- NOMES (decisão do dono, 28/09/2026)
--   nível  'habilitado'  — não é o "Apto" da roleta v2 (onboarding_concluido_em).
--                          São coisas separadas e continuam separadas.
--   fase 0 'Integração'  — mesma razão: "onboarding" já quer dizer outra coisa
--                          no CRM (o gate da roleta e a tela de 6 passos).
--
-- PERMISSÃO (decisão do dono)
--   Gestor LÊ só a própria equipe, pela regra da casa (pode_acessar_corretor).
--   Toda escrita passa por RPC que confere permissão — não há policy de
--   INSERT/UPDATE/DELETE em nenhuma tabela pessoal.
--   Conteúdo, gabarito, regras e config: só admin.
--   Ninguém age sobre si mesmo (gestor e superintendente podem ser alunos).
--
-- Reversão: docs/academia/fatia1-rollback.sql (desligue as flags primeiro).
-- Sem pg_cron aqui: o motor de indicadores é da Fatia 5.
-- ===========================================================================

-- ---------------------------------------------------------------------
-- 0. Tipos
-- ---------------------------------------------------------------------
-- A POSIÇÃO de 'habilitado' no enum é significativa: academia_recalcular_nivel
-- compara níveis com ">" e academia_publicar_modulo com ">=". Trocar a ordem
-- muda quem sobe de nível.
DO $$ BEGIN
  CREATE TYPE public.academia_nivel AS ENUM
    ('iniciante','habilitado','intermediario','especialista','mestre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.academia_status_conteudo AS ENUM
    ('rascunho','publicado','arquivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.academia_tipo_aula AS ENUM
    ('texto','slides','video','pratica','material');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.academia_status_pratica AS ENUM
    ('pendente','aprovada','refazer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.academia_status_recomendacao AS ENUM
    ('sombra','aberta','atribuida','concluida','descartada','expirada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 1. Papel e escopo
-- ---------------------------------------------------------------------
-- A 01 tinha academia_eh_gestor(), que tratava gestor como global: no teste do
-- harness o gestor da equipe B avaliou prática e atribuiu módulo a corretor da
-- equipe A. Foi removida. Em lugar dela, duas funções:

CREATE OR REPLACE FUNCTION public.academia_eh_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;
COMMENT ON FUNCTION public.academia_eh_admin() IS
  'Academia: admin. Dono do conteúdo, do gabarito, das regras e da config.';
REVOKE ALL ON FUNCTION public.academia_eh_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_eh_admin() TO authenticated, service_role;

-- "Posso gerir esta pessoa?" — escopo de equipe da casa, e NUNCA eu mesmo.
-- O "não sou eu" é o que impede o gestor-aluno de aprovar a própria prática,
-- fazer override do próprio nível ou se atribuir módulo.
CREATE OR REPLACE FUNCTION public.academia_pode_gerir(_pessoa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _pessoa IS DISTINCT FROM auth.uid()
     AND public.pode_acessar_corretor(auth.uid(), _pessoa);
$$;
COMMENT ON FUNCTION public.academia_pode_gerir(uuid) IS
  'Academia: quem pode agir sobre _pessoa (equipe pela regra da casa, nunca si mesmo).';
REVOKE ALL ON FUNCTION public.academia_pode_gerir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_pode_gerir(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Configuração (uma linha só)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academia_config (
  id                         boolean PRIMARY KEY DEFAULT true CHECK (id),
  nota_minima_padrao         smallint NOT NULL DEFAULT 80 CHECK (nota_minima_padrao BETWEEN 50 AND 100),
  quiz_tempo_limite_min      smallint NOT NULL DEFAULT 30,
  quiz_intervalo_min         smallint NOT NULL DEFAULT 60,
  quiz_max_tentativas_dia    smallint NOT NULL DEFAULT 3,
  recomendacao_modo          text NOT NULL DEFAULT 'sombra'
                             CHECK (recomendacao_modo IN ('desligado','sombra','ativo')),
  recomendacao_validade_dias smallint NOT NULL DEFAULT 21,
  gate_roleta_modo           text NOT NULL DEFAULT 'desligado',
  atualizado_em              timestamptz NOT NULL DEFAULT now(),
  atualizado_por             uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- O CHECK tem nome para a migration que um dia ligar o gate poder removê-lo
-- sem adivinhar o nome gerado pelo Postgres. 'ativo' NÃO é aceito de
-- propósito: ligar o gate da roleta exige migration nova e revisada.
DO $$ BEGIN
  ALTER TABLE public.academia_config
    ADD CONSTRAINT academia_config_gate_roleta_modo_chk
    CHECK (gate_roleta_modo IN ('desligado','sombra'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.academia_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Conteúdo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academia_fases (
  numero          smallint PRIMARY KEY CHECK (numero BETWEEN 0 AND 9),  -- 0 = Integração
  nome            text NOT NULL,
  periodo_texto   text,
  dia_inicio      smallint,
  dia_fim         smallint,
  foco            text,
  nivel_que_exige public.academia_nivel
);

CREATE TABLE IF NOT EXISTS public.academia_modulos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              text NOT NULL UNIQUE,
  numero              smallint NOT NULL,
  fase                smallint NOT NULL REFERENCES public.academia_fases(numero),
  titulo              text NOT NULL,
  objetivo_principal  text,
  objetivos           jsonb NOT NULL DEFAULT '[]'::jsonb,
  pontos_chave        jsonb NOT NULL DEFAULT '[]'::jsonb,
  pilares             text[] NOT NULL DEFAULT '{}',
  carga_horaria_h     numeric(4,1),
  carga_horaria_texto text,
  prazo_dias          smallint,
  obrigatorio         boolean NOT NULL DEFAULT true,
  exige_pratica       boolean NOT NULL DEFAULT true,
  pratica_descricao   text,
  pratica_rubrica     jsonb NOT NULL DEFAULT '[]'::jsonb,
  nota_minima         smallint CHECK (nota_minima BETWEEN 50 AND 100),
  url_gamma           text,
  url_notion          text,
  notion_page_id      text,
  status              public.academia_status_conteudo NOT NULL DEFAULT 'rascunho',
  versao              integer NOT NULL DEFAULT 1,
  revisao_pendente    text,
  revisar_em          date,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  publicado_em        timestamptz,
  publicado_por       uuid
);
CREATE INDEX IF NOT EXISTS academia_modulos_fase_idx ON public.academia_modulos (fase, numero);

CREATE TABLE IF NOT EXISTS public.academia_aulas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id     uuid NOT NULL REFERENCES public.academia_modulos(id) ON DELETE CASCADE,
  ordem         smallint NOT NULL,
  titulo        text NOT NULL,
  tipo          public.academia_tipo_aula NOT NULL DEFAULT 'texto',
  conteudo_md   text,
  url_video     text,
  url_material  text,
  duracao_min   smallint,
  status        public.academia_status_conteudo NOT NULL DEFAULT 'publicado',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modulo_id, ordem)
);

CREATE TABLE IF NOT EXISTS public.academia_questoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id    uuid NOT NULL REFERENCES public.academia_modulos(id) ON DELETE CASCADE,
  ordem        smallint NOT NULL,
  enunciado    text NOT NULL,
  alternativas jsonb NOT NULL CHECK (jsonb_typeof(alternativas) = 'array'
                                     AND jsonb_array_length(alternativas) BETWEEN 2 AND 6),
  correta      smallint NOT NULL,
  explicacao   text,
  ativa        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modulo_id, ordem),
  CHECK (correta >= 0 AND correta < jsonb_array_length(alternativas))
);

-- ---------------------------------------------------------------------
-- 4. Pessoas e progresso
-- ---------------------------------------------------------------------
-- A participação é SEMPRE explícita, uma linha por pessoa, criada por
-- academia_definir_participacao (só admin). Nunca é inferida do papel: o dono
-- decidiu que corretor, SDR, superintendente e gestor PODEM ser alunos, mas
-- há exceção individual (Sheldon Barbosa é gestor e não é aluno).
CREATE TABLE IF NOT EXISTS public.academia_participantes (
  corretor_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  participa           boolean NOT NULL DEFAULT true,
  inicio_trilha       date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  nivel               public.academia_nivel NOT NULL DEFAULT 'iniciante',
  nivel_em            timestamptz NOT NULL DEFAULT now(),
  habilitado_override boolean,
  override_motivo     text,
  override_por        uuid,
  override_em         timestamptz,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  CHECK (habilitado_override IS NULL OR override_motivo IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.academia_niveis_historico (
  id          bigserial PRIMARY KEY,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  de          public.academia_nivel,
  para        public.academia_nivel NOT NULL,
  motivo      text NOT NULL,
  por         uuid,
  em          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.academia_progresso_aulas (
  corretor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aula_id      uuid NOT NULL REFERENCES public.academia_aulas(id) ON DELETE CASCADE,
  concluida_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretor_id, aula_id)
);

CREATE TABLE IF NOT EXISTS public.academia_tentativas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  modulo_id     uuid NOT NULL REFERENCES public.academia_modulos(id) ON DELETE CASCADE,
  versao_modulo integer NOT NULL,
  questoes_ids  uuid[] NOT NULL,
  iniciada_em   timestamptz NOT NULL DEFAULT now(),
  enviada_em    timestamptz,
  respostas     jsonb,
  acertos       smallint,
  total         smallint,
  nota          numeric(5,2),
  aprovado      boolean
);
CREATE INDEX IF NOT EXISTS academia_tentativas_corretor_idx
  ON public.academia_tentativas (corretor_id, modulo_id, iniciada_em DESC);

CREATE TABLE IF NOT EXISTS public.academia_praticas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  modulo_id         uuid NOT NULL REFERENCES public.academia_modulos(id) ON DELETE CASCADE,
  origem            text NOT NULL DEFAULT 'envio' CHECK (origem IN ('envio','roleplay_presencial')),
  evidencia_texto   text,
  evidencia_url     text,
  enviado_em        timestamptz NOT NULL DEFAULT now(),
  status            public.academia_status_pratica NOT NULL DEFAULT 'pendente',
  avaliador_id      uuid,
  avaliado_em       timestamptz,
  rubrica_resultado jsonb,
  feedback          text
);
CREATE INDEX IF NOT EXISTS academia_praticas_fila_idx ON public.academia_praticas (status, enviado_em);

-- 'integracao' no lugar de 'onboarding': a palavra já está tomada no CRM.
CREATE TABLE IF NOT EXISTS public.academia_atribuicoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  modulo_id       uuid NOT NULL REFERENCES public.academia_modulos(id) ON DELETE CASCADE,
  origem          text NOT NULL CHECK (origem IN ('gestor','recomendacao','integracao','nova_versao')),
  recomendacao_id uuid,
  motivo          text,
  prazo           date,
  atribuido_por   uuid,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  concluida_em    timestamptz,
  cancelada_em    timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS academia_atribuicoes_aberta_uq
  ON public.academia_atribuicoes (corretor_id, modulo_id)
  WHERE concluida_em IS NULL AND cancelada_em IS NULL;

CREATE TABLE IF NOT EXISTS public.academia_certificados (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nivel       public.academia_nivel NOT NULL,
  codigo      text NOT NULL UNIQUE DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  emitido_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretor_id, nivel)
);

-- ---------------------------------------------------------------------
-- 5. Integração com a operação: indicadores e recomendações
-- ---------------------------------------------------------------------
-- Preenchida pelo motor da Fatia 5. O corretor NÃO lê esta tabela: número de
-- performance individual chega a ele como recomendação de módulo, não como
-- placar.
CREATE TABLE IF NOT EXISTS public.academia_indicadores (
  corretor_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  indicador       text NOT NULL,
  data_ref        date NOT NULL,
  janela_dias     smallint NOT NULL,
  valor           numeric,
  amostra         integer NOT NULL,
  referencia_time numeric,
  calculado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretor_id, indicador, data_ref)
);

CREATE TABLE IF NOT EXISTS public.academia_regras_recomendacao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text NOT NULL UNIQUE,
  indicador       text NOT NULL,
  descricao       text NOT NULL,
  modulo_codigo   text NOT NULL REFERENCES public.academia_modulos(codigo),
  direcao         text NOT NULL CHECK (direcao IN ('menor_e_pior','maior_e_pior')),
  limiar_relativo numeric NOT NULL,
  janela_dias     smallint NOT NULL DEFAULT 30,
  amostra_minima  integer NOT NULL DEFAULT 8,
  ativa           boolean NOT NULL DEFAULT true,
  observacao      text
);

CREATE TABLE IF NOT EXISTS public.academia_recomendacoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id         uuid NOT NULL REFERENCES public.academia_regras_recomendacao(id),
  corretor_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  modulo_id        uuid NOT NULL REFERENCES public.academia_modulos(id),
  indicador        text NOT NULL,
  valor_corretor   numeric,
  valor_referencia numeric,
  amostra          integer,
  data_ref         date NOT NULL,
  status           public.academia_status_recomendacao NOT NULL DEFAULT 'sombra',
  gerada_em        timestamptz NOT NULL DEFAULT now(),
  decidido_por     uuid,
  decidido_em      timestamptz,
  motivo_decisao   text,
  expira_em        date
);

-- O índice de "recomendação viva" cobre SÓ 'sombra' e 'aberta'.
-- Na 01 ele incluía 'atribuida', e nada tirava a linha desse status: depois da
-- primeira atribuição a regra nunca mais recomendava aquele módulo para aquela
-- pessoa. Com a atribuição concluída a recomendação passa a 'concluida'
-- (ver academia_concluir_atribuicoes_do_modulo), e a regra volta a valer.
CREATE UNIQUE INDEX IF NOT EXISTS academia_recomendacoes_viva_uq
  ON public.academia_recomendacoes (corretor_id, regra_id)
  WHERE status IN ('sombra','aberta');

-- A FK só existe depois de academia_recomendacoes. ON DELETE SET NULL: apagar
-- uma recomendação não pode apagar a atribuição que o gestor já fez.
DO $$ BEGIN
  ALTER TABLE public.academia_atribuicoes
    ADD CONSTRAINT academia_atribuicoes_recomendacao_id_fkey
    FOREIGN KEY (recomendacao_id) REFERENCES public.academia_recomendacoes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 6. Encontros presenciais
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academia_encontros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN
                    ('roleplay_diario','maratona_objecoes','credito_quinzenal',
                     'revisao_mensal','integracao','construtora','outro')),
  titulo          text NOT NULL,
  inicio          timestamptz NOT NULL,
  duracao_min     smallint,
  facilitador_id  uuid REFERENCES public.profiles(id),
  modulo_id       uuid REFERENCES public.academia_modulos(id),
  descricao       text,
  acao_registrada text,
  criado_por      uuid,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.academia_presencas (
  encontro_id uuid NOT NULL REFERENCES public.academia_encontros(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  presente    boolean NOT NULL DEFAULT true,
  observacao  text,
  PRIMARY KEY (encontro_id, corretor_id)
);

-- ---------------------------------------------------------------------
-- 7. Views de status
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_academia_modulo_status
WITH (security_invoker = true) AS
WITH base AS (
  SELECT p.corretor_id, p.inicio_trilha, m.*
  FROM public.academia_participantes p
  CROSS JOIN public.academia_modulos m
  WHERE p.participa AND m.status = 'publicado'
),
aulas AS (
  SELECT a.modulo_id, count(*) AS total
  FROM public.academia_aulas a
  WHERE a.status = 'publicado'
  GROUP BY a.modulo_id
),
feitas AS (
  SELECT pa.corretor_id, a.modulo_id, count(*) AS feitas, max(pa.concluida_em) AS ultima
  FROM public.academia_progresso_aulas pa
  JOIN public.academia_aulas a ON a.id = pa.aula_id AND a.status = 'publicado'
  GROUP BY pa.corretor_id, a.modulo_id
),
quiz AS (
  SELECT t.corretor_id, t.modulo_id,
         max(t.nota) AS melhor_nota,
         bool_or(t.aprovado) AS aprovado,
         min(t.enviada_em) FILTER (WHERE t.aprovado) AS aprovado_em,
         count(*) FILTER (WHERE t.enviada_em IS NOT NULL) AS tentativas
  FROM public.academia_tentativas t
  GROUP BY t.corretor_id, t.modulo_id
),
prat AS (
  SELECT pr.corretor_id, pr.modulo_id,
         bool_or(pr.status = 'aprovada') AS aprovada,
         min(pr.avaliado_em) FILTER (WHERE pr.status = 'aprovada') AS aprovada_em,
         bool_or(pr.status = 'pendente') AS pendente
  FROM public.academia_praticas pr
  GROUP BY pr.corretor_id, pr.modulo_id
)
SELECT
  b.corretor_id, b.id AS modulo_id, b.codigo, b.fase, b.numero, b.titulo,
  b.obrigatorio, b.exige_pratica,
  coalesce(au.total, 0) AS aulas_total,
  coalesce(f.feitas, 0) AS aulas_feitas,
  q.melhor_nota,
  coalesce(q.aprovado, false) AS quiz_aprovado,
  coalesce(q.tentativas, 0) AS tentativas,
  CASE WHEN NOT b.exige_pratica THEN 'dispensada'
       WHEN pr.aprovada THEN 'aprovada'
       WHEN pr.pendente THEN 'pendente'
       WHEN pr.corretor_id IS NOT NULL THEN 'refazer'
       ELSE 'nao_enviada' END AS pratica_status,
  ( coalesce(f.feitas,0) >= coalesce(au.total,0)
    AND coalesce(q.aprovado,false)
    AND (NOT b.exige_pratica OR coalesce(pr.aprovada,false)) ) AS concluido,
  greatest(q.aprovado_em, pr.aprovada_em) AS concluido_em,
  CASE WHEN b.prazo_dias IS NOT NULL THEN b.inicio_trilha + b.prazo_dias END AS prazo_em,
  greatest(f.ultima, (SELECT max(t2.iniciada_em) FROM public.academia_tentativas t2
                       WHERE t2.corretor_id = b.corretor_id AND t2.modulo_id = b.id)) AS ultima_atividade
FROM base b
LEFT JOIN aulas au ON au.modulo_id = b.id
LEFT JOIN feitas f ON f.corretor_id = b.corretor_id AND f.modulo_id = b.id
LEFT JOIN quiz q   ON q.corretor_id = b.corretor_id AND q.modulo_id = b.id
LEFT JOIN prat pr  ON pr.corretor_id = b.corretor_id AND pr.modulo_id = b.id;

CREATE OR REPLACE VIEW public.v_academia_fase_status
WITH (security_invoker = true) AS
SELECT corretor_id, fase,
       count(*) FILTER (WHERE obrigatorio)               AS obrigatorios,
       count(*) FILTER (WHERE obrigatorio AND concluido) AS concluidos,
       -- fase só conta como completa se TEM módulo publicado: sem isso,
       -- conteúdo em rascunho promoveria o time inteiro no dia 1.
       (count(*) FILTER (WHERE obrigatorio) > 0
        AND count(*) FILTER (WHERE obrigatorio AND NOT concluido) = 0) AS completa
FROM public.v_academia_modulo_status
GROUP BY corretor_id, fase;

CREATE OR REPLACE VIEW public.v_academia_corretor_resumo
WITH (security_invoker = true) AS
SELECT
  p.corretor_id,
  coalesce(nullif(pr.nome, ''), pr.email) AS corretor_nome,
  p.participa, p.inicio_trilha, p.nivel, p.habilitado_override,
  coalesce(p.habilitado_override, p.nivel <> 'iniciante') AS habilitado,
  coalesce(sum(ms.concluido::int), 0)                               AS modulos_concluidos,
  count(ms.modulo_id) FILTER (WHERE ms.obrigatorio)                 AS modulos_obrigatorios,
  count(ms.modulo_id) FILTER (WHERE ms.obrigatorio AND NOT ms.concluido
        AND ms.prazo_em < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS modulos_atrasados,
  count(ms.modulo_id) FILTER (WHERE ms.pratica_status = 'pendente')  AS praticas_pendentes,
  max(ms.ultima_atividade)                                           AS ultima_atividade
FROM public.academia_participantes p
JOIN public.profiles pr ON pr.id = p.corretor_id
LEFT JOIN public.v_academia_modulo_status ms ON ms.corretor_id = p.corretor_id
GROUP BY p.corretor_id, pr.nome, pr.email, p.participa, p.inicio_trilha, p.nivel, p.habilitado_override;

-- ---------------------------------------------------------------------
-- 8. Regras de nível
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_recalcular_nivel(_corretor uuid)
RETURNS public.academia_nivel
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_atual public.academia_nivel;
  v_novo  public.academia_nivel := 'iniciante';
  f0 boolean; f1 boolean; f2 boolean; f3 boolean;
BEGIN
  SELECT nivel INTO v_atual FROM public.academia_participantes WHERE corretor_id = _corretor;
  IF v_atual IS NULL THEN RETURN NULL; END IF;
  IF v_atual = 'mestre' THEN RETURN v_atual; END IF;  -- mestre só muda por decisão humana

  SELECT coalesce(bool_or(completa) FILTER (WHERE fase = 0), false),
         coalesce(bool_or(completa) FILTER (WHERE fase = 1), false),
         coalesce(bool_or(completa) FILTER (WHERE fase = 2), false),
         coalesce(bool_or(completa) FILTER (WHERE fase = 3), false)
    INTO f0, f1, f2, f3
  FROM public.v_academia_fase_status WHERE corretor_id = _corretor;

  -- Fase 0 (Integração, 5 dias) = pronto para atender lead.
  -- Fases 1+2 = domínio técnico. Fase 3 = domínio comercial.
  IF f0 THEN v_novo := 'habilitado'; END IF;
  IF f0 AND f1 AND f2 THEN v_novo := 'intermediario'; END IF;
  IF f0 AND f1 AND f2 AND f3 THEN v_novo := 'especialista'; END IF;

  -- nunca rebaixa sozinho: módulo novo publicado vira atribuição com prazo,
  -- não perda de nível.
  IF v_novo > v_atual THEN
    UPDATE public.academia_participantes
       SET nivel = v_novo, nivel_em = now() WHERE corretor_id = _corretor;
    INSERT INTO public.academia_niveis_historico (corretor_id, de, para, motivo)
      VALUES (_corretor, v_atual, v_novo, 'regra automatica: fases concluidas');
    INSERT INTO public.academia_certificados (corretor_id, nivel) VALUES (_corretor, v_novo)
      ON CONFLICT (corretor_id, nivel) DO NOTHING;
    RETURN v_novo;
  END IF;
  RETURN v_atual;
END $$;
COMMENT ON FUNCTION public.academia_recalcular_nivel(uuid) IS
  'Academia: recalcula o nível. Interna — chamada pelas RPCs e pelo motor da Fatia 5.';
-- Interna de verdade: na 01 qualquer corretor podia chamar sobre outra pessoa.
REVOKE ALL ON FUNCTION public.academia_recalcular_nivel(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_recalcular_nivel(uuid) TO service_role;

-- Fecha as atribuições abertas do módulo e devolve a recomendação de origem ao
-- ciclo: sem isso o índice de recomendação viva travava a regra para sempre.
CREATE OR REPLACE FUNCTION public.academia_concluir_atribuicoes(_corretor uuid, _modulo uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_recs uuid[];
BEGIN
  UPDATE public.academia_atribuicoes
     SET concluida_em = now()
   WHERE corretor_id = _corretor AND modulo_id = _modulo
     AND concluida_em IS NULL AND cancelada_em IS NULL;

  SELECT array_agg(DISTINCT a.recomendacao_id) INTO v_recs
    FROM public.academia_atribuicoes a
   WHERE a.corretor_id = _corretor AND a.modulo_id = _modulo
     AND a.recomendacao_id IS NOT NULL AND a.concluida_em IS NOT NULL;

  IF v_recs IS NOT NULL THEN
    UPDATE public.academia_recomendacoes
       SET status = 'concluida'
     WHERE id = ANY(v_recs) AND status = 'atribuida';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.academia_concluir_atribuicoes(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_concluir_atribuicoes(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 9. RPCs do aluno
-- ---------------------------------------------------------------------
-- Todas começam pelo mesmo par de guardas: conta ativa (is_active_member, a
-- regra da casa — conta bloqueada não estuda) e participação explícita ativa.
CREATE OR REPLACE FUNCTION public.academia_marcar_aula(_aula uuid, _concluida boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_active_member(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_participantes
                  WHERE corretor_id = v_uid AND participa) THEN
    RAISE EXCEPTION 'voce nao esta inscrito na Academia' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_aulas a
                   JOIN public.academia_modulos m ON m.id = a.modulo_id
                  WHERE a.id = _aula AND a.status = 'publicado' AND m.status = 'publicado') THEN
    RAISE EXCEPTION 'aula indisponivel';
  END IF;
  IF _concluida THEN
    INSERT INTO public.academia_progresso_aulas (corretor_id, aula_id) VALUES (v_uid, _aula)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.academia_progresso_aulas WHERE corretor_id = v_uid AND aula_id = _aula;
  END IF;
END $$;

-- Devolve as questões SEM gabarito. O gabarito nunca sai do banco antes do envio.
CREATE OR REPLACE FUNCTION public.academia_quiz_iniciar(_modulo uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  cfg    public.academia_config%ROWTYPE;
  m      public.academia_modulos%ROWTYPE;
  v_ult  public.academia_tentativas%ROWTYPE;
  v_hoje integer;
  v_ids  uuid[];
  v_id   uuid;
BEGIN
  IF NOT public.is_active_member(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_participantes
                  WHERE corretor_id = v_uid AND participa) THEN
    RAISE EXCEPTION 'voce nao esta inscrito na Academia' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cfg FROM public.academia_config WHERE id;
  SELECT * INTO m FROM public.academia_modulos WHERE id = _modulo AND status = 'publicado';
  IF m.id IS NULL THEN RAISE EXCEPTION 'modulo indisponivel'; END IF;

  -- precisa ter concluído as aulas: o quiz mede o que foi estudado
  IF EXISTS (SELECT 1 FROM public.academia_aulas a
              WHERE a.modulo_id = _modulo AND a.status = 'publicado'
                AND NOT EXISTS (SELECT 1 FROM public.academia_progresso_aulas pa
                                 WHERE pa.aula_id = a.id AND pa.corretor_id = v_uid)) THEN
    RAISE EXCEPTION 'conclua todas as aulas antes do quiz';
  END IF;

  -- tentativa aberta e no prazo devolve a MESMA (evita "reroll" de questões)
  SELECT * INTO v_ult FROM public.academia_tentativas
   WHERE corretor_id = v_uid AND modulo_id = _modulo AND enviada_em IS NULL
     AND iniciada_em > now() - make_interval(mins => cfg.quiz_tempo_limite_min)
   ORDER BY iniciada_em DESC LIMIT 1;

  IF v_ult.id IS NULL THEN
    -- "hoje" é o dia de Brasília: tentativa às 22:30 caía no dia seguinte.
    SELECT count(*) INTO v_hoje FROM public.academia_tentativas
     WHERE corretor_id = v_uid AND modulo_id = _modulo
       AND (iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date
           = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    IF v_hoje >= cfg.quiz_max_tentativas_dia THEN
      RAISE EXCEPTION 'limite de % tentativas por dia atingido neste modulo: volte amanha',
        cfg.quiz_max_tentativas_dia;
    END IF;
    IF EXISTS (SELECT 1 FROM public.academia_tentativas
                WHERE corretor_id = v_uid AND modulo_id = _modulo AND aprovado = false
                  AND enviada_em > now() - make_interval(mins => cfg.quiz_intervalo_min)) THEN
      RAISE EXCEPTION 'aguarde % minutos entre tentativas: revise as aulas antes',
        cfg.quiz_intervalo_min;
    END IF;

    SELECT array_agg(id ORDER BY random()) INTO v_ids
      FROM public.academia_questoes WHERE modulo_id = _modulo AND ativa;
    IF coalesce(array_length(v_ids,1),0) < 3 THEN
      RAISE EXCEPTION 'quiz sem questoes suficientes';
    END IF;
    v_ids := v_ids[1:10];

    INSERT INTO public.academia_tentativas (corretor_id, modulo_id, versao_modulo, questoes_ids)
    VALUES (v_uid, _modulo, m.versao, v_ids) RETURNING id INTO v_id;
  ELSE
    v_id := v_ult.id; v_ids := v_ult.questoes_ids;
  END IF;

  RETURN jsonb_build_object(
    'tentativa_id', v_id,
    'tempo_limite_min', cfg.quiz_tempo_limite_min,
    'nota_minima', coalesce(m.nota_minima, cfg.nota_minima_padrao),
    'questoes', (SELECT jsonb_agg(jsonb_build_object(
                    'id', q.id, 'enunciado', q.enunciado, 'alternativas', q.alternativas)
                  ORDER BY array_position(v_ids, q.id))
                 FROM public.academia_questoes q WHERE q.id = ANY(v_ids)));
END $$;

CREATE OR REPLACE FUNCTION public.academia_quiz_enviar(_tentativa uuid, _respostas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  t   public.academia_tentativas%ROWTYPE;
  cfg public.academia_config%ROWTYPE;
  m   public.academia_modulos%ROWTYPE;
  v_acertos int; v_total int; v_nota numeric; v_min int; v_ok boolean;
BEGIN
  IF NOT public.is_active_member(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_participantes
                  WHERE corretor_id = v_uid AND participa) THEN
    RAISE EXCEPTION 'voce nao esta inscrito na Academia' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cfg FROM public.academia_config WHERE id;
  SELECT * INTO t FROM public.academia_tentativas WHERE id = _tentativa FOR UPDATE;
  IF NOT FOUND OR t.corretor_id <> v_uid THEN RAISE EXCEPTION 'tentativa invalida'; END IF;
  IF t.enviada_em IS NOT NULL THEN RAISE EXCEPTION 'tentativa ja enviada'; END IF;
  IF t.iniciada_em < now() - make_interval(mins => cfg.quiz_tempo_limite_min + 2) THEN
    RAISE EXCEPTION 'tempo esgotado: inicie uma nova tentativa';
  END IF;
  SELECT * INTO m FROM public.academia_modulos WHERE id = t.modulo_id;

  SELECT count(*) FILTER (WHERE (_respostas ->> q.id::text)::int = q.correta), count(*)
    INTO v_acertos, v_total
  FROM public.academia_questoes q WHERE q.id = ANY(t.questoes_ids);

  v_nota := round(100.0 * v_acertos / greatest(v_total,1), 2);
  v_min  := coalesce(m.nota_minima, cfg.nota_minima_padrao);
  v_ok   := v_nota >= v_min;

  UPDATE public.academia_tentativas
     SET enviada_em = now(), respostas = _respostas, acertos = v_acertos,
         total = v_total, nota = v_nota, aprovado = v_ok
   WHERE id = t.id;

  IF v_ok AND NOT m.exige_pratica THEN
    PERFORM public.academia_concluir_atribuicoes(v_uid, t.modulo_id);
  END IF;
  IF v_ok THEN
    PERFORM public.academia_recalcular_nivel(v_uid);
  END IF;

  -- O gabarito sai SÓ aqui, no retorno do envio. Não há policy de SELECT em
  -- academia_questoes para authenticated: nem gestor-aluno o alcança.
  RETURN jsonb_build_object(
    'nota', v_nota, 'nota_minima', v_min, 'aprovado', v_ok,
    'acertos', v_acertos, 'total', v_total,
    'gabarito', (SELECT jsonb_agg(jsonb_build_object(
                   'id', q.id, 'enunciado', q.enunciado, 'alternativas', q.alternativas,
                   'correta', q.correta, 'marcada', (_respostas ->> q.id::text)::int,
                   'explicacao', q.explicacao)
                 ORDER BY array_position(t.questoes_ids, q.id))
                 FROM public.academia_questoes q WHERE q.id = ANY(t.questoes_ids)));
END $$;

CREATE OR REPLACE FUNCTION public.academia_pratica_enviar(_modulo uuid, _texto text, _url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; m public.academia_modulos%ROWTYPE;
BEGIN
  IF NOT public.is_active_member(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Na 01 qualquer um enviava prática, inclusive de módulo em rascunho.
  IF NOT EXISTS (SELECT 1 FROM public.academia_participantes
                  WHERE corretor_id = v_uid AND participa) THEN
    RAISE EXCEPTION 'voce nao esta inscrito na Academia' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.academia_modulos WHERE id = _modulo AND status = 'publicado';
  IF m.id IS NULL THEN RAISE EXCEPTION 'modulo indisponivel'; END IF;
  IF NOT m.exige_pratica THEN RAISE EXCEPTION 'este modulo nao pede pratica'; END IF;

  IF coalesce(trim(_texto),'') = '' AND coalesce(trim(_url),'') = '' THEN
    RAISE EXCEPTION 'descreva a pratica ou anexe um link';
  END IF;
  IF EXISTS (SELECT 1 FROM public.academia_praticas
              WHERE corretor_id = v_uid AND modulo_id = _modulo AND status = 'pendente') THEN
    RAISE EXCEPTION 'ja existe uma pratica aguardando avaliacao neste modulo';
  END IF;
  INSERT INTO public.academia_praticas (corretor_id, modulo_id, evidencia_texto, evidencia_url)
  VALUES (v_uid, _modulo, _texto, _url) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- 10. RPCs de gestão
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_pratica_avaliar(
  _pratica uuid, _status public.academia_status_pratica, _rubrica jsonb, _feedback text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE p public.academia_praticas%ROWTYPE; v_concluido boolean;
BEGIN
  SELECT * INTO p FROM public.academia_praticas WHERE id = _pratica FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pratica nao encontrada'; END IF;
  -- escopo de equipe E "nunca eu mesmo": o gestor-aluno não aprova a própria.
  IF NOT public.academia_pode_gerir(p.corretor_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p.status <> 'pendente' THEN RAISE EXCEPTION 'pratica ja avaliada'; END IF;
  IF _status = 'pendente' THEN RAISE EXCEPTION 'escolha aprovada ou refazer'; END IF;
  IF coalesce(trim(_feedback),'') = '' THEN
    RAISE EXCEPTION 'feedback obrigatorio: 1 foco de melhoria (regra da Biblioteca de Roleplays)';
  END IF;

  UPDATE public.academia_praticas
     SET status = _status, rubrica_resultado = _rubrica, feedback = _feedback,
         avaliador_id = auth.uid(), avaliado_em = now()
   WHERE id = _pratica;

  IF _status = 'aprovada' THEN
    -- Só fecha a atribuição se o MÓDULO fechou (aulas + quiz + prática).
    -- Na 01 a prática aprovada fechava a atribuição mesmo sem quiz.
    SELECT concluido INTO v_concluido FROM public.v_academia_modulo_status
     WHERE corretor_id = p.corretor_id AND modulo_id = p.modulo_id;
    IF coalesce(v_concluido, false) THEN
      PERFORM public.academia_concluir_atribuicoes(p.corretor_id, p.modulo_id);
    END IF;
    PERFORM public.academia_recalcular_nivel(p.corretor_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.academia_registrar_roleplay(
  _corretor uuid, _modulo uuid, _status public.academia_status_pratica, _rubrica jsonb, _feedback text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.academia_pode_gerir(_corretor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_participantes
                  WHERE corretor_id = _corretor AND participa) THEN
    RAISE EXCEPTION 'pessoa nao participa da Academia';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_modulos
                  WHERE id = _modulo AND status = 'publicado') THEN
    RAISE EXCEPTION 'modulo indisponivel';
  END IF;
  INSERT INTO public.academia_praticas (corretor_id, modulo_id, origem, evidencia_texto)
  VALUES (_corretor, _modulo, 'roleplay_presencial', 'Roleplay presencial avaliado pela gestao')
  RETURNING id INTO v_id;
  PERFORM public.academia_pratica_avaliar(v_id, _status, _rubrica, _feedback);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academia_definir_habilitado(
  _corretor uuid, _habilitado boolean, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.academia_pode_gerir(_corretor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _habilitado IS NOT NULL AND coalesce(trim(_motivo),'') = '' THEN
    RAISE EXCEPTION 'motivo obrigatorio para decisao manual';
  END IF;
  UPDATE public.academia_participantes
     SET habilitado_override = _habilitado, override_motivo = _motivo,
         override_por = auth.uid(), override_em = now()
   WHERE corretor_id = _corretor;
  IF NOT FOUND THEN RAISE EXCEPTION 'pessoa nao participa da Academia'; END IF;

  INSERT INTO public.academia_niveis_historico (corretor_id, de, para, motivo, por)
  SELECT corretor_id, nivel, nivel,
         'override habilitado=' || coalesce(_habilitado::text,'regra') || ': ' || coalesce(_motivo,''),
         auth.uid()
  FROM public.academia_participantes WHERE corretor_id = _corretor;
END $$;
COMMENT ON FUNCTION public.academia_definir_habilitado(uuid, boolean, text) IS
  'Academia: override do selo Habilitado. NÃO é o Apto da roleta v2 (onboarding_concluido_em).';

CREATE OR REPLACE FUNCTION public.academia_promover_mestre(_corretor uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_nivel public.academia_nivel; f4 boolean; f5 boolean;
BEGIN
  IF NOT public.academia_pode_gerir(_corretor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(_motivo),'') = '' THEN RAISE EXCEPTION 'motivo obrigatorio'; END IF;
  SELECT nivel INTO v_nivel FROM public.academia_participantes WHERE corretor_id = _corretor;
  IF NOT FOUND THEN RAISE EXCEPTION 'pessoa nao participa da Academia'; END IF;
  IF v_nivel <> 'especialista' THEN RAISE EXCEPTION 'mestre exige nivel especialista'; END IF;
  SELECT coalesce(bool_or(completa) FILTER (WHERE fase = 4), false),
         coalesce(bool_or(completa) FILTER (WHERE fase = 5), false)
    INTO f4, f5 FROM public.v_academia_fase_status WHERE corretor_id = _corretor;
  IF NOT (f4 AND f5) THEN RAISE EXCEPTION 'mestre exige fases 4 e 5 concluidas'; END IF;
  UPDATE public.academia_participantes
     SET nivel = 'mestre', nivel_em = now() WHERE corretor_id = _corretor;
  INSERT INTO public.academia_niveis_historico (corretor_id, de, para, motivo, por)
    VALUES (_corretor, v_nivel, 'mestre', _motivo, auth.uid());
  INSERT INTO public.academia_certificados (corretor_id, nivel) VALUES (_corretor, 'mestre')
    ON CONFLICT DO NOTHING;
END $$;

-- Interna: é a única que aceita _origem e _recomendacao. Não recebe EXECUTE
-- para authenticated — na 01 a origem vinha do cliente e podia ser forjada
-- ("recomendacao" numa atribuição que ninguém recomendou).
CREATE OR REPLACE FUNCTION public.academia_atribuir_interno(
  _corretor uuid, _modulo uuid, _prazo date, _motivo text,
  _origem text, _recomendacao uuid DEFAULT NULL, _por uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.academia_participantes
                  WHERE corretor_id = _corretor AND participa) THEN
    RAISE EXCEPTION 'pessoa nao participa da Academia';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_modulos
                  WHERE id = _modulo AND status = 'publicado') THEN
    RAISE EXCEPTION 'modulo indisponivel';
  END IF;
  INSERT INTO public.academia_atribuicoes
    (corretor_id, modulo_id, origem, recomendacao_id, motivo, prazo, atribuido_por)
  VALUES (_corretor, _modulo, _origem, _recomendacao, _motivo, _prazo, coalesce(_por, auth.uid()))
  ON CONFLICT (corretor_id, modulo_id) WHERE concluida_em IS NULL AND cancelada_em IS NULL
  DO UPDATE SET prazo = excluded.prazo, motivo = excluded.motivo
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.academia_atribuir_interno(uuid, uuid, date, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_atribuir_interno(uuid, uuid, date, text, text, uuid, uuid)
  TO service_role;

-- Pública: a origem é SEMPRE 'gestor'. Quem atribui é quem está logado.
CREATE OR REPLACE FUNCTION public.academia_atribuir(
  _corretor uuid, _modulo uuid, _prazo date, _motivo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.academia_pode_gerir(_corretor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.academia_atribuir_interno(_corretor, _modulo, _prazo, _motivo, 'gestor', NULL, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.academia_decidir_recomendacao(
  _rec uuid, _acao text, _motivo text, _prazo date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r public.academia_recomendacoes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.academia_recomendacoes WHERE id = _rec FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recomendacao nao encontrada'; END IF;
  IF NOT public.academia_pode_gerir(r.corretor_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF r.status NOT IN ('sombra','aberta') THEN RAISE EXCEPTION 'recomendacao ja decidida'; END IF;

  IF _acao = 'atribuir' THEN
    PERFORM public.academia_atribuir_interno(
      r.corretor_id, r.modulo_id,
      coalesce(_prazo, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 7),
      coalesce(_motivo, r.indicador), 'recomendacao', r.id, auth.uid());
    UPDATE public.academia_recomendacoes
       SET status = 'atribuida', decidido_por = auth.uid(),
           decidido_em = now(), motivo_decisao = _motivo
     WHERE id = _rec;
  ELSIF _acao = 'descartar' THEN
    IF coalesce(trim(_motivo),'') = '' THEN RAISE EXCEPTION 'motivo obrigatorio ao descartar'; END IF;
    UPDATE public.academia_recomendacoes
       SET status = 'descartada', decidido_por = auth.uid(),
           decidido_em = now(), motivo_decisao = _motivo
     WHERE id = _rec;
  ELSE
    RAISE EXCEPTION 'acao invalida: use atribuir ou descartar';
  END IF;
END $$;

-- Publicar é ato de CONTEÚDO, não de gestão de pessoas: só admin.
CREATE OR REPLACE FUNCTION public.academia_publicar_modulo(_modulo uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE m public.academia_modulos%ROWTYPE; n_aulas int; n_q int;
BEGIN
  IF NOT public.academia_eh_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.academia_modulos WHERE id = _modulo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'modulo nao encontrado'; END IF;
  SELECT count(*) INTO n_aulas FROM public.academia_aulas
   WHERE modulo_id = _modulo AND status = 'publicado';
  SELECT count(*) INTO n_q FROM public.academia_questoes
   WHERE modulo_id = _modulo AND ativa;
  IF n_aulas < 1 THEN RAISE EXCEPTION 'publique ao menos 1 aula'; END IF;
  IF n_q < 5 THEN RAISE EXCEPTION 'o quiz precisa de ao menos 5 questoes ativas'; END IF;
  IF m.revisao_pendente IS NOT NULL THEN
    RAISE EXCEPTION 'revisao pendente: %', m.revisao_pendente;
  END IF;

  UPDATE public.academia_modulos
     SET status = 'publicado', publicado_em = now(), publicado_por = auth.uid(),
         versao = CASE WHEN m.publicado_em IS NULL THEN versao ELSE versao + 1 END,
         atualizado_em = now()
   WHERE id = _modulo;

  -- Módulo obrigatório novo em fase que a pessoa JÁ concluiu vira atribuição
  -- com prazo (o nível dela não cai). Sem esse filtro, publicar os 24 módulos
  -- no lançamento criaria 24 atribuições por pessoa.
  IF m.obrigatorio AND m.publicado_em IS NULL THEN
    INSERT INTO public.academia_atribuicoes
      (corretor_id, modulo_id, origem, motivo, prazo, atribuido_por)
    SELECT p.corretor_id, _modulo, 'nova_versao', 'modulo novo em fase ja concluida',
           (now() AT TIME ZONE 'America/Sao_Paulo')::date + 14, auth.uid()
    FROM public.academia_participantes p
    JOIN public.academia_fases f ON f.numero = m.fase
    WHERE p.participa
      AND f.nivel_que_exige IS NOT NULL
      AND p.nivel >= f.nivel_que_exige
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Inscrição. A participação é SEMPRE explícita, uma linha por pessoa: nunca é
-- inferida do papel. Só admin — quem entra na Academia é decisão do dono.
CREATE OR REPLACE FUNCTION public.academia_definir_participacao(
  _pessoa uuid, _participa boolean, _inicio_trilha date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.academia_eh_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _pessoa IS NULL THEN RAISE EXCEPTION 'pessoa obrigatoria'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _pessoa) THEN
    RAISE EXCEPTION 'pessoa nao encontrada';
  END IF;

  -- Os vetos valem para INSCREVER. Desinscrever é sempre permitido: conta
  -- bloqueada é justamente o caso em que se quer tirar alguém da trilha.
  IF _participa THEN
    IF public.is_service_bot(_pessoa) THEN
      RAISE EXCEPTION 'bot de servico nao estuda na Academia';
    END IF;
    IF EXISTS (SELECT 1 FROM public.mcp_identidade WHERE uid = _pessoa AND ativo) THEN
      RAISE EXCEPTION 'identidade MCP nao estuda na Academia';
    END IF;
    IF NOT public.is_active_member(_pessoa) THEN
      RAISE EXCEPTION 'conta nao esta ativa';
    END IF;
  END IF;

  INSERT INTO public.academia_participantes (corretor_id, participa, inicio_trilha)
  VALUES (_pessoa, _participa,
          coalesce(_inicio_trilha, (now() AT TIME ZONE 'America/Sao_Paulo')::date))
  ON CONFLICT (corretor_id) DO UPDATE
    SET participa = excluded.participa,
        inicio_trilha = coalesce(_inicio_trilha, public.academia_participantes.inicio_trilha);
END $$;

-- ---------------------------------------------------------------------
-- 11. RLS
-- ---------------------------------------------------------------------
-- A 01 tinha um laço que criava <tabela>_gestor_all FOR ALL em 17 tabelas.
-- No harness, qualquer gestor apagou histórico de nível, mudou a config e
-- alterou 26 gabaritos — e, como gestor pode ser aluno, lia o gabarito do
-- próprio quiz. O laço foi removido. Aqui não há FOR ALL em lugar nenhum.
ALTER TABLE public.academia_config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_fases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_modulos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_aulas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_questoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_participantes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_niveis_historico    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_progresso_aulas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_tentativas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_praticas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_atribuicoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_certificados        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_indicadores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_regras_recomendacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_recomendacoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_encontros           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_presencas           ENABLE ROW LEVEL SECURITY;

-- (a) Tabelas pessoais: SELECT do próprio, da equipe (regra da casa) ou admin.
--     Nenhuma policy de INSERT/UPDATE/DELETE: toda escrita passa por RPC.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academia_participantes','academia_niveis_historico','academia_progresso_aulas',
    'academia_tentativas','academia_praticas','academia_atribuicoes',
    'academia_certificados','academia_presencas']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ler', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING (corretor_id = auth.uid()
                             OR public.academia_pode_gerir(corretor_id)
                             OR public.academia_eh_admin())$f$, t || '_ler', t);
  END LOOP;
END $$;

-- (b) Indicadores: o corretor NÃO lê. Número individual chega como
--     recomendação de módulo, não como placar.
DROP POLICY IF EXISTS academia_indicadores_ler ON public.academia_indicadores;
CREATE POLICY academia_indicadores_ler ON public.academia_indicadores
  FOR SELECT TO authenticated
  USING (public.academia_pode_gerir(corretor_id) OR public.academia_eh_admin());

-- (c) Recomendações: em 'sombra' são invisíveis para o aluno (é o modo de
--     calibração do motor). A gestão vê todas as da equipe dela.
DROP POLICY IF EXISTS academia_recomendacoes_ler ON public.academia_recomendacoes;
CREATE POLICY academia_recomendacoes_ler ON public.academia_recomendacoes
  FOR SELECT TO authenticated
  USING ((corretor_id = auth.uid() AND status <> 'sombra')
         OR public.academia_pode_gerir(corretor_id)
         OR public.academia_eh_admin());

-- (d) Conteúdo: publicado para quem tem conta ativa; admin vê tudo e é o
--     único que escreve.
DROP POLICY IF EXISTS academia_fases_ler ON public.academia_fases;
CREATE POLICY academia_fases_ler ON public.academia_fases FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()) OR public.academia_eh_admin());
DROP POLICY IF EXISTS academia_fases_admin_ins ON public.academia_fases;
CREATE POLICY academia_fases_admin_ins ON public.academia_fases FOR INSERT TO authenticated
  WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_fases_admin_upd ON public.academia_fases;
CREATE POLICY academia_fases_admin_upd ON public.academia_fases FOR UPDATE TO authenticated
  USING (public.academia_eh_admin()) WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_fases_admin_del ON public.academia_fases;
CREATE POLICY academia_fases_admin_del ON public.academia_fases FOR DELETE TO authenticated
  USING (public.academia_eh_admin());

DROP POLICY IF EXISTS academia_modulos_ler ON public.academia_modulos;
CREATE POLICY academia_modulos_ler ON public.academia_modulos FOR SELECT TO authenticated
  USING ((status = 'publicado' AND public.is_active_member(auth.uid()))
         OR public.academia_eh_admin());
DROP POLICY IF EXISTS academia_modulos_admin_ins ON public.academia_modulos;
CREATE POLICY academia_modulos_admin_ins ON public.academia_modulos FOR INSERT TO authenticated
  WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_modulos_admin_upd ON public.academia_modulos;
CREATE POLICY academia_modulos_admin_upd ON public.academia_modulos FOR UPDATE TO authenticated
  USING (public.academia_eh_admin()) WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_modulos_admin_del ON public.academia_modulos;
CREATE POLICY academia_modulos_admin_del ON public.academia_modulos FOR DELETE TO authenticated
  USING (public.academia_eh_admin());

DROP POLICY IF EXISTS academia_aulas_ler ON public.academia_aulas;
CREATE POLICY academia_aulas_ler ON public.academia_aulas FOR SELECT TO authenticated
  USING ((status = 'publicado' AND public.is_active_member(auth.uid())
          AND EXISTS (SELECT 1 FROM public.academia_modulos m
                       WHERE m.id = modulo_id AND m.status = 'publicado'))
         OR public.academia_eh_admin());
DROP POLICY IF EXISTS academia_aulas_admin_ins ON public.academia_aulas;
CREATE POLICY academia_aulas_admin_ins ON public.academia_aulas FOR INSERT TO authenticated
  WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_aulas_admin_upd ON public.academia_aulas;
CREATE POLICY academia_aulas_admin_upd ON public.academia_aulas FOR UPDATE TO authenticated
  USING (public.academia_eh_admin()) WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_aulas_admin_del ON public.academia_aulas;
CREATE POLICY academia_aulas_admin_del ON public.academia_aulas FOR DELETE TO authenticated
  USING (public.academia_eh_admin());

-- (e) Gabarito: SELECT e escrita só admin. Gestor PODE ser aluno — se o
--     gestor lesse questões, leria a resposta do próprio quiz.
DROP POLICY IF EXISTS academia_questoes_admin_ler ON public.academia_questoes;
CREATE POLICY academia_questoes_admin_ler ON public.academia_questoes FOR SELECT TO authenticated
  USING (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_questoes_admin_ins ON public.academia_questoes;
CREATE POLICY academia_questoes_admin_ins ON public.academia_questoes FOR INSERT TO authenticated
  WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_questoes_admin_upd ON public.academia_questoes;
CREATE POLICY academia_questoes_admin_upd ON public.academia_questoes FOR UPDATE TO authenticated
  USING (public.academia_eh_admin()) WITH CHECK (public.academia_eh_admin());
DROP POLICY IF EXISTS academia_questoes_admin_del ON public.academia_questoes;
CREATE POLICY academia_questoes_admin_del ON public.academia_questoes FOR DELETE TO authenticated
  USING (public.academia_eh_admin());

-- (f) Regras e config: gestão LÊ (precisa entender por que o módulo foi
--     recomendado), só admin ESCREVE. Sem INSERT/DELETE por policy: a regra
--     nasce e morre em migration, não na tela.
DROP POLICY IF EXISTS academia_regras_ler ON public.academia_regras_recomendacao;
CREATE POLICY academia_regras_ler ON public.academia_regras_recomendacao
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'gestor'::public.app_role)
         OR public.has_role(auth.uid(), 'superintendente'::public.app_role));
DROP POLICY IF EXISTS academia_regras_admin_upd ON public.academia_regras_recomendacao;
CREATE POLICY academia_regras_admin_upd ON public.academia_regras_recomendacao
  FOR UPDATE TO authenticated
  USING (public.academia_eh_admin()) WITH CHECK (public.academia_eh_admin());

DROP POLICY IF EXISTS academia_config_ler ON public.academia_config;
CREATE POLICY academia_config_ler ON public.academia_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'gestor'::public.app_role)
         OR public.has_role(auth.uid(), 'superintendente'::public.app_role));
DROP POLICY IF EXISTS academia_config_admin_upd ON public.academia_config;
CREATE POLICY academia_config_admin_upd ON public.academia_config FOR UPDATE TO authenticated
  USING (public.academia_eh_admin()) WITH CHECK (public.academia_eh_admin());

-- (g) Encontros: calendário do time. Não tem dono, então o escopo aqui é o
--     papel, não a equipe. Apagar encontro (e as presenças em cascata) é só
--     de admin.
DROP POLICY IF EXISTS academia_encontros_ler ON public.academia_encontros;
CREATE POLICY academia_encontros_ler ON public.academia_encontros FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));
DROP POLICY IF EXISTS academia_encontros_gestao_ins ON public.academia_encontros;
CREATE POLICY academia_encontros_gestao_ins ON public.academia_encontros FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.has_role(auth.uid(), 'gestor'::public.app_role)
              OR public.has_role(auth.uid(), 'superintendente'::public.app_role));
DROP POLICY IF EXISTS academia_encontros_gestao_upd ON public.academia_encontros;
CREATE POLICY academia_encontros_gestao_upd ON public.academia_encontros FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'gestor'::public.app_role)
         OR public.has_role(auth.uid(), 'superintendente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.has_role(auth.uid(), 'gestor'::public.app_role)
              OR public.has_role(auth.uid(), 'superintendente'::public.app_role));
DROP POLICY IF EXISTS academia_encontros_admin_del ON public.academia_encontros;
CREATE POLICY academia_encontros_admin_del ON public.academia_encontros FOR DELETE TO authenticated
  USING (public.academia_eh_admin());

-- ---------------------------------------------------------------------
-- 12. Grants (padrão da casa: revogar de PUBLIC/anon e conceder explícito)
-- ---------------------------------------------------------------------
-- Na 01 nenhuma tabela ou view tinha GRANT/REVOKE: tudo herdava o default do
-- schema public.

-- (a) Tabelas escritas SÓ por RPC: authenticated lê, não escreve. Sem o GRANT
--     de escrita, um INSERT direto morre no privilégio antes mesmo da RLS.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academia_participantes','academia_niveis_historico','academia_progresso_aulas',
    'academia_tentativas','academia_praticas','academia_atribuicoes',
    'academia_certificados','academia_presencas','academia_indicadores',
    'academia_recomendacoes']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- (b) Conteúdo: authenticated recebe o GRANT de escrita, mas a RLS só deixa o
--     admin passar. Os dois juntos — sem o GRANT a policy de admin seria letra
--     morta via PostgREST.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academia_fases','academia_modulos','academia_aulas','academia_questoes',
    'academia_encontros']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- (c) Config e regras: leitura da gestão, UPDATE de admin. Sem INSERT/DELETE.
REVOKE ALL ON public.academia_config FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.academia_config TO authenticated;
GRANT ALL ON public.academia_config TO service_role;

REVOKE ALL ON public.academia_regras_recomendacao FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.academia_regras_recomendacao TO authenticated;
GRANT ALL ON public.academia_regras_recomendacao TO service_role;

-- Sequência do histórico de níveis: escrita só via RPC definer, então
-- authenticated não precisa dela.
REVOKE ALL ON SEQUENCE public.academia_niveis_historico_id_seq FROM PUBLIC, anon;
GRANT ALL ON SEQUENCE public.academia_niveis_historico_id_seq TO service_role;

-- (d) Views (security_invoker: a RLS das tabelas de baixo continua valendo).
REVOKE ALL ON public.v_academia_modulo_status FROM PUBLIC, anon;
GRANT SELECT ON public.v_academia_modulo_status TO authenticated;
GRANT ALL ON public.v_academia_modulo_status TO service_role;

REVOKE ALL ON public.v_academia_fase_status FROM PUBLIC, anon;
GRANT SELECT ON public.v_academia_fase_status TO authenticated;
GRANT ALL ON public.v_academia_fase_status TO service_role;

REVOKE ALL ON public.v_academia_corretor_resumo FROM PUBLIC, anon;
GRANT SELECT ON public.v_academia_corretor_resumo TO authenticated;
GRANT ALL ON public.v_academia_corretor_resumo TO service_role;

-- (e) RPCs públicas: só quem está logado. As internas
--     (academia_recalcular_nivel, academia_concluir_atribuicoes,
--     academia_atribuir_interno) já foram revogadas de authenticated acima.
REVOKE EXECUTE ON FUNCTION
  public.academia_marcar_aula(uuid, boolean),
  public.academia_quiz_iniciar(uuid),
  public.academia_quiz_enviar(uuid, jsonb),
  public.academia_pratica_enviar(uuid, text, text),
  public.academia_pratica_avaliar(uuid, public.academia_status_pratica, jsonb, text),
  public.academia_registrar_roleplay(uuid, uuid, public.academia_status_pratica, jsonb, text),
  public.academia_definir_habilitado(uuid, boolean, text),
  public.academia_promover_mestre(uuid, text),
  public.academia_atribuir(uuid, uuid, date, text),
  public.academia_decidir_recomendacao(uuid, text, text, date),
  public.academia_publicar_modulo(uuid),
  public.academia_definir_participacao(uuid, boolean, date)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.academia_marcar_aula(uuid, boolean),
  public.academia_quiz_iniciar(uuid),
  public.academia_quiz_enviar(uuid, jsonb),
  public.academia_pratica_enviar(uuid, text, text),
  public.academia_pratica_avaliar(uuid, public.academia_status_pratica, jsonb, text),
  public.academia_registrar_roleplay(uuid, uuid, public.academia_status_pratica, jsonb, text),
  public.academia_definir_habilitado(uuid, boolean, text),
  public.academia_promover_mestre(uuid, text),
  public.academia_atribuir(uuid, uuid, date, text),
  public.academia_decidir_recomendacao(uuid, text, text, date),
  public.academia_publicar_modulo(uuid),
  public.academia_definir_participacao(uuid, boolean, date)
TO authenticated;

-- ---------------------------------------------------------------------
-- 13. Flags (nascem desligadas: a Academia não aparece para ninguém ainda)
-- ---------------------------------------------------------------------
-- Para desligar tudo sem deploy:
--   UPDATE public.app_flags SET ativo = false, atualizado_em = now()
--    WHERE chave IN ('academia_menu','academia_card_inicio');
INSERT INTO public.app_flags (chave, ativo, descricao)
VALUES ('academia_menu', false,
        'Menu e rotas /academia (trilha do aluno e painel de gestão).')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.app_flags (chave, ativo, descricao)
VALUES ('academia_card_inicio', false,
        'Card "Sua próxima aula" em /inicio.')
ON CONFLICT (chave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
