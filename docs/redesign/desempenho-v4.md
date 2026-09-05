# Desempenho v4 — redesign do hub /ranking (registro)

> Quarta rodada de design, restrita ao hub de Desempenho. Pedido do dono
> (2026-09-05): "deixar a tela com mais cara da empresa", garantir que tudo
> funcione e seja calculado corretamente, apagar a aba Competição (a Copa
> encerrou) e dar o mesmo redesign à aba Produtividade ajustando os cálculos
> das pontuações. Executado na branch `claude/ranking-page-redesign-0ev22r`.

## O que mudou na tela

| Antes                                                                                           | Depois                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Página escura forçada (`dark -m-6`), paleta cyan/roxo/esmeralda de template, "AO VIVO" vermelho | Segue o tema do CRM (claro por padrão); faixa de marca navy com logo, "Seu Metro Quadrado" em Sora, "Ao vivo" dourado, relógio; **Modo TV** opcional (tela cheia, subárvore escura sobre o gradiente navy, letreiro de vendas, rotação automática) |
| Abas Ranking · Competição · Conquistas                                                          | Ranking · Conquistas (a Copa saiu; `/copa` e `?tab=competicao` caem no ranking)                                                                                                                                                                    |
| 1.810 linhas num arquivo de rota, KPICard/Gauge/useCountUp próprios                             | `features/ranking/`: lógica pura (`ranking-derive.ts`), consultas (`use-ranking-data.ts`), peças visuais (`ranking-ui.tsx`) e três visões; reusa StatTile, Podium, Medal, DataTable, EmptyState, AnimatedNumber, celebração global                 |
| Real x Meta: barra + gauge + KPIs + top vendedores + barras por corretor                        | Mesma estrutura, com anel/barra dourados (verde ao bater), projeção por dia útil, comparação com o mesmo período do mês anterior, meta de VGV cadastrada, todos os corretores com meta                                                             |
| Vendas: KPIs + pódio VGV + ranking + funil + VGV por corretor                                   | Idem, com ticket médio, "corretores que venderam", funil com taxa etapa a etapa e tabela com participação no VGV                                                                                                                                   |
| Produtividade: KPIs + pódio + ranking + tabela (pesos invisíveis)                               | **Como pontua** (pesos vivos da configuração), composição da pontuação por corretor (quantidade × peso), empate divide a posição, aviso quando o total oficial e a decomposição divergem (leitura desatualizada ou histórico não recalculado)      |

Todos os números passam por `ranking-derive.ts` (testes unitários em
`tests/ranking-derive.test.ts`); as visões têm smoke com dados fictícios
(`tests/ranking-views.test.tsx`) e o painel tem teste de comportamento
(`tests/ranking-page.test.tsx`: celebração, erro transitório, letreiro).

## Correções de cálculo (front)

| Problema                                                                                                                | Correção                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meta do time somava linhas de corretor **e** de equipe/global (dupla contagem) e metas de toda a empresa para um gestor | `agregarMetas`: soma das metas individuais dos corretores do escopo (regra do Metas & Ritmo); cai para equipe e depois global                                                                                                |
| Meta de VGV por corretor era meta de vendas × ticket médio, ignorando `meta_gmv`                                        | `metaVgvCorretor`: usa `meta_gmv`; o proxy pelo ticket só sem meta cadastrada, e rotulado                                                                                                                                    |
| "vs. mês anterior" comparava 5 dias do mês com o mês anterior inteiro                                                   | `janelaMesAnteriorComparavel`: até o mesmo dia do mês anterior quando o mês é o corrente                                                                                                                                     |
| Tendência por dias corridos; empates ignorados; setas de posição ao trocar o filtro                                     | Projeção por dia útil com o calendário do pacing (`gestao_config_valor('pacing')`); dense rank; setas só entre leituras do mesmo período                                                                                     |
| Banner travava em 105%, gauge em 100%, falsa precisão (`useCountUp` inteiro)                                            | Percentual real no texto, barra grampeada só na largura, `AnimatedNumber`                                                                                                                                                    |
| "Hoje" no fuso do aparelho; TV ligada de um dia para o outro consultava ontem                                           | `agoraSaoPaulo()` em `lib/periodo.ts` (usado também na home) e `useHojeSaoPaulo` virando o dia                                                                                                                               |
| "Últimos 2 anos" dava 731 dias com 29/02 no meio e o RPC rejeitava                                                      | Preset grampeado em 730 dias corridos                                                                                                                                                                                        |
| Erro em metas/perfis virava "meta não definida" com zeros                                                               | As consultas de dados lançam erro e a página mostra o estado de erro com "tentar novamente"; falha em fotos/pesos vira aviso discreto sem derrubar os números; só o calendário do pacing cai no padrão (seg–sáb) em silêncio |
| Ticker do rodapé falava de outro período; celebração ao abrir mês passado                                               | Ticker segue a visão aberta; celebração só na virada <100% → ≥100% vista ao vivo no mês corrente                                                                                                                             |
| Anos fixos [2026, 2025, 2024]; meses futuros selecionáveis                                                              | Últimos 24 meses a partir do hoje de SP                                                                                                                                                                                      |
| "Registrar visita" sem agendamento criava agendamento real e rendia 100 pts de agenda                                   | Registro nasce `auto_gerado` (conta como visita, nunca como agendamento criado)                                                                                                                                              |

## Correções de cálculo (banco)

`20260905120000_pontuacao_recalculo_config.sql` — mudar um peso em
`configuracao_pontuacao` recalcula `pontuacao_total` de todo o histórico
(trigger por comando); antes, o passado ficava com a régua antiga e nenhuma
tela conseguia explicar o total.

