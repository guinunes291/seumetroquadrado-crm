-- SDR cria lead na PRÓPRIA base e puxa lead existente ao cadastrar o telefone.
-- Por quê: (1) o SDR cadastrava lead com corretor_id = ele mesmo (caía como
-- carteira de corretor, fora da base de pré-venda); (2) o dedup comparava os 10
-- últimos dígitos crus, então "91 8017-0154" (sem o 9º) não batia com
-- "91 98017-0154" e gerava duplicata invisível. Agora compara os 9 últimos
-- dígitos do número normalizado (normalize_phone_smq insere o 9º) — mesma
-- convenção do merge e de buscar_lead_ativo_por_telefone_global.
-- Regra de posse (decisão do Guilherme, 23/09): o SDR puxa de qualquer dono
-- (sem dono, outro SDR ou corretor), EXCETO lead de agendado para frente ou com
-- venda viva — esses só a gestão move. Perdido/lixeira não são puxados.
CREATE OR REPLACE FUNCTION public.criar_lead_dedup(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _nome text := NULLIF(btrim(_payload->>'nome'), '');
  _telefone text := NULLIF(btrim(_payload->>'telefone'), '');
  _email text := NULLIF(lower(btrim(_payload->>'email')), '');
  _origem public.lead_origem;
  _projeto_id uuid := NULLIF(_payload->>'projeto_id', '')::uuid;
  _projeto_nome text := NULLIF(btrim(_payload->>'projeto_nome'), '');
  _observacoes text := NULLIF(btrim(_payload->>'observacoes'), '');
  _corretor_id uuid := NULLIF(_payload->>'corretor_id', '')::uuid;
  _zona text := NULLIF(btrim(_payload->>'zona'), '');
  _bairro text := NULLIF(btrim(_payload->>'bairro'), '');
  _status public.lead_status := COALESCE(NULLIF(_payload->>'status', '')::public.lead_status, 'novo'::public.lead_status);
  _eh_sdr boolean;
  _suf text;
  _dup public.leads%ROWTYPE;
  _novo_id uuid;
  _sdr_pegou boolean := false;
  _bloqueado boolean := false;
  _sdr_id uuid := NULL;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF _nome IS NULL OR _telefone IS NULL THEN
    RAISE EXCEPTION 'nome e telefone são obrigatórios' USING ERRCODE = '22023';
  END IF;
  _eh_sdr := public.has_role(_uid, 'sdr'::public.app_role)
             AND NOT public.has_role(_uid, 'admin'::public.app_role)
             AND NOT public.has_role(_uid, 'gestor'::public.app_role)
             AND NOT public.has_role(_uid, 'superintendente'::public.app_role);
  IF _eh_sdr THEN
    _corretor_id := NULL;
    _sdr_id := _uid;
    _status := 'aguardando_atendimento'::public.lead_status;
  END IF;
  IF NOT public.pode_atribuir_lead(_uid, _corretor_id) THEN
    RAISE EXCEPTION 'sem permissão para criar lead com este corretor' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('novo'::public.lead_status, 'aguardando_atendimento'::public.lead_status) THEN
    RAISE EXCEPTION 'status inicial inválido para criação manual' USING ERRCODE = '22023';
  END IF;
  _origem := COALESCE(NULLIF(_payload->>'origem', '')::public.lead_origem, 'outro'::public.lead_origem);

  _suf := right(public.telefone_digits(COALESCE(public.normalize_phone_smq(_telefone), _telefone)), 9);
  IF length(_suf) >= 8 THEN
    PERFORM pg_advisory_xact_lock(hashtext('lead_dedup:' || _suf));

    SELECT l.* INTO _dup
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND right(public.telefone_digits(COALESCE(l.telefone_e164, l.telefone)), 9) = _suf
      AND (_projeto_id IS NULL OR l.projeto_id IS NULL OR l.projeto_id = _projeto_id)
    ORDER BY l.na_lixeira, l.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF _eh_sdr AND _dup.sdr_id IS DISTINCT FROM _uid THEN
        IF _dup.na_lixeira
           OR _dup.status IN ('agendado','visita_realizada','proposta_enviada','analise_credito',
                              'contrato_fechado','pos_venda','perdido')
           OR public._lead_venda_viva(_dup.id) THEN
          _bloqueado := true;
        ELSE
          PERFORM set_config('app.sdr_motor', 'on', true);
          UPDATE public.leads
             SET sdr_id = _uid,
                 corretor_anterior_id = COALESCE(_dup.corretor_id, corretor_anterior_id),
                 corretor_id = NULL,
                 sdr_entregue_em = NULL,
                 sdr_devolvido_em = NULL,
                 sdr_interesse_confirmado = false
           WHERE id = _dup.id;
          IF _dup.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status)
             AND public.transicao_lead_permitida(_dup.status, 'aguardando_atendimento'::public.lead_status, false) THEN
            BEGIN
              PERFORM public.transicionar_lead(_dup.id, 'aguardando_atendimento'::public.lead_status,
                'Cadastro pelo SDR: lead já existia no CRM', 'Fazer o primeiro contato');
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          PERFORM public._sdr_log_base(_dup.id, _uid,
            'SDR puxou lead existente pelo cadastro (' || _dup.status::text || ')',
            'sdr_puxou', 'criacao_manual',
            jsonb_build_object('corretor_anterior', _dup.corretor_id, 'sdr_anterior', _dup.sdr_id));
          _sdr_pegou := true;
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'duplicado', true,
        'lead_id', _dup.id,
        'nome', CASE WHEN _sdr_pegou OR _bloqueado OR public.pode_acessar_lead(_uid, _dup.id) THEN _dup.nome ELSE NULL END,
        'na_carteira', _sdr_pegou OR (_eh_sdr AND _dup.sdr_id = _uid) OR public.pode_acessar_lead(_uid, _dup.id),
        'sdr_pegou', _sdr_pegou,
        'bloqueado_etapa', _bloqueado,
        'status', CASE WHEN _bloqueado THEN _dup.status::text ELSE NULL END
      );
    END IF;
  END IF;

  IF _sdr_id IS NOT NULL THEN
    PERFORM set_config('app.sdr_motor', 'on', true);
  END IF;
  INSERT INTO public.leads (
    nome, telefone, email, origem, projeto_id, projeto_nome, observacoes,
    corretor_id, sdr_id, status, zona, bairro
  ) VALUES (
    _nome, _telefone, _email, _origem, _projeto_id, _projeto_nome, _observacoes,
    _corretor_id, _sdr_id, _status, _zona, _bairro
  )
  RETURNING id INTO _novo_id;

  RETURN jsonb_build_object('duplicado', false, 'lead_id', _novo_id);
END;
$function$;