# DOCUMENTO 4 — Passo a passo diário do corretor

Esta rotina foi desenhada **sobre o CRM que existe**, não sobre um CRM ideal. Cada passo
aponta a tela real, o botão real e o que fica registrado.

---

## A regra que sustenta o dia inteiro

> **Você não escolhe o cliente. A fila escolhe.**
> Sua única decisão é: *executar o card de cima e registrar o desfecho.*

Se você abriu a Base de leads (`/leads`) para "procurar alguém para chamar", você
desligou o motor de priorização do CRM e voltou a trabalhar por memória. **A memória
perde clientes. A fila não.**

---

## 08:50 — ANTES DE COMEÇAR (10 min)

| # | Ação | Onde | Por quê |
| :-: | --- | --- | --- |
| 1 | **Marcar presença** (botão "Cheguei") | topo do app | Sem presença, **você não recebe lead nenhum** — nem quente, nem base. É regra da roleta. |
| 2 | **Declarar as metas do dia** no popup | popup bloqueante | Agendamentos · documentações · vendas da semana. É o popup que liga os checkpoints das 12h, 15h e 17h. |
| 3 | **Abrir `/fila`** e ler o placar | Fila Única | Anel "N de 65" · vencidos · vencem hoje · sem próximo passo · **dinheiro em jogo** |
| 4 | **Olhar a Agenda de hoje** (coluna lateral) | `/fila` desktop · `/agendamentos` no celular | Visitas e reuniões do dia. Marque quais precisam de confirmação. |

**O que você quer ver no placar:** vencidos = 0, sem próximo passo = 0.
Se "vencidos" estiver em dois dígitos, esse é o seu dia — nada mais importa.

---

## 09:00 – 10:30 — BLOCO 1 · O DINHEIRO QUE JÁ ESTÁ NA MESA

**Grupos que você trabalha:** `Fundo do funil parado` → `Chegaram agora` → `Cliente respondeu e espera`

### Por que nesta ordem e não "leads novos primeiro"

A tese está escrita no código da Fila Única e é sustentada por dados:

> *"Um lead em análise parado há 66 dias vale mais do que 200 leads frios novos."*

- `analise_credito` **converte 39,1%** para venda — a melhor passagem do funil. **[MEDIDO]**
- Em 12/09, **124 dos 134** leads em análise estavam parados 5+ dias. **[MEDIDO]**
- Um lead frio novo converte uma fração de 1%.

Trabalhar lead novo antes de pasta parada é trocar 39% por 0,5%. **Nunca faça isso.**

### 1.1 Fundo do funil parado (`agendado` · `visita_realizada` · `analise_credito`)

Ordem interna: **mais dias sem movimento primeiro.**

| Situação do card | O que fazer | Desfecho a registrar |
| --- | --- | --- |
| **Análise de crédito** | Ligar para o cliente **e** cobrar a Caixa/correspondente | `aprovado` · `aguardando Caixa` · `reprovado` · `não atendeu` |
| **Visita realizada** | Fechar a pasta enquanto a visita está fresca | `quer proposta` · `objeção` · `não atendeu` |
| **Agendado** | **Confirmar a visita** (D-2, D-1, D+0) | `foi` · `no-show` · `remarcou` · `desistiu` |

> ⚠️ Se o card diz "Agendado" e **não existe agendamento na sua Agenda**, crie agora
> pelo modal de etapa. Sem ele não há confirmação automática e o cliente não aparece.

### 1.2 Chegaram agora (SLA correndo)

**Prazo: 15 minutos úteis** para lead quente. Estourou, o lead vai para o próximo da
roleta — e dois estouros no mesmo dia **pausam você no quente até amanhã**.

Sequência que funciona: **ligar → se não atender, WhatsApp na hora → registrar
"não atendeu"** (o CRM já agenda o toque 2 da régua).

### 1.3 Cliente respondeu e espera

O cliente falou por último. **Cada minuto conta.** Desfechos: `enviei simulação` ·
`agendei visita` · `objeção`.

---

## 10:30 – 12:00 — BLOCO 2 · A RÉGUA (não deixar ninguém esfriar)

**Grupos:** `Follow-up vencido ou de hoje` → `Sem próximo passo`

### 2.1 Follow-up vencido ou de hoje

Ordem interna: **mais vencido primeiro.** Cada card mostra `Toque N/13`, o canal
(WhatsApp ou ligação — toques **3, 7 e 11 são ligação**) e a mensagem já montada.

Fluxo por card: **[Zap]** ou **[Ligar]** → **[Registrar]** → o CRM agenda o próximo
toque conforme a temperatura. Você não calcula data nenhuma.

### 2.2 Sem próximo passo — o balde que não pode existir

Estes são leads ativos **sem tarefa, sem agendamento e sem follow-up**. São clientes que
você vai esquecer.

> **Meta diária: terminar o dia com o balde "Sem próximo passo" zerado.**

Mesmo que o desfecho seja "não atendeu", o CRM cria a próxima tarefa. **Nunca deixe um
card sem desfecho.**

### ⏰ 12:00 — CHECKPOINT 1

O CRM te avisa: *"Ritmo abaixo da meta às 12h. Faltam 2 agendamentos. Com 33% do dia
passado, o esperado era já ter 1."* — e sugere quantos contatos faltam pela sua
conversão. **Leia e corrija o ritmo.**

