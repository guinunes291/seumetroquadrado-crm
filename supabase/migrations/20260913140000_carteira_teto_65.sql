-- ============================================================================
-- Teto da carteira ativa: 40 → 65
-- ============================================================================
-- Decisão do dono, 13/09/2026. Desenho: docs/ops/carteira-ativa-40-fatia3.md.
--
-- POR QUE OS CAPS DE FAIXA SOBEM JUNTO. Subir só o teto seria quase inerte:
-- os caps somavam 34 (conversa 14 + SLA 12 + resgate 8) e travam ANTES do
-- teto. Um corretor com fundo do funil pequeno — a mediana medida é 4 — pararia
-- em ~38 leads mesmo com o teto em 65, e a mudança não apareceria na operação.
-- Os caps escalam por 65/40 = 1,625, preservando a mesma folga relativa que
-- 34 + fundo tinha sob 40 (85% do teto antes, 86% agora):
--
--   conversa  14 → 23
--   sla       12 → 20
--   resgate    8 → 13
--   soma      34 → 56   (+ fundo, que não tem cap)
--
-- O QUE ISSO CUSTA, dito aqui porque a próxima pessoa vai perguntar. O "40"
-- saía de uma conta de cadência (§2.1 do documento): 40 leads ÷ toque a cada
-- 48 h = 20 toques/dia ≈ 4 a 5 horas, a jornada útil de contato. A 65, a mesma
-- jornada de 20 toques/dia estica a cadência para ~78 h (3,25 dias) entre
-- toques. O teto deixa de ser "o que cabe numa cadência de 48 h" e passa a ser
-- um limite de responsabilidade mais largo.
--
-- Na prática isso não aperta ninguém hoje: medido em 13/09/2026, a casa
-- inteira tocou 762 leads em 7 dias (~16 por corretor). O teto é ceiling, não
-- cota — a 65 ele apenas devolve menos gente à Reserva.
--
-- UPDATE, não INSERT: as duas chaves já existem em produção
-- (capacidade_leads_ativos_por_corretor desde 20260727100000). ON CONFLICT DO
-- NOTHING aqui seria um no-op silencioso — a armadilha clássica de "a
-- migration rodou e nada mudou".
--
-- Reverter: rodar este mesmo INSERT com os valores antigos (40 / 14 / 12 / 8).
-- Nada além da config muda; não há DDL.
-- ============================================================================

INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('capacidade_leads_ativos_por_corretor', '65',
   'Teto da carteira ativa de um corretor (Fila Unica / Reserva) e 100% da capacidade na Tela Time. 40 -> 65 em 13/09/2026 por decisao do dono.')
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao;

INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('carteira_ativa',
   '{"cap_conversa": 23, "cap_sla": 20, "cap_resgate": 13,
     "conversa_dias": 7, "sla_horas": 72,
     "devolver_sem_movimento_dias": 30, "devolver_sem_proximo_passo_dias": 2}',
   'Carteira ativa (Fila Unica, Fatia 3): caps por faixa e gatilhos de devolucao. Caps escalados com o teto 40 -> 65 em 13/09/2026. O TETO fica em capacidade_leads_ativos_por_corretor — uma chave so para o mesmo numero.')
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao;

-- Sanidade: o teto precisa caber os caps + alguma folga para o fundo do funil.
-- Se um ajuste futuro deixar os caps somando mais que o teto, a faixa mais
-- baixa (SLA) nunca encheria e o corretor pararia de receber lead novo sem
-- motivo visível — falha silenciosa, a pior espécie.
DO $$
DECLARE
  _teto int := (public.gestao_config_valor('capacidade_leads_ativos_por_corretor'))::int;
  _cfg jsonb := public.gestao_config_valor('carteira_ativa');
  _soma int := (_cfg ->> 'cap_conversa')::int
             + (_cfg ->> 'cap_sla')::int
             + (_cfg ->> 'cap_resgate')::int;
BEGIN
  IF _teto IS NULL OR _soma IS NULL THEN
    RAISE EXCEPTION 'carteira ativa: teto ou caps ausentes em gestao_config';
  END IF;
  IF _soma > _teto THEN
    RAISE EXCEPTION 'carteira ativa: caps somam % e o teto e % — o fundo do funil ficaria sem folga',
      _soma, _teto;
  END IF;
END $$;
