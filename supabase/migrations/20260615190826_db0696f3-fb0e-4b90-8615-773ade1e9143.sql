-- ============================ Tabelas ============================

CREATE TABLE IF NOT EXISTS public.copa_edicao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.copa_selecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  bandeira text NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.copa_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicao_id uuid NOT NULL REFERENCES public.copa_edicao(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selecao_id uuid REFERENCES public.copa_selecoes(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edicao_id, corretor_id)
);
CREATE INDEX IF NOT EXISTS idx_copa_part_edicao ON public.copa_participantes(edicao_id);
CREATE INDEX IF NOT EXISTS idx_copa_part_corretor ON public.copa_participantes(corretor_id);

CREATE TABLE IF NOT EXISTS public.copa_fases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicao_id uuid NOT NULL REFERENCES public.copa_edicao(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem int NOT NULL,
  semana_inicio int NOT NULL,
  semana_fim int NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_copa_fases_edicao ON public.copa_fases(edicao_id, ordem);

CREATE TABLE IF NOT EXISTS public.copa_confrontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fase_id uuid NOT NULL REFERENCES public.copa_fases(id) ON DELETE CASCADE,
  corretor_a_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  corretor_b_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vencedor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  definido_manual boolean NOT NULL DEFAULT false,
  semana_ref int,
  posicao int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copa_confrontos_fase ON public.copa_confrontos(fase_id, posicao);

CREATE TABLE IF NOT EXISTS public.copa_pontuacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicao_id uuid NOT NULL REFERENCES public.copa_edicao(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semana int NOT NULL,
  agendamentos int NOT NULL DEFAULT 0,
  visitas int NOT NULL DEFAULT 0,
  analise int NOT NULL DEFAULT 0,
  vendas int NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edicao_id, corretor_id, semana)
);
CREATE INDEX IF NOT EXISTS idx_copa_pont_edicao ON public.copa_pontuacoes(edicao_id, corretor_id);

CREATE TABLE IF NOT EXISTS public.copa_config_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  label text NOT NULL,
  pontos int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.copa_config_premios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posicao text NOT NULL,
  descricao text,
  valor text,
  icone text,
  ordem int NOT NULL DEFAULT 0
);

-- ============================ Triggers updated_at ============================
DROP TRIGGER IF EXISTS trg_copa_edicao_updated_at ON copa_edicao;
CREATE TRIGGER trg_copa_edicao_updated_at BEFORE UPDATE ON public.copa_edicao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_copa_pontuacoes_updated_at ON copa_pontuacoes;
CREATE TRIGGER trg_copa_pontuacoes_updated_at BEFORE UPDATE ON public.copa_pontuacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================ Grants + RLS ============================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'copa_edicao','copa_selecoes','copa_participantes','copa_fases',
    'copa_confrontos','copa_pontuacoes','copa_config_pontos','copa_config_premios'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_admin_all" ON public.%1$I;', t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_admin_all" ON public.%1$I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
      WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
    $f$, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "copa_edicao_select" ON public.copa_edicao;
CREATE POLICY "copa_edicao_select" ON public.copa_edicao FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "copa_selecoes_select" ON public.copa_selecoes;
CREATE POLICY "copa_selecoes_select" ON public.copa_selecoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "copa_participantes_select" ON public.copa_participantes;
CREATE POLICY "copa_participantes_select" ON public.copa_participantes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "copa_fases_select" ON public.copa_fases;
CREATE POLICY "copa_fases_select" ON public.copa_fases FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "copa_confrontos_select" ON public.copa_confrontos;
CREATE POLICY "copa_confrontos_select" ON public.copa_confrontos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "copa_config_pontos_select" ON public.copa_config_pontos;
CREATE POLICY "copa_config_pontos_select" ON public.copa_config_pontos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "copa_config_premios_select" ON public.copa_config_premios;
CREATE POLICY "copa_config_premios_select" ON public.copa_config_premios FOR SELECT TO authenticated USING (true);

-- ============================ Seeds ============================
-- Seed idempotente: só roda se a edição ainda não existir (esta migration é
-- uma re-emissão da 20260615170000, que já semeia os mesmos dados).
DO $seed$
BEGIN
  IF EXISTS (SELECT 1 FROM public.copa_edicao
             WHERE id = 'a0000000-0000-4000-8000-000000000001') THEN
    RETURN;
  END IF;

