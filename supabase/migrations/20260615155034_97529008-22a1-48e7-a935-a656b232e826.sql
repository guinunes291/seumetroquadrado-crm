
-- 1) Webhook token: column-level protection
REVOKE SELECT (webhook_token) ON public.projetos FROM authenticated;
REVOKE UPDATE (webhook_token) ON public.projetos FROM authenticated;

-- RPC: ler token (somente admin/gestor)
CREATE OR REPLACE FUNCTION public.get_projeto_webhook_token(_projeto_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _token text;
BEGIN
  IF _caller IS NULL
     OR (NOT public.has_role(_caller, 'admin')
         AND NOT public.has_role(_caller, 'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT webhook_token INTO _token FROM public.projetos WHERE id = _projeto_id;
  RETURN _token;
END;
$$;

-- RPC: regenerar token
CREATE OR REPLACE FUNCTION public.regenerar_webhook_token(_projeto_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _caller uuid := auth.uid();
  _novo text;
BEGIN
  IF _caller IS NULL
     OR (NOT public.has_role(_caller, 'admin')
         AND NOT public.has_role(_caller, 'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  _novo := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  UPDATE public.projetos SET webhook_token = _novo WHERE id = _projeto_id;
  RETURN _novo;
END;
$$;

-- 2) Alertas: somente admin/gestor podem INSERT (gatilhos SECURITY DEFINER continuam funcionando)
DROP POLICY IF EXISTS "Admin/gestor criam alertas" ON public.alertas;
CREATE POLICY "Admin/gestor criam alertas"
  ON public.alertas FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
  );

-- 3) SECURITY DEFINER: revogar EXECUTE de PUBLIC/anon/authenticated; conceder onde necessário
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resetar_cotas_diarias()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.alerta_agendamento_criado()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.alerta_tarefa_criada()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.alerta_lead_distribuido()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atualizar_ultima_interacao_lead()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_historico_preco()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_trigger()                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expirar_lixeira_antiga()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurar_registro(text, uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mesclar_leads(uuid, uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.distribuir_lead(uuid, distribuicao_tipo, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.detectar_duplicatas_leads()                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_projeto_webhook_token(uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.regenerar_webhook_token(uuid)                  FROM PUBLIC, anon;

-- Conceder EXECUTE somente onde a app cliente realmente chama
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_registro(text, uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.mesclar_leads(uuid, uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.distribuir_lead(uuid, distribuicao_tipo, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.detectar_duplicatas_leads()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_projeto_webhook_token(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerar_webhook_token(uuid)                    TO authenticated;
