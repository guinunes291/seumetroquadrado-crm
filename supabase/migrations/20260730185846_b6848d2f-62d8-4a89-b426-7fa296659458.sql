-- 1) Trigger de aprovação: crédito de métricas no dia da assinatura
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.aplicar_efeitos_status_venda()'::regprocedure);
  d := replace(
    d,
    '_dia := (NEW.aprovado_em AT TIME ZONE ''America/Sao_Paulo'')::date;',
    '_dia := COALESCE(NEW.data_assinatura, (COALESCE(NEW.aprovado_em, now()) AT TIME ZONE ''America/Sao_Paulo'')::date);'
  );
  IF d NOT LIKE '%NEW.data_assinatura%' THEN
    RAISE EXCEPTION 'patch aplicar_efeitos_status_venda falhou';
  END IF;
  EXECUTE d;
END
$mig$;

-- 2) Série diária: vendas sempre pela data de assinatura
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.dashboard_serie_diaria(timestamptz, timestamptz, uuid, text)'::regprocedure);
  d := regexp_replace(
    d,
    'CASE WHEN _use_evento THEN data_assinatura\s+ELSE \(created_at AT TIME ZONE ''America/Sao_Paulo''\)::date END',
    'COALESCE(data_assinatura, (created_at AT TIME ZONE ''America/Sao_Paulo'')::date)',
    'g'
  );
  IF d LIKE '%_use_evento THEN data_assinatura%' THEN
    RAISE EXCEPTION 'patch dashboard_serie_diaria falhou';
  END IF;
  EXECUTE d;
END
$mig$;

-- 3) Resumo semanal da gestão
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.gestao_resumo_semanal()'::regprocedure);
  d := replace(
    d,
    'COALESCE(v.aprovado_em, v.created_at)',
    'COALESCE((v.data_assinatura)::timestamptz, v.aprovado_em, v.created_at)'
  );
  IF d NOT LIKE '%v.data_assinatura)::timestamptz%' THEN
    RAISE EXCEPTION 'patch gestao_resumo_semanal falhou';
  END IF;
  EXECUTE d;
END
$mig$;

-- 4) Realizado mensal: prioriza a data de assinatura
DO $mig$
DECLARE d text;
BEGIN
  SELECT definition INTO d FROM pg_views
   WHERE schemaname = 'metrics' AND viewname = 'realizado_mensal';
  d := regexp_replace(
    d,
    'COALESCE\(v_1\.aprovado_em, \(v_1\.data_assinatura\)::timestamp with time zone, v_1\.created_at\)',
    'COALESCE((v_1.data_assinatura)::timestamp with time zone, v_1.aprovado_em, v_1.created_at)',
    'g'
  );
  IF d IS NULL OR d LIKE '%COALESCE(v_1.aprovado_em,%' THEN
    RAISE EXCEPTION 'patch metrics.realizado_mensal falhou';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW metrics.realizado_mensal AS ' || d;
END
$mig$;

-- 5) Backfill: move pontuação/VGV já lançados para o dia da assinatura
ALTER TABLE public.venda_metricas_ledger DISABLE TRIGGER trg_venda_metricas_ledger_imutavel;

DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT l.id, l.corretor_id, l.dia AS dia_antigo, v.data_assinatura AS dia_novo,
           l.vendas_delta, l.vgv_delta
    FROM public.venda_metricas_ledger l
    JOIN public.vendas v ON v.id = l.venda_id
    WHERE v.data_assinatura IS NOT NULL
      AND l.dia IS DISTINCT FROM v.data_assinatura
  LOOP
    PERFORM public.bump_atividade(r.corretor_id, r.dia_antigo,
      _ven => (-r.vendas_delta)::int, _vgv => (-r.vgv_delta));
    PERFORM public.bump_atividade(r.corretor_id, r.dia_novo,
      _ven => r.vendas_delta::int, _vgv => r.vgv_delta);
    UPDATE public.venda_metricas_ledger SET dia = r.dia_novo WHERE id = r.id;
  END LOOP;
END
$backfill$;

ALTER TABLE public.venda_metricas_ledger ENABLE TRIGGER trg_venda_metricas_ledger_imutavel;
