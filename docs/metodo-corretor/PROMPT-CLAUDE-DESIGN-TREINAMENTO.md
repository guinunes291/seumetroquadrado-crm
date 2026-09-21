# Prompt para o Claude Design — apresentação de treinamento do CRM SMQ

**Como usar:** copie tudo abaixo da linha e cole no Claude Design.
O prompt é autossuficiente: leva a identidade, os dados e o conteúdo de todos os 37
artboards. Não precisa de nenhum anexo.

---

Crie uma **apresentação de treinamento** em canvas, com **37 artboards de 1920 × 1080**,
para formar corretores de imóveis no CRM da **Seu Metro Quadrado (SMQ)** — imobiliária
de São Paulo focada em MCMV e lançamentos.

**Público:** corretores, alguns com pouca familiaridade digital. Projetado em sala, em
dois encontros de ~2h.
**Objetivo:** ao final, o corretor sabe operar o CRM sozinho e sabe exatamente quanto
precisa fazer por dia para uma venda por semana.

---

## 1. Identidade visual

Navy e dourado, a identidade da casa. **Não use paleta genérica de SaaS.**

| Token | Hex | Uso |
| --- | --- | --- |
| Navy | `#12294A` | fundo dos artboards escuros; cor dominante (60%) |
| Navy profundo | `#0B1B33` | texto sobre dourado |
| Navy claro | `#1B3760` | cards dentro de fundo escuro |
| Dourado | `#D8B944` | acento sobre escuro — números, destaques |
| Dourado escuro | `#9A7A15` | acento sobre claro |
| Dourado suave | `#F5EBCD` | fundo de caixa de destaque no claro |
| Papel | `#F4F2ED` | fundo dos artboards claros |
| Branco | `#FFFFFF` | cards sobre papel |
| Tinta | `#1B2A44` | texto principal |
| Tinta 2 | `#46586F` | texto secundário |
| Tinta 3 | `#7C8DA3` | legendas |
| Vermelho | `#A32316` / suave `#F7E3DF` | o que está errado |
| Verde | `#166B45` / suave `#DFEDE5` | o que está certo |
| Linha | `#DCD8CF` | bordas de card |

**Tipografia:** **Sora** (Google Fonts) para títulos e números — é a fonte da marca.
**IBM Plex Sans** para corpo e rótulos.

| Papel | Tamanho | Peso |
| --- | --- | --- |
| Título de artboard | 64–76 px | 800 |
| Título de módulo (capa) | 96–120 px | 800 |
| Número gigante (estatística) | 140–220 px | 800 |
| Sobrancelha (eyebrow) | 22 px, caixa alta, tracking 2px | 600 |
| Corpo | 30–34 px | 400 |
| Rótulo de card | 26 px | 600 |
| Legenda | 22 px | 400 |

**Motivo visual, repetido em todo o deck:** **círculo dourado sólido com número dentro**,
em Sora bold navy-profundo. Use para numerar passos, baldes da fila, módulos. É o único
elemento decorativo recorrente.

**Estrutura sanduíche:** capa e módulos em **navy**; conteúdo em **papel**; fechamento em
navy. Cada módulo abre com um artboard escuro de capa.

## 2. Regras de layout

- Margem mínima de **96 px** em todos os lados.
- Sobrancelha no topo, título abaixo, conteúdo a partir de ~320 px do topo.
- **Varie o layout entre artboards**: duas colunas, grade 2×2, cards em linha, número
  gigante à esquerda com texto à direita, linha do tempo horizontal.
- **Nunca** repita o mesmo arranjo em dois artboards seguidos.
- Texto de corpo sempre alinhado à esquerda. Centralize só títulos de capa.
- Um artboard = uma ideia. Se precisar de duas, são dois artboards.

## 3. Proibido

- ❌ Linha ou barra de acento embaixo de título
- ❌ Faixas ou listras coloridas decorativas na borda de cards ou do artboard
- ❌ Emoji como marcador de seção
- ❌ Gradiente roxo-azul, fundo creme/bege, Inter ou Space Grotesk
- ❌ Artboard só de texto — todo artboard precisa de elemento visual (número, card,
  diagrama, ícone em círculo)
- ❌ **Inventar qualquer número.** Use exclusivamente os da seção 4.

## 4. Os dados reais — use só estes

Medidos no banco de produção da SMQ em **16/09/2026**.

