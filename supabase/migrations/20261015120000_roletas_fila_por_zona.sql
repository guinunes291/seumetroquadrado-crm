-- =============================================================================
-- Roletas por zona — a fila de cada roleta e a posição de cada corretor
-- =============================================================================
-- Pedido do dono (11/10/2026), ao comparar com a roleta do vídeo de
-- lançamento: "a roleta será apenas para o SDR e os corretores vendo em qual
-- posição da fila estão. Por fila de zona." Valem todas as roletas: a da zona,
-- a fila do SDR, a do Marquinhos e as de campanha (Facebook Ads). O SDR vê a
-- fila inteira, com nomes; o corretor vê só a própria posição, na Central de
-- Comando. Substitui a "roleta só em número" de 20261014120000 (política do
-- SDR §7, item 6).
--
-- Nada aqui muda quem recebe. As funções LEEM o estado de cada motor e
-- PREVEEM a ordem com a régua dele, sem escrever nada:
--
--   roleta de zona e Marquinhos (_distribuir_lead_v3)
--     aptos de _elegibilidade_roleta (presença do dia, pausa, cota, regra dos
--     65...), só quem atende a zona; rodízio "há mais tempo sem receber"
--     (ultimo_lead_em, incluido_em). Com o modelo v2 ligado, o lead quente
--     usa o ponderado por faixa (A/B/C = 3/2/1) — a fila mostra esse.
--   Agendados do SDR (_distribuir_lead_sdr)
--     aptos de _elegibilidade_roleta_sdr (sem presença, sem horário de
--     visita), só quem atende a zona; com a regra semanal valendo, ponderado
--     pelo peso da semana; senão, rodízio. Ninguém da zona no time: a visita
--     vai para o time da zona, pela régua do SDR (rodízio) — a "reserva".
--   campanha (distribuir_lead_ponderado)
--     equipe fixa: ponderado por faixa (pesos da roleta) entre quem da equipe
--     atende a zona; campanha comum: lead com zona vai para a roleta da zona,
--     então ela só tem fila para lead sem zona.
--
-- O que a previsão não sabe, porque depende do lead e não da fila: quem já
-- teve o lead é pulado; na visita do SDR, quem tem compromisso no horário é
-- pulado e o corretor que falou com o cliente nos últimos 7 dias fura a fila.
--
-- Posição = a ordem em que cada apto recebe se os próximos leads forem desta
-- zona. No ponderado, é a ordem da PRIMEIRA vez de cada um (peso maior pode
-- receber de novo antes de outro chegar à vez).
--
-- Idempotente. Espelhada em drizzle/migrations/0076.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) O rodízio ponderado (smooth weighted round-robin) dos três motores, em
--    simulação: soma o peso de todos, escolhe o maior cursor, desconta a soma
--    de quem recebeu. _ids chega na ordem de desempate do motor; com
--    _desempate_move, quem recebe vai para o fim do desempate (o motor grava
--    ultimo_lead_em = now() e desempata por ele).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fila_swrr(
  _ids uuid[],
  _pesos integer[],
  _correntes integer[],
  _desempate_move boolean
)
RETURNS TABLE (corretor_id uuid, posicao integer)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  _n     integer := coalesce(cardinality(_ids), 0);
  _cur   integer[] := _correntes;
  _rank  integer[];
  _feito boolean[];
  _soma  integer;
  _prox  integer;
  _pos   integer := 0;
  _volta integer := 0;
  _best  integer;
  i      integer;
