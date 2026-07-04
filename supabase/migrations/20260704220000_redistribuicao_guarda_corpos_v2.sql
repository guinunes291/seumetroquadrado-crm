-- Restaura os guarda-corpos da redistribuição de parados (PR #58), reconciliando
-- com a mudança do Lovable (migration 20260704194347).
--
-- Contexto: a migration 20260704180000 (PR #58) reescreveu
-- redistribuir_leads_parados() com guarda-corpos — máx. 3 tentativas por lead,
-- caps por rodada/corretor, movimento atômico (sem arrancar o lead para a base)
-- e respeito a corretores_que_tentaram. Em 20260704194347 o Lovador reverteu essa
-- função para a versão ANTIGA (que faz corretor_id=NULL / status='novo' de todo
-- lead parado, sem cap nem trava de tentativas) só para adicionar a intenção
-- legítima de "não contar redistribuição no leads_recebidos_hoje". Como aquela
-- migration tem timestamp posterior, o bug do "120 → 0" voltou a valer no banco.
--
-- Esta migration (timestamp posterior a ambas) restaura TODOS os guarda-corpos e
-- ao mesmo tempo mantém a decisão do Lovable: a redistribuição NÃO incrementa
-- fila_distribuicao.leads_recebidos_hoje (redistribuir um lead parado não é
-- "receber um lead novo"). O filtro leads_recebidos_hoje < max_leads_dia continua
-- valendo na escolha do destino, para não sobrecarregar quem já bateu a cota.
--
-- Observação: o overload distribuir_lead_elegivel(uuid, boolean) criado pelo
-- Lovable fica definido porém sem uso (esta função tem picker próprio); é
-- inofensivo e não é removido aqui.

CREATE OR REPLACE FUNCTION public.redistribuir_leads_parados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead record;
  _proximo uuid;
  _max_pos int;
  _tentou uuid[];
  _qtd int := 0;
BEGIN
  FOR _lead IN
    WITH candidatos AS (
      SELECT l.id, l.corretor_id, l.data_distribuicao, l.corretores_que_tentaram,
             COALESCE(dc.timeout_horas, 24) AS timeout_horas,
             row_number() OVER (
               PARTITION BY l.corretor_id ORDER BY l.data_distribuicao ASC
             ) AS rn
      FROM public.leads l
      LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL
        AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL
        AND l.data_distribuicao IS NOT NULL
        -- Máx. 3 tentativas: depois o lead fica com o corretor e vai para a
        -- triagem manual (alerta diário de leads parados).
        AND COALESCE(l.tentativas_redistribuicao, 0) < 3
        AND l.data_distribuicao < now() - (COALESCE(dc.timeout_horas, 24) || ' hours')::interval
    )
    -- Caps: 10 por corretor por rodada e 50 no total, mais antigos primeiro —
    -- nenhuma carteira é zerada de uma só vez.
    SELECT id, corretor_id, data_distribuicao, corretores_que_tentaram, timeout_horas
    FROM candidatos
    WHERE rn <= 10
    ORDER BY data_distribuicao ASC
    LIMIT 50
  LOOP
    _tentou := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
    IF NOT (_lead.corretor_id = ANY(_tentou)) THEN
      _tentou := array_append(_tentou, _lead.corretor_id);
    END IF;

    -- Próximo elegível que ainda NÃO teve o lead (mesmo picker de
    -- marcar_lead_perdido). Sem destino → o lead permanece onde está.
    SELECT fd.corretor_id INTO _proximo
    FROM public.fila_distribuicao fd
    WHERE fd.ativo = true
      AND fd.leads_recebidos_hoje < fd.max_leads_dia
      AND NOT (fd.corretor_id = ANY(_tentou))
      AND public.corretor_elegivel(fd.corretor_id) = true
    ORDER BY fd.posicao ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF _proximo IS NULL THEN
      CONTINUE;
    END IF;

    -- Bump da roleta SEM incrementar leads_recebidos_hoje: redistribuir um lead
    -- parado não conta como "lead novo do dia" (intenção do Lovable, 20260704194347).
    SELECT COALESCE(MAX(posicao), 0) INTO _max_pos FROM public.fila_distribuicao;
    UPDATE public.fila_distribuicao
       SET posicao = _max_pos + 1,
           ultima_distribuicao = now()
     WHERE corretor_id = _proximo;

    UPDATE public.leads
       SET corretor_anterior_id = _lead.corretor_id,
           corretor_id = _proximo,
           status = 'aguardando_atendimento',
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao, 0) + 1,
           corretores_que_tentaram = array_append(_tentou, _proximo)
     WHERE id = _lead.id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo)
    VALUES (_lead.id, _proximo, 'redistribuicao',
            'Lead parado há +' || _lead.timeout_horas ||
            'h em aguardando_atendimento — redistribuído (corretor anterior: ' ||
            _lead.corretor_id || ')');

    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END;
$$;
