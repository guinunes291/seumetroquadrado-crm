# DOCUMENTO 7 — Matriz de prioridades

---

## 1. A hierarquia que o CRM já executa

A Fila Única (`src/features/fila-unica/derive.ts`) ordena em **sete baldes**. Um lead
entra em **um** balde — o mais urgente. Esta é a ordem real, e ela é diferente da
hierarquia "clássica" de CRM pedida no briefing. **A do CRM está mais certa**, e este
documento explica por quê.

| Prio | Balde | Rótulo na tela | Quem entra | Ordem interna |
| :--: | --- | --- | --- | --- |
| **1** | `fundo` | Fundo do funil parado | `agendado`, `visita_realizada`, `proposta_enviada`, `analise_credito` | mais dias sem movimento primeiro |
| **2** | `sla` | Chegaram agora | `novo`, `aguardando_atendimento` | quem chegou primeiro |
| **3** | `responder` | Cliente respondeu e espera | última interação é de entrada | Score |
| **4** | `followup` | Follow-up vencido ou de hoje | toque da régua vencido/hoje | mais vencido primeiro |
| **5** | `sem_acao` | Sem próximo passo | sem tarefa, agendamento ou follow-up | Score |
| **6** | `esfriando` | Esfriando | quente/morno sem contato 3+ dias | Score |
| **7** | `docs` | Pasta travada | documento pendente/reprovado, fora do fundo | Score |

---

## 2. Por que o fundo do funil vem ANTES do lead novo

O briefing propunha: *Prioridade 1 = clientes quentes; Prioridade 3 = leads novos
recebidos há poucos minutos*. A Fila Única inverte parcialmente — e tem razão:

| Argumento | Dado |
| --- | --- |
| A etapa `analise_credito` converte **39,1%** para venda | **[MEDIDO]** |
| Em 12/09, **124 dos 134** leads em análise estavam parados 5+ dias (92,5%) | **[MEDIDO]** |
| Um lead frio novo converte uma fração de 1% | **[HIPÓTESE]** |
| Há **47.961 leads frios** na base — eles não são escassos | **[MEDIDO]** |
| Há **140 leads em análise de crédito** — eles são escassíssimos | **[MEDIDO]** |

**A conta:** tocar 1 lead em análise vale, em expectativa, **0,39 venda**. Tocar 1 lead
frio novo vale ~0,005. É uma diferença de **78 vezes**.

**A única exceção — e é por isso que `sla` é o balde 2:** o lead novo tem um relógio
que o fundo não tem. Se o SLA de 15 minutos estourar, o lead **vai embora para outro
corretor**. Perder o lead novo é irreversível em minutos; a pasta parada ainda estará
lá em 2 horas. Por isso: **fundo primeiro no valor, SLA primeiro no relógio** — e na
prática o corretor trabalha o fundo no bloco da manhã e atende o SLA **por interrupção**,
assim que a notificação chega.

> **Regra prática:** o lead novo interrompe qualquer coisa. Fora isso, fundo primeiro.

---

## 3. O Score de prioridade — o desempate dentro do balde

`src/lib/priority.ts`. Score 0–100:

| Fator | Pontos |
| --- | ---: |
| Temperatura **quente** | +35 |
| Temperatura **morno** | +15 |
| **Etapa** `analise_credito` | +25 |
| **Etapa** `visita_realizada` | +22 |
| **Etapa** `agendado` | +16 |
| **Etapa** `em_atendimento` | +12 |
| **Etapa** `qualificacao_corretor` | +11 |
| **Etapa** `aguardando_retorno` / `qualificado` | +10 |
| **Etapa** `aguardando_atendimento` / `novo` | +6 |
| SLA **estourado** | +20 |
| SLA em **atenção** | +10 |
| **Sem contato registrado** | +12 |
| Dias sem contato | +4/dia, **teto 20** |

**Tiers:** 🔴 alta ≥ 60 · 🟡 média ≥ 35 · ⚪ baixa < 35.

Os pesos de etapa são espelhados na tabela SQL `higiene_regra_fase`, e um teste de CI
quebra o build se os dois divergirem.

### ⚠️ Uma fragilidade do Score que o corretor precisa conhecer

`temperatura` é **derivada**, não declarada: `recalcular_temperatura_leads` roda a cada
10 min e marca `quente` quem **está** em agendado/visita/análise **ou** teve interação
nas últimas 24h.

