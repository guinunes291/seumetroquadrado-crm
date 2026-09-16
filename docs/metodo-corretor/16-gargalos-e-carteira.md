# DOCUMENTO 16 — Gargalos do funil e qualidade da carteira

---

# PARTE 1 — ONDE OS LEADS ESTÃO MORRENDO

## 1.1 O mapa do vazamento

**[MEDIDO 16/09/2026]** · base 58.144 leads

```
ENTRADA ────────────────────────────────────────────────── 58.144
   │
   ├─ 🔴 EMPOÇAMENTO 1: aguardando_atendimento ........... 48.049  (82,6%)
   │      lead com dono e sem primeiro contato
   │      ↓ passa apenas uma fração
   │
   ├─ 🔴 EMPOÇAMENTO 2: em_atendimento .................... 6.460  (11,1%)
   │      "em atendimento" virou rótulo, não estado
   │      ↓ conversão para agendado: 7%  (meta 70%)
   │
   ├─ 🟠 aguardando_retorno ................................. 666
   │      85,4% desta fase estava parada
   │
   ├─ ⚪ agendado ............................................. 74
   ├─ ⚪ visita_realizada ..................................... 38
   ├─ 🟢 analise_credito .................................... 140   ← converte 39,1%
   │      e estava 92,5% parada
   │
   └─ VENDA .................................................. ⚠️ 0 registradas em 90 dias
```

**A razão fundo/topo é de 1 para 190.** Um funil MCMV saudável fica entre 1:20 e 1:40.

## 1.2 Os 6 gargalos, em ordem de custo

### 🔴 G1 — `em_atendimento → agendado` a 7% (meta 70%)

| | |
| --- | --- |
| **Custo** | Com 7%, são necessários **434 leads/semana** para 1 venda, contra 43 na meta. **10× mais.** |
| **Causa** | Não se oferece a visita. O copy do próprio CRM diz: *"'Em atendimento' virou rótulo, não estado."* |
| **Correção** | Oferta assumida com duas opções de horário, em **toda** conversa. |
| **Instrumento** | [Módulo 8 do treinamento](14-treinamento.md) · meta de 1,4 agendamento/dia |
| **Ganho** | 7% → 35% reduz em **5×** o volume necessário |

### 🔴 G2 — 5.886 leads em tratativa sem corretor (89,4% dos parados)

| | |
| --- | --- |
| **Custo** | Toda a reserva de fundo de funil sem dono. Alguns em `em_atendimento` **há 90 dias**. |
| **Causa** | Devolução automática desligada + ausência de constraint + um evento de lote em 14/09 |
| **Correção** | [M1 do Doc 10](10-melhorias.md) — reatribuição em lotes de 200/dia, priorizando o fundo |
| **Ganho** | Recupera o estoque mais valioso da casa |

### 🔴 G3 — `aguardando_atendimento` com 48.049 leads

| | |
| --- | --- |
| **Custo** | Paralisia. 82,6% da base numa etapa que exige ação individual. |
| **Causa** | A esteira de plantão despeja **4.320/dia**; +15.038 em 4 dias com apenas 423 leads novos no mês |
| **Correção** | [M4](10-melhorias.md) — a esteira respeita o teto da carteira ativa |
| **Ganho** | O corretor volta a ver uma carteira trabalhável |

### 🟠 G4 — `analise_credito` 92,5% parada

| | |
| --- | --- |
| **Custo** | É a passagem que converte **39,1%** — a melhor do funil. 140 leads aqui valem ~55 vendas em expectativa. |
| **Causa** | Pasta parada sem rotina de cobrança semanal |
| **Correção** | Alerta automático aos 3 dias ([AUT-3](11-automacoes.md)) + bloco 1 da rotina diária |

### 🟠 G5 — O registro não acontece

