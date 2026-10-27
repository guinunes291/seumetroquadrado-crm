CREATE OR REPLACE FUNCTION public.tg_tarefas_guarda_reatribuicao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.corretor_id IS DISTINCT FROM OLD.corretor_id
     AND NEW.lead_id IS NOT NULL
     AND NOT public.pode_atribuir_lead(auth.uid(), NEW.corretor_id) THEN
    RAISE EXCEPTION 'Sem permissão para reatribuir esta tarefa';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tarefas_guarda_reatribuicao ON public.tarefas;
CREATE TRIGGER trg_tarefas_guarda_reatribuicao BEFORE UPDATE OF corretor_id ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.tg_tarefas_guarda_reatribuicao();

DROP POLICY IF EXISTS tarefas_update_carteira ON public.tarefas;
CREATE POLICY tarefas_update_carteira ON public.tarefas FOR UPDATE TO authenticated
USING (((lead_id IS NOT NULL) AND pode_acessar_lead(auth.uid(), lead_id)) OR ((lead_id IS NULL) AND pode_acessar_corretor(auth.uid(), corretor_id)))
WITH CHECK (((lead_id IS NOT NULL) AND pode_acessar_lead(auth.uid(), lead_id)) OR ((lead_id IS NULL) AND pode_acessar_corretor(auth.uid(), corretor_id)));