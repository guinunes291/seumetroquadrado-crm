# Política de Distribuição de Leads SMQ v1

Aprovada em 26/08/2026 pelo Guilherme (gestão SMQ), ao final do processo completo de redesenho: diagnóstico com dados reais (Fase 0), 15 decisões de política (Fase 1), escolha de cenário (Fase 2), matemática e simulação (Fase 3), dicionário de métricas (Fase 4), especificação técnica (Fase 5) e plano de rollout (Fase 6). Implementada nas migrations `20260826120000_distribuicao_v2_fundacao.sql` e `20260826121000_distribuicao_v2_motor.sql`, atrás da flag `modelo_v2_ativo` (nasce desligada).

## 1. A regra em 1 página

1. **Lead quente** (campanha, pago, novo) cai na fila da **zona** dele. Dentro da fila, **quem responde rápido recebe mais**: faixa A (mediana até 15 min) tem peso 3, faixa B (até 60 min, ou sem amostra) peso 2, faixa C (acima de 60 min) peso 1. A faixa recalcula toda segunda 08:00 com os últimos 14 dias.
2. **Lead de base** (frio, reativado, devolvido, estoque) roda em **rodízio puro para todos os aptos presentes**. É o piso: ninguém fica sem material para trabalhar.
3. **15 minutos úteis** (08:00 às 19:00) para o primeiro contato no lead quente. Estourou: o lead vai para o próximo da fila e o estouro entra na conta da sua faixa valendo 60 minutos. **Dois estouros no mesmo dia** pausam o corretor **no quente** até o dia seguinte, com volta automática. A base continua.
4. **Posse**: lead sem nenhum registro por **7 dias** volta para a casa como lead de base (**30 dias** nas etapas avançadas: qualificado, agendado, visita realizada, proposta, análise de crédito). Qualquer registro zera a contagem. A régua não é retroativa: começou a contar no go-live.
5. **Teto disjuntor**: ninguém carrega mais de **30 leads ativos**; atingiu, para de receber até dar baixa.
6. **Presença conta**: sem marcar presença no dia, sem lead (quente e base).
7. Fora do horário, fim de semana e feriado: o lead espera e abre o expediente seguinte com prioridade, com o bot segurando a conversa.
8. Tudo logado: toda atribuição registra quem estava apto, quem não estava e por quê, e quem venceu. Furo manual exige motivo escrito.

Prioridade declarada do modelo quando houver conflito: **velocidade > conversão > justiça > desenvolvimento**.

## 2. Elegibilidade

Um corretor está apto a receber quando **todas** as condições valem:

| Condição | Fonte |
|---|---|
| Perfil ativo com role de corretor | `profiles.ativo` + `user_roles` |
| Telefone cadastrado | `profiles.telefone` |
| Vínculo definido (fixo ou autônomo) | `profiles.modelo_contrato` (campo novo; NULL = cadastro pendente, inelegível) |
| Onboarding concluído | `profiles.onboarding_concluido_em` (campo novo) |
| Presença marcada no dia | `profiles.presente` + `presente_em` (botão Cheguei) |
| Não pausado na roleta | `roleta_participantes.pausado_ate` (manual ou automática) |
| Abaixo do teto de 30 leads ativos | `_wip_corretor()` contra `disjuntor_wip` |
| Dentro da cota diária da roleta | `distribution_log` (mecanismo vigente) |

Fora da roleta: docs-bot, contas administrativas, gerência e superintendência. Quem cai na régua extra do v2 aparece no contexto da decisão como `inaptos_v2`, com o motivo nomeado (`sem_modelo_contrato`, `onboarding_pendente`, `disjuntor_wip_N`).

## 3. Mecânica

**Filas**: 4 roletas de zona (Norte, Sul, Leste, Oeste) + 2 de equipe fixa (`equipe-guilherme`, `equipe-bruno`) + 1 roleta `base` universal. Campanha deixa de ser fila e vira etiqueta do lead; as 9 roletas de campanha são desativadas ao final do rollout (não antes).

