
-- Fase 4: Tarefas, Follow-ups e Alertas
CREATE TYPE public.tarefa_status AS ENUM ('pendente','em_andamento','concluida','cancelada');
CREATE TYPE public.tarefa_prioridade AS ENUM ('baixa','media','alta','urgente');
CREATE TYPE public.tarefa_tipo AS ENUM ('ligacao','whatsapp','email','visita','follow_up','documentacao','outro');

CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  tipo public.tarefa_tipo NOT NULL DEFAULT 'follow_up',
  status public.tarefa_status NOT NULL DEFAULT 'pendente',
  prioridade public.tarefa_prioridade NOT NULL DEFAULT 'media',
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data_vencimento timestamptz,
  data_conclusao timestamptz,
  resultado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas TO authenticated;
GRANT ALL ON public.tarefas TO service_role;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Corretores veem suas tarefas" ON public.tarefas FOR SELECT TO authenticated
USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Corretores criam tarefas" ON public.tarefas FOR INSERT TO authenticated
WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Corretores atualizam suas tarefas" ON public.tarefas FOR UPDATE TO authenticated
USING (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Admin/gestor deletam tarefas" ON public.tarefas FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR corretor_id = auth.uid());

CREATE TRIGGER trg_tarefas_updated_at BEFORE UPDATE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_tarefas_corretor ON public.tarefas(corretor_id);
CREATE INDEX idx_tarefas_lead ON public.tarefas(lead_id);
CREATE INDEX idx_tarefas_status ON public.tarefas(status);
CREATE INDEX idx_tarefas_vencimento ON public.tarefas(data_vencimento);

-- Alertas (notificações in-app)
CREATE TYPE public.alerta_tipo AS ENUM ('tarefa_atrasada','lead_novo','agendamento_proximo','follow_up','sistema');

CREATE TABLE public.alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo public.alerta_tipo NOT NULL,
  titulo text NOT NULL,
  mensagem text,
  lida boolean NOT NULL DEFAULT false,
  link text,
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas TO authenticated;
GRANT ALL ON public.alertas TO service_role;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User vê seus alertas" ON public.alertas FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "User atualiza seus alertas" ON public.alertas FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "User deleta seus alertas" ON public.alertas FOR DELETE TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Admin/gestor criam alertas" ON public.alertas FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR user_id = auth.uid());

CREATE INDEX idx_alertas_user ON public.alertas(user_id, lida);
