-- =============================================================================
-- Presença por filial — o corretor diz ONDE está, e a regra do plantão decide
-- se essa presença libera a roleta.
--
-- Pedido do dono (09/10/2026): "Hoje temos 3 filiais: Barra Funda, Liberdade
-- e Belém. Preciso de um hub em que os corretores marquem em que loja estão
-- logando e marcando presença no dia para que estejam aptos para algumas
-- roletas de leads. Corretores com menos de 3 vendas no mês não podem pegar
-- lead em casa, apenas com presença no plantão."
--
-- Como era: qualquer login marcava presença sozinho (auto check-in do
-- auth-guard, a cada hora) e o corretor podia ligar `profiles.presente` com um
-- UPDATE direto no próprio perfil. Presença não dizia onde a pessoa estava.
--
-- Desenho: TODOS os motores (roleta v3/_elegibilidade_roleta, campanha
-- ponderada, repasse por SLA, SDR, Escoar estoque) já leem a mesma chave,
-- `profiles.presente`. Nenhum deles muda aqui. A regra entra no ÚNICO lugar
-- que liga essa chave — o check-in:
--
--   check-in na FILIAL ............................ libera a roleta
--   check-in EM CASA com >= 3 vendas no mês ....... libera a roleta
--   check-in EM CASA com <  3 vendas no mês ....... registra, NÃO libera
--
-- "Vendas no mês" = vendas aprovadas, sem distrato, com data de assinatura no
-- mês corrente (BRT) — o mesmo critério de corretor_vendas_trimestre (tier de
-- comissão), só que no mês. O "3" é a chave presenca_casa_min_vendas_mes
-- (Central de Distribuição → Configurações); 0 desliga a regra.
--
-- Peças:
--   1. filiais ............ Barra Funda, Liberdade, Belém (coordenadas e raio
--                           editáveis pela gestão; sem coordenadas, não há
--                           conferência de localização)
--   2. presenca_checkins .. um registro por check-in (onde, se liberou roleta e
--                           por quê, vendas do mês no momento). Não guarda a
--                           coordenada do celular — só a DISTÂNCIA até a filial.
--                           Check-in em casa nunca pede localização.
--   3. presenca_checkin() . a porta única (corretor e gestão)
--   4. marcar_presenca() .. legado: false = encerrar; true só re-confirma um
--                           check-in de hoje (aba antiga com auto check-in não
--                           burla a regra)
--   5. marcar_presenca_admin() — o interruptor da Central de Distribuição
--                           vira "liberado pela gestão", registrado
--   6. trava em profiles .. presente/presente_em só mudam pelas RPCs acima
--   7. auto-checkout das 23h fecha os check-ins abertos
--
-- Rollback da REGRA sem deploy: presenca_casa_min_vendas_mes = 0 (casa sempre
-- libera). Ver docs/ops/presenca-filiais.md.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Configurações (Central de Distribuição → Configurações)
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('presenca_casa_min_vendas_mes', '3'::jsonb,
   'Vendas aprovadas no mês (sem distrato) para o check-in EM CASA liberar a roleta. Abaixo disso, só o check-in numa filial (plantão) libera. 0 = em casa sempre libera.'),
  ('presenca_loja_exige_localizacao', 'false'::jsonb,
   'Check-in na filial só libera a roleta com a localização do celular dentro do raio da filial (vale para filial com coordenadas cadastradas).')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1) Filiais
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.filiais (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome        text NOT NULL CHECK (btrim(nome) <> ''),
  endereco    text,
  latitude    double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude   double precision CHECK (longitude BETWEEN -180 AND 180),
  raio_metros integer NOT NULL DEFAULT 300 CHECK (raio_metros BETWEEN 50 AND 5000),
  ativa       boolean NOT NULL DEFAULT true,
  ordem       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT filiais_coordenadas_juntas CHECK ((latitude IS NULL) = (longitude IS NULL))
);

