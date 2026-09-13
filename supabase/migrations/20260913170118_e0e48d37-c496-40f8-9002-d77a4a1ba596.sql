INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('carteira_ativa',
   '{"cap_conversa": 23, "cap_sla": 20, "cap_resgate": 13,
     "conversa_dias": 7, "sla_horas": 72,
     "devolver_sem_movimento_dias": 30, "devolver_sem_proximo_passo_dias": 2}',
   'Carteira ativa (Fila Unica, Fatia 3): caps por faixa e gatilhos de devolucao. O TETO fica em capacidade_leads_ativos_por_corretor — uma chave so para o mesmo numero.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.carteira_ativa_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(public.gestao_config_valor('carteira_ativa'), '{}'::jsonb)
      || jsonb_build_object(
           'teto',
           GREATEST(
             COALESCE((public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int, 65),
             1));
$$;

REVOKE ALL ON FUNCTION public.carteira_ativa_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_ativa_config() TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_ativa_config() IS
  'Config vigente da carteira ativa: os caps de faixa e gatilhos de gestao_config.carteira_ativa, com o teto vindo de capacidade_leads_ativos_por_corretor (a fonte unica do teto).';

CREATE TABLE IF NOT EXISTS public.carteira_resgates (
  corretor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretor_id, lead_id)
);

CREATE INDEX IF NOT EXISTS carteira_resgates_lead_idx
  ON public.carteira_resgates (lead_id);

ALTER TABLE public.carteira_resgates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carteira_resgates_select ON public.carteira_resgates;
CREATE POLICY carteira_resgates_select ON public.carteira_resgates
  FOR SELECT TO authenticated
  USING (public.pode_acessar_corretor(auth.uid(), corretor_id));

REVOKE ALL ON public.carteira_resgates FROM PUBLIC, anon;
GRANT SELECT ON public.carteira_resgates TO authenticated;
GRANT ALL ON public.carteira_resgates TO service_role;

COMMENT ON TABLE public.carteira_resgates IS
  'Faixa B da carteira ativa: leads que o corretor puxou da Reserva a dedo. Escrita so por carteira_resgatar/carteira_soltar.';

