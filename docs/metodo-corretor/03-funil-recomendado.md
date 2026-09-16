# DOCUMENTO 3 — Funil comercial recomendado

O funil abaixo **não inventa etapas**: é exatamente a máquina de estados que já existe
em `src/lib/leads.ts` e em `public.transicao_lead_permitida`. O que este documento
acrescenta é o que o CRM ainda não impõe: **critério de entrada, critério de saída,
ação obrigatória, informação obrigatória, prazo máximo e gatilho de alerta.**

---

## 1. Princípio inegociável

> **TODO LEAD PRECISA TER: STATUS + HISTÓRICO + PRÓXIMO PASSO + DATA DO PRÓXIMO PASSO.**
>
> Lead sem próximo passo com data não é cliente — é arquivo morto ocupando vaga na
> carteira de 65.

O CRM já tem o guardrail: a RPC `leads_sem_acao` alimenta o balde `sem_acao` da Fila
Única. O que falta é a **disciplina de nunca sair de um card sem desfecho**.

---

## 2. As 9 etapas do funil SMQ

Ordem canônica (`LEAD_STATUS_ORDER`), com as duas fases comerciais:

```
  PROSPECÇÃO (o volumão do topo)              CARTEIRA (quem avança)
  ┌──────────────────────────────┐   ┌────────────────────────────────────────┐
  │ novo                         │   │ em_atendimento                         │
  │ aguardando_atendimento       │   │ agendado                               │
  │ aguardando_retorno           │   │ visita_realizada                       │
  │ qualificacao_corretor        │   │ analise_credito                        │
  └──────────────────────────────┘   │ contrato_fechado                       │
                                     └────────────────────────────────────────┘
                     perdido ← saída lateral (11 motivos)
                   pos_venda ← depois da venda
```

---

## 3. Especificação etapa por etapa

### E0 · `novo` — caixa de entrada sem dono

| | |
| --- | --- |
| **Critério de entrada** | Lead criado (webhook, landing, importação, captação) e ainda sem `corretor_id` |
| **Critério de saída** | Roleta atribuiu corretor → `aguardando_atendimento` |
| **Ação obrigatória** | Nenhuma do corretor. É responsabilidade do **sistema**. |
| **Prazo máximo** | **[META CASA]** lead com dono em **1 hora útil** (política v1) |
| **Gatilho de alerta** | Lead `novo` há mais de 1h útil → alerta para a gestão |
| **KPI** | Taxa de distribuição (meta 100%) |
| **Próxima ação automática** | Atribuição pela roleta de zona/base |

> **[MEDIDO]** 15 leads em `novo`. Esta etapa está saudável — a roleta funciona.

---

### E1 · `aguardando_atendimento` — distribuído, sem primeiro contato

| | |
| --- | --- |
| **Critério de entrada** | Roleta atribuiu o lead ao corretor |
| **Critério de saída** | Primeiro contato **efetivo** (o cliente respondeu) → `aguardando_retorno` ou `qualificacao_corretor`. Contato sem resposta **não** tira daqui — vira toque da régua. |
| **Ação obrigatória** | **Ligar + WhatsApp**, e **registrar o desfecho** |
| **Informação obrigatória** | Desfecho + próximo passo com data |
| **Prazo máximo** | **15 minutos úteis** (08h–19h) para lead quente · **mesmo dia útil** para lead de base |
| **Follow-up** | Entra na régua no toque 1 imediatamente |
| **Próxima tarefa** | Toque 2 da régua, conforme a temperatura |
| **Prioridade** | Balde `sla` — **2º** na Fila Única |
| **Gatilho de alerta** | SLA estourado → lead vai para o próximo da roleta; 2 estouros no dia pausam o corretor no quente |
| **Motivo de perda típico** | `sem_contato`, `sem_perfil` |
| **KPI** | Tempo até 1º atendimento (mediana ≤ 15 min, p90 ≤ 60 min) · **1º contato efetivo: [META CASA] 50%** |

> 🔴 **[MEDIDO] 48.049 leads aqui — 82,6% da base.** Esta etapa é o balde furado. Ver
> [Diagnóstico §2.5](01-diagnostico.md).

---

