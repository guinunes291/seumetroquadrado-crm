-- Discador em POOL COMPARTILHADO: a fila do "Iniciar agora" passa a ser TODA
-- a base do CRM em Aguardando atendimento (não só a carteira do corretor).
--
-- 1) Trava anti-colisão: dois corretores discando ao mesmo tempo não podem
--    enfileirar o MESMO lead. A sonax-campanha (service role) "reserva" cada
--    lote (discador_reservado_por/em) antes de enfileirar; reserva expira por
--    TTL (o lead volta ao pool) e é limpa no "Parar discador" e na tabulação.
-- 2) Ficha do pop-up: o lead do pool ainda não é da carteira do corretor — a
--    RLS de leads bloquearia a ficha. A RPC ficha_chamada_ativa libera a
--    leitura APENAS quando a chamada é do próprio corretor (ele está NA
--    ligação com esse lead).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS discador_reservado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS discador_reservado_em timestamptz;

COMMENT ON COLUMN public.leads.discador_reservado_por IS
  'Corretor que reservou o lead num lote do discador (pool compartilhado). Expira por TTL.';
COMMENT ON COLUMN public.leads.discador_reservado_em IS
  'Quando a reserva do discador foi feita — anti-colisão entre corretores discando o pool.';

-- O pool é consultado por status + reserva; o predicado espelha os filtros
-- fixos da fila (lixeira/deleted/opt-out ficam de fora sempre).
CREATE INDEX IF NOT EXISTS idx_leads_discador_pool
  ON public.leads (status, discador_reservado_em)
  WHERE na_lixeira = false AND deleted_at IS NULL AND opt_out = false;

-- Ficha do pop-up de chamada ativa: SECURITY DEFINER com o gate na CHAMADA —
-- só devolve o lead se a chamada pertence ao corretor autenticado. Não abre a
-- carteira alheia: sem uma chamada SUA com esse lead, nada volta.
CREATE OR REPLACE FUNCTION public.ficha_chamada_ativa(p_chamada_id uuid)
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone text,
  status public.lead_status,
  projeto_nome text,
  ultima_interacao timestamptz,
  proximo_followup timestamptz,
  corretor_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT l.id, l.nome, l.telefone, l.status, l.projeto_nome,
         l.ultima_interacao, l.proximo_followup, l.corretor_id
  FROM public.chamadas c
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.id = p_chamada_id
    AND c.corretor_id = (SELECT auth.uid())
    AND l.na_lixeira = false
    AND l.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.ficha_chamada_ativa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ficha_chamada_ativa(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
