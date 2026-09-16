# DOCUMENTO 1 — Diagnóstico completo do CRM SMQ

Auditoria de 16/09/2026. Base: código em produção + leitura direta do banco via MCP do CRM.

---

## 1. O veredito em uma frase

**O CRM não é o problema. O CRM é bom demais para o uso que se faz dele.**

A SMQ construiu um sistema operacional de vendas completo — fila inteligente com sete
baldes de prioridade, régua de 13 toques configurável, score de prioridade 0–100,
carteira ativa com teto e devolução, cálculo reverso de meta, funil com metas por
passagem, higiene de funil, bolsão, SDR, discador integrado. E então a operação
**parou de alimentar o sistema com os fatos**. Sem os fatos, toda essa inteligência
roda no vazio: ordena uma fila com dados que não existem.

Não é um diagnóstico de "falta funcionalidade". É um diagnóstico de **circuito aberto**.

---

## 2. O quadro real, medido

### 2.1 O funil hoje **[MEDIDO 16/09/2026]**

| Etapa                   |  Leads | % da base | Leitura                                       |
| ----------------------- | -----: | --------: | --------------------------------------------- |
| `aguardando_atendimento` | 48.049 | **82,6%** | distribuídos e sem primeiro contato           |
| `em_atendimento`        |  6.460 |     11,1% | rótulo, não estado (ver §3.3)                 |
| `perdido`               |  2.104 |      3,6% | só 3,6% — a operação não fecha ciclo          |
| `aguardando_retorno`    |    666 |      1,1% |                                               |
| `(outros)` (legados)    |    598 |      1,0% | `descartado`, `ganho`, `proposta`, `vendido`, `visita_agendada` |
| `analise_credito`       |    140 |      0,2% | a etapa que converte 39,1%                    |
| `agendado`              |     74 |      0,1% |                                               |
| `visita_realizada`      |     38 |     0,07% |                                               |
| `novo`                  |     15 |     0,03% |                                               |
| **Total**               | **58.144** |         |                                               |

Temperatura: **frio 47.961 · morno 9.036 · quente 1.081**.

Um funil saudável de MCMV tem forma de funil. Este tem forma de **balde furado com um
canudo na saída**: 48 mil leads empilhados numa etapa e 252 leads (agendado + visita +
análise) no fundo inteiro. A razão fundo/topo é de **1 para 190**.

### 2.2 A atividade registrada **[MEDIDO]**

| Janela                          | Novos leads | Agendamentos criados | Tarefas concluídas | Vendas |
| ------------------------------- | ----------: | -------------------: | -----------------: | -----: |
| 01–16/09/2026                   |         423 |                **0** |              **0** |  **0** |
| 18/06–16/09/2026 (90 dias)      |      26.194 |                **0** |              **0** |  **0** |

Isto não é falha do medidor. Conferi lead a lead:

> **Lead `754d75ae…` — ANTONIO ANDSON ARAUJO NASCIMENTO.** Status `analise_credito`,
> temperatura `quente`, corretor Kauan, projeto ELEVE SAUDE, **9 documentos na pasta**
> (3 recebidos, 6 pendentes). `interacoes: []` · `tarefas: []` · `agendamentos: []`.
>
> **Lead `e8b16635…` — Larissa Fonseca.** Criado 16/09 às 13:10, status `agendado` às
> 13:20 — **dez minutos** do nascimento à visita marcada. `agendamentos: []`.
> Sem renda, sem faixa MCMV, sem FGTS, sem `visita_data`.

Um lead está em `analise_credito` com a pasta aberta e **nenhuma conversa registrada**.
Outro está `agendado` e **não existe agendamento**. O status avança; o fato não é escrito.

A consequência técnica é grave e vale nomear: `leads.ultima_interacao` está sendo
carimbado por `transicionar_lead` a cada mudança de status (limitação já registrada em
`docs/ops/higiene-diagnostico-2026-09.md` §2.2). Ou seja — **o relógio de "dias sem
movimento", que ordena a Fila Única inteira, é zerado por um clique de etapa sem que
ninguém tenha falado com o cliente.** O sistema acha que o lead foi tocado. Não foi.

### 2.3 Os leads órfãos **[MEDIDO]**

Negociações em etapa de tratativa (`em_atendimento`, `agendado`, `visita_realizada`,
`analise_credito`, `aguardando_retorno`) paradas há 5+ dias:

