-- =============================================================================
-- Sami v8: o CRM inteiro no WhatsApp, com autonomia por risco (parte A, schema).
--
-- O corretor faz pelo WhatsApp tudo o que faz na tela: contato, nota, tarefa,
-- ficha, visita (agendar, confirmar, remarcar, cancelar, resultado), retorno,
-- perda, troca de vaga, documentos (checklist, status, arquivo), crédito,
-- venda, check-in, cadastro e lote. As ações LEVES gravam na hora pelo mesmo
-- núcleo do CONFIRMAR (sessão do corretor, RPCs oficiais) e ficam 24 h
-- desfazíveis; as PESADAS esperam o CONFIRMAR. Esta migration só prepara o
-- banco e é ADITIVA: a v7.1 no ar continua funcionando antes e depois dela.
--
--  1) samiq_propostas: os 25 tipos da v8 e o estado 'executando' (trava).
--  2) samiq_conversas.contexto: memória de trabalho da conversa (clientes
--     citados, numeração do CONFIRMAR 2 / DESFAZER 1, escolha "a 2").
--  3) samiq_anexos: área de espera dos arquivos mandados no WhatsApp.
--  4) samiq_reivindicar_proposta: CONFIRMAR duplo, clique duplo e retentativa
--     do n8n não executam a mesma ação duas vezes.
--  5) samiq_contexto_turno: liga ao turno as ações gravadas na hora e guarda
--     a memória de trabalho.
--  6) samiq_decidir_proposta: aceita sair de 'executando' e só abre o
--     desfazer para o que ele sabe reverter.
--  7) samiq_desfazer_proposta: reverte também tarefa concluída/reagendada/
--     cancelada, visita confirmada/remarcada/cancelada, documento e ficha
--     inteira (whitelist de colunas), além do que a S2 e a 0108 já revertiam,
--     sem atropelar o que o corretor mudou na tela depois da Sami.
--  8) samiq_canal_mensagens: retentativa do n8n não repete ação e as
--     mensagens do mesmo corretor rodam uma de cada vez, em ordem.
--  9) samiq_politica.whatsapp_modo_escrita: chave de emergência que faz tudo
--     voltar a esperar CONFIRMAR, sem deploy.
-- Idempotente: pode rodar duas vezes sem efeito colateral.
-- =============================================================================

SET LOCAL lock_timeout = '10s';

-- 1) Tipos e estados --------------------------------------------------------
ALTER TABLE public.samiq_propostas DROP CONSTRAINT IF EXISTS samiq_propostas_tipo_check;
ALTER TABLE public.samiq_propostas ADD CONSTRAINT samiq_propostas_tipo_check CHECK (tipo IN (
  'registrar_contato', 'anotar', 'criar_tarefa', 'atualizar_qualificacao',
  'agendar_visita', 'mudar_etapa', 'registrar_retorno', 'marcar_perdido',
  'trocar_vaga', 'concluir_tarefa', 'reagendar_tarefa', 'cancelar_tarefa',
  'confirmar_visita', 'remarcar_visita', 'cancelar_visita', 'registrar_visita',
  'documentos_checklist', 'atualizar_documento', 'anexar_documento',
  'enviar_analise_credito', 'registrar_resultado_credito', 'registrar_venda',
  'fazer_checkin', 'criar_lead', 'pedir_lote'
));

ALTER TABLE public.samiq_propostas DROP CONSTRAINT IF EXISTS samiq_propostas_status_check;
ALTER TABLE public.samiq_propostas ADD CONSTRAINT samiq_propostas_status_check CHECK (status IN (
  'pendente', 'executando', 'aceita', 'editada', 'rejeitada', 'desfeita', 'falhou'
));

CREATE INDEX IF NOT EXISTS samiq_propostas_conversa_idx
  ON public.samiq_propostas (conversa_id, criado_em)
  WHERE conversa_id IS NOT NULL;

-- 2) Memória de trabalho da conversa ----------------------------------------
ALTER TABLE public.samiq_conversas
  ADD COLUMN IF NOT EXISTS contexto jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'samiq_conversas_contexto_check'
      AND conrelid = 'public.samiq_conversas'::regclass
  ) THEN
    ALTER TABLE public.samiq_conversas
      ADD CONSTRAINT samiq_conversas_contexto_check
      CHECK (jsonb_typeof(contexto) = 'object' AND octet_length(contexto::text) <= 16384);
  END IF;