CREATE OR REPLACE FUNCTION public._carteira_classificar(_corretor uuid)
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
  proximo_followup timestamptz,
  valor numeric,
  faixa text,
  posicao integer,
  ativa boolean,
  motivo text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (
    SELECT
      COALESCE((c.v ->> 'teto')::int, 65)                            AS teto,
      COALESCE((c.v ->> 'cap_conversa')::int, 23)                    AS cap_conversa,
      COALESCE((c.v ->> 'cap_sla')::int, 20)                         AS cap_sla,
      COALESCE((c.v ->> 'cap_resgate')::int, 13)                     AS cap_resgate,
      COALESCE((c.v ->> 'conversa_dias')::int, 7)                    AS conversa_dias,
      COALESCE((c.v ->> 'sla_horas')::int, 72)                       AS sla_horas,
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
      CASE WHEN pr.sob_consulta THEN NULL ELSE pr.preco_a_partir END       AS valor
    FROM public.leads AS l
    LEFT JOIN public.projetos AS pr ON pr.id = l.projeto_id
    WHERE l.corretor_id = _corretor
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
  ),
  recentes AS (
    SELECT v.id
    FROM vivos AS v, cfg
    WHERE v.movimento >= now() - make_interval(days => cfg.conversa_dias)
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
      (
        (v.proximo_followup IS NULL OR v.proximo_followup <= now())
        AND NOT EXISTS (
          SELECT 1 FROM public.tarefas AS t
          WHERE t.lead_id = v.id AND t.status IN ('pendente', 'em_andamento')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.agendamentos AS a
          WHERE a.lead_id = v.id
            AND a.data_inicio >= now()
            AND a.status NOT IN ('cancelado', 'realizado', 'nao_compareceu')
        )
      ) AS sem_proximo_passo
    FROM vivos AS v
    LEFT JOIN resp AS rs ON rs.lead_id = v.id
    LEFT JOIN public.carteira_resgates AS rg
      ON rg.lead_id = v.id AND rg.corretor_id = _corretor
  ),
  comfaixa AS (
    SELECT
      m.*,
      CASE
        WHEN m.status IN ('agendado', 'visita_realizada', 'proposta_enviada', 'analise_credito')
          THEN 'fundo'
        WHEN m.resgatado THEN 'resgate'
        WHEN m.respondeu OR (m.proximo_followup IS NOT NULL AND m.proximo_followup > now())
          THEN 'conversa'
        WHEN m.status IN ('novo', 'aguardando_atendimento')
         AND m.created_at >= now() - make_interval(hours => cfg.sla_horas)
          THEN 'sla'
        ELSE 'reserva'
      END AS faixa,
      cfg.teto,
      cfg.cap_conversa,
      cfg.cap_sla,
      cfg.cap_resgate,
      cfg.sem_movimento_dias,
      cfg.sem_passo_dias
    FROM marcados AS m, cfg
  ),
  rankeado AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY c.faixa
        ORDER BY
          CASE c.faixa
            WHEN 'fundo'    THEN EXTRACT(EPOCH FROM c.movimento)
            WHEN 'conversa' THEN EXTRACT(EPOCH FROM c.movimento)
            WHEN 'sla'      THEN EXTRACT(EPOCH FROM c.created_at)
            ELSE              EXTRACT(EPOCH FROM c.movimento)
          END ASC,
          c.id ASC
      )::int AS rank_faixa
    FROM comfaixa AS c
  ),
  naFaixa AS (
    SELECT
      r.*,
      CASE r.faixa
        WHEN 'fundo'    THEN true
        WHEN 'resgate'  THEN r.rank_faixa <= r.cap_resgate
        WHEN 'conversa' THEN r.rank_faixa <= r.cap_conversa
        WHEN 'sla'      THEN r.rank_faixa <= r.cap_sla
        ELSE false
      END AS cabe_na_faixa,
      CASE r.faixa
        WHEN 'fundo'    THEN 1
        WHEN 'resgate'  THEN 2
        WHEN 'conversa' THEN 3
        WHEN 'sla'      THEN 4
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
    (f.faixa = 'fundo' OR (f.posicao IS NOT NULL AND f.posicao <= f.teto)) AS ativa,
    CASE
      WHEN f.faixa = 'fundo'
        OR (f.posicao IS NOT NULL AND f.posicao <= f.teto) THEN NULL
      WHEN f.dias_parado >= f.sem_movimento_dias
        THEN 'sem movimento há ' || f.dias_parado || ' dias'
      WHEN f.sem_proximo_passo AND f.dias_parado >= f.sem_passo_dias
        THEN 'sem próximo passo definido'
      WHEN f.faixa = 'reserva' AND f.status IN ('novo', 'aguardando_atendimento')
        THEN 'nunca respondeu ao primeiro contato'
      WHEN f.faixa = 'reserva'
        THEN 'sem conversa viva'
      WHEN NOT f.cabe_na_faixa
        THEN 'faixa cheia (' || f.faixa || ')'
      ELSE 'acima do teto de ' || f.teto
    END AS motivo
  FROM final AS f;
$$;

REVOKE ALL ON FUNCTION public._carteira_classificar(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._carteira_classificar(uuid) IS
  'Regra unica da carteira ativa: classifica TODO lead vivo do corretor em faixa (fundo/resgate/conversa/sla/reserva), ordena, aplica caps de faixa e o teto, e diz o motivo de quem ficou fora. Chamada pelas RPCs DEFINER — a Reserva e o complemento exato da carteira ativa.';

CREATE OR REPLACE FUNCTION public.carteira_ativa_v1(_corretor uuid DEFAULT NULL)
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
  proximo_followup timestamptz,
  valor numeric,
  faixa text,
  posicao integer
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
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.pode_acessar_corretor(_caller, _alvo) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.lead_id, c.nome, c.telefone, c.status, c.temperatura, c.projeto_nome,
         c.created_at, c.movimento, c.dias_parado, c.proximo_followup, c.valor,
         c.faixa, c.posicao
  FROM public._carteira_classificar(_alvo) AS c
  WHERE c.ativa
  ORDER BY c.posicao ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_ativa_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_ativa_v1(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_ativa_v1(uuid) IS
  'Os leads que ocupam vaga na carteira ativa do corretor, na ordem de precedencia das faixas. Sem _corretor e a propria carteira; com _corretor, so quem alcanca aquele corretor (42501 caso contrario).';

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

REVOKE ALL ON FUNCTION public.carteira_reserva_v1(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_reserva_v1(uuid, text, integer, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_reserva_v1(uuid, text, integer, integer) IS
  'A Reserva: o complemento exato da carteira ativa, com o motivo de cada lead ter ficado fora, busca por nome/telefone (so digitos) e paginacao. `total` e a contagem da janela inteira, repetida em cada linha.';

CREATE OR REPLACE FUNCTION public.carteira_vagas_v1(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT GREATEST(
    0,
    COALESCE((public.carteira_ativa_config() ->> 'teto')::int, 65)
      - (SELECT count(*)::int FROM public._carteira_classificar(_corretor) AS c WHERE c.ativa)
  );
$$;

REVOKE ALL ON FUNCTION public.carteira_vagas_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_vagas_v1(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_vagas_v1(uuid) IS
  'Vagas livres na carteira ativa do corretor (teto menos ocupadas), nunca negativo. Sem guard de escopo de proposito: so devolve um inteiro e e lida por telas que ja recortaram o escopo.';

CREATE OR REPLACE FUNCTION public.carteira_vagas_entrada_v1(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (SELECT public.carteira_ativa_config() AS v),
  atual AS (SELECT c.ativa, c.faixa FROM public._carteira_classificar(_corretor) AS c)
  SELECT GREATEST(0, LEAST(
    COALESCE((SELECT (cfg.v ->> 'teto')::int FROM cfg), 65)
      - (SELECT count(*)::int FROM atual WHERE atual.ativa),
    COALESCE((SELECT (cfg.v ->> 'cap_sla')::int FROM cfg), 20)
      - (SELECT count(*)::int FROM atual WHERE atual.ativa AND atual.faixa = 'sla')
  ));
$$;

REVOKE ALL ON FUNCTION public.carteira_vagas_entrada_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_vagas_entrada_v1(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_vagas_entrada_v1(uuid) IS
  'Quantos leads NOVOS a roleta pode entregar ao corretor agora: o menor entre a vaga global (teto) e a vaga da faixa SLA (cap_sla). Usar carteira_vagas_v1 aqui faria a distribuicao despejar leads que caem na Reserva no mesmo instante. Sem guard de escopo: e chamada de dentro da distribuicao, que roda sem auth.uid().';

CREATE OR REPLACE FUNCTION public.carteira_resgatar(_lead uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.carteira_resgatar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_resgatar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_resgatar(uuid) IS
  'Puxa um lead da Reserva para a carteira ativa (faixa B). So para a propria carteira e so ate cap_resgate. Idempotente.';

CREATE OR REPLACE FUNCTION public.carteira_soltar(_lead uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM public.carteira_resgates AS r
  WHERE r.corretor_id = _caller AND r.lead_id = _lead;

  RETURN jsonb_build_object('ok', true, 'lead_id', _lead,
                            'vagas_agora', public.carteira_vagas_v1(_caller));
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_soltar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_soltar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_soltar(uuid) IS
  'Desfaz um resgate: o lead volta a concorrer pelas faixas normais (e cai na Reserva se nao couber). Idempotente.';

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
      cl.valor   AS valor
    FROM corretores AS co
    CROSS JOIN LATERAL public._carteira_classificar(co.id) AS cl
  )
  SELECT
    co.id,
    co.nome,
    _teto,
    count(*) FILTER (WHERE l.ativa)::int,
    count(*) FILTER (WHERE l.faixa = 'fundo')::int,
    count(*) FILTER (WHERE NOT l.ativa)::int,
    count(*) FILTER (WHERE NOT l.ativa AND l.motivo LIKE 'sem movimento%')::int,
    count(*) FILTER (WHERE NOT l.ativa AND l.motivo = 'sem próximo passo definido')::int,
    COALESCE(sum(l.valor) FILTER (WHERE l.ativa), 0)
  FROM corretores AS co
  LEFT JOIN linhas AS l ON l.dono = co.id
  GROUP BY co.id, co.nome
  ORDER BY count(*) FILTER (WHERE NOT l.ativa) DESC, co.nome ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.carteira_sombra_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_sombra_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.carteira_sombra_v1() IS
  'Modo sombra do teto da carteira ativa: por corretor do escopo, quantos ocupam vaga, quantos ficariam na Reserva e por qual gatilho — sem devolver nada. So gestao (corretor recebe 42501).';

CREATE OR REPLACE FUNCTION public.distribuir_estoque_roleta(
  _roleta text DEFAULT 'plantao'::text,
  _limite integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _lead record;
  _res jsonb;
  _ok int := 0;
  _corretores int := 0;
  _sem_vaga int := 0;
  _uid uuid := auth.uid();
  _por_corretor int;
  _lote int;
  _vagas int;
  _entregues int;
  _sdr jsonb := NULL;
  _teto int;
  _base_sdr int;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  _por_corretor := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);

  IF public._sdr_ativo() THEN
    _teto := public._sdr_setting_int('sdr_teto_leads_ativos', 0);
    SELECT count(*) INTO _base_sdr
      FROM public.leads l
     WHERE l.deleted_at IS NULL
       AND COALESCE(l.na_lixeira, false) = false
       AND l.sdr_id IS NOT NULL
       AND l.sdr_entregue_em IS NULL
       AND l.corretor_id IS NULL;

    IF _teto <= 0 OR _base_sdr < _teto THEN
      _sdr := public.distribuir_estoque_sdr(
        CASE WHEN _teto > 0 THEN LEAST(_por_corretor, _teto - _base_sdr) ELSE _por_corretor END);
    ELSE
      _sdr := jsonb_build_object('ok', true, 'modelo', 'sdr', 'distribuidos', 0,
                                 'motivo', 'teto_base_sdr_atingido', 'base_ativa', _base_sdr, 'teto', _teto);
    END IF;
  END IF;

  FOR _c IN
    SELECT e.corretor_id
      FROM public._elegibilidade_roleta(_roleta) e
     WHERE e.apto
        OR (COALESCE(e.motivos, ARRAY[]::text[]) <@ ARRAY['cota_diaria_atingida']
            AND COALESCE(array_length(e.motivos, 1), 0) > 0)
     ORDER BY e.ultimo_lead_em ASC NULLS FIRST, e.incluido_em ASC
  LOOP
    _vagas := public.carteira_vagas_entrada_v1(_c.corretor_id);
    IF _vagas <= 0 THEN
      _sem_vaga := _sem_vaga + 1;
      CONTINUE;
    END IF;

    _corretores := _corretores + 1;
    _entregues := 0;
    _lote := LEAST(_por_corretor, _vagas);

    FOR _lead IN
      SELECT l.id
        FROM public.leads l
       WHERE l.deleted_at IS NULL
         AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL
         AND l.sdr_id IS NULL
         AND l.status = 'aguardando_corretor'
       ORDER BY l.created_at ASC
       LIMIT _lote
    LOOP
      _res := public._distribuir_lead_v3(
        _lead.id, 'automatica'::distribuicao_tipo, _roleta, _c.corretor_id, _uid,
        'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_roleta',
                                      'lote_por_corretor', _lote,
                                      'vagas_na_carteira', _vagas), false);

      IF COALESCE((_res->>'ok')::boolean, false) THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento'
         WHERE id = _lead.id AND status = 'aguardando_corretor';
        _ok := _ok + 1;
        _entregues := _entregues + 1;
      END IF;
    END LOOP;

    EXIT WHEN _entregues = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', _roleta,
    'distribuidos', _ok,
    'sdr', _sdr,
    'corretores_aptos', _corretores,
    'corretores_sem_vaga', _sem_vaga,
    'lote_por_corretor', _por_corretor,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.sdr_id IS NULL AND l.status = 'aguardando_corretor')
  );
END;
$function$;

COMMENT ON FUNCTION public.distribuir_estoque_roleta(text, int) IS
  'Escoa o estoque aguardando_corretor pela roleta, com o lote de cada corretor limitado pela vaga de ENTRADA da carteira ativa (carteira_vagas_entrada_v1: o menor entre o teto e o cap da faixa SLA). Corretor sem vaga e pulado e contado em corretores_sem_vaga. O desvio do SDR e o caminho _distribuir_lead_v3 seguem intactos.';

DO $$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef('public.distribuir_estoque_roleta(text,int)'::regprocedure);
  IF position('_sdr_ativo' IN _def) = 0 OR position('_distribuir_lead_v3' IN _def) = 0 THEN
    RAISE EXCEPTION 'distribuir_estoque_roleta sem o desvio do SDR ou sem o caminho vigente';
  END IF;
  IF position('carteira_vagas_entrada_v1' IN _def) = 0 THEN
    RAISE EXCEPTION 'distribuir_estoque_roleta sem o limite por vaga da carteira ativa';
  END IF;
  IF position('CONTINUE' IN _def) = 0 THEN
    RAISE EXCEPTION 'distribuir_estoque_roleta: corretor sem vaga precisa ser pulado, nao encerrar a rodada';
  END IF;
END $$;

INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('capacidade_leads_ativos_por_corretor', '65',
   'Teto da carteira ativa de um corretor (Fila Unica / Reserva) e 100% da capacidade na Tela Time. 40 -> 65 em 13/09/2026 por decisao do dono.')
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao;

INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('carteira_ativa',
   '{"cap_conversa": 23, "cap_sla": 20, "cap_resgate": 13,
     "conversa_dias": 7, "sla_horas": 72,
     "devolver_sem_movimento_dias": 30, "devolver_sem_proximo_passo_dias": 2}',
   'Carteira ativa (Fila Unica, Fatia 3): caps por faixa e gatilhos de devolucao. Caps escalados com o teto 40 -> 65 em 13/09/2026. O TETO fica em capacidade_leads_ativos_por_corretor — uma chave so para o mesmo numero.')
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao;

DO $$
DECLARE
  _teto int := (public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int;
  _cfg jsonb := public.gestao_config_valor('carteira_ativa');
  _soma int := (_cfg ->> 'cap_conversa')::int
             + (_cfg ->> 'cap_sla')::int
             + (_cfg ->> 'cap_resgate')::int;
BEGIN
  IF _teto IS NULL OR _soma IS NULL THEN
    RAISE EXCEPTION 'carteira ativa: teto ou caps ausentes em gestao_config';
  END IF;
  IF _soma > _teto THEN
    RAISE EXCEPTION 'carteira ativa: caps somam % e o teto e % — o fundo do funil ficaria sem folga',
      _soma, _teto;
  END IF;
END $$;