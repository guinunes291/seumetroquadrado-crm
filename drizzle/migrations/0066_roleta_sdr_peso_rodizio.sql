-- Roleta "Agendados do SDR" — peso no rodízio e exceção por venda sem teto.
--
-- Decisão de 05/10/2026 (docs/politica-roleta-sdr-semanal.md, seção "Peso no
-- rodízio"), por cima da permanência semanal (migration 20261011120000):
--  * Exceção por venda SEM TETO: todo mundo com venda assinada na janela (e
--    sem a meta) entra, mesmo passando do mínimo de 3 aptos. O complemento por
--    pontos continua só completando até o mínimo.
--  * Peso no rodízio da roleta do SDR: meta batida = peso cheio (2); quem
--    entrou com UMA venda na janela, ou pelo complemento = peso menor (1) —
--    recebe 1 agendado para cada 2 de quem bateu a meta. Duas ou mais vendas
--    na janela valem peso cheio. Incluído à mão pela Central = peso cheio.
--  * O rodízio ponderado (o mesmo algoritmo das campanhas: wrr_current) só
--    vale com a regra ligada e FORA da sombra. Em sombra ou com a regra
--    desligada, a roleta segue "quem está há mais tempo sem receber".
--  * O peso vem da última semana APLICADA em roleta_sdr_apuracoes (não do
--    tier: o recálculo semanal de faixas do motor v2 sobrescreve o tier de
--    todas as roletas).

-- ---------------------------------------------------------------------------
-- 1) Chaves (Central de Distribuição → Política)
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('roleta_sdr_peso_rodizio_meta', '2'::jsonb,
   'Peso no rodízio da roleta do SDR de quem bateu a meta da semana (ou tem vendas suficientes na janela).'),
  ('roleta_sdr_peso_rodizio_reduzido', '1'::jsonb,
   'Peso no rodízio da roleta do SDR de quem entrou por exceção (1 venda na janela) ou pelo complemento.'),
  ('roleta_sdr_vendas_peso_cheio', '2'::jsonb,
   'Vendas na janela que dão peso cheio no rodízio a quem não bateu a meta (0 = venda nunca dá peso cheio).')
ON CONFLICT (chave) DO NOTHING;

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
    'venda_janela_dias', GREATEST(floor(public._roleta_sdr_num('roleta_sdr_venda_janela_dias', 15)), 0)::int,
    -- Pesos do rodízio: inteiros >= 1 (o rodízio ponderado soma inteiros).
    'peso_rodizio_meta', GREATEST(floor(public._roleta_sdr_num('roleta_sdr_peso_rodizio_meta', 2)), 1)::int,
    'peso_rodizio_reduzido', GREATEST(floor(public._roleta_sdr_num('roleta_sdr_peso_rodizio_reduzido', 1)), 1)::int,
    'vendas_peso_cheio', GREATEST(floor(public._roleta_sdr_num('roleta_sdr_vendas_peso_cheio', 2)), 0)::int
  );
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_config() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Peso gravado na apuração
-- ---------------------------------------------------------------------------
ALTER TABLE public.roleta_sdr_apuracoes
  ADD COLUMN IF NOT EXISTS peso_rodizio smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roleta_sdr_apuracoes_peso_check') THEN
    ALTER TABLE public.roleta_sdr_apuracoes
      ADD CONSTRAINT roleta_sdr_apuracoes_peso_check CHECK (peso_rodizio IS NULL OR peso_rodizio >= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.roleta_sdr_apuracoes.peso_rodizio IS
  'Peso no rodízio ponderado da roleta do SDR na semana seguinte (NULL para pausado / removido).';

-- ---------------------------------------------------------------------------
-- 3) Peso vigente e escolha ponderada
-- ---------------------------------------------------------------------------
-- O rodízio é ponderado só com a regra valendo de verdade (ligada e fora da sombra).
CREATE OR REPLACE FUNCTION public._roleta_sdr_ponderado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (c ->> 'regra_ativa')::boolean AND NOT (c ->> 'modo_sombra')::boolean
  FROM (SELECT public.roleta_sdr_config() AS c) x;
$$;

