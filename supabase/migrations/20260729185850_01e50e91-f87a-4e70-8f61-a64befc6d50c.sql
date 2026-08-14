DO $$
DECLARE _ed uuid; _final uuid; _terceiro uuid;
  _andrew uuid := '6e09dcdf-0913-4482-b753-b98652be920e';
  _jeff uuid := '277f3912-db60-46b0-92ee-07f641ab10df';
BEGIN
  -- Guarda de idempotência (P1-5, ver scripts/db-harness/README.md): patch de
  -- dados com UUIDs fixos de produção — em ambiente limpo (sem os perfis
  -- alvo) vira no-op, como as demais migrations de dados da Copa.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _jeff)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _andrew) THEN
    RETURN;
  END IF;

  SELECT id INTO _ed FROM public.copa_edicao WHERE ativo ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO _final FROM public.copa_fases WHERE edicao_id=_ed AND tipo='final' LIMIT 1;
  SELECT id INTO _terceiro FROM public.copa_fases WHERE edicao_id=_ed AND tipo='terceiro' LIMIT 1;

  -- Final: apenas Jefferson x Andrew
  DELETE FROM public.copa_confrontos WHERE fase_id=_final;
  INSERT INTO public.copa_confrontos (fase_id, corretor_a_id, corretor_b_id, semana_ref, posicao, is_wo)
  VALUES (_final, _jeff, _andrew, 9, 1, false);

  -- Disputa de 3º lugar: grupo único com todos os demais ativos
  UPDATE public.copa_fases SET semana_inicio=9, semana_fim=9 WHERE id IN (_final, _terceiro);
  DELETE FROM public.copa_confrontos WHERE fase_id=_terceiro;
  UPDATE public.copa_participantes SET grupo=NULL
   WHERE edicao_id=_ed AND corretor_id IN (_andrew, _jeff);
  UPDATE public.copa_participantes SET grupo='A'
   WHERE edicao_id=_ed AND ativo AND corretor_id NOT IN (_andrew, _jeff);
END $$;