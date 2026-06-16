
-- Push subscriptions table
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subs"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_push_subs_updated
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Push outbox: enfileira eventos que serão entregues pelo cron + pg_net
CREATE TABLE public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX idx_push_outbox_pending ON public.push_outbox(created_at) WHERE sent_at IS NULL;

GRANT SELECT ON public.push_outbox TO authenticated;
GRANT ALL ON public.push_outbox TO service_role;

ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own push outbox"
  ON public.push_outbox FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Helper para enfileirar
CREATE OR REPLACE FUNCTION public.enqueue_push(_user_id uuid, _title text, _body text, _url text, _tag text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.push_outbox(user_id, title, body, url, tag)
  VALUES (_user_id, _title, _body, _url, _tag);
$$;

-- Trigger: lead distribuído (corretor_id mudou de NULL para algo)
CREATE OR REPLACE FUNCTION public.push_lead_distribuido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL AND (OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    PERFORM public.enqueue_push(
      NEW.corretor_id,
      'Novo lead recebido',
      COALESCE(NEW.nome, 'Lead sem nome') || COALESCE(' · ' || NEW.telefone, ''),
      '/leads/' || NEW.id::text,
      'lead-' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_lead_distribuido ON public.leads;
CREATE TRIGGER trg_push_lead_distribuido
  AFTER INSERT OR UPDATE OF corretor_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.push_lead_distribuido();

-- Trigger: tarefa criada
CREATE OR REPLACE FUNCTION public.push_tarefa_criada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL THEN
    PERFORM public.enqueue_push(
      NEW.corretor_id,
      'Nova tarefa: ' || NEW.titulo,
      CASE WHEN NEW.data_vencimento IS NOT NULL
           THEN 'Vence em ' || to_char(NEW.data_vencimento, 'DD/MM/YYYY HH24:MI')
           ELSE 'Sem prazo definido' END,
      '/tarefas',
      'tarefa-' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_tarefa_criada ON public.tarefas;
CREATE TRIGGER trg_push_tarefa_criada
  AFTER INSERT ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.push_tarefa_criada();

-- Função: gera pushes para agendamentos próximos (chamada por cron)
CREATE OR REPLACE FUNCTION public.gerar_pushes_agendamentos_proximos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.push_outbox(user_id, title, body, url, tag)
  SELECT ag.corretor_id,
         'Agendamento em breve: ' || ag.titulo,
         to_char(ag.data_inicio, 'DD/MM/YYYY HH24:MI') || COALESCE(' · ' || ag.local, ''),
         '/agendamentos',
         'agendamento-' || ag.id::text
  FROM public.agendamentos ag
  WHERE ag.deleted_at IS NULL
    AND ag.status IN ('agendado','confirmado','remarcado')
    AND ag.data_inicio > now()
    AND ag.data_inicio <= now() + (COALESCE(ag.lembrete_minutos, 30) || ' minutes')::interval
    AND ag.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.push_outbox po
      WHERE po.tag = 'agendamento-' || ag.id::text
    );

  -- Tarefas vencendo nos próximos 30 min
  INSERT INTO public.push_outbox(user_id, title, body, url, tag)
  SELECT t.corretor_id,
         'Tarefa vencendo: ' || t.titulo,
         'Vence ' || to_char(t.data_vencimento, 'DD/MM HH24:MI'),
         '/tarefas',
         'tarefa-venc-' || t.id::text
  FROM public.tarefas t
  WHERE t.status IN ('pendente','em_andamento')
    AND t.deleted_at IS NULL
    AND t.data_vencimento IS NOT NULL
    AND t.data_vencimento > now()
    AND t.data_vencimento <= now() + interval '30 minutes'
    AND t.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.push_outbox po WHERE po.tag = 'tarefa-venc-' || t.id::text
    );
END;
$$;
