# DOCUMENTO 15 — O "MODO CORRETOR" e a regra dos 5 minutos

---

# PARTE 1 — MODO CORRETOR

## A ideia

O corretor abre o CRM e vê **uma tela só**, que responde à única pergunta que importa:
*"o que eu faço hoje, e estou no ritmo?"*

A boa notícia: **80% disso já existe** na Fila Única. O que falta é a **missão do dia**
no topo e o **semáforo de ritmo**.

---

## A tela proposta

```
┌──────────────────────────────────────────────────────────────────────┐
│  Terça, 16 de setembro                              🟡 RITMO 3/5     │
│                                                                      │
│  BOM DIA, AMANDA. SUA MISSÃO HOJE:                                   │
│                                                                      │
│   💰  4 clientes no fundo do funil parados     R$ 1,2 mi em jogo     │
│   ⏱️   2 leads novos  ·  SLA vence em 8 min    ← COMECE POR AQUI     │
│   💬  3 clientes responderam e esperam                               │
│   📅  12 follow-ups vencidos ou de hoje                              │
│   ⚠️   7 clientes sem próximo passo                                   │
│   📁  2 pastas travadas por documento                                │
│   📆  3 visitas para confirmar (D-1)                                 │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────   │
│  SEU PLACAR DE HOJE                        SUA SEMANA                │
│                                                                      │
│  Desfechos       ▓▓▓▓▓▓░░░░  12/20         Agendamentos   ▓▓▓▓░░ 4/7 │
│  Leads tocados   ▓▓▓▓▓▓▓░░░  18/25         Visitas        ▓▓░░░░ 1/4 │
│  Agendamentos    ▓▓▓▓▓▓▓░░░   1/1,4        Análises       ▓▓▓░░░ 2/3 │
│  Vencidos        ▓▓▓▓▓▓▓▓░░  12 → meta 0   ───────────────────────── │
│  Sem próx. passo ▓▓▓▓▓░░░░░   7 → meta 0   🎯 META: 1 VENDA          │
│                                                                      │
│  ⚡ Faltam 3 agendamentos. Pela sua conversão, isso são ≈ 34 contatos.│
│     Você tem 2 dias úteis. Priorize o grupo "Cliente respondeu".      │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                      │
│              [ COMEÇAR PELO MAIS CARO → ]                            │
└──────────────────────────────────────────────────────────────────────┘
```

Abaixo dessa faixa, **a Fila Única como já é hoje**: os 7 grupos, os cards com Ligar /
Zap / Resumo / Registrar, o funil das etapas e o painel de vazamentos.

---

## O que já existe e o que precisa ser construído

| Elemento | Estado | Onde |
| --- | :---: | --- |
| Os 7 grupos com contagem | ✅ | `FilaUnica.porBucket` |
| Dinheiro em jogo | ✅ | `resumo.emJogo` |
| Vencidos · vencem hoje · sem próximo passo | ✅ | `resumo` |
| SLA correndo | ✅ | `resumo.slaCorrendo` |
| Agenda do dia / visitas a confirmar | ✅ | `fila-lateral.tsx` |
| Metas declaradas e realizado | ✅ | `metas-dia` |
| A frase de ritmo ("faltam 3 agendamentos…") | ✅ | `mensagemCheckpoint()` |
| Cálculo de contatos necessários | ✅ | `contatosNecessarios()` |
| **A saudação + missão em linguagem de missão** | 🔴 | criar |
| **O semáforo IAM 🟢🟡🔴 no topo** | 🔴 | criar |
| **O placar de hoje × placar da semana lado a lado** | 🔴 | criar |
| **A frase de ritmo fora do popup, sempre visível** | 🔴 | mover |

> **Conclusão de produto:** o "Modo Corretor" não é uma tela nova. É uma **faixa de
> 200px no topo da `/fila`** que costura peças que já existem. Dificuldade **M**,
> impacto alto.

---

## As três regras de design que eu imporia

**1. Um número por linha, e cada número leva a uma ação.**
Clicar em "4 clientes no fundo do funil" rola a página até aquele grupo. Número que não
é clicável é decoração.

**2. A missão é imperativa, não descritiva.**
"4 clientes no fundo do funil parados" e não "Fundo do funil: 4". A primeira forma diz o
que fazer; a segunda é um relatório.

**3. O semáforo nunca é só vermelho — ele diz o que falta.**
🔴 sozinho desmotiva. 🔴 **2/5 — faltam 8 desfechos e zerar 12 vencidos** dá um caminho.

---

## O Modo Corretor no celular

O celular é onde o corretor passa 70% do tempo. A versão reduzida:

