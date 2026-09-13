-- ============================================================================
-- Motivos de perda sem retrabalho: uma fonte só
-- ============================================================================
-- Quita a dívida declarada no cabeçalho de 20260914140000 e no §16 de
-- docs/ops/bolsao-oportunidades-fatia4.md.
--
-- A regra "motivos de perda em que não se reaborda o lead" passou a existir em
-- dois lugares: inline em `alimentar_base_sdr_perdidos` (20260904102000) e na
-- função `motivo_perda_sem_retrabalho` (20260914140000), que o Bolsão usa.
--
-- Duas cópias da mesma regra não divergem por descuido — divergem por trabalho
-- normal. Alguém acrescenta um motivo numa delas, a suíte passa, e a partir
-- daí o discador e o SDR trabalham populações diferentes sem que nada acuse.
-- É o tipo de divergência que não dá erro: dá número errado, meses depois.
--
-- Esta migration é REFATORAÇÃO PURA. O corpo abaixo é o corpo vivo da função
-- (`pg_get_functiondef`, não o texto do arquivo — se alguma migration a
-- tivesse redefinido, é a versão viva que importa), com exatamente uma linha
-- trocada:
--
--   antes:  AND COALESCE(l.motivo_perda_categoria, 'outro')
--             NOT IN ('ja_possui_imovel', 'comprou_concorrente', 'sem_perfil')
--   depois: AND NOT public.motivo_perda_sem_retrabalho(l.motivo_perda_categoria)
--
-- A equivalência é exata, inclusive para NULL: a função já faz
-- `COALESCE(_motivo, 'outro')` internamente, então lead sem categoria de perda
-- continua sendo reciclável, como sempre foi. `tests/db/motivo-perda.test.ts`
-- prova isso sobre TODO o domínio da coluna (os 11 valores do CHECK mais NULL),
-- que é a forma honesta de sustentar a palavra "equivalente".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.alimentar_base_sdr_perdidos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _lead record;
  _sdr uuid;
  _qtd int := 0;
  _dias int := public._sdr_setting_int('sdr_perdidos_dias', 30);
BEGIN
  IF NOT public._sdr_ativo() THEN
    RETURN 0;
  END IF;

  FOR _lead IN
    SELECT l.id, l.corretor_id, l.motivo_perda_categoria
    FROM public.leads l
    WHERE l.status = 'perdido'::public.lead_status
      AND l.sdr_id IS NULL
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND COALESCE(l.opt_out, false) = false
      AND COALESCE(l.data_perda, l.updated_at) < now() - make_interval(days => _dias)
      -- A única linha que muda nesta migration. Mesma régua que `bolsao_v1`.
      AND NOT public.motivo_perda_sem_retrabalho(l.motivo_perda_categoria)
    ORDER BY COALESCE(l.data_perda, l.updated_at) ASC
    LIMIT 100
  LOOP
    _sdr := public._proximo_sdr();
    EXIT WHEN _sdr IS NULL;

    PERFORM set_config('app.sdr_motor', 'on', true);
    UPDATE public.leads
       SET sdr_id = _sdr,
           corretor_anterior_id = COALESCE(corretor_id, corretor_anterior_id),
           corretor_id = NULL,
           classe_lead = 'base',
           sdr_interesse_confirmado = false,
           sdr_entregue_em = NULL,
           data_distribuicao = now(),
           timestamp_recebimento = now(),
           tentativas_redistribuicao = 0,
           via_webhook = false,
           corretores_que_tentaram = CASE
             WHEN corretor_id IS NULL THEN corretores_que_tentaram
             WHEN corretor_id = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[])) THEN corretores_que_tentaram
             ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), corretor_id)
           END
     WHERE id = _lead.id AND sdr_id IS NULL AND status = 'perdido'::public.lead_status;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    PERFORM public._sdr_set_status(_lead.id, 'aguardando_atendimento'::public.lead_status,
      'Lead perdido reciclado para a base do SDR (' || _dias || ' dias após a perda)',
      'Reaquecer o cliente', 'sdr_reativacao', true);
    PERFORM public._sdr_log_base(_lead.id, _sdr, 'Perdido reciclado para a base do SDR', 'base_sdr:perdido', 'perdido',
      jsonb_build_object('corretor_anterior', _lead.corretor_id, 'categoria_perda', _lead.motivo_perda_categoria));
    _qtd := _qtd + 1;
  END LOOP;

  RETURN _qtd;
END; $function$;

-- Os grants originais (20260904102000) seguem valendo: CREATE OR REPLACE com
-- a mesma assinatura preserva ACL. Reaplicados aqui porque depender disso em
-- silêncio é como uma função vira pública sem ninguém notar.
REVOKE ALL ON FUNCTION public.alimentar_base_sdr_perdidos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alimentar_base_sdr_perdidos() TO service_role;

-- ---------------------------------------------------------------------------
-- A fonte agora é uma só — e uma guarda para que continue sendo
-- ---------------------------------------------------------------------------
-- Se alguém voltar a escrever a lista inline em qualquer função do schema, o
-- deploy falha aqui em vez de a divergência aparecer num relatório meses
-- depois. `motivo_perda_sem_retrabalho` é a única que pode conter os literais.
DO $guard$
DECLARE
  _duplicatas text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO _duplicatas
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname <> 'motivo_perda_sem_retrabalho'
    AND p.prosrc LIKE '%ja_possui_imovel%'
    AND p.prosrc LIKE '%comprou_concorrente%'
    AND p.prosrc LIKE '%sem_perfil%';

  IF _duplicatas IS NOT NULL THEN
    RAISE EXCEPTION
      'Lista de motivos sem retrabalho duplicada em: %. Use public.motivo_perda_sem_retrabalho().',
      _duplicatas;
  END IF;
END;
$guard$;
