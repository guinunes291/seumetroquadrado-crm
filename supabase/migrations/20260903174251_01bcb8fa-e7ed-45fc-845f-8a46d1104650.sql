-- lovable-cron-fallback-reviewed: 144 runs/day; aptidão do corretor (presença, cota diária, % trabalhado) muda com o tempo, não em mudança de linha — não há evento para disparar entrega do estoque; 10 min é o atraso máximo aceito pela operação.
CREATE OR REPLACE FUNCTION public.distribuir_estoque_roleta(
  _roleta text DEFAULT 'plantao',
  _limite int DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _lead record;
  _res jsonb;
  _ok int := 0;
  _falhas int := 0;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  _limite := LEAST(GREATEST(COALESCE(_limite, 200), 1), 1000);

  FOR _lead IN
    SELECT l.id
      FROM public.leads l
     WHERE l.deleted_at IS NULL
       AND COALESCE(l.na_lixeira, false) = false
       AND l.corretor_id IS NULL
       AND l.status = 'aguardando_corretor'
     ORDER BY l.created_at ASC
     LIMIT _limite
  LOOP
    _res := public._distribuir_lead_v3(
      _lead.id, 'automatica'::distribuicao_tipo, _roleta, NULL, _uid,
      'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_roleta'), false);

    IF COALESCE((_res->>'ok')::boolean, false) THEN
      UPDATE public.leads
         SET status = 'aguardando_atendimento'
       WHERE id = _lead.id AND status = 'aguardando_corretor';
      _ok := _ok + 1;
    ELSE
      _falhas := _falhas + 1;
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', _roleta,
    'distribuidos', _ok, 'parou_sem_apto', _falhas > 0,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.status = 'aguardando_corretor')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.distribuir_estoque_roleta(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_estoque_roleta(text, int) TO authenticated, service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'distribuir-estoque-plantao';

SELECT cron.schedule(
  'distribuir-estoque-plantao',
  '*/10 * * * *',
  $$SELECT public.distribuir_estoque_roleta('plantao', 200);$$
);