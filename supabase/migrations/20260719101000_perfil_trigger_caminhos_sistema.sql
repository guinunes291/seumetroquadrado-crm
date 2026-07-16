-- Correção do trigger protect_profile_sensitive_fields (criado hoje em
-- 20260715184202 e ajustado em 20260715184718).
--
-- O trigger preservava campos "sensíveis" para QUALQUER autor não-admin —
-- inclusive os caminhos de sistema, que não carregam JWT de admin:
--
--  * service_role / sem JWT (webhook de intake, cron, GoTrue em handle_new_user,
--    migrations): auth.uid() é NULL → caía no ramo de preservação. Efeitos:
--    handle_new_user não conseguia ativar conta convidada (status_conta/equipe
--    revertidos) e o motor de distribuição não gravava o cursor do rodízio.
--
--  * RPCs SECURITY DEFINER chamadas com o JWT do próprio usuário
--    (marcar_presenca, marcar_presenca_admin p/ gestor, motor de distribuição
--    disparado da UI): o trigger revertia presente/presente_em/
--    last_lead_assigned_at SILENCIOSAMENTE. Efeitos: marcar presença não
--    "pegava", corretor ficava fora da roleta e o rodízio repetia sempre o
--    mesmo corretor.
--
-- Regras novas:
--  1. Sem JWT de usuário ou service_role → passa direto (caminho de sistema).
--  2. Admin → passa direto (comportamento original).
--  3. Demais autenticados: campos administrativos continuam travados
--     (ativo, status_conta, equipe_id, data_admissao, email, id).
--  4. presente/presente_em ficam LIVRES: marcar_presenca já concede exatamente
--     essa escrita na própria linha a qualquer autenticado (e
--     marcar_presenca_admin a gestores) — preservá-los aqui só quebrava as
--     RPCs, sem ganho de segurança.
--  5. last_lead_assigned_at aceita apenas o "touch" para agora (o único write
--     legítimo, feito pelo motor de distribuição). Retrodatar — o fura-fila da
--     roleta que o trigger queria impedir — continua revertido.

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- 1) Caminhos de sistema: webhook/cron/GoTrue/migrations (sem JWT) e
  --    service_role não são o corretor tentando se auto-promover.
  IF auth.uid() IS NULL OR COALESCE(auth.role() = 'service_role', false) THEN
    RETURN NEW;
  END IF;

  -- 2) Admin pode alterar qualquer coisa.
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- 3) Campos administrativos: preservados para não-admin (inclui self-update).
  NEW.ativo := OLD.ativo;
  NEW.status_conta := OLD.status_conta;
  NEW.equipe_id := OLD.equipe_id;
  NEW.data_admissao := OLD.data_admissao;
  NEW.email := OLD.email;
  NEW.id := OLD.id;

  -- 5) Cursor do rodízio: aceita somente "agora" (tolerância p/ clock skew).
  IF NEW.last_lead_assigned_at IS DISTINCT FROM OLD.last_lead_assigned_at
     AND (
       NEW.last_lead_assigned_at IS NULL
       OR NEW.last_lead_assigned_at < now() - interval '10 seconds'
       OR NEW.last_lead_assigned_at > now() + interval '10 seconds'
     ) THEN
    NEW.last_lead_assigned_at := OLD.last_lead_assigned_at;
  END IF;

  RETURN NEW;
END;
$$;
