-- =============================================================================
-- IMPORT DO HISTÓRICO DO CRM (leads + agendamentos + visitas + análises) — MANUAL
-- =============================================================================
-- Converte os CSVs do Manus (ids inteiros) para o schema novo (UUID):
--   corretor -> profiles.legacy_user_id ; lead -> leads.legacy_id
-- Como os leads ainda NÃO existem no banco novo, este script TAMBÉM os insere.
-- Visitas/análises/vendas viram lead_status_transitions (alimenta Copa + Dashboard).
--
-- PRÉ-REQUISITO: migration legacy_id aplicada (PR #6).
-- PASSO A: rode os CREATE TABLE de staging e IMPORTE os CSVs neles (mapeando colunas).
-- PASSO B: rode o bloco DO. Idempotente (NOT EXISTS / ON CONFLICT).
-- =============================================================================

-- ---------- PASSO A: staging (importe os CSVs aqui) ----------
CREATE TABLE IF NOT EXISTS public.stg_leads (
  legacy_id bigint, nome text, email text, telefone text, cpf text, origem text,
  projeto_custom text, corretor_legacy bigint, corretor_anterior_legacy bigint,
  status text, temperatura text, observacoes text, motivo_perdido text, campanha text,
  renda_informada text, usa_fgts text, entrada_disponivel text, na_lixeira text,
  data_distribuicao text, timestamp_recebimento text, proximo_followup text,
  ultimo_contato text, ultima_interacao text, data_movido_lixeira text,
  utm_source text, utm_medium text, utm_content text, utm_campaign text,
  created_at text, updated_at text
);
CREATE TABLE IF NOT EXISTS public.stg_agendamentos (
  legacy_id bigint, lead_legacy bigint, corretor_legacy bigint, status text,
  data_agendamento text, construtora text, observacoes text, created_at text
);
CREATE TABLE IF NOT EXISTS public.stg_visitas (
  lead_legacy bigint, corretor_legacy bigint, data_visita text, created_at text
);
CREATE TABLE IF NOT EXISTS public.stg_analises (
  lead_legacy bigint, corretor_legacy bigint, status text, created_at text
);

-- ---------- PASSO B: transform ----------
DO $$
BEGIN
  -- evita centenas de alertas "lead_novo" durante o import em massa
  ALTER TABLE public.leads DISABLE TRIGGER trg_alerta_lead_distribuido;

  -- 0) Insere os leads do Manus (com legacy_id). Pula os que já existem
  --    (por legacy_id ou por telefone).
  INSERT INTO public.leads (
    legacy_id, nome, email, telefone, cpf, origem, projeto_nome, corretor_id, corretor_anterior_id,
    status, temperatura, observacoes, motivo_perdido, campanha, renda_informada, usa_fgts,
    entrada_disponivel, na_lixeira, data_distribuicao, timestamp_recebimento, proximo_followup,
    ultimo_contato, ultima_interacao, data_movido_lixeira, utm_source, utm_medium, utm_content,
    utm_campaign, created_at, updated_at
  )
  SELECT s.legacy_id, COALESCE(NULLIF(s.nome,''),'(sem nome)'), NULLIF(s.email,''),
    COALESCE(NULLIF(s.telefone,''),'-'), NULLIF(s.cpf,''),
    (CASE WHEN s.origem IN ('facebook','google_sheets','site','indicacao','captacao_corretor','whatsapp','telefone','plantao','agendamento_self_service','chatbot','outro') THEN s.origem ELSE 'outro' END)::public.lead_origem,
    NULLIF(s.projeto_custom,''), pr.id, pra.id,
    (CASE WHEN s.status IN ('novo','aguardando_atendimento','em_atendimento','qualificado','agendado','visita_realizada','proposta_enviada','analise_credito','contrato_fechado','pos_venda','perdido') THEN s.status ELSE 'novo' END)::public.lead_status,
    (CASE WHEN s.temperatura IN ('quente','morno','frio') THEN s.temperatura END)::public.lead_temperatura,
    NULLIF(s.observacoes,''), NULLIF(s.motivo_perdido,''), NULLIF(s.campanha,''),
    NULLIF(s.renda_informada,''), (s.usa_fgts = '1'), NULLIF(s.entrada_disponivel,''),
    (s.na_lixeira = '1'),
    NULLIF(s.data_distribuicao,'')::timestamptz, NULLIF(s.timestamp_recebimento,'')::timestamptz,
    NULLIF(s.proximo_followup,'')::timestamptz, NULLIF(s.ultimo_contato,'')::timestamptz,
    NULLIF(s.ultima_interacao,'')::timestamptz, NULLIF(s.data_movido_lixeira,'')::timestamptz,
    NULLIF(s.utm_source,''), NULLIF(s.utm_medium,''), NULLIF(s.utm_content,''), NULLIF(s.utm_campaign,''),
    COALESCE(NULLIF(s.created_at,'')::timestamptz, now()), COALESCE(NULLIF(s.updated_at,'')::timestamptz, now())
  FROM public.stg_leads s
  LEFT JOIN public.profiles pr  ON pr.legacy_user_id  = s.corretor_legacy
  LEFT JOIN public.profiles pra ON pra.legacy_user_id = s.corretor_anterior_legacy
  WHERE s.legacy_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.legacy_id = s.legacy_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.leads l
      WHERE right(regexp_replace(l.telefone,'\D','','g'),11) = right(regexp_replace(s.telefone,'\D','','g'),11)
        AND length(regexp_replace(s.telefone,'\D','','g')) >= 10
    );

  -- 1) (caso já existissem leads sem legacy_id) liga por telefone
  UPDATE public.leads l SET legacy_id = s.legacy_id
  FROM public.stg_leads s
  WHERE l.legacy_id IS NULL AND s.legacy_id IS NOT NULL
    AND right(regexp_replace(l.telefone,'\D','','g'),11) = right(regexp_replace(s.telefone,'\D','','g'),11)
    AND length(regexp_replace(s.telefone,'\D','','g')) >= 10;

  ALTER TABLE public.leads ENABLE TRIGGER trg_alerta_lead_distribuido;

  -- 2) Agendamentos -> agendamentos
  INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, tipo, status, titulo, data_inicio, data_fim, created_at)
  SELECT l.id, pr.id, pr.id, 'visita',
         (CASE s.status WHEN 'realizado' THEN 'realizado' WHEN 'cancelado' THEN 'cancelado'
                        WHEN 'nao_compareceu' THEN 'nao_compareceu' ELSE 'agendado' END)::public.agendamento_status,
         COALESCE(NULLIF(s.construtora,''),'Agendamento (histórico)'),
         s.data_agendamento::timestamptz, s.data_agendamento::timestamptz + interval '1 hour',
         COALESCE(NULLIF(s.created_at,'')::timestamptz, s.data_agendamento::timestamptz)
  FROM public.stg_agendamentos s
  JOIN public.profiles pr ON pr.legacy_user_id = s.corretor_legacy
  LEFT JOIN public.leads l ON l.legacy_id = s.lead_legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.corretor_id = pr.id AND a.data_inicio = s.data_agendamento::timestamptz
      AND a.titulo = COALESCE(NULLIF(s.construtora,''),'Agendamento (histórico)'));

  -- 3) Visitas -> lead_status_transitions (visita_realizada)
  INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
  SELECT l.id, pr.id, NULL, 'visita_realizada'::public.lead_status,
         COALESCE(NULLIF(s.data_visita,'')::timestamptz, s.created_at::timestamptz)
  FROM public.stg_visitas s
  JOIN public.leads l ON l.legacy_id = s.lead_legacy
  JOIN public.profiles pr ON pr.legacy_user_id = s.corretor_legacy
  WHERE NOT EXISTS (SELECT 1 FROM public.lead_status_transitions t
    WHERE t.lead_id=l.id AND t.para_status='visita_realizada'
      AND t.created_at = COALESCE(NULLIF(s.data_visita,'')::timestamptz, s.created_at::timestamptz));

  -- 4) Análises -> lead_status_transitions (analise_credito)
  INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
  SELECT l.id, pr.id, NULL, 'analise_credito'::public.lead_status, s.created_at::timestamptz
  FROM public.stg_analises s
  JOIN public.leads l ON l.legacy_id = s.lead_legacy
  JOIN public.profiles pr ON pr.legacy_user_id = s.corretor_legacy
  WHERE NOT EXISTS (SELECT 1 FROM public.lead_status_transitions t
    WHERE t.lead_id=l.id AND t.para_status='analise_credito' AND t.created_at = s.created_at::timestamptz);

  -- 5) Vendas (leads contrato_fechado) -> lead_status_transitions
  INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
  SELECT l.id, pr.id, NULL, 'contrato_fechado'::public.lead_status, COALESCE(NULLIF(s.updated_at,'')::timestamptz, now())
  FROM public.stg_leads s
  JOIN public.leads l ON l.legacy_id = s.legacy_id
  JOIN public.profiles pr ON pr.legacy_user_id = s.corretor_legacy
  WHERE s.status='contrato_fechado'
    AND NOT EXISTS (SELECT 1 FROM public.lead_status_transitions t WHERE t.lead_id=l.id AND t.para_status='contrato_fechado');

  RAISE NOTICE 'leads c/ legacy_id: % | agendamentos: % | visitas: % | analises: % | vendas: %',
    (SELECT count(*) FROM public.leads WHERE legacy_id IS NOT NULL),
    (SELECT count(*) FROM public.agendamentos),
    (SELECT count(*) FROM public.lead_status_transitions WHERE para_status='visita_realizada'),
    (SELECT count(*) FROM public.lead_status_transitions WHERE para_status='analise_credito'),
    (SELECT count(*) FROM public.lead_status_transitions WHERE para_status='contrato_fechado');
END $$;

-- Corretores do staging sem profile (esses leads ficam sem corretor):
-- SELECT DISTINCT corretor_legacy FROM stg_leads s WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.legacy_user_id=s.corretor_legacy);
