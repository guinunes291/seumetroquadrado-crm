
-- Função: aplicar bônus final (campeão/vice/3º/4º) - sem VALUES tipados
CREATE OR REPLACE FUNCTION public.copa_aplicar_bonus_final(_edicao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _final_id uuid;
  _terceiro_id uuid;
  _campeao uuid;
  _vice uuid;
  _terceiro uuid;
  _quarto uuid;
  _semana int := 13;
  _inseridos int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO _final_id FROM public.copa_fases WHERE edicao_id=_edicao_id AND tipo='final' LIMIT 1;
  SELECT id INTO _terceiro_id FROM public.copa_fases WHERE edicao_id=_edicao_id AND tipo='terceiro' LIMIT 1;

  IF _final_id IS NOT NULL THEN
    SELECT vencedor_id,
           CASE WHEN vencedor_id = corretor_a_id THEN corretor_b_id ELSE corretor_a_id END
      INTO _campeao, _vice
      FROM public.copa_confrontos
      WHERE fase_id = _final_id AND vencedor_id IS NOT NULL
      ORDER BY posicao LIMIT 1;
  END IF;

  IF _terceiro_id IS NOT NULL THEN
    SELECT vencedor_id,
           CASE WHEN vencedor_id = corretor_a_id THEN corretor_b_id ELSE corretor_a_id END
      INTO _terceiro, _quarto
      FROM public.copa_confrontos
      WHERE fase_id = _terceiro_id AND vencedor_id IS NOT NULL
      ORDER BY posicao LIMIT 1;
  END IF;

  IF _campeao IS NOT NULL THEN
    INSERT INTO public.copa_pontuacoes (edicao_id, corretor_id, semana, total, observacao)
    VALUES (_edicao_id, _campeao, _semana, 10, 'Campeão (+10)')
    ON CONFLICT (edicao_id, corretor_id, semana) DO UPDATE
      SET total = GREATEST(public.copa_pontuacoes.total, 10),
          observacao = 'Campeão (+10)', updated_at = now();
    _inseridos := _inseridos + 1;
  END IF;
  IF _vice IS NOT NULL THEN
    INSERT INTO public.copa_pontuacoes (edicao_id, corretor_id, semana, total, observacao)
    VALUES (_edicao_id, _vice, _semana, 7, 'Vice (+7)')
    ON CONFLICT (edicao_id, corretor_id, semana) DO UPDATE
      SET total = GREATEST(public.copa_pontuacoes.total, 7),
          observacao = 'Vice (+7)', updated_at = now();
    _inseridos := _inseridos + 1;
  END IF;
  IF _terceiro IS NOT NULL THEN
    INSERT INTO public.copa_pontuacoes (edicao_id, corretor_id, semana, total, observacao)
    VALUES (_edicao_id, _terceiro, _semana, 5, '3º lugar (+5)')
    ON CONFLICT (edicao_id, corretor_id, semana) DO UPDATE
      SET total = GREATEST(public.copa_pontuacoes.total, 5),
          observacao = '3º lugar (+5)', updated_at = now();
    _inseridos := _inseridos + 1;
  END IF;
  IF _quarto IS NOT NULL THEN
    INSERT INTO public.copa_pontuacoes (edicao_id, corretor_id, semana, total, observacao)
    VALUES (_edicao_id, _quarto, _semana, 3, '4º lugar (+3)')
    ON CONFLICT (edicao_id, corretor_id, semana) DO UPDATE
      SET total = GREATEST(public.copa_pontuacoes.total, 3),
          observacao = '4º lugar (+3)', updated_at = now();
    _inseridos := _inseridos + 1;
  END IF;

  RETURN jsonb_build_object('aplicados', _inseridos);
END;
$$;

-- Habilitar Realtime (ignora se já estiver na publicação)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.copa_pontuacoes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.copa_confrontos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.copa_participantes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
