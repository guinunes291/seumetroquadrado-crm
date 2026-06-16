
ALTER TABLE public.copa_pontuacoes ADD COLUMN IF NOT EXISTS bonus_observacao text;

CREATE OR REPLACE FUNCTION public.copa_set_participante(
  _edicao_id uuid, _corretor_id uuid, _selecao_id uuid, _grupo text, _ativo boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.copa_participantes (edicao_id, corretor_id, selecao_id, grupo, ativo)
  VALUES (_edicao_id, _corretor_id, _selecao_id, _grupo, COALESCE(_ativo, true))
  ON CONFLICT (edicao_id, corretor_id) DO UPDATE
    SET selecao_id = EXCLUDED.selecao_id,
        grupo = EXCLUDED.grupo,
        ativo = EXCLUDED.ativo;
END;
$$;

CREATE OR REPLACE FUNCTION public.copa_salvar_pontuacao_lote(
  _edicao_id uuid, _semana int, _rows jsonb
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb; _n int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR _r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    INSERT INTO public.copa_pontuacoes (edicao_id, corretor_id, semana,
      agendamentos, visitas, analise, vendas, total, observacao, bonus_observacao)
    VALUES (_edicao_id, (_r->>'corretor_id')::uuid, _semana,
      COALESCE((_r->>'agendamentos')::int,0),
      COALESCE((_r->>'visitas')::int,0),
      COALESCE((_r->>'analise')::int,0),
      COALESCE((_r->>'vendas')::int,0),
      COALESCE((_r->>'bonus')::int,0),
      NULLIF(_r->>'observacao',''),
      NULLIF(_r->>'bonus_observacao',''))
    ON CONFLICT (edicao_id, corretor_id, semana) DO UPDATE
      SET agendamentos=EXCLUDED.agendamentos,
          visitas=EXCLUDED.visitas,
          analise=EXCLUDED.analise,
          vendas=EXCLUDED.vendas,
          total=EXCLUDED.total,
          observacao=EXCLUDED.observacao,
          bonus_observacao=EXCLUDED.bonus_observacao,
          updated_at=now();
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;

CREATE OR REPLACE VIEW public.copa_pontuacao_semanal
WITH (security_invoker=true) AS
WITH cfg AS (
  SELECT
    COALESCE(MAX(pontos) FILTER (WHERE chave='agendamento'),1) AS p_ag,
    COALESCE(MAX(pontos) FILTER (WHERE chave='visita'),5)      AS p_vi,
    COALESCE(MAX(pontos) FILTER (WHERE chave='analise'),10)    AS p_an,
    COALESCE(MAX(pontos) FILTER (WHERE chave='venda'),40)      AS p_ve
  FROM public.copa_config_pontos
)
SELECT
  cp.edicao_id, cp.corretor_id, pr.nome, cp.semana,
  cp.agendamentos, cp.visitas, cp.analise, cp.vendas,
  cp.total AS bonus, cp.observacao, cp.bonus_observacao,
  (cp.agendamentos*cfg.p_ag + cp.visitas*cfg.p_vi + cp.analise*cfg.p_an + cp.vendas*cfg.p_ve + cp.total) AS total_semana
FROM public.copa_pontuacoes cp
CROSS JOIN cfg
LEFT JOIN public.profiles pr ON pr.id = cp.corretor_id;

GRANT SELECT ON public.copa_pontuacao_semanal TO authenticated;

CREATE OR REPLACE FUNCTION public.copa_bonus_wo_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _edicao uuid;
BEGIN
  IF NEW.is_wo = true AND NEW.vencedor_id IS NOT NULL AND NEW.semana_ref IS NOT NULL THEN
    SELECT f.edicao_id INTO _edicao FROM public.copa_fases f WHERE f.id = NEW.fase_id;
    IF _edicao IS NOT NULL THEN
      INSERT INTO public.copa_pontuacoes (edicao_id, corretor_id, semana, total, observacao)
      VALUES (_edicao, NEW.vencedor_id, NEW.semana_ref, 10, 'W.O. (+10)')
      ON CONFLICT (edicao_id, corretor_id, semana) DO UPDATE
        SET total = GREATEST(public.copa_pontuacoes.total, 10),
            observacao = COALESCE(NULLIF(public.copa_pontuacoes.observacao,''), 'W.O. (+10)'),
            updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_copa_bonus_wo ON public.copa_confrontos;
CREATE TRIGGER trg_copa_bonus_wo
  AFTER INSERT OR UPDATE ON public.copa_confrontos
  FOR EACH ROW EXECUTE FUNCTION public.copa_bonus_wo_trigger();
