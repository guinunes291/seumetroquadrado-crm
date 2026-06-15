
-- ============= ENUMS =============
CREATE TYPE public.lead_status AS ENUM (
  'novo','aguardando_atendimento','em_atendimento','qualificado','agendado',
  'visita_realizada','proposta_enviada','analise_credito','contrato_fechado',
  'pos_venda','perdido'
);

CREATE TYPE public.lead_origem AS ENUM (
  'facebook','google_sheets','site','indicacao','captacao_corretor',
  'whatsapp','telefone','plantao','agendamento_self_service','chatbot','outro'
);

CREATE TYPE public.lead_temperatura AS ENUM ('quente','morno','frio');

CREATE TYPE public.distribuicao_tipo AS ENUM ('automatica','manual','inicial');

-- ============= LEADS =============
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text NOT NULL,
  cpf text,
  origem public.lead_origem NOT NULL DEFAULT 'outro',
  projeto_nome text,
  campanha text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,

  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  corretor_anterior_id uuid,
  data_distribuicao timestamptz,
  timestamp_recebimento timestamptz,
  tentativas_redistribuicao int NOT NULL DEFAULT 0,
  corretores_que_tentaram uuid[] NOT NULL DEFAULT '{}',

  status public.lead_status NOT NULL DEFAULT 'novo',
  temperatura public.lead_temperatura,

  proximo_followup timestamptz,
  ultimo_contato timestamptz,
  ultima_interacao timestamptz,

  renda_informada text,
  usa_fgts boolean NOT NULL DEFAULT false,
  entrada_disponivel text,

  observacoes text,
  motivo_perdido text,

  na_lixeira boolean NOT NULL DEFAULT false,
  data_movido_lixeira timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_corretor_idx ON public.leads(corretor_id);
CREATE INDEX leads_status_idx ON public.leads(status);
CREATE INDEX leads_created_idx ON public.leads(created_at DESC);
CREATE INDEX leads_lixeira_idx ON public.leads(na_lixeira);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Admin e gestor podem fazer tudo
CREATE POLICY "Admin/gestor podem ver todos os leads" ON public.leads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Admin/gestor podem inserir leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Admin/gestor podem atualizar leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Admin pode deletar leads" ON public.leads
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Corretor: vê e edita apenas os próprios leads (ou leads sem corretor)
CREATE POLICY "Corretor vê seus leads" ON public.leads
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid());

CREATE POLICY "Corretor atualiza seus leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid())
  WITH CHECK (corretor_id = auth.uid());

CREATE TRIGGER set_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= FILA DE DISTRIBUIÇÃO (roleta) =============
CREATE TABLE public.fila_distribuicao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  posicao int NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  max_leads_dia int NOT NULL DEFAULT 10,
  leads_recebidos_hoje int NOT NULL DEFAULT 0,
  ultima_distribuicao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fila_posicao_idx ON public.fila_distribuicao(posicao);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fila_distribuicao TO authenticated;
GRANT ALL ON public.fila_distribuicao TO service_role;
ALTER TABLE public.fila_distribuicao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados veem a fila" ON public.fila_distribuicao
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/gestor gerenciam a fila" ON public.fila_distribuicao
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER set_fila_updated_at
  BEFORE UPDATE ON public.fila_distribuicao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= LOG DE DISTRIBUIÇÃO =============
CREATE TABLE public.distribution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL,
  tipo public.distribuicao_tipo NOT NULL,
  motivo text,
  distribuido_por_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dlog_lead_idx ON public.distribution_log(lead_id);
CREATE INDEX dlog_corretor_idx ON public.distribution_log(corretor_id);
CREATE INDEX dlog_created_idx ON public.distribution_log(created_at DESC);

GRANT SELECT, INSERT ON public.distribution_log TO authenticated;
GRANT ALL ON public.distribution_log TO service_role;
ALTER TABLE public.distribution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/gestor veem log completo" ON public.distribution_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Corretor vê o próprio log" ON public.distribution_log
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid());

CREATE POLICY "Service e admin/gestor inserem log" ON public.distribution_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

-- ============= FUNÇÃO: roleta de distribuição =============
-- Pega o próximo corretor ativo na fila (round-robin por posição),
-- atribui o lead e move o corretor para o fim da fila.
CREATE OR REPLACE FUNCTION public.distribuir_lead(
  _lead_id uuid,
  _tipo public.distribuicao_tipo DEFAULT 'automatica',
  _distribuido_por uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _corretor uuid;
  _max_pos int;
BEGIN
  -- Próximo corretor ativo, com cota disponível, ordenado por posição
  SELECT corretor_id INTO _corretor
  FROM public.fila_distribuicao
  WHERE ativo = true
    AND leads_recebidos_hoje < max_leads_dia
  ORDER BY posicao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _corretor IS NULL THEN
    RETURN NULL;
  END IF;

  -- Move o corretor para o fim da fila
  SELECT COALESCE(MAX(posicao), 0) INTO _max_pos FROM public.fila_distribuicao;

  UPDATE public.fila_distribuicao
  SET posicao = _max_pos + 1,
      leads_recebidos_hoje = leads_recebidos_hoje + 1,
      ultima_distribuicao = now()
  WHERE corretor_id = _corretor;

  -- Atribui o lead
  UPDATE public.leads
  SET corretor_id = _corretor,
      data_distribuicao = now(),
      timestamp_recebimento = now(),
      status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
      corretores_que_tentaram = array_append(corretores_que_tentaram, _corretor)
  WHERE id = _lead_id;

  -- Log
  INSERT INTO public.distribution_log(lead_id, corretor_id, tipo, distribuido_por_id, motivo)
  VALUES (_lead_id, _corretor, _tipo, _distribuido_por,
          CASE WHEN _tipo = 'automatica' THEN 'Roleta automática' ELSE 'Distribuição ' || _tipo::text END);

  RETURN _corretor;
END;
$$;

-- Reseta cotas diárias da fila (executar por pg_cron mais tarde)
CREATE OR REPLACE FUNCTION public.resetar_cotas_diarias()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.fila_distribuicao SET leads_recebidos_hoje = 0;
$$;