-- Peso do corretor na semana em vigor: o da última semana APLICADA. Sem linha
-- nela (incluído à mão pela Central, ou nenhuma apuração aplicada ainda) ou
-- com peso nulo = peso cheio.
CREATE OR REPLACE FUNCTION public._roleta_sdr_peso_atual(_corretor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT a.peso_rodizio::int
       FROM public.roleta_sdr_apuracoes a
      WHERE a.corretor_id = _corretor
        AND NOT a.sombra
        AND a.semana_inicio = (SELECT max(x.semana_inicio)
                                 FROM public.roleta_sdr_apuracoes x
                                WHERE NOT x.sombra)),
    (public.roleta_sdr_config() ->> 'peso_rodizio_meta')::int
  );
$$;

-- Rodízio ponderado suave (o mesmo das campanhas): cada candidato soma o
-- próprio peso em wrr_current; ganha o maior; o vencedor devolve a soma dos
-- pesos. Com pesos 2 e 1, quem tem 2 recebe duas vezes para cada uma.
-- Empate: quem está há mais tempo sem receber.
CREATE OR REPLACE FUNCTION public._roleta_sdr_escolher_ponderado(_roleta_id uuid, _candidatos uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _soma int;
  _vencedor uuid;
BEGIN
  IF _candidatos IS NULL OR cardinality(_candidatos) = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM 1 FROM public.roleta_participantes rp
   WHERE rp.roleta_id = _roleta_id AND rp.corretor_id = ANY(_candidatos)
   FOR UPDATE;

  WITH c AS (
    SELECT rp.id, public._roleta_sdr_peso_atual(rp.corretor_id) AS peso
    FROM public.roleta_participantes rp
    WHERE rp.roleta_id = _roleta_id AND rp.corretor_id = ANY(_candidatos)
  ),
  u AS (
    UPDATE public.roleta_participantes rp
       SET wrr_current = rp.wrr_current + c.peso
      FROM c
     WHERE rp.id = c.id
    RETURNING c.peso
  )
  SELECT sum(u.peso)::int INTO _soma FROM u;

  IF _soma IS NULL OR _soma = 0 THEN
    RETURN NULL;
  END IF;

  SELECT rp.corretor_id INTO _vencedor
  FROM public.roleta_participantes rp
  WHERE rp.roleta_id = _roleta_id AND rp.corretor_id = ANY(_candidatos)
  ORDER BY rp.wrr_current DESC, rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC, rp.corretor_id
  LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _soma
   WHERE roleta_id = _roleta_id AND corretor_id = _vencedor;

  RETURN _vencedor;
END;
$$;

REVOKE ALL ON FUNCTION public._roleta_sdr_ponderado() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_ponderado() TO service_role;
REVOKE ALL ON FUNCTION public._roleta_sdr_peso_atual(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_peso_atual(uuid) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_sdr_escolher_ponderado(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_sdr_escolher_ponderado(uuid, uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Prévia: venda sem teto + peso de cada apto
-- ---------------------------------------------------------------------------
-- A assinatura muda (coluna nova): DROP + CREATE. A apuração chama a prévia
-- pelo nome, em tempo de execução — nada depende dela no catálogo.
DROP FUNCTION IF EXISTS public.roleta_sdr_previa(date);

CREATE FUNCTION public.roleta_sdr_previa(_semana_inicio date DEFAULT NULL)
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
  resultado text,
  peso_rodizio integer
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
  _peso_cheio int := (_cfg ->> 'peso_rodizio_meta')::int;
  _peso_menor int := (_cfg ->> 'peso_rodizio_reduzido')::int;
  _vendas_cheio int := (_cfg ->> 'vendas_peso_cheio')::int;
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
  -- Faixa 2: venda na janela, SEM teto (decisão de 05/10/2026).
  f2 AS (SELECT e.corretor_id FROM elig e WHERE e.pontos < _meta AND e.vendas_janela > 0),
  n12 AS (SELECT (SELECT count(*) FROM f1)::int + (SELECT count(*) FROM f2)::int AS n),
  -- Faixa 3: mais pontos na semana (> 0), só até o mínimo. Empate por nome.
  c3 AS (
    SELECT e.corretor_id,
           row_number() OVER (ORDER BY e.pontos DESC, e.pastas DESC, e.nome, e.corretor_id) AS rn
    FROM elig e
    WHERE e.pontos < _meta AND e.pontos > 0 AND e.vendas_janela = 0
  ),
  f3 AS (SELECT c3.corretor_id FROM c3, n12 WHERE c3.rn <= GREATEST(_minimo - n12.n, 0)),
  r AS (
    SELECT p.*,
           CASE
             WHEN p.bloqueado_admin THEN 'bloqueado_admin'
             WHEN p.corretor_id IN (SELECT f1.corretor_id FROM f1) THEN 'apto_meta'
             WHEN p.corretor_id IN (SELECT f2.corretor_id FROM f2) THEN 'apto_venda'
             WHEN p.corretor_id IN (SELECT f3.corretor_id FROM f3) THEN 'apto_complemento'
             ELSE 'pausado'
           END AS res
    FROM p
  )
  SELECT r.corretor_id, r.nome, r.visitas, r.pastas, r.pontos, r.vendas_janela, r.ultima_venda,
         r.na_roleta, r.participante_ativo, r.pausado_ate, r.motivo_pausa, r.bloqueado_admin,
         r.res,
         CASE r.res
           WHEN 'apto_meta' THEN _peso_cheio
           WHEN 'apto_venda' THEN CASE WHEN _vendas_cheio > 0 AND r.vendas_janela >= _vendas_cheio
                                       THEN _peso_cheio ELSE _peso_menor END
           WHEN 'apto_complemento' THEN _peso_menor
         END
  FROM r
  ORDER BY r.pontos DESC, r.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_previa(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_previa(date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Apuração: grava o peso e zera o rodízio ponderado na semana nova
-- ---------------------------------------------------------------------------
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
     ultima_venda, resultado, peso_rodizio, sombra, aplicado_em, apurado_em, parametros)
  SELECT _ini, _fim, calc.corretor_id, calc.visitas, calc.pastas, calc.pontos, calc.vendas_janela,
         calc.ultima_venda, calc.resultado, calc.peso_rodizio, _sombra,
         CASE WHEN _sombra THEN NULL ELSE now() END, now(), _cfg
  FROM calc
  ON CONFLICT (semana_inicio, corretor_id) DO UPDATE SET
    visitas = EXCLUDED.visitas,
    pastas = EXCLUDED.pastas,
    pontos = EXCLUDED.pontos,
    vendas_janela = EXCLUDED.vendas_janela,
    ultima_venda = EXCLUDED.ultima_venda,
    resultado = EXCLUDED.resultado,
    peso_rodizio = EXCLUDED.peso_rodizio,
    sombra = EXCLUDED.sombra,
    aplicado_em = EXCLUDED.aplicado_em,
    apurado_em = EXCLUDED.apurado_em,
    parametros = EXCLUDED.parametros;

  -- Efeito na roleta (fora da sombra).
  IF NOT _sombra THEN
    -- Sábado seguinte 09:00 BRT: 1h depois da próxima apuração (08:00), para a
    -- pausa nunca expirar antes de a régua da semana seguinte rodar.
    _pausa_ate := ((_ini + 14)::timestamp + time '09:00') AT TIME ZONE 'America/Sao_Paulo';

    -- [PESO] Semana nova, rodízio ponderado do zero: o crédito acumulado com
    -- os pesos da semana anterior não vaza para a composição nova.
    UPDATE public.roleta_participantes
       SET wrr_current = 0
     WHERE roleta_id = _roleta AND wrr_current <> 0;

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
                   || ') na semana ' || to_char(_ini, 'DD/MM') || ' a ' || to_char(_fim, 'DD/MM')
                   || '. Peso no rodízio: ' || COALESCE(_r.peso_rodizio::text, '-') || '.';

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
-- 6) Últimas apurações para a tela, agora com o peso
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.roleta_sdr_apuracoes_recentes(int);

CREATE FUNCTION public.roleta_sdr_apuracoes_recentes(_semanas int DEFAULT 4)
RETURNS TABLE (
  semana_inicio date,
  corretor_id uuid,
  nome text,
  visitas integer,
  pastas integer,
  pontos numeric,
  vendas_janela integer,
  resultado text,
  peso_rodizio integer,
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
         a.visitas, a.pastas, a.pontos, a.vendas_janela, a.resultado, a.peso_rodizio::int,
         a.sombra, a.aplicado_em, a.apurado_em
  FROM public.roleta_sdr_apuracoes a
  JOIN semanas s ON s.semana_inicio = a.semana_inicio
  LEFT JOIN public.profiles p ON p.id = a.corretor_id
  ORDER BY a.semana_inicio DESC, a.pontos DESC, p.nome;
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_apuracoes_recentes(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_apuracoes_recentes(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Motor da roleta do SDR: corpo vigente (20261009120100, zona estrita) +
--    escolha ponderada na roleta de agendados. Diferenças marcadas com [PESO].
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_sdr(_lead_id uuid, _motivo text, _inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, _fim timestamp with time zone DEFAULT NULL::timestamp with time zone, _gatilho text DEFAULT 'sdr'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _uid uuid := auth.uid();
  _slug text := 'agendados-sdr';
  _roleta public.roletas%ROWTYPE;
  _vencedor uuid;
  _vencedor_nome text;
  _regra text;
  _tipo public.distribuicao_tipo := 'automatica'::public.distribuicao_tipo;
  _aptos jsonb;
  _inaptos jsonb;
  _aptos_ids uuid[];
  _n_ativos int := 0;
  _log_id uuid;
  _ctx jsonb;
  _sdr_nome text;
  _prioridade_recusa text;
  _motivo_excecao text;
  -- [ZONA]
  _estrita boolean := public._zona_estrita();
  _zona text;
  _zslug text;
  _zroleta public.roletas%ROWTYPE;
  _slug_usado text;
  -- [PESO]
  _ponderado boolean := false;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado');
  END IF;
  IF _lead.sdr_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_sem_sdr');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_na_lixeira');
  END IF;

  SELECT p.nome INTO _sdr_nome FROM public.profiles p WHERE p.id = _lead.sdr_id;
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _slug;
  _slug_usado := _slug;

  IF _estrita THEN
    _zona := public.zona_do_lead(_lead_id);
    IF _zona IS NOT NULL THEN
      SELECT zr.roleta_slug INTO _zslug FROM public.zonas_roletas zr WHERE zr.zona = _zona;
    END IF;
  END IF;

  -- 1) Prioridade do corretor original (lead reaquecido de carteira viva).
  --    Só vale para quem HOJE tem o papel corretor: quem virou SDR vindo de
  --    corretor continua sendo corretor_id da carteira antiga e, sem esta
  --    guarda, o motor "entregaria" o lead de volta para o próprio SDR.
  IF _lead.corretor_id IS NOT NULL AND _lead.sdr_entregue_em IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _lead.corretor_id AND p.ativo AND p.status_conta = 'ativa'::public.status_conta
    ) THEN
      _prioridade_recusa := 'corretor_inativo';
    ELSIF NOT public.has_role(_lead.corretor_id, 'corretor'::public.app_role) THEN
      _prioridade_recusa := 'corretor_sem_papel';
    ELSIF _estrita AND NOT public.corretor_atende_zona(_lead.corretor_id, _zona) THEN
      -- [ZONA] O dono antigo é de outra região: a visita vai para a zona.
      _prioridade_recusa := 'fora_da_regiao';
    ELSIF public._sdr_agenda_conflita(_lead.corretor_id, _inicio, _fim) THEN
      _prioridade_recusa := 'conflito_agenda';
    ELSE
      _vencedor := _lead.corretor_id;
      _regra := 'sdr_prioridade_corretor_original';
      _tipo := 'manual'::public.distribuicao_tipo;
    END IF;
  END IF;

  -- 2) Roleta de agendados: rodízio simples entre aptos, pulando quem já
  --    tentou (salvo se isso esvaziar a fila) e quem tem conflito de agenda.
  IF _vencedor IS NULL THEN
    IF _roleta.id IS NULL OR NOT _roleta.ativo THEN
      _motivo_excecao := 'sem_corretor_ativo';
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('roleta_sdr:' || _slug));

      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('corretor_id', e.corretor_id, 'nome', e.nome)) FILTER (WHERE e.apto), '[]'::jsonb),
        COALESCE(jsonb_agg(jsonb_build_object('corretor_id', e.corretor_id, 'nome', e.nome, 'motivos', e.motivos)) FILTER (WHERE NOT e.apto), '[]'::jsonb),
        array_agg(e.corretor_id) FILTER (WHERE e.apto),
        count(*)::int
      INTO _aptos, _inaptos, _aptos_ids, _n_ativos
      FROM public._elegibilidade_roleta_sdr(_slug, _inicio, _fim) e;

      -- [ZONA] Só quem atende a zona do lead.
      IF _estrita AND _zona IS NOT NULL THEN
        _aptos_ids := ARRAY(SELECT x FROM unnest(COALESCE(_aptos_ids, ARRAY[]::uuid[])) x
                             WHERE public.corretor_atende_zona(x, _zona));
      END IF;

      IF _aptos_ids IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(_aptos_ids) x
        WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
      ) THEN
        _aptos_ids := ARRAY(
          SELECT x FROM unnest(_aptos_ids) x
          WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
        );
      END IF;

      -- [PESO] Regra semanal valendo: rodízio PONDERADO (meta = peso cheio;
      -- exceção por 1 venda e complemento = peso menor). Fora dela, o rodízio
      -- de sempre: quem está há mais tempo sem receber.
      _ponderado := public._roleta_sdr_ponderado();
      IF _ponderado THEN
        _vencedor := public._roleta_sdr_escolher_ponderado(
          _roleta.id, COALESCE(_aptos_ids, ARRAY[]::uuid[]));
      ELSE
        SELECT rp.corretor_id INTO _vencedor
        FROM public.roleta_participantes rp
        WHERE rp.roleta_id = _roleta.id
          AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
        ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
        LIMIT 1
        FOR UPDATE OF rp SKIP LOCKED;
      END IF;

      _regra := 'roleta_sdr';
      IF _vencedor IS NULL THEN
        _motivo_excecao := CASE WHEN _n_ativos = 0 THEN 'sem_corretor_ativo' ELSE 'sem_corretor_elegivel' END;
      END IF;
    END IF;
  END IF;

  -- 3) [ZONA] Ninguém dos agendados atende a zona: time da zona, mesma régua
  --    de agenda (presença, teto do SDR, conflito no horário da visita).
  IF _vencedor IS NULL AND _estrita AND _zslug IS NOT NULL THEN
    SELECT * INTO _zroleta FROM public.roletas WHERE slug = _zslug AND ativo;
    IF FOUND THEN
      SELECT array_agg(e.corretor_id) FILTER (WHERE e.apto)
        INTO _aptos_ids
      FROM public._elegibilidade_roleta_sdr(_zslug, _inicio, _fim) e;

      IF _aptos_ids IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(_aptos_ids) x
        WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
      ) THEN
        _aptos_ids := ARRAY(
          SELECT x FROM unnest(_aptos_ids) x
          WHERE NOT (x = ANY(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
        );
      END IF;

      SELECT rp.corretor_id INTO _vencedor
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _zroleta.id
        AND rp.corretor_id = ANY(COALESCE(_aptos_ids, ARRAY[]::uuid[]))
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      LIMIT 1
      FOR UPDATE OF rp SKIP LOCKED;

      IF _vencedor IS NOT NULL THEN
        _regra := 'roleta_sdr_zona';
        _slug_usado := _zslug;
        _roleta := _zroleta;
        _motivo_excecao := NULL;
      END IF;
    END IF;
    IF _vencedor IS NULL THEN
      _motivo_excecao := 'sem_corretor_na_zona';
    END IF;
  END IF;

  _ctx := jsonb_strip_nulls(jsonb_build_object(
    'modelo', 'sdr',
    'gatilho', _gatilho,
    'sdr_id', _lead.sdr_id,
    'sdr_nome', _sdr_nome,
    'regra', _regra,
    'aptos', COALESCE(_aptos, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos, '[]'::jsonb),
    'prioridade_recusa', _prioridade_recusa,
    'inicio', _inicio,
    'fim', _fim,
    'zona', _zona,
    'zona_estrita', _estrita,
    'roleta_usada', _slug_usado,
    'rodizio_ponderado', _ponderado
  ));

  IF _vencedor IS NULL THEN
    PERFORM public._registrar_excecao_distribuicao(
      _lead_id, _motivo_excecao,
      CASE WHEN _motivo_excecao = 'sem_corretor_na_zona'
           THEN 'Visita do SDR sem corretor da ' || public._rotulo_zona(_zona) || ' livre ('
                || COALESCE(_motivo, _gatilho) || ') — o lead espera o time da zona'
           ELSE 'Roleta de agendados do SDR sem corretor apto (' || COALESCE(_motivo, _gatilho) || ')' END,
      _slug, _ctx);
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
    VALUES
      (_lead_id, NULL, 'automatica'::public.distribuicao_tipo, _motivo, _slug, 'roleta_sdr', 'sem_corretor', _uid)
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _ctx);
    RETURN jsonb_build_object('ok', false, 'motivo', _motivo_excecao,
                              'aptos', COALESCE(_aptos, '[]'::jsonb),
                              'inaptos', COALESCE(_inaptos, '[]'::jsonb));
  END IF;

  SELECT p.nome INTO _vencedor_nome FROM public.profiles p WHERE p.id = _vencedor;

  PERFORM set_config('app.sdr_motor', 'on', true);
  UPDATE public.leads
     SET corretor_anterior_id = CASE WHEN corretor_id IS DISTINCT FROM _vencedor THEN corretor_id ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         sdr_entregue_em = now(),
         sdr_devolvido_em = NULL,
         roleta_slug = CASE WHEN _regra IN ('roleta_sdr', 'roleta_sdr_zona') THEN _slug_usado ELSE roleta_slug END,
         via_webhook = false,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor)
         END
   WHERE id = _lead_id;

  IF _regra IN ('roleta_sdr', 'roleta_sdr_zona') THEN
    UPDATE public.roleta_participantes
       SET ultimo_lead_em = now(), updated_at = now()
     WHERE roleta_id = _roleta.id AND corretor_id = _vencedor;
  END IF;
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, distribuido_por_id)
  VALUES
    (_lead_id, _vencedor, _tipo, _motivo, _slug_usado, _regra, 'sucesso', _uid)
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, _ctx || jsonb_build_object('vencedor', _vencedor, 'vencedor_nome', _vencedor_nome));

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(), resolvida_por = _uid,
         resolucao = 'Entregue pelo SDR a ' || COALESCE(_vencedor_nome, '(corretor)')
   WHERE lead_id = _lead_id AND status IN ('pendente', 'em_analise');

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id, 'sdr_entrega',
    'Entregue pelo SDR ' || COALESCE(_sdr_nome, '') || ' ao corretor ' || COALESCE(_vencedor_nome, '') || ' (' || COALESCE(_motivo, _gatilho) || ').',
    'sdr_motor',
    jsonb_build_object('sdr_id', _lead.sdr_id, 'corretor_id', _vencedor, 'regra', _regra,
                       'motivo', _motivo, 'gatilho', _gatilho)
  );

  INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
  VALUES (
    _lead_id, _uid, 'nota'::public.interacao_tipo, 'interna'::public.interacao_direcao,
    'Lead entregue pelo SDR',
    'SDR ' || COALESCE(_sdr_nome, '') || ' → corretor ' || COALESCE(_vencedor_nome, '') || ': ' || COALESCE(_motivo, _gatilho),
    jsonb_build_object('fonte', 'sistema', 'evento', 'sdr_entrega', 'regra', _regra,
                       'sdr_id', _lead.sdr_id, 'corretor_id', _vencedor)
  );

  -- Push: o trigger de leads só dispara quando corretor_id MUDA; no caminho de
  -- prioridade (mesmo dono) avisamos explicitamente.
  IF _lead.corretor_id IS NOT DISTINCT FROM _vencedor THEN
    PERFORM public.enqueue_push(
      _vencedor, 'Lead do SDR para você',
      COALESCE(_lead.nome, 'Lead') || ' · ' || COALESCE(_motivo, _gatilho),
      '/leads/' || _lead_id::text, 'sdr-' || _lead_id::text);
  END IF;

  -- Marcão (n8n copiloto/handoff) NÃO roda na entrega do SDR: o aviso é o
  -- WhatsApp do SDR (_sdr_notificar_corretor), disparado depois que a visita
  -- existe — um único WhatsApp por entrega.

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _vencedor, 'corretor_nome', _vencedor_nome,
    'regra', _regra, 'roleta', _slug_usado);
