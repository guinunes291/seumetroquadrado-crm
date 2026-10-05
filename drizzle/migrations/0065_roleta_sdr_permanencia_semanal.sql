-- Roleta "Agendados do SDR" — permanência semanal por produção.
--
-- Política aprovada em 05/10/2026 (docs/politica-roleta-sdr-semanal.md): quem
-- converteu na semana recebe agendados do SDR na semana seguinte; quem não
-- converteu fica pausado. A mesma régua vale para entrar e para sair.
--
--  * Semana de apuração = semana da folha do SDR: SÁBADO 00:00 → SEXTA 23:59
--    (America/Sao_Paulo). Mesmo calendário de src/features/dashboard/semana-sdr.ts.
--  * Universo: todo usuário com papel corretor e perfil ativo, esteja ou não
--    na roleta hoje. Removido manualmente (ativo = false com feito_por de uma
--    pessoa no log) nunca é reincluído: o bloqueio manual vale mais que a regra.
--  * Pontos: visita realizada (presença validada, 1 por lead por semana) = 1;
--    pasta (entrada em análise de crédito, 1 por lead a cada 30 dias) = 1,5.
--    Meta: 3 pontos. Venda assinada nos últimos 15 dias só conta na exceção.
--  * Cascata até o mínimo de 3 aptos: meta batida (sem teto) → venda na janela
--    → mais pontos na semana (> 0). Ninguém → roleta vazia + alerta aos admins.
--  * Efeito: apto ganha a linha ativa e sem pausa; não apto fica pausado até o
--    sábado seguinte 09:00 (1h depois da próxima apuração). Nada que já está
--    com o corretor muda (visitas, leads, tarefas).
--  * Modo sombra: calcula e grava, não mexe na roleta; o aviso de quarta sai
--    com "[Teste]".
--
-- Tudo atrás de `roleta_sdr_regra_ativa` (nasce false): as duas funções do
-- cron saem sem fazer nada com a regra desligada.
--
-- Numeração: precisa ser MAIOR que a última migration do remoto
-- (scripts/db-harness/README.md), por isso 20261011 e não a data de hoje.

-- ---------------------------------------------------------------------------
-- 1) Chaves (Central de Distribuição → Política)
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('roleta_sdr_regra_ativa', 'false'::jsonb,
   'Liga a permanência semanal na roleta Agendados do SDR: apuração no sábado 08:00 e aviso na quarta 18:00. Rollback = false (e despausar quem tem motivo "Regra semanal").'),
  ('roleta_sdr_modo_sombra', 'true'::jsonb,
   'Com a regra ligada: calcula e grava a apuração sem pausar nem incluir ninguém; o aviso de quarta sai com "[Teste]".'),
  ('roleta_sdr_peso_visita', '1'::jsonb,
   'Pontos por visita realizada (presença validada, 1 por lead por semana) na permanência semanal da roleta do SDR.'),
  ('roleta_sdr_peso_pasta', '1.5'::jsonb,
   'Pontos por pasta (entrada em análise de crédito, 1 por lead a cada 30 dias) na permanência semanal da roleta do SDR.'),
  ('roleta_sdr_meta_pontos', '3'::jsonb,
   'Pontos na semana (sábado a sexta) para continuar ou entrar na roleta do SDR na semana seguinte.'),
  ('roleta_sdr_minimo_aptos', '3'::jsonb,
   'Mínimo de aptos na roleta do SDR: abaixo disso entram a exceção por venda e o complemento por pontos.'),
  ('roleta_sdr_venda_janela_dias', '15'::jsonb,
   'Exceção por venda: assinatura até N dias antes da sexta do fechamento.')
ON CONFLICT (chave) DO NOTHING;