**Resultado da casa (12 meses):** 126 vendas · 116 aprovadas · **R$ 32,2 milhões de VGV** ·
setembro/2026 foi o melhor mês, com 29 vendas.

**As 8 passagens do funil — atual × meta da casa:**

| Passagem | Hoje | Meta |
| --- | ---: | ---: |
| Distribuição (lead ganha dono) | 92,6% | 100% |
| 1º contato efetivo | 65,8% | 50% |
| Qualificação | 91,6% | 50% |
| Qualificado vira conversa | 93,4% | 90% |
| **Agendamento (conversa vira visita)** | **5,4%** | **70%** |
| Comparecimento na visita | 79,8% | 65% |
| Pasta / proposta | 87,0% | 75% |
| Fechamento | 45,3% | 30% |

**Sete das oito estão na meta ou acima. Uma trava.** Levar só a passagem do agendamento
à meta multiplica a conversão da casa por **13** (0,70 ÷ 0,054).
Há **6.439 clientes** parados em "em atendimento" — a maior etapa comercial do funil.

**Quantos leads custam 1 venda, por origem (safra de 6 meses, 32.552 leads, 82 vendas):**

| Origem | Leads por venda |
| --- | ---: |
| Indicação / carteira própria | **3** |
| Lead captado pelo próprio corretor | **6** |
| Impulso SMQ | 52 |
| Facebook | **413** |
| Chatbot | 602 |
| Base importada | **6.550** |

**1% dos leads gera 83% das vendas.**

**Metas de atividade:** 20 desfechos registrados/dia · 25 clientes tocados/dia ·
**2 captações próprias/dia** · 1,4 agendamento/dia.
Na semana: 6 captações · 7 agendamentos · 4,4 visitas · 3,3 análises de crédito · 1 venda.

**Honestidade sobre o prazo:** hoje o melhor corretor da casa faz **0,40 venda por
semana**. Ninguém chega a 1 ainda. Mês 1–2: 6 captações/semana + 1 venda no mês.
Mês 3–4: 1 venda a cada 2 semanas. Mês 6+: 1 venda/semana.

**Regras do sistema:** carteira ativa de **65** clientes · régua de **13 toques** (os
toques 3, 7 e 11 são por ligação) · SLA de **15 minutos úteis** para o primeiro contato
em lead quente, e **2 estouros no mesmo dia** pausam o corretor no lead quente até o dia
seguinte · **11 categorias** de motivo de perda.

**O que foi consertado em 16/09/2026** (a abertura do treinamento): a régua criava tarefa
e nunca fechava — 96% venciam; o balde "cliente respondeu" nunca acendeu (1 resposta
registrada em 90 dias); o painel do funil não existia no banco; e o funil somava 43 mil
clientes da pré-venda dentro de "aguardando atendimento".

## 5. Os 37 artboards

### Abertura — 3 artboards

1. **Capa** (navy). "Treinamento do CRM SMQ" · "Como usar o sistema para vender toda
   semana" · "10 módulos · 2 encontros". Dourado no subtítulo.
2. **O mapa do treinamento** (papel). Os 10 módulos em grade 2×5, cada um com seu círculo
   dourado numerado e o título. Destaque visual nos módulos 3 e 8 — são os que mudam o
   resultado.
3. **Antes de começar** (navy). "Antes de pedir qualquer coisa a vocês, consertamos o que
   estava quebrado." Os quatro consertos da seção 4, em cards navy-claro com ✓ dourado.
   Frase de fecho: *"Pedir obediência a um sistema quebrado teria sido injusto."*

### Módulo 1 — Por que o CRM existe · 3 artboards

4. **Capa do módulo 1** (navy). Círculo dourado com "1", título grande.
5. **Você não escolhe o cliente. A fila escolhe.** (papel). Texto à esquerda explicando
   que o sistema sabe dias parados, etapa, dinheiro em jogo e quem prometeu voltar.
   À direita, o ciclo em 5 passos numerados: o CRM identifica a prioridade → você executa
   → o CRM registra → o CRM cria a próxima ação → você executa de novo.
6. **Exercício 1** (papel, fundo dourado suave). "Abra a fila e explique, em voz alta,
   por que o primeiro card está em primeiro lugar. O motivo está escrito no card."

### Módulo 2 — O funil comercial · 3 artboards

