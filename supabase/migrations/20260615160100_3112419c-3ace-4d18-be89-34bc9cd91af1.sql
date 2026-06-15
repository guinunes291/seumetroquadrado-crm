-- Histórico de transições de status do lead + evento automático na timeline.
-- Mantém o nome em inglês (consistente com distribution_log e com o schema de
-- referência). Antes só havia o audit_log genérico; isto torna o funil auditável
-- e habilita métricas de venda por data real da transição (não por data de criação).

CREATE TABLE public.lead_status_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  de_status public.lead_status,
  para_status public.lead_status NOT NULL,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lst_lead ON public.lead_status_transitions(lead_id, created_at DESC);
CREATE INDEX idx_lst_para_status ON public.lead_status_transitions(para_status, created_at);
CREATE INDEX idx_lst_corretor ON public.lead_status_transitions(corretor_id, para_status, created_at);

GRANT SELECT ON public.lead_status_transitions TO authenticated;
GRANT ALL ON public.lead_status_transitions TO service_role;
ALTER TABLE public.lead_status_transitions ENABLE ROW LEVEL SECURITY;

-- RLS espelha distribution_log: admin/gestor veem tudo, corretor vê dos próprios leads.
CREATE POLICY "Admin/gestor veem todas as transicoes"
  ON public.lead_status_transitions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Corretor ve transicoes dos seus leads"
  ON public.lead_status_transitions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_status_transitions.lead_id AND l.corretor_id = auth.uid()
  ));

-- INSERT apenas via trigger SECURITY DEFINER (sem policy de INSERT para authenticated).

CREATE OR REPLACE FUNCTION public.registrar_transicao_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_status_transitions
      (lead_id, corretor_id, de_status, para_status, alterado_por)
    VALUES (NEW.id, NEW.corretor_id, OLD.status, NEW.status, auth.uid());

    -- Registra também na timeline do lead, para visibilidade do corretor.
    INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo)
    VALUES (
      NEW.id,
      auth.uid(),
      'mudanca_status',
      'interna',
      'Mudança de status',
      'Status alterado de "' || COALESCE(OLD.status::text, '—')
        || '" para "' || NEW.status::text || '".'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_transicao_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_registrar_transicao_status ON public.leads;
CREATE TRIGGER trg_registrar_transicao_status
AFTER UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.registrar_transicao_status();

-- Backfill best-effort: cria uma transição "contrato_fechado" para leads já vendidos,
-- usando updated_at como aproximação (não há histórico real anterior). Sem isso, o
-- dashboard mostraria 0 vendas até ocorrer a primeira nova transição.
INSERT INTO public.lead_status_transitions
  (lead_id, corretor_id, de_status, para_status, alterado_por, created_at)
SELECT id, corretor_id, NULL, 'contrato_fechado'::public.lead_status, NULL, updated_at
FROM public.leads
WHERE status IN ('contrato_fechado','pos_venda') AND deleted_at IS NULL;
