-- Copa SMQ 1:1 — funções (UUID). Substituem as da v1. Pontuação on-the-fly do CRM
-- (agendamentos + lead_status_transitions) por corretor_id (UUID = profiles.id) + bônus manual.
-- Janela fixa da edição: 03/06 → 08/09/2026 (14 semanas de 7 dias). chave 'documentacao' ↔ coluna analise.

DROP FUNCTION IF EXISTS public.copa_ranking(uuid);
DROP FUNCTION IF EXISTS public.copa_apurar_fase(uuid);
DROP FUNCTION IF EXISTS public.copa_definir_vencedor(uuid, uuid);
DROP FUNCTION IF EXISTS public.copa_pontos_corretor(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.copa_realizar_sorteio(uuid);
DROP FUNCTION IF EXISTS public.copa_set_participantes(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.copa_ranking()
RETURNS TABLE (
  corretor_id uuid, nome text, selecao_id uuid, selecao_nome text, bandeira text, grupo text,
  total_agendamentos int, total_visitas int, total_documentacao int, total_vendas int, total_pontos int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT COALESCE(MAX(pontos) FILTER (WHERE chave='agendamentos'),0) p_ag,
           COALESCE(MAX(pontos) FILTER (WHERE chave='visitas'),0) p_vi,
           COALESCE(MAX(pontos) FILTER (WHERE chave='documentacao'),0) p_do,
           COALESCE(MAX(pontos) FILTER (WHERE chave='vendas'),0) p_ve
    FROM public.copa_config_pontos
  ),
  parts AS (
    SELECT cp.corretor_id cid, cp.selecao_id sid, cp.grupo, s.nome selnome, s.bandeira
    FROM public.copa_participantes cp
    LEFT JOIN public.copa_selecoes s ON s.id = cp.selecao_id
    WHERE cp.ativo = true
  ),
  ag AS (
    SELECT a.corretor_id cid, count(*)::int n FROM public.agendamentos a
    WHERE a.deleted_at IS NULL AND a.created_at >= '2026-06-03' AND a.created_at < '2026-09-09'
    GROUP BY a.corretor_id
  ),
  tr AS (
    SELECT t.corretor_id cid,
      count(*) FILTER (WHERE t.para_status='visita_realizada')::int vi,
      count(*) FILTER (WHERE t.para_status='analise_credito')::int  do_,
      count(*) FILTER (WHERE t.para_status='contrato_fechado')::int ve
    FROM public.lead_status_transitions t
    WHERE t.created_at >= '2026-06-03' AND t.created_at < '2026-09-09'
    GROUP BY t.corretor_id
  ),
  man AS (
    SELECT corretor_id cid, COALESCE(SUM(agendamentos),0)::int ag, COALESCE(SUM(visitas),0)::int vi,
           COALESCE(SUM(analise),0)::int do_, COALESCE(SUM(vendas),0)::int ve
    FROM public.copa_pontuacoes GROUP BY corretor_id
  )
  SELECT parts.cid, COALESCE(pr.nome,'Corretor'), parts.sid, parts.selnome, COALESCE(parts.bandeira,'🏳️'), parts.grupo,
    (COALESCE(ag.n,0)+COALESCE(man.ag,0)),
    (COALESCE(tr.vi,0)+COALESCE(man.vi,0)),
    (COALESCE(tr.do_,0)+COALESCE(man.do_,0)),
    (COALESCE(tr.ve,0)+COALESCE(man.ve,0)),
    ((COALESCE(ag.n,0)+COALESCE(man.ag,0))*cfg.p_ag + (COALESCE(tr.vi,0)+COALESCE(man.vi,0))*cfg.p_vi
     + (COALESCE(tr.do_,0)+COALESCE(man.do_,0))*cfg.p_do + (COALESCE(tr.ve,0)+COALESCE(man.ve,0))*cfg.p_ve)
  FROM parts CROSS JOIN cfg
  LEFT JOIN public.profiles pr ON pr.id = parts.cid
  LEFT JOIN ag ON ag.cid = parts.cid
  LEFT JOIN tr ON tr.cid = parts.cid
  LEFT JOIN man ON man.cid = parts.cid
  ORDER BY 11 DESC, 2 ASC;
$$;

CREATE OR REPLACE FUNCTION public.copa_pontos_por_semana()
RETURNS TABLE (corretor_id uuid, semana int, pontos int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT COALESCE(MAX(pontos) FILTER (WHERE chave='agendamentos'),0) p_ag,
           COALESCE(MAX(pontos) FILTER (WHERE chave='visitas'),0) p_vi,
           COALESCE(MAX(pontos) FILTER (WHERE chave='documentacao'),0) p_do,
           COALESCE(MAX(pontos) FILTER (WHERE chave='vendas'),0) p_ve
    FROM public.copa_config_pontos
  ),
  parts AS (SELECT corretor_id cid FROM public.copa_participantes WHERE ativo = true),
  wk AS (
    SELECT g semana, ('2026-06-03'::date + (g-1)*7)::timestamptz d0, ('2026-06-03'::date + g*7)::timestamptz d1
    FROM generate_series(1,14) g
  )
  SELECT parts.cid, wk.semana,
    ((COALESCE(ag.n,0)+COALESCE(mn.ag,0))*cfg.p_ag + (COALESCE(tr.vi,0)+COALESCE(mn.vi,0))*cfg.p_vi
     + (COALESCE(tr.do_,0)+COALESCE(mn.do_,0))*cfg.p_do + (COALESCE(tr.ve,0)+COALESCE(mn.ve,0))*cfg.p_ve)
  FROM parts CROSS JOIN wk CROSS JOIN cfg
  LEFT JOIN LATERAL (SELECT count(*)::int n FROM public.agendamentos a WHERE a.corretor_id=parts.cid AND a.deleted_at IS NULL AND a.created_at>=wk.d0 AND a.created_at<wk.d1) ag ON true
  LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE t.para_status='visita_realizada')::int vi, count(*) FILTER (WHERE t.para_status='analise_credito')::int do_, count(*) FILTER (WHERE t.para_status='contrato_fechado')::int ve FROM public.lead_status_transitions t WHERE t.corretor_id=parts.cid AND t.created_at>=wk.d0 AND t.created_at<wk.d1) tr ON true
  LEFT JOIN LATERAL (SELECT agendamentos ag, visitas vi, analise do_, vendas ve FROM public.copa_pontuacoes cp WHERE cp.corretor_id=parts.cid AND cp.semana=wk.semana) mn ON true;
