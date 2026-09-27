-- ===========================================================================
-- MODO OBRIGATÓRIO: o CRM trava o corretor até o processo do dia ser cumprido
-- ===========================================================================
-- Medido em produção em 26/09/2026: 195 leads passaram pela cadência na
-- semana, 0 toques registrados pelos botões, 170 sem contato nenhum e 137
-- devolvidos à roleta por vencimento. O CRM sugeria o trabalho; o corretor
-- podia ignorar. Decisão do dono: o CRM passa a OBRIGAR. Enquanto houver
-- pendência obrigatória, o corretor só acessa a tela do processo, a ficha dos
-- leads da lista e o hub de projetos (consulta). Zerou a lista, o CRM libera.
--
-- Esta migration é a fonte da verdade: QUAIS pendências, em QUE ordem, e se o
-- corretor está travado. A tela só obedece. Regras fixas, sem IA: a ordem tem
-- de ser auditável ("por que este lead veio antes daquele?").
--
-- Pendências (escolha do dono):
--   * cadência vencendo hoje ou atrasada (Lead chegou, 1º e 2º follow-up,
--     encerramento) — sai da lista quando a etapa do dia fecha;
--   * fundo de funil parado — agendado, visita realizada, proposta, análise
--     de crédito sem movimento há N dias OU sem próximo passo com data. Sai
--     quando o corretor registra o contato e marca o próximo passo.
--
-- Ordem (regra do dono: LEAD NOVO É SEMPRE PRIORIDADE):
--   1. Lead chegou de hoje ........ quem espera há mais tempo primeiro
--   2. Lead chegou atrasado ........ o que chegou mais recente primeiro
--   3. 1º/2º follow-up e encerramento atrasados ... prazo mais antigo primeiro
--   4. Fundo parado ................ proposta/análise > visita > agendado
--   5. 1º/2º follow-up e encerramento de hoje
--
-- Nasce DESLIGADO (gestao_config.modo_obrigatorio.ativo = false). O ensaio
-- (modo_obrigatorio_equipe_v1) funciona desligado: o dono vê o tamanho da
-- fila de cada corretor antes de ligar.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Configuração
-- ---------------------------------------------------------------------------
INSERT INTO public.gestao_config (chave, valor, descricao)
VALUES (
  'modo_obrigatorio',
  '{"ativo": false, "fundo_parado_dias": 5}'::jsonb,
  'Modo Obrigatório do corretor: com ativo=true, corretor com pendência '
  'obrigatória (cadência do dia, fundo de funil parado há fundo_parado_dias) '
  'só acessa a tela do processo até zerar a lista.'
)
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Liberação do gestor (válvula auditada, vale só para o dia)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modo_obrigatorio_liberacoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dia          date NOT NULL,
  liberado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo       text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretor_id, dia)
);

COMMENT ON TABLE public.modo_obrigatorio_liberacoes IS
  'Gestor liberou o corretor do Modo Obrigatório naquele dia (fuso de São '
  'Paulo), com motivo. Escrita só pela RPC modo_obrigatorio_liberar.';

ALTER TABLE public.modo_obrigatorio_liberacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modo_obrigatorio_liberacoes: leitura" ON public.modo_obrigatorio_liberacoes;
CREATE POLICY "modo_obrigatorio_liberacoes: leitura"
  ON public.modo_obrigatorio_liberacoes
  FOR SELECT TO authenticated
  USING (
    corretor_id = auth.uid()
    OR public.pode_acessar_corretor(auth.uid(), corretor_id)
  );

GRANT SELECT ON public.modo_obrigatorio_liberacoes TO authenticated;
GRANT ALL ON public.modo_obrigatorio_liberacoes TO service_role;

