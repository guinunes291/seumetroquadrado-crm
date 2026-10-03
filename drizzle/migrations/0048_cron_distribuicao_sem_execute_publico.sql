-- ============================================================================
-- Cron de distribuição e jobs: fim do EXECUTE público
-- ============================================================================
-- `processar_distribuicao_automatica()` (cron `distribuicao-auto`, a cada
-- minuto) nunca teve REVOKE FROM PUBLIC: o ACL era {=X/postgres, ...}, ou
-- seja, QUALQUER chamador da API — inclusive anônimo — rodava a rodada
-- inteira (triagem, repasse por SLA, leads parados) quando quisesse. E pior
-- que o anon: muitas funções do motor tratam `auth.uid() IS NULL` como
-- "chamada do sistema", e o anon também chega com uid nulo. Um corretor
-- autenticado, por sua vez, disparava os repasses por SLA e de parados (eles
-- rodam sem checagem de papel; só a triagem barrava não-admin).
--
-- Agora:
--   * processar_distribuicao_automatica: sem PUBLIC/anon; authenticated
--     mantém o EXECUTE para o botão "Rodar distribuição", com checagem de
--     ADMIN na entrada; pg_cron (dono) e service_role seguem iguais;
--   * jobs que só o pg_cron / service_role chamam (nenhuma tela nem edge
--     function os usa — conferido em src/ e supabase/functions/) perdem o
--     EXECUTE de PUBLIC, anon e authenticated. Entre eles,
--     resetar_presenca_diaria, que zerava a presença de TODOS — com a zona
--     estrita, todo lead de zona passaria a esperar;
--   * sync_proximo_followup é chamado pelo trigger de tarefas na sessão de
--     quem edita a tarefa: perde só PUBLIC/anon;
--   * _msg_fora_da_regiao (zona estrita, uso interno) nasceu com o grant
--     padrão e devolvia o nome de qualquer perfil a quem passasse o id.
--
-- Fora daqui (auditoria registrada em docs/ops/funcoes-executaveis-anon.md):
-- as demais SECURITY DEFINER ainda executáveis por anon — leituras de
-- dashboard e funções com checagem própria — pedem revisão uma a uma, porque
-- algumas servem telas públicas.
--
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.processar_distribuicao_automatica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead_id uuid;
  _res jsonb;
  _dist int := 0;
  _falhas int := 0;
  _sla int := 0;
  _redist int := 0;
  _max_tent int := (public.get_dist_setting('reprocesso_max_tentativas') #>> '{}')::int;
BEGIN
  -- Rodada manual ("Rodar distribuição" da Central) é de ADMIN. Sem JWT é o
  -- pg_cron (dono da função) ou service_role — o anon perdeu o EXECUTE abaixo,
  -- então "auth.uid() nulo" volta a significar só "sistema".
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _lead_id IN
    SELECT l.id FROM public.leads l
    WHERE l.corretor_id IS NULL
      AND l.sdr_id IS NULL
      AND l.status IN ('novo', 'aguardando_atendimento')
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status IN ('pendente','em_analise')
          AND e.tentativas >= _max_tent
          AND e.updated_at > now() - interval '30 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.distribuicao_excecoes e
        WHERE e.lead_id = l.id
          AND e.status = 'arquivada'
          AND e.resolvida_em >= COALESCE(l.data_distribuicao, l.created_at)
      )
    ORDER BY l.created_at ASC
    LIMIT 200
  LOOP
    _res := public.triar_e_distribuir_lead(_lead_id, 'cron');
    IF (_res->>'ok')::boolean THEN
      _dist := _dist + 1;
    ELSE
      _falhas := _falhas + 1;
    END IF;
  END LOOP;

  _sla := public.redistribuir_sla_webhook();
  _redist := public.redistribuir_leads_parados();

  RETURN jsonb_build_object(
    'distribuidos', _dist,
    'sem_corretor', _falhas,
    'repassados_sla', _sla,
    'redistribuidos', _redist,
    'em', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.processar_distribuicao_automatica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processar_distribuicao_automatica() TO authenticated, service_role;

-- Jobs do pg_cron / service_role.
REVOKE ALL ON FUNCTION public.resetar_presenca_diaria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resetar_presenca_diaria() TO service_role;
REVOKE ALL ON FUNCTION public.gerar_alertas_leads_parados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_alertas_leads_parados() TO service_role;
REVOKE ALL ON FUNCTION public.gerar_pushes_lembretes_visita() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_pushes_lembretes_visita() TO service_role;
REVOKE ALL ON FUNCTION public.recalcular_temperatura_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_temperatura_leads() TO service_role;
REVOKE ALL ON FUNCTION public.conceder_conquistas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conceder_conquistas(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.regua_devolucao_processar(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regua_devolucao_processar(text, integer) TO service_role;

-- Trigger de tarefas chama na sessão do usuário: fica para authenticated.
REVOKE ALL ON FUNCTION public.sync_proximo_followup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_proximo_followup(uuid) TO authenticated, service_role;

-- Zona estrita: mensagem da guarda é interna.
REVOKE ALL ON FUNCTION public._msg_fora_da_regiao(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._msg_fora_da_regiao(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Sanidade
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.processar_distribuicao_automatica()',
    'public.resetar_presenca_diaria()',
    'public.gerar_alertas_leads_parados()',
    'public.gerar_pushes_lembretes_visita()',
    'public.recalcular_temperatura_leads()',
    'public.conceder_conquistas(uuid)',
    'public.regua_devolucao_processar(text,integer)',
    'public.sync_proximo_followup(uuid)',
    'public._msg_fora_da_regiao(text,uuid)'
  ] LOOP
    IF has_function_privilege('anon', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'permissões: % continua executável por anon', _fn;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', 'public.processar_distribuicao_automatica()', 'EXECUTE') THEN
    RAISE EXCEPTION 'permissões: o botão Rodar distribuição (admin) perdeu o EXECUTE';
  END IF;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