Como as interações não estão sendo registradas **[MEDIDO]**, sobra só o critério de
etapa. Resultado: **47.961 leads frios e 1.081 quentes** — a base inteira é fria por
construção, não por comportamento do cliente. O fator de 35 pontos da temperatura está,
na prática, quase desligado.

> **Isto se corrige sozinho no dia em que o desfecho de um toque virar rotina.**

---

## 4. A FILA ANTI-OCIOSIDADE

> **Enquanto houver cliente na base, o corretor nunca fica sem próxima ação comercial.**
> A SMQ tem **58.144 leads**. Ociosidade aqui é escolha, não falta de material.

Ordem obrigatória — só desce um nível quando o anterior estiver **zerado**:

| Nível | Fonte | Tela | Quando |
| :---: | --- | --- | --- |
| **1** | Fundo do funil parado | `/fila` balde 1 | sempre primeiro |
| **2** | Leads novos (SLA) | `/fila` balde 2 | por interrupção |
| **3** | Clientes que responderam | `/fila` balde 3 | |
| **4** | Follow-ups vencidos e de hoje | `/fila` balde 4 | |
| **5** | Sem próximo passo | `/fila` balde 5 | |
| **6** | Esfriando | `/fila` balde 6 | |
| **7** | Pasta travada | `/fila` balde 7 | |
| **8** | **Reserva** — "Sem próximo passo" | `/reserva` | fila do dia zerada |
| **9** | **Reserva** — "Nunca engataram" | `/reserva` | resgate até 13 |
| **10** | **Reserva** — "Parados" | `/reserva` | |
| **11** | **Modo Foco** — lote de aguardando atendimento | `/prospeccao` | |
| **12** | **Discador** — bloco de 30–45 min | `/discador` | **tabular sempre** |
| **13** | **Bolsão** — "já houve conversa" | `/bolsao` | maior chance |
| **14** | **Bolsão** — "tentaram, sem resposta" | `/bolsao` | |
| **15** | **Bolsão** — "nunca tocado" | `/bolsao` | volume puro |
| **16** | **Oferta Ativa** — lista segmentada | `/oferta-ativa` | campanha |
| **17** | Reativação de perdidos 30/60/90 dias | `/leads` filtrado | |
| **18** | **Captação própria** | fora do CRM | indicação, porta, parceria |

### O modelo de três níveis que sustenta isso

```
CARTEIRA ATIVA (65, com dono, trabalho diário)   ← /fila
      └── RESERVA (com dono, esperando vaga)      ← /reserva  · cap resgate 13
              └── BOLSÃO (sem dono)               ← /bolsao   · discador e SDR
```

Faixas que enchem as 65 vagas, por precedência: **fundo do funil** (nunca é devolvido) →
**resgatados por você** → **conversa viva** → **chegaram agora**.

Se você estourar o teto: *"Você não recebe lead novo até desovar — nenhum negócio
avançado foi devolvido."* **Estourar o teto por ter muito fundo de funil não é
problema. É o objetivo.**

---

## 5. Detecção de ociosidade — os 10 sinais

Para o gestor, no Painel do Gestor e na tabela de equipe da `/fila`
(`fila_equipe_v1`):

| # | Sinal | Onde vê | Limiar de alerta |
| :-: | --- | --- | --- |
| 1 | Não marcou presença | roleta | 09:00 sem presença |
| 2 | **Zero desfechos registrados hoje** | 🔴 o sinal-mãe | 10:30 com 0 |
| 3 | Carteira ativa muito abaixo de 65 | `fila_equipe_v1` | < 30 |
| 4 | Muitos leads sem próximo passo | `leads_sem_acao` | > 10 |
| 5 | Follow-ups vencidos acumulando | régua | > 10 |
| 6 | Fundo do funil parado | Higiene | qualquer lead 5+ dias |
| 7 | Nenhum agendamento criado na semana | metas | 0 até quarta |
| 8 | Nenhum lead avançou de etapa | funil | 0 transições em 2 dias |
| 9 | Poucas ligações tabuladas | discador | < 20/dia |
| 10 | Metas do dia não declaradas | popup | 09:30 |

> **O sinal #2 é o único que realmente importa** — todos os outros são consequência.
> Um corretor com 20 desfechos/dia não tem nenhum dos outros 9 problemas.