-- ---------------------------------------------------------------------------
-- 3) O card da cadência passa a trazer o projeto (botão "Ver projeto")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cadencia_item(_lead uuid, _fim_hoje timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', l.id,
    'nome', l.nome,
    'telefone', l.telefone,
    'email', l.email,
    'status', l.status::text,
    'etapa', l.cadencia_etapa,
    'ciclo', l.cadencia_ciclo,
    'reativado', l.reativado,
    'projeto_id', l.projeto_id,
    'projeto_nome', l.projeto_nome,
    'faixa_mcmv', l.faixa_mcmv,
    'renda_estimada', l.renda_estimada,
    'prazo', l.cadencia_prazo_ts,
    'atrasado', (l.cadencia_prazo_ts < date_trunc('day', _fim_hoje)),
    'proxima_acao', l.proxima_acao,
    'telefone_suspeito', public.telefone_suspeito(l.telefone),
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
$$;

REVOKE ALL ON FUNCTION public._cadencia_item(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) A lista obrigatória de um corretor
-- ---------------------------------------------------------------------------
-- Interna (sem grant). Quem expõe é modo_obrigatorio_v1 (o próprio corretor)
-- e modo_obrigatorio_equipe_v1 (a gestão, só contagens).
CREATE OR REPLACE FUNCTION public._obrigatorio_itens(_corretor uuid)
RETURNS TABLE(
  lead_id     uuid,
  tipo        text,
  grupo       integer,
  ordem       bigint,
  nome        text,
  status      text,
  etapa       text,
  prazo       timestamptz,
  atrasado    boolean,
  dias_parado integer,
  projeto_id  uuid,
  projeto_nome text,
  motivo      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (
    SELECT
      public.cadencia_fim_do_dia(now(), 0) AS fim_hoje,
      GREATEST(COALESCE(
        (public.gestao_config_valor('modo_obrigatorio') ->> 'fundo_parado_dias')::int, 5), 1)
        AS fundo_dias
  ),
  cad AS (
    SELECT
      l.id,
      'cadencia'::text AS tipo,
      (l.cadencia_prazo_ts < date_trunc('day', cfg.fim_hoje)) AS atras,
      l.cadencia_etapa AS etapa,
      l.cadencia_prazo_ts AS prazo,
      l.cadencia_inicio_ts AS inicio,
      l.created_at,
      l.nome,
      l.status::text AS status,
      l.projeto_id,
      l.projeto_nome
    FROM public.leads l, cfg
    WHERE l.corretor_id = _corretor
      AND l.cadencia_etapa IN ('D0','D1','D2','D3')
      AND l.cadencia_prazo_ts IS NOT NULL
      AND l.cadencia_prazo_ts <= cfg.fim_hoje
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND NOT COALESCE(l.opt_out, false)
      -- Telefone suspeito: a RPC de tentativa recusa esse lead, então ele
      -- nunca sairia da lista e o corretor ficaria travado para sempre.
      AND NOT public.telefone_suspeito(l.telefone)
      AND NOT public.cadencia_etapa_completa(l.id, l.cadencia_etapa)
  ),
  fundo AS (
    SELECT
      l.id,
      l.nome,
      l.status::text AS status,
      l.projeto_id,
      l.projeto_nome,
      l.created_at,
      GREATEST(0, (EXTRACT(EPOCH FROM (now() - COALESCE(
        GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at))) / 86400)::int) AS dias,
      public.lead_sem_proximo_passo(l.id) AS sem_passo,
      cfg.fundo_dias
    FROM public.leads l, cfg
    WHERE l.corretor_id = _corretor
      AND l.status IN ('agendado'::public.lead_status,
                       'visita_realizada'::public.lead_status,
                       'proposta_enviada'::public.lead_status,
                       'analise_credito'::public.lead_status)
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND (l.cadencia_etapa IS NULL OR l.cadencia_etapa NOT IN ('D0','D1','D2','D3'))
  ),
  itens AS (
    SELECT
      c.id AS lead_id,
      c.tipo,
      CASE
        WHEN c.etapa = 'D0' AND NOT c.atras THEN 1
        WHEN c.etapa = 'D0' THEN 2
        WHEN c.atras THEN 3
        ELSE 5
      END AS grupo,
      c.nome,
      c.status,
      c.etapa,
      c.prazo,
      c.atras AS atrasado,
      NULL::int AS dias_parado,
      c.projeto_id,
      c.projeto_nome,
      CASE
        WHEN c.etapa = 'D0' AND NOT c.atras THEN 'Lead chegou hoje'
        WHEN c.etapa = 'D0' THEN 'Lead chegou — atrasado'
        WHEN c.atras THEN 'Etapa da cadência atrasada'
        ELSE 'Etapa da cadência vence hoje'
      END AS motivo,
      -- chaves de ordenação dentro do grupo
      CASE
        WHEN c.etapa = 'D0' AND NOT c.atras THEN extract(epoch FROM COALESCE(c.inicio, c.created_at))
        WHEN c.etapa = 'D0' THEN -extract(epoch FROM COALESCE(c.inicio, c.created_at))
        WHEN c.atras THEN extract(epoch FROM c.prazo)
        ELSE CASE c.etapa WHEN 'D1' THEN 1 WHEN 'D2' THEN 2 ELSE 3 END
      END::double precision AS k1,
      public.cadencia_prioridade_reativacao(c.id)::double precision AS k2,
      extract(epoch FROM c.created_at)::double precision AS k3
    FROM cad c
    UNION ALL
    SELECT
      f.id,
      'fundo_parado',
      4,
      f.nome,
      f.status,
      NULL,
      NULL,
      NULL,
      f.dias,
      f.projeto_id,
      f.projeto_nome,
      CASE
        WHEN f.dias >= f.fundo_dias AND f.sem_passo
          THEN 'Parado há ' || f.dias || ' dias e sem próximo passo'
        WHEN f.dias >= f.fundo_dias
          THEN 'Parado há ' || f.dias || ' dias'
        ELSE 'Sem próximo passo com data'
      END,
      CASE f.status
        WHEN 'proposta_enviada' THEN 0 WHEN 'analise_credito' THEN 0
        WHEN 'visita_realizada' THEN 1 ELSE 2
      END::double precision,
      (-f.dias)::double precision,
      extract(epoch FROM f.created_at)::double precision
    FROM fundo f
    WHERE f.dias >= f.fundo_dias OR f.sem_passo
  )
  SELECT
    i.lead_id, i.tipo, i.grupo,
    row_number() OVER (ORDER BY i.grupo, i.k1, i.k2, i.k3, i.lead_id) AS ordem,
    i.nome, i.status, i.etapa, i.prazo, i.atrasado, i.dias_parado,
    i.projeto_id, i.projeto_nome, i.motivo
  FROM itens i;
$$;

REVOKE ALL ON FUNCTION public._obrigatorio_itens(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Quem é travado
-- ---------------------------------------------------------------------------
-- Só corretor "puro": gestão (admin, gestor, superintendente) e SDR nunca.
-- Config desligada ou liberação do gestor para hoje também não travam.
CREATE OR REPLACE FUNCTION public._obrigatorio_aplica(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((public.gestao_config_valor('modo_obrigatorio') ->> 'ativo')::boolean, false)
     AND public.has_role(_uid, 'corretor'::public.app_role)
     AND NOT public.has_role(_uid, 'admin'::public.app_role)
     AND NOT public.has_role(_uid, 'gestor'::public.app_role)
     AND NOT public.has_role(_uid, 'superintendente'::public.app_role)
     AND NOT public.has_role(_uid, 'sdr'::public.app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.modo_obrigatorio_liberacoes lb
        WHERE lb.corretor_id = _uid
          AND lb.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date);
$$;

REVOKE ALL ON FUNCTION public._obrigatorio_aplica(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) O que a tela do corretor lê
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.modo_obrigatorio_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _aplica boolean;
  _itens jsonb;
  _total int;
  _fim_hoje timestamptz := public.cadencia_fim_do_dia(now(), 0);
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _aplica := public._obrigatorio_aplica(_uid);

  -- A lista é devolvida mesmo quando não trava (config desligada, liberado):
  -- a tela /obrigatorio continua útil como lista de trabalho.
  SELECT count(*)::int,
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'lead_id', o.lead_id,
             'tipo', o.tipo,
             'grupo', o.grupo,
             'ordem', o.ordem,
             'nome', o.nome,
             'status', o.status,
             'etapa', o.etapa,
             'prazo', o.prazo,
             'atrasado', o.atrasado,
             'dias_parado', o.dias_parado,
             'projeto_id', o.projeto_id,
             'projeto_nome', o.projeto_nome,
             'motivo', o.motivo,
             'cadencia', CASE WHEN o.tipo = 'cadencia'
                              THEN public._cadencia_item(o.lead_id, _fim_hoje) END,
             -- O lead para o desfecho do fundo parado (mesmo formato da Fila
             -- Única: a tela reaproveita o "o que aconteceu?" de lá).
             'lead', (
               SELECT jsonb_build_object(
                 'id', l.id, 'nome', l.nome, 'telefone', l.telefone, 'email', l.email,
                 'status', l.status::text, 'temperatura', l.temperatura::text,
                 'ultima_interacao', l.ultima_interacao,
                 'proximo_followup', l.proximo_followup,
                 'projeto_id', l.projeto_id, 'projeto_nome', l.projeto_nome,
                 'created_at', l.created_at, 'corretor_id', l.corretor_id,
                 'origem', l.origem::text,
                 'renda_informada', l.renda_informada::text,
                 'entrada_disponivel', l.entrada_disponivel::text,
                 'usa_fgts', l.usa_fgts,
                 'proxima_acao', l.proxima_acao,
                 'faixa_mcmv', l.faixa_mcmv)
                 FROM public.leads l WHERE l.id = o.lead_id)
           ) ORDER BY o.ordem), '[]'::jsonb)
    INTO _total, _itens
  FROM (SELECT * FROM public._obrigatorio_itens(_uid) ORDER BY ordem LIMIT 300) o;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'aplica', _aplica,
    'travado', _aplica AND _total > 0,
    'liberado_hoje', EXISTS (
      SELECT 1 FROM public.modo_obrigatorio_liberacoes lb
       WHERE lb.corretor_id = _uid
         AND lb.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    'total', _total,
    'itens', _itens
  );
END;
$$;

REVOKE ALL ON FUNCTION public.modo_obrigatorio_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.modo_obrigatorio_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.modo_obrigatorio_v1() IS
  'Modo Obrigatório do usuário autenticado: a lista ordenada de pendências '
  '(cadência do dia, fundo parado) e se ele está travado. Fonte da verdade da '
  'trava de navegação.';

-- ---------------------------------------------------------------------------
-- 7) O que a gestão lê: ensaio e acompanhamento por corretor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.modo_obrigatorio_equipe_v1()
RETURNS TABLE(
  corretor_id    uuid,
  nome           text,
  total          integer,
  cadencia       integer,
  lead_chegou    integer,
  fundo_parado   integer,
  atrasados      integer,
  mais_antigo    timestamptz,
  liberado_hoje  boolean,
  motivo_liberacao text,
  modo_ativo     boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '15s'
AS $$
DECLARE
  _esc record;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _ativo boolean := COALESCE(
    (public.gestao_config_valor('modo_obrigatorio') ->> 'ativo')::boolean, false);
BEGIN
  _esc := public._gestao_escopo();

  RETURN QUERY
  WITH corretores AS (
    SELECT p.id, COALESCE(p.nome, p.email) AS nome
      FROM public.profiles p
     WHERE COALESCE(p.ativo, true)
       AND public.has_role(p.id, 'corretor'::public.app_role)
       AND (_esc.ve_tudo OR p.id = ANY(_esc.equipe))
  )
  SELECT
    c.id,
    c.nome,
    COALESCE(x.total, 0),
    COALESCE(x.cadencia, 0),
    COALESCE(x.lead_chegou, 0),
    COALESCE(x.fundo, 0),
    COALESCE(x.atrasados, 0),
    x.mais_antigo,
    lb.id IS NOT NULL,
    lb.motivo,
    _ativo
  FROM corretores c
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE o.tipo = 'cadencia')::int AS cadencia,
           count(*) FILTER (WHERE o.etapa = 'D0')::int AS lead_chegou,
           count(*) FILTER (WHERE o.tipo = 'fundo_parado')::int AS fundo,
           count(*) FILTER (WHERE o.atrasado)::int AS atrasados,
           min(o.prazo) AS mais_antigo
      FROM public._obrigatorio_itens(c.id) o
  ) x ON true
  LEFT JOIN public.modo_obrigatorio_liberacoes lb
    ON lb.corretor_id = c.id AND lb.dia = _hoje
  ORDER BY COALESCE(x.total, 0) DESC, c.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.modo_obrigatorio_equipe_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.modo_obrigatorio_equipe_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.modo_obrigatorio_equipe_v1() IS
  'Pendências obrigatórias por corretor da equipe do chamador (gestão). '
  'Funciona com o modo desligado: é o ensaio antes de ligar.';

