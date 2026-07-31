-- =====================================================================
-- Régua de datas (2/4) — VISITA REALIZADA passa a ser validada por
-- agendamento, e conta no dia em que a visita aconteceu.
--
-- Antes: "visita realizada" era a transição de status do lead — uma por
-- lead, na data do clique. Um cliente que remarcou três vezes gerava uma
-- única visita, e a visita de sexta validada na segunda caía na segunda.
--
-- Agora:
--   * cada AGENDAMENTO de visita tem sua própria validação (realizado ou
--     não compareceu) — remarcação vira uma nova validação;
--   * a métrica conta em agendamentos.data_inicio (o dia da visita);
--   * o único fluxo que validava agendamento era o Modo Visita; agora
--     existe RPC pública (validar_visita) para o modal do Kanban também.
--
-- Pontuação diária acompanha: o ponto de visita passa a ser creditado no
-- dia da visita, por agendamento validado, em vez da transição de status.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Marcador de agendamento sintético
--
-- Quando a visita chega sem agendamento (histórico, API, Kanban), criamos o
-- agendamento para a visita ter data própria. Esse registro NÃO é produção
-- de agenda: fica marcado para não inflar "agendamentos criados" nem render
-- ponto de agendamento na pontuação diária.
-- ---------------------------------------------------------------------
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS auto_gerado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agendamentos.auto_gerado IS
  'true = agendamento criado pelo sistema só para datar uma visita registrada sem agenda (histórico/API/Kanban). Conta como VISITA realizada, nunca como agendamento criado.';

-- ---------------------------------------------------------------------
-- 1) RPC de validação (usada pelo modal "Registrar visita")
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_visita(
  _agendamento_id uuid,
  _compareceu boolean DEFAULT true,
  _resultado text DEFAULT NULL,
  _observacoes text DEFAULT NULL,
  _proxima_etapa public.lead_status DEFAULT NULL
)
RETURNS public.agendamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ag public.agendamentos%ROWTYPE;
  _destino public.lead_status;
  _titulo text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _ag FROM public.agendamentos WHERE id = _agendamento_id FOR UPDATE;
  IF NOT FOUND OR _ag.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'agendamento não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF _ag.corretor_id IS DISTINCT FROM _uid
     AND NOT (_ag.lead_id IS NOT NULL AND public.pode_acessar_lead(_uid, _ag.lead_id)) THEN
    RAISE EXCEPTION 'agendamento fora da carteira autorizada' USING ERRCODE = '42501';
  END IF;

  IF _ag.status = 'cancelado'::public.agendamento_status THEN
    RAISE EXCEPTION 'agendamento cancelado não pode ser validado' USING ERRCODE = '22023';
  END IF;

  -- Idempotência: revalidar o mesmo agendamento não duplica visita nem ponto.
  IF (_compareceu AND _ag.status = 'realizado'::public.agendamento_status)
     OR (NOT _compareceu AND _ag.status = 'nao_compareceu'::public.agendamento_status) THEN
    RETURN _ag;
  END IF;

  UPDATE public.agendamentos
     SET status = CASE WHEN _compareceu
                       THEN 'realizado'::public.agendamento_status
                       ELSE 'nao_compareceu'::public.agendamento_status END,
         realizado_em = CASE WHEN _compareceu THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = _agendamento_id
  RETURNING * INTO _ag;

  IF _ag.lead_id IS NOT NULL THEN
    _titulo := CASE WHEN _compareceu THEN 'Visita realizada' ELSE 'Cliente não compareceu' END;
    IF NULLIF(btrim(_resultado), '') IS NOT NULL THEN
      _titulo := _titulo || ' — ' || btrim(_resultado);
    END IF;

    INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
    VALUES (
      _ag.lead_id,
      _uid,
      'visita'::public.interacao_tipo,
      'interna',
      _titulo,
      COALESCE(NULLIF(btrim(_observacoes), ''), '(sem observações)'),
      jsonb_build_object(
        'agendamento_id', _ag.id,
        'compareceu', _compareceu,
        'resultado', NULLIF(btrim(_resultado), ''),
        'data_visita', _ag.data_inicio
      )
    );

    _destino := COALESCE(
      _proxima_etapa,
      CASE WHEN _compareceu THEN 'visita_realizada'::public.lead_status ELSE NULL END
    );

    IF _destino IS NOT NULL THEN
      BEGIN
        -- Próxima ação é obrigatória nessas transições (guard do
        -- transicionar_lead) e é o motor anti-perda do pós-visita.
        PERFORM public.transicionar_lead(
          _ag.lead_id,
          _destino,
          CASE WHEN _compareceu
               THEN 'Visita validada pelo corretor'
               ELSE 'Cliente não compareceu à visita' END,
          CASE WHEN _compareceu
               THEN 'Definir o próximo passo com o cliente após a visita'
               ELSE 'Retomar contato e reagendar a visita' END
        );
      EXCEPTION WHEN OTHERS THEN
        -- A validação da visita é o fato; o status do lead é consequência.
        -- Guard de transição não pode desfazer o registro da visita.
        RAISE WARNING 'validar_visita: transição do lead % falhou (%)', _ag.lead_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN _ag;
