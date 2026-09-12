ALTER TABLE public.higiene_config
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'sombra'
    CHECK (modo IN ('sombra','ativo_parcial','ativo')),
  ADD COLUMN IF NOT EXISTS teto_perdidos_dia integer NOT NULL DEFAULT 200
    CHECK (teto_perdidos_dia BETWEEN 0 AND 5000),
  ADD COLUMN IF NOT EXISTS lote_max integer NOT NULL DEFAULT 500
    CHECK (lote_max BETWEEN 1 AND 5000);

COMMENT ON COLUMN public.higiene_config.modo IS
  'sombra = so registra; ativo_parcial = so alerta; ativo = executa a regua inteira.';
COMMENT ON COLUMN public.higiene_config.teto_perdidos_dia IS
  'Teto diario de leads que o motor pode marcar como perdido. Freio de mao contra regua mal configurada.';
COMMENT ON COLUMN public.higiene_config.lote_max IS
  'Quantos leads o motor avalia por execucao.';

ALTER TABLE public.higiene_regra_fase
  ADD COLUMN IF NOT EXISTS dias_perda integer
    CHECK (dias_perda IS NULL OR dias_perda BETWEEN 1 AND 365),
  ADD COLUMN IF NOT EXISTS acao_automatica text NOT NULL DEFAULT 'nenhuma'
    CHECK (acao_automatica IN ('nenhuma','alertar','devolver_roleta','perdido'));

COMMENT ON COLUMN public.higiene_regra_fase.dias_perda IS
  'Prazo proprio da fase. NULL = usa higiene_config.dias_parado_min.';
COMMENT ON COLUMN public.higiene_regra_fase.acao_automatica IS
  'O que o motor faz nesta fase. Semeado como alertar — descarte automatico e decisao humana.';

-- Trava 1: aguardando_atendimento e da SLA de 15 min. Duas regras movendo o
-- mesmo lead e pior que nenhuma. Por CHECK, nao por disciplina.
ALTER TABLE public.higiene_regra_fase
  DROP CONSTRAINT IF EXISTS higiene_regra_fase_nao_disputa_sla;
ALTER TABLE public.higiene_regra_fase
  ADD CONSTRAINT higiene_regra_fase_nao_disputa_sla
  CHECK (status <> 'aguardando_atendimento'::public.lead_status);

-- Trava 2: analise_credito converte 39,1% e esta 92,5% parada. Ali o problema
-- e cobranca, nao descarte.
ALTER TABLE public.higiene_regra_fase
  DROP CONSTRAINT IF EXISTS higiene_credito_nao_perde;
ALTER TABLE public.higiene_regra_fase
  ADD CONSTRAINT higiene_credito_nao_perde
  CHECK (status <> 'analise_credito'::public.lead_status OR dias_perda IS NULL);

-- Semente segura: todas as fases so ALERTAM.
UPDATE public.higiene_regra_fase SET acao_automatica = 'alertar'
 WHERE acao_automatica = 'nenhuma';

GRANT UPDATE (modo, teto_perdidos_dia, lote_max) ON public.higiene_config TO authenticated;
GRANT UPDATE (dias_perda, acao_automatica) ON public.higiene_regra_fase TO authenticated;