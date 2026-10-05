-- ============================================================================
-- Regra dos 65 em "Em atendimento" — Fatia 5: a virada segura (um motor só)
-- ============================================================================
-- Desenho: docs/ops/em-atendimento-teto-65.md (§6 "continuam em aberto",
-- §8.10). Nada se move aqui.
--
-- "DOIS MOTORES DEVOLVENDO O MESMO LEAD, NÃO." A casa tem dois motores
-- antigos de devolução, ambos desligados em produção: a régua de devolução
-- do Bolsão (`gestao_config.bolsao.modo = ativo`, cron
-- regua_devolucao_processar) e a devolução por follow-up vencido
-- (`gestao_config.regua_followup.devolucao_ativa`, cron
-- devolver_leads_followup_vencido). A regra dos 65 os substitui. A Fatia 3b
-- fez `em_atendimento_ligar()` recusar ligar com qualquer um deles ativo —
-- mas o caminho inverso ficou aberto: com a regra ligada (ou agendada), o
-- admin ainda podia ligar a régua pelo cartão de gestão, e no dia da virada
-- os dois motores devolveriam o mesmo lead.
--
-- O FECHO MORA NA TABELA, não na tela: a config é escrita direto por RLS
-- (gestao_config_write_admin), então só um gatilho fecha TODAS as portas —
-- cartão, SQL do admin, RPC. O gatilho só reage à TRANSIÇÃO para ligado:
-- salvar a régua com a devolução desligada continua livre, desligar
-- qualquer motor continua livre, e as outras chaves nem passam por ele.
-- "Ligada" aqui é `modo = ligado`, inclusive agendada (virada futura): a
-- régua ligada hoje seria o segundo motor no dia da virada.
--
-- SQLSTATE SMQ65 nas duas direções, para a tela reconhecer e explicar.
--
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gestao_config_um_motor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _antes jsonb := CASE WHEN TG_OP = 'UPDATE' THEN OLD.valor ELSE '{}'::jsonb END;
  _regra_ligada boolean;
BEGIN
  -- Ligar a regra dos 65 com um motor antigo ativo (mesma guarda de
  -- em_atendimento_ligar, agora também para o UPDATE direto).
  IF NEW.chave = 'em_atendimento' THEN
    IF NEW.valor ->> 'modo' = 'ligado' AND COALESCE(_antes ->> 'modo', 'sombra') <> 'ligado' THEN
      IF COALESCE(public.gestao_config_valor('bolsao') ->> 'modo', 'sombra') = 'ativo' THEN
        RAISE EXCEPTION 'um motor só: a régua de devolução do Bolsão (gestao_config.bolsao.modo = ativo) está ligada; desligue-a antes de ligar a regra dos 65'
          USING ERRCODE = 'SMQ65';
      END IF;
      IF COALESCE(public.gestao_config_valor('regua_followup') -> 'devolucao_ativa', 'false'::jsonb) = 'true'::jsonb THEN
        RAISE EXCEPTION 'um motor só: a devolução por follow-up vencido (regua_followup.devolucao_ativa) está ligada; desligue-a antes de ligar a regra dos 65'
          USING ERRCODE = 'SMQ65';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.chave NOT IN ('bolsao', 'regua_followup') THEN
    RETURN NEW;
  END IF;
  _regra_ligada := COALESCE(public.gestao_config_valor('em_atendimento') ->> 'modo', 'sombra') = 'ligado';

  IF NEW.chave = 'bolsao'
     AND NEW.valor ->> 'modo' = 'ativo'
     AND COALESCE(_antes ->> 'modo', 'sombra') <> 'ativo'
     AND _regra_ligada THEN
    RAISE EXCEPTION 'um motor só: a regra dos 65 está ligada (ou agendada); a régua de devolução do Bolsão fica desligada'
      USING ERRCODE = 'SMQ65';
  END IF;

  IF NEW.chave = 'regua_followup'
     AND COALESCE(NEW.valor -> 'devolucao_ativa', 'false'::jsonb) = 'true'::jsonb
     AND COALESCE(_antes -> 'devolucao_ativa', 'false'::jsonb) <> 'true'::jsonb
     AND _regra_ligada THEN
    RAISE EXCEPTION 'um motor só: a regra dos 65 está ligada (ou agendada); a devolução por follow-up vencido fica desligada'
      USING ERRCODE = 'SMQ65';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.gestao_config_um_motor() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.gestao_config_um_motor() IS
  'Regra dos 65, Fatia 5: um motor so. Recusa (SQLSTATE SMQ65) ligar a regra '
  'dos 65 com a regua do Bolsao ou a devolucao por follow-up ativas, e recusa '
  'ligar qualquer uma delas com a regra dos 65 ligada ou agendada. So reage a '
  'transicao para ligado; desligar e as outras chaves passam livres.';

DROP TRIGGER IF EXISTS trg_gestao_config_um_motor ON public.gestao_config;
CREATE TRIGGER trg_gestao_config_um_motor
  BEFORE INSERT OR UPDATE ON public.gestao_config
  FOR EACH ROW EXECUTE FUNCTION public.gestao_config_um_motor();

-- ---------------------------------------------------------------------------
-- Sanidade: o gatilho existe e o estado atual não tem dois motores. Estado
-- inconsistente não derruba a migration (o migrator aplica tudo numa
-- transação só; travar o deploy não ajuda ninguém): só avisa.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _regra boolean := COALESCE(public.gestao_config_valor('em_atendimento') ->> 'modo', 'sombra') = 'ligado';
  _bolsao boolean := COALESCE(public.gestao_config_valor('bolsao') ->> 'modo', 'sombra') = 'ativo';
  _regua boolean := COALESCE(public.gestao_config_valor('regua_followup') -> 'devolucao_ativa', 'false'::jsonb) = 'true'::jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gestao_config_um_motor'
      AND tgrelid = 'public.gestao_config'::regclass
  ) THEN
    RAISE EXCEPTION 'fatia5: gatilho um_motor ausente';
  END IF;
  IF has_function_privilege('authenticated', 'public.gestao_config_um_motor()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fatia5: EXECUTE indevido';
  END IF;
  IF _regra AND (_bolsao OR _regua) THEN
    RAISE WARNING 'fatia5: dois motores ligados ao mesmo tempo (regra dos 65 + bolsao=% / regua=%): desligue um', _bolsao, _regua;
  END IF;
END $$;
