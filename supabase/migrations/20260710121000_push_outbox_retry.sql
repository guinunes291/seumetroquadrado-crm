-- =====================================================================
-- Auditoria julho/2026 — Etapa 1 (A1)
-- push_outbox ganha controle de tentativa/retry para não "perder"
-- notificações. Antes, o dispatcher marcava tudo como enviado mesmo sem
-- entrega real; agora só marca sent em sucesso e reagenda o resto.
-- Aditiva e idempotente (defaults preservam o comportamento até o deploy
-- do novo handler).
-- =====================================================================

ALTER TABLE public.push_outbox
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Índice de "prontos para tentar": pendentes cujo próximo horário já passou
-- (ou nunca foi agendado).
CREATE INDEX IF NOT EXISTS idx_push_outbox_ready
  ON public.push_outbox (next_attempt_at)
  WHERE sent_at IS NULL;