```
┌─────────────────────────────┐
│ Ter, 16 set       🟡 3/5    │
│                             │
│ SUA MISSÃO HOJE             │
│  💰 4 no fundo   R$ 1,2 mi  │
│  ⏱️  2 novos · SLA 8 min     │
│  💬 3 responderam            │
│  📅 12 follow-ups            │
│  ⚠️  7 sem próximo passo     │
│                             │
│ Desfechos  ▓▓▓▓▓▓░░ 12/20   │
│ Semana: 4/7 agendamentos    │
│                             │
│ ⚡ Faltam 3 agendamentos     │
│    ≈ 34 contatos · 2 dias   │
│                             │
│    [ COMEÇAR → ]            │
└─────────────────────────────┘
```

---

# PARTE 2 — A REGRA DOS 5 MINUTOS

> **Teste:** o corretor precisa responder estas 8 perguntas em **menos de 5 minutos**,
> sem pedir ajuda. Se não conseguir, é falha do CRM, não dele.

| # | Pergunta | Onde responde hoje | Tempo | Status |
| :-: | --- | --- | :---: | :---: |
| 1 | **Quem eu tenho que chamar agora?** | `/fila` — o primeiro card | 5 s | ✅ |
| 2 | **Quem está mais próximo de comprar?** | `/fila` — grupo "Fundo do funil parado" | 10 s | ✅ |
| 3 | **Quem precisa de follow-up?** | `/fila` — grupo "Follow-up vencido ou de hoje" | 10 s | ✅ |
| 4 | **Quem está parado?** | `/fila` — grupos "Sem próximo passo" + "Esfriando" | 10 s | ✅ |
| 5 | **Quem tem agendamento?** | Agenda na coluna lateral (desktop) · `/agendamentos` (celular) | 15 s | 🟠 |
| 6 | **Quem enviou documento?** | 🔴 **não tem resposta direta** | — | 🔴 |
| 7 | **Quantos clientes estou avançando?** | Funil da `/fila` — mas mostra o estoque, não o fluxo do período | 60 s | 🟠 |
| 8 | **Estou perto ou longe da meta semanal?** | 🔴 só dentro do popup de metas, que já fechou | — | 🔴 |

**Resultado do teste: 4 respostas de 8 são imediatas. Duas são difíceis e duas não têm
resposta.**

## As 4 lacunas, e a correção de cada uma

### 🔴 Lacuna 1 — "Quem enviou documento?" (pergunta 6)

**Problema.** O balde `docs` mostra **pasta travada** (documento *pendente ou
reprovado*), não **documento recém-chegado**. São coisas opostas: a primeira é um
problema, a segunda é uma **oportunidade quente** — o cliente acabou de agir.

**Por que importa.** Cliente que manda documento está comprando. É o sinal de intenção
mais forte do funil inteiro, mais forte que responder mensagem.
**[MEDIDO]** há 1.636 documentos no sistema e ingestão ativa por API — este sinal existe
e está sendo ignorado.

**Correção.** Um balde novo **entre `sla` e `responder`**: *"Mandou documento"* —
documento com `status = recebido` nas últimas 48h. E um push imediato.
**Dificuldade M · alto impacto.**

### 🔴 Lacuna 2 — "Estou perto ou longe da meta?" (pergunta 8)

**Problema.** A resposta existe (`metas-dia`), mas mora dentro de um popup que abre uma
vez de manhã e fecha.

**Correção.** A faixa do Modo Corretor (Parte 1), **sempre visível** no topo da `/fila`.
**Dificuldade M.**

### 🟠 Lacuna 3 — "Quantos estou avançando?" (pergunta 7)

**Problema.** O funil da Fila Única mostra **quantos estão em cada etapa** (estoque),
não **quantos mudaram de etapa nesta semana** (fluxo). Estoque não responde "estou
avançando".

**Correção.** Contador de **transições da semana** no painel do funil:
*"Esta semana você avançou 12 leads: 5 para em atendimento, 4 para agendado, 2 para
visita, 1 para análise."* Os dados existem em `lead_eventos`.
**Dificuldade M.**

### 🟠 Lacuna 4 — "Quem tem agendamento?" no celular (pergunta 5)

**Problema.** A coluna lateral com a Agenda do dia **não aparece no celular** — é preciso
sair da `/fila` e ir para `/agendamentos`.

**Correção.** Faixa compacta "Hoje: 3 visitas" logo abaixo da missão, com toque para
expandir. **Dificuldade P.**

---

## O teste de aceitação do Modo Corretor

Quando estas 5 afirmações forem verdadeiras, o Modo Corretor está pronto:

```
☐ Um corretor novo abre o CRM e sabe o que fazer em 10 segundos, sem treino
☐ As 8 perguntas da regra dos 5 minutos são respondidas em menos de 2 minutos
☐ O corretor nunca precisa perguntar "quem eu chamo agora?"
☐ O corretor sabe, a qualquer hora do dia, se está no ritmo da meta semanal
☐ Ao fim do dia, o corretor sabe em 30 segundos se pode ir embora
```

O quinto já é verdade hoje (os dois zeros do placar). Os outros quatro dependem da
faixa da Parte 1 e das quatro correções acima — **tudo dificuldade P ou M, nenhuma
migration.**
