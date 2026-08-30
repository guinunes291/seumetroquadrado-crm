CREATE OR REPLACE FUNCTION public.bloquear_mutacao_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND COALESCE(current_setting('app.excluir_venda', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ledger imutável: registre um evento compensatório'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_venda_lancamento_errado(
  p_venda_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _venda public.vendas%ROWTYPE;
  _n integer;
  _r record;
BEGIN
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'somente administradores podem excluir vendas' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'informe o motivo da exclusão (mínimo 10 caracteres)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _venda FROM public.vendas WHERE id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda não encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO _n FROM public.conciliacoes WHERE venda_id = p_venda_id;
  IF _n > 0 THEN
    RAISE EXCEPTION 'venda conciliada no financeiro não pode ser excluída'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES (
    'vendas', p_venda_id, 'DELETE', _uid, to_jsonb(_venda),
    jsonb_build_object(
      'motivo', btrim(p_motivo),
      'acao', 'exclusao_lancamento_errado',
      'comissoes', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                    FROM public.comissoes c WHERE c.venda_id = p_venda_id),
      'comissao_ledger', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                    FROM public.comissao_ledger l WHERE l.venda_id = p_venda_id),
      'venda_metricas_ledger', (SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                    FROM public.venda_metricas_ledger m WHERE m.venda_id = p_venda_id)
    )
  );

  -- Desfaz o efeito líquido em metas/atividade diária do corretor.
  FOR _r IN
    SELECT corretor_id, dia,
           COALESCE(sum(vendas_delta), 0) AS ven,
           COALESCE(sum(vgv_delta), 0) AS vgv
    FROM public.venda_metricas_ledger
    WHERE venda_id = p_venda_id AND corretor_id IS NOT NULL
    GROUP BY corretor_id, dia
  LOOP
    IF _r.ven <> 0 OR _r.vgv <> 0 THEN
      PERFORM public.bump_atividade(_r.corretor_id, _r.dia, _ven => (-_r.ven)::integer, _vgv => -_r.vgv);
    END IF;
  END LOOP;

  PERFORM set_config('app.excluir_venda', 'on', true);
  PERFORM set_config('app.commercial_effects', 'on', true);

  DELETE FROM public.comissao_ledger WHERE venda_id = p_venda_id;
  DELETE FROM public.venda_metricas_ledger WHERE venda_id = p_venda_id;
  DELETE FROM public.venda_integridade_conflitos
    WHERE venda_preservada_id = p_venda_id OR venda_conflitante_id = p_venda_id;
  DELETE FROM public.dre_venda_unidade WHERE venda_id = p_venda_id;
  DELETE FROM public.comissoes WHERE venda_id = p_venda_id;
  DELETE FROM public.vendas WHERE id = p_venda_id;

  PERFORM set_config('app.excluir_venda', 'off', true);

  -- Lead volta ao atendimento se não sobrou nenhuma venda aprovada.
  IF _venda.lead_id IS NOT NULL THEN
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
    SET status = 'em_atendimento'::public.lead_status,
        ultima_interacao = now()
    WHERE id = _venda.lead_id
      AND status IN ('contrato_fechado'::public.lead_status, 'pos_venda'::public.lead_status)
      AND NOT EXISTS (
        SELECT 1 FROM public.vendas v
        WHERE v.lead_id = _venda.lead_id
          AND v.status_venda = 'aprovada'::public.status_venda
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_venda_lancamento_errado(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_venda_lancamento_errado(uuid, text) TO authenticated;