END;
$$;

COMMENT ON FUNCTION public.validar_visita(uuid, boolean, text, text, public.lead_status) IS
  'Valida UM agendamento de visita (realizado / não compareceu), registra na timeline do lead e move o status. A métrica de visita conta em agendamentos.data_inicio — o dia em que a visita aconteceu.';

REVOKE ALL ON FUNCTION public.validar_visita(uuid, boolean, text, text, public.lead_status)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_visita(uuid, boolean, text, text, public.lead_status)
  TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Pontuação diária: visita passa a pontuar por agendamento validado,
--    no DIA DA VISITA (data_inicio), e não mais pela transição de status.
-- ---------------------------------------------------------------------
-- Venda já não pontua por transição desde a integridade de aprovação
-- (20260711122000): a única origem de vendas/vgv é a aprovação, no dia da
-- assinatura. Aqui sai também a visita, que passa a pontuar por agendamento
-- validado (trg_pont_visita_validada), no dia em que a visita ocorreu.
CREATE OR REPLACE FUNCTION public.pont_after_transicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _dia date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.corretor_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.para_status = 'analise_credito'::public.lead_status THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _doc => 1);
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.pont_after_transicao() FROM PUBLIC, anon, authenticated;

-- Agendamento sintético não pontua como agendamento criado.
CREATE OR REPLACE FUNCTION public.pont_after_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _dia date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.auto_gerado THEN RETURN NEW; END IF;
  PERFORM public.bump_atividade(NEW.corretor_id, _dia, _ag => 1);
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.pont_after_agendamento() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pont_after_visita_validada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _dia date := (NEW.data_inicio AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.corretor_id IS NULL OR NEW.tipo <> 'visita'::public.agendamento_tipo THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'realizado'::public.agendamento_status
     AND OLD.status IS DISTINCT FROM 'realizado'::public.agendamento_status THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _vis => 1);
  ELSIF OLD.status = 'realizado'::public.agendamento_status
        AND NEW.status IS DISTINCT FROM 'realizado'::public.agendamento_status THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _vis => -1);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pont_visita_validada ON public.agendamentos;
CREATE TRIGGER trg_pont_visita_validada
  AFTER UPDATE OF status ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.pont_after_visita_validada();

-- ---------------------------------------------------------------------
-- 3) Rede de segurança: nenhuma visita some por caminho alternativo
--
-- A métrica passou a sair de `agendamentos`, mas o lead pode chegar em
-- 'visita_realizada' por caminhos que não passam pelo modal: arrastar no
-- Kanban, API pública, MCP, correção da gestão. Se a transição não tem um
-- agendamento validado que a cubra, criamos um com data_inicio no momento
-- da transição — a melhor data disponível naquele caminho. Assim a régua
-- "visita = agendamento validado" vale para o sistema inteiro, e não só
-- para quem usou a tela certa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garantir_agendamento_da_visita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _corretor uuid;
  _nome text;
