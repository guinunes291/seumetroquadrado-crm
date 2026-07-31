-- =====================================================================
-- Modo Visita — resultado estruturado e reagendamento no no-show
--
--  1) O QUE ACONTECEU NA VISITA ERA TEXTO SOLTO. A nota é ótima para o
--     corretor lembrar, e inútil para a operação responder "por que as
--     visitas deste mês não viraram venda?". Passam a existir dois campos
--     fechados: INTERESSE e OBJEÇÃO PRINCIPAL.
--
--     As chaves de objeção reaproveitam, onde significam a mesma coisa, as
--     categorias de motivo_perda (preco_parcela, credito_renda, timing_adiou,
--     estourou_teto). Assim dá para cruzar "objeção que apareceu na visita" com
--     "motivo pelo qual o lead foi perdido depois" sem tradução manual.
--
--  2) NO-SHOW MORRIA NA FILA. Registrar que o cliente não veio devolvia o
--     lead para aguardando retorno, mas o novo horário tinha que ser criado
--     em outra tela — e, na prática, não era. Agora a mesma chamada que
--     registra o não comparecimento pode já criar o próximo agendamento.
-- =====================================================================

ALTER TABLE public.visita_execucoes
  ADD COLUMN IF NOT EXISTS interesse text,
  ADD COLUMN IF NOT EXISTS objecao_principal text;

COMMENT ON COLUMN public.visita_execucoes.interesse IS
  'Leitura do corretor ao fim da visita: alto | medio | baixo | sem_interesse.';