### E2 · `aguardando_retorno` — o cliente pediu para voltar depois

| | |
| --- | --- |
| **Critério de entrada** | Houve conversa e o cliente pediu retorno em data/momento específico |
| **Critério de saída** | Retorno feito → `em_atendimento` ou `qualificacao_corretor` |
| **Ação obrigatória** | Criar a tarefa **com a data que o cliente pediu** — não a data padrão da régua |
| **Informação obrigatória** | **O que** o cliente pediu e **quando** (no próximo passo, em texto livre) |
| **Prazo máximo** | A data combinada. Atraso de 1 dia já é falha. |
| **Prioridade** | Balde `followup` — **4º** |
| **Gatilho de alerta** | Prazo vencido → topo do balde `followup` |
| **KPI** | **Qualificação: [META CASA] 50%** dos que responderam |

> **Esta é a passagem mais barata de recuperar do funil inteiro: custa uma mensagem.**
> **[MEDIDO]** 666 leads aqui, 85,4% da fase estava parada em 12/09.

---

### E3 · `qualificacao_corretor` — chegou qualificado (bot ou SDR) e precisa do corretor

| | |
| --- | --- |
| **Critério de entrada** | Bot (Marquinhos), SDR ou o próprio corretor levantou o perfil |
| **Critério de saída** | Conversa engatada → `em_atendimento` |
| **Ação obrigatória** | Assumir a conversa **no mesmo dia** |
| **Informação obrigatória** | **Renda · tipo de renda · FGTS · entrada · decisor · faixa MCMV** |
| **Prazo máximo** | **[META CASA]** qualificado vira conversa em **1 dia** (meta 90%) |
| **Prioridade** | Balde `sla` se nunca tocado; senão `followup`/`sem_acao` |
| **Gatilho de alerta** | 24h sem virar `em_atendimento` |
| **Motivo de perda típico** | `estourou_teto`, `credito_renda`, `sem_perfil` |
| **KPI** | Vira conversa: meta 90% |

> **Perder lead aqui é perder dinheiro de mídia já gasto.** O lead chegou pronto.
> **[MEDIDO]** 90,8% desta fase estava parada em 12/09.

---

### E4 · `em_atendimento` — conversa viva

| | |
| --- | --- |
| **Critério de entrada** | O corretor está em conversa ativa com o cliente |
| **Critério de saída** | Visita marcada → `agendado`. Cliente sumiu → régua/`aguardando_retorno`. Sem perfil → `perdido` com motivo. |
| **Ação obrigatória** | Simulação + oferta de visita **em toda conversa** |
| **Informação obrigatória** | Renda, FGTS, faixa MCMV, projeto de interesse, objeção |
| **Prazo máximo** | **3 dias** sem movimento → o lead é considerado esfriando |
| **Follow-up** | Régua ativa, gaps de quente ou morno |
| **Prioridade** | Balde `esfriando` (6º) ou `sem_acao` (5º) |
| **Gatilho de alerta** | 3+ dias sem contato → balde `esfriando` |
| **KPI** | 🔴 **Agendamento: [META CASA] 70% · [MEDIDO] 7%** |

> 🔴 **ESTE É O GARGALO #1 DA OPERAÇÃO.** 6.460 leads aqui, e a passagem para `agendado`
> roda a **um décimo da meta**. O copy do CRM já diagnostica: *"'Em atendimento' virou
> rótulo, não estado. Sem próximo passo com data, o lead esfria aqui."* Ver
> [Documento 8 §4](08-indicadores.md) para o custo em leads.

---

### E5 · `agendado` — visita marcada

| | |
| --- | --- |
| **Critério de entrada** | Data, hora e empreendimento **combinados com o cliente** |
| **Critério de saída** | Visita aconteceu → `visita_realizada`. Não foi → `aguardando_retorno` (remarcar) ou `perdido`. |
| **Ação obrigatória** | 🔴 **CRIAR O AGENDAMENTO NO CRM** (não só mudar o status) + confirmar em **D-2, D-1 e D+0** |
| **Informação obrigatória** | `visita_data`, `visita_hora`, `visita_empreendimento`, quem vai comparecer |
| **Prazo máximo** | A data da visita |
| **Follow-up** | Régua com multiplicador **0,5** — ritmo dobrado |
| **Prioridade** | Balde `fundo` — **1º, antes de tudo** |
| **Gatilho de alerta** | Visita nas próximas 48h sem confirmação → fila `confirmar_visita` |
| **Motivo de perda típico** | `sumiu_pos_proposta`, `timing_adiou` |
| **KPI** | **Comparecimento: [META CASA] 65%** (protocolo D-2/D-1/D+0 rende 60–75%) |