BEGIN
  IF NEW.para_status <> 'visita_realizada'::public.lead_status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NEW.corretor_id, l.corretor_id), l.nome INTO _corretor, _nome
  FROM public.leads l WHERE l.id = NEW.lead_id;
  IF _corretor IS NULL THEN RETURN NEW; END IF;

  -- Já existe visita validada cobrindo esta transição? Nada a fazer.
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.lead_id = NEW.lead_id
      AND a.deleted_at IS NULL
      AND a.tipo = 'visita'::public.agendamento_tipo
      AND a.status = 'realizado'::public.agendamento_status
      AND a.data_inicio BETWEEN NEW.created_at - interval '30 days'
                            AND NEW.created_at + interval '2 days'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.agendamentos (
    lead_id, corretor_id, titulo, descricao, tipo, status,
    data_inicio, data_fim, realizado_em, created_at, auto_gerado
  ) VALUES (
    NEW.lead_id, _corretor,
    'Visita realizada — ' || COALESCE(_nome, 'lead'),
    'Agendamento criado automaticamente ao mover o lead para Visita realizada sem visita validada.',
    'visita'::public.agendamento_tipo,
    'realizado'::public.agendamento_status,
    NEW.created_at, NEW.created_at + interval '1 hour', NEW.created_at, NEW.created_at,
    true
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.garantir_agendamento_da_visita() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_garantir_agendamento_visita ON public.lead_status_transitions;
CREATE TRIGGER trg_garantir_agendamento_visita
  AFTER INSERT ON public.lead_status_transitions
  FOR EACH ROW EXECUTE FUNCTION public.garantir_agendamento_da_visita();

-- ---------------------------------------------------------------------
-- 4) Backfill do histórico
--
-- Toda transição para 'visita_realizada' já registrada vira um agendamento
-- validado, para que a série histórica não zere com a régua nova:
--   a) se existe agendamento de visita compatível (mesmo lead, até 30 dias
--      antes e 2 dias depois da transição, não cancelado), ele é marcado
--      como realizado, com realizado_em na data da transição;
--   b) se não existe, criamos o agendamento correspondente com data_inicio
--      e created_at na data da transição — nunca "hoje", para não inflar
--      métrica de período nenhum.
--
-- Os triggers de pontuação ficam desligados aqui: os pontos históricos já
-- foram creditados na época pela transição e não devem ser lançados de novo.
-- ---------------------------------------------------------------------
ALTER TABLE public.agendamentos DISABLE TRIGGER trg_pont_agendamento;
ALTER TABLE public.agendamentos DISABLE TRIGGER trg_pont_visita_validada;

DO $backfill$
DECLARE
  r record;
  _match uuid;
BEGIN
  FOR r IN
    SELECT t.id                                       AS transicao_id,
           t.lead_id,
           t.created_at                               AS quando,
           COALESCE(t.corretor_id, l.corretor_id)     AS corretor_id,
           l.nome                                     AS lead_nome
    FROM public.lead_status_transitions t
    JOIN public.leads l ON l.id = t.lead_id
    WHERE t.para_status = 'visita_realizada'
      AND l.deleted_at IS NULL
      AND COALESCE(t.corretor_id, l.corretor_id) IS NOT NULL
    ORDER BY t.created_at
  LOOP
    -- Agendamento já validado que cobre esta transição? Nada a fazer.
    SELECT a.id INTO _match
    FROM public.agendamentos a
    WHERE a.lead_id = r.lead_id
      AND a.deleted_at IS NULL
      AND a.tipo = 'visita'::public.agendamento_tipo
      AND a.status = 'realizado'::public.agendamento_status
      AND a.data_inicio BETWEEN r.quando - interval '30 days' AND r.quando + interval '2 days'
    ORDER BY abs(extract(epoch FROM (a.data_inicio - r.quando)))
    LIMIT 1;
    CONTINUE WHEN _match IS NOT NULL;

    -- Candidato a validar (agendado/confirmado/remarcado/não compareceu).
    SELECT a.id INTO _match
    FROM public.agendamentos a
    WHERE a.lead_id = r.lead_id
      AND a.deleted_at IS NULL
      AND a.tipo = 'visita'::public.agendamento_tipo
      AND a.status <> 'cancelado'::public.agendamento_status
      AND a.data_inicio BETWEEN r.quando - interval '30 days' AND r.quando + interval '2 days'
    ORDER BY abs(extract(epoch FROM (a.data_inicio - r.quando)))
    LIMIT 1;

    IF _match IS NOT NULL THEN
      UPDATE public.agendamentos
         SET status = 'realizado'::public.agendamento_status,
             realizado_em = r.quando,
             updated_at = now()
       WHERE id = _match;
    ELSE
      INSERT INTO public.agendamentos (
        lead_id, corretor_id, titulo, descricao, tipo, status,
        data_inicio, data_fim, realizado_em, created_at, updated_at, auto_gerado
      ) VALUES (
        r.lead_id,
        r.corretor_id,
        'Visita realizada — ' || COALESCE(r.lead_nome, 'lead'),
        'Registro histórico criado na migração da régua de datas (visita sem agendamento vinculado).',
        'visita'::public.agendamento_tipo,
        'realizado'::public.agendamento_status,
        r.quando,
        r.quando + interval '1 hour',
        r.quando,
        r.quando,
        now(),
        true
      );
    END IF;
  END LOOP;
END
$backfill$;

ALTER TABLE public.agendamentos ENABLE TRIGGER trg_pont_agendamento;
ALTER TABLE public.agendamentos ENABLE TRIGGER trg_pont_visita_validada;

CREATE INDEX IF NOT EXISTS idx_agendamentos_visita_realizada
  ON public.agendamentos (data_inicio)
  WHERE deleted_at IS NULL AND tipo = 'visita' AND status = 'realizado';
