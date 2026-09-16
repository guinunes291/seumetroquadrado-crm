# DOCUMENTO 10 — Recomendações de melhoria no CRM

Cada item traz: **problema · consequência · solução · impacto esperado · dificuldade ·
prioridade**.

Dificuldade: **P** (config, sem deploy) · **M** (frontend/RPC) · **G** (migration +
motor) · **XG** (mudança estrutural).

---

# 🔴 CRÍTICO — prejudica venda hoje

## M1 · Reatribuir os 5.886 leads em tratativa sem corretor

| | |
| --- | --- |
| **Problema** | 89,4% das negociações paradas 5+ dias não têm `corretor_id`. Alguns em `em_atendimento` há **90 dias**. **[MEDIDO]** |
| **Consequência** | Cerca de 6 mil clientes no meio do funil que **não estão na fila de ninguém**. Considerando a mistura de etapas, é a maior reserva de valor da casa parada. |
| **Solução** | (1) Rotina de reatribuição via roleta em lotes de 200/dia, priorizando `analise_credito` → `visita_realizada` → `agendado` → `aguardando_retorno` → `em_atendimento`. (2) Constraint: lead em etapa de tratativa **não pode** ter `corretor_id NULL`. (3) Investigar a origem — há assinatura de lote (`updated_at` idêntico em 14/09). |
| **Impacto** | Recupera o estoque de fundo de funil. Só os leads em análise sem dono valem, a 39,1%, dezenas de vendas. |
| **Dificuldade** | **M** (rotina) + **G** (constraint) |
| **Prioridade** | **1** |

## M2 · Tornar o desfecho de um toque obrigatório

