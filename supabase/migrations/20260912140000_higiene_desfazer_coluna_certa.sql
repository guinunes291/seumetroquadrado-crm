-- ===========================================================================
-- higiene_desfazer_lote: a coluna se chama motivo_perdido, nao motivo_perda.
--
-- A funcao fazia `SET motivo_perda = NULL` ao reverter um lead marcado
-- perdido. Essa coluna NAO EXISTE em public.leads (as que existem sao
-- motivo_perdido e motivo_perda_categoria). PL/pgSQL nao valida nome de
-- coluna na criacao, entao a funcao compilou, passou no CI, e so quebraria
-- em execucao:
--
--   ERROR: column "motivo_perda" of relation "leads" does not exist
--   CONTEXT: PL/pgSQL function higiene_desfazer_lote(uuid) line 28
--
-- Gravidade: o desfazer e a rede de seguranca que justifica ligar o motor.
-- Ele funcionava no caminho 'alertar' (DELETE em alertas) e falhava no
-- caminho 'perdido' — exatamente o unico caso em que alguem precisa dele.
-- Marcar 200 leads por engano e nao conseguir reverter era o cenario.
--
-- Por que o CI nao pegou: o unico teste de desfazer exercitava 'alertar'.
-- Esta migration vem com teste do caminho 'perdido' (tests/db/higiene-motor).
--
-- Reproduzido no harness antes do conserto, com o motor em modo 'ativo'.
--
-- ROLLBACK: reaplicar o bloco higiene_desfazer_lote de
--   20260912120000_higiene_motor_correcoes.sql.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.higiene_desfazer_lote(_execucao_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _r record;
  _n integer := 0;
BEGIN
  -- Mesmo afrouxamento aplicado ao higiene_processar na correcao 6, e aqui ele
  -- importa MAIS: o desfazer e o botao de emergencia. Se o motor arquivar 200
  -- leads por engano as 4h, a pessoa abre o SQL console — onde nao ha JWT de
  -- gestao — e precisa que funcione. Sem contexto de request = chamada
  -- server-side; o portao real ali e o GRANT EXECUTE. Com contexto, exige
  -- gestao, porque a funcao tem GRANT para `authenticated`.
  IF NOT (
       (auth.uid() IS NULL AND auth.role() IS NULL)
    OR COALESCE(auth.role() = 'service_role', false)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'sem permissao para desfazer a higiene' USING ERRCODE = '42501';
  END IF;

  FOR _r IN
    SELECT * FROM public.higiene_execucao_log
     WHERE execucao_id = _execucao_id AND aplicado AND desfeito_em IS NULL
     ORDER BY id
  LOOP
    IF _r.acao = 'alertar' THEN
      DELETE FROM public.alertas
       WHERE ref_id = _r.lead_id AND tipo = 'follow_up'::public.alerta_tipo
         AND created_at >= _r.ts - interval '1 minute';
    ELSIF _r.acao = 'devolver_roleta' THEN
      UPDATE public.leads
         SET corretor_id = COALESCE(corretor_id, _r.corretor_id),
             status = _r.status_antes
       WHERE id = _r.lead_id;
    ELSIF _r.acao = 'perdido' THEN
      -- UPDATE direto, e nao transicionar_lead, de proposito: a RPC grava
      -- ultima_interacao = now(), o que corromperia o relogio de higiene do
      -- lead justamente ao desfazer. Desfazer tem que restaurar o estado
      -- anterior, nao criar movimento novo.
      UPDATE public.leads
         SET status = _r.status_antes,
             motivo_perdido = NULL,          -- era motivo_perda (inexistente)
             motivo_perda_categoria = NULL,
             data_perda = NULL
       WHERE id = _r.lead_id;
    END IF;

    UPDATE public.higiene_execucao_log SET desfeito_em = now() WHERE id = _r.id;
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$fn$;

COMMENT ON FUNCTION public.higiene_desfazer_lote(uuid) IS
  'Reverte em bloco o que uma execucao do motor aplicou. Idempotente: linhas ja desfeitas sao ignoradas.';