-- Leitura tolerante: valor fora do tipo (ex.: "1,5" salvo como texto) cai no
-- padrão em vez de derrubar o cron de sábado.
CREATE OR REPLACE FUNCTION public._roleta_sdr_num(_chave text, _padrao numeric)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN COALESCE((public.get_dist_setting(_chave) #>> '{}')::numeric, _padrao);
EXCEPTION WHEN OTHERS THEN
  RETURN _padrao;
END;
$$;

CREATE OR REPLACE FUNCTION public._roleta_sdr_bool(_chave text, _padrao boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN COALESCE((public.get_dist_setting(_chave) #>> '{}')::boolean, _padrao);
EXCEPTION WHEN OTHERS THEN
  RETURN _padrao;
END;
$$;

REVOKE ALL ON FUNCTION public._roleta_sdr_num(text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_num(text, numeric) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_sdr_bool(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_bool(text, boolean) TO service_role;

-- Parâmetros da regra num objeto só (a apuração grava o retrato junto do
-- resultado; a tela e o card do corretor leem daqui). Nada sensível: é a
-- régua que o próprio corretor precisa conhecer para saber quanto falta.
CREATE OR REPLACE FUNCTION public.roleta_sdr_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'regra_ativa', public._roleta_sdr_bool('roleta_sdr_regra_ativa', false),
    'modo_sombra', public._roleta_sdr_bool('roleta_sdr_modo_sombra', true),
    'peso_visita', GREATEST(public._roleta_sdr_num('roleta_sdr_peso_visita', 1), 0),
    'peso_pasta', GREATEST(public._roleta_sdr_num('roleta_sdr_peso_pasta', 1.5), 0),
    'meta_pontos', GREATEST(public._roleta_sdr_num('roleta_sdr_meta_pontos', 3), 0),
    'minimo_aptos', GREATEST(floor(public._roleta_sdr_num('roleta_sdr_minimo_aptos', 3)), 0)::int,
    'venda_janela_dias', GREATEST(floor(public._roleta_sdr_num('roleta_sdr_venda_janela_dias', 15)), 0)::int
  );
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_config() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Calendário: o MESMO de semana-sdr.ts (inicioSemanaSdr) — sábado é o dia 1.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._roleta_sdr_semana_de(_dia date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  -- dom=0 … sáb=6 → dias desde o sábado: sáb 0, dom 1, …, sex 6.
  SELECT _dia - ((extract(dow FROM _dia)::int + 1) % 7);
$$;

REVOKE ALL ON FUNCTION public._roleta_sdr_semana_de(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_semana_de(date) TO authenticated, service_role;

-- Texto de pontos no padrão da tela: "2,5 pts", "3 pts", "1 pt".
CREATE OR REPLACE FUNCTION public._roleta_sdr_fmt_pts(_n numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT replace(trim_scale(round(COALESCE(_n, 0), 2))::text, '.', ',')
         || CASE WHEN COALESCE(_n, 0) = 1 THEN ' pt' ELSE ' pts' END;
$$;

CREATE OR REPLACE FUNCTION public._roleta_sdr_plural(_n int, _singular text, _plural text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT _n::text || ' ' || CASE WHEN _n = 1 THEN _singular ELSE _plural END;
$$;

REVOKE ALL ON FUNCTION public._roleta_sdr_fmt_pts(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_fmt_pts(numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._roleta_sdr_plural(int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_plural(int, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Histórico: uma linha por corretor por semana
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roleta_sdr_apuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio date NOT NULL,
  semana_fim date NOT NULL,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visitas integer NOT NULL DEFAULT 0,
  pastas integer NOT NULL DEFAULT 0,
  pontos numeric(8,2) NOT NULL DEFAULT 0,
  vendas_janela integer NOT NULL DEFAULT 0,
  ultima_venda date,
  resultado text NOT NULL
    CHECK (resultado IN ('apto_meta','apto_venda','apto_complemento','pausado','bloqueado_admin')),
  -- true = calculada sem efeito na roleta (modo sombra ou recálculo histórico).
  sombra boolean NOT NULL,
  -- Quando o efeito foi aplicado em roleta_participantes (NULL em sombra).
  aplicado_em timestamptz,
  apurado_em timestamptz NOT NULL DEFAULT now(),
  -- Retrato da régua usada (pesos, meta, mínimo, janela) — a meta pode mudar.
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (semana_inicio, corretor_id),
  CHECK (semana_fim = semana_inicio + 6),
  CHECK (extract(dow FROM semana_inicio) = 6)
);

COMMENT ON TABLE public.roleta_sdr_apuracoes IS
  'Permanência semanal na roleta Agendados do SDR (docs/politica-roleta-sdr-semanal.md): placar do corretor na semana sábado→sexta e o resultado da cascata (meta / venda / complemento / pausado / bloqueado pelo admin). Escrita só por roleta_sdr_apurar_semana.';

CREATE INDEX IF NOT EXISTS idx_rsa_semana ON public.roleta_sdr_apuracoes (semana_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_rsa_corretor ON public.roleta_sdr_apuracoes (corretor_id, semana_inicio DESC);

ALTER TABLE public.roleta_sdr_apuracoes ENABLE ROW LEVEL SECURITY;
-- authenticated perde até os privilégios padrão do schema: escrita é só da apuração.
REVOKE ALL ON TABLE public.roleta_sdr_apuracoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.roleta_sdr_apuracoes TO authenticated;
GRANT ALL ON TABLE public.roleta_sdr_apuracoes TO service_role;

-- Admin vê tudo; o corretor vê só a própria linha. Sem policy de escrita.
DROP POLICY IF EXISTS roleta_sdr_apuracoes_select ON public.roleta_sdr_apuracoes;
CREATE POLICY roleta_sdr_apuracoes_select ON public.roleta_sdr_apuracoes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_member(auth.uid()))
    AND (
      (SELECT public.has_role(auth.uid(), 'admin'::public.app_role))
      OR corretor_id = (SELECT auth.uid())
    )
  );

-- Últimas apurações para a tela, com o nome. SECURITY INVOKER de propósito: a
-- RLS acima decide o que cada um vê (admin tudo, corretor a própria linha).
CREATE OR REPLACE FUNCTION public.roleta_sdr_apuracoes_recentes(_semanas int DEFAULT 4)
RETURNS TABLE (
  semana_inicio date,
  corretor_id uuid,
  nome text,
  visitas integer,
  pastas integer,
  pontos numeric,
  vendas_janela integer,
  resultado text,
  sombra boolean,
  aplicado_em timestamptz,
  apurado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH semanas AS (
    SELECT DISTINCT a.semana_inicio
    FROM public.roleta_sdr_apuracoes a
    ORDER BY a.semana_inicio DESC
    LIMIT LEAST(GREATEST(COALESCE(_semanas, 4), 1), 52)
  )
  SELECT a.semana_inicio, a.corretor_id, COALESCE(p.nome, 'Corretor sem nome'),
         a.visitas, a.pastas, a.pontos, a.vendas_janela, a.resultado, a.sombra,
         a.aplicado_em, a.apurado_em
  FROM public.roleta_sdr_apuracoes a
  JOIN semanas s ON s.semana_inicio = a.semana_inicio
  LEFT JOIN public.profiles p ON p.id = a.corretor_id
  ORDER BY a.semana_inicio DESC, a.pontos DESC, p.nome;
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_apuracoes_recentes(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_apuracoes_recentes(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Placar: contagem por corretor numa semana (pura leitura)
-- ---------------------------------------------------------------------------
-- Alimenta a apuração, o aviso de quarta e as telas. SECURITY DEFINER pelo
-- mesmo motivo de metas_dia_taxas: a RLS não deixa ler agendamentos e
-- transições dos colegas. Por isso o recorte é feito AQUI: admin (ou o cron,
-- sem JWT) vê todos; qualquer outro usuário recebe só a própria linha.
CREATE OR REPLACE FUNCTION public.roleta_sdr_placar(_semana_inicio date DEFAULT NULL)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  visitas integer,
  pastas integer,
  pontos numeric,
  vendas_janela integer,
  ultima_venda date,
  na_roleta boolean,
  participante_ativo boolean,
  pausado_ate timestamptz,
  motivo_pausa text,
  bloqueado_admin boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _uid uuid := auth.uid();
  _ve_tudo boolean;
  _cfg jsonb := public.roleta_sdr_config();
  _peso_visita numeric := (_cfg ->> 'peso_visita')::numeric;
  _peso_pasta numeric := (_cfg ->> 'peso_pasta')::numeric;
  _janela int := (_cfg ->> 'venda_janela_dias')::int;
  _ini date;
  _fim date;
  _ini_ts timestamptz;
  _fim_ts timestamptz;
  _roleta uuid;
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  _ve_tudo := _uid IS NULL OR public.has_role(_uid, 'admin'::public.app_role);

  _ini := COALESCE(_semana_inicio,
                   public._roleta_sdr_semana_de((now() AT TIME ZONE 'America/Sao_Paulo')::date));
  IF extract(dow FROM _ini) <> 6 THEN
    RAISE EXCEPTION 'a semana da roleta do SDR começa no sábado (recebi %)', _ini
      USING ERRCODE = '22023';
  END IF;
  _fim := _ini + 6;
  -- Limites no relógio de São Paulo: sexta 23:30 conta, sábado 00:10 é a próxima.
  _ini_ts := _ini::timestamp AT TIME ZONE 'America/Sao_Paulo';
  _fim_ts := (_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT r.id INTO _roleta FROM public.roletas r WHERE r.slug = 'agendados-sdr';

  RETURN QUERY
  WITH universo AS (
    SELECT p.id, p.nome
    FROM public.profiles p
    WHERE p.ativo
      AND p.status_conta = 'ativa'::public.status_conta
      AND lower(coalesce(p.nome, '')) <> 'docs-bot'
      AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role = 'corretor'::public.app_role)
      AND (_ve_tudo OR p.id = _uid)
  ),
  -- Visita realizada = presença validada, no DIA da visita (régua da folha do
  -- SDR). 1 por lead por semana; visita sem lead não é produção.
  vis AS (
    SELECT a.corretor_id, count(DISTINCT a.lead_id)::int AS n
    FROM public.agendamentos a
    WHERE a.tipo = 'visita'::public.agendamento_tipo
      AND a.status = 'realizado'::public.agendamento_status
      AND NOT a.auto_gerado
      AND a.deleted_at IS NULL
      AND a.lead_id IS NOT NULL
      AND a.data_inicio >= _ini_ts
      AND a.data_inicio < _fim_ts
      AND a.corretor_id IN (SELECT u.id FROM universo u)
    GROUP BY a.corretor_id
  ),
  -- Pasta = entrada em análise de crédito. Não conta se o MESMO lead já tinha
  -- entrado em análise nos 30 dias anteriores (por qualquer corretor).
  pas AS (
    SELECT t.corretor_id, count(DISTINCT t.lead_id)::int AS n
    FROM public.lead_status_transitions t
    WHERE t.para_status = 'analise_credito'::public.lead_status
      AND t.created_at >= _ini_ts
      AND t.created_at < _fim_ts
      AND t.corretor_id IN (SELECT u.id FROM universo u)
      AND NOT EXISTS (
        SELECT 1 FROM public.lead_status_transitions t2
        WHERE t2.lead_id = t.lead_id
          AND t2.para_status = 'analise_credito'::public.lead_status
          AND t2.created_at < t.created_at
          AND t2.created_at >= t.created_at - interval '30 days'
      )
    GROUP BY t.corretor_id
  ),
  -- Venda (só para a exceção): assinada até N dias antes da sexta do fechamento.
  ven AS (
    SELECT v.corretor_id, count(*)::int AS n, max(v.data_assinatura) AS ultima
    FROM public.vendas v
    WHERE v.status_venda IN ('pendente'::public.status_venda, 'aprovada'::public.status_venda)
      AND NOT v.distrato
      AND v.data_assinatura >= _fim - _janela
      AND v.data_assinatura <= _fim
      AND v.corretor_id IN (SELECT u.id FROM universo u)
    GROUP BY v.corretor_id
  ),
  part AS (
    SELECT rp.corretor_id, rp.ativo, rp.pausado_ate, rp.motivo_pausa,
           -- Removido por uma PESSOA (admin; gestor no escopo da equipe): a
           -- regra nunca reinclui. Só a ação "remover" deixa ativo = false.
           (NOT rp.ativo AND (
              SELECT l.feito_por FROM public.roleta_participantes_log l
              WHERE l.roleta_id = rp.roleta_id AND l.corretor_id = rp.corretor_id
                AND l.acao = 'removido'
              ORDER BY l.created_at DESC
              LIMIT 1
            ) IS NOT NULL) AS bloqueado
    FROM public.roleta_participantes rp
    WHERE rp.roleta_id = _roleta
  )
  SELECT u.id,
         u.nome,
         COALESCE(vis.n, 0),
         COALESCE(pas.n, 0),
         COALESCE(vis.n, 0) * _peso_visita + COALESCE(pas.n, 0) * _peso_pasta,
         COALESCE(ven.n, 0),
         ven.ultima,
         part.corretor_id IS NOT NULL,
         COALESCE(part.ativo, false),
         part.pausado_ate,
         part.motivo_pausa,
         COALESCE(part.bloqueado, false)
  FROM universo u
  LEFT JOIN vis ON vis.corretor_id = u.id
  LEFT JOIN pas ON pas.corretor_id = u.id
  LEFT JOIN ven ON ven.corretor_id = u.id
  LEFT JOIN part ON part.corretor_id = u.id
  ORDER BY 5 DESC, u.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_placar(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_placar(date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Textos (motivo da pausa e aviso) — espelho de src/lib/roleta-sdr-semanal.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._roleta_sdr_motivo_pausa(
  _pontos numeric, _visitas int, _pastas int, _ini date, _meta numeric
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT 'Regra semanal: ' || public._roleta_sdr_fmt_pts(_pontos)
         || ' (' || public._roleta_sdr_plural(_visitas, 'visita', 'visitas')
         || ', ' || public._roleta_sdr_plural(_pastas, 'pasta', 'pastas')
         || ') na semana ' || to_char(_ini, 'DD/MM') || ' a ' || to_char(_ini + 6, 'DD/MM')
         || '. Meta ' || public._roleta_sdr_fmt_pts(_meta) || '.';
$$;

REVOKE ALL ON FUNCTION public._roleta_sdr_motivo_pausa(numeric, int, int, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_motivo_pausa(numeric, int, int, date, numeric) TO authenticated, service_role;

-- "Sua semana na roleta do SDR: 1 visita realizada e 1 pasta (2,5 pts). Para
-- continuar recebendo agendados a partir de sábado, falta 1 visita ou 1 pasta
-- até sexta." O "falta" é o caminho mais curto por cada lado (só visitas, só
-- pastas) que leva a ≥ meta.
CREATE OR REPLACE FUNCTION public._roleta_sdr_texto_aviso(
  _visitas int, _pastas int, _pontos numeric, _situacao text, _cfg jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  _pv numeric := (_cfg ->> 'peso_visita')::numeric;
  _pp numeric := (_cfg ->> 'peso_pasta')::numeric;
  _resto numeric := GREATEST((_cfg ->> 'meta_pontos')::numeric - COALESCE(_pontos, 0), 0);
  _fv int;
  _fp int;
  _caminhos text[] := ARRAY[]::text[];
  _placar text;
  _para text;
BEGIN
  _placar := 'Sua semana na roleta do SDR: '
    || CASE WHEN _visitas = 0 THEN 'nenhuma visita realizada'
            ELSE public._roleta_sdr_plural(_visitas, 'visita realizada', 'visitas realizadas') END
    || ' e '
    || CASE WHEN _pastas = 0 THEN 'nenhuma pasta'
            ELSE public._roleta_sdr_plural(_pastas, 'pasta', 'pastas') END
    || ' (' || public._roleta_sdr_fmt_pts(_pontos) || ').';

  IF _resto <= 0 THEN
    RETURN _placar || ' Meta da semana batida.';
  END IF;

  IF _pv > 0 THEN
    _fv := ceil(_resto / _pv)::int;
    _caminhos := _caminhos || public._roleta_sdr_plural(_fv, 'visita', 'visitas');
  END IF;
  IF _pp > 0 THEN
    _fp := ceil(_resto / _pp)::int;
    _caminhos := _caminhos || public._roleta_sdr_plural(_fp, 'pasta', 'pastas');
  END IF;
  IF cardinality(_caminhos) = 0 THEN
    RETURN _placar;
  END IF;

  _para := CASE _situacao
    WHEN 'recebendo' THEN 'Para continuar recebendo agendados a partir de sábado'
    WHEN 'pausado' THEN 'Para voltar a receber agendados a partir de sábado'
    ELSE 'Para entrar na roleta e receber agendados a partir de sábado'
  END;

  RETURN _placar || ' ' || _para || ', '
    || CASE WHEN COALESCE(_fv, _fp) = 1 THEN 'falta ' ELSE 'faltam ' END
    || array_to_string(_caminhos, ' ou ') || ' até sexta.';
END;
$$;

REVOKE ALL ON FUNCTION public._roleta_sdr_texto_aviso(int, int, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_texto_aviso(int, int, numeric, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Prévia: a cascata de uma semana, SEM gravar nada
-- ---------------------------------------------------------------------------
-- É o que a apuração de sábado grava — e o que o admin roda para simular uma
-- semana antes de ligar a regra (independe de roleta_sdr_regra_ativa):
--   SELECT nome, visitas, pastas, pontos, vendas_janela, resultado
--     FROM public.roleta_sdr_previa('2026-09-26');
-- Só admin (ou o cron): a cascata precisa do placar de TODOS — com uma linha
-- só, o "mínimo de 3" sairia errado.
CREATE OR REPLACE FUNCTION public.roleta_sdr_previa(_semana_inicio date DEFAULT NULL)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  visitas integer,
  pastas integer,
  pontos numeric,
  vendas_janela integer,
  ultima_venda date,
  na_roleta boolean,
  participante_ativo boolean,
  pausado_ate timestamptz,
  motivo_pausa text,
  bloqueado_admin boolean,
  resultado text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _uid uuid := auth.uid();
  _cfg jsonb := public.roleta_sdr_config();
  _meta numeric := (_cfg ->> 'meta_pontos')::numeric;
  _minimo int := (_cfg ->> 'minimo_aptos')::int;
BEGIN
  IF _uid IS NOT NULL AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH p AS (
    SELECT * FROM public.roleta_sdr_placar(_semana_inicio)
  ),
  elig AS (SELECT * FROM p WHERE NOT p.bloqueado_admin),
  -- Faixa 1: meta batida, sem teto.
  f1 AS (SELECT e.corretor_id FROM elig e WHERE e.pontos >= _meta),
  n1 AS (SELECT count(*)::int AS n FROM f1),
  -- Faixa 2: venda na janela, por pontos e, no empate, venda mais recente.
  c2 AS (
    SELECT e.corretor_id,
           row_number() OVER (ORDER BY e.pontos DESC, e.ultima_venda DESC NULLS LAST,
                                       e.nome, e.corretor_id) AS rn
    FROM elig e
    WHERE e.pontos < _meta AND e.vendas_janela > 0
  ),
  f2 AS (SELECT c2.corretor_id FROM c2, n1 WHERE c2.rn <= GREATEST(_minimo - n1.n, 0)),
  n2 AS (SELECT count(*)::int AS n FROM f2),
  -- Faixa 3: mais pontos na semana (> 0). Empate final por nome: determinístico.
  c3 AS (
    SELECT e.corretor_id,
           row_number() OVER (ORDER BY e.pontos DESC, e.pastas DESC, e.nome, e.corretor_id) AS rn
    FROM elig e
    WHERE e.pontos < _meta AND e.pontos > 0
      AND e.corretor_id NOT IN (SELECT f2.corretor_id FROM f2)
  ),
  f3 AS (SELECT c3.corretor_id FROM c3, n1, n2 WHERE c3.rn <= GREATEST(_minimo - n1.n - n2.n, 0))
  SELECT p.corretor_id, p.nome, p.visitas, p.pastas, p.pontos, p.vendas_janela, p.ultima_venda,
         p.na_roleta, p.participante_ativo, p.pausado_ate, p.motivo_pausa, p.bloqueado_admin,
         CASE
           WHEN p.bloqueado_admin THEN 'bloqueado_admin'
           WHEN p.corretor_id IN (SELECT f1.corretor_id FROM f1) THEN 'apto_meta'
           WHEN p.corretor_id IN (SELECT f2.corretor_id FROM f2) THEN 'apto_venda'
           WHEN p.corretor_id IN (SELECT f3.corretor_id FROM f3) THEN 'apto_complemento'
           ELSE 'pausado'
         END
  FROM p
  ORDER BY p.pontos DESC, p.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_previa(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_previa(date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Apuração da semana: cascata + histórico + efeito na roleta
-- ---------------------------------------------------------------------------
-- Idempotente: rodar duas vezes a mesma semana regrava as mesmas linhas e o
-- efeito vira no-op (só loga quando o estado da roleta muda de fato).
-- Só a ÚLTIMA semana fechada mexe na roleta; semana mais antiga é recálculo
-- histórico (sombra) e é recusada se já teve efeito — senão o recálculo
-- desfaria a decisão de uma semana posterior.
CREATE OR REPLACE FUNCTION public.roleta_sdr_apurar_semana(_semana_inicio date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _uid uuid := auth.uid();
  _cfg jsonb := public.roleta_sdr_config();
  _meta numeric := (_cfg ->> 'meta_pontos')::numeric;
  _minimo int := (_cfg ->> 'minimo_aptos')::int;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _ultima date := public._roleta_sdr_semana_de((now() AT TIME ZONE 'America/Sao_Paulo')::date) - 7;
  _ini date := COALESCE(_semana_inicio, _ultima);
  _fim date := _ini + 6;
  _sombra boolean;
  _roleta uuid;
  _pausa_ate timestamptz;
  _r record;
  _rp public.roleta_participantes%ROWTYPE;
  _tem boolean;
  _alheia boolean;
  _motivo text;
  _rotulo text;
  _n_incluidos int := 0;
  _n_reativados int := 0;
  _n_pausados_efeito int := 0;
  _resumo jsonb;
  _n_aptos int;
  _titulo text;
BEGIN
  IF _uid IS NOT NULL AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT (_cfg ->> 'regra_ativa')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'regra_inativa');
  END IF;
  IF extract(dow FROM _ini) <> 6 THEN
    RAISE EXCEPTION 'a semana da roleta do SDR começa no sábado (recebi %)', _ini
      USING ERRCODE = '22023';
  END IF;
  IF _fim >= _hoje THEN
    RAISE EXCEPTION 'a semana % a % ainda não fechou', to_char(_ini, 'DD/MM'), to_char(_fim, 'DD/MM')
      USING ERRCODE = '22023';
  END IF;
  IF _ini < _ultima AND EXISTS (
    SELECT 1 FROM public.roleta_sdr_apuracoes a WHERE a.semana_inicio = _ini AND NOT a.sombra
  ) THEN
    RAISE EXCEPTION 'a semana % a % já mexeu na roleta; só a última semana fechada (%) pode ser reapurada',
      to_char(_ini, 'DD/MM'), to_char(_fim, 'DD/MM'), to_char(_ultima, 'DD/MM')
      USING ERRCODE = '22023';
  END IF;

  _sombra := (_cfg ->> 'modo_sombra')::boolean OR _ini <> _ultima;

  -- Uma apuração por vez (cron + clique do admin ao mesmo tempo).
  PERFORM pg_advisory_xact_lock(hashtext('roleta_sdr_apuracao'));

  SELECT r.id INTO _roleta FROM public.roletas r WHERE r.slug = 'agendados-sdr';
  IF _roleta IS NULL THEN
    RAISE EXCEPTION 'roleta agendados-sdr ausente' USING ERRCODE = 'P0002';
  END IF;

  -- Cascata (a mesma da prévia): faixa 1 sem teto; 2 e 3 só completam até o mínimo.
  WITH calc AS (
    SELECT * FROM public.roleta_sdr_previa(_ini)
  ),
  limpa AS (
    -- Quem saiu do universo entre duas apurações da mesma semana sai do histórico dela.
    DELETE FROM public.roleta_sdr_apuracoes a
    WHERE a.semana_inicio = _ini
      AND a.corretor_id NOT IN (SELECT calc.corretor_id FROM calc)
  )
  INSERT INTO public.roleta_sdr_apuracoes AS a
    (semana_inicio, semana_fim, corretor_id, visitas, pastas, pontos, vendas_janela,
     ultima_venda, resultado, sombra, aplicado_em, apurado_em, parametros)
  SELECT _ini, _fim, calc.corretor_id, calc.visitas, calc.pastas, calc.pontos, calc.vendas_janela,
         calc.ultima_venda, calc.resultado, _sombra,
         CASE WHEN _sombra THEN NULL ELSE now() END, now(), _cfg
  FROM calc
  ON CONFLICT (semana_inicio, corretor_id) DO UPDATE SET
    visitas = EXCLUDED.visitas,
    pastas = EXCLUDED.pastas,
    pontos = EXCLUDED.pontos,
    vendas_janela = EXCLUDED.vendas_janela,
    ultima_venda = EXCLUDED.ultima_venda,
    resultado = EXCLUDED.resultado,
    sombra = EXCLUDED.sombra,
    aplicado_em = EXCLUDED.aplicado_em,
    apurado_em = EXCLUDED.apurado_em,
    parametros = EXCLUDED.parametros;

  -- Efeito na roleta (fora da sombra).
  IF NOT _sombra THEN
    -- Sábado seguinte 09:00 BRT: 1h depois da próxima apuração (08:00), para a
    -- pausa nunca expirar antes de a régua da semana seguinte rodar.
    _pausa_ate := ((_ini + 14)::timestamp + time '09:00') AT TIME ZONE 'America/Sao_Paulo';

    FOR _r IN
      SELECT a.* FROM public.roleta_sdr_apuracoes a
      WHERE a.semana_inicio = _ini AND a.resultado <> 'bloqueado_admin'
      ORDER BY a.corretor_id
    LOOP
      SELECT * INTO _rp FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _roleta AND rp.corretor_id = _r.corretor_id
      FOR UPDATE;
      _tem := FOUND;

      -- Pausa de OUTRA origem em vigor (admin/gestor, SLA do quente): a regra
      -- não a encurta nem a apaga.
      _alheia := _tem AND _rp.pausado_ate IS NOT NULL AND _rp.pausado_ate > now()
                 AND COALESCE(_rp.motivo_pausa, '') NOT LIKE 'Regra semanal%';

      IF _r.resultado LIKE 'apto%' THEN
        _rotulo := CASE _r.resultado
          WHEN 'apto_meta' THEN 'apto pela meta'
          WHEN 'apto_venda' THEN 'apto por exceção (venda nos últimos '
                                 || (_cfg ->> 'venda_janela_dias') || ' dias)'
          ELSE 'apto por exceção (complemento do mínimo de ' || _minimo || ')'
        END;
        _motivo := 'Regra semanal: ' || _rotulo || ' — '
                   || public._roleta_sdr_fmt_pts(_r.pontos)
                   || ' (' || public._roleta_sdr_plural(_r.visitas, 'visita', 'visitas')
                   || ', ' || public._roleta_sdr_plural(_r.pastas, 'pasta', 'pastas')
                   || ') na semana ' || to_char(_ini, 'DD/MM') || ' a ' || to_char(_fim, 'DD/MM') || '.';

        IF NOT _tem THEN
          INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_por)
          VALUES (_roleta, _r.corretor_id, true, NULL);
          INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
          VALUES (_roleta, _r.corretor_id, 'incluido', _motivo, NULL);
          _n_incluidos := _n_incluidos + 1;
        ELSIF NOT _rp.ativo THEN
          -- Inativo sem bloqueio manual (ex.: desligado por processo automático).
          UPDATE public.roleta_participantes
             SET ativo = true,
                 pausado_ate = CASE WHEN _alheia THEN pausado_ate ELSE NULL END,
                 motivo_pausa = CASE WHEN _alheia THEN motivo_pausa ELSE NULL END
           WHERE id = _rp.id;
          INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
          VALUES (_roleta, _r.corretor_id, 'reativado', _motivo, NULL);
          _n_reativados := _n_reativados + 1;
        ELSIF _rp.pausado_ate IS NOT NULL AND NOT _alheia THEN
          UPDATE public.roleta_participantes
             SET pausado_ate = NULL, motivo_pausa = NULL
           WHERE id = _rp.id;
          -- Só loga se a pausa ainda valia (pausa vencida é só limpeza).
          IF _rp.pausado_ate > now() THEN
            INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
            VALUES (_roleta, _r.corretor_id, 'reativado', _motivo, NULL);
            _n_reativados := _n_reativados + 1;
          END IF;
        END IF;

      ELSE -- pausado
        IF NOT _tem OR NOT _rp.ativo THEN
          CONTINUE; -- fora da roleta: nada a pausar
        END IF;
        IF _alheia AND _rp.pausado_ate >= _pausa_ate THEN
          CONTINUE; -- pausa manual mais longa vale mais
        END IF;
        _motivo := public._roleta_sdr_motivo_pausa(_r.pontos, _r.visitas, _r.pastas, _ini, _meta);
        IF _rp.pausado_ate IS NOT DISTINCT FROM _pausa_ate
           AND _rp.motivo_pausa IS NOT DISTINCT FROM _motivo THEN
          CONTINUE; -- já aplicado (idempotência)
        END IF;
        UPDATE public.roleta_participantes
           SET pausado_ate = _pausa_ate, motivo_pausa = _motivo
         WHERE id = _rp.id;
        INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
        VALUES (_roleta, _r.corretor_id, 'pausado',
                _motivo || ' (até ' || to_char(_pausa_ate AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')',
                NULL);
        _n_pausados_efeito := _n_pausados_efeito + 1;
      END IF;
    END LOOP;
  END IF;

  SELECT jsonb_build_object(
           'avaliados', count(*),
           'apto_meta', count(*) FILTER (WHERE a.resultado = 'apto_meta'),
           'apto_venda', count(*) FILTER (WHERE a.resultado = 'apto_venda'),
           'apto_complemento', count(*) FILTER (WHERE a.resultado = 'apto_complemento'),
           'pausado', count(*) FILTER (WHERE a.resultado = 'pausado'),
           'bloqueado_admin', count(*) FILTER (WHERE a.resultado = 'bloqueado_admin')
         ),
         count(*) FILTER (WHERE a.resultado LIKE 'apto%')::int
    INTO _resumo, _n_aptos
  FROM public.roleta_sdr_apuracoes a
  WHERE a.semana_inicio = _ini;

  -- Ninguém qualificado: a roleta fica vazia e a gestão é avisada (uma vez
  -- por semana por admin). agendar_visita_sdr segue levantando "nenhum
  -- corretor apto" — as entregas passam pela entrega manual do admin.
  IF _n_aptos = 0 THEN
    _titulo := CASE WHEN _sombra THEN '[Teste] ' ELSE '' END || 'Roleta do SDR sem aptos nesta semana';
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    SELECT ur.user_id, 'sistema'::public.alerta_tipo, _titulo,
           'Roleta do SDR sem aptos nesta semana: entregas pela entrega manual do admin. Ninguém fez ponto nem vendeu nos últimos '
             || (_cfg ->> 'venda_janela_dias') || ' dias na semana ' || to_char(_ini, 'DD/MM') || ' a '
             || to_char(_fim, 'DD/MM') || '.',
           '/distribuicao?tab=filas&fila=agendados-sdr',
           md5('roleta-sdr-sem-aptos:' || _ini::text || ':' || _sombra::text || ':' || ur.user_id::text)::uuid
    FROM (SELECT DISTINCT u.user_id FROM public.user_roles u
          JOIN public.profiles pr ON pr.id = u.user_id AND pr.ativo
          WHERE u.role = 'admin'::public.app_role) ur
    WHERE NOT EXISTS (
      SELECT 1 FROM public.alertas al
      WHERE al.user_id = ur.user_id
        AND al.ref_id = md5('roleta-sdr-sem-aptos:' || _ini::text || ':' || _sombra::text || ':' || ur.user_id::text)::uuid
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'semana_inicio', _ini,
    'semana_fim', _fim,
    'sombra', _sombra,
    'resultado', _resumo,
    'efeito', jsonb_build_object('incluidos', _n_incluidos, 'reativados', _n_reativados,
                                 'pausados', _n_pausados_efeito)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_apurar_semana(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_apurar_semana(date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Aviso de meio de semana (quarta 18:00 BRT): sino para quem ainda não
--    bateu a meta na semana em curso. WhatsApp fica de fora: o único canal
--    pronto é o notify-lead-transfer, específico de entrega de lead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roleta_sdr_aviso_meio_semana()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _uid uuid := auth.uid();
  _cfg jsonb := public.roleta_sdr_config();
  _meta numeric := (_cfg ->> 'meta_pontos')::numeric;
  _sombra boolean := (_cfg ->> 'modo_sombra')::boolean;
  _ini date := public._roleta_sdr_semana_de((now() AT TIME ZONE 'America/Sao_Paulo')::date);
  _r record;
  _ref uuid;
  _situacao text;
  _avisados int := 0;
  _repetidos int := 0;
BEGIN
  IF _uid IS NOT NULL AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT (_cfg ->> 'regra_ativa')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'regra_inativa');
  END IF;

  FOR _r IN
    SELECT * FROM public.roleta_sdr_placar(_ini) p
    WHERE NOT p.bloqueado_admin AND p.pontos < _meta
  LOOP
    -- Dedup entre execuções: md5(corretor + semana), padrão de metas_dia.
    _ref := md5('roleta-sdr-aviso:' || _r.corretor_id::text || ':' || _ini::text)::uuid;
    IF EXISTS (SELECT 1 FROM public.alertas al WHERE al.user_id = _r.corretor_id AND al.ref_id = _ref) THEN
      _repetidos := _repetidos + 1;
      CONTINUE;
    END IF;
    _situacao := CASE
      WHEN _r.na_roleta AND _r.participante_ativo
           AND (_r.pausado_ate IS NULL OR _r.pausado_ate <= now()) THEN 'recebendo'
      WHEN _r.na_roleta AND _r.participante_ativo THEN 'pausado'
      ELSE 'fora'
    END;
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (
      _r.corretor_id, 'sistema'::public.alerta_tipo,
      CASE WHEN _sombra THEN '[Teste] ' ELSE '' END || 'Roleta do SDR: sua semana',
      left(CASE WHEN _sombra THEN '[Teste] ' ELSE '' END
           || public._roleta_sdr_texto_aviso(_r.visitas, _r.pastas, _r.pontos, _situacao, _cfg), 600),
      '/fila', _ref
    );
    _avisados := _avisados + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'semana_inicio', _ini, 'sombra', _sombra,
                            'avisados', _avisados, 'ja_avisados', _repetidos);
END;
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_aviso_meio_semana() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_aviso_meio_semana() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) Crons (UTC; BRT = UTC-3)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('roleta-sdr-apuracao-semanal')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'roleta-sdr-apuracao-semanal');
  PERFORM cron.unschedule('roleta-sdr-aviso-meio-semana')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'roleta-sdr-aviso-meio-semana');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Sábado 08:00 BRT: apura a semana que fechou ontem (sexta).
SELECT cron.schedule('roleta-sdr-apuracao-semanal', '0 11 * * 6',
                     $$SELECT public.roleta_sdr_apurar_semana()$$);
-- Quarta 18:00 BRT: aviso para quem ainda não bateu a meta.
SELECT cron.schedule('roleta-sdr-aviso-meio-semana', '0 21 * * 3',
                     $$SELECT public.roleta_sdr_aviso_meio_semana()$$);

-- ---------------------------------------------------------------------------
-- 10) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.distribuicao_settings WHERE chave LIKE 'roleta_sdr_%') < 7 THEN
    RAISE EXCEPTION 'roleta_sdr_permanencia_semanal: chaves de configuração ausentes';
  END IF;
  IF public._roleta_sdr_semana_de(DATE '2026-10-09') <> DATE '2026-10-03'
     OR public._roleta_sdr_semana_de(DATE '2026-10-10') <> DATE '2026-10-10' THEN
    RAISE EXCEPTION 'roleta_sdr_permanencia_semanal: calendário sábado→sexta quebrado';
  END IF;
  IF public._roleta_sdr_fmt_pts(2.5) <> '2,5 pts' OR public._roleta_sdr_fmt_pts(3) <> '3 pts' THEN
    RAISE EXCEPTION 'roleta_sdr_permanencia_semanal: formatação de pontos';
  END IF;
  IF has_function_privilege('anon', 'public.roleta_sdr_apurar_semana(date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.roleta_sdr_placar(date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.roleta_sdr_previa(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'roleta_sdr_permanencia_semanal: função aberta para anon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'roleta-sdr-apuracao-semanal')
     OR NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'roleta-sdr-aviso-meio-semana') THEN
    RAISE EXCEPTION 'roleta_sdr_permanencia_semanal: crons ausentes';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