> 🔴 **[MEDIDO] O erro sistêmico está aqui:** leads em `agendado` com `agendamentos: []`.
> Sem o registro, a Agenda fica vazia, a confirmação nunca dispara, e o comparecimento
> é incalculável. **Mover o card para "Agendado" não é agendar. Agendar é criar o
> agendamento.**

---

### E6 · `visita_realizada` — visitou, validada

| | |
| --- | --- |
| **Critério de entrada** | Visita **confirmada** (validação no Modo Visita) |
| **Critério de saída** | Pasta aberta → `analise_credito`. Objeção dura → `aguardando_retorno`. Sem perfil → `perdido`. |
| **Ação obrigatória** | **Fechar a pasta na mesma semana** — enquanto a visita está fresca |
| **Informação obrigatória** | Unidade de interesse, objeções levantadas, valor de entrada acordado |
| **Prazo máximo** | **48 horas** para o próximo passo |
| **Follow-up** | Multiplicador 0,5 |
| **Prioridade** | Balde `fundo` — **1º** |
| **Gatilho de alerta** | 24h após a visita sem follow-up |
| **KPI** | **Pasta/proposta: [META CASA] 75%** das visitas |

> **[MEDIDO]** 38 leads aqui. Copy do CRM: *"Visitou e não foi para a pasta. A proposta
> precisa sair enquanto a visita está fresca."*

---

### E7 · `analise_credito` — pasta na Caixa

| | |
| --- | --- |
| **Critério de entrada** | Documentação recolhida e pasta enviada |
| **Critério de saída** | Aprovado + venda registrada → `contrato_fechado`. Reprovado → `perdido` com `credito_score` ou `credito_renda`. |
| **Ação obrigatória** | **Cobrar a Caixa e o cliente — toda semana, sem falta** |
| **Informação obrigatória** | Status de cada documento (pendente/recebido/aprovado/reprovado) + data da última cobrança |
| **Prazo máximo** | **7 dias** sem movimento é crítico |
| **Follow-up** | Multiplicador 0,5 |
| **Prioridade** | Balde `fundo` — **1º, peso de etapa 25 (o maior do CRM)** |
| **Gatilho de alerta** | 5 dias sem movimento → fila de Higiene **P1** |
| **Motivo de perda típico** | `credito_score`, `credito_renda` |
| **KPI** | 🟢 **Fechamento: [META CASA] 30% · [MEDIDO] converte 39,1%** |

> 🟢 **A melhor passagem do funil inteiro — e a mais negligenciada.** 39,1% de conversão
> e estava **92,5% parada**. Copy do CRM: *"pasta parada é venda parada"*.
> **[MEDIDO]** só 140 leads aqui. Cada um vale, estatisticamente, 0,39 venda.

---

### E8 · `contrato_fechado` — venda

| | |
| --- | --- |
| **Critério de entrada** | **Venda aprovada** registrada no Financeiro (guarda por trigger — não basta mudar o status) |
| **Critério de saída** | Só a gestão move, e só para `pos_venda` ou de volta para `analise_credito` |
| **Ação obrigatória** | Registrar a venda com projeto, unidade, VGV e comissão |
| **Prazo máximo** | Mesmo dia do fechamento |
| **KPI** | **Vendas/semana por corretor · VGV · ticket médio** |

