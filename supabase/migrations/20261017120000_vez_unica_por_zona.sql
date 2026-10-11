-- =============================================================================
-- A vez é uma só: o mesmo corretor não é o 1º da fila em mais de uma zona
-- =============================================================================
-- Pedido do dono (11/10/2026), olhando "A vez por zona": "o mesmo corretor
-- não pode ficar em primeiro em mais de uma Zona, exemplo, Igor Nigro está em
-- primeiro na roleta Sul e Leste". Decisão: "a vez é uma só", valendo para
-- os Agendados do SDR e para as roletas de zona (Marquinhos e campanhas não).
--
-- Por que acontecia: na fila do SDR o cursor é um por corretor (ultimo_lead_em
-- em agendados-sdr), e a fila de cada zona é esse mesmo cursor filtrado por
-- quem atende a zona. Quem atende duas zonas e nunca recebeu é o 1º nas duas.
-- Nas roletas de zona o cursor é por roleta, mas um corretor em duas roletas
-- de zona também pode ser o 1º nas duas ao mesmo tempo.
--
-- A regra (a mesma conta no motor e na tela):
--   1. As zonas são olhadas da mais movimentada para a menos (leads entregues
--      na zona nos últimos 30 dias, por qualquer roleta; empate: Norte, Sul,
--      Leste, Oeste, Centro, Grande SP) — _vez_unica_zonas_ordem. O volume
--      total, e não o da família, para a ordem não virar a cada visita do
--      SDR (3 por mês com zona) — o que faria a vez de um corretor pular de
--      zona a cada lead.
--   2. Zona a zona, o 1º é o primeiro da fila do motor que ainda não é o 1º
--      de uma zona anterior — _vez_unica_cabecas. Quem já é o 1º de uma zona
--      mais movimentada sai da fila das outras enquanto a vez dele não chega
--      (na tela: "vez no Sul"; no banco: motivo vez_em_outra_zona + vez_em).
--   3. Se a regra pulasse TODO MUNDO de uma zona, a fila fica como estava:
--      a vez nunca segura o lead (vez_unica_forcada no contexto da decisão).
-- Quem é o 1º numa zona só fica com a mais movimentada porque é lá que o
-- lead chega primeiro; as outras passam a vez ao próximo. Depois que ele
-- recebe, o cursor anda e a conta refaz sozinha.
--
-- Duas famílias, cada uma só entre as próprias zonas: 'sdr' (Agendados do
-- SDR, passo 2 de _distribuir_lead_sdr) e 'zona' (roletas de zona em
-- _distribuir_lead_v3). Fora da regra: a reserva do SDR (passo 3), a
-- Marquinhos, as campanhas e lead sem zona.
--
-- Chave distribuicao_settings.vez_unica_por_zona (ausente = ligada): false
-- volta ao comportamento anterior, no motor e na tela.
--
-- Idempotente. Espelhada em drizzle/migrations/0078.
-- =============================================================================

INSERT INTO public.distribuicao_settings (chave, valor, descricao)
VALUES ('vez_unica_por_zona', 'true'::jsonb,
        'A vez é uma só: quem é o 1º da fila de uma zona não é o 1º de outra '
        || '(Agendados do SDR e roletas de zona). false = cada zona com a própria '
        || 'fila, mesmo repetindo o 1º.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public._vez_unica_ativa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((public.get_dist_setting('vez_unica_por_zona') #>> '{}')::boolean, true);
$$;

-- ---------------------------------------------------------------------------
-- 1) A ordem em que as zonas são olhadas: da mais movimentada para a menos
--    (leads entregues na zona nos últimos 30 dias, pelo contexto da decisão,
--    qualquer roleta). Empate: a ordem canônica das zonas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vez_unica_zonas_ordem()
RETURNS TABLE(zona text, roleta_slug text, ordem integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH n AS (
    SELECT c.contexto ->> 'zona' AS zona, count(*)::int AS leads
      FROM public.distribution_log dl
      JOIN public.distribuicao_log_contexto c ON c.log_id = dl.id
     WHERE dl.created_at > now() - interval '30 days'
       AND dl.resultado = 'sucesso'
       AND c.contexto ? 'zona'
     GROUP BY 1
  )
  SELECT zr.zona,
         zr.roleta_slug,
         row_number() OVER (
           ORDER BY coalesce(n.leads, 0) DESC,
                    coalesce(array_position(public._zonas_canonicas(), zr.zona), 99),
                    zr.zona)::int AS ordem
    FROM public.zonas_roletas zr
    LEFT JOIN n ON n.zona = zr.zona;
$$;

-- ---------------------------------------------------------------------------
-- 2) A fila prevista de uma roleta numa zona (mesmo corpo de 20261015120000)
--    + a vez única: recebe as cabeças já decididas (_cabecas, de
--    _vez_unica_cabecas; NULL = calcula) e tira da fila quem é o 1º de uma
--    zona anterior. Coluna nova vez_em: em que zona está a vez de quem saiu.
--    A assinatura muda (4º parâmetro, coluna nova): DROP + CREATE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._roleta_fila_prevista(text, text, text);

CREATE OR REPLACE FUNCTION public._roleta_fila_prevista(
  _slug text, _zona text DEFAULT NULL, _regua text DEFAULT NULL, _cabecas jsonb DEFAULT NULL)
