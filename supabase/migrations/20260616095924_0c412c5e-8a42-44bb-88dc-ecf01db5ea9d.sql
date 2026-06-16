
-- ============ FASE 1a: backend de automação + SLA ============

-- 1) SLA por origem (configurável). Mantém timeout_horas (redistribuição).
ALTER TABLE public.distribuicao_config
  ADD COLUMN IF NOT EXISTS sla_minutos integer NOT NULL DEFAULT 30;

-- Garante linha default para cada origem existente nos leads (idempotente)
INSERT INTO public.distribuicao_config (origem, timeout_horas, sla_minutos)
SELECT DISTINCT l.origem, 24, 30
FROM public.leads l
WHERE l.origem IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.distribuicao_config dc WHERE dc.origem = l.origem)
ON CONFLICT DO NOTHING;

-- 2) Coluna em tarefas marcando follow-up automático (para cancelar ao sair do funil)
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS origem_automatica boolean NOT NULL DEFAULT false;

-- 3) RPC: leads_com_sla — retorna SLA/temperatura calculada em tempo real
CREATE OR REPLACE FUNCTION public.leads_com_sla(_corretor uuid DEFAULT NULL)
RETURNS TABLE (
  lead_id uuid,
  sla_minutos integer,
  minutos_decorridos integer,
  sla_status text,
  temperatura_calc lead_temperatura
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  SELECT l.id,
         COALESCE(dc.sla_minutos, 30) AS sla_minutos,
         (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60)::int AS minutos_decorridos,
         CASE
           WHEN l.status NOT IN ('novo','aguardando_atendimento') THEN 'ok'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > COALESCE(dc.sla_minutos,30) THEN 'estourado'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > (COALESCE(dc.sla_minutos,30) * 0.6) THEN 'atencao'
           ELSE 'ok'
         END AS sla_status,
         CASE
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
           ELSE 'frio'::lead_temperatura
         END AS temperatura_calc
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND (_scope IS NULL OR l.corretor_id = _scope);
END;
$$;

-- 4) Recalcula temperatura para todos leads ativos (cron 10 min)
CREATE OR REPLACE FUNCTION public.recalcular_temperatura_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n int;
BEGIN
  WITH calc AS (
    SELECT id,
      CASE
        WHEN ultima_interacao IS NOT NULL AND ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
        WHEN ultima_interacao IS NOT NULL AND ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
        ELSE 'frio'::lead_temperatura
      END AS nova
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND status NOT IN ('contrato_fechado','pos_venda','perdido')
  )
  UPDATE public.leads l
  SET temperatura = c.nova
  FROM calc c
  WHERE l.id = c.id AND l.temperatura IS DISTINCT FROM c.nova;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- 5) Trigger: follow-up automático ao entrar em em_atendimento
CREATE OR REPLACE FUNCTION public.criar_followup_em_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'em_atendimento'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.corretor_id IS NOT NULL THEN
    INSERT INTO public.tarefas (titulo, descricao, tipo, status, prioridade, lead_id, corretor_id, criado_por, data_vencimento, origem_automatica)
    VALUES (
      'Follow-up automático',
      'Tarefa criada automaticamente 24h após início do atendimento.',
      'follow_up', 'pendente', 'media',
      NEW.id, NEW.corretor_id, NEW.corretor_id,
      now() + interval '24 hours',
      true
    );

    UPDATE public.leads SET proximo_followup = now() + interval '24 hours' WHERE id = NEW.id;
  END IF;

  -- Cancela follow-ups automáticos pendentes ao sair do funil ativo
  IF NEW.status IN ('perdido','contrato_fechado','pos_venda')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.tarefas
    SET status = 'cancelada', updated_at = now()
    WHERE lead_id = NEW.id
      AND origem_automatica = true
      AND status IN ('pendente','em_andamento');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_followup_em_atendimento ON public.leads;
CREATE TRIGGER trg_followup_em_atendimento
AFTER UPDATE OF status ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.criar_followup_em_atendimento();

-- 6) Cron jobs (idempotentes)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('distribuicao-auto') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='distribuicao-auto');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('recalc-temperatura') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='recalc-temperatura');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('distribuicao-auto', '*/5 * * * *', $$SELECT public.processar_distribuicao_automatica();$$);
SELECT cron.schedule('recalc-temperatura', '*/10 * * * *', $$SELECT public.recalcular_temperatura_leads();$$);

-- 7) Realtime estendido
ALTER TABLE public.tarefas REPLICA IDENTITY FULL;
ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
ALTER TABLE public.interacoes REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tarefas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.interacoes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8) Scripts & Objeções
CREATE TABLE IF NOT EXISTS public.scripts_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  categoria text,
  etapa lead_status,
  conteudo text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scripts_vendas TO authenticated;
