-- Fase 6: Templates de mensagem
CREATE TYPE public.template_canal AS ENUM ('whatsapp','email','sms','interno');

CREATE TABLE public.templates_mensagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  canal public.template_canal NOT NULL DEFAULT 'whatsapp',
  assunto text,
  conteudo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates_mensagem TO authenticated;
GRANT ALL ON public.templates_mensagem TO service_role;
ALTER TABLE public.templates_mensagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem templates ativos" ON public.templates_mensagem FOR SELECT TO authenticated
USING (ativo = true OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Admin/gestor criam templates" ON public.templates_mensagem FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Admin/gestor atualizam templates" ON public.templates_mensagem FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "Admin/gestor deletam templates" ON public.templates_mensagem FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON public.templates_mensagem
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_templates_canal ON public.templates_mensagem(canal) WHERE ativo = true;

-- Gatilhos automáticos de alerta
CREATE OR REPLACE FUNCTION public.alerta_lead_distribuido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL
     AND (OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (
      NEW.corretor_id,
      'lead_novo',
      'Novo lead recebido',
      COALESCE(NEW.nome, 'Lead sem nome') || ' foi atribuído a você.',
      '/leads/' || NEW.id::text,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alerta_lead_distribuido ON public.leads;
CREATE TRIGGER trg_alerta_lead_distribuido
AFTER INSERT OR UPDATE OF corretor_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.alerta_lead_distribuido();

CREATE OR REPLACE FUNCTION public.alerta_tarefa_criada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (
      NEW.corretor_id,
      'follow_up',
      'Nova tarefa: ' || NEW.titulo,
      CASE WHEN NEW.data_vencimento IS NOT NULL
           THEN 'Vence em ' || to_char(NEW.data_vencimento, 'DD/MM/YYYY HH24:MI')
           ELSE 'Sem prazo definido' END,
      '/tarefas',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alerta_tarefa_criada ON public.tarefas;
CREATE TRIGGER trg_alerta_tarefa_criada
AFTER INSERT ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.alerta_tarefa_criada();

CREATE OR REPLACE FUNCTION public.alerta_agendamento_criado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (
      NEW.corretor_id,
      'agendamento_proximo',
      'Novo agendamento: ' || COALESCE(NEW.titulo, 'sem título'),
      'Data: ' || to_char(NEW.data_agendada, 'DD/MM/YYYY HH24:MI'),
      '/agendamentos',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alerta_agendamento_criado ON public.agendamentos;
CREATE TRIGGER trg_alerta_agendamento_criado
AFTER INSERT ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.alerta_agendamento_criado();