BEGIN
  IF _n = 0 THEN
    RETURN;
  END IF;
  SELECT coalesce(sum(x), 0) INTO _soma FROM unnest(_pesos) x;
  _rank  := ARRAY(SELECT g FROM generate_series(1, _n) g);
  _feito := array_fill(false, ARRAY[_n]);
  _prox  := _n + 1;

  WHILE _soma > 0 AND _pos < _n AND _volta < _soma * _n + _n LOOP
    _volta := _volta + 1;
    FOR i IN 1.._n LOOP
      _cur[i] := coalesce(_cur[i], 0) + coalesce(_pesos[i], 0);
    END LOOP;
    _best := 1;
    FOR i IN 2.._n LOOP
      IF _cur[i] > _cur[_best] OR (_cur[i] = _cur[_best] AND _rank[i] < _rank[_best]) THEN
        _best := i;
      END IF;
    END LOOP;
    _cur[_best] := _cur[_best] - _soma;
    IF _desempate_move THEN
      _rank[_best] := _prox;
      _prox := _prox + 1;
    END IF;
    IF NOT _feito[_best] THEN
      _feito[_best] := true;
      _pos := _pos + 1;
      corretor_id := _ids[_best];
      posicao := _pos;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- Peso zero (não acontece hoje): quem sobrou entra no fim, na ordem dada.
  FOR i IN 1.._n LOOP
    IF NOT _feito[i] THEN
      _pos := _pos + 1;
      corretor_id := _ids[i];
      posicao := _pos;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Qual mecânica a roleta usa agora. _regua = 'sdr': a reserva da visita do
