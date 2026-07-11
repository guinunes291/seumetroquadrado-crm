-- Modo Visita: execução assistida em campo, sem armazenar áudio bruto.
--
-- A escrita passa exclusivamente pela RPC abaixo. Ela valida a carteira,
-- serializa a conclusão da visita e, quando solicitado, move o lead pela
-- máquina de estados na mesma transação.

CREATE TABLE IF NOT EXISTS public.visita_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL UNIQUE
    REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  nota_transcrita text,
  observacoes text,
  status text NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'concluida')),
  proxima_etapa public.lead_status,
  proxima_acao text,
  proximo_followup timestamptz,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  criada_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  atualizada_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(checklist) = 'object'),
  CHECK (char_length(COALESCE(nota_transcrita, '')) <= 5000),
  CHECK (char_length(COALESCE(observacoes, '')) <= 5000),
  CHECK (char_length(COALESCE(proxima_acao, '')) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_visita_execucoes_lead
  ON public.visita_execucoes(lead_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_visita_execucoes_corretor
  ON public.visita_execucoes(corretor_id, updated_at DESC);

ALTER TABLE public.visita_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visita_execucoes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visita_execucoes_select_carteira"
  ON public.visita_execucoes;
CREATE POLICY "visita_execucoes_select_carteira"
  ON public.visita_execucoes FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

-- Nenhuma escrita direta do navegador: a RPC mantém agenda, execução e lead
-- consistentes e auditáveis.
REVOKE ALL ON TABLE public.visita_execucoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.visita_execucoes TO authenticated;
GRANT ALL ON TABLE public.visita_execucoes TO service_role;

-- Mantém a execução alinhada quando o agendamento é transferido ou quando a
-- deduplicação mescla o lead de origem no destino. Sem isso, o lead_id
-- denormalizado da execução poderia apontar para a carteira antiga.
CREATE OR REPLACE FUNCTION public.sincronizar_execucao_com_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.lead_id IS NULL AND EXISTS (
    SELECT 1 FROM public.visita_execucoes WHERE agendamento_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'visita executada não pode ser desvinculada do lead'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    UPDATE public.visita_execucoes
    SET lead_id = NEW.lead_id,
        corretor_id = NEW.corretor_id,
        atualizada_por = COALESCE(auth.uid(), atualizada_por),
        updated_at = now()
    WHERE agendamento_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_execucao_com_agendamento()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sincronizar_execucao_com_agendamento
  ON public.agendamentos;
CREATE TRIGGER trg_sincronizar_execucao_com_agendamento
  AFTER UPDATE OF lead_id, corretor_id ON public.agendamentos
  FOR EACH ROW
  WHEN (
    OLD.lead_id IS DISTINCT FROM NEW.lead_id
    OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id
  )
  EXECUTE FUNCTION public.sincronizar_execucao_com_agendamento();

CREATE OR REPLACE FUNCTION public.salvar_modo_visita(
  p_agendamento_id uuid,
  p_checklist jsonb DEFAULT '{}'::jsonb,
  p_nota_transcrita text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_concluir boolean DEFAULT false,
  p_proxima_etapa public.lead_status DEFAULT NULL,
  p_proxima_acao text DEFAULT NULL,
  p_proximo_followup timestamptz DEFAULT NULL
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
  -- tenta mover o lead uma segunda vez.
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

  IF p_concluir
     AND p_proxima_etapa = 'aguardando_retorno'::public.lead_status
     AND (p_proximo_followup IS NULL OR p_proximo_followup <= now()) THEN
    RAISE EXCEPTION 'aguardando retorno exige follow-up futuro'
      USING ERRCODE = '22023';
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
      atualizada_por = _uid,
      updated_at = now()
  RETURNING execucao.* INTO _resultado;

  IF p_concluir AND _agenda.status <> 'realizado'::public.agendamento_status THEN
    UPDATE public.agendamentos
    SET status = 'realizado'::public.agendamento_status,
        realizado_em = now(),
        updated_at = now()
    WHERE id = _agenda.id;
  END IF;

  IF p_concluir AND _lead.status IS DISTINCT FROM p_proxima_etapa THEN
    PERFORM public.transicionar_lead(
      _agenda.lead_id,
      p_proxima_etapa,
      'Conclusão registrada no Modo Visita',
      NULLIF(btrim(p_proxima_acao), ''),
      p_proximo_followup
    );
  END IF;

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz
) TO authenticated;

COMMENT ON TABLE public.visita_execucoes IS
  'Checklist e notas revisadas do Modo Visita; áudio bruto nunca é persistido.';
COMMENT ON FUNCTION public.salvar_modo_visita(
  uuid, jsonb, text, text, boolean, public.lead_status, text, timestamptz
) IS
  'Salva a visita e, ao concluir, atualiza agenda e lead atomicamente com autorização de carteira.';