-- ---------------------------------------------------------------------------
-- 8) Liberar um corretor hoje
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.modo_obrigatorio_liberar(_corretor uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(_uid, 'admin'::public.app_role)
          OR public.has_role(_uid, 'gestor'::public.app_role)
          OR public.has_role(_uid, 'superintendente'::public.app_role)) THEN
    RAISE EXCEPTION 'apenas a gestão libera o Modo Obrigatório' USING ERRCODE = '42501';
  END IF;
  IF _corretor = _uid OR NOT public.pode_acessar_corretor(_uid, _corretor) THEN
    RAISE EXCEPTION 'corretor fora da sua equipe' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'motivo é obrigatório para liberar' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.modo_obrigatorio_liberacoes (corretor_id, dia, liberado_por, motivo)
  VALUES (_corretor, _hoje, _uid, btrim(_motivo))
  ON CONFLICT (corretor_id, dia) DO NOTHING;

  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link)
  VALUES (_corretor, 'sistema'::public.alerta_tipo,
          'Processo obrigatório liberado hoje',
          'A gestão liberou seu CRM por hoje. Motivo: ' || btrim(_motivo),
          '/obrigatorio');

  RETURN jsonb_build_object('ok', true, 'dia', _hoje);
END;
$$;

REVOKE ALL ON FUNCTION public.modo_obrigatorio_liberar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.modo_obrigatorio_liberar(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
