CREATE OR REPLACE FUNCTION public._bolsao_elegivel(l public.leads)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT l.corretor_id IS NULL
    AND l.deleted_at IS NULL
    AND NOT l.na_lixeira
    AND NOT COALESCE(l.opt_out, false)
    AND public.telefone_discavel(l.telefone)
    AND NOT public._lead_venda_viva(l.id)
    AND l.status NOT IN ('contrato_fechado'::public.lead_status,
                         'pos_venda'::public.lead_status)
    AND NOT (
      l.status = 'perdido'::public.lead_status
      AND public.motivo_perda_sem_retrabalho(l.motivo_perda_categoria)
    )
    AND l.arquivado_em IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.reativacao_fila r
      WHERE r.lead_id = l.id
        AND r.status IN ('aguardando','em_discagem','com_sdr')
    );
$$;

COMMENT ON FUNCTION public._bolsao_elegivel(public.leads) IS
  'Predicado do Bolsão. Desde 20260921120200 exclui lead arquivado e lead com linha aberta em reativacao_fila.';

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
      'etapa_completa', false, 'encerrado', true);
  END IF;

  _completa := public.cadencia_etapa_completa(_lead_id, _l.cadencia_etapa);

  RETURN jsonb_build_object(
    'tentativa_id', _tentativa_id,
    'etapa', _l.cadencia_etapa,
    'etapa_completa', _completa,
    'encerrado', false);
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_registrar_tentativa(uuid, text, text, uuid) IS
  'Botões Liguei / Mandar WhatsApp da Fila do Dia. Carimba ts do servidor. numero_invalido encerra o lead. Não avança a etapa.';