7. **Capa do módulo 2** (navy).
8. **As 9 etapas** (papel). Diagrama de funil na horizontal: Entrada → Aguardando
   atendimento → Aguardando retorno → Qualificação → Em atendimento → Agendado → Visita
   realizada → Análise de crédito → Venda. Saída lateral para "Perdido". Destaque em
   vermelho na divisa "Em atendimento → Agendado".
9. **Exercício 2** (papel). "Pegue 5 clientes da sua carteira. Classifique a etapa certa
   de cada um e escreva o que falta para avançar."

### Módulo 3 — A Fila Única ⭐ · 4 artboards

10. **Capa do módulo 3** (navy). Marque como módulo-chave.
11. **A ordem em que o dinheiro está em risco** (papel). Os 7 baldes, cada um com círculo
    dourado numerado, nome e o porquê:
    1 Fundo do funil parado — agendado, visita e análise; é onde o dinheiro está ·
    2 Chegaram agora — o SLA de 15 minutos está correndo ·
    3 Cliente respondeu e espera — ele falou por último ·
    4 Follow-up vencido ou de hoje — você combinou de voltar ·
    5 Sem próximo passo — precisa terminar o dia em zero ·
    6 Esfriando — quente ou morno sem contato há 3+ dias ·
    7 Pasta travada — documento pendente segurando a análise.
    Caixa dourada no rodapé: *"Um cliente em análise parado há 66 dias vale mais que 200
    leads frios novos."*
12. **As três portas** (papel). Três cards grandes lado a lado, letras (a) (b) (c) em
    círculo dourado: desfecho registrado com próximo passo E data · agendamento criado
    (mudar o status não é agendar) · perdido com motivo. Faixa vermelha embaixo:
    **"Não existe a porta (d) 'fechei a tela'."**
13. **Exercício 3** (papel). "Trabalhe 10 cards, de cima para baixo, sem pular. Registre
    o desfecho de todos os 10. Confira: sumiram da fila com próximo passo e data?"

### Módulo 4 — Leads · 3 artboards

14. **Capa do módulo 4** (navy).
15. **Os primeiros 15 minutos** (papel). Linha do tempo horizontal: ligar → se não
    atendeu, WhatsApp em 2 min → registrar o desfecho mesmo que seja "não atendeu".
    Card vermelho ao lado: SLA de 15 minutos úteis; 2 estouros no mesmo dia pausam você
    no lead quente até amanhã.
16. **As 5 perguntas da qualificação + exercício** (papel). Renda familiar · tipo de renda
    (carteira, autônomo, misto) · FGTS e tempo de registro · valor de entrada · quem
    decide junto. Exercício: preencher a ficha completa de 3 clientes reais.

### Módulo 5 — Follow-up e a régua dos 13 toques · 3 artboards

17. **Capa do módulo 5** (navy).
18. **A régua de 13 toques** (papel). Régua visual horizontal com 13 marcas; as marcas
    3, 7 e 11 em dourado cheio (ligação), as outras em contorno (WhatsApp). Abaixo:
    ciclo de ~50 dias no quente, ~72 no morno, ~146 no frio; no fundo do funil o ritmo
    dobra. Fecho: *"A casa mediu que o cliente costuma responder lá pela 13ª tentativa —
    desistir no toque 3 é jogar dinheiro fora."*
19. **Exercício 5** (papel). "Execute 15 toques da fila do dia. Escreva um toque de cada
    fase — abertura, consultiva, encerramento — em até 4 linhas."

### Módulo 6 — Agendamentos e visita · 3 artboards

20. **Capa do módulo 6** (navy).
21. **Mudar o status não é agendar** (papel). Contraste em duas colunas: o erro (mover o
    card e pronto → a visita não aparece na agenda, a confirmação nunca sai, o cliente
    não vem) × o certo (criar o agendamento com data, hora e empreendimento). Abaixo,
    o protocolo D-2 / D-1 / D+0 em três círculos dourados numerados. Card verde:
    comparecimento da casa é **79,8%**, acima da meta de 65% — o protocolo funciona.
22. **Exercício 6** (papel). "Crie 3 agendamentos completos e escreva as 4 mensagens do
    protocolo para um cliente real."

### Módulo 7 — Qualificação MCMV · 3 artboards

