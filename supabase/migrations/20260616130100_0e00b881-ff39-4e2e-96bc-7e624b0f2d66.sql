-- Replicação Manus — Fase 2b: Conquistas/medalhas + Presença.
-- Tabelas: tipos_conquista, conquistas, historico_presenca, resumo_presenca_diaria.
-- Conquistas são concedidas automaticamente (função + cron) com base nas
-- atividades_diarias (Fase 2a). Presença é registrada por trigger ao alternar
-- profiles.presente, com auto-checkout e consolidação diária via pg_cron.

-- ===================== CONQUISTAS =====================
CREATE TABLE public.tipos_conquista (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  icone text,                         -- emoji
  criterio_tipo text NOT NULL,        -- vendas_total | agendamentos_total | visitas_total | documentacoes_total | pontuacao_dia | dias_ativos
  criterio_valor numeric NOT NULL DEFAULT 1,
  pontos_bonus integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_conquista TO authenticated;
GRANT ALL ON public.tipos_conquista TO service_role;
ALTER TABLE public.tipos_conquista ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todos leem tipos de conquista" ON public.tipos_conquista
  FOR SELECT TO authenticated USING (ativo = true OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "gestor gerencia tipos de conquista" ON public.tipos_conquista
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_tipos_conquista_updated ON public.tipos_conquista;
CREATE TRIGGER trg_tipos_conquista_updated BEFORE UPDATE ON public.tipos_conquista
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.conquistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_conquista_id uuid NOT NULL REFERENCES public.tipos_conquista(id) ON DELETE CASCADE,
  conquistado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conquistas_corretor_tipo_uk UNIQUE (corretor_id, tipo_conquista_id)
);
CREATE INDEX idx_conquistas_corretor ON public.conquistas(corretor_id, conquistado_em DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conquistas TO authenticated;
GRANT ALL ON public.conquistas TO service_role;
ALTER TABLE public.conquistas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretor ve suas conquistas" ON public.conquistas
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
-- Inserção apenas via funções SECURITY DEFINER (sem policy de INSERT).

INSERT INTO public.tipos_conquista (chave, nome, descricao, icone, criterio_tipo, criterio_valor, pontos_bonus, ordem) VALUES
  ('primeira_venda','Primeira venda','Feche seu primeiro contrato','🏆','vendas_total',1,50,1),
  ('vendedor_5','Vendedor 5','Feche 5 contratos','🥉','vendas_total',5,100,2),
  ('vendedor_10','Vendedor 10','Feche 10 contratos','🥈','vendas_total',10,200,3),
  ('vendedor_25','Vendedor 25','Feche 25 contratos','🥇','vendas_total',25,500,4),
  ('agendador_50','Agendador','50 agendamentos','📅','agendamentos_total',50,100,5),
  ('visitas_20','Anfitrião','20 visitas realizadas','🏠','visitas_total',20,100,6),
  ('documentador_10','Documentador','10 análises de crédito','📄','documentacoes_total',10,100,7),
  ('dia_produtivo','Dia produtivo','1000 pontos em um único dia','🔥','pontuacao_dia',1000,50,8),
  ('assiduo_20','Assíduo','Ativo em 20 dias','📈','dias_ativos',20,100,9);

-- Concede conquistas ainda não obtidas para um corretor (com base em atividades_diarias).
CREATE OR REPLACE FUNCTION public.conceder_conquistas(_corretor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tot_vendas int; _tot_ag int; _tot_vis int; _tot_doc int; _max_pont int; _dias int;
  _t record; _metric numeric; _n int := 0;
BEGIN
  IF _corretor IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(sum(vendas),0), COALESCE(sum(agendamentos),0), COALESCE(sum(visitas),0),
         COALESCE(sum(documentacoes),0), COALESCE(max(pontuacao_total),0), COALESCE(count(*),0)
    INTO _tot_vendas, _tot_ag, _tot_vis, _tot_doc, _max_pont, _dias
  FROM public.atividades_diarias WHERE corretor_id = _corretor;

  FOR _t IN SELECT * FROM public.tipos_conquista WHERE ativo LOOP
    _metric := CASE _t.criterio_tipo
      WHEN 'vendas_total' THEN _tot_vendas
      WHEN 'agendamentos_total' THEN _tot_ag
      WHEN 'visitas_total' THEN _tot_vis
      WHEN 'documentacoes_total' THEN _tot_doc
      WHEN 'pontuacao_dia' THEN _max_pont
      WHEN 'dias_ativos' THEN _dias
      ELSE 0 END;
    IF _metric >= _t.criterio_valor THEN
      INSERT INTO public.conquistas (corretor_id, tipo_conquista_id)
      VALUES (_corretor, _t.id)
      ON CONFLICT (corretor_id, tipo_conquista_id) DO NOTHING;
      IF FOUND THEN _n := _n + 1; END IF;
    END IF;
  END LOOP;
  RETURN _n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.conceder_conquistas(uuid) TO service_role;

-- Wrapper para o próprio usuário (UI pode chamar após uma ação).
CREATE OR REPLACE FUNCTION public.verificar_minhas_conquistas()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.conceder_conquistas(auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.verificar_minhas_conquistas() TO authenticated;

-- Varre todos os corretores com atividade (cron diário).
CREATE OR REPLACE FUNCTION public.conceder_conquistas_todos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c uuid; _n int := 0;
BEGIN
  FOR _c IN SELECT DISTINCT corretor_id FROM public.atividades_diarias LOOP
    _n := _n + public.conceder_conquistas(_c);
  END LOOP;
  RETURN _n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.conceder_conquistas_todos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conceder_conquistas_todos() TO service_role;

SELECT cron.unschedule('conceder-conquistas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='conceder-conquistas');
SELECT cron.schedule('conceder-conquistas','*/30 * * * *', $$ SELECT public.conceder_conquistas_todos(); $$);

-- ===================== PRESENÇA =====================
CREATE TABLE public.historico_presenca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL,               -- presente | ausente
  em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hist_presenca_corretor ON public.historico_presenca(corretor_id, em DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_presenca TO authenticated;
GRANT ALL ON public.historico_presenca TO service_role;
ALTER TABLE public.historico_presenca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretor ve sua presenca" ON public.historico_presenca
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
-- Inserção apenas via trigger SECURITY DEFINER.

CREATE TABLE public.resumo_presenca_diaria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia date NOT NULL,
  minutos_presente integer NOT NULL DEFAULT 0,
  primeiro_presente timestamptz,
  ultimo_ausente timestamptz,
  CONSTRAINT resumo_presenca_corretor_dia_uk UNIQUE (corretor_id, dia)
);
CREATE INDEX idx_resumo_presenca_dia ON public.resumo_presenca_diaria(dia DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumo_presenca_diaria TO authenticated;
GRANT ALL ON public.resumo_presenca_diaria TO service_role;
ALTER TABLE public.resumo_presenca_diaria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretor ve seu resumo presenca" ON public.resumo_presenca_diaria
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));

-- Registra mudança de presença ao alternar profiles.presente.
CREATE OR REPLACE FUNCTION public.log_presenca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.presente IS DISTINCT FROM OLD.presente THEN
    INSERT INTO public.historico_presenca (corretor_id, status, em)
    VALUES (NEW.id, CASE WHEN NEW.presente THEN 'presente' ELSE 'ausente' END, now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_presenca ON public.profiles;
CREATE TRIGGER trg_log_presenca AFTER UPDATE OF presente ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_presenca();

-- Auto-checkout: encerra presenças em aberto (dispara o log de 'ausente').
CREATE OR REPLACE FUNCTION public.auto_checkout_presenca()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  WITH upd AS (
    UPDATE public.profiles SET presente = false, presente_em = NULL WHERE presente = true RETURNING 1
  ) SELECT count(*) INTO _n FROM upd;
  RETURN _n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.auto_checkout_presenca() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_checkout_presenca() TO service_role;

-- Consolida o resumo diário a partir do histórico (pareando presente→ausente).
CREATE OR REPLACE FUNCTION public.consolidar_presenca_dia(_dia date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  WITH eventos AS (
    SELECT corretor_id, status, em,
           lead(em) OVER (PARTITION BY corretor_id ORDER BY em) AS prox
    FROM public.historico_presenca
    WHERE (em AT TIME ZONE 'America/Sao_Paulo')::date = _dia
  ),
  agg AS (
    SELECT corretor_id,
           COALESCE(SUM(CASE WHEN status='presente' AND prox IS NOT NULL
                             THEN EXTRACT(EPOCH FROM (prox - em))/60 ELSE 0 END),0)::int AS minutos,
           MIN(em) FILTER (WHERE status='presente') AS primeiro,
           MAX(em) FILTER (WHERE status='ausente') AS ultimo
    FROM eventos GROUP BY corretor_id
  ),
  ins AS (
    INSERT INTO public.resumo_presenca_diaria (corretor_id, dia, minutos_presente, primeiro_presente, ultimo_ausente)
    SELECT corretor_id, _dia, minutos, primeiro, ultimo FROM agg
    ON CONFLICT (corretor_id, dia) DO UPDATE SET
      minutos_presente = EXCLUDED.minutos_presente,
      primeiro_presente = EXCLUDED.primeiro_presente,
      ultimo_ausente = EXCLUDED.ultimo_ausente
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM ins;
  RETURN _n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consolidar_presenca_dia(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consolidar_presenca_dia(date) TO service_role;

-- Crons: 02:00 UTC (≈23:00 BRT) auto-checkout; 02:10 UTC consolida o dia anterior (BRT).
SELECT cron.unschedule('auto-checkout-presenca') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-checkout-presenca');
SELECT cron.schedule('auto-checkout-presenca','0 2 * * *', $$ SELECT public.auto_checkout_presenca(); $$);
SELECT cron.unschedule('consolidar-presenca') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='consolidar-presenca');
SELECT cron.schedule('consolidar-presenca','10 2 * * *',
  $$ SELECT public.consolidar_presenca_dia(((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)); $$);