**Quente** (`classe_lead = 'quente'`): resolve a fila pela precedência vigente (slug explícito, depois zona pronta, depois origem com fallback de plantão) e escolhe o corretor por **smooth weighted round-robin** com peso da faixa (3/2/1). Desempate: cursor SWRR maior, depois há mais tempo sem receber, depois id. Concorrência serializada por advisory lock por fila.

**Base** (`classe_lead = 'base'`): vai direto para a roleta `base` e escolhe por rodízio puro (há mais tempo sem receber, desempate por antiguidade na roleta), com lock `FOR UPDATE SKIP LOCKED`.

**Sem ninguém apto**: abre exceção, loga e alerta o gestor. O lead nunca some.

**Fora de horário**: o lead espera o cron e abre o expediente com prioridade (ordem de chegada).

## 4. Pesos

| Variável | Definição |
|---|---|
| t_lead | Minutos úteis (08:00 às 19:00 BRT) entre a atribuição e a primeira interação do corretor no lead |
| Devolvido por SLA | Entra na amostra valendo 60 minutos |
| V | Mediana dos t_lead na janela de 14 dias |
| n | Amostra (leads quentes com contato + devoluções na janela) |
| Faixa | n < 5: B (neutra). V até 15: A. V até 60: B. Acima: C |
| Peso | A = 3, B = 2, C = 1 |

Fluxo esperado = peso do corretor dividido pela soma dos pesos dos aptos presentes da fila. Recalcula segunda 08:00 (cron `recalc-tiers-roletas-weekly`, roteado pela flag). A faixa do corretor é a mesma em todas as filas e fica visível para ele (com o motivo), sem ranking de colegas. Todos os limiares são chaves em `distribuicao_settings`: recalibrar não exige deploy.

**Peso por venda fica travado** até o registro de venda ser confiável (em 08/2026: zero vendas registradas no mês e 27 de 80 sem corretor identificado). Quando a fonte for consertada, a evolução para 2 fatores é decisão de política nova, não patch.

## 5. SLA

| Régua | Valor | Estourou |
|---|---|---|
| 1º contato no quente | 15 minutos úteis (`sla_quente_minutos`) | Lead repassa ao próximo (mesma fila; roleta de zona repassa dentro do time da zona); estouro registrado em `sla_estouros` e vale 60 min na mediana |
| Estouros no dia | 2 (`pausa_estouros_dia`) | Pausa automática no quente até o dia seguinte (00:00 BRT), volta automática, logada como ação do sistema. A base continua |
| Repasses por lead | 2 tentativas | Escala ao gestor (mecanismo vigente) |
| Posse inicial | 7 dias sem registro | Devolve para a casa como base (máx. 10 por corretor e 50 por rodada, cron diário 09:00 BRT) |
| Posse avançada | 30 dias sem registro | Idem, para qualificado, agendado, visita realizada, proposta e análise de crédito |

Guarda de virada: o repasse por SLA só considera leads distribuídos nos últimos 7 dias; estoque antigo é assunto da regra de posse, não do repasse (evita rajada no go-live).

## 6. Exceções e governança

- Furo manual da roleta: só Guilherme e gerência, com **motivo escrito obrigatório**, logado como `manual_direta`. Relatório mensal de exceções; divergência de zona avisa e registra, não bloqueia.
- Indicação e cliente que pede corretor específico ficam fora da roleta (entram como atribuição manual com motivo).
- Lead sem fila possível abre exceção (`distribuicao_excecoes`) com alerta; a fila de exceções é revisada pela gestão.
- A política inteira é revisada por ciclo de 2 meses, junto da régua de renovação.

## 7. Métricas

**Painel semanal (decisão)**: mediana e p90 do 1º contato em hh:mm (`v_velocidade_corretor`), taxa de contato efetivo (`v_contato_efetivo`), taxa de devolução por SLA (`sla_estouros`), leads ativos contra o disjuntor (`v_wip_corretor`), leads parados contra a régua 7/30 (`v_leads_parados`). Metas iniciais: mediana até 00:15, p90 até 01:00, devolução até 10%, contato efetivo 50% provisório com calibragem em 4 semanas.