INSERT INTO public.copa_edicao (id, nome, data_inicio, data_fim, ativo)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Copa SMQ 2026', '2026-06-03', '2026-07-26', true);

INSERT INTO public.copa_fases (edicao_id, nome, ordem, semana_inicio, semana_fim) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Fase de Grupos',      1, 1, 3),
  ('a0000000-0000-4000-8000-000000000001', 'Oitavas de Final',    2, 4, 4),
  ('a0000000-0000-4000-8000-000000000001', 'Quartas de Final',    3, 5, 5),
  ('a0000000-0000-4000-8000-000000000001', 'Semifinal',           4, 6, 6),
  ('a0000000-0000-4000-8000-000000000001', 'Disputa de 3º Lugar', 5, 7, 7),
  ('a0000000-0000-4000-8000-000000000001', 'Final',               6, 8, 8);

INSERT INTO public.copa_config_pontos (chave, label, pontos) VALUES
  ('agendamento', 'Agendamento',        25),
  ('visita',      'Visita realizada',   40),
  ('analise',     'Análise de crédito', 60),
  ('venda',       'Venda (contrato)',   150);

INSERT INTO public.copa_config_premios (posicao, descricao, valor, icone, ordem) VALUES
  ('1º Lugar',     'Campeão',             'R$ 4.000,00', '🏆', 1),
  ('2º Lugar',     'Vice-Campeão',        'R$ 2.000,00', '🥈', 2),
  ('3º Lugar',     'Terceiro lugar',      'R$ 900,00',   '🥉', 3),
  ('Semifinal',    'Avanço à semifinal',  'R$ 250,00',   '🎖️', 4),
  ('Top 3 Grupos', 'Cada um',             'R$ 100,00',   '🏅', 5);

INSERT INTO public.copa_selecoes (nome, bandeira) VALUES
  ('Brasil','🇧🇷'),('Argentina','🇦🇷'),('França','🇫🇷'),('Alemanha','🇩🇪'),
  ('Espanha','🇪🇸'),('Portugal','🇵🇹'),('Inglaterra','🇬🇧'),('Itália','🇮🇹'),
  ('Países Baixos','🇳🇱'),('Bélgica','🇧🇪'),('Croácia','🇭🇷'),('Uruguai','🇺🇾'),
  ('Colômbia','🇨🇴'),('México','🇲🇽'),('Estados Unidos','🇺🇸'),('Japão','🇯🇵'),
  ('Coreia do Sul','🇰🇷'),('Senegal','🇸🇳'),('Marrocos','🇲🇦'),('Gana','🇬🇭'),
  ('Camarões','🇨🇲'),('Suíça','🇨🇭'),('Dinamarca','🇩🇰'),('Polônia','🇵🇱'),
  ('Sérvia','🇷🇸'),('Equador','🇪🇨'),('Catar','🇶🇦'),('Austrália','🇦🇺'),
  ('Canadá','🇨🇦'),('Chile','🇨🇱'),('Peru','🇵🇪'),('Nigéria','🇳🇬');

END $seed$;

-- ============================ Funções (RPCs) ============================

CREATE OR REPLACE FUNCTION public.copa_pontos_corretor(_corretor_id uuid, _di timestamptz, _df timestamptz)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT
      COALESCE(MAX(pontos) FILTER (WHERE chave='agendamento'),0) AS p_ag,
      COALESCE(MAX(pontos) FILTER (WHERE chave='visita'),0)      AS p_vi,
      COALESCE(MAX(pontos) FILTER (WHERE chave='analise'),0)     AS p_an,
      COALESCE(MAX(pontos) FILTER (WHERE chave='venda'),0)       AS p_ve
    FROM public.copa_config_pontos
  ),
  ag AS (
    SELECT count(*)::int AS n FROM public.agendamentos
    WHERE corretor_id = _corretor_id AND deleted_at IS NULL
      AND created_at >= _di AND created_at < _df
  ),
  tr AS (
    SELECT
      count(*) FILTER (WHERE para_status='visita_realizada')::int AS vi,
      count(*) FILTER (WHERE para_status='analise_credito')::int  AS an,
      count(*) FILTER (WHERE para_status='contrato_fechado')::int AS ve
    FROM public.lead_status_transitions
    WHERE corretor_id = _corretor_id AND created_at >= _di AND created_at < _df
  )
  SELECT (ag.n * cfg.p_ag) + (tr.vi * cfg.p_vi) + (tr.an * cfg.p_an) + (tr.ve * cfg.p_ve)
  FROM cfg, ag, tr;
