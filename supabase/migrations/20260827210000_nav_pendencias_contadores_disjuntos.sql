-- ============================================================================
-- NAV_PENDENCIAS v4 — contadores DISJUNTOS: cada número tem um único dono.
--
-- Princípio da auditoria das abas laterais (2026-08-27): um badge acende em
-- exatamente UM hub, e zerar a fila nesse hub apaga o badge em todo lugar.
--
-- O problema da v3: `tarefas_vencidas` contava TODAS as tarefas vencidas,
-- inclusive as de CONTATO (follow_up/ligacao/whatsapp/email) — exatamente as
-- que `followups` conta. O corretor zerava a fila da régua no hub Follow-Up e
-- o badge de tarefas da Carteira continuava aceso pelas MESMAS tarefas,
-- forçando a re-visita de fim de dia que a auditoria mediu.
--
-- A v4 torna os dois contadores disjuntos por construção:
--   - `followups`        → LEADS com tarefa de CONTATO até hoje (como na v3);
--   - `tarefas_vencidas` → tarefas vencidas que NÃO são de contato
--                          (visita, documentacao, outro…) — o que sobra é da
--                          Carteira de verdade.
-- Junto, no registro (sistemas.ts), a seção "Trabalhar carteira" deixou de
-- somar b.atendimento — a entrada é da Prospecção (Modo Foco), dona única.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.nav_pendencias()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tudo boolean := false;
  _escopo uuid[];
  _atendimento int := 0;
  _tarefas int := 0;
  _agenda int := 0;
  _aprov int := 0;
  _followups int := 0;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RETURN jsonb_build_object('atendimento',0,'tarefas_vencidas',0,'agenda_hoje',0,'aprovacoes',0,'followups',0);
  END IF;

  _tudo := public.ve_carteira_completa(_uid);
  IF NOT _tudo THEN
    SELECT array_agg(DISTINCT c) INTO _escopo
    FROM (
      SELECT _uid AS c
      UNION
      SELECT public.corretores_do_gestor(_uid)
    ) s
    WHERE c IS NOT NULL;
    _escopo := COALESCE(_escopo, ARRAY[_uid]);
  END IF;

  SELECT count(*) INTO _atendimento
  FROM public.leads l
  WHERE l.status = 'aguardando_atendimento'
    AND l.na_lixeira = false
    AND (_tudo OR l.corretor_id = ANY(_escopo));

  -- v4: SÓ tarefas que não são de contato — as de contato são o domínio do
  -- contador `followups` (a régua), e um esforço não acende dois badges.
  SELECT count(*) INTO _tarefas
  FROM public.tarefas t
  WHERE t.status NOT IN ('concluida','cancelada')
    AND t.deleted_at IS NULL
    AND t.tipo NOT IN ('follow_up','ligacao','whatsapp','email')
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento < now()
    AND (_tudo OR t.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _agenda
  FROM public.agendamentos a
  WHERE a.status = 'agendado'
    AND a.deleted_at IS NULL
    AND (a.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
        = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (_tudo OR a.corretor_id = ANY(_escopo));

  SELECT count(*) INTO _aprov
  FROM public.vendas v
  WHERE v.status_venda = 'pendente'
    AND (_tudo OR v.corretor_id = ANY(_escopo));

  -- Follow-ups do DIA: LEADS com tarefa de contato aberta vencendo até hoje
  -- (BRT) — vencidas inclusas (inalterado da v3).
  SELECT count(DISTINCT COALESCE(t.lead_id, t.id)) INTO _followups
  FROM public.tarefas t
  WHERE t.status NOT IN ('concluida','cancelada')
    AND t.deleted_at IS NULL
    AND t.tipo IN ('follow_up','ligacao','whatsapp','email')
    AND t.data_vencimento IS NOT NULL
    AND (t.data_vencimento AT TIME ZONE 'America/Sao_Paulo')::date
        <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (_tudo OR t.corretor_id = ANY(_escopo));

  RETURN jsonb_build_object(
    'atendimento', _atendimento,
    'tarefas_vencidas', _tarefas,
    'agenda_hoje', _agenda,
    'aprovacoes', _aprov,
    'followups', _followups
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nav_pendencias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nav_pendencias() TO authenticated;

-- ---------------------------------------------------------------------------
-- Sanidade: falha o replay se a disjunção não ficou de pé
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _def text := pg_get_functiondef('public.nav_pendencias()'::regprocedure);
BEGIN
  IF _def NOT LIKE '%tipo NOT IN (''follow_up''%' THEN
    RAISE EXCEPTION 'nav_pendencias v4: tarefas_vencidas ainda conta tarefas de contato';
  END IF;
  IF (public.nav_pendencias() ? 'followups') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'nav_pendencias v4: chave followups sumiu do objeto zerado';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
