-- Enums
CREATE TYPE public.agendamento_tipo AS ENUM ('visita','reuniao','ligacao','follow_up','outro');
CREATE TYPE public.agendamento_status AS ENUM ('agendado','confirmado','realizado','cancelado','nao_compareceu','remarcado');

-- Tabela
CREATE TABLE public.agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_por_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo public.agendamento_tipo NOT NULL DEFAULT 'visita',
  status public.agendamento_status NOT NULL DEFAULT 'agendado',
  titulo text NOT NULL,
  descricao text,
  local text,
  data_inicio timestamptz NOT NULL,
  data_fim timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  lembrete_minutos int NOT NULL DEFAULT 30,
  motivo_cancelamento text,
  realizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agendamentos_periodo_valido CHECK (data_fim > data_inicio)
);

CREATE INDEX idx_agendamentos_corretor ON public.agendamentos(corretor_id, data_inicio);
CREATE INDEX idx_agendamentos_lead ON public.agendamentos(lead_id);
CREATE INDEX idx_agendamentos_data ON public.agendamentos(data_inicio);
CREATE INDEX idx_agendamentos_status ON public.agendamentos(status);

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;

-- RLS
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agendamentos_select_proprios_ou_admin"
  ON public.agendamentos FOR SELECT
  TO authenticated
  USING (
    corretor_id = auth.uid()
    OR criado_por_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
  );

CREATE POLICY "agendamentos_insert_autenticado"
  ON public.agendamentos FOR INSERT
  TO authenticated
  WITH CHECK (
    criado_por_id = auth.uid()
    AND (
      corretor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
    )
  );

CREATE POLICY "agendamentos_update_responsavel_ou_admin"
  ON public.agendamentos FOR UPDATE
  TO authenticated
  USING (
    corretor_id = auth.uid()
    OR criado_por_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
  )
  WITH CHECK (
    corretor_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
  );

CREATE POLICY "agendamentos_delete_admin_gestor"
  ON public.agendamentos FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR criado_por_id = auth.uid()
  );

-- Trigger updated_at
CREATE TRIGGER set_agendamentos_updated_at
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();