END $$;

COMMENT ON COLUMN public.samiq_conversas.contexto IS
  'Sami v8: memória de trabalho da conversa (clientes citados, numeração das listas de CONFIRMAR/DESFAZER, candidatos de homônimo, última localização). Só o servidor grava (samiq_contexto_turno).';

-- 3) Área de espera dos arquivos do WhatsApp --------------------------------
CREATE TABLE IF NOT EXISTS public.samiq_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  tamanho_bytes integer NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 15728640),
  nome_original text CHECK (nome_original IS NULL OR char_length(nome_original) <= 255),
  legenda text CHECK (legenda IS NULL OR char_length(legenda) <= 1000),
  storage_path text NOT NULL UNIQUE CHECK (storage_path LIKE 'samiq-anexos/%'),
  mensagem_id text CHECK (mensagem_id IS NULL OR char_length(mensagem_id) <= 200),
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  documentacao_id uuid REFERENCES public.documentacoes(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS samiq_anexos_mensagem_uidx
  ON public.samiq_anexos (user_id, mensagem_id)
  WHERE mensagem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS samiq_anexos_pendentes_idx
  ON public.samiq_anexos (user_id, criado_em DESC)
  WHERE usado_em IS NULL;

ALTER TABLE public.samiq_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS samiq_anexos_select_proprios ON public.samiq_anexos;
CREATE POLICY samiq_anexos_select_proprios ON public.samiq_anexos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.samiq_anexos FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.samiq_anexos TO authenticated;
GRANT ALL ON TABLE public.samiq_anexos TO service_role;

COMMENT ON TABLE public.samiq_anexos IS
  'Sami v8: arquivos que o corretor mandou no WhatsApp, na área de espera (bucket documentacao, samiq-anexos/<corretor>/). Só vão para a ficha pela ação anexar_documento, com a sessão do corretor. O conteúdo nunca vai ao modelo.';

-- 4) Trava de execução ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.samiq_reivindicar_proposta(
  _user_id uuid,
  _proposta_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _n integer;
  _now timestamptz := clock_timestamp();
BEGIN
  -- Só UMA execução pega a ação. 'executando' parado há mais de 5 minutos
  -- (processo caiu no meio) pode ser pego de novo.
  UPDATE public.samiq_propostas
     SET status = 'executando', decidido_em = _now
   WHERE id = _proposta_id
     AND user_id = _user_id
     AND (
       status IN ('pendente', 'falhou')
       OR (status = 'executando' AND decidido_em < _now - interval '5 minutes')
     );
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_reivindicar_proposta(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_reivindicar_proposta(uuid, uuid) TO service_role;

-- 5) Fechamento do turno ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.samiq_contexto_turno(
  _user_id uuid,
  _conversa_id uuid,
  _execution_id uuid,
  _contexto jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _antigo jsonb;
  _novos jsonb;
  _extras jsonb;
BEGIN
  IF _contexto IS NOT NULL
     AND (jsonb_typeof(_contexto) <> 'object' OR octet_length(_contexto::text) > 16384) THEN
    RAISE EXCEPTION 'contexto invalido' USING ERRCODE = '22023';
  END IF;
  -- Conversa de outro usuário: nada a fazer (nunca grava em cima).
  SELECT c.contexto INTO _antigo
    FROM public.samiq_conversas AS c
   WHERE c.id = _conversa_id AND c.user_id = _user_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF _contexto IS NOT NULL THEN
    -- Dois turnos ao mesmo tempo (mensagens em sequência rápida): o último a
    -- gravar não apaga o que o outro deixou esperando OK. Item que ainda está
    -- 'pendente' e sumiu da lista nova volta no fim dela (a numeração que o
    -- corretor acabou de ver não muda).
    _novos := CASE WHEN jsonb_typeof(_contexto -> 'pendentes') = 'array'
                   THEN _contexto -> 'pendentes' ELSE '[]'::jsonb END;
    SELECT COALESCE(jsonb_agg(to_jsonb(a.id) ORDER BY a.ord), '[]'::jsonb) INTO _extras
      FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(_antigo -> 'pendentes') = 'array'
                  THEN _antigo -> 'pendentes' ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS a(id, ord)
      JOIN public.samiq_propostas AS p
        ON p.id::text = a.id AND p.user_id = _user_id AND p.status = 'pendente'
     WHERE NOT (_novos ? a.id);
    UPDATE public.samiq_conversas
       SET contexto = CASE WHEN jsonb_array_length(_extras) > 0
                           THEN jsonb_set(_contexto, '{pendentes}', _novos || _extras)
                           ELSE _contexto END
     WHERE id = _conversa_id AND user_id = _user_id;
  END IF;

  -- Ações gravadas na hora nascem sem conversa (ela só existe depois da
  -- resposta): o turno as liga aqui.
  IF _execution_id IS NOT NULL THEN
    UPDATE public.samiq_propostas
       SET conversa_id = _conversa_id
     WHERE execution_id = _execution_id
       AND user_id = _user_id
       AND conversa_id IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_contexto_turno(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_contexto_turno(uuid, uuid, uuid, jsonb) TO service_role;

-- 6) Decisão: sai de 'executando'; desfazer só para o que se reverte --------
CREATE OR REPLACE FUNCTION public.samiq_decidir_proposta(
  _user_id uuid,
  _proposta_id uuid,
  _status text,
  _payload_final jsonb DEFAULT NULL,
  _resultado jsonb DEFAULT NULL,
  _erro text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _p public.samiq_propostas%ROWTYPE;
  _now timestamptz := clock_timestamp();
  _pode_desfazer boolean;
BEGIN
  IF _status NOT IN ('aceita', 'editada', 'rejeitada', 'falhou') THEN
    RAISE EXCEPTION 'status invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _p
  FROM public.samiq_propostas AS p
  WHERE p.id = _proposta_id AND p.user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- 'falhou' pode ser tentada de novo; 'executando' é a trava da v8.
  IF _p.status NOT IN ('pendente', 'falhou', 'executando') THEN RETURN false; END IF;
  -- Descartar não atropela uma execução em curso.
  IF _status = 'rejeitada' AND _p.status = 'executando' THEN RETURN false; END IF;

  -- Espelho de SAMIQ_TIPOS_DESFAZIVEIS (src/lib/samiq-propostas.ts).
  _pode_desfazer := _status IN ('aceita', 'editada') AND _p.tipo IN (
    'registrar_contato', 'anotar', 'criar_tarefa', 'atualizar_qualificacao',
    'agendar_visita', 'concluir_tarefa', 'reagendar_tarefa', 'cancelar_tarefa',
    'confirmar_visita', 'remarcar_visita', 'cancelar_visita', 'atualizar_documento',
    'criar_lead'
  );

  UPDATE public.samiq_propostas
     SET status = _status,
         payload_final = CASE WHEN _status IN ('aceita', 'editada')
                              THEN COALESCE(_payload_final, payload) ELSE payload_final END,
         resultado = CASE WHEN _status IN ('aceita', 'editada') THEN _resultado ELSE resultado END,
         erro = CASE WHEN _status = 'falhou' THEN left(COALESCE(_erro, 'falha'), 300) ELSE NULL END,
         decidido_em = _now,
         desfazer_ate = CASE WHEN _pode_desfazer THEN _now + interval '24 hours' ELSE NULL END
   WHERE id = _proposta_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_decidir_proposta(uuid, uuid, text, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_decidir_proposta(uuid, uuid, text, jsonb, jsonb, text)
  TO service_role;

-- 7) Desfazer em 24 h -------------------------------------------------------
-- Reverte pelo `resultado` que o executor guardou. Nunca mexe na etapa do
-- funil (a máquina de estados não anda para trás por aqui) e só restaura o
-- que ainda está do jeito que a Sami deixou.
CREATE OR REPLACE FUNCTION public.samiq_desfazer_proposta(
  _user_id uuid,
  _proposta_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _p public.samiq_propostas%ROWTYPE;
  _r jsonb;
  _snap jsonb;
  _ant jsonb;
  _sets text;
  _now timestamptz := clock_timestamp();
  _feito jsonb := '[]'::jsonb;
  _id uuid;
  _lead uuid;
  _n integer;
  _atual jsonb;
  _depois jsonb;
  _mantidos jsonb := '[]'::jsonb;
  _esperado text;
  -- Colunas da ficha que a Sami pode ter mudado (atualizar_qualificacao,
  -- objeções do contato). Qualquer outra chave do snapshot é ignorada.
  _colunas_lead text[] := ARRAY[
    'renda_informada', 'renda_estimada', 'entrada_disponivel', 'usa_fgts', 'tem_fgts',
    'fgts_valor', 'tipo_renda', 'faixa_mcmv', 'temperatura', 'decisor', 'zona', 'bairro',
    'dorms_desejados', 'precisa_vaga', 'prioridades', 'nota_perfil_cliente', 'projeto_nome',
    'projeto_id', 'construtora', 'resumo_qualificacao', 'objecoes'
  ];
BEGIN
  SELECT * INTO _p
  FROM public.samiq_propostas AS p
  WHERE p.id = _proposta_id AND p.user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposta nao encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF _p.status NOT IN ('aceita', 'editada') THEN
    RAISE EXCEPTION 'proposta nao esta confirmada' USING ERRCODE = '22023';
  END IF;
  IF _p.tipo = 'mudar_etapa' THEN
    RAISE EXCEPTION 'mudanca de etapa nao se desfaz pelo botao' USING ERRCODE = '22023';
  END IF;
  IF _p.tipo NOT IN (
    'registrar_contato', 'anotar', 'criar_tarefa', 'atualizar_qualificacao',
    'agendar_visita', 'concluir_tarefa', 'reagendar_tarefa', 'cancelar_tarefa',
    'confirmar_visita', 'remarcar_visita', 'cancelar_visita', 'atualizar_documento',
    'criar_lead'
  ) THEN
    RAISE EXCEPTION 'esta acao nao se desfaz pelo botao (passa pelo funil)' USING ERRCODE = '22023';
  END IF;
  IF _p.desfazer_ate IS NULL OR _p.desfazer_ate < _now THEN
    RAISE EXCEPTION 'janela de desfazer expirada' USING ERRCODE = '22023';
  END IF;

  _r := COALESCE(_p.resultado, '{}'::jsonb);

  -- Interação criada (contato, nota, nota da análise): some da timeline.
  IF _r ? 'interacao_id' THEN
    _id := (_r ->> 'interacao_id')::uuid;
    UPDATE public.interacoes SET deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"interacao"'::jsonb; END IF;
  END IF;

  -- Tarefa criada: some, se ainda está aberta (feita ou cancelada vira história).
  IF _r ? 'tarefa_id' THEN
    _id := (_r ->> 'tarefa_id')::uuid;
    UPDATE public.tarefas SET deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL AND status IN ('pendente', 'em_andamento');
    IF FOUND THEN
      _feito := _feito || '"tarefa"'::jsonb;
    ELSIF EXISTS (SELECT 1 FROM public.tarefas WHERE id = _id AND deleted_at IS NULL) THEN
      _mantidos := _mantidos || '"tarefa"'::jsonb;
    END IF;
  END IF;

  -- Tarefa que já existia (concluída, reagendada, cancelada ou reaproveitada):
  -- volta ao que era, desde que ninguém tenha mexido nela depois da Sami.
  IF _r ? 'tarefa_atualizada_id' AND jsonb_typeof(_r -> 'tarefa_anterior') = 'object' THEN
    _id := (_r ->> 'tarefa_atualizada_id')::uuid;
    _ant := _r -> 'tarefa_anterior';
    _depois := CASE WHEN jsonb_typeof(_r -> 'tarefa_depois') = 'object' THEN _r -> 'tarefa_depois' END;
    IF _depois IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tarefas AS t
       WHERE t.id = _id AND t.deleted_at IS NULL
         AND t.status::text = (_depois ->> 'status')
         AND t.data_vencimento IS NOT DISTINCT FROM (_depois ->> 'data_vencimento')::timestamptz
    ) THEN
      _mantidos := _mantidos || '"tarefa_restaurada"'::jsonb;
    ELSE
    UPDATE public.tarefas
       SET status = CASE WHEN _ant ? 'status'
             THEN (_ant ->> 'status')::public.tarefa_status ELSE status END,
           data_vencimento = CASE WHEN _ant ? 'data_vencimento'
             THEN (_ant ->> 'data_vencimento')::timestamptz ELSE data_vencimento END,
           data_conclusao = CASE WHEN _ant ? 'data_conclusao'
             THEN (_ant ->> 'data_conclusao')::timestamptz ELSE data_conclusao END,
           resultado = CASE WHEN _ant ? 'resultado' THEN _ant ->> 'resultado' ELSE resultado END,
           titulo = CASE WHEN _ant ? 'titulo' AND COALESCE(_ant ->> 'titulo', '') <> ''
             THEN _ant ->> 'titulo' ELSE titulo END,
           tipo = CASE WHEN _ant ? 'tipo' AND COALESCE(_ant ->> 'tipo', '') <> ''
             THEN (_ant ->> 'tipo')::public.tarefa_tipo ELSE tipo END,
           prioridade = CASE WHEN _ant ? 'prioridade' AND COALESCE(_ant ->> 'prioridade', '') <> ''
             THEN (_ant ->> 'prioridade')::public.tarefa_prioridade ELSE prioridade END
     WHERE id = _id AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"tarefa_restaurada"'::jsonb; END IF;
    END IF;
  END IF;

  -- "Confirmar visita" que a Sami fechou junto com a visita: reabre.
  IF jsonb_typeof(_r -> 'tarefas_reabrir') = 'array' THEN
    UPDATE public.tarefas
       SET status = 'pendente', data_conclusao = NULL, resultado = NULL
     WHERE id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(_r -> 'tarefas_reabrir') AS x)
       AND deleted_at IS NULL
       AND status IN ('concluida', 'cancelada')
       AND resultado IN ('Visita confirmada', 'Visita cancelada');
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n > 0 THEN _feito := _feito || '"tarefas_reabertas"'::jsonb; END IF;
  END IF;

  -- Visita criada (agendar) ou a nova de uma remarcação: cancelada e fora da
  -- agenda, se ainda está em aberto (realizada ou cancelada na tela fica).
  IF _r ? 'agendamento_id' THEN
    _id := (_r ->> 'agendamento_id')::uuid;
    UPDATE public.agendamentos
       SET status = 'cancelado',
           motivo_cancelamento = COALESCE(motivo_cancelamento, 'Desfeito via Sami'),
           deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL AND status IN ('agendado', 'confirmado');
    IF FOUND THEN
      _feito := _feito || '"agendamento"'::jsonb;
    ELSIF EXISTS (SELECT 1 FROM public.agendamentos WHERE id = _id AND deleted_at IS NULL) THEN
      _mantidos := _mantidos || '"agendamento"'::jsonb;
    END IF;
  END IF;
  IF _r ? 'agendamento_novo_id' THEN
    _id := (_r ->> 'agendamento_novo_id')::uuid;
    UPDATE public.agendamentos
       SET status = 'cancelado',
           motivo_cancelamento = COALESCE(motivo_cancelamento, 'Remarcação desfeita via Sami'),
           deleted_at = _now
     WHERE id = _id AND deleted_at IS NULL AND status IN ('agendado', 'confirmado');
    IF FOUND THEN
      _feito := _feito || '"agendamento_novo"'::jsonb;
    ELSIF EXISTS (SELECT 1 FROM public.agendamentos WHERE id = _id AND deleted_at IS NULL) THEN
      _mantidos := _mantidos || '"agendamento_novo"'::jsonb;
    END IF;
  END IF;

  -- Visita que a Sami confirmou, cancelou ou marcou como remarcada: volta,
  -- só se continua do jeito que a Sami deixou (cancelada na tela depois de
  -- confirmada pela Sami fica cancelada, com o motivo de quem cancelou).
  IF jsonb_typeof(_r -> 'agendamento_anterior') = 'object' THEN
    _ant := _r -> 'agendamento_anterior';
    _id := (_ant ->> 'id')::uuid;
    _esperado := CASE _p.tipo
      WHEN 'confirmar_visita' THEN 'confirmado'
      WHEN 'cancelar_visita' THEN 'cancelado'
      WHEN 'remarcar_visita' THEN 'remarcado'
    END;
    UPDATE public.agendamentos
       SET status = (_ant ->> 'status')::public.agendamento_status,
           motivo_cancelamento = CASE WHEN _ant ? 'motivo_cancelamento'
             THEN _ant ->> 'motivo_cancelamento' ELSE motivo_cancelamento END
     WHERE id = _id
       AND deleted_at IS NULL
       AND status::text = _esperado;
    IF FOUND THEN
      _feito := _feito || '"agendamento_restaurado"'::jsonb;
    ELSE
      _mantidos := _mantidos || '"agendamento_restaurado"'::jsonb;
    END IF;
  END IF;

  -- Documento do checklist: volta ao status anterior, se ninguém mudou depois;
  -- item criado volta a pendente, se ainda não tem arquivo.
  IF jsonb_typeof(_r -> 'documento_anterior') = 'object' THEN
    _ant := _r -> 'documento_anterior';
    _id := (_ant ->> 'id')::uuid;
    UPDATE public.documentacoes
       SET status = COALESCE(_ant ->> 'status', status),
           observacoes = CASE WHEN _ant ? 'observacoes' THEN _ant ->> 'observacoes' ELSE observacoes END,
           recebido_em = CASE WHEN _ant ? 'recebido_em'
             THEN (_ant ->> 'recebido_em')::timestamptz ELSE recebido_em END
     WHERE id = _id
       AND (jsonb_typeof(_r -> 'documento_depois') IS DISTINCT FROM 'object'
            OR status = (_r -> 'documento_depois' ->> 'status'));
    IF FOUND THEN
      _feito := _feito || '"documento"'::jsonb;
    ELSE
      _mantidos := _mantidos || '"documento"'::jsonb;
    END IF;
  END IF;
  IF _r ? 'documento_criado_id' THEN
    _id := (_r ->> 'documento_criado_id')::uuid;
    UPDATE public.documentacoes
       SET status = 'pendente', recebido_em = NULL
     WHERE id = _id AND arquivo_path IS NULL AND url IS NULL;
    IF FOUND THEN
      _feito := _feito || '"documento"'::jsonb;
    ELSE
      _mantidos := _mantidos || '"documento"'::jsonb;
    END IF;
  END IF;

  -- Cadastro novo (0108): vai para a lixeira.
  IF _r ? 'lead_criado_id' THEN
    _id := (_r ->> 'lead_criado_id')::uuid;
    UPDATE public.leads SET na_lixeira = true, data_movido_lixeira = _now
     WHERE id = _id AND na_lixeira = false AND deleted_at IS NULL;
    IF FOUND THEN _feito := _feito || '"lead_criado"'::jsonb; END IF;
  END IF;

  -- Ficha: só as colunas da whitelist, com o tipo certo de cada uma, e só as
  -- que continuam com o valor que a Sami gravou (o que o corretor mudou na
  -- tela depois fica como ele deixou).
  IF jsonb_typeof(_r -> 'lead_anterior') = 'object' THEN
    _lead := COALESCE(_p.lead_id, NULLIF(_r ->> 'lead_id', '')::uuid);
    _depois := CASE WHEN jsonb_typeof(_r -> 'lead_depois') = 'object' THEN _r -> 'lead_depois' END;
    SELECT to_jsonb(l.*) INTO _atual FROM public.leads AS l WHERE l.id = _lead;
    SELECT jsonb_object_agg(e.key, e.value) INTO _snap
      FROM jsonb_each(_r -> 'lead_anterior') AS e
     WHERE e.key = ANY (_colunas_lead)
       AND (
         _depois IS NULL
         OR NOT (_depois ? e.key)
         OR (_atual -> e.key) IS NOT DISTINCT FROM (_depois -> e.key)
       );
    SELECT _mantidos || COALESCE(jsonb_agg(to_jsonb('ficha:' || e.key)), '[]'::jsonb) INTO _mantidos
      FROM jsonb_each(_r -> 'lead_anterior') AS e
     WHERE e.key = ANY (_colunas_lead)
       AND _depois IS NOT NULL
       AND _depois ? e.key
       AND (_atual -> e.key) IS DISTINCT FROM (_depois -> e.key);
    IF _lead IS NOT NULL AND _snap IS NOT NULL AND _snap <> '{}'::jsonb THEN
      SELECT string_agg(format('%1$I = snap.%1$I', k), ', ') INTO _sets
        FROM jsonb_object_keys(_snap) AS k;
      EXECUTE format(
        'UPDATE public.leads AS l SET %s FROM jsonb_populate_record(NULL::public.leads, $1) AS snap WHERE l.id = $2',
        _sets
      ) USING _snap, _lead;
      GET DIAGNOSTICS _n = ROW_COUNT;
      IF _n > 0 THEN _feito := _feito || '"lead"'::jsonb; END IF;
    END IF;
  END IF;

  -- Tudo o que a ação mexeu já foi mudado depois por alguém: não há o que
  -- desfazer. Erro (nada muda, a ação continua gravada) em vez de um
  -- "desfeito" que não desfez nada.
  IF jsonb_array_length(_feito) = 0 AND jsonb_array_length(_mantidos) > 0 THEN
    RAISE EXCEPTION 'nada a desfazer: mudou depois da Sami' USING ERRCODE = '22023';
  END IF;

  UPDATE public.samiq_propostas
     SET status = 'desfeita', desfeito_em = _now
   WHERE id = _proposta_id;

  RETURN jsonb_build_object('desfeito', true, 'itens', _feito, 'mantidos', _mantidos);
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_desfazer_proposta(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_desfazer_proposta(uuid, uuid) TO service_role;

-- 8) Fila do canal: retentativa não repete e o corretor é atendido em ordem --
-- Uma linha por mensagem do WhatsApp (o id que a Meta dá). A retentativa do
-- n8n (outra instância, outro minuto) recebe a resposta guardada em vez de
-- gravar de novo; duas mensagens seguidas do mesmo corretor rodam uma de cada
-- vez, na ordem de chegada (a memória da conversa não se atropela).
CREATE TABLE IF NOT EXISTS public.samiq_canal_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mensagem_id text NOT NULL CHECK (char_length(mensagem_id) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'esperando'
    CHECK (status IN ('esperando', 'processando', 'respondida', 'falhou')),
  resposta jsonb CHECK (resposta IS NULL OR octet_length(resposta::text) <= 65536),
  chegou_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  -- Quem está processando agora: só essa tentativa fecha a linha (uma
  -- original lenta que perdeu a vez não marca como respondida a que assumiu).
  tentativa uuid,
  UNIQUE (user_id, mensagem_id)
);

-- Base que rodou uma versão anterior desta migration (só ambientes de teste).
ALTER TABLE public.samiq_canal_mensagens ADD COLUMN IF NOT EXISTS tentativa uuid;

CREATE INDEX IF NOT EXISTS samiq_canal_mensagens_fila_idx
  ON public.samiq_canal_mensagens (user_id, status, chegou_em);

ALTER TABLE public.samiq_canal_mensagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.samiq_canal_mensagens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.samiq_canal_mensagens TO service_role;

COMMENT ON TABLE public.samiq_canal_mensagens IS
  'Sami v8: fila e memória curta das mensagens do WhatsApp (id da Meta). Retentativa recebe a resposta guardada; mensagens do mesmo corretor rodam uma de cada vez, na ordem de chegada. Linhas com mais de 3 dias somem na próxima mensagem do corretor.';

CREATE OR REPLACE FUNCTION public.samiq_canal_iniciar(
  _user_id uuid,
  _mensagem_id text,
  _janela_seg integer DEFAULT 100,
  _forcar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _agora timestamptz := clock_timestamp();
  _janela interval := make_interval(secs => GREATEST(30, LEAST(COALESCE(_janela_seg, 100), 600)));
  _m public.samiq_canal_mensagens%ROWTYPE;
BEGIN
  IF _user_id IS NULL OR _mensagem_id IS NULL
     OR char_length(_mensagem_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'mensagem invalida' USING ERRCODE = '22023';
  END IF;
  -- Uma decisão de fila por corretor de cada vez.
  PERFORM pg_advisory_xact_lock(hashtextextended('samiq_canal:' || _user_id::text, 0));

  DELETE FROM public.samiq_canal_mensagens
   WHERE user_id = _user_id AND chegou_em < _agora - interval '3 days';

  SELECT * INTO _m
    FROM public.samiq_canal_mensagens
   WHERE user_id = _user_id AND mensagem_id = _mensagem_id;

  IF FOUND THEN
    IF _m.status = 'respondida' THEN
      RETURN jsonb_build_object('acao', 'repetida', 'resposta', _m.resposta);
    END IF;
    IF _m.status = 'processando' AND _m.iniciado_em > _agora - _janela THEN
      RETURN jsonb_build_object('acao', 'aguardar', 'motivo', 'mesma_mensagem');
    END IF;
    -- Falhou ou travou no meio: volta para a fila, no lugar em que chegou.
    IF _m.status <> 'esperando' THEN
      UPDATE public.samiq_canal_mensagens
         SET status = 'esperando', iniciado_em = NULL, concluido_em = NULL, resposta = NULL
       WHERE id = _m.id;
    END IF;
  ELSE
    INSERT INTO public.samiq_canal_mensagens (user_id, mensagem_id, status, chegou_em)
    VALUES (_user_id, _mensagem_id, 'esperando', _agora)
    RETURNING * INTO _m;
  END IF;

  -- Fila: espera quem está rodando e quem chegou antes (dentro da janela; o
  -- que passou dela é tratado como abandonado). _forcar pula a fila quando a
  -- espera já gastou o tempo que o n8n dá.
  IF NOT _forcar AND EXISTS (
    SELECT 1 FROM public.samiq_canal_mensagens AS o
     WHERE o.user_id = _user_id
       AND o.id <> _m.id
       AND (
         (o.status = 'processando' AND o.iniciado_em > _agora - _janela)
         OR (o.status = 'esperando' AND o.chegou_em < _m.chegou_em
             AND o.chegou_em > _agora - _janela)
       )
  ) THEN
    RETURN jsonb_build_object('acao', 'aguardar', 'motivo', 'fila');
  END IF;

  UPDATE public.samiq_canal_mensagens
     SET status = 'processando', iniciado_em = _agora, tentativa = gen_random_uuid()
   WHERE id = _m.id
  RETURNING * INTO _m;
  RETURN jsonb_build_object('acao', 'processar', 'id', _m.id, 'tentativa', _m.tentativa);
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_canal_iniciar(uuid, text, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_canal_iniciar(uuid, text, integer, boolean)
  TO service_role;

DROP FUNCTION IF EXISTS public.samiq_canal_concluir(uuid, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.samiq_canal_concluir(
  _user_id uuid,
  _id uuid,
  _tentativa uuid,
  _status text,
  _resposta jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _n integer;
BEGIN
  IF _status NOT IN ('respondida', 'falhou') THEN
    RAISE EXCEPTION 'status invalido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.samiq_canal_mensagens
     SET status = _status,
         resposta = CASE
           WHEN _status = 'respondida' AND _resposta IS NOT NULL
                AND octet_length(_resposta::text) <= 65536 THEN _resposta
           WHEN _status = 'respondida' AND _resposta IS NOT NULL THEN
             jsonb_build_object('ok', true, 'tipo', _resposta -> 'tipo', 'texto', _resposta -> 'texto')
           ELSE NULL
         END,
         concluido_em = clock_timestamp()
   WHERE id = _id
     AND user_id = _user_id
     AND status = 'processando'
     AND tentativa = _tentativa;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.samiq_canal_concluir(uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_canal_concluir(uuid, uuid, uuid, text, jsonb)
  TO service_role;

-- 9) Chave de emergência do WhatsApp --------------------------------------
-- 'por_risco' (padrão): leves gravam na hora, pesadas esperam CONFIRMAR.
-- 'confirmar_tudo': tudo volta a esperar CONFIRMAR, sem deploy (um UPDATE).
ALTER TABLE public.samiq_politica
  ADD COLUMN IF NOT EXISTS whatsapp_modo_escrita text NOT NULL DEFAULT 'por_risco';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'samiq_politica_whatsapp_modo_escrita_check'
      AND conrelid = 'public.samiq_politica'::regclass
  ) THEN
    ALTER TABLE public.samiq_politica
      ADD CONSTRAINT samiq_politica_whatsapp_modo_escrita_check
      CHECK (whatsapp_modo_escrita IN ('por_risco', 'confirmar_tudo'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.samiq_politica.whatsapp_modo_escrita IS
  'Sami v8: por_risco (leves gravam na hora, pesadas esperam CONFIRMAR) ou confirmar_tudo (chave de emergência: tudo espera CONFIRMAR). Muda com um UPDATE, sem deploy.';

CREATE OR REPLACE FUNCTION public.samiq_modo_escrita_whatsapp()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT p.whatsapp_modo_escrita FROM public.samiq_politica AS p WHERE p.id = 1),
    'por_risco'
  );
$$;

REVOKE ALL ON FUNCTION public.samiq_modo_escrita_whatsapp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samiq_modo_escrita_whatsapp() TO service_role;

NOTIFY pgrst, 'reload schema';
