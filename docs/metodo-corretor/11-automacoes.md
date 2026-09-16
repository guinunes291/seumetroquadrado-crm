# DOCUMENTO 11 — Automações recomendadas

> **Princípio:** o corretor não deve *lembrar* de nada. O que pode ser decidido por
> regra não deve depender de memória humana.

Legenda: ✅ já existe · 🟠 existe mas está desligada · 🔴 não existe

---

## 1. Automações que JÁ EXISTEM (e precisam ser ligadas ou usadas)

| # | Automação | Estado | O que faz | Ação |
| :-: | --- | :---: | --- | --- |
| A1 | Roleta de distribuição | ✅ | Atribui lead por zona/base, com presença e cota | usar |
| A2 | Redistribuição por SLA | ✅ | `redistribuir_sla_webhook()` a cada 5 min | usar |
| A3 | Recálculo de temperatura | ✅ | A cada 10 min | depende de interações |
| A4 | Espelho tarefa ↔ `proximo_followup` | ✅ | Trigger | usar |
| A5 | Agendamento do próximo toque | ✅ | O desfecho cria a tarefa da régua | **usar** |
| A6 | Colapso de toque duplo | ✅ | Eventos < 10 min contam como 1 | — |
| A7 | Cancelamento de tarefas ao fechar | ✅ | Trigger | — |
| A8 | Guarda "só fecha com venda aprovada" | ✅ | Trigger em `contrato_fechado` | — |
| A9 | Reciclagem de perdidos para o SDR | ✅ | 100/dia, `0 11 * * *` | — |
| A10 | Esteira de plantão | ⚠️ | 4.320/dia — **precisa de freio** (M4) | corrigir |
| A11 | **Devolução automática por SLA** | 🟠 | `devolucaoAtiva: false` | **ligar em piloto** |
| A12 | **Posse 7/30 dias** | 🟠 | `modelo_v2_ativo` desligada | **ligar depois de M2** |
| A13 | **Teto disjuntor de 30** | 🟠 | Idem | ligar |
| A14 | **Pausa por 2 estouros de SLA** | 🟠 | Idem | ligar |
| A15 | **Recálculo semanal de faixa** | 🟠 | Segunda 08:00, últimos 14 dias | ligar |
| A16 | Checkpoints de meta 12h/15h/17h | ✅ | Comparam ritmo × meta | depende de taxa |
| A17 | Motor de Higiene do Funil | ✅ | Fila por fase, com proteção de lote | usar |

---

## 2. Automações a CRIAR — por prioridade

### 🔴 AUT-1 · Push no SLA do primeiro contato

| | |
| --- | --- |
| **Problema** | O corretor não sabe que um lead quente chegou. O SLA de 15 min corre sem aviso. |
| **Gatilho** | Lead atribuído com `classe_lead = 'quente'` |
| **Ação** | Push aos **5 min** (*"Carla M. · SLA vence em 10 min"*), aos **12 min** (urgente), e ao estourar (*"o lead foi para o próximo"*) |
| **Estado** | A infra de push **existe** (`web-push`, `/api/public/hooks/push-dispatch`). **Nada a dispara.** Já está anotado como pendência na Fatia 1 da Fila Única. |
| **Dificuldade** | M (pg_cron ou edge) · **Prioridade 1** |

### 🔴 AUT-2 · Protocolo automático de confirmação de visita

| | |
| --- | --- |
| **Gatilho** | Agendamento criado com `tipo = visita` |
| **Ação** | Criar 4 tarefas automáticas: **D-2** WhatsApp · **D-1** ligação · **D+0 manhã** WhatsApp · **D+0 +30 min** ligação/no-show |
| **Impacto** | **[META CASA]** comparecimento de 65% (protocolo rende 60–75%) |
| **Dependência** | M3 (agendamento obrigatório) |
| **Dificuldade** | M · **Prioridade 1** |

### 🔴 AUT-3 · Alerta de fundo de funil parado

| | |
| --- | --- |
| **Gatilho** | Lead em `analise_credito` / `visita_realizada` / `agendado` sem movimento há **3 dias** |
| **Ação** | Push para o corretor + linha no painel do gestor. Aos **7 dias**, escala ao gestor. |
| **Impacto** | Ataca diretamente os 92,5% de análises paradas **[MEDIDO]** |
| **Dificuldade** | M · **Prioridade 1** |

### 🔴 AUT-4 · Alerta de "cliente respondeu e ninguém voltou"

