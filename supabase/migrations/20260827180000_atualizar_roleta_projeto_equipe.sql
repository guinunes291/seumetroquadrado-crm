-- ---------------------------------------------------------------------------
-- 2026-08-27 — atualizar_roleta aprende equipe_fixa e projeto vinculado
--
-- Bug reportado no painel (Propriedades da fila): a UI chama atualizar_roleta
-- com _equipe_fixa/_projeto_id/_limpar_projeto, mas a única assinatura no
-- banco era a de 6 argumentos (20260709120400). Como _limpar_projeto vai em
-- TODA chamada, o PostgREST não encontrava a função e NENHUM salvamento do
-- painel funcionava ("Could not find the function ... in the schema cache").
--
-- A assinatura antiga é derrubada (overload deixaria as duas conviverem e o
-- match por argumentos nomeados ficaria ambíguo). Semântica preservada:
-- NULL mantém o valor; horários '' limpam a janela; auditoria só quando algo
-- muda de fato. Novos: _equipe_fixa (NULL mantém), _projeto_id (NULL mantém)
-- e _limpar_projeto (true desvincula o projeto — vence o _projeto_id).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.atualizar_roleta(text, boolean, boolean, text, text, boolean);

CREATE OR REPLACE FUNCTION public.atualizar_roleta(
  _slug text,
  _ativo boolean DEFAULT NULL,
  _exigir_presenca boolean DEFAULT NULL,
  _horario_inicio text DEFAULT NULL,
  _horario_fim text DEFAULT NULL,
  _permitir_fora_horario boolean DEFAULT NULL,
  _equipe_fixa boolean DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _limpar_projeto boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _projeto_id IS NOT NULL AND NOT _limpar_projeto
     AND NOT EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = _projeto_id) THEN
    RAISE EXCEPTION 'projeto % inexistente', _projeto_id;
  END IF;

  SELECT to_jsonb(r) INTO _antes FROM public.roletas r WHERE r.slug = _slug;
  IF _antes IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _slug;
  END IF;

  UPDATE public.roletas r SET
    ativo = COALESCE(_ativo, r.ativo),
    exigir_presenca = COALESCE(_exigir_presenca, r.exigir_presenca),
    horario_inicio = CASE
      WHEN _horario_inicio IS NULL THEN r.horario_inicio
      WHEN btrim(_horario_inicio) = '' THEN NULL
      ELSE _horario_inicio::time END,
    horario_fim = CASE
      WHEN _horario_fim IS NULL THEN r.horario_fim
      WHEN btrim(_horario_fim) = '' THEN NULL
      ELSE _horario_fim::time END,
    permitir_fora_horario = COALESCE(_permitir_fora_horario, r.permitir_fora_horario),
    equipe_fixa = COALESCE(_equipe_fixa, r.equipe_fixa),
    projeto_id = CASE
      WHEN _limpar_projeto THEN NULL
      WHEN _projeto_id IS NOT NULL THEN _projeto_id
      ELSE r.projeto_id END
  WHERE r.slug = _slug;

  SELECT to_jsonb(r) INTO _depois FROM public.roletas r WHERE r.slug = _slug;

  -- Sem mudança efetiva (blur sem edição) → sem ruído na auditoria.
  -- (updated_at muda em todo UPDATE — fica fora da comparação.)
  IF (_antes - 'updated_at') IS DISTINCT FROM (_depois - 'updated_at') THEN
    INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
    VALUES ('roletas', (_depois->>'id')::uuid, 'UPDATE', _caller, _antes, _depois);
  END IF;

  RETURN jsonb_build_object('ok', true, 'roleta', _depois);
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean) TO authenticated, service_role;

-- Sanidade: a assinatura velha sumiu e a nova existe.
DO $$
BEGIN
  IF to_regprocedure('public.atualizar_roleta(text, boolean, boolean, text, text, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'assinatura antiga de atualizar_roleta ainda existe (ambiguidade)';
  END IF;
  IF to_regprocedure('public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'assinatura nova de atualizar_roleta não foi criada';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