--    SDR no time da zona (régua do SDR, rodízio).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._roleta_fila_mecanica(_slug text, _regua text DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
           WHEN r.slug IS NULL THEN NULL
           WHEN _regua = 'sdr' AND r.tipo <> 'sdr' THEN 'rodizio'
           WHEN r.tipo = 'sdr' THEN
             CASE WHEN public._roleta_sdr_ponderado() THEN 'ponderado_semana' ELSE 'rodizio' END
           WHEN r.tipo = 'campanha' THEN 'ponderado_faixa'
           WHEN public._modelo_v2_ativo() AND r.slug <> 'base' THEN 'ponderado_faixa'
           ELSE 'rodizio'
         END
    FROM (SELECT 1) x
    LEFT JOIN public.roletas r ON r.slug = _slug;
$$;

-- ---------------------------------------------------------------------------
-- 3) A fila prevista de uma roleta numa zona: todos os participantes que
--    atendem a zona, os aptos com a posição e os outros com o motivo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._roleta_fila_prevista(
  _slug text,
  _zona text DEFAULT NULL,
  _regua text DEFAULT NULL
)
RETURNS TABLE (corretor_id uuid, nome text, posicao integer, apto boolean, motivos text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _r       public.roletas%ROWTYPE;
  _estrita boolean := public._zona_estrita();
  _mec     text;
  _elig    jsonb;
BEGIN
  SELECT * INTO _r FROM public.roletas WHERE slug = _slug;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  _mec := public._roleta_fila_mecanica(_slug, _regua);

  -- A roleta de zona É a zona: o filtro de região do motor vale com a dela.
  IF _r.tipo = 'zona' THEN
    SELECT zr.zona INTO _zona
      FROM public.zonas_roletas zr
     WHERE zr.roleta_slug = _slug
     ORDER BY zr.zona
     LIMIT 1;
  END IF;

  -- Campanha comum + lead com zona: quem distribui é a roleta da zona.
  IF _r.tipo = 'campanha' AND NOT _r.equipe_fixa AND _estrita AND _zona IS NOT NULL THEN
    RETURN;
  END IF;

  -- A régua de cada motor.
  IF _r.tipo = 'sdr' OR _regua = 'sdr' THEN
    SELECT jsonb_agg(jsonb_build_object(
             'corretor_id', e.corretor_id, 'nome', e.nome,
             'apto', e.apto, 'motivos', to_jsonb(e.motivos)))
      INTO _elig
      FROM public._elegibilidade_roleta_sdr(_slug, NULL, NULL) e;
  ELSIF _r.tipo = 'campanha' THEN
    -- Os filtros de distribuir_lead_ponderado, um a um (presença sem data e
    -- cota no dia do banco, como lá).
    SELECT jsonb_agg(jsonb_build_object(
             'corretor_id', c.corretor_id, 'nome', c.nome,
             'apto', (c.participante_ativo AND c.eh_corretor AND NOT c.pausado AND c.perfil_ativo
                      AND c.tem_telefone AND c.presenca_ok AND c.dentro_cota),
             'motivos', to_jsonb(array_remove(ARRAY[
               CASE WHEN NOT c.participante_ativo THEN 'participacao_inativa' END,
               CASE WHEN c.pausado THEN 'pausado' END,
               CASE WHEN NOT c.perfil_ativo THEN 'perfil_inativo' END,
               CASE WHEN NOT c.eh_corretor THEN 'sem_role_corretor' END,
               CASE WHEN NOT c.tem_telefone THEN 'sem_telefone' END,
               CASE WHEN NOT c.presenca_ok THEN 'ausente_hoje' END,
               CASE WHEN NOT c.dentro_cota THEN 'cota_diaria_atingida' END
             ], NULL))))
      INTO _elig
      FROM (
        SELECT rp.corretor_id,
               p.nome,
               rp.ativo AS participante_ativo,
               EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor') AS eh_corretor,
               NOT (rp.pausado_ate IS NULL OR rp.pausado_ate < now()) AS pausado,
               p.ativo = true AS perfil_ativo,
               coalesce(p.telefone, '') <> '' AS tem_telefone,
               (NOT _r.exigir_presenca OR p.presente = true) AS presenca_ok,
               (rp.limite_diario IS NULL OR (
                  SELECT count(*) FROM public.distribution_log dl
                   WHERE dl.corretor_id = rp.corretor_id
                     AND dl.roleta_slug = _r.slug
                     AND dl.resultado = 'sucesso'
                     AND dl.created_at >= date_trunc('day', now())
                ) < rp.limite_diario) AS dentro_cota
          FROM public.roleta_participantes rp
          JOIN public.profiles p ON p.id = rp.corretor_id
         WHERE rp.roleta_id = _r.id
      ) c;
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
             'corretor_id', e.corretor_id, 'nome', e.nome,
             'apto', e.apto AND coalesce(x.apto, true),
             'motivos', to_jsonb(coalesce(e.motivos, '{}') || coalesce(x.motivos, '{}'))))
      INTO _elig
      FROM public._elegibilidade_roleta(_slug) e
      -- [V2] A régua extra do motor (onboarding, vínculo, disjuntor).
      LEFT JOIN LATERAL (
        SELECT v.apto, v.motivos FROM public._apto_extra_v2(e.corretor_id) v
         WHERE public._modelo_v2_ativo() AND e.apto
      ) x ON true;
  END IF;

  RETURN QUERY
  WITH e AS (
    SELECT x.corretor_id,
           x.nome,
           x.apto AND _r.ativo AS apto,
           coalesce(x.motivos, '{}')
             || CASE WHEN _r.ativo THEN '{}'::text[] ELSE ARRAY['roleta_desativada'] END AS motivos
      FROM jsonb_to_recordset(coalesce(_elig, '[]'::jsonb))
           AS x(corretor_id uuid, nome text, apto boolean, motivos text[])
     WHERE NOT (_estrita AND _zona IS NOT NULL)
        OR public.corretor_atende_zona(x.corretor_id, _zona)
  ),
  ap AS (
    SELECT e.corretor_id,
           rp.ultimo_lead_em,
           rp.incluido_em,
           coalesce(rp.wrr_current, 0) AS corrente,
           CASE
             WHEN _mec = 'ponderado_semana' THEN public._roleta_sdr_peso_atual(e.corretor_id)
             WHEN _r.tipo = 'campanha' THEN
               CASE rp.tier WHEN 'A' THEN _r.peso_tier_a WHEN 'C' THEN _r.peso_tier_c
                            ELSE _r.peso_tier_b END
             ELSE CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END
           END AS peso,
           -- Desempate de cada motor: SDR (último lead, inclusão, id),
           -- campanha (id), v3 ponderado (último lead, id).
           row_number() OVER (
             ORDER BY CASE WHEN _r.tipo = 'campanha' THEN NULL ELSE rp.ultimo_lead_em END
                        ASC NULLS FIRST,
                      CASE WHEN _r.tipo = 'sdr' THEN rp.incluido_em END ASC,
                      e.corretor_id
           ) AS desempate
      FROM e
      JOIN public.roleta_participantes rp
        ON rp.roleta_id = _r.id AND rp.corretor_id = e.corretor_id
     WHERE e.apto
  ),
  ordem AS (
    SELECT a.corretor_id,
           row_number() OVER (
             ORDER BY a.ultimo_lead_em ASC NULLS FIRST, a.incluido_em ASC, a.corretor_id
           )::integer AS posicao
      FROM ap a
     WHERE _mec = 'rodizio'
    UNION ALL
    SELECT s.corretor_id, s.posicao
      FROM public._fila_swrr(
             ARRAY(SELECT a.corretor_id FROM ap a ORDER BY a.desempate),
             ARRAY(SELECT a.peso FROM ap a ORDER BY a.desempate),
             ARRAY(SELECT a.corrente FROM ap a ORDER BY a.desempate),
             _r.tipo <> 'campanha') s
     WHERE _mec <> 'rodizio'
  )
  SELECT e.corretor_id, e.nome, o.posicao, e.apto, e.motivos
    FROM e
    LEFT JOIN ordem o ON o.corretor_id = e.corretor_id
   ORDER BY o.posicao NULLS LAST, e.nome;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Fora da janela de horário (roleta com horário e sem "fora do horário"):
