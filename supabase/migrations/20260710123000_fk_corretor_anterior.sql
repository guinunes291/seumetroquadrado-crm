-- =====================================================================
-- Auditoria julho/2026 — Etapa 2 (M6, parcial)
-- FK de auditoria em leads.corretor_anterior_id (era uuid solto, podia
-- apontar para usuário inexistente). ON DELETE SET NULL: se o usuário some,
-- o campo vira NULL em vez de virar órfão.
--
-- Adicionada como NOT VALID + VALIDATE guardado: linhas legadas órfãs não
-- travam a migração; novas linhas passam a ser validadas.
--
-- NÃO adiciono FK em distribution_log.corretor_id de propósito: é NOT NULL num
-- log append-only de auditoria; uma FK ali ou bloquearia excluir usuários ou
-- apagaria histórico. Auditoria deve sobreviver à exclusão do ator.
-- Idempotente.
-- =====================================================================

DO $$
BEGIN
  IF to_regclass('public.leads') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'leads_corretor_anterior_fk'
     )
  THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_corretor_anterior_fk
      FOREIGN KEY (corretor_anterior_id) REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;

    BEGIN
      ALTER TABLE public.leads VALIDATE CONSTRAINT leads_corretor_anterior_fk;
    EXCEPTION
      WHEN foreign_key_violation THEN
        RAISE WARNING 'leads_corretor_anterior_fk criada como NOT VALID: há corretor_anterior_id órfão. Limpe e rode VALIDATE CONSTRAINT depois.';
    END;
  END IF;
END $$;