$$;

CREATE OR REPLACE FUNCTION public.copa_get_ajuste_manual(_corretor_id uuid, _semana int)
RETURNS TABLE (agendamentos int, visitas int, documentacao int, vendas int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT agendamentos, visitas, analise, vendas FROM public.copa_pontuacoes
  WHERE corretor_id = _corretor_id AND semana = _semana;
$$;

REVOKE EXECUTE ON FUNCTION public.copa_ranking() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_pontos_por_semana() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_get_ajuste_manual(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_ranking() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_pontos_por_semana() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_get_ajuste_manual(uuid, int) TO authenticated, service_role;

-- ===== Mutations (admin/gestor) =====
CREATE OR REPLACE FUNCTION public.copa_set_vencedor(_confronto_id uuid, _vencedor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.copa_confrontos SET vencedor_id = _vencedor_id, definido_manual = true WHERE id = _confronto_id;
END; $$;

CREATE OR REPLACE FUNCTION public.copa_salvar_pontuacao(_corretor_id uuid, _semana int, _ag int, _vi int, _doc int, _ve int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ed uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO _ed FROM public.copa_edicao WHERE ativo = true ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.copa_pontuacoes (edicao_id, corretor_id, semana, agendamentos, visitas, analise, vendas, updated_at)
  VALUES (_ed, _corretor_id, _semana, _ag, _vi, _doc, _ve, now())
  ON CONFLICT (edicao_id, corretor_id, semana) DO UPDATE SET
    agendamentos = EXCLUDED.agendamentos, visitas = EXCLUDED.visitas, analise = EXCLUDED.analise,
    vendas = EXCLUDED.vendas, updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.copa_set_participantes(_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ed uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO _ed FROM public.copa_edicao WHERE ativo = true ORDER BY created_at DESC LIMIT 1;
  UPDATE public.copa_participantes SET ativo = false WHERE edicao_id = _ed AND NOT (corretor_id = ANY(_ids));
  INSERT INTO public.copa_participantes (edicao_id, corretor_id, ativo)
  SELECT _ed, x, true FROM unnest(_ids) x
  ON CONFLICT (edicao_id, corretor_id) DO UPDATE SET ativo = true;
END; $$;

CREATE OR REPLACE FUNCTION public.copa_status_chaveamento()
RETURNS TABLE (fase_atual text, pode_avancar boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _fase record; _prox record; _pend int;
BEGIN
  SELECT f.* INTO _fase FROM public.copa_fases f
    WHERE EXISTS (SELECT 1 FROM public.copa_confrontos c WHERE c.fase_id = f.id)
    ORDER BY f.ordem DESC LIMIT 1;
  IF _fase.id IS NULL THEN fase_atual := NULL; pode_avancar := false; RETURN NEXT; RETURN; END IF;
  SELECT count(*) INTO _pend FROM public.copa_confrontos c WHERE c.fase_id = _fase.id AND c.vencedor_id IS NULL;
  SELECT f.* INTO _prox FROM public.copa_fases f WHERE f.edicao_id = _fase.edicao_id AND f.ordem > _fase.ordem ORDER BY f.ordem ASC LIMIT 1;
  fase_atual := _fase.nome;
  pode_avancar := (_pend = 0 AND _prox.id IS NOT NULL AND _prox.tipo <> 'premiacao'
                   AND NOT EXISTS (SELECT 1 FROM public.copa_confrontos c WHERE c.fase_id = _prox.id));
  RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.copa_avancar_fase()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _fase record; _prox record; _winners uuid[]; _i int; _pos int := 0; _sem int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT f.* INTO _fase FROM public.copa_fases f
    WHERE EXISTS (SELECT 1 FROM public.copa_confrontos c WHERE c.fase_id = f.id)
    ORDER BY f.ordem DESC LIMIT 1;
  IF _fase.id IS NULL THEN RAISE EXCEPTION 'sem fase atual'; END IF;
  IF EXISTS (SELECT 1 FROM public.copa_confrontos c WHERE c.fase_id = _fase.id AND c.vencedor_id IS NULL) THEN
    RAISE EXCEPTION 'fase atual tem confrontos pendentes'; END IF;
  SELECT f.* INTO _prox FROM public.copa_fases f WHERE f.edicao_id = _fase.edicao_id AND f.ordem > _fase.ordem ORDER BY f.ordem ASC LIMIT 1;
  IF _prox.id IS NULL OR _prox.tipo = 'premiacao' THEN RETURN 'Fim do chaveamento'; END IF;
  IF EXISTS (SELECT 1 FROM public.copa_confrontos c WHERE c.fase_id = _prox.id) THEN RETURN 'Próxima fase já possui confrontos'; END IF;
  SELECT array_agg(vencedor_id ORDER BY posicao) INTO _winners FROM public.copa_confrontos WHERE fase_id = _fase.id AND vencedor_id IS NOT NULL;
  _sem := CASE _prox.tipo WHEN 'repescagem1' THEN 8 WHEN 'oitavas' THEN 9 WHEN 'repescagem2' THEN 10 WHEN 'quartas' THEN 11 WHEN 'semifinal' THEN 12 ELSE 13 END;
  _i := 1;
  WHILE _i <= COALESCE(array_length(_winners,1),0) LOOP
    _pos := _pos + 1;
    IF _i + 1 <= array_length(_winners,1) THEN
      INSERT INTO public.copa_confrontos(fase_id, corretor_a_id, corretor_b_id, semana_ref, posicao) VALUES (_prox.id, _winners[_i], _winners[_i+1], _sem, _pos);
    ELSE
      INSERT INTO public.copa_confrontos(fase_id, corretor_a_id, corretor_b_id, is_wo, semana_ref, posicao) VALUES (_prox.id, _winners[_i], NULL, true, _sem, _pos);
    END IF;
    _i := _i + 2;
  END LOOP;
  RETURN _prox.nome;
END; $$;

CREATE OR REPLACE FUNCTION public.copa_inicializar_dados()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.copa_config_pontos(chave, label, pontos) VALUES
    ('agendamentos','Agendamento confirmado',1),('visitas','Visita realizada',5),
    ('documentacao','Análise de crédito/Documentação',10),('vendas','Contrato fechado (venda)',40)
  ON CONFLICT (chave) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.copa_realizar_sorteio()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ed uuid; _letters text[] := ARRAY['A','B','C','D','E','F','G','H'];
  _fase_grupos uuid; _players uuid[]; _sels uuid[]; _nsel int; _ngroups int;
  _gi int; _start int; _grp uuid[]; _arr uuid[]; _n int; _rounds int; _r int; _i int; _a uuid; _b uuid; _pos int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO _ed FROM public.copa_edicao WHERE ativo = true ORDER BY created_at DESC LIMIT 1;
  SELECT array_agg(corretor_id ORDER BY random()) INTO _players FROM public.copa_participantes WHERE edicao_id = _ed AND ativo = true;
  IF _players IS NULL THEN RAISE EXCEPTION 'sem participantes'; END IF;
  SELECT array_agg(id ORDER BY random()) INTO _sels FROM public.copa_selecoes WHERE ativo = true;
  _nsel := COALESCE(array_length(_sels,1),0);
  IF _nsel = 0 THEN RAISE EXCEPTION 'sem selecoes'; END IF;

  FOR _i IN 1..array_length(_players,1) LOOP
    UPDATE public.copa_participantes SET selecao_id = _sels[((_i-1) % _nsel) + 1] WHERE edicao_id = _ed AND corretor_id = _players[_i];
  END LOOP;

  DELETE FROM public.copa_confrontos c USING public.copa_fases f WHERE c.fase_id = f.id AND f.edicao_id = _ed;
  UPDATE public.copa_participantes SET grupo = NULL WHERE edicao_id = _ed;
  SELECT id INTO _fase_grupos FROM public.copa_fases WHERE edicao_id = _ed AND tipo = 'grupos' ORDER BY ordem LIMIT 1;
  IF _fase_grupos IS NULL THEN RETURN; END IF;

  _ngroups := ceil(array_length(_players,1)::numeric / 7);
  FOR _gi IN 1.._ngroups LOOP
    _start := (_gi - 1) * 7;
    _grp := ARRAY[]::uuid[];
    FOR _i IN 1..7 LOOP
      IF _start + _i <= array_length(_players,1) THEN _grp := _grp || _players[_start + _i]; END IF;
    END LOOP;
    UPDATE public.copa_participantes SET grupo = _letters[_gi] WHERE edicao_id = _ed AND corretor_id = ANY(_grp);
    _arr := _grp;
    IF (array_length(_arr,1) % 2) = 1 THEN _arr := _arr || NULL::uuid; END IF;
    _n := array_length(_arr,1);
    _rounds := _n - 1;
    FOR _r IN 1.._rounds LOOP
      FOR _i IN 1..(_n / 2) LOOP
        _a := _arr[_i]; _b := _arr[_n - _i + 1]; _pos := _pos + 1;
        IF _a IS NULL OR _b IS NULL THEN
          INSERT INTO public.copa_confrontos(fase_id, corretor_a_id, corretor_b_id, is_wo, semana_ref, posicao)
          VALUES (_fase_grupos, COALESCE(_a, _b), NULL, true, _r, _pos);
        ELSE
          INSERT INTO public.copa_confrontos(fase_id, corretor_a_id, corretor_b_id, is_wo, semana_ref, posicao)
          VALUES (_fase_grupos, _a, _b, false, _r, _pos);
        END IF;
      END LOOP;
      _arr := _arr[1:1] || _arr[3:_n] || _arr[2:2];
    END LOOP;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public.copa_set_vencedor(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_salvar_pontuacao(uuid, int, int, int, int, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_set_participantes(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_status_chaveamento() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_avancar_fase() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_inicializar_dados() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copa_realizar_sorteio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_set_vencedor(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_salvar_pontuacao(uuid, int, int, int, int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_set_participantes(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_status_chaveamento() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_avancar_fase() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_inicializar_dados() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copa_realizar_sorteio() TO authenticated, service_role;
