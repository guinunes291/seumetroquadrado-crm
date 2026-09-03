-- lovable-cron-fallback-reviewed: 144 runs/day; a aptidão do corretor (presença, % trabalhado, participação) muda com o tempo e não em mudança de linha, então não há evento para disparar a entrega do estoque; 10 min é o atraso máximo aceito pela operação.
CREATE OR REPLACE FUNCTION public.distribuir_estoque_roleta(
  _roleta text DEFAULT 'plantao',
  _limite int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _lead record;
  _res jsonb;
  _ok int := 0;
  _corretores int := 0;
  _uid uuid := auth.uid();
  _por_corretor int;
  _entregues int;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  _por_corretor := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);

  FOR _c IN
    SELECT e.corretor_id
      FROM public._elegibilidade_roleta(_roleta) e
     WHERE e.apto
     ORDER BY e.ultimo_lead_em ASC NULLS FIRST, e.incluido_em ASC
  LOOP
    _corretores := _corretores + 1;
    _entregues := 0;

    FOR _lead IN
      SELECT l.id
        FROM public.leads l
       WHERE l.deleted_at IS NULL
         AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL
         AND l.status = 'aguardando_corretor'
       ORDER BY l.created_at ASC
       LIMIT _por_corretor
    LOOP
      _res := public._distribuir_lead_v3(
        _lead.id, 'automatica'::distribuicao_tipo, _roleta, _c.corretor_id, _uid,
        'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_roleta',
                                      'lote_por_corretor', _por_corretor), false);

      IF COALESCE((_res->>'ok')::boolean, false) THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento'
         WHERE id = _lead.id AND status = 'aguardando_corretor';
        _ok := _ok + 1;
        _entregues := _entregues + 1;
      END IF;
    END LOOP;

    EXIT WHEN _entregues = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', _roleta,
    'distribuidos', _ok,
    'corretores_aptos', _corretores,
    'lote_por_corretor', _por_corretor,
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
  $$SELECT public.distribuir_estoque_roleta('plantao', 30);$$
);