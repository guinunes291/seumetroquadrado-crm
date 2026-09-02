CREATE INDEX IF NOT EXISTS leads_tel9_ativo_idx
  ON public.leads ((right(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g'), 9)))
  WHERE na_lixeira = false AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.mesclar_leads_por_telefone(_chave text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep uuid;
  v_lose uuid;
  v_rep jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  IF _chave IS NULL OR length(_chave) < 8 THEN RETURN NULL; END IF;

  SELECT l.id INTO v_keep
  FROM public.leads l
  WHERE l.na_lixeira = false AND l.deleted_at IS NULL
    AND right(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g'), 9) = right(_chave, 9)
  ORDER BY
    (EXISTS (SELECT 1 FROM public.vendas v WHERE v.lead_id = l.id)) DESC,
    CASE l.status::text
      WHEN 'contrato_fechado' THEN 0 WHEN 'pos_venda' THEN 1 WHEN 'analise_credito' THEN 2
      WHEN 'proposta_enviada' THEN 3 WHEN 'visita_realizada' THEN 4 WHEN 'agendado' THEN 5
      WHEN 'qualificado' THEN 6 WHEN 'em_atendimento' THEN 7 ELSE 8 END,
    greatest(coalesce(l.ultima_interacao, l.created_at), coalesce(l.ultima_atividade_em, l.created_at)) DESC,
    l.created_at DESC
  LIMIT 1;

  IF v_keep IS NULL THEN RETURN NULL; END IF;

  FOR v_lose IN
    SELECT l.id FROM public.leads l
    WHERE l.na_lixeira = false AND l.deleted_at IS NULL AND l.id <> v_keep
      AND right(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g'), 9) = right(_chave, 9)
  LOOP
    DELETE FROM public.conversas_tratadas c
      WHERE c.lead_id = v_lose
        AND EXISTS (SELECT 1 FROM public.conversas_tratadas k WHERE k.lead_id = v_keep);
    DELETE FROM public.oferta_ativa_leads o
      WHERE o.lead_id = v_lose
        AND EXISTS (SELECT 1 FROM public.oferta_ativa_leads k WHERE k.lead_id = v_keep AND k.oferta_id = o.oferta_id);
    DELETE FROM public.distribuicao_excecoes e
      WHERE e.lead_id = v_lose AND e.status IN ('pendente','em_analise')
        AND EXISTS (SELECT 1 FROM public.distribuicao_excecoes k
                    WHERE k.lead_id = v_keep AND k.status IN ('pendente','em_analise'));

    v_rep := '{}'::jsonb;
    UPDATE public.agendamentos SET lead_id = v_keep WHERE lead_id = v_lose;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rep := v_rep || jsonb_build_object('agendamentos', v_n);
    UPDATE public.tarefas SET lead_id = v_keep WHERE lead_id = v_lose;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rep := v_rep || jsonb_build_object('tarefas', v_n);
    UPDATE public.interacoes SET lead_id = v_keep WHERE lead_id = v_lose;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rep := v_rep || jsonb_build_object('interacoes', v_n);
    UPDATE public.vendas v SET lead_id = v_keep
      WHERE v.lead_id = v_lose
        AND NOT (v.status_venda IN ('rascunho','pendente','aprovada')
                 AND EXISTS (SELECT 1 FROM public.vendas k
                             WHERE k.lead_id = v_keep
                               AND k.status_venda IN ('rascunho','pendente','aprovada')));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rep := v_rep || jsonb_build_object('vendas', v_n);
    UPDATE public.comissoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.analises_credito SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.propostas SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.propostas_visitantes SET convertido_lead_id = v_keep WHERE convertido_lead_id = v_lose;
    UPDATE public.visitas SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.visita_execucoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.documentacoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.documentacao_versoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.mensagens SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.chamadas SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.lead_eventos SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.lead_status_transitions SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.distribution_log SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.distribuicao_excecoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.distribuicao_sombra SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.sla_estouros SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.copiloto_eventos SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.projeto_eventos SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.vitrine_links SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.leads_landing SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.conversas_tratadas SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.oferta_ativa_leads SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.venda_integridade_conflitos SET lead_id = v_keep WHERE lead_id = v_lose;

    UPDATE public.leads k SET
      nome = coalesce(nullif(trim(k.nome), ''), p.nome),
      email = coalesce(k.email, p.email),
      cpf = coalesce(k.cpf, p.cpf),
      projeto_id = coalesce(k.projeto_id, p.projeto_id),
      projeto_nome = coalesce(k.projeto_nome, p.projeto_nome),
      zona = coalesce(k.zona, p.zona),
      bairro = coalesce(k.bairro, p.bairro),
      renda_informada = coalesce(k.renda_informada, p.renda_informada),
      renda_estimada = coalesce(k.renda_estimada, p.renda_estimada),
      entrada_disponivel = coalesce(k.entrada_disponivel, p.entrada_disponivel),
      usa_fgts = coalesce(k.usa_fgts, p.usa_fgts),
      construtora = coalesce(k.construtora, p.construtora),
      observacoes = coalesce(k.observacoes, p.observacoes),
      ultima_interacao = greatest(coalesce(k.ultima_interacao, k.created_at), coalesce(p.ultima_interacao, p.created_at)),
      updated_at = now()
    FROM public.leads p
    WHERE k.id = v_keep AND p.id = v_lose;

    UPDATE public.leads SET
      na_lixeira = true,
      data_movido_lixeira = now(),
      deleted_at = now(),
      observacoes = concat_ws(E'\n', observacoes, 'Mesclado no lead ' || v_keep::text),
      updated_at = now()
    WHERE id = v_lose;

    INSERT INTO public.leads_merge_log (chave_telefone, lead_mantido, lead_mesclado, dados_mesclados, registros_repontados)
    VALUES (_chave, v_keep, v_lose, '{}'::jsonb, v_rep);
  END LOOP;

  RETURN v_keep;
END;
$$;

REVOKE ALL ON FUNCTION public.mesclar_leads_por_telefone(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mesclar_leads_por_telefone(text) TO service_role;

-- rotina de lote, para unificar a base em etapas
CREATE OR REPLACE FUNCTION public.mesclar_duplicados_lote(_limite integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE k text; n integer := 0;
BEGIN
  FOR k IN
    SELECT right(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g'), 9) AS chave
    FROM public.leads
    WHERE na_lixeira = false AND deleted_at IS NULL
      AND length(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g')) >= 9
    GROUP BY 1 HAVING count(*) > 1
    LIMIT _limite
  LOOP
    PERFORM public.mesclar_leads_por_telefone(k);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mesclar_duplicados_lote(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mesclar_duplicados_lote(integer) TO service_role;