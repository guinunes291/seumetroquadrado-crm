# DOCUMENTO 8 — Indicadores mínimos para 1 venda por semana

> **Objetivo:** transformar "1 corretor = 1 venda por semana" de meta em **consequência
> matemática da atividade comercial**.

> ## ⚠️ OS NÚMEROS DESTE DOCUMENTO FORAM SUBSTITUÍDOS
>
> O cálculo abaixo parte das metas declaradas da casa, porque na época eu não tinha as
> taxas reais. Agora tenho: a conversão da SMQ é **0,25% no agregado**, mas varia de
> **0,02% (importação)** a **16,2% (captação do corretor)**. A conta boa não é por
> volume de toque — é **por canal de origem**.
>
> **Use o [Documento 17 §4](17-recalibracao.md) no lugar deste cálculo.**
> O que continua valendo aqui: a estrutura do raciocínio reverso, o placar de 18
> indicadores (§5) e o Índice de Atividade Mínima (§6).

---

## 1. Aviso metodológico — leia antes dos números

O CRM **não consegue hoje** fornecer a base histórica ideal para este cálculo:

| O que falta | Por quê |
| --- | --- |
| Vendas | `vendas: 0` em 90 dias **[MEDIDO]** — ver [Diagnóstico §7](01-diagnostico.md#7) |
| Tempo até 1º atendimento | `interacoes` vazia |
| Comparecimento em visita | `agendamentos` vazia |
| Conversão por origem | sem desfecho registrado |

Portanto, **a base deste cálculo são as metas de passagem já declaradas pela própria
SMQ** (`PASSAGENS` em `src/features/fila-unica/funil-derive.ts`), com fonte documentada
para cada uma. Onde uso estimativa própria, está marcado **[HIPÓTESE]**.

**Recalibrar em 4 semanas**, quando o desfecho de um toque estiver gerando dados reais.
O CRM já faz isso sozinho: a RPC `metas_dia_taxas` passa a usar a **taxa do próprio
corretor** assim que ele tiver ≥20 contatos na janela (`MIN_CONTATOS_TAXA_PROPRIA`).

---

## 2. O cálculo reverso — cenário META

Usando as metas de passagem da casa **[META CASA]**:

```
                     1 VENDA / SEMANA
                            ▲
                            │  fechamento 30%   (coorte real mede 39,1%)
                    3,3 análises de crédito
                            ▲
                            │  pasta/proposta 75%
                    4,4 visitas realizadas
                            ▲
                            │  comparecimento 65%   (protocolo D-2/D-1/D+0)
                    6,8 agendamentos
                            ▲
                            │  agendamento 70%
                    9,8 leads em atendimento
                            ▲
                            │  vira conversa 90%
                   10,9 leads qualificados
                            ▲
                            │  qualificação 50%
                   21,7 conversas efetivas
                            ▲
                            │  1º contato efetivo 50%
                   43,4 LEADS TRABALHADOS / SEMANA
```

### A tabela, com o número diário

| Etapa | Por **semana** | Por **dia útil** | Taxa usada |
| --- | ---: | ---: | :---: |
| Leads trabalhados | **43,4** | **8,7** | — |
| Conversas efetivas | 21,7 | 4,3 | 50% |
| Leads qualificados | 10,9 | 2,2 | 50% |
| Leads em atendimento | 9,8 | 2,0 | 90% |
| **Agendamentos criados** | **6,8** | **1,4** | 70% |
| **Visitas realizadas** | **4,4** | **0,9** | 65% |
| **Análises de crédito** | **3,3** | **0,7** | 75% |
| **VENDA** | **1,0** | 0,2 | 30% |

**Fator de conversão total lead → venda: 2,30%.** Ou seja: **1 venda a cada ~43 leads
bem trabalhados.**

---

## 3. Quantas TENTATIVAS isso custa

Leads trabalhados ≠ tentativas. Aplicando a régua de 13 toques:

**Modelo [HIPÓTESE]:** dos 43,4 leads que entram por semana, ~50% respondem em média no
**4º toque**; os outros 50% consomem os 13 toques e esgotam a régua.

Em **regime permanente** — que é o que importa para o dia a dia — o cálculo correto não
é sobre a coorte, e sim sobre a carteira:

| Base | Conta | Resultado |
| --- | --- | ---: |
| Carteira ativa | teto do CRM | **65 leads** |
| Ciclo médio da régua (morno) | 13 toques em ~72 dias = 10,3 semanas | **1,26 toques/lead/semana** |
| Toques da carteira | 65 × 1,26 | **82 toques/semana** |
| Por dia útil | 82 ÷ 5 | **16,4 toques/dia** |
| + leads novos (4 tentativas no dia 1) | 8,7 × 4 | **+ ~35/dia** |
| **Total de tentativas/dia** | | **~45–50** |

**Leitura:** entre **45 e 50 tentativas de contato por dia** (WhatsApp + ligação
somados). Com o discador 3C Plus em blocos, isso é **absolutamente viável** — é cerca
de 2 horas de discagem concentrada mais o WhatsApp ao longo do dia.

---

## 4. 🔴 O custo do gargalo — por que hoje a meta é impossível

Se eu refizer a **mesma conta** trocando só uma taxa — `em_atendimento → agendado` de
**70% (meta)** para **7% (medido)**:

| Cenário | Leads/semana para 1 venda | Leads/dia |
| --- | ---: | ---: |
| **META** (agendamento 70%) | **43,4** | 8,7 |
| **REAL HOJE** (agendamento 7%) | **434** | **87** |

> **Com a taxa de agendamento atual, um corretor precisaria trabalhar 434 leads por
> semana para fechar 1 venda. Isso é 10 vezes o necessário — e é fisicamente impossível
> com uma carteira de 65.**

**Esta é a demonstração matemática de que o gargalo #1 da SMQ é a passagem
"em atendimento → agendado".** Nenhum aumento de volume de leads resolve isso. Só a
mudança de comportamento resolve: **oferecer visita em toda conversa ativa, com duas
opções de horário.**

Cada ponto percentual ganho nessa passagem vale muito:

| Taxa de agendamento | Leads/semana para 1 venda | Ganho vs. hoje |
| ---: | ---: | ---: |
| 7% (hoje) | 434 | — |
| 20% | 152 | 2,9× |
| 35% | 87 | 5,0× |
| 50% | 61 | 7,1× |
| 70% (meta) | 43 | 10,0× |

---

## 5. O PLACAR DIÁRIO DO CORRETOR

### 5.1 Os 3 indicadores-mãe (se estes fecham, o resto fecha)

| # | Indicador | Meta/dia | Meta/semana | Onde ver |
| :-: | --- | ---: | ---: | --- |
| 1 | **Desfechos registrados** | **20** | 100 | `/fila` · contagem de `[Registrar]` |
| 2 | **Agendamentos criados** | **1,4** | **7** | metas do dia · Agenda |
| 3 | **Análises de crédito enviadas** | 0,7 | **3,3** | funil · pasta |

### 5.2 O placar completo — 18 indicadores

| Categoria | Indicador | Meta | Onde vive hoje | Existe? |
| --- | --- | ---: | --- | :---: |
| **Volume** | Novos leads recebidos | — | Fila, balde `sla` | ✅ |
| | Leads trabalhados (tocados) | 25/dia | — | 🔴 criar |
| | Tentativas de contato | 45–50/dia | discador + interações | 🟠 parcial |
| **Contato** | Taxa de contato efetivo | 50% | `v_contato_efetivo` | 🟠 sem dado |
| | Conversas realizadas | 4,3/dia | interações de entrada | 🔴 sem dado |
| | **Tempo até 1º atendimento** | med ≤ 15 min · p90 ≤ 60 min | `v_velocidade_corretor` | 🟠 sem dado |
| **Qualificação** | Leads qualificados | 2,2/dia | funil | ✅ |
| | Simulações realizadas | 2/dia | — | 🔴 criar |
| | Fichas com renda + FGTS + faixa MCMV | 100% dos qualificados | ficha do lead | 🟠 vazio |
| **Conversão** | **Agendamentos criados** | 1,4/dia | metas do dia | ✅ |
| | Visitas realizadas | 0,9/dia | funil + Modo Visita | ✅ |
| | **Comparecimento** | 65% | — | 🔴 sem dado |
| | Análises de crédito | 0,7/dia | funil | ✅ |
| | Documentações recolhidas | 1/dia | metas do dia | ✅ |
| | **Vendas** | 1/semana | Financeiro | ⚠️ 0 em 90 dias |
| **Higiene** | Follow-ups realizados | 16/dia | régua | ✅ |
| | **Tarefas atrasadas** | **0** | placar da `/fila` | ✅ |
| | **Leads sem próximo passo** | **0** | placar da `/fila` | ✅ |
| | Leads parados 5+ dias no fundo | 0 | Higiene · balde `fundo` | ✅ |
| | Carteira ativa | 50–65 | `/reserva` · `fila_equipe_v1` | ✅ |
| | Perdidos marcados com motivo | 100% | ficha | 🟠 3,6% |

---

## 6. 🎯 O INDICADOR DE ATIVIDADE MÍNIMA DO DIA

> **A pergunta:** *"Este corretor fez atividade comercial suficiente hoje para ter
> probabilidade de atingir 1 venda por semana?"*

### A fórmula — Índice de Atividade Mínima (IAM)

Cinco condições. **Todas precisam ser verdadeiras.**

```
IAM = 1  ⟺   desfechos_registrados        ≥ 20
       E     leads_tocados                ≥ 25
       E     follow_ups_vencidos_ao_fim    =  0
       E     leads_sem_proximo_passo_ao_fim = 0
       E     agendamentos_criados_na_semana ≥ 7  (acumulado, aferido sexta)
```

**Por que cinco e não um número só:** um corretor pode fazer 40 toques e não agendar
nada (volume sem direção), ou agendar 7 e deixar 30 follow-ups vencidos (avanço com
rastro de destruição). As cinco condições cobrem **volume, direção e higiene** ao mesmo
tempo.

### Semáforo do dia

| Estado | Condição | Significado |
| :---: | --- | --- |
| 🟢 **VERDE** | 5 de 5 | No ritmo de 1 venda/semana |
| 🟡 **AMARELO** | 3 ou 4 de 5 | Recuperável hoje ainda — o CRM diz qual falta |
| 🔴 **VERMELHO** | ≤ 2 de 5 | Dia perdido. Conversa com o gestor **hoje**, não na sexta. |

### Semáforo da semana

| Estado | Condição |
| :---: | --- |
| 🟢 | ≥ 4 dias verdes **e** ≥ 7 agendamentos **e** ≥ 3 análises |
| 🟡 | 3 dias verdes **ou** 5–6 agendamentos |
| 🔴 | ≤ 2 dias verdes **ou** < 5 agendamentos |

**O ponto de checagem é quarta-feira.** Com 3 dias corridos, o corretor precisa ter
≥ 4 agendamentos. Se não tem, os 2 dias restantes não salvam a semana — e o gestor
ainda tem tempo de intervir.

---

## 7. Como o CRM já calcula isso (e o que falta ligar)

O `metas-dia.ts` **já implementa** o cálculo reverso:

| Função | O que faz |
| --- | --- |
| `taxasConversao()` | usa a taxa **do corretor** se ele tem ≥20 contatos; senão a do **time** |
| `contatosNecessarios()` | quantos contatos hoje para bater cada meta |
| `avaliarCheckpoint()` | compara realizado × ritmo esperado da jornada 9h–18h |
| `mensagemCheckpoint()` | *"Faltam 2 agendamentos. Pela sua conversão, isso são ≈ 34 contatos."* |
| `projecaoPorDia()` | *"≈ 1 venda a cada 12 dias úteis"* |

**Os checkpoints disparam às 12h, 15h e 17h.** Quem declara a meta às 16h não recebe o
aviso das 12h e das 15h — o desenho é cuidadoso.

**O que falta:** nada de código. Falta o **denominador**. `contatos` vem de interações
registradas. Sem desfecho, `taxas.fonte` é `null`, e todo o motor devolve "sem dado".

> **O CRM já sabe fazer a conta. Falta darem a ele os números.**

---

## 8. A tensão estrutural que a gestão precisa decidir

Um achado do cálculo que merece decisão explícita:

| Variável | Valor |
| --- | ---: |
| Inflow necessário | 43,4 leads/semana/corretor |
| Teto da carteira ativa | 65 leads |
| **Tempo médio de permanência implícito** | **65 ÷ 43,4 = 1,5 semana** |
| Ciclo da régua morna | **10,3 semanas** |

**As duas coisas não cabem juntas.** Ou:

- **(a)** o teto sobe para ~120 — mas aí volta a paralisia por excesso; ou
- **(b)** a régua fria encurta e o lead vai para o Bolsão mais cedo (**minha
  recomendação**, ver [Doc 6 §3.2](06-cadencia.md)); ou
- **(c)** a conversão sobe e o inflow necessário cai (43 → 20 leads/semana com
  agendamento em 70% e contato efetivo em 70%).

**Recomendo (b) + (c) juntas.** Com régua fria de 7 toques em 45 dias e agendamento
subindo para 50%, o inflow cai para ~61 leads/semana com permanência de 4 semanas —
e a conta fecha dentro do teto de 65.

---

## 9. Resumo de bolso

```
1 VENDA / SEMANA  =  43 leads trabalhados
                  =  7 agendamentos criados
                  =  4,4 visitas realizadas
                  =  3,3 análises de crédito

POR DIA:  20 desfechos · 25 leads tocados · 1,4 agendamento
          0 follow-up vencido · 0 lead sem próximo passo
```