GRANT ALL ON public.scripts_vendas TO service_role;
ALTER TABLE public.scripts_vendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scripts_select_all_auth" ON public.scripts_vendas;
CREATE POLICY "scripts_select_all_auth" ON public.scripts_vendas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "scripts_insert_admin_gestor" ON public.scripts_vendas;
CREATE POLICY "scripts_insert_admin_gestor" ON public.scripts_vendas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS "scripts_update_admin_gestor" ON public.scripts_vendas;
CREATE POLICY "scripts_update_admin_gestor" ON public.scripts_vendas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS "scripts_delete_admin_gestor" ON public.scripts_vendas;
CREATE POLICY "scripts_delete_admin_gestor" ON public.scripts_vendas
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP TRIGGER IF EXISTS trg_scripts_updated_at ON public.scripts_vendas;
CREATE TRIGGER trg_scripts_updated_at BEFORE UPDATE ON public.scripts_vendas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.objecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objecao text NOT NULL,
  resposta text NOT NULL,
  categoria text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objecoes TO authenticated;
GRANT ALL ON public.objecoes TO service_role;
ALTER TABLE public.objecoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "objecoes_select_all_auth" ON public.objecoes;
CREATE POLICY "objecoes_select_all_auth" ON public.objecoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "objecoes_insert_admin_gestor" ON public.objecoes;
CREATE POLICY "objecoes_insert_admin_gestor" ON public.objecoes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS "objecoes_update_admin_gestor" ON public.objecoes;
CREATE POLICY "objecoes_update_admin_gestor" ON public.objecoes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS "objecoes_delete_admin_gestor" ON public.objecoes;
CREATE POLICY "objecoes_delete_admin_gestor" ON public.objecoes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP TRIGGER IF EXISTS trg_objecoes_updated_at ON public.objecoes;
CREATE TRIGGER trg_objecoes_updated_at BEFORE UPDATE ON public.objecoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed inicial (somente se vazio)
INSERT INTO public.scripts_vendas (titulo, categoria, etapa, conteudo, ordem)
SELECT * FROM (VALUES
  ('Abertura - Primeiro contato', 'Abertura', 'aguardando_atendimento'::lead_status,
    E'Olá {{nome}}! Aqui é {{corretor}} do Seu Metro Quadrado.\nVi que você demonstrou interesse no {{projeto}}.\nPosso te enviar agora as condições atualizadas e tirar suas dúvidas?', 1),
  ('Qualificação - Descoberta', 'Qualificação', 'em_atendimento'::lead_status,
    E'{{nome}}, para eu indicar a melhor opção, me conta rapidinho:\n• Você buscaria para morar ou investir?\n• Tem alguma região preferida?\n• Já tem ideia de valor de entrada?', 2),
  ('Apresentação do projeto', 'Apresentação', 'qualificado'::lead_status,
    E'{{nome}}, baseado no que você me disse, o {{projeto}} encaixa muito bem.\nDestaques: localização, lazer completo, condições facilitadas.\nQuer que eu agende uma visita esta semana?', 3),
  ('Agendamento de visita', 'Agendamento', 'agendado'::lead_status,
    E'{{nome}}, agendei sua visita ao {{projeto}} para {{data_visita}}.\nMe confirma 1 dia antes? Qualquer imprevisto remarcamos sem problema.', 4),
  ('Pós-visita', 'Pós-visita', 'visita_realizada'::lead_status,
    E'{{nome}}, e aí, o que mais te chamou atenção no {{projeto}}?\nQuer que eu te envie a simulação personalizada para a unidade que você gostou?', 5),
  ('Análise de crédito', 'Crédito', 'analise_credito'::lead_status,
    E'{{nome}}, para iniciar a análise preciso de:\n• RG/CPF\n• Comprovante de renda (3 últimos)\n• Comprovante de residência\nPode me enviar por aqui?', 6),
  ('Fechamento', 'Fechamento', 'contrato_fechado'::lead_status,
    E'{{nome}}, parabéns pela escolha! 🎉\nVou te enviar o passo a passo da assinatura. Qualquer dúvida estou aqui.', 7),
  ('Reativação - lead frio', 'Reativação', NULL,
    E'Oi {{nome}}, tudo bem? Faz um tempo que conversamos sobre o {{projeto}}.\nSaíram condições novas que podem te interessar. Posso te mandar?', 8)
) AS s(titulo, categoria, etapa, conteudo, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.scripts_vendas);

