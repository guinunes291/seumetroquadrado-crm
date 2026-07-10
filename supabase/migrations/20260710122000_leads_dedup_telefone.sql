-- =====================================================================
-- Auditoria julho/2026 — Etapa 1 (A3)
-- Dedup de lead à prova de corrida. O intake (Facebook/Zapier/chatbot)
-- fazia check-then-insert: dois retries simultâneos do mesmo telefone
-- passavam ambos na checagem e criavam DOIS leads → dupla distribuição.
--
-- Estratégia (não destrutiva):
--   1) função IMMUTABLE telefone_digits() para indexar por dígitos;
--   2) view de relatório das duplicatas atuais (para limpeza humana);
--   3) índice único PARCIAL por (projeto_id, dígitos), casando a regra de
--      buscar_lead_duplicado (dedup por projeto). Criado dentro de um
--      DO-block: se a base tiver duplicatas, o índice NÃO é criado (fica só
--      o warning + a view), sem travar a migração. Numa base limpa, a
--      corrida fica fechada no banco.
--
-- Os intakes passam a tratar a violação 23505 como "duplicado" (retornam o
-- lead existente) — ver src/routes/api/public/webhooks/*, lead-intake.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.telefone_digits(_telefone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(_telefone, ''), '\D', '', 'g');
$$;

-- Relatório de duplicatas ativas por (projeto, telefone) — para o gestor
-- resolver antes de ativar o índice único, se houver.
CREATE OR REPLACE VIEW public.vw_leads_telefone_duplicado AS
SELECT
  l.projeto_id,
  public.telefone_digits(l.telefone) AS telefone_digits,
  count(*) AS qtd,
  array_agg(l.id ORDER BY l.created_at DESC) AS lead_ids
FROM public.leads l
WHERE l.deleted_at IS NULL
  AND l.projeto_id IS NOT NULL
  AND length(public.telefone_digits(l.telefone)) >= 8
GROUP BY l.projeto_id, public.telefone_digits(l.telefone)
HAVING count(*) > 1;

-- Índice único parcial guardado. Só é criado se a base já estiver limpa.
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_projeto_telefone_ativo
      ON public.leads (projeto_id, public.telefone_digits(telefone))
      WHERE deleted_at IS NULL
        AND projeto_id IS NOT NULL
        AND length(public.telefone_digits(telefone)) >= 8;
    RAISE NOTICE 'uq_leads_projeto_telefone_ativo criado (base sem duplicatas).';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE WARNING 'Índice único de dedup NÃO criado: existem leads duplicados por (projeto, telefone). Resolva via public.vw_leads_telefone_duplicado e reaplique.';
  END;
END $$;