$$;
REVOKE EXECUTE ON FUNCTION public.copa_pontos_corretor(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_pontos_corretor(uuid, timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.copa_ranking(_edicao_id uuid)
RETURNS TABLE (
  corretor_id uuid, nome text, bandeira text,
  agendamentos int, visitas int, analise int, vendas int, total int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT data_inicio::timestamptz AS di, (data_fim + 1)::timestamptz AS df
    FROM public.copa_edicao WHERE id = _edicao_id
  ),
  cfg AS (
    SELECT
      COALESCE(MAX(pontos) FILTER (WHERE chave='agendamento'),0) AS p_ag,
      COALESCE(MAX(pontos) FILTER (WHERE chave='visita'),0)      AS p_vi,
      COALESCE(MAX(pontos) FILTER (WHERE chave='analise'),0)     AS p_an,
      COALESCE(MAX(pontos) FILTER (WHERE chave='venda'),0)       AS p_ve
    FROM public.copa_config_pontos
  ),
  part AS (
    SELECT cp.corretor_id AS cid, s.bandeira AS bandeira
    FROM public.copa_participantes cp
    LEFT JOIN public.copa_selecoes s ON s.id = cp.selecao_id
    WHERE cp.edicao_id = _edicao_id AND cp.ativo = true
  ),
  ag AS (
    SELECT a.corretor_id AS cid, count(*)::int AS n
    FROM public.agendamentos a, e
    WHERE a.deleted_at IS NULL AND a.created_at >= e.di AND a.created_at < e.df
    GROUP BY a.corretor_id
  ),
  tr AS (
    SELECT t.corretor_id AS cid,
      count(*) FILTER (WHERE t.para_status='visita_realizada')::int AS vi,
      count(*) FILTER (WHERE t.para_status='analise_credito')::int  AS an,
      count(*) FILTER (WHERE t.para_status='contrato_fechado')::int AS ve
    FROM public.lead_status_transitions t, e
    WHERE t.created_at >= e.di AND t.created_at < e.df
    GROUP BY t.corretor_id
  ),
  man AS (
    SELECT pn.corretor_id AS cid,
      COALESCE(SUM(pn.agendamentos),0)::int AS ag,
      COALESCE(SUM(pn.visitas),0)::int      AS vi,
      COALESCE(SUM(pn.analise),0)::int      AS an,
      COALESCE(SUM(pn.vendas),0)::int       AS ve
    FROM public.copa_pontuacoes pn
    WHERE pn.edicao_id = _edicao_id
    GROUP BY pn.corretor_id
  )
  SELECT
    part.cid,
    COALESCE(pr.nome, 'Corretor'),
    COALESCE(part.bandeira, ''),
    (COALESCE(ag.n,0)  + COALESCE(man.ag,0)),
    (COALESCE(tr.vi,0) + COALESCE(man.vi,0)),
    (COALESCE(tr.an,0) + COALESCE(man.an,0)),
    (COALESCE(tr.ve,0) + COALESCE(man.ve,0)),
    ((COALESCE(ag.n,0)  + COALESCE(man.ag,0)) * cfg.p_ag
     + (COALESCE(tr.vi,0) + COALESCE(man.vi,0)) * cfg.p_vi
     + (COALESCE(tr.an,0) + COALESCE(man.an,0)) * cfg.p_an
     + (COALESCE(tr.ve,0) + COALESCE(man.ve,0)) * cfg.p_ve)
  FROM part
  CROSS JOIN cfg
  LEFT JOIN public.profiles pr ON pr.id = part.cid
  LEFT JOIN ag  ON ag.cid  = part.cid
  LEFT JOIN tr  ON tr.cid  = part.cid
  LEFT JOIN man ON man.cid = part.cid
  ORDER BY 8 DESC, 2 ASC;
$$;
REVOKE EXECUTE ON FUNCTION public.copa_ranking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_ranking(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.copa_set_participantes(_edicao_id uuid, _ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.copa_participantes SET ativo = false
  WHERE edicao_id = _edicao_id AND NOT (corretor_id = ANY(_ids));
  INSERT INTO public.copa_participantes (edicao_id, corretor_id, ativo)
  SELECT _edicao_id, x, true FROM unnest(_ids) AS x
  ON CONFLICT (edicao_id, corretor_id) DO UPDATE SET ativo = true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.copa_set_participantes(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_set_participantes(uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.copa_realizar_sorteio(_edicao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _nsel int; _fase_grupos uuid; _r record; _prev uuid := NULL; _pos int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT count(*) INTO _nsel FROM public.copa_selecoes WHERE ativo = true;
  IF _nsel = 0 THEN RAISE EXCEPTION 'sem selecoes cadastradas'; END IF;

  WITH parts AS (
    SELECT id, (row_number() OVER (ORDER BY random()) - 1) AS rn
    FROM public.copa_participantes
    WHERE edicao_id = _edicao_id AND ativo = true
  ),
  sels AS (
    SELECT id, (row_number() OVER (ORDER BY random()) - 1) AS rn
    FROM public.copa_selecoes WHERE ativo = true
  )
  UPDATE public.copa_participantes cp
  SET selecao_id = (SELECT s.id FROM sels s WHERE s.rn = (p.rn % _nsel))
  FROM parts p
  WHERE cp.id = p.id;

  DELETE FROM public.copa_confrontos c
  USING public.copa_fases f
  WHERE c.fase_id = f.id AND f.edicao_id = _edicao_id;

  SELECT id INTO _fase_grupos FROM public.copa_fases
  WHERE edicao_id = _edicao_id ORDER BY ordem ASC LIMIT 1;
  IF _fase_grupos IS NULL THEN RETURN; END IF;

  FOR _r IN
    SELECT corretor_id FROM public.copa_participantes
    WHERE edicao_id = _edicao_id AND ativo = true
    ORDER BY random()
  LOOP
    IF _prev IS NULL THEN
      _prev := _r.corretor_id;
    ELSE
      _pos := _pos + 1;
      INSERT INTO public.copa_confrontos (fase_id, corretor_a_id, corretor_b_id, semana_ref, posicao)
      VALUES (_fase_grupos, _prev, _r.corretor_id, 1, _pos);
      _prev := NULL;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.copa_realizar_sorteio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_realizar_sorteio(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.copa_apurar_fase(_fase_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _di timestamptz; _df timestamptz;
  _c record; _pa int; _pb int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT (e.data_inicio + (f.semana_inicio - 1) * 7)::timestamptz,
         (e.data_inicio + f.semana_fim * 7)::timestamptz
  INTO _di, _df
  FROM public.copa_fases f JOIN public.copa_edicao e ON e.id = f.edicao_id
  WHERE f.id = _fase_id;
  IF _di IS NULL THEN RETURN; END IF;

  FOR _c IN
    SELECT id, corretor_a_id, corretor_b_id FROM public.copa_confrontos
    WHERE fase_id = _fase_id AND definido_manual = false
      AND corretor_a_id IS NOT NULL AND corretor_b_id IS NOT NULL
  LOOP
    _pa := public.copa_pontos_corretor(_c.corretor_a_id, _di, _df);
    _pb := public.copa_pontos_corretor(_c.corretor_b_id, _di, _df);
    UPDATE public.copa_confrontos
    SET vencedor_id = CASE WHEN _pb > _pa THEN _c.corretor_b_id ELSE _c.corretor_a_id END
    WHERE id = _c.id;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.copa_apurar_fase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_apurar_fase(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.copa_definir_vencedor(_confronto_id uuid, _corretor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.copa_confrontos
  SET vencedor_id = _corretor_id, definido_manual = true
  WHERE id = _confronto_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.copa_definir_vencedor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copa_definir_vencedor(uuid, uuid) TO authenticated, service_role;