Não é um gargalo de etapa — é o gargalo de **medição**, e ele torna todos os outros
invisíveis. Ver [Diagnóstico §5](01-diagnostico.md#5).

### 🟡 G6 — `perdido` em 3,6%

Sem fechar ciclo, a carteira entope de gente morta e a casa não descobre se o problema é
mídia, produto ou crédito.

## 1.3 Gargalos por corretor

**[MEDIDO]** leads parados 5+ dias em tratativa, com dono:

| Corretor | Leads parados | Leitura |
| --- | ---: | --- |
| Jefferson Luiz | 127 | 🔴 quase 2× o teto da carteira |
| Ana Caroline Pereira | 106 | 🔴 acima do teto |
| Leticia Brandão | 102 | 🔴 acima do teto |
| graziele gomes | 98 | 🔴 acima do teto |
| Leonardo vrena | 46 | 🟠 |
| Bruno Soares Martins | 31 | 🟠 |
| Leticia Castro | 30 | 🟠 |
| demais 29 corretores | ≤ 22 cada | ⚪ |

**A leitura correta é contraintuitiva.** Os quatro primeiros **não são os piores
corretores — provavelmente são os que mais trabalham**. Eles têm carteira grande porque
receberam muito lead. O problema é que a carteira deles está **1,5 a 2× acima do teto de
65**, e acima do teto nenhum ser humano consegue dar próximo passo a todo mundo.

**Correção:** não é cobrança individual. É aplicar o teto na **distribuição** (M4) e
devolver o excedente à Reserva.

## 1.4 Gargalos por projeto e por origem

**Não foi possível apurar.** Sem desfecho registrado não há atribuição de resultado a
projeto nem a origem. Esta análise fica **bloqueada até M2 estar rodando por 4 semanas**
— e é uma das principais razões para priorizá-lo: sem ela, a SMQ não sabe qual campanha
e qual empreendimento dão retorno.

---

# PARTE 2 — QUALIDADE DA CARTEIRA

## 2.1 Por que NÃO usar A / B / C / D como se pede normalmente

O briefing sugeria classificar em A (quente) · B (oportunidade) · C (médio prazo) ·
D (nutrição). **Recomendo não criar essa classificação.** Três razões:

1. **O CRM já tem duas classificações** — `temperatura` (derivada) e o **Score de
   prioridade** (0–100). Uma terceira criaria três respostas para a mesma pergunta.
2. **Classificação escolhida pelo corretor é sempre otimista.** Todo mundo acha que o
   cliente é "A". O briefing já reconhece isso: *"o corretor não deve simplesmente
   escolher 'cliente quente'"*.
3. **O comportamento já está disponível** — etapa, dias parados, quem falou por último,
   documento enviado. Não falta critério; falta usá-lo.

## 2.2 A classificação que eu recomendo — derivada, não escolhida

Quatro classes, **calculadas pelo sistema**, sem nenhum campo novo:

| Classe | Nome | Critério objetivo (tudo já existe no banco) | Ação do corretor |
| :---: | --- | --- | --- |
| **A** | **Comprando agora** | `analise_credito` **ou** `visita_realizada` **ou** documento recebido nos últimos 7 dias **ou** venda em negociação | Toque **diário**. É a única classe que justifica interromper qualquer coisa. |
| **B** | **Avançando** | `agendado` **ou** `em_atendimento` com interação de entrada nos últimos 3 dias **ou** próximo passo com prazo em até 7 dias | Régua acelerada (mult. 0,5). **Oferecer visita em toda conversa.** |
| **C** | **Vivo, mas sem tração** | Já respondeu alguma vez, mas sem interação de entrada há 3–30 dias | Régua normal por temperatura. Toque de **valor**, não cobrança. |
| **D** | **Nunca engatou** | Nunca respondeu, ou sem nenhum movimento há 30+ dias | Termina a régua e vai para a **Reserva** → depois **Bolsão** |
| **P** | **Perdido** | Marcado com uma das 11 categorias | Reativação em 30/60/90 dias por categoria |
| **V** | **Venda** | `contrato_fechado` com venda aprovada | Pós-venda + **pedir indicação** |

### O que muda em relação ao Score atual

O Score de prioridade responde **"quem chamar primeiro hoje"**. Esta classificação
responde **"que tipo de relacionamento este cliente exige"**. São perguntas diferentes e
complementares:

- Um lead **classe A parado há 20 dias** tem Score alto **e** classe alta → emergência
- Um lead **classe D com Score alto** (só porque está parado há muito tempo) → **não é
  emergência**, é candidato à Reserva

> **Hoje o CRM confunde os dois casos.** O balde `fundo` ordena por dias parados, o que
> é certo; mas o balde `esfriando` sobe lead classe D por tempo parado, gastando o dia
> do corretor com quem nunca respondeu.

### A regra de ouro da classificação

> **Documento recebido move o cliente para classe A imediatamente.**

É o sinal de intenção mais forte do funil — mais forte que responder mensagem, mais
forte que agendar. Cliente que envia RG e comprovante de renda está comprando.

**[MEDIDO]** há 1.636 documentos no sistema, com ingestão ativa por API — e **nenhum
balde da Fila Única reage a documento recebido**. Só existe o balde de documento
*pendente* (problema). Ver [Doc 15, Lacuna 1](15-modo-corretor.md).

## 2.3 A saúde da carteira — o placar do corretor

| Indicador | Verde | Amarelo | Vermelho |
| --- | :---: | :---: | :---: |
| Tamanho da carteira ativa | 50–65 | 30–49 ou 66–80 | < 30 ou > 80 |
| % classe A + B | ≥ 25% | 15–24% | < 15% |
| % classe D | ≤ 30% | 31–50% | > 50% |
| Leads sem próximo passo | 0 | 1–5 | > 5 |
| Fundo do funil parado 5+ dias | 0 | 1–2 | ≥ 3 |
| Perdidos marcados no mês | ≥ 20% do que entrou | 10–19% | < 10% |

**A linha mais reveladora é a última.** Corretor que não marca perdido tem carteira
entupida e **acha que "não está chegando lead"** — quando na verdade ele está bloqueando
a própria entrada pelo teto de 65.

## 2.4 O diagnóstico da carteira da casa hoje

Aplicando a classificação à base **[MEDIDO]**:

| Classe | Critério aproximado pelo status | Leads | % |
| :---: | --- | ---: | ---: |
| **A** | `analise_credito` + `visita_realizada` | **178** | **0,3%** |
| **B** | `agendado` | 74 | 0,1% |
| **C** | `aguardando_retorno` + parte de `em_atendimento` | ~7.100 | 12,2% |
| **D** | `aguardando_atendimento` + `novo` | **48.064** | **82,7%** |
| **P** | `perdido` | 2.104 | 3,6% |

> **0,4% da base da SMQ está em classe A ou B.** Em uma carteira saudável, A+B deveria
> ser 25% do que está ativo.
>
> Isto não significa que a SMQ tem uma base ruim. Significa que **82,7% da base nunca
> foi tocada** — e que o trabalho não é comprar mais lead: é **trabalhar o que já está
> comprado.**

## 2.5 A conta que fecha o estudo

```
48.064 leads em classe D (nunca tocados)
     × 2,30% de conversão na meta do funil
     ───────────────────────────────────
     ≈ 1.105 vendas potenciais na base atual

Com ~36 corretores com carteira e 1 venda/semana cada:
     36 vendas/semana → a base atual dá ~31 semanas de trabalho
```

*(36 = número de corretores que aparecem com leads atribuídos na consulta de
negociações paradas. **[MEDIDO]** Há 53 perfis ativos, mas o conjunto inclui admin,
`docs-bot` e contas de gestão.)*

**A SMQ não precisa de mais leads. Precisa de mais registro.**

E a conclusão de gestão que vem junto: se a base atual comporta ~31 semanas de meta
cheia, **o investimento marginal em mídia rende menos, hoje, do que o investimento em
disciplina de registro.** Isso se inverte no dia em que a classe D cair abaixo de 50%
da base.