COMMENT ON COLUMN public.visita_execucoes.objecao_principal IS
  'O que trava a decisão. Compartilha chaves com motivo_perda_categoria onde o significado é o mesmo, para cruzar objeção da visita × motivo da perda.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visita_execucoes_interesse_ck'
  ) THEN
    ALTER TABLE public.visita_execucoes
      ADD CONSTRAINT visita_execucoes_interesse_ck
      CHECK (interesse IS NULL OR interesse IN ('alto', 'medio', 'baixo', 'sem_interesse'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visita_execucoes_objecao_ck'
  ) THEN
    ALTER TABLE public.visita_execucoes
      ADD CONSTRAINT visita_execucoes_objecao_ck
      CHECK (objecao_principal IS NULL OR objecao_principal IN (
        'sem_objecao',
        'preco_parcela',      -- compartilhada com motivo_perda
        'entrada_alta',
        'credito_renda',      -- compartilhada com motivo_perda
        'estourou_teto',      -- compartilhada com motivo_perda
        'metragem',
        'localizacao',
        'prazo_entrega',
        'condominio',
        'decisor_ausente',
        'quer_comparar',
        'timing_adiou',       -- compartilhada com motivo_perda
        'outro'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_visita_execucoes_objecao
  ON public.visita_execucoes (objecao_principal)
  WHERE objecao_principal IS NOT NULL;

-- ---------------------------------------------------------------------
-- salvar_modo_visita: + resultado estruturado, + reagendamento
--
-- Aridade nova → a versão de 9 argumentos precisa cair antes, senão vira
-- sobrecarga e a chamada por nome fica ambígua.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz, boolean
);

CREATE OR REPLACE FUNCTION public.salvar_modo_visita(
  p_agendamento_id uuid,
  p_checklist jsonb DEFAULT '{}'::jsonb,
  p_nota_transcrita text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_concluir boolean DEFAULT false,
  p_proxima_etapa public.lead_status DEFAULT NULL,
  p_proxima_acao text DEFAULT NULL,
  p_proximo_followup timestamptz DEFAULT NULL,
  p_compareceu boolean DEFAULT true,
  p_interesse text DEFAULT NULL,
  p_objecao_principal text DEFAULT NULL,
  p_reagendar_para timestamptz DEFAULT NULL
)
RETURNS public.visita_execucoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _agenda public.agendamentos%ROWTYPE;
  _lead public.leads%ROWTYPE;
  _resultado public.visita_execucoes%ROWTYPE;
  _checklist jsonb := COALESCE(p_checklist, '{}'::jsonb);
  _ja_concluida boolean := false;
  _compareceu boolean := COALESCE(p_compareceu, true);
  _interesse text := NULLIF(btrim(p_interesse), '');
  _objecao text := NULLIF(btrim(p_objecao_principal), '');
BEGIN
  IF NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'conta inativa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _agenda
  FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND deleted_at IS NULL
    AND tipo = 'visita'::public.agendamento_tipo
  FOR UPDATE;

  IF NOT FOUND OR _agenda.lead_id IS NULL THEN
    RAISE EXCEPTION 'visita vinculada a lead não encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  -- lead_id é a fonte de autorização. O corretor_id da agenda/execução é
  -- histórico denormalizado e não pode manter acesso depois de transferência.
  IF NOT public.pode_acessar_lead(_uid, _agenda.lead_id) THEN
    RAISE EXCEPTION 'visita fora da carteira autorizada'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(_checklist) <> 'object'
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(_checklist) AS item(chave, valor)
       WHERE item.chave NOT IN (
         'horario_confirmado',
         'documentos_separados',
         'simulacao_revisada',
         'projeto_apresentado',
         'objecoes_registradas'
       )
       OR jsonb_typeof(item.valor) <> 'boolean'
     ) THEN
    RAISE EXCEPTION 'checklist inválido' USING ERRCODE = '22023';
  END IF;

  IF char_length(COALESCE(p_nota_transcrita, '')) > 5000
     OR char_length(COALESCE(p_observacoes, '')) > 5000
     OR char_length(COALESCE(p_proxima_acao, '')) > 500 THEN
    RAISE EXCEPTION 'conteúdo da visita excede o limite'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _lead
  FROM public.leads
  WHERE id = _agenda.lead_id
  FOR UPDATE;

  SELECT * INTO _resultado
  FROM public.visita_execucoes
  WHERE agendamento_id = _agenda.id
  FOR UPDATE;
  _ja_concluida := FOUND AND _resultado.status = 'concluida';

  -- Repetir a confirmação (duplo toque/retry de rede) é idempotente: nunca
  -- tenta mover o lead, reagendar ou registrar a visita uma segunda vez.
  IF _ja_concluida THEN
    RETURN _resultado;
  END IF;

  IF _agenda.status NOT IN (
    'agendado'::public.agendamento_status,
    'confirmado'::public.agendamento_status
  ) THEN
    RAISE EXCEPTION 'somente visita agendada ou confirmada pode ser executada'
      USING ERRCODE = '22023';
  END IF;

  IF p_concluir AND p_proxima_etapa IS NULL THEN
    RAISE EXCEPTION 'próxima etapa é obrigatória ao concluir'
      USING ERRCODE = '22023';
  END IF;

  -- Sem comparecimento não existe visita realizada: o lead volta para a fila
  -- de retorno, e o follow-up futuro deixa de ser opcional — cliente que não
  -- apareceu sem próximo contato marcado é lead perdido em câmera lenta.
  IF p_concluir AND NOT _compareceu
     AND p_proxima_etapa = 'visita_realizada'::public.lead_status THEN
    RAISE EXCEPTION 'visita sem comparecimento não pode virar visita realizada'
      USING ERRCODE = '22023';
  END IF;

  IF p_concluir
     AND (p_proxima_etapa = 'aguardando_retorno'::public.lead_status OR NOT _compareceu)
     AND (p_proximo_followup IS NULL OR p_proximo_followup <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro'
      USING ERRCODE = '22023';
  END IF;

  -- Interesse só faz sentido em visita que aconteceu: ninguém lê a intenção
  -- de quem não apareceu.
  IF p_concluir AND NOT _compareceu AND _interesse IS NOT NULL THEN
    RAISE EXCEPTION 'sem comparecimento não há leitura de interesse'
      USING ERRCODE = '22023';
  END IF;

  IF p_reagendar_para IS NOT NULL AND p_reagendar_para <= now() THEN
    RAISE EXCEPTION 'reagendamento precisa ser no futuro' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visita_execucoes AS execucao (
    agendamento_id,
    lead_id,
    corretor_id,
    checklist,
    nota_transcrita,
    observacoes,
    status,
    proxima_etapa,
    proxima_acao,
    proximo_followup,
    concluida_em,
    interesse,
    objecao_principal,
    criada_por,
    atualizada_por
  ) VALUES (
    _agenda.id,
    _agenda.lead_id,
    _agenda.corretor_id,
    _checklist,
    NULLIF(btrim(p_nota_transcrita), ''),
    NULLIF(btrim(p_observacoes), ''),
    CASE WHEN p_concluir THEN 'concluida' ELSE 'em_andamento' END,
    CASE WHEN p_concluir THEN p_proxima_etapa ELSE NULL END,
    CASE WHEN p_concluir THEN NULLIF(btrim(p_proxima_acao), '') ELSE NULL END,
    CASE WHEN p_concluir THEN p_proximo_followup ELSE NULL END,
    CASE WHEN p_concluir THEN now() ELSE NULL END,
    _interesse,
    _objecao,
    _uid,
    _uid
  )
  ON CONFLICT (agendamento_id) DO UPDATE
  SET checklist = EXCLUDED.checklist,
      nota_transcrita = EXCLUDED.nota_transcrita,
      observacoes = EXCLUDED.observacoes,
      status = CASE
        WHEN execucao.status = 'concluida' THEN execucao.status
        ELSE EXCLUDED.status
      END,
      proxima_etapa = COALESCE(execucao.proxima_etapa, EXCLUDED.proxima_etapa),
      proxima_acao = COALESCE(execucao.proxima_acao, EXCLUDED.proxima_acao),
      proximo_followup = COALESCE(execucao.proximo_followup, EXCLUDED.proximo_followup),
      concluida_em = COALESCE(execucao.concluida_em, EXCLUDED.concluida_em),
      -- Resultado é a leitura mais recente do corretor: sobrescreve.
      interesse = COALESCE(EXCLUDED.interesse, execucao.interesse),
      objecao_principal = COALESCE(EXCLUDED.objecao_principal, execucao.objecao_principal),
      atualizada_por = _uid,
      updated_at = now()
  RETURNING execucao.* INTO _resultado;

  -- Validação do agendamento: é ela que alimenta visitas realizadas (no dia
  -- da visita) e no-show nos relatórios.
  IF p_concluir THEN
    UPDATE public.agendamentos
    SET status = CASE WHEN _compareceu
                      THEN 'realizado'::public.agendamento_status
                      ELSE 'nao_compareceu'::public.agendamento_status END,
        realizado_em = CASE WHEN _compareceu THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = _agenda.id;

    -- A visita deixa rastro no histórico do lead. Mesma forma do
    -- validar_visita (modal do Kanban), para as duas portas contarem a
    -- mesma história.
    INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
    VALUES (
      _agenda.lead_id,
      _uid,
      'visita'::public.interacao_tipo,
      'interna',
      CASE WHEN _compareceu THEN 'Visita realizada' ELSE 'Cliente não compareceu' END,
      COALESCE(
        NULLIF(btrim(p_nota_transcrita), ''),
        NULLIF(btrim(p_observacoes), ''),
        '(sem observações)'
      ),
      jsonb_build_object(
        'agendamento_id', _agenda.id,
        'compareceu', _compareceu,
        'origem', 'modo_visita',
        'checklist', _checklist,
        'data_visita', _agenda.data_inicio,
        'observacoes', NULLIF(btrim(p_observacoes), ''),
        'interesse', _interesse,
        'objecao_principal', _objecao
      )
    );

    -- Reagendamento na mesma transação: o cliente que não veio (ou que pediu
    -- para voltar depois) sai daqui com data nova, não com uma intenção.
    IF p_reagendar_para IS NOT NULL THEN
      INSERT INTO public.agendamentos (
        lead_id, corretor_id, titulo, descricao, tipo, status,
        data_inicio, data_fim, local
      ) VALUES (
        _agenda.lead_id,
        COALESCE(_agenda.corretor_id, _lead.corretor_id, _uid),
        _agenda.titulo,
        CASE WHEN _compareceu
             THEN 'Reagendada a partir do Modo Visita.'
             ELSE 'Reagendada após não comparecimento.' END,
        'visita'::public.agendamento_tipo,
        'agendado'::public.agendamento_status,
        p_reagendar_para,
        p_reagendar_para + (_agenda.data_fim - _agenda.data_inicio),
        _agenda.local
      );
    END IF;
  END IF;

  IF p_concluir AND _lead.status IS DISTINCT FROM p_proxima_etapa THEN
    PERFORM public.transicionar_lead(
      _agenda.lead_id,
      p_proxima_etapa,
      CASE WHEN _compareceu
           THEN 'Conclusão registrada no Modo Visita'
           ELSE 'Cliente não compareceu à visita (Modo Visita)' END,
      NULLIF(btrim(p_proxima_acao), ''),
      p_proximo_followup
    );
  END IF;

  RETURN _resultado;
END;
$$;

COMMENT ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz, boolean,
  text, text, timestamptz
) IS
  'Salva o Modo Visita e, ao concluir: valida o agendamento (realizado/não compareceu), grava resultado estruturado (interesse + objeção), registra a visita na timeline, cria o reagendamento quando informado e move o status do lead — tudo numa transação.';

REVOKE ALL ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz, boolean,
  text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz, boolean,
  text, text, timestamptz
) TO authenticated;
