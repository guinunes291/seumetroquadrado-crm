-- ===========================================================================
-- CADÊNCIA — avanço na escrita, varredura vira rede de segurança
-- ===========================================================================
-- Motor original em 20260921120100.
--
-- O QUE MUDA
-- `cadencia_avancar` rodava a cada 5 minutos: 288 varreduras por dia, que
-- acordam o banco mesmo quando não há uma única etapa para avançar. O ritmo
-- existia para o corretor ver a etapa virar logo depois de registrar o toque.
--
-- Só que a espera nunca teve efeito sobre PRAZO nenhum. Desde 20260921120100,
-- o prazo da etapa seguinte sai do `ts` da última tentativa da etapa que
-- fechou, não de `now()`:
--
--     _prazo := public.cadencia_fim_do_dia(COALESCE(_concluida_em, now()), 1);
--
-- Ou seja: um lead que fecha o D1 às 14h ganha exatamente o mesmo prazo de D2
-- se a varredura passar às 14h05 ou às 15h. O atraso era cosmético — o
-- corretor via o rótulo "D1" por mais um tempo numa linha que ele acabou de
-- trabalhar. Pagar 288 execuções por dia por um rótulo é caro.
--
-- A troca: quem avança passa a ser a PRÓPRIA escrita. A RPC dos botões já
-- calcula `etapa_completa` (é o que destaca o botão de WhatsApp na 2ª
-- ligação); agora ela chama o avanço para aquele lead, na mesma transação. O
-- corretor vê a etapa virar na hora, não em até 5 minutos.
--
-- A varredura continua existindo, de hora em hora, como REDE DE SEGURANÇA
-- para o que não passa pela tela: tentativa do discador
-- (`origem = 'discador'`), importação, ou uma transação que morreu entre o
-- insert da tentativa e o avanço.
--
-- ---------------------------------------------------------------------------
-- POR QUE ISSO NÃO É "AVANÇAR EM DOIS LUGARES"
-- ---------------------------------------------------------------------------
-- O cabeçalho da 20260921120200 diz que a RPC NÃO avança a etapa, porque
-- "avançar nos dois lugares criaria duas verdades sobre quando a etapa virou".
-- A regra continua valendo, e esta migration não a viola: o avanço foi
-- fatorado em UMA função, `cadencia_avancar_lead`, e tanto a RPC quanto a
-- varredura chamam ela. Uma regra só, dois gatilhos — que é diferente de duas
-- implementações.
--
-- A guarda contra avanço duplo é a mesma de antes e está dentro dessa função:
-- o UPDATE traz `WHERE cadencia_etapa = <etapa lida>`. Se a varredura e a RPC
-- correrem no mesmo lead, a segunda não encontra linha, `FOUND` é falso e ela
-- registra no log que não aplicou. Nenhuma etapa pula duas casas.
--
-- ---------------------------------------------------------------------------
-- O MODO SOMBRA CONTINUA MANDANDO
-- ---------------------------------------------------------------------------
-- A RPC do corretor obedece `cadencia_config.modo` igual à varredura: em
-- sombra ela registra a tentativa (isso é dado real, sempre gravado) e loga o
-- que faria, mas NÃO mexe na etapa. Se a escrita furasse a sombra, o modo
-- deixaria de significar "nada se move sozinho" no exato momento em que a
-- operação começasse a usar a tela — que é quando ele mais precisa valer.
--
-- Idempotente. Rollback: devolver `cadencia-avancar` para '*/5 * * * *' e
-- restaurar `cadencia_registrar_tentativa` da 20260921120200 (a versão sem a
-- chamada ao avanço).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) O avanço de UM lead, numa função só
-- ---------------------------------------------------------------------------
-- Corpo extraído do laço de `cadencia_avancar` sem mudança de regra: mesma
-- condição de etapa completa, mesmo cálculo de prazo a partir da conclusão,
-- mesmo evento em `lead_eventos`, mesma linha em `cadencia_execucao_log`.
--
-- `_origem` só viaja para o `detalhe` do log; o `job` continua 'avancar' para
-- não mexer no CHECK da tabela e não quebrar consulta de quem já lê esse log.
-- Com ele dá para responder, depois de uma semana, quanto do avanço veio da
-- tela e quanto veio da rede de segurança — que é o número que diz se a
-- varredura de hora em hora ainda se paga.
--
-- Devolve a etapa nova quando aplicou, NULL quando não havia o que fazer ou
-- quando o modo é sombra.
CREATE OR REPLACE FUNCTION public.cadencia_avancar_lead(
  _lead   uuid,
  _modo   text DEFAULT NULL,
  _lote   uuid DEFAULT NULL,
  _origem text DEFAULT 'motor'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _l record;
  _proxima text;
  _concluida_em timestamptz;
  _prazo timestamptz;
  _ok boolean := false;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  SELECT l.id, l.corretor_id, l.cadencia_etapa, l.cadencia_ciclo
    INTO _l
  FROM public.leads l
  WHERE l.id = _lead
    AND l.cadencia_etapa IN ('D1','D2')
    AND l.deleted_at IS NULL
    AND NOT COALESCE(l.na_lixeira, false);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.cadencia_etapa_completa(_l.id, _l.cadencia_etapa) THEN
    RETURN NULL;
  END IF;

  _proxima := CASE _l.cadencia_etapa WHEN 'D1' THEN 'D2' ELSE 'D3' END;

  SELECT max(t.ts) INTO _concluida_em
  FROM public.cadencia_tentativas t
  WHERE t.lead_id = _l.id
    AND t.etapa = _l.cadencia_etapa
    AND t.ciclo = _l.cadencia_ciclo;

  _prazo := public.cadencia_fim_do_dia(COALESCE(_concluida_em, now()), 1);

  IF _m = 'ativo' THEN
    UPDATE public.leads
       SET cadencia_etapa = _proxima,
           cadencia_prazo_ts = _prazo
     WHERE id = _l.id AND cadencia_etapa = _l.cadencia_etapa;
    _ok := FOUND;

    IF _ok THEN
      INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
      VALUES (_l.id, 'cadencia_etapa',
              'Cadência avançou de ' || _l.cadencia_etapa || ' para ' || _proxima || '.',
              'cadencia',
              jsonb_build_object('de_estado', _l.cadencia_etapa,
                                 'para_estado', _proxima,
                                 'origem', _origem));
    END IF;
  END IF;

  INSERT INTO public.cadencia_execucao_log
    (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
  VALUES
    (COALESCE(_lote, gen_random_uuid()), 'avancar', _l.id, _l.corretor_id,
     _l.cadencia_etapa, _proxima, 'etapa_completa', _m, _ok,
     jsonb_build_object('origem', _origem, 'concluida_em', _concluida_em));

  RETURN CASE WHEN _ok THEN _proxima ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_avancar_lead(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.cadencia_avancar_lead(uuid, text, uuid, text) IS
  'Avança UM lead de D1 para D2 ou de D2 para D3 quando a etapa fechou. Regra '
  'única, chamada pela RPC dos botões (origem=escrita) e pela varredura '
  '(origem=motor). Sem grant para authenticated: quem chama são as DEFINER.';

-- ---------------------------------------------------------------------------
-- 2) A varredura agora só orquestra
-- ---------------------------------------------------------------------------
-- Mesmo contrato de retorno de antes (lote, modo, avaliados, aplicados), para
-- não quebrar quem já chama. O laço perdeu a regra e ficou com o recorte.
CREATE OR REPLACE FUNCTION public.cadencia_avancar(_modo text DEFAULT NULL, _limite integer DEFAULT 1000)
RETURNS TABLE(lote_id uuid, modo text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _lote uuid := gen_random_uuid();
  _l record;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  FOR _l IN
    SELECT l.id
    FROM public.leads l
    WHERE l.cadencia_etapa IN ('D1','D2')
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY l.cadencia_prazo_ts NULLS FIRST
    LIMIT GREATEST(COALESCE(_limite, 1000), 1)
  LOOP
    PERFORM public.cadencia_avancar_lead(_l.id, _m, _lote, 'motor');
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_avancar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_avancar(text, integer) TO service_role;

COMMENT ON FUNCTION public.cadencia_avancar(text, integer) IS
  'Rede de segurança de hora em hora: avança quem fechou etapa fora da tela '
  '(discador, importação) ou ficou para trás. O caminho normal é o avanço na '
  'escrita, dentro de cadencia_registrar_tentativa.';

-- ---------------------------------------------------------------------------
-- 3) A RPC dos botões avança na hora
-- ---------------------------------------------------------------------------
-- Idêntica à de 20260921120200 até o cálculo de `etapa_completa`; a partir
-- dali ela chama o avanço e devolve `etapa_nova`, que a Fila do Dia usa para
-- dizer ao corretor o que aconteceu de fato em vez de prometer que "o motor
-- avança em instantes".
CREATE OR REPLACE FUNCTION public.cadencia_registrar_tentativa(
  _lead_id     uuid,
  _canal       text,
  _resultado   text,
  _template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _l public.leads%ROWTYPE;
  _tentativa_id uuid;
  _completa boolean;
  _etapa_nova text;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _l FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  IF _l.cadencia_etapa IS NULL OR _l.cadencia_etapa NOT IN ('D1','D2','D3') THEN
    RAISE EXCEPTION 'lead não está em cadência ativa (etapa: %)',
      COALESCE(_l.cadencia_etapa, 'nenhuma') USING ERRCODE = '22023';
  END IF;

  IF _canal NOT IN ('ligacao','whatsapp') THEN
    RAISE EXCEPTION 'canal inválido: %', _canal USING ERRCODE = '22023';
  END IF;

  IF _canal = 'whatsapp' AND _resultado NOT IN ('enviada','numero_invalido') THEN
    RAISE EXCEPTION 'resultado % não vale para WhatsApp', _resultado USING ERRCODE = '22023';
  END IF;
  IF _canal = 'ligacao' AND _resultado NOT IN
     ('nao_atendeu','caixa_postal','ocupado','atendeu','numero_invalido') THEN
    RAISE EXCEPTION 'resultado % não vale para ligação', _resultado USING ERRCODE = '22023';
  END IF;

  IF public.telefone_suspeito(_l.telefone) THEN
    RAISE EXCEPTION 'telefone suspeito: contate por e-mail' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cadencia_tentativas
    (lead_id, corretor_id, etapa, canal, resultado, template_id, origem, ciclo)
  VALUES
    (_lead_id, _uid, _l.cadencia_etapa, _canal, _resultado, _template_id,
     'crm', _l.cadencia_ciclo)
  RETURNING id INTO _tentativa_id;

  UPDATE public.leads
     SET ultimo_contato = now(),
         ultima_interacao = now()
   WHERE id = _lead_id;

  IF _resultado = 'numero_invalido' THEN
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET status                 = 'perdido'::public.lead_status,
           motivo_perda_categoria = 'numero_invalido',
           motivo_perdido         = 'Número inválido registrado na cadência.',
           cadencia_etapa         = 'encerrado',
           cadencia_prazo_ts      = NULL
     WHERE id = _lead_id;
    PERFORM set_config('app.transicionar_lead', 'off', true);

    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_lead_id, 'cadencia_etapa', 'Encerrado por número inválido.', 'cadencia',
            jsonb_build_object('de_estado', _l.cadencia_etapa,
                               'para_estado', 'encerrado',
                               'motivo', 'numero_invalido'));

    RETURN jsonb_build_object(
      'tentativa_id', _tentativa_id, 'etapa', _l.cadencia_etapa,
      'etapa_completa', false, 'etapa_nova', NULL, 'encerrado', true);
  END IF;

  _completa := public.cadencia_etapa_completa(_lead_id, _l.cadencia_etapa);

  -- O avanço, aqui, na mesma transação. Em sombra devolve NULL e nada muda.
  IF _completa THEN
    _etapa_nova := public.cadencia_avancar_lead(_lead_id, NULL, NULL, 'escrita');
  END IF;

  RETURN jsonb_build_object(
    'tentativa_id', _tentativa_id,
    'etapa', _l.cadencia_etapa,
    'etapa_completa', _completa,
    'etapa_nova', _etapa_nova,
    'encerrado', false);
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid) IS
  'Botões Liguei / Mandar WhatsApp da Fila do Dia. Carimba ts do servidor, '
  'encerra o lead em numero_invalido e, quando a etapa fecha, avança na hora '
  'pela mesma função que a varredura usa. Respeita o modo sombra.';

-- ---------------------------------------------------------------------------
-- 4) A varredura cai para de hora em hora
-- ---------------------------------------------------------------------------
-- De 288 execuções por dia para 24. O minuto 23 evita cair junto de
-- `cadencia-encerrar` (minuto 7): duas varreduras do mesmo motor no mesmo
-- instante disputariam as mesmas linhas sem necessidade nenhuma.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'cadencia-avancar';
    PERFORM cron.schedule('cadencia-avancar', '23 * * * *',
      $cron$SELECT public.cadencia_avancar();$cron$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