COMMENT ON TABLE public.filiais IS
  'Lojas próprias da SMQ onde acontece o plantão. Check-in numa filial ativa sempre libera a roleta (regra em presenca_checkin).';

DROP TRIGGER IF EXISTS trg_filiais_updated_at ON public.filiais;
CREATE TRIGGER trg_filiais_updated_at BEFORE UPDATE ON public.filiais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.filiais (slug, nome, ordem) VALUES
  ('barra-funda', 'Barra Funda', 1),
  ('liberdade',   'Liberdade',   2),
  ('belem',       'Belém',       3)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.filiais FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.filiais TO authenticated;
-- A gestão cadastra endereço/coordenadas/raio e abre filial nova; slug e id
-- não mudam depois (o check-in guarda a filial pelo id).
GRANT INSERT (slug, nome, endereco, latitude, longitude, raio_metros, ativa, ordem)
  ON TABLE public.filiais TO authenticated;
GRANT UPDATE (nome, endereco, latitude, longitude, raio_metros, ativa, ordem)
  ON TABLE public.filiais TO authenticated;
GRANT ALL ON TABLE public.filiais TO service_role;

DROP POLICY IF EXISTS filiais_select ON public.filiais;
CREATE POLICY filiais_select ON public.filiais
  FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));

DROP POLICY IF EXISTS filiais_insert_gestao ON public.filiais;
CREATE POLICY filiais_insert_gestao ON public.filiais
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

DROP POLICY IF EXISTS filiais_update_gestao ON public.filiais;
CREATE POLICY filiais_update_gestao ON public.filiais
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

-- ---------------------------------------------------------------------------
-- 2) Check-ins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presenca_checkins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Dia do check-in em BRT (o mesmo dia de presente_em na elegibilidade).
  dia            date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  -- loja = plantão numa filial; casa = trabalho remoto; liberado_gestao = o
  -- interruptor da Central de Distribuição (a gestão liberou sem informar onde).
  modo           text NOT NULL CHECK (modo IN ('loja', 'casa', 'liberado_gestao')),
  filial_id      uuid REFERENCES public.filiais(id),
  apto_roleta    boolean NOT NULL,
  -- Por que NÃO liberou: casa_abaixo_minimo_vendas | fora_da_filial | sem_localizacao
  motivo         text,
  -- Foto da regra no momento do check-in (auditoria: "por que não recebi?").
  vendas_mes     integer NOT NULL DEFAULT 0,
  vendas_minimas integer NOT NULL DEFAULT 0,
  -- Conferência de localização (só check-in na filial). Nunca a coordenada:
  -- só a distância até a filial e a precisão informada pelo aparelho.
  localizacao    text CHECK (localizacao IN (
                   'confirmada', 'fora_do_raio', 'sem_localizacao',
                   'filial_sem_coordenadas', 'confirmada_gestao')),
  distancia_m    integer CHECK (distancia_m >= 0),
  precisao_m     integer CHECK (precisao_m >= 0),
  origem         text NOT NULL DEFAULT 'corretor' CHECK (origem IN ('corretor', 'gestao')),
  registrado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  encerrado_em   timestamptz,
  CONSTRAINT presenca_checkins_filial_so_na_loja CHECK ((modo = 'loja') = (filial_id IS NOT NULL)),
  CONSTRAINT presenca_checkins_motivo_se_inapto CHECK (apto_roleta OR motivo IS NOT NULL)
);

COMMENT ON TABLE public.presenca_checkins IS
  'Um registro por check-in (onde o corretor está e se a presença liberou a roleta). Escrita só pelas RPCs de presença; profiles.presente continua sendo a chave lida pelos motores.';

