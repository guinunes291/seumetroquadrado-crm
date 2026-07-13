-- Contadores de pendência da navegação (badges da sidebar), num RPC só.
--
-- SECURITY INVOKER de propósito: a RLS de cada tabela decide o recorte —
-- corretor conta a própria carteira; gestor/admin contam o que suas policies
-- permitem ver. Nenhum dado novo é exposto: são as mesmas linhas que as telas
-- já mostram, agora agregadas em uma chamada única e barata.
--
-- O cliente consome via rpcWithFallback: sem esta migration aplicada, os
-- badges simplesmente não aparecem (nada quebra).

CREATE OR REPLACE FUNCTION public.nav_pendencias()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- Leads novos esperando primeiro atendimento (fila de entrada).
    'atendimento', (
      SELECT count(*) FROM public.leads
      WHERE status = 'aguardando_atendimento' AND na_lixeira = false
    ),
    -- Tarefas/follow-ups vencidos e ainda abertos.
    'tarefas_vencidas', (
      SELECT count(*) FROM public.tarefas
      WHERE status NOT IN ('concluida', 'cancelada')
        AND deleted_at IS NULL
        AND data_vencimento IS NOT NULL
        AND data_vencimento < now()
    ),
    -- Agendamentos de HOJE no fuso da operação.
    'agenda_hoje', (
      SELECT count(*) FROM public.agendamentos
      WHERE status = 'agendado'
        AND deleted_at IS NULL
        AND (data_inicio AT TIME ZONE 'America/Sao_Paulo')::date
            = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ),
    -- Vendas aguardando aprovação da gestão (visível conforme RLS de vendas).
    'aprovacoes', (
      SELECT count(*) FROM public.vendas
      WHERE status_venda = 'pendente'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.nav_pendencias() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nav_pendencias() FROM anon;
GRANT EXECUTE ON FUNCTION public.nav_pendencias() TO authenticated;