INSERT INTO public.objecoes (objecao, resposta, categoria, ordem)
SELECT * FROM (VALUES
  ('Está caro', E'Entendo {{nome}}. O valor reflete localização, padrão construtivo e potencial de valorização.\nPosso te mostrar 3 simulações com entradas diferentes para caber no seu orçamento?', 'Preço', 1),
  ('Vou pensar', E'Claro {{nome}}, é uma decisão importante.\nO que mais pesa na sua decisão hoje? Posso te ajudar a comparar com calma.', 'Indecisão', 2),
  ('Preciso falar com meu cônjuge', E'Faz todo sentido, {{nome}}.\nQuer que eu prepare um material resumido para vocês analisarem juntos? Posso ligar amanhã para esclarecer dúvidas.', 'Decisão conjunta', 3),
  ('Não tenho a entrada', E'{{nome}}, hoje conseguimos parcelar a entrada em até 60x direto com a construtora.\nQuer que eu simule um valor que caiba no seu bolso?', 'Financeiro', 4),
  ('Vou esperar baixar', E'O mercado em {{projeto}} está em alta — quem comprou ano passado já valorizou.\nSe esperar, o preço da tabela tende a subir. Posso travar a condição atual para você?', 'Timing', 5),
  ('Quero ver outros imóveis', E'Ótimo, {{nome}}, comparar é importante.\nMe diz quais critérios são essenciais para você que eu te ajudo a comparar tecnicamente.', 'Concorrência', 6),
  ('Estou sem tempo agora', E'Sem problemas {{nome}}, qual o melhor horário para te ligar?\nEm 10 minutos te passo tudo o que precisa saber.', 'Disponibilidade', 7),
  ('Não confio em comprar na planta', E'Entendo, {{nome}}. A construtora tem entregas comprovadas e o contrato é registrado em cartório.\nQuer que eu te envie o histórico de entregas dela?', 'Confiança', 8),
  ('Estou negativado', E'Sem problemas {{nome}}, temos opções com análise diferenciada.\nPosso te orientar e simular condições mesmo com restrição.', 'Crédito', 9),
  ('Não decidi a região', E'Vamos lá {{nome}}, me conta sua rotina: trabalho, escola dos filhos, lazer.\nA partir disso eu te sugiro 2-3 regiões que se encaixam.', 'Indecisão', 10)
) AS o(objecao, resposta, categoria, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.objecoes);

-- 9) RPCs de relatórios
CREATE OR REPLACE FUNCTION public.rel_tempo_medio_por_etapa(_di timestamptz, _df timestamptz, _corretor uuid DEFAULT NULL)
RETURNS TABLE (etapa text, media_horas numeric, p50_horas numeric, n integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH t AS (
    SELECT lst.lead_id, lst.de_status::text AS etapa, lst.created_at,
           LAG(lst.created_at) OVER (PARTITION BY lst.lead_id ORDER BY lst.created_at) AS anterior
    FROM public.lead_status_transitions lst
    WHERE lst.created_at >= _di AND lst.created_at < _df
      AND (_scope IS NULL OR lst.corretor_id = _scope)
  ),
  diffs AS (
    SELECT etapa, EXTRACT(EPOCH FROM (created_at - anterior))/3600.0 AS horas
    FROM t WHERE anterior IS NOT NULL AND etapa IS NOT NULL
  )
  SELECT etapa,
         round(avg(horas)::numeric, 2),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY horas))::numeric, 2),
         count(*)::int
  FROM diffs
  GROUP BY etapa
  ORDER BY 2 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.rel_conversao_por_corretor(_di timestamptz, _df timestamptz)
RETURNS TABLE (corretor_id uuid, nome text, leads integer, fechados integer, conv_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH ll AS (
    SELECT corretor_id AS cid, count(*)::int AS n
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false AND corretor_id IS NOT NULL
      AND created_at >= _di AND created_at < _df
    GROUP BY corretor_id
  ),
  fe AS (
    SELECT corretor_id AS cid, count(*)::int AS n
    FROM public.lead_status_transitions
    WHERE para_status='contrato_fechado' AND created_at >= _di AND created_at < _df
    GROUP BY corretor_id
  )
  SELECT ll.cid, COALESCE(p.nome,'Corretor'), COALESCE(ll.n,0), COALESCE(fe.n,0),
         CASE WHEN ll.n > 0 THEN round((COALESCE(fe.n,0)::numeric / ll.n) * 100, 1) ELSE 0 END
  FROM ll
  LEFT JOIN fe ON fe.cid = ll.cid
  LEFT JOIN public.profiles p ON p.id = ll.cid
  ORDER BY 4 DESC, 3 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.rel_evolucao_vendas(_di timestamptz, _df timestamptz, _corretor uuid DEFAULT NULL)
RETURNS TABLE (mes date, vendas integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  SELECT date_trunc('month', created_at)::date AS mes,
         count(*)::int AS vendas
  FROM public.lead_status_transitions
  WHERE para_status='contrato_fechado'
    AND created_at >= _di AND created_at < _df
    AND (_scope IS NULL OR corretor_id = _scope)
  GROUP BY 1
  ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.rel_origem_efetiva(_di timestamptz, _df timestamptz, _corretor uuid DEFAULT NULL)
RETURNS TABLE (origem text, leads integer, fechados integer, conv_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT id, origem::text AS origem, status
    FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND created_at >= _di AND created_at < _df
      AND (_scope IS NULL OR corretor_id = _scope)
  )
  SELECT COALESCE(origem,'desconhecida') AS origem,
         count(*)::int AS leads,
         count(*) FILTER (WHERE status='contrato_fechado')::int AS fechados,
         CASE WHEN count(*) > 0
              THEN round((count(*) FILTER (WHERE status='contrato_fechado')::numeric / count(*))*100, 1)
              ELSE 0 END AS conv_pct
  FROM base
  GROUP BY 1
  ORDER BY 3 DESC, 2 DESC;
END;
$$;