23. **Capa do módulo 7** (navy).
24. **Enquadrar antes de ofertar** (papel). Renda → faixa MCMV → subsídio → FGTS →
    entrada → parcela. Card de alerta: sem faixa MCMV a simulação sai errada e a pasta é
    reprovada na Caixa. Mensagem central: dizer "não dá" cedo salva o mês.
25. **Exercício 7** (papel). "Enquadre 5 perfis de renda diferentes e faça 3 simulações
    completas."

### Módulo 8 — Conversão: conversa vira visita ⭐ · 4 artboards

26. **Capa do módulo 8** (navy). Marque como o módulo mais importante do treinamento.
27. **Sete das oito já estão na meta** (papel). Gráfico de barras horizontais com as 8
    passagens, duas séries (hoje × meta). Barras "hoje" em dourado escuro, "meta" em
    cinza-azulado. A barra do agendamento em vermelho. Card vermelho ao lado isolando:
    **5,4% contra meta de 70%**.
28. **A frase que resolve** (navy). Em tipografia grande, ocupando o artboard:
    **"Separei duas opções que cabem na sua renda. Você prefere conhecer sábado de manhã
    ou sábado à tarde?"** Ao lado, card dourado: *duas opções de horário — nunca "quer
    visitar?". Pergunta aberta devolve "vou pensar"; duas opções devolvem um dia.*
    Rodapé: **13×** — o que essa passagem sozinha vale.
29. **Exercício 8** (papel). "Role-play: 10 conversas, oferecendo visita nas 10. Depois,
    na fila real: 3 agendamentos criados hoje."

### Módulo 9 — Indicadores · 3 artboards

30. **Capa do módulo 9** (navy).
31. **Seu placar** (papel). Quatro números grandes do dia (20 desfechos · 25 tocados ·
    2 captações · 1,4 agendamento) e, abaixo, dois cards: verde com a semana (6 captações ·
    7 agendamentos · 1 venda) e vermelho com os dois zeros do fim do dia (follow-ups
    vencidos · clientes sem próximo passo). Legenda: o CRM calcula a meta pela SUA
    conversão; nos primeiros dias usa a do time.
32. **Exercício 9** (papel). "Declare as metas do dia e bata as três. Leia seu próprio
    funil e aponte onde o SEU cliente está travando."

### Módulo 10 — Uma venda por semana · 3 artboards

33. **Capa do módulo 10** (navy).
34. **De onde a venda realmente vem** (papel). Quatro cards com o número gigante de leads
    por venda: 3 (indicação) · 6 (você capta) em verde · 413 (Facebook) · 6.550 (base
    importada) em vermelho. Faixa navy no rodapé: **"1% dos leads gera 83% das vendas.
    É a mesma casa, o mesmo produto e o mesmo CRM. Muda só a origem."**
35. **A meta, com prazo honesto** (papel). Card vermelho no topo: *hoje o melhor corretor
    da casa faz 0,40 venda por semana; prometer 1 para a semana que vem seria mentira.*
    Abaixo, três cards de fase: mês 1–2 (6 captações/semana + 1 venda no mês) · mês 3–4
    (1 venda a cada 2 semanas) · mês 6+ (1 venda/semana, em verde).

### Fechamento — 2 artboards

36. **Certificação** (papel). Os critérios em checklist: uma semana com o placar mínimo
    todo dia · mínimo de 100 desfechos, 7 agendamentos e 3 análises · apresentação ao
    gestor do próprio funil e do próprio gargalo.
37. **O combinado** (navy). Tipografia grande: **"Siga exatamente o que o CRM mandar você
    fazer."** Abaixo, menor: *cumpra os indicadores mínimos todo dia, execute os
    follow-ups — e 1 venda por semana deixa de ser meta e vira consequência.*
    Três números dourados no rodapé: **2** captações por dia · **20** desfechos por dia ·
    **0** vencidos no fim do dia.

---

## 6. Como quero que fique

Um material que um corretor de 45 anos, sem intimidade com tecnologia, consiga acompanhar
projetado a cinco metros — e que um corretor experiente não ache infantil. Números
grandes, frases curtas, um assunto por artboard.

**O tom é de entrega, não de cobrança.** O deck abre reconhecendo que o sistema estava
quebrado e foi consertado, elogia o time com dados reais (a casa fecha 45% de quem
visita), e só então isola o único ponto a corrigir. Quem sair da sala precisa lembrar de
duas coisas: **a frase da oferta de visita** e **capte 2 por dia**.