| Dono                     |  Leads | % do total |
| ------------------------ | -----: | ---------: |
| **(sem corretor)**       | **5.886** | **89,4%** |
| Jefferson Luiz           |    127 |            |
| Ana Caroline Pereira     |    106 |            |
| Leticia Brandão          |    102 |            |
| graziele gomes de jesus  |     98 |            |
| Leonardo vrena           |     46 |            |
| demais 31 corretores     |    221 |            |
| **Total**                | **6.586** |         |

**Este é o achado mais caro do estudo.** Quase 6 mil clientes estão no meio do funil —
alguns em `em_atendimento` há **90 dias** — sem nenhum corretor responsável. Eles não
aparecem na fila de ninguém, não entram na régua de ninguém, não geram tarefa para
ninguém. Estão tecnicamente vivos e comercialmente mortos.

A amostra mostra a assinatura do problema: dezenas de leads com `updated_at` idêntico
(`2026-09-14T20:23:51.404264`), `ultima_interacao` de 17/06 e `proximo_followup` de
18/06 — vencido há 90 dias. É um lote que perdeu o dono de uma vez.

### 2.4 O estoque parado **[MEDIDO 11–12/09/2026, diagnóstico da casa]**

- 55.435 leads vivos · **32.627 parados** há 5+ dias (58,9%)
- 12.995 leads importados em lote em 26/07/2026, atribuídos a 2 corretores
- `analise_credito` **converte 39,1%** para contrato fechado — a passagem mais saudável
  do funil — e estava **92,5% parada**
- passagem `em_atendimento → agendado`: **7%** na safra de 30 dias, contra **[META CASA]
  70%**

### 2.5 As esteiras que reenchem o balde **[MEDIDO]**

| Job                          | Cron           | Efeito                                            | Vazão      |
| ---------------------------- | -------------- | ------------------------------------------------- | ---------: |
| `distribuir-estoque-plantao` | `*/10 * * * *` | `aguardando_corretor` → `aguardando_atendimento`  | **4.320/dia** |
| `sdr-alimentar-perdidos`     | `0 11 * * *`   | recicla `perdido` → base do SDR                   |    100/dia |
| `distribuicao-auto`          | `*/5 * * * *`  | redistribuição por SLA                            |          — |

Entre 12/09 (33.011 em `aguardando_atendimento`) e 16/09 (**48.049**) a etapa cresceu
**+15.038 em quatro dias** — enquanto só **423 leads novos** entraram no mês inteiro.
O crescimento **não é de mídia**: é a esteira de plantão despejando o estoque de julho
na mesa dos corretores a 4.320 por dia.

Isso tem um nome: **a operação está afogando o próprio time**. Um corretor que abre o
CRM e vê 48 mil leads "aguardando atendimento" não prioriza — ele desiste. É exatamente
o comportamento que produz os 89,4% de órfãos do §2.3.

---

## 3. O que o CRM faz muito bem (e está subutilizado)

### 3.1 A Fila Única (`/fila`) — o gerente comercial digital já existe

O pedido do estudo era: *"o CRM deve dizer ao corretor o que ele precisa fazer"*.
Isso está pronto desde 12/09/2026. `src/features/fila-unica/derive.ts` funde três
fontes (inbox de atendimento, régua de follow-up, guardrail `leads_sem_acao`),
deduplica — **um lead, um balde** — e ordena em sete baldes:

| # | Balde     | Rótulo na tela             | Por que existe                                         |
| - | --------- | -------------------------- | ------------------------------------------------------ |
| 1 | `fundo`   | Fundo do funil parado      | agendado/visita/análise parados — converte 39%          |
| 2 | `sla`     | Chegaram agora             | SLA do 1º contato correndo                             |
| 3 | `responder` | Cliente respondeu e espera | o cliente falou por último                            |
| 4 | `followup` | Follow-up vencido ou de hoje | você combinou de voltar                              |
| 5 | `sem_acao` | Sem próximo passo          | nenhuma tarefa, agendamento ou follow-up aberto         |
| 6 | `esfriando` | Esfriando                 | quente/morno sem contato há 3+ dias                     |
| 7 | `docs`    | Pasta travada              | documento pendente ou reprovado                         |