RETURNS TABLE(corretor_id uuid, nome text, posicao integer, apto boolean, motivos text[], vez_em text)
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
  -- [VEZ ÚNICA]
  _familia text;
  _aptos   uuid[] := ARRAY[]::uuid[];
  _tomados uuid[] := ARRAY[]::uuid[];
  _vez     jsonb := '{}'::jsonb;
  _ordem   integer;
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

  -- [VEZ ÚNICA] Só nas duas famílias da regra, com zona estrita e zona.
  IF _estrita AND _zona IS NOT NULL AND public._vez_unica_ativa() THEN
    _familia := CASE WHEN _r.tipo = 'sdr' AND (_regua IS NULL OR _regua = 'sdr') THEN 'sdr'
                     WHEN _r.tipo = 'zona' AND _regua IS NULL THEN 'zona' END;
  END IF;
  IF _familia IS NOT NULL THEN
    IF _cabecas IS NULL THEN
      _cabecas := public._vez_unica_cabecas_json(_familia, _zona);
    END IF;
    -- Os aptos desta fila (depois do filtro de zona).
    SELECT coalesce(array_agg(x.corretor_id), ARRAY[]::uuid[]) INTO _aptos
      FROM jsonb_to_recordset(coalesce(_elig, '[]'::jsonb)) AS x(corretor_id uuid, apto boolean)
     WHERE x.apto AND _r.ativo AND public.corretor_atende_zona(x.corretor_id, _zona);
    -- A posição desta zona na ordem (ausente = todas as cabeças são anteriores).
    SELECT c.ordem INTO _ordem
      FROM jsonb_to_recordset(_cabecas) AS c(zona text, ordem integer)
     WHERE c.zona = _zona
     LIMIT 1;
    -- Quem já é o 1º de uma zona anterior, e qual (a primeira em que é).
    SELECT coalesce(array_agg(t.cid), ARRAY[]::uuid[]),
           coalesce(jsonb_object_agg(t.cid::text, t.zona), '{}'::jsonb)
      INTO _tomados, _vez
      FROM (
        SELECT DISTINCT ON (c.corretor_id) c.corretor_id AS cid, c.zona
          FROM jsonb_to_recordset(_cabecas) AS c(zona text, ordem integer, corretor_id uuid)
         WHERE c.corretor_id IS NOT NULL
           AND c.corretor_id = ANY(_aptos)
           AND c.ordem < coalesce(_ordem, 2147483647)
         ORDER BY c.corretor_id, c.ordem
      ) t;
    -- A regra pularia todo mundo: a fila fica como está (o motor idem).
    IF cardinality(_tomados) > 0
       AND NOT EXISTS (SELECT 1 FROM unnest(_aptos) a WHERE NOT (a = ANY(_tomados))) THEN
      _tomados := ARRAY[]::uuid[];
      _vez := '{}'::jsonb;
    END IF;
  END IF;

  RETURN QUERY
  WITH e AS (
    SELECT x.corretor_id,
           x.nome,
           x.apto AND _r.ativo AND NOT (x.corretor_id = ANY(_tomados)) AS apto,
           coalesce(x.motivos, '{}')
             || CASE WHEN _r.ativo THEN '{}'::text[] ELSE ARRAY['roleta_desativada'] END
             || CASE WHEN x.corretor_id = ANY(_tomados) THEN ARRAY['vez_em_outra_zona']
                     ELSE '{}'::text[] END AS motivos,
           CASE WHEN x.corretor_id = ANY(_tomados) THEN _vez ->> x.corretor_id::text END AS vez_em
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
  SELECT e.corretor_id, e.nome, o.posicao, e.apto, e.motivos, e.vez_em
    FROM e
    LEFT JOIN ordem o ON o.corretor_id = e.corretor_id
   ORDER BY o.posicao NULLS LAST, e.nome;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) As cabeças: zona a zona, na ordem, o 1º da fila de quem ainda não é o
--    1º de uma zona anterior (a fila já vem sem eles: _roleta_fila_prevista
--    recebe as cabeças decididas até ali). _ate_zona: para ANTES dessa zona —
--    o motor só precisa das zonas anteriores à do lead. forcado: a regra
--    pularia todo mundo e o 1º é alguém que já é o 1º de outra zona.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vez_unica_cabecas(_familia text, _ate_zona text DEFAULT NULL)
RETURNS TABLE(zona text, ordem integer, corretor_id uuid, forcado boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  _z       record;
  _cab     jsonb := '[]'::jsonb;
  _slug    text;
  _cabeca  uuid;
  _forcado boolean;
BEGIN
  IF _familia NOT IN ('sdr', 'zona') THEN
    RETURN;
  END IF;
  -- Zona sem roleta (não deveria chegar aqui): nenhuma cabeça vale contra ela.
  IF _ate_zona IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.zonas_roletas zr WHERE zr.zona = _ate_zona) THEN
    RETURN;
  END IF;

  FOR _z IN
    SELECT o.zona, o.roleta_slug, o.ordem
      FROM public._vez_unica_zonas_ordem() o
     ORDER BY o.ordem
  LOOP
    EXIT WHEN _ate_zona IS NOT NULL AND _z.zona = _ate_zona;
    _slug := CASE WHEN _familia = 'sdr' THEN 'agendados-sdr' ELSE _z.roleta_slug END;
    _cabeca := NULL;
    SELECT f.corretor_id INTO _cabeca
      FROM public._roleta_fila_prevista(_slug, _z.zona, NULL, _cab) f
     WHERE f.posicao = 1;
    _forcado := _cabeca IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_to_recordset(_cab) AS c(corretor_id uuid)
       WHERE c.corretor_id = _cabeca);
    _cab := _cab || jsonb_build_array(jsonb_build_object(
      'zona', _z.zona, 'ordem', _z.ordem, 'corretor_id', _cabeca, 'forcado', _forcado));
    zona := _z.zona;
    ordem := _z.ordem;
    corretor_id := _cabeca;
    forcado := _forcado;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._vez_unica_cabecas_json(_familia text, _ate_zona text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'zona', c.zona, 'ordem', c.ordem, 'corretor_id', c.corretor_id, 'forcado', c.forcado)
           ORDER BY c.ordem), '[]'::jsonb)
    FROM public._vez_unica_cabecas(_familia, _ate_zona) c;
$$;