| | |
| --- | --- |
| **Problema** | `interacoes`, `tarefas` e `agendamentos` praticamente vazias. **[MEDIDO]** |
| **Consequência** | Os 7 baldes da Fila Única, o Score, a régua, a temperatura, a higiene e o cálculo reverso **rodam cegos**. Ver [Diagnóstico §5](01-diagnostico.md#5). |
| **Solução** | (1) Treino + meta de 20 desfechos/dia. (2) Bloquear a saída da ficha sem desfecho, agendamento ou perda (a "regra das três portas"). (3) Painel do gestor com desfechos/corretor/dia em tempo real. |
| **Impacto** | **Acende o CRM inteiro.** É a intervenção de maior alavanca do estudo. |
| **Dificuldade** | **P** (gestão) + **M** (a trava) |
| **Prioridade** | **1** |

## M3 · Exigir criação de agendamento na transição para `agendado`

| | |
| --- | --- |
| **Problema** | Leads em `agendado` com `agendamentos: []`. **[MEDIDO]** |
| **Consequência** | Agenda vazia, confirmação D-2/D-1/D+0 nunca dispara, comparecimento incalculável, cliente não aparece. |
| **Solução** | O modal `STAGE_MODAL.agendado` passa a **exigir** data + hora + empreendimento e a **criar a linha em `agendamentos`**. Sem isso, `transicionar_lead` recusa. |
| **Impacto** | Destrava o comparecimento (65% da meta) e a fila "Confirmar visita". |
| **Dificuldade** | **M** |
| **Prioridade** | **1** |

## M4 · Frear a esteira de plantão

| | |
| --- | --- |
| **Problema** | `distribuir-estoque-plantao` move **4.320 leads/dia** para `aguardando_atendimento`. A etapa foi de 33.011 (12/09) para **48.049** (16/09). **[MEDIDO]** |
| **Consequência** | 48 mil leads na mesa = paralisia. É a causa comportamental dos leads órfãos. |
| **Solução** | A esteira passa a **respeitar o teto da carteira ativa (65)**: só distribui para quem tem vaga. Hoje o teto é visual na tela e não freia a distribuição. |
| **Impacto** | O corretor passa a ver uma carteira trabalhável. Fim da paralisia por excesso. |
| **Dificuldade** | **M** (checar `_carteira_classificar` antes de atribuir) |
| **Prioridade** | **1** |

## M5 · Esclarecer o registro de vendas

| | |
| --- | --- |
| **Problema** | `vendas: 0` em 90 dias **[MEDIDO]**. A política de distribuição v1 já registrava, em 08/2026, *"zero vendas registradas no mês e 27 de 80 sem corretor identificado"*. |
| **Consequência** | Não é possível medir conversão real, calibrar taxa, pagar comissão por performance nem dar peso por venda na roleta (o próprio documento de política diz que isso está travado por causa disto). |
| **Solução** | Separar as hipóteses: (a) a SMQ vendeu zero, ou (b) o registro está quebrado. Auditar o caminho `Financeiro → venda → contrato_fechado`. |
| **Impacto** | **Sem isso, nenhuma meta deste estudo é verificável.** |
| **Dificuldade** | **M** (investigação) |
| **Prioridade** | **1** |

## M6 · Consertar o relógio de "dias sem movimento"

| | |
| --- | --- |
| **Problema** | `transicionar_lead` grava `ultima_interacao = now()` em **toda** mudança de status. Limitação já documentada pela própria casa. |
| **Consequência** | **Mudar o card de coluna zera o relógio de abandono sem que ninguém tenha falado com o cliente.** A Fila Única inteira ordena por esse relógio. |
| **Solução** | Separar `ultima_interacao` (contato real, só de `interacoes`) de `ultima_movimentacao` (qualquer mudança). A Fila e a Higiene passam a usar a primeira. |
| **Impacto** | O balde `fundo` e o `esfriando` passam a medir abandono de verdade. |
| **Dificuldade** | **G** (migration + ajuste em views e RPCs) |
| **Prioridade** | **2** |

---

# 🟠 IMPORTANTE — aumenta produtividade significativamente

## M7 · Ligar a devolução automática por SLA (em piloto)

**Problema:** `devolucaoAtiva: false` e `modelo_v2_ativo` desligada. Nada recicla lead
abandonado — é a causa direta de M1.
**Solução:** piloto com 3 corretores, 2 semanas, **só depois** de M2 estar rodando.
**Impacto:** carteira se mantém finita sozinha; fim da reincidência de M1.
**Dificuldade:** **P** · **Prioridade: 2**

## M8 · Dashboard de desfechos em tempo real para o gestor

**Problema:** o gestor descobre na sexta que o corretor não trabalhou.
**Solução:** a tabela `fila_equipe_v1` já existe. Acrescentar a coluna
**desfechos hoje** com o semáforo IAM do [Doc 8 §6](08-indicadores.md).
**Impacto:** intervenção no mesmo dia, não na semana seguinte.
**Dificuldade:** **M** · **Prioridade: 2**

## M9 · Encurtar a régua fria e mandar o frio para o Bolsão

**Problema:** 47.961 leads frios **[MEDIDO]** com régua de 146 dias, ocupando vagas de
uma carteira de 65.
**Solução:** régua fria de 7 toques em ~45 dias; esgotada, vai para o **Bolsão** (sem
dono), não para "esgotado com dono". Ver [Doc 8 §8](08-indicadores.md).
**Impacto:** resolve a tensão estrutural entre inflow necessário e teto de carteira.
**Dificuldade:** **P** (config da régua) + **M** · **Prioridade: 2**

## M10 · Criar os templates da régua

**Problema:** sem templates `"Régua N — temperatura"`, todos os toques usam o fallback
genérico em vez da copy da casa.
**Solução:** 13 × 3 = 39 templates (ou 13 com variação por temperatura).
**Impacto:** melhora direta na taxa de resposta.
**Dificuldade:** **P** · **Prioridade: 2**

## M11 · Migrar os 598 leads em status legado

**Problema:** `descartado`, `ganho`, `proposta`, `vendido`, `visita_agendada` estão
fora de `LEAD_STATUS_ORDER` → **invisíveis no Kanban e no funil**. **[MEDIDO]**
**Solução:** migração única: `ganho`/`vendido` → `contrato_fechado`, `descartado` →
`perdido`, `visita_agendada` → `agendado`, `proposta` → `analise_credito`.
**Impacto:** 598 leads voltam a ser trabalháveis.
**Dificuldade:** **M** · **Prioridade: 3**

## M12 · Dar a Higiene do Funil ao corretor

**Problema:** `/higiene-funil` é só da gestão. O corretor vê os parados só pela Fila
Única, que corta em 65.
**Solução:** versão do corretor, escopada à própria carteira.
**Impacto:** autogestão do abandono.
**Dificuldade:** **M** · **Prioridade: 3**

## M13 · Sub-estados de `em_atendimento`

**Problema:** 6.460 leads **[MEDIDO]** num status que significa tudo e nada — e é a
passagem que marca 7% contra meta de 70%.
**Solução:** **sem migration** — padronizar `proxima_acao` em 5 valores pelo desfecho:
`primeiro contato feito` → `simulação enviada` → `produto definido` → `visita oferecida`
→ `visita marcada`.
**Impacto:** o gestor vê **em qual dos 5 passos** o gargalo #1 trava.
**Dificuldade:** **M** · **Prioridade: 2**

---

# 🟡 MELHORIA — UX, visualização, eficiência

## M14 · Semáforo IAM no topo da Fila Única

O corretor abre `/fila` e vê **🟢 5/5** ou **🔴 2/5** com o que falta. Hoje ele só vê os
números soltos. **Dificuldade: M · Prioridade: 3**

## M15 · Campo de qualificação obrigatório na saída de `qualificacao_corretor`

Renda + tipo de renda + FGTS + faixa MCMV. Hoje nulos **[MEDIDO]**.
**Dificuldade: M · Prioridade: 3**

## M16 · Contador "dias no fundo do funil" com custo em reais

O card já mostra "R$ 250 mil · em jogo · 79 d parado". Acrescentar o acumulado por
corretor: *"Você tem R$ 2,4 mi parados há mais de 5 dias."*
**Dificuldade: P · Prioridade: 4**

## M17 · Protocolo de visita como checklist no card

D-2 / D-1 / D+0 com marcação visual no card do balde `fundo`.
**Dificuldade: M · Prioridade: 3**

## M18 · Motivo de perda com sugestão contextual

Lead reprovado na Caixa → sugerir `credito_score`/`credito_renda`; lead que nunca
respondeu 13 toques → sugerir `sem_contato`.
**Dificuldade: M · Prioridade: 4**

---

# ⚙️ AUTOMAÇÃO — ver [Documento 11](11-automacoes.md)

---

# Ordem de implantação recomendada

| Onda | Itens | Prazo | Resultado esperado |
| --- | --- | --- | --- |
| **Onda 0 — destravar** | M5 (vendas), M2 (desfecho por gestão), M4 (frear esteira) | 1 semana | Dados começam a existir |
| **Onda 1 — resgatar** | M1 (órfãos), M3 (agendamento obrigatório), M11 (legados) | 2 semanas | Fundo de funil volta para a fila |
| **Onda 2 — medir** | M8 (dashboard), M6 (relógio), M13 (sub-estados) | 3 semanas | O gargalo fica visível |
| **Onda 3 — automatizar** | M7 (devolução), M9 (régua fria), M10 (templates) | 4 semanas | A carteira se mantém sozinha |
| **Onda 4 — refinar** | M12, M14–M18 | contínuo | Produtividade |

> **Regra de sequência:** nada da Onda 3 antes de a Onda 0 estar medindo. Ligar
> automação de devolução sobre uma operação que não registra devolveria em massa leads
> que **estão** sendo trabalhados — e o time perderia a confiança no sistema.