CREATE INDEX IF NOT EXISTS idx_presenca_checkins_dia
  ON public.presenca_checkins (dia, corretor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presenca_checkins_corretor
  ON public.presenca_checkins (corretor_id, created_at DESC);
-- No máximo UM check-in aberto por corretor e dia (trocar de filial encerra o
-- anterior). Corrida entre dois cliques: o advisory lock serializa, o índice
-- garante.
CREATE UNIQUE INDEX IF NOT EXISTS presenca_checkins_um_aberto_por_dia
  ON public.presenca_checkins (corretor_id, dia) WHERE encerrado_em IS NULL;

ALTER TABLE public.presenca_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.presenca_checkins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.presenca_checkins TO authenticated;
GRANT ALL ON TABLE public.presenca_checkins TO service_role;

DROP POLICY IF EXISTS presenca_checkins_select ON public.presenca_checkins;
CREATE POLICY presenca_checkins_select ON public.presenca_checkins
  FOR SELECT TO authenticated
  USING (
    corretor_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'superintendente')
  );

-- ---------------------------------------------------------------------------
-- 3) Peças internas da regra
-- ---------------------------------------------------------------------------

-- Vendas aprovadas (sem distrato) do corretor no mês de _ref — mesmo critério
-- de corretor_vendas_trimestre. Interna: a contagem de colegas não sai por RPC.
CREATE OR REPLACE FUNCTION public._corretor_vendas_mes(
  _corretor uuid,
  _ref date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date)
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
    FROM public.vendas v
   WHERE v.corretor_id = _corretor
     AND v.status_venda = 'aprovada'
     AND coalesce(v.distrato, false) = false
     AND v.data_assinatura >= date_trunc('month', _ref)::date
     AND v.data_assinatura <  (date_trunc('month', _ref) + interval '1 month')::date;
$$;
REVOKE ALL ON FUNCTION public._corretor_vendas_mes(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._corretor_vendas_mes(uuid, date) TO service_role;

-- Mínimo de vendas no mês para o check-in em casa liberar a roleta.
CREATE OR REPLACE FUNCTION public._presenca_min_vendas_casa()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(0, coalesce(
    (SELECT (valor #>> '{}')::int FROM public.distribuicao_settings
      WHERE chave = 'presenca_casa_min_vendas_mes'),
    3));
$$;
REVOKE ALL ON FUNCTION public._presenca_min_vendas_casa() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._presenca_min_vendas_casa() TO service_role;

CREATE OR REPLACE FUNCTION public._presenca_loja_exige_localizacao()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT (valor #>> '{}')::boolean FROM public.distribuicao_settings
      WHERE chave = 'presenca_loja_exige_localizacao'),
    false);
$$;
REVOKE ALL ON FUNCTION public._presenca_loja_exige_localizacao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._presenca_loja_exige_localizacao() TO service_role;

-- Distância em metros entre dois pontos (haversine, raio médio da Terra).
CREATE OR REPLACE FUNCTION public._distancia_metros(
  _lat1 double precision, _lng1 double precision,
  _lat2 double precision, _lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians(_lat2 - _lat1) / 2), 2)
    + cos(radians(_lat1)) * cos(radians(_lat2)) * power(sin(radians(_lng2 - _lng1) / 2), 2)
  ));
$$;