`20260905130000_pontuacao_simetria_eventos.sql` — uma régua por evento,
compartilhada por triggers e reconciliação (`pont_*_conta`):

| Contador     | Antes                                                                                                                 | Agora                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| visita       | só `UPDATE` de status; a visita sintética (lead arrastado) nascia `realizado` e não pontuava; apagar mantinha o ponto | `INSERT`/`UPDATE`/`DELETE`: visita 'realizado' ativa, no dia da visita, sintética ou não               |
| agendamento  | qualquer tipo pontuava; cancelar/apagar não estornava                                                                 | só visita/reunião criada pelo corretor (não auto, não SDR); cancelar/apagar estorna, restaurar devolve |
| documentação | cada reentrada em análise somava                                                                                      | primeira entrada do lead em `analise_credito` no mês (a régua dos Relatórios)                          |
| ligação      | eco do PABX + "Registrar resultado" = 2 ligações; apagar mantinha                                                     | registro manual até 30 min após o eco (mesmo lead/autor) é a mesma chamada; apagar estorna             |

Três decisões de semântica que a revisão adversarial forçou a explicitar:

- **Meses fechados são congelados** (`pont_dia_editavel`): triggers e
  reconciliação só mexem no mês corrente e no anterior. A purga semanal da
  lixeira (que apaga em cascata interações/agendamentos de leads com 90+ dias)
  e correções tardias não reescrevem posições antigas; vendas/VGV (ledger de
  aprovação) ficam fora dessa regra.
- **A duplicata da ligação é decidida na inserção** e gravada na própria linha
  (`metadata.pontuacao_ignorada`): apagar o eco depois não "reativa" o registro
  manual, e trigger e reconciliação lêem o mesmo carimbo.
- **Trocar o dono move o ponto** (reatribuição de agendamento/interação, comum
  em transferir_leads e na roleta do SDR).
- **Documentação é decidida por lead e mês** num trigger por comando (INSERT e
  DELETE): o ponto é de quem fez a 1ª entrada em analise_credito no mês;
  apagar o lead em definitivo estorna, apagar só a 1ª transição recredita a
  próxima, uma transição retroativa move o ponto — sempre o mesmo resultado
  da reconciliação.

`reconciliar_atividades_diarias(_desde)` recompõe os quatro contadores a partir
das tabelas-fonte (janela editável por padrão) e rodou uma vez na migration
desde 2026-06-16, depois de guardar um snapshot em
`metrics.atividades_diarias_snapshot_20260905`. **O histórico de pontos desde
junho muda** — é o custo de trigger e reconciliação passarem a responder com a
mesma régua (a da pontuação, descrita acima). O cron de conquistas pode
conceder medalhas com os totais novos.

A migration foi feita para rodar com o sistema vivo: os triggers são trocados
com `CREATE OR REPLACE TRIGGER` (ShareRowExclusive, nunca bloqueia leitura) em
vez de `DROP` + `CREATE` (AccessExclusive, que causou deadlock com o discador
na primeira tentativa em produção), e `lock_timeout` de 10 s faz a transação
falhar inteira e limpa, para repetir, em vez de enfileirar o app atrás dela.

`ranking_periodo_v2`: contas com `profiles.ativo = false` saem do escopo (mesma
régua de `gestao_pacing`); "leads recebidos" passa a contar pela data de
distribuição — a régua da Inteligência (`metrics.performance_corretor_mensal`),
não a do dashboard (ver pendências).

Testes de banco: `tests/db/pontuacao-config.test.ts` (7),
`tests/db/pontuacao-eventos.test.ts` (22) e, em
`tests/db/kpis-consistencia.test.ts`, a garantia de que vendas, VGV, pontos e
atividades somados de `ranking_periodo_v2` batem com `metricas_periodo_v2`
(dashboard) para a mesma população e janela.

## Pendências apontadas pela auditoria e deixadas de fora (fora do hub)

- População de corretores difere entre home (`atividades_diarias` cru), ranking
  (corretor/gestor/admin) e Metas & Ritmo (só corretor): pede uma função de
  escopo única no banco.
- `metas.tsx` (aba Metas) data vendas por `aprovado_em`; o resto por
  `data_assinatura`.
- `gestao_pacing` usa `current_date` (UTC) para "dias úteis passados".
- Relatórios (`period-filter.tsx`) e Desempenho têm "Últimos 30 dias" com 31 e 30 dias.
- Conquistas anunciam "+N pts bônus" que nenhum total soma.
- O RPC devolve no máximo 50 corretores; a tela avisa quando bate no teto, mas os
  totais continuam somando só esses 50 (hoje a operação tem ~21).
- As tabelas `copa_*` e as RPCs da Copa continuam no banco (só a UI saiu).
- **Régua de atividades por tela.** Com o mesmo rótulo, cada tela conta
  diferente: a pontuação conta agendamentos só de visita/reunião (sem
  cancelados, sem os criados pelo SDR, sem sintéticos), ligações com a dedup do
  discador e documentações pela 1ª entrada do lead no mês;
  `metrics.performance_corretor_mensal` (Inteligência, `gestao_pacing`) conta
  todo agendamento criado e leads distintos em análise; `metas_dia_taxas`
  (Metas do dia) conta contatos de saída e toda transição para documentação.
  Unificar pede decisão de produto e uma função de contagem única no banco.
- `metricas_periodo_v2` (dashboard/Dinheiro) inclui contas com `ativo = false`
  e sem filtro de papel (um SDR ou superintendente que registre interações
  entra no dashboard e não no ranking), e conta "leads recebidos" por
  `created_at`; ranking e Inteligência excluem contas desativadas, exigem papel
  corretor/gestor/admin e contam leads por data de distribuição. O hub
  explicita a régua na dica do indicador.