A tese que ordena tudo está escrita no código: *"um lead em análise parado há 66 dias
vale mais do que 200 leads frios novos"*. **Está certo.** E mais: a fila já traz
**desfecho de um toque** (`desfecho.ts`) — 3 a 5 respostas por situação, cada uma
gravando interação + objeção + próximo passo com data + etapa, com desfazer de 5s.

**Esta é a peça central do método.** Ela resolve, sozinha, o problema do registro — se
o corretor for obrigado a usá-la.

### 3.2 A régua de 13 toques (`/follow-up`)

`src/lib/regua-followup.ts`. A operação mediu que o cliente responde por volta da 13ª
tentativa e transformou isso em processo. Cadência por temperatura, em dias:

| Temperatura | Gaps entre toques (1→13)                  | Duração total |
| ----------- | ----------------------------------------- | ------------: |
| quente      | 0,1,1,2,2,3,3,4,5,5,7,7,10                |       ~50 dias |
| morno       | 0,2,2,3,3,4,5,5,7,7,10,10,14              |       ~72 dias |
| frio        | 0,3,4,5,7,7,10,10,14,14,21,21,30          |      ~146 dias |

Toques **3, 7 e 11 são por ligação** (discador 3C Plus); os demais por WhatsApp.
Etapas de fundo (`agendado`, `visita_realizada`, `analise_credito`) têm
multiplicador **0,5** — o ritmo dobra onde o dinheiro está. Esgotou 13 sem resposta →
**decisão humana**, nunca auto-perdido.

O texto de cada toque vem da biblioteca de Templates pela convenção de nome
(`"Régua 3 — morno"`), com fallback G.P.V.A. embutido calibrado por fase
(abertura / consultiva / encerramento).

**Falha crítica de configuração encontrada:** `devolucaoAtiva: false`. A devolução
automática por SLA de follow-up (3 dias) **está desligada**. É por isso que os 5.886
órfãos ficam órfãos — nada os devolve ao bolsão para redistribuição.

### 3.3 O Score de prioridade (`src/lib/priority.ts`)

Score 0–100 que responde "quem atender primeiro":

| Fator              | Peso                                                       |
| ------------------ | ---------------------------------------------------------- |
| Temperatura        | quente +35 · morno +15                                     |
| Etapa              | análise 25 · visita 22 · agendado 16 · em atend. 12 · qualif. 11 · aguard. retorno 10 · aguard. atend. 6 |
| SLA                | estourado +20 · atenção +10                                |
| Tempo parado       | sem contato registrado +12 · dias × 4 (teto 20)            |

Tier: **alta ≥60 · média ≥35 · baixa <35**. Os pesos de etapa são espelhados na tabela
SQL `higiene_regra_fase` e um teste de CI quebra se divergirem — engenharia de primeira
linha.

**Mas:** o score depende de `temperatura`, que é **derivada** — `recalcular_temperatura_leads`
roda a cada 10 min e define `quente` como *estar* em agendado/visita/análise **ou** ter
interação nas últimas 24h. Sem interações registradas (§2.2), sobra só o critério de
etapa. É por isso que há **47.961 leads frios** e apenas 1.081 quentes: a base inteira é
fria por construção, não por comportamento do cliente.

### 3.4 A carteira ativa de 65 (`/reserva`)

Modelo de três níveis, desenhado em `docs/ops/carteira-ativa-40-fatia3.md`:

```
Carteira ativa (65, com dono, trabalho diário)
   └─ Reserva (com dono, esperando vaga)
        └─ Bolsão (SEM dono — discador e SDR)
```

Faixas que enchem as vagas, nesta ordem de precedência: **fundo do funil** (nunca sai)
→ **resgatados por você** (cap 13) → **conversa viva** → **chegaram agora**.

A frase do placar é um pequeno primor de gestão de gente: quem estourou o teto por ter
muito negócio avançado **não leva bronca** — *"Você não recebe lead novo até desovar —
nenhum negócio avançado foi devolvido."*

### 3.5 O cálculo reverso de meta (`metas-dia.ts`)

Já existe e é sofisticado: a RPC `metas_dia_taxas` traz as taxas **do próprio corretor**
(se tiver ≥20 contatos na janela) ou **do time** como fallback, e `contatosNecessarios()`
calcula quantos contatos hoje para bater cada meta. Há **checkpoints às 12h, 15h e 17h**
comparando o realizado com o ritmo esperado da jornada 9h–18h.

As metas declaradas são três: **agendamentos do dia**, **documentações do dia**,
**vendas da semana**.