--    o lead automático espera. A fila mostra o aviso.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._roleta_fora_do_horario(_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce((
    SELECT r.horario_inicio IS NOT NULL AND r.horario_fim IS NOT NULL
           AND NOT r.permitir_fora_horario
           AND NOT CASE
                 WHEN r.horario_inicio <= r.horario_fim
                   THEN (now() AT TIME ZONE 'America/Sao_Paulo')::time
                        BETWEEN r.horario_inicio AND r.horario_fim
                 ELSE (now() AT TIME ZONE 'America/Sao_Paulo')::time >= r.horario_inicio
                      OR (now() AT TIME ZONE 'America/Sao_Paulo')::time <= r.horario_fim
               END
      FROM public.roletas r WHERE r.slug = _slug), false);
$$;

-- ---------------------------------------------------------------------------
-- 5) A tela do SDR (e da gestão): todas as roletas de uma zona, com nomes.
--    _zona NULL = lead sem zona (Marquinhos e campanhas).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roletas_filas_zona_v1(_zona text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _estrita boolean := public._zona_estrita();
  _zslug   text;
  _r       record;
  _fila    jsonb;
  _fora    jsonb;
  _n       integer;
  _reserva jsonb;
  _out     jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) OR NOT (
       public.has_role(_uid, 'sdr') OR public.has_role(_uid, 'admin')
       OR public.has_role(_uid, 'gestor') OR public.has_role(_uid, 'superintendente')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _zona IS NOT NULL THEN
    SELECT zr.roleta_slug INTO _zslug FROM public.zonas_roletas zr WHERE zr.zona = _zona;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Zona desconhecida: %', _zona USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR _r IN
    SELECT r.slug, r.nome, r.tipo, r.equipe_fixa, r.exigir_presenca,
           CASE WHEN r.tipo = 'sdr' THEN 'sdr'
                WHEN r.tipo = 'zona' THEN 'zona'
                WHEN r.slug = 'marquinhos' THEN 'marquinhos'
                ELSE 'campanha' END AS papel
      FROM public.roletas r
     WHERE r.ativo
       AND (
         (r.tipo = 'sdr' AND _zona IS NOT NULL)
         OR (r.tipo = 'zona' AND r.slug = _zslug)
         OR r.slug = 'marquinhos'
         OR (r.tipo = 'campanha' AND (_zona IS NULL OR r.equipe_fixa OR NOT _estrita))
       )
     ORDER BY CASE WHEN r.tipo = 'sdr' THEN 1 WHEN r.tipo = 'zona' THEN 2
                   WHEN r.slug = 'marquinhos' THEN 3 ELSE 4 END,
              r.nome
  LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'posicao', f.posicao, 'corretor_id', f.corretor_id, 'nome', f.nome)
             ORDER BY f.posicao) FILTER (WHERE f.apto), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object(
               'corretor_id', f.corretor_id, 'nome', f.nome, 'motivos', to_jsonb(f.motivos))
             ORDER BY f.nome) FILTER (WHERE NOT f.apto), '[]'::jsonb),
           count(*)::int
      INTO _fila, _fora, _n
      FROM public._roleta_fila_prevista(_r.slug, _zona) f;

    -- Campanha sem ninguém da equipe nesta zona: não é fila desta zona.
    CONTINUE WHEN _r.papel = 'campanha' AND _zona IS NOT NULL AND _n = 0;

    -- Visita do SDR sem ninguém do time apto na zona: vai para o time da
    -- zona pela régua do SDR (sem presença).
    _reserva := NULL;
    IF _r.papel = 'sdr' AND _zslug IS NOT NULL AND jsonb_array_length(_fila) = 0 THEN
      SELECT jsonb_build_object(
               'slug', _zslug,
               'fila', coalesce(jsonb_agg(jsonb_build_object(
                         'posicao', f.posicao, 'corretor_id', f.corretor_id, 'nome', f.nome)
                       ORDER BY f.posicao) FILTER (WHERE f.apto), '[]'::jsonb))
        INTO _reserva
        FROM public._roleta_fila_prevista(_zslug, _zona, 'sdr') f;
    END IF;

    _out := _out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'slug', _r.slug,
      'nome', _r.nome,
      'papel', _r.papel,
      'mecanica', public._roleta_fila_mecanica(_r.slug),
      'equipe_fixa', _r.equipe_fixa,
      'exige_presenca', _r.exigir_presenca AND _r.papel <> 'sdr',
      'fora_do_horario', public._roleta_fora_do_horario(_r.slug),
      'segue_zona', _r.papel = 'campanha' AND NOT _r.equipe_fixa AND _estrita AND _zona IS NOT NULL,
      'fila', _fila,
      'fora', _fora,
      'reserva', _reserva)));
  END LOOP;

  RETURN jsonb_build_object(
    'zona', _zona,
    'zona_estrita', _estrita,
    'zonas', coalesce((SELECT jsonb_agg(zr.zona ORDER BY zr.zona) FROM public.zonas_roletas zr),
                      '[]'::jsonb),
    'roletas', _out);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) A Central de Comando do corretor: a própria posição em cada roleta de