-- Encerra o check-in aberto do corretor. Aberto de dia anterior (o cron das
-- 23h falhou) fecha no fim daquele dia, não "agora" — a duração não mente.
CREATE OR REPLACE FUNCTION public._presenca_encerrar_aberto(_corretor uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.presenca_checkins
     SET encerrado_em = least(now(), ((dia + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
   WHERE corretor_id = _corretor
     AND encerrado_em IS NULL;
$$;
REVOKE ALL ON FUNCTION public._presenca_encerrar_aberto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._presenca_encerrar_aberto(uuid) TO service_role;

-- Liga/desliga a chave lida pelos motores. A trava de profiles (item 6) só
-- deixa presente/presente_em mudar com app.presenca_rpc = 'on'.
CREATE OR REPLACE FUNCTION public._presenca_aplicar(_corretor uuid, _presente boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.presenca_rpc', 'on', true);
  UPDATE public.profiles
     SET presente = _presente,
         presente_em = CASE WHEN _presente THEN now() ELSE NULL END
   WHERE id = _corretor;
  PERFORM set_config('app.presenca_rpc', 'off', true);
END;
$$;
REVOKE ALL ON FUNCTION public._presenca_aplicar(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._presenca_aplicar(uuid, boolean) TO service_role;

-- Estado de presença do corretor hoje (o que a tela de check-in mostra).
CREATE OR REPLACE FUNCTION public._presenca_status(_corretor uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje,
           public._presenca_min_vendas_casa() AS minimo,
           public._presenca_loja_exige_localizacao() AS exige_loc
  ),
  ult AS (
    SELECT c.*, f.slug AS filial_slug, f.nome AS filial_nome
      FROM public.presenca_checkins c
      LEFT JOIN public.filiais f ON f.id = c.filial_id
      CROSS JOIN cfg
     WHERE c.corretor_id = _corretor
       AND c.dia = cfg.hoje
     ORDER BY c.created_at DESC
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'dia', cfg.hoje,
    'presente', coalesce(p.presente AND p.presente_em IS NOT NULL
                         AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = cfg.hoje,
                         false),
    'vendas_mes', public._corretor_vendas_mes(_corretor, cfg.hoje),
    'vendas_minimas', cfg.minimo,
    'casa_liberada', public._corretor_vendas_mes(_corretor, cfg.hoje) >= cfg.minimo,
    'exige_localizacao', cfg.exige_loc,
    'checkin', (
      SELECT jsonb_build_object(
        'id', u.id, 'modo', u.modo, 'filial_slug', u.filial_slug, 'filial_nome', u.filial_nome,
        'apto_roleta', u.apto_roleta, 'motivo', u.motivo,
        'localizacao', u.localizacao, 'distancia_m', u.distancia_m, 'precisao_m', u.precisao_m,
        'origem', u.origem, 'criado_em', u.created_at, 'encerrado_em', u.encerrado_em)
        FROM ult u)
  )
  FROM cfg
  LEFT JOIN public.profiles p ON p.id = _corretor;
$$;
REVOKE ALL ON FUNCTION public._presenca_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._presenca_status(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) A porta única: presenca_checkin
-- ---------------------------------------------------------------------------
-- _modo: 'loja' (com _filial = slug) ou 'casa'.
-- _latitude/_longitude/_precisao_m: do celular, só no check-in na filial; a
--   função calcula a distância e descarta a coordenada.
-- _corretor_id: a gestão (admin/gestor) faz o check-in por alguém — na filial,
--   vale como localização confirmada pela gestão; em casa, a regra das vendas
--   vale igual.
-- Resultado de negócio (não liberou) NUNCA é exceção: o check-in fica
-- registrado com o motivo e a tela explica. Exceção é só entrada inválida.
CREATE OR REPLACE FUNCTION public.presenca_checkin(
  _modo text,
  _filial text DEFAULT NULL,
  _latitude double precision DEFAULT NULL,
  _longitude double precision DEFAULT NULL,
  _precisao_m double precision DEFAULT NULL,
  _corretor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid      uuid := auth.uid();
  _alvo     uuid := coalesce(_corretor_id, auth.uid());
  _por_gestao boolean;
  _hoje     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _f        public.filiais%ROWTYPE;
  _min      integer := public._presenca_min_vendas_casa();
  _vendas   integer;
  _loc      text;
  _dist     integer;
  _prec     integer;
  _apto     boolean;
  _motivo   text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao autenticado' USING ERRCODE = '28000';
  END IF;

  _por_gestao := _alvo <> _uid;
  IF _por_gestao AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Só a gestão faz check-in por outro corretor.' USING ERRCODE = '42501';
  END IF;

  IF _modo IS NULL OR _modo NOT IN ('loja', 'casa') THEN
    RAISE EXCEPTION 'Check-in inválido: escolha uma filial ou "em casa".' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _alvo AND ativo) THEN
    RAISE EXCEPTION 'Corretor não encontrado ou inativo.' USING ERRCODE = '22023';
  END IF;

  IF _modo = 'loja' THEN
    SELECT * INTO _f FROM public.filiais WHERE slug = _filial AND ativa;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Filial não encontrada ou inativa: %', coalesce(_filial, '(vazia)')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF (_latitude IS NULL) <> (_longitude IS NULL)
     OR _latitude NOT BETWEEN -90 AND 90
     OR _longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Localização inválida.' USING ERRCODE = '22023';
  END IF;

  -- Serializa cliques simultâneos do mesmo corretor (dois aparelhos, duplo
  -- clique): o índice de "um aberto por dia" não vira erro na cara dele.
  PERFORM pg_advisory_xact_lock(hashtext('presenca_checkin:' || _alvo::text));

  _vendas := public._corretor_vendas_mes(_alvo, _hoje);

  IF _modo = 'loja' THEN
    IF _por_gestao THEN
      _loc := 'confirmada_gestao';
    ELSIF _f.latitude IS NULL THEN
      _loc := 'filial_sem_coordenadas';
    ELSIF _latitude IS NULL THEN
      _loc := 'sem_localizacao';
    ELSE
      _dist := round(public._distancia_metros(_latitude, _longitude, _f.latitude, _f.longitude));
      _prec := CASE WHEN _precisao_m IS NULL OR _precisao_m < 0 THEN NULL ELSE round(_precisao_m) END;
      -- A precisão do aparelho conta a favor até 150 m (GPS dentro de prédio).
      _loc := CASE WHEN _dist <= _f.raio_metros + least(coalesce(_prec, 0), 150)
                   THEN 'confirmada' ELSE 'fora_do_raio' END;
    END IF;

    IF public._presenca_loja_exige_localizacao() AND _loc IN ('sem_localizacao', 'fora_do_raio') THEN
      _apto := false;
      _motivo := CASE _loc WHEN 'fora_do_raio' THEN 'fora_da_filial' ELSE 'sem_localizacao' END;
    ELSE
      _apto := true;
    END IF;
  ELSE
    -- Em casa: nunca pede localização. Libera só com o mínimo de vendas do mês.
    _apto := _vendas >= _min;
    _motivo := CASE WHEN _apto THEN NULL ELSE 'casa_abaixo_minimo_vendas' END;
  END IF;

  PERFORM public._presenca_encerrar_aberto(_alvo);

  INSERT INTO public.presenca_checkins (
    corretor_id, dia, modo, filial_id, apto_roleta, motivo, vendas_mes, vendas_minimas,
    localizacao, distancia_m, precisao_m, origem, registrado_por)
  VALUES (
    _alvo, _hoje, _modo, CASE WHEN _modo = 'loja' THEN _f.id END, _apto, _motivo, _vendas, _min,
    _loc, _dist, _prec, CASE WHEN _por_gestao THEN 'gestao' ELSE 'corretor' END, _uid);

  PERFORM public._presenca_aplicar(_alvo, _apto);

  RETURN public._presenca_status(_alvo);
END;
$$;
REVOKE ALL ON FUNCTION public.presenca_checkin(text, text, double precision, double precision, double precision, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presenca_checkin(text, text, double precision, double precision, double precision, uuid)
  TO authenticated, service_role;

-- O que a tela de check-in precisa numa ida só: meu estado + as filiais.
CREATE OR REPLACE FUNCTION public.presenca_minha_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao autenticado' USING ERRCODE = '28000';
  END IF;
  RETURN public._presenca_status(_uid) || jsonb_build_object(
    'filiais', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'slug', f.slug, 'nome', f.nome, 'endereco', f.endereco,
               'tem_coordenadas', f.latitude IS NOT NULL, 'raio_metros', f.raio_metros)
             ORDER BY f.ordem, f.nome)
        FROM public.filiais f
       WHERE f.ativa), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.presenca_minha_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presenca_minha_v1() TO authenticated, service_role;

-- Quadro da gestão: todo corretor ativo, com o último check-in de hoje (ou
-- nenhum). admin, gestor e superintendente.
CREATE OR REPLACE FUNCTION public.presenca_hoje_v1()
RETURNS TABLE (
  corretor_id    uuid,
  nome           text,
  avatar_url     text,
  presente       boolean,
  modo           text,
  filial_slug    text,
  filial_nome    text,
  apto_roleta    boolean,
  motivo         text,
  localizacao    text,
  distancia_m    integer,
  origem         text,
  checkin_em     timestamptz,
  encerrado_em   timestamptz,
  vendas_mes     integer,
  vendas_minimas integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid  uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _min  integer := public._presenca_min_vendas_casa();
BEGIN
  IF _uid IS NULL OR NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')
                          OR public.has_role(_uid, 'superintendente')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.nome,
         coalesce(p.avatar_url, p.foto_url),
         coalesce(p.presente AND p.presente_em IS NOT NULL
                  AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = _hoje, false),
         c.modo,
         f.slug,
         f.nome,
         c.apto_roleta,
         c.motivo,
         c.localizacao,
         c.distancia_m,
         c.origem,
         c.created_at,
         c.encerrado_em,
         public._corretor_vendas_mes(p.id, _hoje),
         _min
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT pc.* FROM public.presenca_checkins pc
       WHERE pc.corretor_id = p.id AND pc.dia = _hoje
       ORDER BY pc.created_at DESC
       LIMIT 1
    ) c ON true
    LEFT JOIN public.filiais f ON f.id = c.filial_id
   WHERE p.ativo
     AND lower(coalesce(p.nome, '')) <> 'docs-bot'
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role = 'corretor'::app_role)
   ORDER BY p.nome;
END;
$$;
REVOKE ALL ON FUNCTION public.presenca_hoje_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presenca_hoje_v1() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Legado: marcar_presenca e marcar_presenca_admin
-- ---------------------------------------------------------------------------
-- marcar_presenca(false) = encerrar a presença ("Sair").
-- marcar_presenca(true) NÃO marca mais presença sem local: aba antiga com o
-- auto check-in do login (que chamava isto a cada hora) não pode burlar a
-- regra. Com check-in aberto hoje, re-confirma — e o check-in em casa que não
-- tinha liberado é reavaliado (o corretor bateu as vendas do mês).
CREATE OR REPLACE FUNCTION public.marcar_presenca(_presente boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid  uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _c    public.presenca_checkins%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao autenticado'; END IF;

  IF NOT coalesce(_presente, false) THEN
    PERFORM public._presenca_encerrar_aberto(_uid);
    PERFORM public._presenca_aplicar(_uid, false);
    RETURN;
  END IF;

  SELECT * INTO _c FROM public.presenca_checkins
   WHERE corretor_id = _uid AND dia = _hoje AND encerrado_em IS NULL
   ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faça o check-in: escolha a filial em que você está hoje (ou "em casa").'
      USING ERRCODE = 'P0001', HINT = 'presenca_sem_checkin';
  END IF;

  IF NOT _c.apto_roleta AND _c.modo = 'casa'
     AND public._corretor_vendas_mes(_uid, _hoje) >= public._presenca_min_vendas_casa() THEN
    PERFORM public.presenca_checkin('casa');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_presenca(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_presenca(boolean) TO authenticated;

-- O interruptor da Central de Distribuição (aba Corretores / Filas): a gestão
-- libera ou tira alguém da roleta hoje. Continua furando a regra de propósito
-- (é decisão da gestão), mas agora fica registrado como "liberado pela gestão".
CREATE OR REPLACE FUNCTION public.marcar_presenca_admin(_corretor_id uuid, _presente boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid  uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF _uid IS NULL
     OR (NOT public.has_role(_uid,'admin') AND NOT public.has_role(_uid,'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('presenca_checkin:' || _corretor_id::text));
  PERFORM public._presenca_encerrar_aberto(_corretor_id);

  IF coalesce(_presente, false) THEN
    INSERT INTO public.presenca_checkins (
      corretor_id, dia, modo, apto_roleta, vendas_mes, vendas_minimas, origem, registrado_por)
    VALUES (
      _corretor_id, _hoje, 'liberado_gestao', true,
      public._corretor_vendas_mes(_corretor_id, _hoje), public._presenca_min_vendas_casa(),
      'gestao', _uid);
  END IF;

  PERFORM public._presenca_aplicar(_corretor_id, coalesce(_presente, false));
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_presenca_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_presenca_admin(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Trava: presente/presente_em só pelas RPCs de presença
-- ---------------------------------------------------------------------------
-- Até aqui o corretor ligava a própria presença com um PATCH em profiles
-- (policy profiles_update_self) — e a regra do plantão viraria enfeite.
-- Mesmo corpo de 20260719101000, mais o item 4.
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- 1) Caminhos de sistema: webhook/cron/GoTrue/migrations (sem JWT) e
  --    service_role não são o corretor tentando se auto-promover.
  IF auth.uid() IS NULL OR COALESCE(auth.role() = 'service_role', false) THEN
    RETURN NEW;
  END IF;

  -- 2) Admin pode alterar qualquer coisa.
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- 3) Campos administrativos: preservados para não-admin (inclui self-update).
  NEW.ativo := OLD.ativo;
  NEW.status_conta := OLD.status_conta;
  NEW.equipe_id := OLD.equipe_id;
  NEW.data_admissao := OLD.data_admissao;
  NEW.email := OLD.email;
  NEW.id := OLD.id;

  -- 4) Presença da roleta: só pelo check-in (presenca_checkin, marcar_presenca,
  --    marcar_presenca_admin), que avisa com app.presenca_rpc. A regra do
  --    plantão (menos de 3 vendas no mês = só na filial) mora lá.
  IF current_setting('app.presenca_rpc', true) IS DISTINCT FROM 'on' THEN
    NEW.presente := OLD.presente;
    NEW.presente_em := OLD.presente_em;
  END IF;

  -- 5) Cursor do rodízio: aceita somente "agora" (tolerância p/ clock skew).
  IF NEW.last_lead_assigned_at IS DISTINCT FROM OLD.last_lead_assigned_at
     AND (
       NEW.last_lead_assigned_at IS NULL
       OR NEW.last_lead_assigned_at < now() - interval '10 seconds'
       OR NEW.last_lead_assigned_at > now() + interval '10 seconds'
     ) THEN
    NEW.last_lead_assigned_at := OLD.last_lead_assigned_at;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7) Auto-checkout (cron 23h BRT) e reset diário fecham os check-ins abertos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_checkout_presenca()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  UPDATE public.presenca_checkins
     SET encerrado_em = least(now(), ((dia + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
   WHERE encerrado_em IS NULL;
  WITH upd AS (
    UPDATE public.profiles SET presente = false, presente_em = NULL WHERE presente = true RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  RETURN _n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.auto_checkout_presenca() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_checkout_presenca() TO service_role;

CREATE OR REPLACE FUNCTION public.resetar_presenca_diaria()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.presenca_checkins
     SET encerrado_em = least(now(), ((dia + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
   WHERE encerrado_em IS NULL;
  UPDATE public.profiles SET presente = false, presente_em = NULL WHERE presente = true;
$$;
REVOKE EXECUTE ON FUNCTION public.resetar_presenca_diaria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resetar_presenca_diaria() TO service_role;