---

## 13:30 – 15:30 — BLOCO 3 · CONVERTER CONVERSA EM VISITA

**Grupos:** `Esfriando` → `Pasta travada` · foco no gargalo

### Por que este bloco existe

🔴 A passagem `em_atendimento → agendado` marca **5,4% contra meta de 70%**. **[MEDIDO]**
É o gargalo #1 da SMQ. Um bloco inteiro do dia é dedicado a ele.

### 3.1 A pergunta que fecha agendamento

Em **toda** conversa ativa, faça a oferta de visita de forma assumida:

> *"Fulano, separei duas opções que cabem na sua renda. Vou te mandar a simulação
> agora. Você prefere conhecer **sábado de manhã ou sábado à tarde**?"*

Escolha entre duas opções, não "quer visitar?". Sem oferta de visita, o lead volta para
`esfriando` e você o perde em 3 dias.

### 3.2 Esfriando (quente/morno, 3+ dias sem contato)

Toque de valor, não cobrança: novidade do empreendimento, mudança de condição,
unidade liberada. A régua já traz a mensagem por fase (abertura / consultiva /
encerramento).

### 3.3 Pasta travada

Documento pendente ou reprovado segurando a análise. Cobre o documento específico,
pelo nome. **[MEDIDO]** os documentos são o módulo mais bem usado da casa — use isso
a seu favor.

### ⏰ 15:00 — CHECKPOINT 2

---

## 15:30 – 17:30 — BLOCO 4 · ANTI-OCIOSIDADE

**Só entre aqui quando a fila do dia estiver zerada.** Se ainda há card na `/fila`,
volte para ele.

Ordem obrigatória (a fila anti-ociosidade completa está no
[Documento 7 §4](07-matriz-prioridades.md)):

| # | Onde | O que buscar |
| :-: | --- | --- |
| 1 | **Reserva** (`/reserva`) | O que saiu da sua carteira. Comece por "Sem próximo passo". Resgate até 13. |
| 2 | **Modo Foco** (`/prospeccao`) | Lote de `aguardando_atendimento` da sua carteira, um por vez |
| 3 | **Discador** (`/discador`) | Blocos de 30–45 min no Bolsão. **Tabule toda ligação.** |
| 4 | **Bolsão** (`/bolsao`) | Prefira `já houve conversa`; depois `tentaram, sem resposta`; por último `nunca tocado` |
| 5 | **Oferta Ativa** | Lista segmentada para campanha |

> **A regra:** enquanto houver cliente na base da SMQ — e há **58.144** — você nunca
> fica sem próxima ação comercial. Ociosidade no CRM da SMQ é escolha, não falta de lead.

### ⏰ 17:00 — CHECKPOINT 3

---

## 17:30 – 18:00 — FECHAMENTO DO DIA (30 min, inegociável)

| # | Ação | Como conferir |
| :-: | --- | --- |
| 1 | **Zerar "Sem próximo passo"** | placar da `/fila` deve mostrar 0 |
| 2 | **Zerar "Vencidos"** | ou reagendar com data realista — nunca deixar vencido |
| 3 | **Nenhum lead novo sem atendimento** | balde `Chegaram agora` vazio |
| 4 | **Confirmar as visitas de amanhã** | Agenda → cada visita com confirmação |
| 5 | **Marcar os perdidos do dia com motivo** | uma das 11 categorias, nunca "outro" vazio |
| 6 | **Registrar documentos recebidos** | pasta atualizada |
| 7 | **Conferir o placar do dia** | agendamentos e documentações × meta declarada |
| 8 | **Olhar a agenda de amanhã** | saber onde o dia começa |

> **O teste de 30 segundos para saber se o seu dia está fechado:**
> abra `/fila`. Se o placar mostra **vencidos = 0** e **sem próximo passo = 0**,
> pode ir embora. Se não, você ainda tem trabalho — e é trabalho que vale dinheiro.

---

## Resumo visual do dia

```
08:50 ── Presença · Metas · Placar · Agenda
09:00 ── BLOCO 1  Fundo parado → SLA → Respondeu        ← o dinheiro na mesa
10:30 ── BLOCO 2  Follow-up vencido → Sem próximo passo ← não perder ninguém
12:00 ── ⏰ checkpoint
13:30 ── BLOCO 3  Esfriando → Pasta travada → AGENDAR   ← o gargalo #1
15:00 ── ⏰ checkpoint
15:30 ── BLOCO 4  Reserva → Modo Foco → Discador → Bolsão ← anti-ociosidade
17:00 ── ⏰ checkpoint
17:30 ── FECHAMENTO  zerar · confirmar · marcar perdidos · agenda de amanhã
```

## O que muda nesta rotina em relação ao que se faz hoje

| Hoje **[MEDIDO]** | A partir de agora |
| --- | --- |
| Abre a Base de leads e escolhe pelo nome | Abre `/fila` e executa de cima para baixo |
| Move o card de etapa | **Registra o desfecho** (que move a etapa junto) |
| Marca visita no WhatsApp | **Cria o agendamento no CRM** |
| Lead frio novo antes de pasta parada | Fundo do funil **sempre primeiro** |
| Lead sem próximo passo fica "no radar" | Balde `sem_acao` zerado todo dia |
| Lead morto fica na carteira | `perdido` com motivo, no mesmo dia |
