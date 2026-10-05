-- Roleta "Agendados do SDR" — o aviso de quarta vira um pop-up dentro do CRM.
--
-- Decisão de 05/10/2026 (docs/politica-roleta-sdr-semanal.md, seção "Aviso de
-- quarta"): o aviso fica SÓ no CRM, sem WhatsApp. A partir de quarta 18:00, ao
-- abrir o CRM, o corretor que ainda não bateu a meta vê um pop-up com o card do
-- próprio placar (pontos, barra até a meta, visitas, pastas, o que falta até
-- sexta e a situação na roleta). O sino continua.
--
-- O pop-up e o sino são o MESMO aviso: a linha de `alertas` que
-- roleta_sdr_aviso_meio_semana já grava (dedup md5(corretor + semana)).
-- "Entendi" no pop-up marca o alerta como lido; clicar no sino reabre o pop-up
-- (link /fila#aviso-roleta-sdr). O placar do card é lido AO VIVO pela tela
-- (roleta_sdr_placar): quem fez visita na quinta abre o pop-up já atualizado.

-- ---------------------------------------------------------------------------
-- 1) O aviso da semana em curso do próprio corretor (NULL = não há)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roleta_sdr_meu_aviso()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ini date := public._roleta_sdr_semana_de((now() AT TIME ZONE 'America/Sao_Paulo')::date);
  _r jsonb;
BEGIN
  -- Sem usuário (cron, SQL do admin): não há "meu" aviso.
  IF _uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
           'alerta_id', a.id,
           'lida', a.lida,
           'criado_em', a.created_at,
           'semana_inicio', _ini,
           'sombra', a.titulo LIKE '[Teste]%'
         )
    INTO _r
  FROM public.alertas a
  WHERE a.user_id = _uid
    AND a.ref_id = md5('roleta-sdr-aviso:' || _uid::text || ':' || _ini::text)::uuid
  ORDER BY a.created_at DESC
  LIMIT 1;

  RETURN _r;
END;
$$;

REVOKE ALL ON FUNCTION public.roleta_sdr_meu_aviso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sdr_meu_aviso() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Aviso de quarta: o link do sino abre o pop-up (o resto é o de 20261011120000)
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
    -- Dedup entre execuções: md5(corretor + semana), padrão de metas_dia. É a
    -- mesma chave que roleta_sdr_meu_aviso procura para abrir o pop-up.
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
      -- [CRM] O hash abre o pop-up do placar em qualquer tela do CRM.
      '/fila#aviso-roleta-sdr', _ref
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
-- 3) Sanidade
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.roleta_sdr_meu_aviso()', 'EXECUTE') THEN
    RAISE EXCEPTION 'roleta_sdr_aviso_no_crm: roleta_sdr_meu_aviso aberta para anon';
  END IF;
  IF position('#aviso-roleta-sdr' IN
       pg_get_functiondef('public.roleta_sdr_aviso_meio_semana()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roleta_sdr_aviso_no_crm: aviso de quarta sem o link do pop-up';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