### 3.6 O resto do mapa

Módulos completos e no ar: **Prospecção** (Modo Foco, Oferta Ativa, Discador 3C Plus),
**Gestão de Carteira** (Base, Kanban, Agenda, Tarefas), **Modo Visita** (rota, briefing,
resultado, no-show), **Pré-venda SDR**, **Documentação & Projetos**, **Assinaturas &
Comissões**, **BI** (Meu Raio-X, Desempenho/Ranking, Painel do Gestor, Higiene do Funil),
**Inteligência** (coorte real), **Sami** (copiloto IA), **Blitz**, **Copa/Conquistas**
(gamificação), **Match**, **Vitrine**, **Duplicatas**, **Lixeira**.

Detalhe no [Documento 2](02-mapa-funcionalidades.md).

---

## 4. Os 8 problemas críticos, em ordem de dinheiro perdido

### 🔴 P1 — O registro não acontece (a causa-raiz de tudo)

**Problema.** `interacoes`, `tarefas` e `agendamentos` estão praticamente vazias.
**Consequência.** Sete dos sete baldes da Fila Única ficam cegos: `responder` depende de
interação de entrada; `followup` depende de tarefa; `sem_acao` marca todo mundo;
`esfriando` usa um relógio falseado por `transicionar_lead`. A régua não conta toque.
O score não sabe temperatura. O cálculo reverso não tem taxa. **O gerente comercial
digital existe e está de olhos vendados.**
**Correção.** Desfecho de um toque obrigatório (ver §5).

### 🔴 P2 — 5.886 leads em tratativa sem corretor

**Problema.** 89,4% das negociações paradas 5+ dias não têm dono.
**Consequência.** Dinheiro no meio do funil que não está na fila de ninguém.
**Correção.** Rotina de re-adoção imediata (ver [Doc 10](10-melhorias.md) M1).

### 🔴 P3 — A esteira de plantão afoga o time

**Problema.** 4.320 leads/dia de `aguardando_corretor` → `aguardando_atendimento`.
**Consequência.** 48.049 leads numa etapa. Paralisia por excesso de opção — que é
exatamente o que a carteira ativa de 65 foi criada para evitar, e ela não está freando.
**Correção.** Respeitar o teto na distribuição, não só na tela.

### 🔴 P4 — A devolução automática está desligada

**Problema.** `devolucaoAtiva: false` na régua; `modelo_v2_ativo` (política de
distribuição v2, com posse 7/30 dias e teto disjuntor de 30) **nasce desligada**.
**Consequência.** Nada recicla lead abandonado. P2 é filho direto disto.
**Correção.** Ligar em piloto com 3 corretores por 2 semanas.

### 🟠 P5 — O fundo do funil está vazio e parado ao mesmo tempo

**Problema.** 252 leads no fundo inteiro; a etapa que converte 39,1% estava 92,5% parada.
**Consequência.** A passagem `em_atendimento → agendado` a 7% contra meta de 70% é o
gargalo #1. Ver [Doc 8](08-indicadores.md) §4 para o custo em leads.

### 🟠 P6 — "Perdido" não é usado

**Problema.** Só 3,6% da base é `perdido`, com 11 categorias de motivo disponíveis.
**Consequência.** Sem motivo de perda não há diagnóstico de mídia, de produto nem de
crédito. E lead que deveria estar morto continua ocupando fila.

### 🟠 P7 — Status legados poluem o funil

**Problema.** 598 leads em `descartado`, `ganho`, `proposta`, `vendido`,
`visita_agendada` — status fora de `LEAD_STATUS_ORDER`.
**Consequência.** Leads invisíveis no Kanban e no funil.

### 🟡 P8 — A qualificação não é preenchida

**Problema.** Nos leads amostrados: `renda_informada`, `faixa_mcmv`, `tipo_renda`,
`tem_fgts`, `resumo_qualificacao` todos nulos — inclusive num lead em `analise_credito`.
**Consequência.** Sem faixa MCMV não há match de produto, não há simulação, e a análise
de crédito entra na Caixa às cegas.

---

## 5. A intervenção de maior alavanca

Se a SMQ fizer **uma só coisa** deste estudo, que seja esta:

> **Tornar o desfecho de um toque da Fila Única a única forma de encerrar um
> atendimento — e medir diariamente quantos desfechos cada corretor registrou.**

