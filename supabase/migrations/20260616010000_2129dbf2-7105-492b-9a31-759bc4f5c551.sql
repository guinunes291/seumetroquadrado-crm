-- Copa SMQ: chaveamento e ranking vazios mesmo com 43 confrontos gravados na edição
-- ativa. Causa: faltam no banco as colunas que o frontend e as RPCs usam — a migration
-- que as adicionava não teve efeito nesta base:
--   • copa_fases.tipo        -> copa.tsx faz fases.find(f => f.tipo === 'grupos') e as
--                               RPCs (status_chaveamento/avancar_fase/sorteio) filtram por tipo;
--   • copa_participantes.grupo-> copa_ranking lê cp.grupo (sem ela a RPC quebra);
--   • copa_confrontos.is_wo  -> copa.tsx seleciona is_wo dos confrontos.
-- Sem essas colunas as leituras dão erro/undefined -> a tela mostra tudo vazio.
-- Idempotente (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.copa_fases         ADD COLUMN IF NOT EXISTS tipo  text;
ALTER TABLE public.copa_participantes ADD COLUMN IF NOT EXISTS grupo text;
ALTER TABLE public.copa_confrontos    ADD COLUMN IF NOT EXISTS is_wo boolean NOT NULL DEFAULT false;

-- Rotula as 9 fases pela ordem (sequência padrão da Copa SMQ).
UPDATE public.copa_fases SET tipo = CASE ordem
  WHEN 1 THEN 'grupos'      WHEN 2 THEN 'repescagem1' WHEN 3 THEN 'oitavas'
  WHEN 4 THEN 'repescagem2' WHEN 5 THEN 'quartas'     WHEN 6 THEN 'semifinal'
  WHEN 7 THEN 'terceiro'    WHEN 8 THEN 'final'       WHEN 9 THEN 'premiacao'
  ELSE tipo END
WHERE tipo IS NULL;

-- Garante que a fase onde estão os 43 confrontos seja a de grupos (id fixo usado pelo
-- copa_inicializar_dados).
UPDATE public.copa_fases SET tipo = 'grupos'
WHERE id = '3b986a16-13fb-4269-afe0-c77abf1eef32' AND COALESCE(tipo,'') <> 'grupos';

-- Marca como W.O. os confrontos sem adversário (corretor_b_id nulo) — o frontend já
-- trata corretor_b_id nulo como W.O., isto só deixa o dado consistente.
UPDATE public.copa_confrontos SET is_wo = true WHERE corretor_b_id IS NULL AND is_wo = false;