> ⚠️ **[MEDIDO] `vendas: 0` em 90 dias.** Ver [Diagnóstico §7](01-diagnostico.md#7).
> **Nada neste método funciona até isso ser esclarecido.**

---

### ES · `perdido` — saída lateral

| | |
| --- | --- |
| **Critério de entrada** | Uma das **11 categorias** de motivo, sempre com motivo escrito |
| **Critério de saída** | Reativação (só para `em_atendimento`, `aguardando_retorno`, `qualificacao_corretor`) |
| **Ação obrigatória** | **Escolher a categoria.** Nunca "outro" sem descrever. |
| **Prioridade** | Sai da fila |
| **KPI** | Taxa de perda por motivo, por origem, por projeto, por corretor |

> **[MEDIDO] só 3,6% da base.** Uma operação MCMV saudável perde entre 60% e 80% dos
> leads — e **sabe por quê**. Não marcar perdido não é otimismo: é entulho na carteira.
> O job `sdr-alimentar-perdidos` recicla 100/dia para o SDR, então perder não é jogar
> fora.

---

### E9 · `pos_venda`

Outra régua. Fora do escopo da fila comercial.

---

## 4. O funil visto pela conversão — metas × realidade

| # | Passagem | **[META CASA]** | **[MEDIDO]** | Fonte da meta |
| :-: | --- | ---: | ---: | --- |
| 1 | entrada → aguardando_atendimento | 100% | ok | política v1: dono em 1h útil |
| 2 | aguardando_atendimento → aguardando_retorno | 50% | — | política v1 (provisório) |
| 3 | aguardando_retorno → qualificacao_corretor | 50% | — | rotina comercial |
| 4 | qualificacao_corretor → em_atendimento | 90% | — | qualificado vira conversa em 1 dia |
| 5 | **em_atendimento → agendado** | **70%** | 🔴 **7%** | rotina comercial |
| 6 | agendado → visita_realizada | 65% | — | protocolo D-2/D-1/D+0 |
| 7 | visita_realizada → analise_credito | 75% | — | rotina comercial |
| 8 | **analise_credito → venda** | 30% | 🟢 **39,1%** | coorte mede 39% |

Estas metas vivem em `PASSAGENS` (`src/features/fila-unica/funil-derive.ts`) e aparecem
no painel do funil da Fila Única, com a fonte de cada uma no tooltip.

**A leitura:** a operação **fecha bem** (39% > 30%) e **não agenda** (7% << 70%).
Não é um problema de fechamento nem de crédito. É um problema de **transformar conversa
em visita**.

---

## 5. Ajustes que recomendo no funil atual

### 5.1 Aposentar os status legados 🔴

**[MEDIDO]** 598 leads em `descartado`, `ganho`, `proposta`, `vendido`,
`visita_agendada` — fora de `LEAD_STATUS_ORDER`, logo **invisíveis no Kanban e no funil**.
**Ação:** migração única mapeando `ganho`/`vendido` → `contrato_fechado`,
`descartado` → `perdido`, `visita_agendada` → `agendado`, `proposta` → `analise_credito`.

### 5.2 Desdobrar `em_atendimento` — onde o funil realmente vaza 🟠

6.460 leads num único status que significa tudo e nada. Proposta: **não criar status
novo** (isso quebra a máquina de estados e os testes), mas usar o campo
`proxima_acao` de forma padronizada, com sub-estados controlados pelo desfecho:

`primeiro contato feito` → `simulação enviada` → `produto definido` → `visita oferecida`
→ `visita marcada`

Assim o gestor vê **em qual dos cinco passos** os 6.460 estão travados, sem migration.

### 5.3 Não criar etapa de "proposta" separada ✅ manter como está

`proposta_enviada` existe como legado e está fora da ordem do funil. **Está certo.**
Em MCMV, a proposta e a análise de crédito são o mesmo movimento — separá-las criaria
uma etapa que ninguém preencheria. O CRM acertou aqui.

### 5.4 Tornar o agendamento uma condição técnica 🔴

A transição para `agendado` **já abre modal** (`STAGE_MODAL.agendado`). Recomendação:
o modal passa a **exigir** data, hora e empreendimento, e **criar a linha em
`agendamentos`** — sem isso, a transição não conclui. É a correção mais direta de P5
do diagnóstico.

### 5.5 Regra de ouro da saída de qualquer etapa

> Só é permitido sair da ficha de um lead por **uma** de três portas:
> **(a)** desfecho registrado com próximo passo e data · **(b)** agendamento criado ·
> **(c)** perdido com motivo.
>
> Não existe a porta (d) "fechei a tela".