**Painel de ciclo (acompanhamento, a cada 2 meses)**: conversões lead > visita agendada > comparecida > proposta > venda, ciclo médio até a venda, concentração do top 3 (gatilho de revisão: acima de 35% por 2 semanas), custo e receita por lead distribuído. As linhas que dependem de venda ficam com carimbo de dado incompleto até o registro de venda ser consertado.

Métrica que não muda decisão nenhuma sai do dashboard.

## 8. Especificação técnica (resumo)

- **Toda a regra vive no Postgres do CRM.** O n8n entrega o lead (zona, bairro, origem, campanha como etiqueta), notifica o handoff e alimenta a esteira de base pela reativação; ele não escolhe corretor.
- Motor: `_distribuir_lead_v3` ganhou os ramos v2 atrás de `_modelo_v2_ativo()`; com a flag desligada o caminho é o vigente, linha a linha. Funções novas: `_registrar_estouro_sla`, `devolver_leads_posse_expirada`, `recalcular_faixas_velocidade`, `_apto_extra_v2`, `_wip_corretor`, `_minutos_uteis_entre`.
- Campos novos: `profiles.modelo_contrato`, `profiles.onboarding_concluido_em`, `leads.classe_lead`, `leads.ultima_atividade_em` (mantido por trigger), `roleta_participantes.faixa_amostra`. As colunas `tier`, `tier_score` e `wrr_current` existentes foram reaproveitadas (tier = faixa de velocidade no v2).
- Tabelas novas: `sla_estouros` (1 linha por corretor e lead, conta da pausa e amostra de 60 min) e `distribuicao_sombra` (validação pré-virada). Leitura via RLS de gestão; escrita só pelo motor.
- Log: cada decisão continua gravando `distribution_log` + `distribuicao_log_contexto`, agora com `classe_lead`, `inaptos_v2`, `faixa_vencedor` e `modelo_v2`. Regras novas nomeadas: `ponderado_velocidade:faixaX`, `rodizio_base`, `posse_expirada`.
- Idempotência e concorrência: `FOR UPDATE` no lead, advisory lock por fila no quente, `SKIP LOCKED` no cursor da base, estouro único por corretor e lead, dedup global por telefone vigente.
- **Feature flag e rollback**: `distribuicao_settings.modelo_v2_ativo` (default false). Rollback = 1 UPDATE; nenhuma função é dropada, nenhum dado migra. `modelo_v2_sombra` liga o modo sombra com o v2 desligado.

## 9. Plano de rollout

| Etapa | Duração | Conteúdo |
|---|---|---|
| Semana 0 | 1 semana | Saneamento: telefones faltantes, `modelo_contrato` e onboarding de todos, presença auditada. Sombra ligada (`modelo_v2_sombra = true`): `distribuicao_sombra` valida faixas e volumes com dado vivo |
| Piloto | 2 semanas | Flag ligada; acompanhamento na zona de maior volume + base para o time todo. Todos nascem faixa B; primeira faixa real na segunda do meio |
| Expansão | 2 semanas | As 4 zonas plenas. Depois disso, desativação das 9 roletas de campanha |

**Critérios de sucesso** (zona piloto contra as 4 semanas anteriores): mediana do 1º contato até 00:15 e p90 até 01:00; leads sem atendimento acima de 1h útil até 2% da safra; concentração top 3 até 35%; todo apto presente com pelo menos 1 lead por semana; zero lead sem dono por mais de 1h útil sem exceção aberta.

**Critérios de reversão** (qualquer um reverte, flag off): devolução por SLA acima de 25% por 3 dias seguidos; exceções de fila sem apto acima de 10% dos leads; contato efetivo abaixo do baseline por 2 semanas.

**Migração**: carteira viva não se mexe; régua 7/30 conta do go-live com aviso de 7 dias ao time; leads de corretores desligados e sem dono entram na esteira de base via reativação.

**Pendências fora do código** (donas da gestão): conserto do registro de vendas e do espelho de métricas operacional, ajuste do reativador no n8n para marcar `classe_lead = 'base'`, comunicado ao time (rascunho aprovado na Fase 6) e FAQ.
