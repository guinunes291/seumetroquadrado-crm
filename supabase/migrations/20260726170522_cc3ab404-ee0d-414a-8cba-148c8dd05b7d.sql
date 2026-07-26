CREATE TABLE public.leads_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_telefone text NOT NULL,
  lead_mantido uuid NOT NULL,
  lead_mesclado uuid NOT NULL,
  dados_mesclados jsonb NOT NULL DEFAULT '{}'::jsonb,
  registros_repontados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_merge_log_mantido ON public.leads_merge_log (lead_mantido);
CREATE INDEX idx_leads_merge_log_mesclado ON public.leads_merge_log (lead_mesclado);

GRANT SELECT ON public.leads_merge_log TO authenticated;
GRANT ALL ON public.leads_merge_log TO service_role;

ALTER TABLE public.leads_merge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_merge_log_admin_gestor_read"
  ON public.leads_merge_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE OR REPLACE FUNCTION public.mesclar_leads_dup_lote(p_limite integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tabelas text[] := ARRAY['agendamentos','analises_credito','api_escrita_log','comissoes',
    'copiloto_eventos','distribuicao_excecoes','distribution_log','documentacao_versoes',
    'documentacoes','interacoes','lead_eventos','lead_status_transitions','leads_landing',
    'oferta_ativa_leads','propostas','tarefas','venda_integridade_conflitos','vendas',
    'visita_execucoes','visitas','vitrine_links'];
  v_grupo record;
  v_win public.leads%ROWTYPE;
  v_lose public.leads%ROWTYPE;
  v_tab text;
  v_n integer;
  v_rep jsonb;
  v_dados jsonb;
  v_grupos integer := 0;
BEGIN
  FOR v_grupo IN
    WITH k AS (
      SELECT id,
             left(regexp_replace(telefone, '\D', '', 'g'), 2) || right(regexp_replace(telefone, '\D', '', 'g'), 8) AS chave
      FROM public.leads
      WHERE deleted_at IS NULL
        AND length(regexp_replace(telefone, '\D', '', 'g')) >= 10
    )
    SELECT chave, array_agg(id) AS ids
    FROM k
    GROUP BY chave
    HAVING count(*) > 1
    LIMIT p_limite
  LOOP
    SELECT l.* INTO v_win
    FROM public.leads l
    WHERE l.id = ANY(v_grupo.ids)
    ORDER BY
      (CASE WHEN COALESCE(l.na_lixeira, false) THEN 0 ELSE 1 END) DESC,
      (SELECT count(*) FROM public.vendas v WHERE v.lead_id = l.id) DESC,
      (CASE WHEN l.corretor_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
      (SELECT count(*) FROM public.interacoes i WHERE i.lead_id = l.id) DESC,
      (CASE WHEN l.email IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN l.cpf IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN l.projeto_id IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN l.renda_informada IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN l.observacoes IS NOT NULL THEN 1 ELSE 0 END) DESC,
      l.created_at ASC
    LIMIT 1;

    FOR v_lose IN
      SELECT * FROM public.leads
      WHERE id = ANY(v_grupo.ids) AND id <> v_win.id
      ORDER BY created_at
    LOOP
      v_rep := '{}'::jsonb;
      FOREACH v_tab IN ARRAY v_tabelas LOOP
        BEGIN
          EXECUTE format('UPDATE public.%I SET lead_id = $1 WHERE lead_id = $2', v_tab)
            USING v_win.id, v_lose.id;
          GET DIAGNOSTICS v_n = ROW_COUNT;
          IF v_n > 0 THEN
            v_rep := v_rep || jsonb_build_object(v_tab, v_n);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_rep := v_rep || jsonb_build_object(v_tab, 'conflito_mantido_no_original');
        END;
      END LOOP;

      v_dados := jsonb_strip_nulls(jsonb_build_object(
        'email', CASE WHEN v_win.email IS NULL THEN v_lose.email END,
        'cpf', CASE WHEN v_win.cpf IS NULL THEN v_lose.cpf END,
        'projeto_id', CASE WHEN v_win.projeto_id IS NULL THEN v_lose.projeto_id END,
        'projeto_nome', CASE WHEN v_win.projeto_nome IS NULL THEN v_lose.projeto_nome END,
        'renda_informada', CASE WHEN v_win.renda_informada IS NULL THEN v_lose.renda_informada END,
        'observacoes', CASE WHEN v_win.observacoes IS NULL THEN v_lose.observacoes END,
        'nome', CASE WHEN COALESCE(length(v_win.nome), 0) = 0 THEN v_lose.nome END
      ));

      UPDATE public.leads w SET
        email = COALESCE(w.email, v_lose.email),
        cpf = COALESCE(w.cpf, v_lose.cpf),
        projeto_id = COALESCE(w.projeto_id, v_lose.projeto_id),
        projeto_nome = COALESCE(w.projeto_nome, v_lose.projeto_nome),
        renda_informada = COALESCE(w.renda_informada, v_lose.renda_informada),
        observacoes = COALESCE(w.observacoes, v_lose.observacoes),
        nome = CASE WHEN COALESCE(length(w.nome), 0) = 0 THEN v_lose.nome ELSE w.nome END,
        ultima_interacao = GREATEST(COALESCE(w.ultima_interacao, v_lose.ultima_interacao), COALESCE(v_lose.ultima_interacao, w.ultima_interacao)),
        ultimo_contato = GREATEST(COALESCE(w.ultimo_contato, v_lose.ultimo_contato), COALESCE(v_lose.ultimo_contato, w.ultimo_contato)),
        updated_at = now()
      WHERE w.id = v_win.id;

      UPDATE public.leads SET
        deleted_at = now(),
        na_lixeira = true,
        data_movido_lixeira = COALESCE(data_movido_lixeira, now()),
        observacoes = COALESCE(observacoes || E'\n', '') || 'Mesclado no cadastro ' || v_win.id::text || ' (telefone duplicado).',
        updated_at = now()
      WHERE id = v_lose.id;

      INSERT INTO public.leads_merge_log (chave_telefone, lead_mantido, lead_mesclado, dados_mesclados, registros_repontados)
      VALUES (v_grupo.chave, v_win.id, v_lose.id, v_dados, v_rep);

      SELECT * INTO v_win FROM public.leads WHERE id = v_win.id;
    END LOOP;

    v_grupos := v_grupos + 1;
  END LOOP;

  RETURN v_grupos;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mesclar_leads_dup_lote(integer) FROM PUBLIC, anon, authenticated;