--    que participa, em cada zona que atende — sem o nome de ninguém.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minhas_posicoes_roletas_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _estrita boolean := public._zona_estrita();
  _zonas   text[];
  _r       record;
  _z       text;
  _alvos   text[];
  _total   integer;
  _achou   boolean;
  _posicao integer;
  _apto    boolean;
  _motivos jsonb;
  _out     jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(p.zonas, '{}') INTO _zonas FROM public.profiles p WHERE p.id = _uid;

  FOR _r IN
    SELECT r.slug, r.nome, r.tipo, r.equipe_fixa,
           CASE WHEN r.tipo = 'sdr' THEN 'sdr'
                WHEN r.tipo = 'zona' THEN 'zona'
                WHEN r.slug = 'marquinhos' THEN 'marquinhos'
                ELSE 'campanha' END AS papel,
           (SELECT zr.zona FROM public.zonas_roletas zr
             WHERE zr.roleta_slug = r.slug ORDER BY zr.zona LIMIT 1) AS zona_da_roleta
      FROM public.roletas r
      JOIN public.roleta_participantes rp ON rp.roleta_id = r.id AND rp.corretor_id = _uid
     WHERE r.ativo
       AND (r.tipo IN ('zona', 'sdr', 'campanha') OR r.slug = 'marquinhos')
     ORDER BY CASE WHEN r.tipo = 'zona' THEN 1 WHEN r.tipo = 'sdr' THEN 2
                   WHEN r.slug = 'marquinhos' THEN 3 ELSE 4 END,
              r.nome
  LOOP
    -- Em que filas desta roleta ele está: a da zona dela; nas outras, uma por
    -- zona que ele atende (lead sem zona, se não atende nenhuma). Campanha
    -- comum só ordena lead sem zona.
    _alvos := CASE
      WHEN _r.papel = 'zona' THEN ARRAY[_r.zona_da_roleta]
      WHEN _r.papel = 'campanha' AND NOT _r.equipe_fixa THEN ARRAY[NULL::text]
      WHEN NOT _estrita THEN ARRAY[NULL::text]
      WHEN cardinality(_zonas) > 0 THEN _zonas
      ELSE ARRAY[NULL::text]
    END;

    FOREACH _z IN ARRAY _alvos LOOP
      -- A fila do SDR só recebe visita com zona: sem zona no perfil, fora.
      IF _r.papel = 'sdr' AND _z IS NULL AND _estrita THEN
        _out := _out || jsonb_build_array(jsonb_build_object(
          'slug', _r.slug, 'nome', _r.nome, 'papel', _r.papel, 'zona', NULL,
          'mecanica', public._roleta_fila_mecanica(_r.slug),
          'posicao', NULL, 'total', 0, 'apto', false,
          'motivos', '["sem_zona_no_perfil"]'::jsonb));
        CONTINUE;
      END IF;

      SELECT count(*) FILTER (WHERE f.apto)::int,
             count(*) FILTER (WHERE f.corretor_id = _uid) > 0,
             max(f.posicao) FILTER (WHERE f.corretor_id = _uid),
             coalesce(bool_or(f.apto) FILTER (WHERE f.corretor_id = _uid), false),
             (jsonb_agg(to_jsonb(f.motivos)) FILTER (WHERE f.corretor_id = _uid)) -> 0
        INTO _total, _achou, _posicao, _apto, _motivos
        FROM public._roleta_fila_prevista(_r.slug, _z) f;

      _out := _out || jsonb_build_array(jsonb_build_object(
        'slug', _r.slug,
        'nome', _r.nome,
        'papel', _r.papel,
        'zona', _z,
        'mecanica', public._roleta_fila_mecanica(_r.slug),
        'posicao', _posicao,
        'total', _total,
        'apto', _apto,
        'motivos', CASE WHEN _achou THEN coalesce(_motivos, '[]'::jsonb)
                        ELSE '["fora_da_regiao"]'::jsonb END));
    END LOOP;
  END LOOP;

  RETURN _out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Acesso: as peças internas só para o banco; as duas portas para quem
--    está logado (cada uma confere o papel).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._fila_swrr(uuid[], integer[], integer[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fila_swrr(uuid[], integer[], integer[], boolean) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_fila_mecanica(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_fila_mecanica(text, text) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_fila_prevista(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_fila_prevista(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_fora_do_horario(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_fora_do_horario(text) TO service_role;

REVOKE ALL ON FUNCTION public.roletas_filas_zona_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roletas_filas_zona_v1(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.minhas_posicoes_roletas_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_posicoes_roletas_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.roletas_filas_zona_v1(text) IS
  'Fila prevista de cada roleta numa zona (SDR, zona, Marquinhos, campanhas), com nomes. SDR, admin, gestor e superintendente. Só leitura.';
COMMENT ON FUNCTION public.minhas_posicoes_roletas_v1() IS
  'Posição do corretor logado em cada roleta de que participa, por zona que atende. Sem nomes de colegas. Só leitura.';

NOTIFY pgrst, 'reload schema';
