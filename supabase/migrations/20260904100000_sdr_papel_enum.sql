-- Papel SDR (pré-vendas) — parte 1/3: o valor do enum.
--
-- Decisão de produto (2026-09-04, 24 respostas do Guilherme registradas em
-- docs/politica-sdr-v1.md): nasce o papel `sdr`, que esquenta leads de base
-- (importação, devolvidos, perdidos, estoque) e entrega ao corretor pela
-- roleta de agendados. SDR é papel EXCLUSIVO — nunca acumula com corretor e,
-- por isso, nunca é apto em roleta alguma (a elegibilidade exige o papel
-- corretor).
--
-- Padrão da 20260811150000 (qualificacao_corretor) e da 20260615230000
-- (superintendente): ADD VALUE precisa ser commitado antes de ser usado em
-- has_role(...) — a fiação inteira fica nas migrations seguintes, em
-- transação separada. Sem isto, o primeiro `has_role(uid, 'sdr')` quebraria
-- com "invalid input value for enum app_role" (lição da 20260629180000).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sdr';
