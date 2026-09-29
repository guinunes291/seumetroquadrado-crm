-- ===========================================================================
-- PROSPECÇÃO — Grande SP como 6ª zona do lote
-- ===========================================================================
-- Decisão do dono (29/09/2026), depois de medir o Bolsão elegível ao lote:
--
--   Leste 17.123 · Oeste 9.045 · Norte 6.986 · Sul 6.517 · Centro 160
--   (sem zona) 8.266 = 5.767 sem empreendimento + 1.606 Merito Guarulhos
--                      + 893 Next Guarulhos
--
-- Grupo 1 (Guarulhos): "A" — a Grande SP vira a 6ª opção do lote.
-- Grupo 2 (sem empreendimento, sem zona e sem bairro): "A" — fica como está,
-- no Bolsão, para o Discador e a pré-venda. Nada muda para eles aqui.
--
-- ---------------------------------------------------------------------------
-- A REGRA DA ZONA DO EMPREENDIMENTO É A MESMA DA VITRINE
-- ---------------------------------------------------------------------------
-- `zonaDoProjeto` (src/lib/zonas.ts) já decide a zona de um empreendimento na
-- vitrine, nos materiais e no comparativo. O lote passa a usar a mesma regra,
-- em SQL, para o corretor e a tela nunca discordarem sobre onde fica um
-- empreendimento:
--
--   1. qualquer campo (zona SMQ, região, cidade, bairro) aponta para o ABC
--      -> Sul (decisão de 28/09/2026: "tudo que for ABC conta como Zona Sul");
--   2. cidade fora da capital na lista da Grande SP -> Grande SP;
--   3. zona SMQ aponta para a Grande SP                -> Grande SP;
--   4. zona SMQ, senão região, numa das cinco zonas     -> essa zona;
--   5. região aponta para a Grande SP                   -> Grande SP;
--   6. sem cidade, bairro com o município ("Ponte Grande (Guarulhos)")
--                                                       -> Grande SP.
--
-- Por isso o Next Guarulhos (zona SMQ "Grande SP", região "Norte") é Grande
-- SP: a zona SMQ vem antes da região, como na vitrine.
--
-- As cinco zonas da capital continuam saindo de `zona_normalizar`, a mesma
-- função da distribuição (ela também entende ZN/ZS/ZL/ZO).
--
-- ---------------------------------------------------------------------------
-- O QUE NÃO MUDA
-- ---------------------------------------------------------------------------
-- Só o lote conhece a Grande SP. `zona_normalizar`, `zona_do_lead`, roletas
-- por zona, distribuição e SLA seguem com as cinco zonas da capital. A zona
-- do PRÓPRIO lead (campo zona e bairro) continua vindo antes da do
-- empreendimento.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) O texto como a vitrine o compara
-- ---------------------------------------------------------------------------
-- Sem acento, minúsculo, tudo que não é letra ou dígito vira espaço — o
-- `chave()` de src/lib/zonas.ts.
CREATE OR REPLACE FUNCTION public._zona_chave(_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(COALESCE(_txt, ''),
      'ÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇàáâãäèéêëìíîïòóôõöùúûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- `ehGrandeSP`: o texto aponta para fora da capital? Municípios por palavra
-- inteira, para "Poá" não casar dentro de outro nome.
CREATE OR REPLACE FUNCTION public._zona_eh_grande_sp(_txt text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT k <> ''
     AND (   position('grande sp' IN k) > 0
          OR position('grande sao paulo' IN k) > 0
          OR position('regiao metropolitana' IN k) > 0
          OR k ~ '(^| )abc( |$)'
          OR position('abc paulista' IN k) > 0
          OR k ~ '(^| )(guarulhos|osasco|barueri|carapicuiba|santo andre|sao bernardo|sao bernardo do campo|sao caetano|sao caetano do sul|diadema|maua|ribeirao pires|rio grande da serra|taboao da serra|embu das artes|embu|cotia|itapevi|jandira|santana de parnaiba|cajamar|franco da rocha|caieiras|mairipora|itaquaquecetuba|suzano|mogi das cruzes|ferraz de vasconcelos|poa|aruja|guararema|itapecerica da serra|vargem grande paulista|alphaville)( |$)')
    FROM (SELECT public._zona_chave(_txt) AS k) AS t;
$$;

-- `ehABC`: o texto aponta para o ABC paulista? ("Vila Mauá" é bairro da
-- capital, não Mauá.)
CREATE OR REPLACE FUNCTION public._zona_eh_abc(_txt text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT k <> ''
     AND (   k ~ '(^| )abc( |$)'
          OR (    k !~ '(^| )vila maua( |$)'
              AND k ~ '(^| )(santo andre|sao bernardo|sao caetano|diadema|maua|ribeirao pires|rio grande da serra|rudge ramos)( |$)'))
    FROM (SELECT public._zona_chave(_txt) AS k) AS t;
$$;

-- `zonaDoProjeto`: a zona de um empreendimento, ou NULL quando nenhum campo
-- diz onde é. Devolve uma das cinco zonas da capital ou 'Grande SP'.
CREATE OR REPLACE FUNCTION public._zona_do_projeto(
  _zona_smq text, _regiao text, _cidade text, _bairro text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN public._zona_eh_abc(_zona_smq) OR public._zona_eh_abc(_regiao)
      OR public._zona_eh_abc(_cidade) OR public._zona_eh_abc(_bairro)
      THEN 'Sul'
    WHEN COALESCE(_cidade, '') <> ''
      AND public._zona_chave(_cidade) NOT IN ('sao paulo', 'sp', 'sao paulo sp')
      AND public._zona_eh_grande_sp(_cidade)
      THEN 'Grande SP'
    WHEN public._zona_eh_grande_sp(_zona_smq)
      THEN 'Grande SP'
    WHEN COALESCE(public.zona_normalizar(_zona_smq), public.zona_normalizar(_regiao)) IS NOT NULL
      THEN COALESCE(public.zona_normalizar(_zona_smq), public.zona_normalizar(_regiao))
    WHEN public._zona_eh_grande_sp(_regiao)
      THEN 'Grande SP'
    WHEN COALESCE(_cidade, '') = '' AND public._zona_eh_grande_sp(_bairro)
      THEN 'Grande SP'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2) A zona do lead no lote: a do lead primeiro, depois a do empreendimento
-- ---------------------------------------------------------------------------
-- Mesma cascata de 20261005120000 (zona do lead → bairro do lead →
-- empreendimento); só o último degrau passa a ser a regra da vitrine.
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
    public._zona_do_projeto(_zona_projeto, _regiao_projeto, NULL, NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public._prospeccao_zona_do_lead(l public.leads)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    public.zona_normalizar(l.zona),
    public.zona_do_bairro(l.bairro),
    public._zona_do_projeto(p.zona_smq, p.regiao, p.cidade, p.bairro)
  )
    FROM (SELECT 1) AS um
    LEFT JOIN public.projetos AS p ON p.id = l.projeto_id;
$$;

-- A zona que o corretor pediu: uma das cinco da capital ou a Grande SP.
CREATE OR REPLACE FUNCTION public._prospeccao_zona_pedida(_zona text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN public._zona_chave(_zona) IN ('grande sp', 'grande sao paulo') THEN 'Grande SP'
    ELSE public.zona_normalizar(_zona)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3) O lote aceita a Grande SP
-- ---------------------------------------------------------------------------
ALTER TABLE public.prospeccao_lotes DROP CONSTRAINT IF EXISTS prospeccao_lotes_zona_check;
ALTER TABLE public.prospeccao_lotes
  ADD CONSTRAINT prospeccao_lotes_zona_check
  CHECK (zona IN ('Norte', 'Sul', 'Leste', 'Oeste', 'Centro', 'Grande SP'));

-- Idêntica a 20261005120000, com a zona pedida por `_prospeccao_zona_pedida`.
CREATE OR REPLACE FUNCTION public.prospeccao_pedir_lote(_zona text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _me uuid := auth.uid();
  -- As cinco zonas da capital ou a Grande SP (20261007120000).
  _z text := public._prospeccao_zona_pedida(_zona);
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


-- ---------------------------------------------------------------------------
-- 4) Guardas
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF public._zona_do_projeto('Grande SP', 'Grande SP', NULL, NULL) IS DISTINCT FROM 'Grande SP'
     OR public._zona_do_projeto('Grande SP', 'Norte', NULL, NULL) IS DISTINCT FROM 'Grande SP'
     OR public._zona_do_projeto(NULL, NULL, 'Guarulhos', NULL) IS DISTINCT FROM 'Grande SP'
     OR public._zona_do_projeto('Grande SP', NULL, 'Santo André', NULL) IS DISTINCT FROM 'Sul'
     OR public._zona_do_projeto('Zona Leste', NULL, 'São Paulo', NULL) IS DISTINCT FROM 'Leste'
     OR public._zona_do_projeto(NULL, 'ZL', NULL, NULL) IS DISTINCT FROM 'Leste'
     OR public._zona_do_projeto(NULL, NULL, 'São Paulo', 'Vila Mauá') IS NOT NULL THEN
    RAISE EXCEPTION 'lote: _zona_do_projeto diverge da regra da vitrine (src/lib/zonas.ts)';
  END IF;
  IF public._prospeccao_zona_pedida('Grande SP') IS DISTINCT FROM 'Grande SP'
     OR public._prospeccao_zona_pedida('Leste') IS DISTINCT FROM 'Leste'
     OR public._prospeccao_zona_pedida('Marte') IS NOT NULL THEN
    RAISE EXCEPTION 'lote: _prospeccao_zona_pedida não reconhece as seis zonas';
  END IF;
  IF position('_prospeccao_zona_pedida' IN
       pg_get_functiondef('public.prospeccao_pedir_lote(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'lote: prospeccao_pedir_lote ainda recusa a Grande SP';
  END IF;
END;
$guard$;