**Gatilho:** interação de entrada sem interação de saída em **2 horas úteis**.
**Ação:** push. Em 24h, escala. **Prioridade 1** (depende de M2).

### 🔴 AUT-5 · Alerta de pasta travada

**Gatilho:** documento `pendente` ou `reprovado` há **3 dias** em lead de
`analise_credito`. **Ação:** push com o nome do documento que falta.
**Prioridade 2.**

### 🔴 AUT-6 · Reatribuição automática de lead órfão

**Gatilho:** lead em etapa de tratativa com `corretor_id IS NULL`.
**Ação:** entra na roleta imediatamente, priorizando o fundo do funil.
**Impacto:** impede que M1 se repita. **Prioridade 1.**

### 🔴 AUT-7 · Semáforo IAM e alerta de ociosidade

**Gatilhos:** 10:30 com 0 desfechos · 14:00 com < 8 desfechos · 17:00 com < 15.
**Ação:** push ao corretor + painel do gestor.
**Mensagens:** *"Você ainda não registrou nenhum atendimento hoje"* · *"Você está abaixo
do ritmo necessário para sua meta semanal"*. **Prioridade 2.**

### 🔴 AUT-8 · Checkpoint de meio de semana

**Gatilho:** quarta-feira 17h com < 4 agendamentos na semana.
**Ação:** *"Faltam 3 agendamentos para a meta da semana. Pela sua conversão, isso são
≈ N contatos."* — o `mensagemCheckpoint()` **já monta este texto**; falta o gatilho
semanal. **Prioridade 2.**

### 🔴 AUT-9 · Sugestão automática de próximo passo por etapa

**Gatilho:** lead sem próximo passo há 24h.
**Ação:** criar tarefa com o `PROXIMA_ACAO` da etapa (já existe no código: "Iniciar
atendimento", "Agendar visita", "Marcar visita realizada", "Enviar p/ análise",
"Registrar venda"). **Impacto:** o balde `sem_acao` deixa de existir.
**Prioridade 2.**

### 🔴 AUT-10 · Régua de reativação de perdidos

**Gatilho:** lead `perdido` há 30/60/90 dias, por categoria de motivo.
**Ação:** entra em lista de Oferta Ativa segmentada.
**Exemplos:** `timing_adiou` em 30 dias · `credito_score` em 60 · `credito_renda` em 90.
**Prioridade 3.**

### 🔴 AUT-11 · Enriquecimento automático de faixa MCMV

**Gatilho:** `renda_informada` preenchida. **Ação:** calcular e gravar `faixa_mcmv`,
sugerir projetos compatíveis via Match. **Prioridade 3.**

### 🔴 AUT-12 · Relatório semanal automático por corretor

**Gatilho:** sexta 18h. **Ação:** o placar da semana × meta, o gargalo pessoal e as 3
ações da semana seguinte. **Prioridade 3.**

---

## 3. Automações que eu NÃO recomendo

| Automação | Por que não |
| --- | --- |
| **Auto-perder lead sem contato** | A casa já decidiu contra, e está certa: `arquivar_leads_sem_contato_30d` virou stub em 17/07/2026 de propósito. Esgotada a régua, a decisão é **humana**. |
| **Auto-avançar etapa por tempo** | Etapa é fato comercial, não decurso de prazo. Automatizar isso destruiria o funil como instrumento de medição. |
| **Auto-mensagem sem revisão no fundo do funil** | Cliente em análise de crédito precisa de conversa real. Automação aqui queima o negócio mais caro da casa. |
| **Auto-classificar temperatura só por etapa** | É o que acontece hoje na prática, e é justamente o defeito: 47.961 frios por construção. A temperatura precisa de comportamento. |

---

## 4. Ordem de implantação

| Onda | Automações | Depende de |
| --- | --- | --- |
| **1** | AUT-1 (push SLA) · AUT-6 (órfão) · A10 freio da esteira | nada |
| **2** | AUT-2 (visita) · AUT-3 (fundo parado) | M3 |
| **3** | AUT-4 · AUT-7 · AUT-9 | M2 rodando por 2 semanas |
| **4** | A11–A15 (devolução, posse, teto, faixa) | dados confiáveis |
| **5** | AUT-5 · AUT-8 · AUT-10 · AUT-11 · AUT-12 | — |

> **A regra de ouro:** nenhuma automação de **devolução** antes de a operação estar
> **registrando**. Devolver leads que estão sendo trabalhados sem registro quebraria a
> confiança do time no sistema — e a confiança é mais cara de recuperar que o lead.