END; $function$;

-- ---------------------------------------------------------------------------
-- 8) Sanidade
-- ---------------------------------------------------------------------------
DO $$
DECLARE _c jsonb := public.roleta_sdr_config();
BEGIN
  IF NOT (_c ? 'peso_rodizio_meta' AND _c ? 'peso_rodizio_reduzido' AND _c ? 'vendas_peso_cheio') THEN
    RAISE EXCEPTION 'roleta_sdr_peso_rodizio: chaves de peso ausentes na config';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'roleta_sdr_apuracoes'
                    AND column_name = 'peso_rodizio') THEN
    RAISE EXCEPTION 'roleta_sdr_peso_rodizio: coluna peso_rodizio ausente';
  END IF;
  IF position('_roleta_sdr_escolher_ponderado' IN
       pg_get_functiondef('public._distribuir_lead_sdr(uuid,text,timestamptz,timestamptz,text)'::regprocedure)) = 0
     OR position('_zona_estrita' IN
       pg_get_functiondef('public._distribuir_lead_sdr(uuid,text,timestamptz,timestamptz,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roleta_sdr_peso_rodizio: motor do SDR sem o rodízio ponderado ou sem a zona estrita';
  END IF;
  IF has_function_privilege('anon', 'public.roleta_sdr_previa(date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.roleta_sdr_apuracoes_recentes(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._roleta_sdr_escolher_ponderado(uuid,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'roleta_sdr_peso_rodizio: função aberta demais';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