Por quê essa e não outra:

1. **É um clique.** O `fila-desfecho.tsx` já oferece 3 a 5 respostas prontas por
   situação. Não é digitação, é escolha.
2. **Grava tudo de uma vez.** Interação + objeção + tarefa do próximo passo com data +
   transição de etapa. Um toque fecha o circuito inteiro.
3. **Acende o sistema todo.** Com interação gravada: a temperatura volta a ser
   comportamento; o balde `responder` funciona; a régua conta toque; `sem_acao` esvazia;
   o relógio de dias parado passa a medir contato de verdade; o cálculo reverso ganha
   taxa própria do corretor.
4. **Já tem desfazer.** 5 segundos, modo compensate. O corretor não tem medo de errar.
5. **Custo de implantação: zero linha de código.** É decisão de gestão e treino.

O indicador que mede isso é simples e é o único indicador de atividade que realmente
importa: **desfechos registrados por corretor por dia**. Ver
[Documento 8](08-indicadores.md).

---

## 6. Respostas às 10 perguntas da Etapa 2, por funcionalidade

Tabela-resumo; o detalhe por funcionalidade está no [Documento 2](02-mapa-funcionalidades.md).

| Funcionalidade      | Problema comercial que resolve            | Frequência   | Erro mais comum                              | Indicador afetado          |
| ------------------- | ----------------------------------------- | ------------ | -------------------------------------------- | -------------------------- |
| Fila Única          | "quem eu chamo agora?"                    | contínua     | usar a Base de leads em vez dela             | todos                      |
| Desfecho de 1 toque | registro sem fricção                      | a cada toque | **não usar** — é o P1                        | todos                      |
| Régua de follow-up  | esquecimento de cliente                   | diária       | dar o toque e não registrar                  | taxa de contato, resposta  |
| Score de prioridade | ordem de atendimento                      | automático   | ignorar a ordem e escolher pelo nome         | tempo até 1º atendimento   |
| Carteira ativa 65   | excesso de leads = paralisia              | diária       | acumular sem desovar                         | carteira ativa, vagas      |
| Reserva             | recuperar o que saiu da carteira          | semanal      | esquecer que existe                          | resgates                   |
| Bolsão              | base sem dono para prospecção             | ociosidade   | discar sem puxar o lead                      | leads trabalhados          |
| Agendamentos        | comparecimento em visita                  | por visita   | **mover para `agendado` sem criar o agendamento** | comparecimento        |
| Tarefas             | próximo passo com data                    | por toque    | próximo passo sem data                       | sem próximo passo          |
| Documentação        | pasta na Caixa                            | por análise  | pasta parada sem cobrança                    | pasta travada              |
| Motivo de perda     | diagnóstico de mídia/produto/crédito      | por perda    | marcar perdido sem motivo (ou não marcar)    | taxa de perda por motivo   |
| Metas do dia        | ritmo para bater a semana                 | diária 1x    | declarar meta e não olhar os checkpoints     | ritmo, projeção            |
| Modo Visita         | conduzir a visita e registrar o resultado | por visita   | não registrar no-show                        | comparecimento             |
| Higiene do Funil    | achar lead abandonado                     | semanal      | tela só da gestão — corretor não vê          | leads parados              |
| Discador 3C Plus    | volume de tentativas                      | blocos       | discar sem tabular                           | tentativas, contato        |
| Sami (copiloto)     | resumo e registro por voz                 | contínua     | não confirmar a proposta da Sami             | registro                   |

---

## 7. O que este diagnóstico NÃO conseguiu apurar

Honestidade sobre os limites:

- **Vendas.** A RPC de KPIs devolve `vendas: 0` em 90 dias, e a política de distribuição
  v1 já registrava (08/2026) *"zero vendas registradas no mês e 27 de 80 sem corretor
  identificado"*. Não sei se a SMQ vendeu zero ou se o registro de venda está quebrado —
  **as duas hipóteses são graves e precisam ser separadas antes de qualquer meta**.
- **Tempo até o primeiro atendimento.** Sem interações, a mediana não é calculável.
- **Comparecimento em visita.** Sem agendamentos, não é calculável.
- **Conversão real por origem de lead.** Sem desfecho, não é atribuível.

Estes quatro buracos são o motivo de o [Documento 8](08-indicadores.md) usar as metas
declaradas da casa como base, e não uma média histórica.