-- ---------------------------------------------------------------------------
-- 4) Para o motor: quem já é o 1º de uma zona anterior à do lead (e qual).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vez_unica_tomados(_familia text, _zona text)
RETURNS TABLE(corretor_id uuid, vez_em text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT ON (c.corretor_id) c.corretor_id, c.zona
    FROM public._vez_unica_cabecas(_familia, _zona) c
   WHERE c.corretor_id IS NOT NULL
   ORDER BY c.corretor_id, c.ordem;
$$;

-- ---------------------------------------------------------------------------
-- 5) Os motores. Mesmo corpo de 20261014120000 (_distribuir_lead_sdr) e de
--    20261012120000 (_distribuir_lead_v3) + o bloco [VEZ ÚNICA] antes da
--    escolha (e três chaves no contexto da decisão: vez_unica,
--    vez_em_outra_zona, vez_unica_forcada).
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
  -- [ORIGEM]
  _origem uuid;
  -- [VEZ ÚNICA] (0078) A vez é uma só: quem já é o 1º da fila de uma zona
  -- mais movimentada não é o 1º desta. _vez_fora: quem saiu dos candidatos
  -- por isso (e em que zona está a vez dele); _vez_forcada: a regra pularia
  -- todo mundo, então a fila ficou como estava.
  _vez_unica boolean := false;
  _vez_fora_ids uuid[] := ARRAY[]::uuid[];
  _vez_fora jsonb := '[]'::jsonb;
  _vez_forcada boolean := false;
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
  --    [ORIGEM] (10/10/2026) Lead que o SDR PUXOU de um corretor que tinha
  --    falado com o cliente nos últimos dias (sdr_corretor_origem_id, gravado
  --    por criar_lead_dedup) volta para esse corretor na entrega, com as
  --    mesmas guardas — conta ativa, papel corretor, região e agenda livre.
  _origem := COALESCE(_lead.corretor_id, _lead.sdr_corretor_origem_id);
  IF _origem IS NOT NULL AND _lead.sdr_entregue_em IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _origem AND p.ativo AND p.status_conta = 'ativa'::public.status_conta
    ) THEN
      _prioridade_recusa := 'corretor_inativo';
    ELSIF NOT public.has_role(_origem, 'corretor'::public.app_role) THEN
      _prioridade_recusa := 'corretor_sem_papel';
    ELSIF _estrita AND NOT public.corretor_atende_zona(_origem, _zona) THEN
      -- [ZONA] O dono antigo é de outra região: a visita vai para a zona.
      _prioridade_recusa := 'fora_da_regiao';
    ELSIF public._sdr_agenda_conflita(_origem, _inicio, _fim) THEN
      _prioridade_recusa := 'conflito_agenda';
    ELSE
      _vencedor := _origem;
      _regra := CASE WHEN _lead.corretor_id IS NOT NULL THEN 'sdr_prioridade_corretor_original'
                     ELSE 'sdr_retorno_corretor_origem' END;
      _tipo := 'manual'::public.distribuicao_tipo;
    END IF;
  END IF;

  -- 2) Roleta de agendados: rodízio simples entre aptos, pulando quem já
  --    tentou (salvo se isso esvaziar a fila) e quem tem conflito de agenda.
  --    [VEZ ÚNICA] (0078) e quem já é o 1º de uma zona mais movimentada.
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

      -- [VEZ ÚNICA] (0078) Quem já é o 1º da fila de uma zona mais
      -- movimentada (_vez_unica_tomados: a mesma conta da tela) sai dos
      -- candidatos desta zona. Se isso esvaziasse a fila, ela fica como está:
      -- a vez nunca segura o lead.
      IF _estrita AND _zona IS NOT NULL AND public._vez_unica_ativa()
         AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
        _vez_unica := true;
        SELECT COALESCE(array_agg(t.corretor_id), ARRAY[]::uuid[]),
               COALESCE(jsonb_agg(jsonb_build_object(
                 'corretor_id', t.corretor_id, 'vez_em', t.vez_em)), '[]'::jsonb)
          INTO _vez_fora_ids, _vez_fora
          FROM public._vez_unica_tomados('sdr', _zona) t
         WHERE t.corretor_id = ANY(_aptos_ids);
        IF COALESCE(array_length(_vez_fora_ids, 1), 0) > 0 THEN
          IF EXISTS (SELECT 1 FROM unnest(_aptos_ids) x WHERE NOT (x = ANY(_vez_fora_ids))) THEN
            _aptos_ids := ARRAY(SELECT x FROM unnest(_aptos_ids) x
                                 WHERE NOT (x = ANY(_vez_fora_ids)));
          ELSE
            _vez_forcada := true;
          END IF;
        END IF;
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
    'corretor_origem', _lead.sdr_corretor_origem_id,
    'inicio', _inicio,
    'fim', _fim,
    'zona', _zona,
    'zona_estrita', _estrita,
    'roleta_usada', _slug_usado,
    'rodizio_ponderado', _ponderado,
    'vez_unica', _vez_unica,
    'vez_em_outra_zona', _vez_fora,
    'vez_unica_forcada', _vez_forcada
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
         -- [ORIGEM] Usada uma vez: numa devolução (no-show, 7 dias parado) o
         -- próximo agendamento segue a régua normal.
         sdr_corretor_origem_id = NULL,
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

CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(_lead_id uuid, _tipo distribuicao_tipo DEFAULT 'automatica'::distribuicao_tipo, _roleta_slug text DEFAULT NULL::text, _corretor_id uuid DEFAULT NULL::uuid, _distribuido_por uuid DEFAULT NULL::uuid, _gatilho text DEFAULT 'manual'::text, _contexto_extra jsonb DEFAULT '{}'::jsonb, _registrar_excecao boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead record;
  _r record;
  _slug text;
  _regra text;
  _vencedor uuid;
  _vencedor_nome text;
  _vencedor_zonas text[];
  _tentaram uuid[];
  _aptos_ids uuid[];
  _aptos_json jsonb;
  _inaptos_json jsonb;
  _n_ativos int;
  _agora_brt time;
  _dentro_horario boolean;
  _contexto jsonb;
  _log_id uuid;
  _motivo_falha text;
  _motivo_log text;
  _excecao_id uuid;
  _zona text;
  _aptos_zona uuid[];
  _zona_fallback boolean := false;
  _divergencia_zona boolean := false;
  _roleta_tipo text;
  _origem_fallback text;
  -- [V2]
  _v2 boolean := public._modelo_v2_ativo();
  _sombra boolean := COALESCE((public.get_dist_setting('modelo_v2_sombra') #>> '{}')::boolean, false);
  _classe text;
  _inaptos_v2 jsonb := '[]'::jsonb;
  _sum_pesos int;
  _faixa_vencedor text;
  _sombra_vencedor uuid;
  _sombra_faixa text;
  -- [ZONA]
  _estrita boolean := public._zona_estrita();
  _zslug_lead text;
  _roleta_pedida text;
  _fora_regiao jsonb := '[]'::jsonb;
  _motivo_fora text;
  -- [MARQUINHOS] _marquinhos_na_zona: esta chamada tenta a Roleta
  -- Marquinhos filtrada pela zona. _marquinhos_desvio: chamada de volta para
  -- o time da zona porque ninguém da Marquinhos estava apto ali.
  _marquinhos_na_zona boolean := false;
  _marquinhos_desvio boolean :=
    COALESCE((_contexto_extra->>'marquinhos_sem_apto_na_zona')::boolean, false);
  _marquinhos_fora_horario boolean := false;
  -- [VEZ ÚNICA] (0078) A vez é uma só: quem já é o 1º da fila de uma zona
  -- mais movimentada não é o 1º desta. _vez_fora: quem saiu dos candidatos
  -- por isso (e em que zona está a vez dele); _vez_forcada: a regra pularia
  -- todo mundo, então a fila ficou como estava.
  _vez_unica boolean := false;
  _vez_fora_ids uuid[] := ARRAY[]::uuid[];
  _vez_fora jsonb := '[]'::jsonb;
  _vez_forcada boolean := false;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  END IF;

  -- Lead na lixeira/excluído NUNCA é distribuído; exceção aberta (se houver)
  -- é arquivada para não assombrar a fila.
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'arquivada', resolvida_em = now(),
           resolvida_por = COALESCE(_distribuido_por, auth.uid()),
           resolucao = 'Lead está na lixeira — distribuição bloqueada'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_na_lixeira');
  END IF;

  -- Idempotência: distribuição automática nunca rouba lead já atribuído.
  -- Fecha exceção aberta órfã — senão "Reprocessar" vira beco sem saída.
  IF _lead.corretor_id IS NOT NULL AND _tipo = 'automatica' AND _corretor_id IS NULL THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'resolvida', resolvida_em = now(),
           resolvida_por = COALESCE(_distribuido_por, auth.uid()),
           resolucao = 'Lead já estava atribuído'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', true, 'ja_atribuido', true, 'corretor_id', _lead.corretor_id);
  END IF;

  _tentaram := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
  _zona := public.zona_do_lead(_lead_id);
  _classe := COALESCE(_lead.classe_lead, 'quente');
  IF _zona IS NOT NULL THEN
    SELECT zr.roleta_slug INTO _zslug_lead FROM public.zonas_roletas zr WHERE zr.zona = _zona;
  END IF;

  -- Resolução da roleta. [V2] Lead de BASE vai direto para a esteira 'base'.
  -- [ZONA] Lead COM zona vai para a roleta da zona dele — sempre: pronta ou
  -- não, e por cima de slug explícito (token de zona, pino antigo, roleta
  -- escolhida na exceção, campanha delegada), que fica registrado como
  -- roleta_pedida. Sem ninguém da zona apto, o lead espera — nunca troca de
  -- zona. Lead SEM zona segue a precedência de sempre: slug explícito;
  -- triagem por canal/origem com fallback de prontidão do Plantão.
  -- [MARQUINHOS] Exceção: lead do Marquinhos com zona tenta antes quem da
  -- Roleta Marquinhos atende a zona (o filtro de região abaixo faz o corte);
  -- sem ninguém apto ali, volta para o time da zona (ver "sem vencedor").
  IF _v2 AND _corretor_id IS NULL AND _roleta_slug IS NULL AND _classe = 'base' THEN
    _slug := 'base';
  ELSIF _estrita AND _zona IS NOT NULL AND _corretor_id IS NULL THEN
    IF _roleta_slug = 'base' THEN
      _slug := 'base';
    ELSIF NOT _marquinhos_desvio
          AND COALESCE((public.get_dist_setting('marquinhos_antes_da_zona') #>> '{}')::boolean, true)
          AND public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem) = 'marquinhos'
          AND EXISTS (SELECT 1 FROM public.roletas WHERE slug = 'marquinhos' AND ativo) THEN
      _slug := 'marquinhos';
      _marquinhos_na_zona := true;
    ELSE
      _slug := _zslug_lead;
      IF _roleta_slug IS DISTINCT FROM _zslug_lead THEN
        _roleta_pedida := _roleta_slug;
      END IF;
    END IF;
  ELSE
    _slug := COALESCE(_roleta_slug, public.roleta_da_zona(_zona));
    IF _slug IS NULL THEN
      _slug := public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem);
      IF _slug IS NOT NULL AND _slug <> 'plantao'
         AND NOT public._roleta_pronta(_slug)
         AND public._roleta_pronta('plantao') THEN
        _origem_fallback := _slug;
        _slug := 'plantao';
      END IF;
    END IF;
  END IF;

  -- [V2] Devolução por SLA: o estouro do dono anterior conta (uma vez por
  -- lead) e alimenta a pausa automática — mesmo se este repasse falhar.
  IF _v2 AND (_contexto_extra ? 'corretor_anterior_sla') THEN
    PERFORM public._registrar_estouro_sla(
      NULLIF(_contexto_extra->>'corretor_anterior_sla','')::uuid, _lead_id, _slug);
  END IF;

  -- ------------------------- atribuição manual direta ----------------------
  IF _corretor_id IS NOT NULL THEN
    SELECT p.nome, p.zonas INTO _vencedor_nome, _vencedor_zonas
    FROM public.profiles p
    WHERE p.id = _corretor_id AND p.ativo = true;
    IF _vencedor_nome IS NULL THEN
      RAISE EXCEPTION 'corretor destino inexistente ou inativo';
    END IF;
    _vencedor := _corretor_id;
    _regra := 'manual_direta';
    _aptos_json := '[]'::jsonb;
    _inaptos_json := '[]'::jsonb;
    IF _estrita THEN
      -- [ZONA] Fora da região só como EXCEÇÃO DA GESTÃO: pedida
      -- explicitamente (forcar_fora_da_zona) e com motivo escrito.
      IF _zona IS NOT NULL
         AND public.has_role(_corretor_id, 'corretor'::public.app_role)
         AND NOT public.corretor_atende_zona(_corretor_id, _zona) THEN
        _motivo_fora := NULLIF(btrim(COALESCE(_contexto_extra->>'motivo_fora_da_zona', '')), '');
        IF COALESCE(_contexto_extra->>'forcar_fora_da_zona', 'false') <> 'true'
           OR char_length(COALESCE(_motivo_fora, '')) < 5 THEN
          RAISE EXCEPTION USING
            ERRCODE = 'SMQZ1',
            MESSAGE = public._msg_fora_da_regiao(_zona, _corretor_id);
        END IF;
        _divergencia_zona := true;
      END IF;
    ELSIF _zona IS NOT NULL AND COALESCE(array_length(_vencedor_zonas, 1), 0) > 0
       AND NOT (_zona = ANY(_vencedor_zonas)) THEN
      -- Comportamento anterior (zona_estrita=false): só avisa.
      _divergencia_zona := true;
    END IF;
  ELSE
    -- ----------------------- caminho da roleta -----------------------------
    IF _slug IS NULL THEN
      IF _estrita AND _zona IS NOT NULL THEN
        _motivo_falha := 'zona_sem_roleta';
        _motivo_log := public._rotulo_zona(_zona) || ' sem roleta vinculada (zonas_roletas) — lead na fila de exceções';
      ELSE
        _motivo_falha := 'origem_nao_mapeada';
        _motivo_log := 'Origem sem roleta vinculada — lead na fila de exceções';
      END IF;
      _contexto := jsonb_build_object(
        'roleta', NULL, 'gatilho', _gatilho, 'origem', _lead.origem::text,
        'canal_entrada', _lead.canal_entrada, 'zona', _zona, 'zona_estrita', _estrita
      ) || COALESCE(_contexto_extra, '{}'::jsonb);
      IF _registrar_excecao THEN
        _excecao_id := public._registrar_excecao_distribuicao(
          _lead_id, _motivo_falha,
          CASE WHEN _motivo_falha = 'zona_sem_roleta' THEN _motivo_log
               ELSE 'Origem "' || _lead.origem::text || '" sem roleta vinculada' END,
          NULL, _contexto);
      END IF;
      INSERT INTO public.distribution_log
        (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
      VALUES
        (_lead_id, NULL, _tipo, _motivo_log, _distribuido_por, NULL, 'triagem', 'excecao')
      RETURNING id INTO _log_id;
      INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);
      RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha);
    END IF;

    SELECT * INTO _r FROM public.roletas WHERE slug = _slug;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'roleta % inexistente', _slug;
    END IF;
    _roleta_tipo := _r.tipo;

    -- Janela de funcionamento (BRT). Fora da janela sem permissão: o lead
    -- espera o cron — sem exceção e sem log (evita 1 registro por minuto).
    IF _r.horario_inicio IS NOT NULL AND _r.horario_fim IS NOT NULL THEN
      _agora_brt := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
      IF _r.horario_inicio <= _r.horario_fim THEN
        _dentro_horario := _agora_brt BETWEEN _r.horario_inicio AND _r.horario_fim;
      ELSE
        _dentro_horario := (_agora_brt >= _r.horario_inicio OR _agora_brt <= _r.horario_fim);
      END IF;
      IF NOT _dentro_horario AND NOT _r.permitir_fora_horario
         AND _tipo IN ('automatica','redistribuicao') AND auth.uid() IS NULL THEN
        -- [MARQUINHOS] Marquinhos fora da janela não segura o lead: ninguém
        -- dela recebe agora, e o lead segue para o time da zona.
        IF NOT _marquinhos_na_zona THEN
          RETURN jsonb_build_object('ok', false, 'adiado', true, 'motivo', 'fora_do_horario', 'roleta', _slug);
        END IF;
        _marquinhos_fora_horario := true;
      END IF;
    END IF;

    -- Snapshot de elegibilidade (fonte única) — vira contexto auditável.
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
          'corretor_id', e.corretor_id, 'nome', e.nome,
          'ultimo_lead_em', e.ultimo_lead_em)
        ORDER BY e.ultimo_lead_em ASC NULLS FIRST)
        FILTER (WHERE e.apto), '[]'::jsonb),
      COALESCE(jsonb_agg(jsonb_build_object(
          'corretor_id', e.corretor_id, 'nome', e.nome,
          'motivos', to_jsonb(e.motivos), 'pct_trabalhado', e.pct_trabalhado,
          'recebidos_hoje', e.recebidos_hoje, 'limite_diario', e.limite_diario)
        ORDER BY e.nome)
        FILTER (WHERE NOT e.apto), '[]'::jsonb),
      COALESCE(array_agg(e.corretor_id) FILTER (WHERE e.apto), ARRAY[]::uuid[]),
      count(*) FILTER (WHERE e.participante_ativo AND NOT e.pausado)
    INTO _aptos_json, _inaptos_json, _aptos_ids, _n_ativos
    FROM public._elegibilidade_roleta(_slug) e;

    IF NOT _r.ativo THEN
      _aptos_ids := ARRAY[]::uuid[];
      _n_ativos := 0;
    END IF;
    IF _marquinhos_fora_horario THEN
      _aptos_ids := ARRAY[]::uuid[];
    END IF;

    -- Exclui quem já teve o lead (redistribuição nunca devolve ao mesmo).
    _aptos_ids := ARRAY(SELECT unnest(_aptos_ids) EXCEPT SELECT unnest(_tentaram));

    -- [V2] Régua extra de elegibilidade: onboarding concluído, vínculo
    -- (fixo/autônomo) definido e WIP abaixo do disjuntor. Quem cai aqui fica
    -- auditado em 'inaptos_v2' no contexto da decisão.
    IF _v2 AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
      SELECT
        COALESCE(array_agg(x.corretor_id) FILTER (WHERE x.apto), ARRAY[]::uuid[]),
        COALESCE(jsonb_agg(jsonb_build_object(
            'corretor_id', x.corretor_id, 'motivos', to_jsonb(x.motivos)))
          FILTER (WHERE NOT x.apto), '[]'::jsonb)
      INTO _aptos_ids, _inaptos_v2
      FROM (
        SELECT u.corretor_id, e.apto, e.motivos
        FROM unnest(_aptos_ids) AS u(corretor_id)
        CROSS JOIN LATERAL public._apto_extra_v2(u.corretor_id) e
      ) x;
    END IF;

    IF _estrita THEN
      -- [ZONA] Filtro de região SEM fallback, em qualquer roleta (na roleta
      -- da zona é redundante; na base e nas de origem é o que segura o lead
      -- dentro da zona). Quem foi cortado fica auditado em 'fora_da_regiao'.
      IF _zona IS NOT NULL AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
        SELECT
          COALESCE(array_agg(u) FILTER (WHERE public.corretor_atende_zona(u, _zona)), ARRAY[]::uuid[]),
          COALESCE(jsonb_agg(u) FILTER (WHERE NOT public.corretor_atende_zona(u, _zona)), '[]'::jsonb)
        INTO _aptos_zona, _fora_regiao
        FROM unnest(_aptos_ids) AS u;
        _aptos_ids := _aptos_zona;
      END IF;
    ELSIF _zona IS NOT NULL AND COALESCE(_roleta_tipo, '') <> 'zona'
       AND array_length(_aptos_ids, 1) > 0 THEN
      -- Comportamento anterior (zona_estrita=false): filtro por
      -- profiles.zonas com fallback para qualquer apto.
      _aptos_zona := ARRAY(
        SELECT p.id FROM public.profiles p
         WHERE p.id = ANY(_aptos_ids)
           AND (COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas))
      );
      IF COALESCE(array_length(_aptos_zona, 1), 0) > 0 THEN
        _aptos_ids := _aptos_zona;
      ELSE
        _zona_fallback := true;
      END IF;
    END IF;

    -- [VEZ ÚNICA] (0078) Só nas roletas de zona: quem já é o 1º da fila de
    -- uma zona mais movimentada (_vez_unica_tomados: a mesma conta da tela)
    -- sai dos candidatos desta. Se isso esvaziasse a fila, ela fica como
    -- está: a vez nunca segura o lead.
    IF _estrita AND _zona IS NOT NULL AND _roleta_tipo = 'zona'
       AND public._vez_unica_ativa()
       AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
      _vez_unica := true;
      SELECT COALESCE(array_agg(t.corretor_id), ARRAY[]::uuid[]),
             COALESCE(jsonb_agg(jsonb_build_object(
               'corretor_id', t.corretor_id, 'vez_em', t.vez_em)), '[]'::jsonb)
        INTO _vez_fora_ids, _vez_fora
        FROM public._vez_unica_tomados('zona', _zona) t
       WHERE t.corretor_id = ANY(_aptos_ids);
      IF COALESCE(array_length(_vez_fora_ids, 1), 0) > 0 THEN
        IF EXISTS (SELECT 1 FROM unnest(_aptos_ids) x WHERE NOT (x = ANY(_vez_fora_ids))) THEN
          _aptos_ids := ARRAY(SELECT x FROM unnest(_aptos_ids) x
                               WHERE NOT (x = ANY(_vez_fora_ids)));
        ELSE
          _vez_forcada := true;
        END IF;
      END IF;
    END IF;

    IF _v2 AND _classe = 'quente' AND _slug <> 'base' THEN
      -- [V2] QUENTE: smooth weighted round-robin por faixa de velocidade
      -- (tier A/B/C = peso 3/2/1). Advisory lock serializa o cursor SWRR;
      -- desempate: cursor maior, depois há mais tempo sem receber, depois id.
      PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _r.id::text));

      SELECT sum(CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END)
        INTO _sum_pesos
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids);

      IF COALESCE(_sum_pesos, 0) > 0 THEN
        UPDATE public.roleta_participantes rp
           SET wrr_current = rp.wrr_current
               + CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END
         WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids);

        SELECT rp.corretor_id, p.nome, rp.tier
          INTO _vencedor, _vencedor_nome, _faixa_vencedor
        FROM public.roleta_participantes rp
        JOIN public.profiles p ON p.id = rp.corretor_id
        WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids)
        ORDER BY rp.wrr_current DESC, rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC
        LIMIT 1;

        UPDATE public.roleta_participantes
           SET wrr_current = wrr_current - _sum_pesos
         WHERE roleta_id = _r.id AND corretor_id = _vencedor;
      END IF;

      _regra := 'ponderado_velocidade' ||
                COALESCE(':faixa' || _faixa_vencedor, '');
    ELSE
      -- Rodízio por cursor: apto há mais tempo sem receber NESTA roleta,
      -- com lock no cursor para concorrência entre webhook/cron/manual.
      -- [V2] É também a mecânica da esteira BASE (rodízio puro, o piso).
      SELECT rp.corretor_id, p.nome INTO _vencedor, _vencedor_nome
      FROM public.roleta_participantes rp
      JOIN public.profiles p ON p.id = rp.corretor_id
      WHERE rp.roleta_id = _r.id
        AND rp.corretor_id = ANY(_aptos_ids)
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      FOR UPDATE OF rp SKIP LOCKED
      LIMIT 1;

      _regra := CASE WHEN _v2 THEN 'rodizio_base' ELSE 'rodizio_menos_recente' END;
    END IF;
  END IF;

  _contexto := jsonb_build_object(
    'roleta', _slug,
    'roleta_tipo', _roleta_tipo,
    'gatilho', _gatilho,
    'regra', _regra,
    'percentual_minimo', (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric,
    'aptos', COALESCE(_aptos_json, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
    'excluidos_por_tentativa', to_jsonb(_tentaram),
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'divergencia_zona', _divergencia_zona,
    'origem_fallback', _origem_fallback,
    'modelo_v2', _v2,
    'classe_lead', _classe,
    'inaptos_v2', _inaptos_v2,
    'faixa_vencedor', _faixa_vencedor,
    'zona_estrita', _estrita,
    'roleta_pedida', _roleta_pedida,
    'fora_da_regiao', _fora_regiao,
    'motivo_fora_da_zona', _motivo_fora,
    'marquinhos_na_zona', _marquinhos_na_zona,
    'vez_unica', _vez_unica,
    'vez_em_outra_zona', _vez_fora,
    'vez_unica_forcada', _vez_forcada
  ) || COALESCE(_contexto_extra, '{}'::jsonb);

  -- --------------------------- sem vencedor --------------------------------
  IF _vencedor IS NULL THEN
    IF _marquinhos_na_zona THEN
      -- [MARQUINHOS] Ninguém da Marquinhos apto na zona do lead: time da zona,
      -- nesta mesma transação (sem exceção nem log da tentativa — o que a
      -- Marquinhos tinha fica no contexto da decisão da zona). A chave
      -- marquinhos_sem_apto_na_zona impede a volta para a Marquinhos.
      RETURN public._distribuir_lead_v3(
        _lead_id, _tipo, _zslug_lead, NULL, _distribuido_por, _gatilho,
        COALESCE(_contexto_extra, '{}'::jsonb) || jsonb_build_object(
          'marquinhos_sem_apto_na_zona', true,
          'roleta_pedida', 'marquinhos',
          'marquinhos_fora_do_horario', _marquinhos_fora_horario,
          'marquinhos_inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
          'marquinhos_fora_da_regiao', _fora_regiao),
        _registrar_excecao);
    END IF;

    IF _estrita AND _zona IS NOT NULL AND _roleta_tipo = 'zona' AND COALESCE(_n_ativos, 0) = 0 THEN
      -- [ZONA] Time da zona não montado (ou roleta desligada): o lead ESPERA
      -- aqui (alerta à gestão) — desligar a roleta não manda o lead para
      -- outra zona.
      _motivo_falha := 'zona_sem_time';
      _motivo_log := public._rotulo_zona(_zona) || CASE
                       WHEN NOT _r.ativo THEN ' com a roleta ' || _slug || ' desativada'
                       ELSE ' sem time montado (roleta ' || _slug || ' sem participante ativo)' END
                     || ' — o lead espera o time da zona; ajuste na Central de Distribuição';
    ELSIF _estrita AND _zona IS NOT NULL THEN
      -- [ZONA] Ninguém da zona apto agora: espera — não vai para outra zona.
      _motivo_falha := 'sem_corretor_na_zona';
      _motivo_log := 'Ninguém da ' || public._rotulo_zona(_zona) || ' apto agora (roleta ' || _slug
                     || ': ausência, cota, pausa ou já teve o lead) — o lead espera o time da zona';
    ELSIF COALESCE(_n_ativos, 0) = 0 THEN
      _motivo_falha := 'sem_corretor_ativo';
      _motivo_log := 'Roleta ' || _slug || ' sem participante ativo — lead na fila de exceções';
    ELSE
      _motivo_falha := 'sem_corretor_elegivel';
      _motivo_log := 'Roleta ' || _slug || ' sem corretor apto no momento — lead na fila de exceções';
    END IF;
    IF _marquinhos_desvio THEN
      _motivo_log := _motivo_log || ' (a Roleta Marquinhos também não tinha ninguém apto na zona)';
    END IF;

    IF _registrar_excecao THEN
      _excecao_id := public._registrar_excecao_distribuicao(
        _lead_id, _motivo_falha, _motivo_log, _slug, _contexto);
    END IF;

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead_id, NULL, _tipo, _motivo_log, _distribuido_por, _slug, _regra, 'sem_corretor')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

    RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha,
                              'roleta', _slug, 'zona', _zona);
  END IF;

  -- ----------------------------- vencedor ----------------------------------
  _contexto := _contexto || jsonb_build_object(
    'vencedor', jsonb_build_object('corretor_id', _vencedor, 'nome', _vencedor_nome));

  -- [ZONA] Exceção da gestão (manual forçada com motivo): a guarda de
  -- leads.corretor_id é avisada só durante este UPDATE.
  IF _estrita AND _divergencia_zona THEN
    PERFORM set_config('app.zona_override', 'on', true);
  END IF;

  UPDATE public.leads
     SET corretor_anterior_id = CASE
           WHEN corretor_id IS NOT NULL AND corretor_id <> _vencedor THEN corretor_id
           ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
         -- Memória da roleta de ZONA — repasse por SLA fica no mesmo time
         -- da zona (o pino de campanha continua intocado).
         roleta_slug = CASE WHEN _roleta_tipo = 'zona' THEN _slug ELSE roleta_slug END,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(_tentaram) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor) END
   WHERE id = _lead_id;

  IF _estrita AND _divergencia_zona THEN
    PERFORM set_config('app.zona_override', 'off', true);
  END IF;

  -- Cursor único da roleta (se o corretor participa dela).
  IF _slug IS NOT NULL THEN
    UPDATE public.roleta_participantes rp
       SET ultimo_lead_em = now()
      FROM public.roletas r
     WHERE r.id = rp.roleta_id AND r.slug = _slug AND rp.corretor_id = _vencedor;
  END IF;

  -- Cursor global informativo (integrações externas). Os contadores legados
  -- de fila_distribuicao NÃO são mais escritos: cota deriva do log.
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _vencedor, _tipo,
     CASE
       WHEN _regra = 'manual_direta' AND _divergencia_zona AND _motivo_fora IS NOT NULL
         THEN 'Atribuição manual FORA DA REGIÃO (corretor não atende a ' || public._rotulo_zona(_zona)
              || ') — exceção da gestão: ' || _motivo_fora
       WHEN _regra = 'manual_direta' AND _divergencia_zona
         THEN 'Atribuição manual direta (corretor fora da Zona ' || _zona || ')'
       WHEN _regra = 'manual_direta' THEN 'Atribuição manual direta'
       WHEN _regra LIKE 'ponderado_velocidade%'
         THEN 'Roleta ' || _slug || ' — ponderado por velocidade (faixa ' || COALESCE(_faixa_vencedor, 'B') || ')'
       WHEN _regra = 'rodizio_base'
         THEN 'Roleta ' || _slug || ' — rodízio universal (há mais tempo sem receber)'
       WHEN _origem_fallback IS NOT NULL
         THEN 'Roleta ' || _slug || ' — rodízio (roleta ' || _origem_fallback || ' inativa/sem time; caiu no Plantão)'
       WHEN _zona_fallback
         THEN 'Roleta ' || _slug || ' — rodízio (sem apto na Zona ' || _zona || '; fallback para qualquer apto)'
       WHEN _marquinhos_na_zona
         THEN 'Roleta marquinhos — rodízio entre quem da Marquinhos atende a ' || public._rotulo_zona(_zona)
       WHEN _marquinhos_desvio
         THEN 'Roleta ' || _slug || ' — rodízio (ninguém da Roleta Marquinhos apto na '
              || public._rotulo_zona(_zona) || ')'
       ELSE 'Roleta ' || _slug || ' — rodízio (há mais tempo sem receber)'
     END,
     _distribuido_por, _slug, _regra, 'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(),
         resolvida_por = COALESCE(_distribuido_por, auth.uid()),
         resolucao = 'Distribuído para ' || _vencedor_nome ||
                     CASE WHEN _regra = 'manual_direta' THEN ' (manual)' ELSE ' (roleta ' || COALESCE(_slug,'?') || ')' END
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  -- [V2] Modo SOMBRA: com o v2 desligado, registra quem o v2 teria escolhido
  -- na MESMA roleta (régua extra + argmax de wrr_current + peso da faixa),
  -- sem tocar cursor nenhum. Nunca pode derrubar a distribuição real.
  IF NOT _v2 AND _sombra AND _regra <> 'manual_direta'
     AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
    BEGIN
      SELECT rp.corretor_id, rp.tier
        INTO _sombra_vencedor, _sombra_faixa
      FROM public.roleta_participantes rp
      JOIN LATERAL public._apto_extra_v2(rp.corretor_id) e ON e.apto
      WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids)
      ORDER BY (rp.wrr_current + CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END) DESC,
               rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC
      LIMIT 1;

      INSERT INTO public.distribuicao_sombra
        (lead_id, roleta_slug, classe_lead, vencedor_real, vencedor_v2, faixa_v2, contexto)
      VALUES
        (_lead_id, _slug, _classe, _vencedor, _sombra_vencedor, _sombra_faixa,
         jsonb_build_object('gatilho', _gatilho,
                            'seria_fila_base', _classe = 'base'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'corretor_id', _vencedor,
    'corretor_nome', _vencedor_nome,
    'roleta', _slug,
    'regra', _regra,
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'aviso_zona', CASE WHEN _divergencia_zona
      THEN 'Corretor não atende a ' || public._rotulo_zona(_zona) ELSE NULL END
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) As duas portas (mesmo corpo de 20261015120000 / 20261016120000): as
--    cabeças de cada família calculadas UMA vez por chamada e passadas a cada
--    fila; quem está fora pela vez única sai com vez_em.
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
  -- [VEZ ÚNICA]
  _cab_sdr  jsonb;
  _cab_zona jsonb;
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

  -- [VEZ ÚNICA] As cabeças de cada família, uma vez só.
  IF _zona IS NOT NULL AND _estrita AND public._vez_unica_ativa() THEN
    _cab_sdr  := public._vez_unica_cabecas_json('sdr');
    _cab_zona := public._vez_unica_cabecas_json('zona');
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
           coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'corretor_id', f.corretor_id, 'nome', f.nome, 'motivos', to_jsonb(f.motivos),
               'vez_em', f.vez_em))
             ORDER BY f.nome) FILTER (WHERE NOT f.apto), '[]'::jsonb),
           count(*)::int
      INTO _fila, _fora, _n
      FROM public._roleta_fila_prevista(
             _r.slug, _zona, NULL,
             CASE _r.papel WHEN 'sdr' THEN _cab_sdr WHEN 'zona' THEN _cab_zona
                           ELSE '[]'::jsonb END) f;

    -- Campanha sem ninguém da equipe nesta zona: não é fila desta zona.
    CONTINUE WHEN _r.papel = 'campanha' AND _zona IS NOT NULL AND _n = 0;

    -- Visita do SDR sem ninguém do time apto na zona: vai para o time da
    -- zona pela régua do SDR (sem presença). A reserva fica fora da vez única.
    _reserva := NULL;
    IF _r.papel = 'sdr' AND _zslug IS NOT NULL AND jsonb_array_length(_fila) = 0 THEN
      SELECT jsonb_build_object(
               'slug', _zslug,
               'fila', coalesce(jsonb_agg(jsonb_build_object(
                         'posicao', f.posicao, 'corretor_id', f.corretor_id, 'nome', f.nome)
                       ORDER BY f.posicao) FILTER (WHERE f.apto), '[]'::jsonb))
        INTO _reserva
        FROM public._roleta_fila_prevista(_zslug, _zona, 'sdr', '[]'::jsonb) f;
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
      'vez_unica', _r.papel IN ('sdr', 'zona') AND _cab_sdr IS NOT NULL,
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
  _vez_em  text;
  _out     jsonb := '[]'::jsonb;
  -- [VEZ ÚNICA]
  _cab_sdr  jsonb;
  _cab_zona jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(p.zonas, '{}') INTO _zonas FROM public.profiles p WHERE p.id = _uid;

  -- [VEZ ÚNICA] As cabeças de cada família, uma vez só.
  IF _estrita AND public._vez_unica_ativa() THEN
    _cab_sdr  := public._vez_unica_cabecas_json('sdr');
    _cab_zona := public._vez_unica_cabecas_json('zona');
  END IF;

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
     -- Só a participação ATIVA: a roleta de onde a gestão o removeu não é
     -- "dele" (e, numa roleta de zona, removê-lo tira a zona da região).
     WHERE rp.ativo
       AND r.ativo
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
          'motivos', '["sem_zona_no_perfil"]'::jsonb, 'vez_em', NULL));
        CONTINUE;
      END IF;

      SELECT count(*) FILTER (WHERE f.apto)::int,
             count(*) FILTER (WHERE f.corretor_id = _uid) > 0,
             max(f.posicao) FILTER (WHERE f.corretor_id = _uid),
             coalesce(bool_or(f.apto) FILTER (WHERE f.corretor_id = _uid), false),
             (jsonb_agg(to_jsonb(f.motivos)) FILTER (WHERE f.corretor_id = _uid)) -> 0,
             max(f.vez_em) FILTER (WHERE f.corretor_id = _uid)
        INTO _total, _achou, _posicao, _apto, _motivos, _vez_em
        FROM public._roleta_fila_prevista(
               _r.slug, _z, NULL,
               CASE _r.papel WHEN 'sdr' THEN _cab_sdr WHEN 'zona' THEN _cab_zona
                             ELSE '[]'::jsonb END) f;

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
                        ELSE '["fora_da_regiao"]'::jsonb END,
        'vez_em', _vez_em));
    END LOOP;
  END LOOP;

  RETURN _out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Permissões: as peças internas só pelo banco; as portas, como antes.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._vez_unica_ativa() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_ativa() TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_zonas_ordem() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_zonas_ordem() TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_cabecas(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_cabecas(text, text) TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_cabecas_json(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_cabecas_json(text, text) TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_tomados(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_tomados(text, text) TO service_role;
REVOKE ALL ON FUNCTION public._roleta_fila_prevista(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roleta_fila_prevista(text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.roletas_filas_zona_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roletas_filas_zona_v1(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.minhas_posicoes_roletas_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_posicoes_roletas_v1() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Guarda: tudo no lugar.
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.distribuicao_settings WHERE chave = 'vez_unica_por_zona') THEN
    RAISE EXCEPTION 'vez única: chave vez_unica_por_zona ausente';
  END IF;
  PERFORM public._vez_unica_ativa();
  IF (SELECT count(*) FROM public._vez_unica_zonas_ordem()) <> (SELECT count(*) FROM public.zonas_roletas) THEN
    RAISE EXCEPTION 'vez única: a ordem das zonas não cobre todas as zonas';
  END IF;
  IF to_regprocedure('public._roleta_fila_prevista(text, text, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'vez única: a _roleta_fila_prevista antiga (3 parâmetros) ainda existe';
  END IF;
  IF to_regprocedure('public._roleta_fila_prevista(text, text, text, jsonb)') IS NULL
     OR to_regprocedure('public._vez_unica_cabecas(text, text)') IS NULL
     OR to_regprocedure('public._vez_unica_tomados(text, text)') IS NULL THEN
    RAISE EXCEPTION 'vez única: função ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_distribuir_lead_sdr'
       AND p.prosrc LIKE '%_vez_unica_tomados(''sdr''%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_distribuir_lead_v3'
       AND p.prosrc LIKE '%_vez_unica_tomados(''zona''%'
  ) THEN
    RAISE EXCEPTION 'vez única: motor sem a regra';
  END IF;
END
$guard$;