CREATE OR REPLACE FUNCTION public.cadencia_marcar_respondeu(
  _lead_id          uuid,
  _proxima_acao     text,
  _proximo_followup timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _l public.leads%ROWTYPE;
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
  IF _l.cadencia_etapa NOT IN ('D1','D2','D3') THEN
    RAISE EXCEPTION 'lead não está em cadência ativa' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(COALESCE(_proxima_acao, '')), '') IS NULL THEN
    RAISE EXCEPTION 'próxima ação é obrigatória ao marcar resposta'
      USING ERRCODE = '22023';
  END IF;
  IF _proximo_followup IS NULL OR _proximo_followup <= now() THEN
    RAISE EXCEPTION 'a próxima ação precisa de data no futuro'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET cadencia_etapa    = 'respondeu',
         cadencia_prazo_ts = NULL,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status,
                           'aguardando_corretor'::public.lead_status)
             THEN 'em_atendimento'::public.lead_status
           ELSE status
         END,
         proxima_acao     = btrim(_proxima_acao),
         ultima_interacao = now()
   WHERE id = _lead_id;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  INSERT INTO public.tarefas
    (titulo, descricao, tipo, status, prioridade, lead_id, corretor_id,
     criado_por, data_vencimento, origem_automatica)
  VALUES
    (btrim(_proxima_acao),
     'Passo combinado quando o cliente respondeu na cadência (' || _l.cadencia_etapa || ').',
     'follow_up'::public.tarefa_tipo, 'pendente'::public.tarefa_status,
     'alta'::public.tarefa_prioridade, _lead_id, COALESCE(_l.corretor_id, _uid),
     _uid, _proximo_followup, true);

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_lead_id, 'cadencia_etapa',
          'Cliente respondeu — lead saiu da cadência para a qualificação.',
          'cadencia',
          jsonb_build_object('de_estado', _l.cadencia_etapa,
                             'para_estado', 'respondeu'));

  RETURN jsonb_build_object('etapa_anterior', _l.cadencia_etapa, 'ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_marcar_respondeu(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_marcar_respondeu(uuid, text, timestamptz)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cadencia_fila_v1(
  _corretor uuid DEFAULT NULL,
  _take     integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _target uuid := COALESCE(_corretor, auth.uid());
  _fim_hoje timestamptz := public.cadencia_fim_do_dia(now(), 0);
  _itens jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _target <> _uid AND NOT public.pode_acessar_corretor(_uid, _target) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _take := LEAST(GREATEST(COALESCE(_take, 200), 1), 500);

  SELECT COALESCE(jsonb_agg(item ORDER BY ordem), '[]'::jsonb) INTO _itens
  FROM (
    SELECT
      row_number() OVER (
        ORDER BY
          CASE WHEN l.cadencia_prazo_ts < date_trunc('day', _fim_hoje) THEN 1 ELSE 2 END,
          CASE WHEN l.cadencia_prazo_ts < date_trunc('day', _fim_hoje)
               THEN l.cadencia_prazo_ts END ASC NULLS LAST,
          CASE l.cadencia_etapa WHEN 'D1' THEN 1 WHEN 'D2' THEN 2 ELSE 3 END,
          public.cadencia_prioridade_reativacao(l.id) ASC,
          l.created_at ASC
      ) AS ordem,
      jsonb_build_object(
        'id', l.id,
        'nome', l.nome,
        'telefone', l.telefone,
        'email', l.email,
        'status', l.status::text,
        'etapa', l.cadencia_etapa,
        'ciclo', l.cadencia_ciclo,
        'reativado', l.reativado,
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
      ) AS item
    FROM public.leads l
    WHERE l.corretor_id = _target
      AND l.cadencia_etapa IN ('D1','D2','D3')
      AND l.cadencia_prazo_ts IS NOT NULL
      AND l.cadencia_prazo_ts <= _fim_hoje
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    LIMIT _take
  ) s;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'corretor_id', _target,
    'itens', _itens
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_fila_v1(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_fila_v1(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_fila_v1(uuid, integer) IS
  'Fila do Dia da cadência: leads do corretor cujo prazo vence hoje ou já venceu.';

CREATE OR REPLACE VIEW public.v_reativacao_discador
WITH (security_invoker = true) AS
SELECT r.id,
       r.lead_id,
       COALESCE(l.telefone_e164, l.telefone) AS telefone,
       l.nome,
       r.empreendimento,
       r.faixa_renda,
       r.horarios_tentados,
       r.tentativas_reativacao,
       r.prioridade,
       r.entrou_em,
       r.elegivel_em
FROM public.reativacao_fila r
JOIN public.leads l ON l.id = r.lead_id
WHERE r.status = 'aguardando'
  AND r.elegivel_em <= now()
  AND NOT COALESCE(l.opt_out, false)
  AND l.deleted_at IS NULL
  AND NOT COALESCE(l.na_lixeira, false)
  AND l.arquivado_em IS NULL
ORDER BY r.prioridade, r.entrou_em DESC;

REVOKE ALL ON public.v_reativacao_discador FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_reativacao_discador TO service_role;

COMMENT ON VIEW public.v_reativacao_discador IS
  'Fila do discador na reativação: elegível hoje, maior renda primeiro, opt-out filtrado na própria view.';

CREATE OR REPLACE FUNCTION public.reativacao_marcar_reativado(
  _fila_id uuid,
  _notas   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.reativacao_fila%ROWTYPE;
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _r FROM public.reativacao_fila WHERE id = _fila_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'linha de reativação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF _r.status IN ('reativado','arquivado') THEN
    RAISE EXCEPTION 'linha já finalizada (%)', _r.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.reativacao_fila
     SET status = 'reativado',
         sdr_id = COALESCE(_uid, sdr_id),
         sdr_notas = COALESCE(NULLIF(btrim(_notas), ''), sdr_notas),
         finalizado_em = now()
   WHERE id = _fila_id;

  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET status                    = 'aguardando_corretor'::public.lead_status,
         motivo_perda_categoria    = NULL,
         motivo_perdido            = NULL,
         data_perda                = NULL,
         corretor_id               = NULL,
         classe_lead               = 'quente',
         reativado                 = true,
         cadencia_ciclo            = cadencia_ciclo + 1,
         cadencia_etapa            = NULL,
         cadencia_prazo_ts         = NULL,
         cadencia_inicio_ts        = NULL,
         tentativas_redistribuicao = 0,
         corretores_que_tentaram   = '{}'::uuid[],
         proxima_acao              = 'Reativado pelo SDR — aguardando roleta',
         ultima_interacao          = now()
   WHERE id = _r.lead_id;
  PERFORM set_config('app.transicionar_lead', 'off', true);

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_r.lead_id, 'cadencia_etapa',
          'Lead reativado pelo SDR — devolvido à roleta da campanha.', 'reativacao',
          jsonb_build_object('de_estado', 'reativacao', 'para_estado', 'roleta',
                             'sdr_notas', _notas));

  RETURN jsonb_build_object('lead_id', _r.lead_id, 'ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reativacao_marcar_reativado(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reativacao_marcar_reativado(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reativacao_marcar_sem_retorno(_fila_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.reativacao_fila%ROWTYPE;
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _r FROM public.reativacao_fila WHERE id = _fila_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'linha de reativação não encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.reativacao_fila
     SET status = 'arquivado', finalizado_em = now(),
         sdr_id = COALESCE(_uid, sdr_id)
   WHERE id = _fila_id;

  UPDATE public.leads
     SET cadencia_etapa = 'arquivado',
         arquivado_em   = now(),
         proxima_acao   = 'Arquivado: só volta por formulário novo'
   WHERE id = _r.lead_id;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (_r.lead_id, 'cadencia_etapa',
          'Reativação sem retorno — lead arquivado.', 'reativacao',
          jsonb_build_object('de_estado', 'reativacao', 'para_estado', 'arquivado'));

  RETURN jsonb_build_object('lead_id', _r.lead_id, 'ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reativacao_marcar_sem_retorno(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reativacao_marcar_sem_retorno(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reativacao_desarquivar(_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config('app.transicionar_lead', 'on', true);
  UPDATE public.leads
     SET arquivado_em   = NULL,
         cadencia_etapa = NULL,
         cadencia_ciclo = 1,
         reativado      = false,
         status = CASE WHEN status = 'perdido'::public.lead_status
                       THEN 'aguardando_corretor'::public.lead_status
                       ELSE status END,
         motivo_perda_categoria = NULL,
         motivo_perdido = NULL,
         data_perda = NULL
   WHERE id = _lead_id AND arquivado_em IS NOT NULL;
  PERFORM set_config('app.transicionar_lead', 'off', true);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.reativacao_desarquivar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reativacao_desarquivar(uuid) TO service_role;

COMMENT ON FUNCTION public.reativacao_desarquivar(uuid) IS
  'Lead arquivado que preencheu formulário novo volta como lead novo, ciclo 1.';

NOTIFY pgrst, 'reload schema';
