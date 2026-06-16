-- Avanço de lead no funil a partir dos cards (Kanban + lista):
--  (a) coluna motivo_perda_categoria em leads (categoria da perda, além do texto livre);
--  (b) tabela vendas (captura de VGV ao fechar contrato);
--  (c) RPC marcar_lead_perdido: registra a perda e redistribui o lead ao próximo
--      corretor elegível (reusa a fila/elegibilidade); sem corretor disponível, vai
--      para os perdidos/lixeira. Precisa ser SECURITY DEFINER porque a RLS de leads
--      impede o corretor de reatribuir o lead a outro corretor.

-- (a) Categoria da perda -----------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS motivo_perda_categoria text;

-- (b) Tabela de vendas -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_por_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  projeto_nome text,
  valor_venda numeric(14,2) NOT NULL CHECK (valor_venda >= 0),
  data_assinatura date NOT NULL DEFAULT current_date,
  percentual_comissao        numeric(5,2) NOT NULL DEFAULT 3.50,
  percentual_corretor        numeric(5,2) NOT NULL DEFAULT 1.85,
  percentual_gerente         numeric(5,2) NOT NULL DEFAULT 0.50,
  percentual_superintendente numeric(5,2) NOT NULL DEFAULT 0.30,
  observacoes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendas_data_nao_futura CHECK (data_assinatura <= current_date)
);

CREATE INDEX IF NOT EXISTS idx_vendas_corretor ON public.vendas(corretor_id, data_assinatura DESC);
CREATE INDEX IF NOT EXISTS idx_vendas_lead ON public.vendas(lead_id);
CREATE INDEX IF NOT EXISTS idx_vendas_projeto ON public.vendas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON public.vendas(data_assinatura DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas TO authenticated;
GRANT ALL ON public.vendas TO service_role;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

-- RLS espelha leads/agendamentos: admin/gestor tudo; corretor o próprio.
CREATE POLICY "vendas_select" ON public.vendas
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "vendas_insert" ON public.vendas
  FOR INSERT TO authenticated
  WITH CHECK (criado_por_id = auth.uid()
    AND (corretor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'gestor')));

CREATE POLICY "vendas_update" ON public.vendas
  FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (corretor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "vendas_delete" ON public.vendas
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'gestor')
         OR criado_por_id = auth.uid());

DROP TRIGGER IF EXISTS set_vendas_updated_at ON public.vendas;
CREATE TRIGGER set_vendas_updated_at
  BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- (c) RPC: marcar como perdido + redistribuir --------------------------------
-- Observação: o enum distribuicao_tipo é ('automatica','manual','inicial') — não
-- inclui 'redistribuicao' — então usamos 'manual' no distribution_log; o texto do
-- motivo deixa claro que foi uma redistribuição por perda.
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido(
  _lead_id uuid,
  _categoria text DEFAULT NULL,
  _detalhe text DEFAULT NULL
)
RETURNS uuid                       -- novo corretor (redistribuído), ou NULL (foi p/ perdidos)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _atual  uuid;
  _tentou uuid[];
  _proximo uuid;
  _max_pos int;
  _motivo text := COALESCE(NULLIF(btrim(_detalhe), ''), _categoria, 'Sem motivo informado');
BEGIN
  SELECT corretor_id, COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])
    INTO _atual, _tentou
  FROM public.leads
  WHERE id = _lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead inexistente';
  END IF;

  -- Autorização: dono do lead, ou admin/gestor.
  IF _caller IS NOT NULL
     AND _caller <> COALESCE(_atual, '00000000-0000-0000-0000-000000000000'::uuid)
     AND NOT public.has_role(_caller,'admin')
     AND NOT public.has_role(_caller,'gestor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- O corretor atual passa a constar como "já tentou" (idempotente).
  IF _atual IS NOT NULL AND NOT (_atual = ANY(_tentou)) THEN
    _tentou := array_append(_tentou, _atual);
  END IF;

  -- Próximo corretor elegível que ainda NÃO tentou (mesma fila do roleta elegível).
  SELECT fd.corretor_id INTO _proximo
  FROM public.fila_distribuicao fd
  WHERE fd.ativo = true
    AND fd.leads_recebidos_hoje < fd.max_leads_dia
    AND NOT (fd.corretor_id = ANY(_tentou))
    AND public.corretor_elegivel(fd.corretor_id) = true
  ORDER BY fd.posicao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _proximo IS NOT NULL THEN
    -- Redistribui: o lead volta para aguardando_atendimento com o novo corretor.
    SELECT COALESCE(MAX(posicao),0) INTO _max_pos FROM public.fila_distribuicao;

    UPDATE public.fila_distribuicao
       SET posicao = _max_pos + 1,
           leads_recebidos_hoje = leads_recebidos_hoje + 1,
           ultima_distribuicao = now()
     WHERE corretor_id = _proximo;

    UPDATE public.leads
       SET corretor_anterior_id = _atual,
           corretor_id = _proximo,
           status = 'aguardando_atendimento',
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = COALESCE(tentativas_redistribuicao,0) + 1,
           corretores_que_tentaram = array_append(_tentou, _proximo)
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_lead_id, _proximo, 'manual', 'Redistribuído após perda: ' || _motivo, _caller);

    RETURN _proximo;
  ELSE
    -- Sem corretor disponível: marca como perdido e move para a lixeira.
    UPDATE public.leads
       SET corretor_anterior_id = _atual,
           corretor_id = NULL,
           status = 'perdido',
           na_lixeira = true,
           data_movido_lixeira = now(),
           corretores_que_tentaram = _tentou,
           motivo_perdido = _motivo,
           motivo_perda_categoria = _categoria
     WHERE id = _lead_id;

    INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, motivo, distribuido_por_id)
    VALUES (_lead_id, COALESCE(_atual, _caller), 'manual',
            'Lead perdido (sem corretor disponível): ' || _motivo, _caller);

    RETURN NULL;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido(uuid, text, text) TO authenticated, service_role;
