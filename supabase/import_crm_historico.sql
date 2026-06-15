-- =============================================================================
-- IMPORT DO HISTÓRICO DO CRM (leads/agendamentos/visitas/análises) — RODAR MANUAL
-- =============================================================================
-- Converte os CSVs do Manus (ids inteiros) para o schema novo (UUID), via:
--   corretor  -> profiles.legacy_user_id
--   lead      -> leads.legacy_id   (ligado por telefone na etapa 1)
-- Visitas e análises viram lead_status_transitions (alimenta Copa + Dashboard).
--
-- PRÉ-REQUISITO: migration do legacy_id (leads/projetos) aplicada (PR #6).
--
-- PASSO A: crie as tabelas de staging abaixo e IMPORTE cada CSV nelas
--          (Supabase → Table editor → Import CSV, mapeando as colunas).
-- PASSO B: rode o bloco de TRANSFORM.
-- Reexecutável: a etapa 1 só preenche legacy_id faltante; as inserções usam
-- NOT EXISTS para não duplicar.
-- =============================================================================

-- ---------- PASSO A: staging (importe os CSVs aqui) ----------
CREATE TABLE IF NOT EXISTS public.stg_leads (
  legacy_id bigint, telefone text, email text, status text, corretor_legacy bigint, updated_at text
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
  -- 1) Liga leads existentes ao id do Manus por telefone (últimos 11 dígitos)
  UPDATE public.leads l
  SET legacy_id = s.legacy_id
  FROM public.stg_leads s
  WHERE l.legacy_id IS NULL AND s.legacy_id IS NOT NULL
    AND right(regexp_replace(l.telefone,'\D','','g'),11) = right(regexp_replace(s.telefone,'\D','','g'),11)
    AND length(regexp_replace(s.telefone,'\D','','g')) >= 10;

  -- 2) Agendamentos -> agendamentos (lead pode ficar nulo; corretor é obrigatório)
  INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, tipo, status, titulo, data_inicio, data_fim, created_at)
  SELECT l.id, pr.id, pr.id, 'visita',
         (CASE s.status WHEN 'realizado' THEN 'realizado'
                        WHEN 'cancelado' THEN 'cancelado'
                        WHEN 'nao_compareceu' THEN 'nao_compareceu'
                        ELSE 'agendado' END)::public.agendamento_status,
         COALESCE(NULLIF(s.construtora,''),'Agendamento (histórico)'),
         s.data_agendamento::timestamptz,
         s.data_agendamento::timestamptz + interval '1 hour',
         COALESCE(s.created_at::timestamptz, s.data_agendamento::timestamptz)
  FROM public.stg_agendamentos s
  JOIN public.profiles pr ON pr.legacy_user_id = s.corretor_legacy
  LEFT JOIN public.leads l ON l.legacy_id = s.lead_legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.corretor_id = pr.id AND a.data_inicio = s.data_agendamento::timestamptz
      AND a.titulo = COALESCE(NULLIF(s.construtora,''),'Agendamento (histórico)')
  );

  -- 3) Visitas -> lead_status_transitions (visita_realizada). Exige lead resolvido.
  INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
  SELECT l.id, pr.id, NULL, 'visita_realizada'::public.lead_status,
         COALESCE(s.data_visita::timestamptz, s.created_at::timestamptz)
  FROM public.stg_visitas s
  JOIN public.leads l ON l.legacy_id = s.lead_legacy
  JOIN public.profiles pr ON pr.legacy_user_id = s.corretor_legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lead_status_transitions t
    WHERE t.lead_id = l.id AND t.para_status = 'visita_realizada'
      AND t.created_at = COALESCE(s.data_visita::timestamptz, s.created_at::timestamptz)
  );

  -- 4) Análises de crédito -> lead_status_transitions (analise_credito)
  INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
  SELECT l.id, pr.id, NULL, 'analise_credito'::public.lead_status, s.created_at::timestamptz
  FROM public.stg_analises s
  JOIN public.leads l ON l.legacy_id = s.lead_legacy
  JOIN public.profiles pr ON pr.legacy_user_id = s.corretor_legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lead_status_transitions t
    WHERE t.lead_id = l.id AND t.para_status = 'analise_credito' AND t.created_at = s.created_at::timestamptz
  );

  -- 5) Vendas (leads com status contrato_fechado) -> lead_status_transitions
  INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
  SELECT l.id, pr.id, NULL, 'contrato_fechado'::public.lead_status, COALESCE(s.updated_at::timestamptz, now())
  FROM public.stg_leads s
  JOIN public.leads l ON l.legacy_id = s.legacy_id
  JOIN public.profiles pr ON pr.legacy_user_id = s.corretor_legacy
  WHERE s.status = 'contrato_fechado'
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_status_transitions t
      WHERE t.lead_id = l.id AND t.para_status = 'contrato_fechado'
    );

  RAISE NOTICE 'OK. leads c/ legacy_id: %, agendamentos: %, transições visita: %, análise: %, venda: %',
    (SELECT count(*) FROM public.leads WHERE legacy_id IS NOT NULL),
    (SELECT count(*) FROM public.agendamentos),
    (SELECT count(*) FROM public.lead_status_transitions WHERE para_status='visita_realizada'),
    (SELECT count(*) FROM public.lead_status_transitions WHERE para_status='analise_credito'),
    (SELECT count(*) FROM public.lead_status_transitions WHERE para_status='contrato_fechado');
END $$;

-- Diagnóstico: linhas de staging que NÃO resolveram (corretor/lead sem match)
-- SELECT * FROM stg_agendamentos s WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.legacy_user_id=s.corretor_legacy);
-- SELECT * FROM stg_visitas s WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.legacy_id=s.lead_legacy);
