-- Metas do dia declaradas pelo próprio corretor (popup obrigatório na primeira
-- abertura do dia). Uma linha por corretor por dia — histórico completo, para o
-- gestor comparar "meta prometida × realizada" em qualquer data.
--
-- Difere de public.metas_diarias (uma linha por corretor, recorrente, escrita
-- só pela gestão): aquela é a SUGESTÃO do gestor; esta é a RESPOSTA do corretor.
--
-- Realizado NÃO mora aqui — é derivado das tabelas de origem no front:
--   agendamentos criados no dia (visita/reunião, não automáticos, não cancelados),
--   leads que entraram em analise_credito no dia (lead_status_transitions),
--   vendas pendentes+aprovadas com data_assinatura na semana (seg–dom).

CREATE TABLE IF NOT EXISTS public.metas_dia_corretor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Dia em America/Sao_Paulo (calculado no cliente com esse fuso).
  dia date NOT NULL,
  -- Segunda-feira da semana ISO de `dia` — a meta de vendas é semanal.
  semana_inicio date NOT NULL,
  meta_agendamentos integer NOT NULL DEFAULT 0 CHECK (meta_agendamentos >= 0),
  meta_documentacoes integer NOT NULL DEFAULT 0 CHECK (meta_documentacoes >= 0),
  meta_vendas_semana integer NOT NULL DEFAULT 0 CHECK (meta_vendas_semana >= 0),
  respondido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_dia_corretor_uk UNIQUE (corretor_id, dia),
  -- Garante no banco que semana_inicio é a segunda-feira de `dia`.
  CONSTRAINT metas_dia_corretor_semana_ck
    CHECK (semana_inicio = dia - (EXTRACT(ISODOW FROM dia)::int - 1))
);

CREATE INDEX IF NOT EXISTS idx_metas_dia_corretor_dia
  ON public.metas_dia_corretor (corretor_id, dia DESC);
CREATE INDEX IF NOT EXISTS idx_metas_dia_corretor_semana
  ON public.metas_dia_corretor (semana_inicio);

GRANT SELECT, INSERT, UPDATE ON public.metas_dia_corretor TO authenticated;
GRANT ALL ON public.metas_dia_corretor TO service_role;

ALTER TABLE public.metas_dia_corretor ENABLE ROW LEVEL SECURITY;

-- Leitura: o próprio corretor; admin/superintendente (tudo); gestor apenas
-- dos corretores do seu time (mesmo recorte de public.metas via
-- corretores_do_gestor — hardening de 20/07).
DROP POLICY IF EXISTS "metas_dia: leitura no escopo" ON public.metas_dia_corretor;
CREATE POLICY "metas_dia: leitura no escopo" ON public.metas_dia_corretor
  FOR SELECT TO authenticated
  USING (
    corretor_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superintendente')
    OR (
      public.has_role(auth.uid(), 'gestor')
      AND corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
    )
  );

-- Escrita: só o próprio corretor, só nas próprias linhas.
DROP POLICY IF EXISTS "metas_dia: corretor declara a propria meta" ON public.metas_dia_corretor;
CREATE POLICY "metas_dia: corretor declara a propria meta" ON public.metas_dia_corretor
  FOR INSERT TO authenticated
  WITH CHECK (corretor_id = auth.uid());

DROP POLICY IF EXISTS "metas_dia: corretor ajusta a propria meta" ON public.metas_dia_corretor;
CREATE POLICY "metas_dia: corretor ajusta a propria meta" ON public.metas_dia_corretor
  FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid())
  WITH CHECK (corretor_id = auth.uid());

DROP TRIGGER IF EXISTS trg_metas_dia_corretor_updated ON public.metas_dia_corretor;
CREATE TRIGGER trg_metas_dia_corretor_updated
  BEFORE UPDATE ON public.metas_dia_corretor
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.metas_dia_corretor IS
  'Metas declaradas pelo corretor na primeira abertura do dia (agendamentos e documentações do dia, vendas da semana).';
