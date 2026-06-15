-- Copa SMQ (Fase 4) — esquema, RLS e seeds.
-- Torneio temático: corretores pontuam por atividades do CRM (agendamentos +
-- lead_status_transitions), recebem uma "seleção" no sorteio e disputam
-- fase de grupos + mata-mata. Segue os padrões do repo (has_role, set_updated_at).

-- ============================ Tabelas ============================

CREATE TABLE public.copa_edicao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.copa_selecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  bandeira text NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.copa_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicao_id uuid NOT NULL REFERENCES public.copa_edicao(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selecao_id uuid REFERENCES public.copa_selecoes(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edicao_id, corretor_id)
);
CREATE INDEX idx_copa_part_edicao ON public.copa_participantes(edicao_id);
CREATE INDEX idx_copa_part_corretor ON public.copa_participantes(corretor_id);

CREATE TABLE public.copa_fases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicao_id uuid NOT NULL REFERENCES public.copa_edicao(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem int NOT NULL,
  semana_inicio int NOT NULL,
  semana_fim int NOT NULL
);
CREATE INDEX idx_copa_fases_edicao ON public.copa_fases(edicao_id, ordem);

CREATE TABLE public.copa_confrontos (
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
CREATE INDEX idx_copa_confrontos_fase ON public.copa_confrontos(fase_id, posicao);

CREATE TABLE public.copa_pontuacoes (
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
CREATE INDEX idx_copa_pont_edicao ON public.copa_pontuacoes(edicao_id, corretor_id);

CREATE TABLE public.copa_config_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  label text NOT NULL,
  pontos int NOT NULL DEFAULT 0
);

CREATE TABLE public.copa_config_premios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posicao text NOT NULL,
  descricao text,
  valor text,
  icone text,
  ordem int NOT NULL DEFAULT 0
);

-- ============================ Triggers updated_at ============================
CREATE TRIGGER trg_copa_edicao_updated_at BEFORE UPDATE ON public.copa_edicao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_copa_pontuacoes_updated_at BEFORE UPDATE ON public.copa_pontuacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================ Grants + RLS ============================
-- Padrão: leitura para authenticated; escrita só admin/gestor (has_role).
-- copa_pontuacoes é restrita a admin/gestor (o ranking agrega via SECURITY DEFINER).

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
    EXECUTE format($f$
      CREATE POLICY "%1$s_admin_all" ON public.%1$I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
      WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
    $f$, t);
  END LOOP;
END $$;

-- Leitura pública (authenticated) para estrutura/leaderboard (exceto copa_pontuacoes).
CREATE POLICY "copa_edicao_select" ON public.copa_edicao FOR SELECT TO authenticated USING (true);
CREATE POLICY "copa_selecoes_select" ON public.copa_selecoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "copa_participantes_select" ON public.copa_participantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "copa_fases_select" ON public.copa_fases FOR SELECT TO authenticated USING (true);
CREATE POLICY "copa_confrontos_select" ON public.copa_confrontos FOR SELECT TO authenticated USING (true);
CREATE POLICY "copa_config_pontos_select" ON public.copa_config_pontos FOR SELECT TO authenticated USING (true);
CREATE POLICY "copa_config_premios_select" ON public.copa_config_premios FOR SELECT TO authenticated USING (true);

-- ============================ Seeds ============================

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
