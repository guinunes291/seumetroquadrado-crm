-- Resultado da análise de crédito (parte 1/3): só os valores novos do enum.
--
-- O funil tinha UMA etapa (`analise_credito`) para os TRÊS estados que a
-- operação vive: em análise, aprovada e reprovada. Um negócio liberado pela
-- Caixa e um negócio morto no banco ficavam visualmente idênticos no kanban —
-- e a gestão não conseguia responder "quantos estão liberados para fechar?"
-- sem abrir lead por lead. Em MCMV, onde o negócio vive ou morre na aprovação,
-- essa é a lacuna de modelagem mais cara do sistema.
--
-- DESENHO (aprovado pelo dono): `analise_credito` PERMANECE e passa a se
-- chamar "Em análise" no front. Um lead que hoje está nele já significa
-- exatamente isso, então NENHUM dado se move e os ~43 objetos SQL que
-- dependem de 'analise_credito' seguem intactos. Só acrescentamos os dois
-- resultados possíveis.
--
-- ADD VALUE precisa ser commitado antes de ser usado: quem usa os valores
-- (transicao_lead_permitida, funil_ordem, analytics) vem nas migrations
-- seguintes, em transações separadas. Mesmo cuidado de
-- 20260619122000_funil_add_aguardando_retorno.sql.
--
-- ATENÇÃO: o Postgres não tem DROP VALUE. Uma vez aplicada, esta migration é
-- irreversível — dá para parar de usar os valores, não para removê-los.

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'analise_aprovada';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'analise_reprovada';
