-- Claim atômico da push_outbox para impedir que dois crons processem a mesma
-- notificação simultaneamente. Uma lease expirada volta a ficar elegível caso
-- o worker caia antes de concluir o envio.

ALTER TABLE public.push_outbox
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

-- JWTs emitidos antes de um bloqueio continuam válidos até expirarem. As
-- policies antigas usavam apenas auth.uid(), portanto ainda expunham o texto
-- das notificações e permitiam manter subscriptions após o bloqueio.
DROP POLICY IF EXISTS "users manage own push subs" ON public.push_subscriptions;
CREATE POLICY "users manage own push subs"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (public.is_active_member(auth.uid()) AND auth.uid() = user_id)
  WITH CHECK (public.is_active_member(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "users read own push outbox" ON public.push_outbox;
CREATE POLICY "users read own push outbox"
  ON public.push_outbox FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()) AND auth.uid() = user_id);

-- Estes helpers SECURITY DEFINER nasceram com EXECUTE para PUBLIC. Sem o
-- revoke, qualquer cliente poderia injetar notificações arbitrárias para outro
-- usuário ou disparar o job global por RPC.
REVOKE ALL ON FUNCTION public.enqueue_push(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_push(uuid, text, text, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.gerar_pushes_agendamentos_proximos()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_pushes_agendamentos_proximos()
  TO service_role;
REVOKE ALL ON FUNCTION public.push_lead_distribuido() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_tarefa_criada() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_push_outbox_claim_ready
  ON public.push_outbox (created_at, next_attempt_at, lease_expires_at)
  WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_push_outbox(
  _limit integer DEFAULT 100,
  _lease_seconds integer DEFAULT 600
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  body text,
  url text,
  tag text,
  attempts integer,
  lease_token uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT po.id
    FROM public.push_outbox AS po
    WHERE po.sent_at IS NULL
      AND (po.next_attempt_at IS NULL OR po.next_attempt_at <= clock_timestamp())
      AND (po.lease_expires_at IS NULL OR po.lease_expires_at <= clock_timestamp())
    ORDER BY po.created_at ASC
    FOR UPDATE OF po SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 100)
  ), claimed AS (
    UPDATE public.push_outbox AS po
    SET lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp()
          + make_interval(secs => LEAST(GREATEST(COALESCE(_lease_seconds, 600), 30), 3600))
    FROM candidates AS c
    WHERE po.id = c.id
    RETURNING
      po.id,
      po.user_id,
      po.title,
      po.body,
      po.url,
      po.tag,
      po.attempts,
      po.lease_token
  )
  SELECT
    c.id,
    c.user_id,
    c.title,
    c.body,
    c.url,
    c.tag,
    c.attempts,
    c.lease_token
  FROM claimed AS c;
$$;

REVOKE ALL ON FUNCTION public.claim_push_outbox(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_push_outbox(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(integer, integer) TO service_role;
