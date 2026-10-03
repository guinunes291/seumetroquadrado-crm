-- ============================================================================
-- Esteira de comissão: "Marquinhos" só para a visita marcada pelo robô
-- ============================================================================
-- lead_esteira_comissao (drizzle/migrations/0015, Lovable, 28/09) classifica
-- como 'marquinhos' o lead que tem QUALQUER visita sem autor
-- (criado_por_id IS NULL). Mas três caminhos do próprio CRM gravam visita sem
-- autor sem que o robô tenha marcado nada:
--
--   * visita automática "Visita realizada — …": o lead foi para
--     visita_realizada sem visita validada na agenda (20260731121000;
--     auto_gerado = true);
--   * registro histórico da régua de datas (mesma migration; auto_gerado);
--   * reagendamento pelo Modo Visita (salvar_modo_visita, 20260731150000):
--     a visita nova nasce sem autor, com a descrição fixa
--     'Reagendada a partir do Modo Visita.' / 'Reagendada após não
--     comparecimento.'
--
-- O gatilho de vendas grava a fatia do corretor pela esteira, e a da
-- Marquinhos é menor: tier_1 30% contra 40% (lead da empresa), tier_2 35 x 45,
-- tier_3 37 x 50, elite 40 x 55. Exemplo reproduzido (tests/db
-- jornada-lead-venda): corretor tier_1 marca a visita, move o lead para
-- "Visita realizada", vende R$ 500 mil a 3,75% — comissão R$ 5.625 em vez de
-- R$ 7.500.
--
-- Agora a visita do robô é a sem autor que não é automática nem
-- reagendamento. (A Sami, copiloto do corretor no WhatsApp, também gravava a
-- visita sem autor; a edge function sami-agendar-visita passa a gravar o
-- corretor — vale a partir do redeploy dela.) Visita do robô que o corretor
-- reagenda continua contando: a original segue lá.
--
-- Vale para venda registrada depois desta migration: a esteira é gravada no
-- INSERT da venda. As já gravadas não mudam sozinhas — a consulta de revisão
-- está em docs/ops/comissao-tier-esteira.md.
--
-- Idempotente. Espelhada em drizzle/migrations/0053.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lead_esteira_comissao(p_lead uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM agendamentos a WHERE a.lead_id=l.id AND a.tipo='visita' AND a.criado_por_id IS NULL
                   AND NOT a.auto_gerado
                   AND COALESCE(a.descricao, '') NOT IN ('Reagendada a partir do Modo Visita.',
                                                         'Reagendada após não comparecimento.')) THEN 'marquinhos'
    WHEN l.sdr_id IS NOT NULL THEN 'sdr'
    WHEN l.origem::text IN ('captacao_corretor','investimento_corretor') THEN 'lead_proprio'
    ELSE 'lead_empresa' END
  FROM leads l WHERE l.id = p_lead
$$;

-- CREATE OR REPLACE mantém os grants; reafirmados para o replay de qualquer
-- ponto (20261010120100 tirou PUBLIC/anon).
REVOKE ALL ON FUNCTION public.lead_esteira_comissao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_esteira_comissao(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sanidade
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF position('auto_gerado' IN pg_get_functiondef('public.lead_esteira_comissao(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'esteira: lead_esteira_comissao ainda conta visita automática como Marquinhos';
  END IF;
  IF has_function_privilege('anon', 'public.lead_esteira_comissao(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'esteira: lead_esteira_comissao executável por anon';
  END IF;
END;
$guard$;

NOTIFY pgrst, 'reload schema';
