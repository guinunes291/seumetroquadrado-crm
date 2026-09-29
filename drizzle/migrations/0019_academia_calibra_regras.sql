-- ===========================================================================
-- ACADEMIA SMQ · calibração das regras de recomendação
-- Decisão do dono em 29/09/2026, a partir da conferência do motor rodada em
-- produção no mesmo dia (7 indicadores ativos, dados reais):
--
--   R05 carteira parada   mediana 80,8%. 1,5x passa de 100%: nunca dispara.
--   R06 sem próximo passo mediana 99,1%. 1,5x passa de 100%: nunca dispara.
--       As duas saem das recomendações e ficam como número de time.
--   R02 agendamento       mediana 0,0% em 30 dias. 0,7x zero nunca dispara.
--       Janela de 90 dias, como a Fatia 0 já propunha.
--   R08 perda por perfil  mediana 0,0%. 1,5x zero disparava com uma única
--       perda. Passa a exigir 10 pontos percentuais acima da mediana.
--
-- Só muda dados de academia_regras_recomendacao. Idempotente: os valores são
-- fixos, rodar de novo não muda nada. Tudo segue em modo sombra.
-- ===========================================================================

UPDATE public.academia_regras_recomendacao
   SET janela_dias = 90,
       observacao  = 'Leads que PASSARAM POR agendado / leads atribuídos na janela (bool_or no histórico, não último status). Só lead novo; fica de fora quem já chega agendado. Calibração de 29/09/2026 (decisão do dono): janela de 30 para 90 dias. Com 30 dias a mediana da empresa foi 0,0% (10 corretores, 318 leads), e 0,7x zero nunca dispara. A Fatia 0 já propunha 90 dias.'
 WHERE codigo = 'R02';

UPDATE public.academia_regras_recomendacao
   SET ativa      = false,
       observacao = 'Régua da CARTEIRA ATIVA (decisão do dono, 28/09/2026), a mesma da devolução: lead no TOPO do funil conta como parado com 7 dias sem interação; lead no FUNDO, com 30. Escrita em lote (importação ou migração) fica de fora. Fatia 0: 69% da carteira parada, mediana 82%, máximo 100%. Calibração de 29/09/2026 (decisão do dono): DESLIGADA como regra individual. Em produção a mediana foi 80,8% (25 corretores); 1,5x passa de 100% e a regra nunca dispara. Fica como número de time, fora das recomendações.'
 WHERE codigo = 'R05';

UPDATE public.academia_regras_recomendacao
   SET ativa      = false,
       observacao = 'Leads ativos da carteira sem tarefa ou follow-up futuro (public.lead_sem_proximo_passo). Fatia 0: 94% sem próximo passo, mediana 98%. Calibração de 29/09/2026 (decisão do dono): DESLIGADA como regra individual. Em produção a mediana foi 99,1% (25 corretores); 1,5x passa de 100% e a regra nunca dispara. Fica como número de time, fora das recomendações.'
 WHERE codigo = 'R06';

UPDATE public.academia_regras_recomendacao
   SET diferenca_minima = 10,
       observacao       = 'Perdas com motivo credito_renda, estourou_teto, sem_perfil ou credito_score (decisão do dono, 28/09/2026; ja_possui_imovel fica de FORA) / leads que AVANÇARAM na janela. Avançar = passou por agendado. Só lead novo. Fatia 0: 2.174 perdas em 30 dias, 1.975 pelo próprio corretor, sem_perfil = 49% delas; o volume é limpeza de estoque. Calibração de 29/09/2026 (decisão do dono): exige 10 pontos percentuais acima da mediana. Em produção a mediana foi 0,0% (13 corretores, 42 leads), e 1,5x zero disparava com uma única perda.'
 WHERE codigo = 'R08';

NOTIFY pgrst, 'reload schema';
