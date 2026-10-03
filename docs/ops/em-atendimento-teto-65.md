# Regra dos 65 em "Em atendimento"

Decisões do dono em 03/10/2026, em resposta a um questionário de 24 perguntas.
Migration da Fatia 1: `20261009120600_em_atendimento_teto_65_sombra` (Drizzle
`0051`), precedida do espelho do enum `20261009120500_lead_origem_portal_espelho`
(Drizzle `0050`). Testes: `tests/db/em-atendimento-sombra.test.ts` (banco) e
`tests/regra-65.test.tsx` (tela).

> Continuação de `carteira-ativa-40-fatia3.md` e `bolsao-oportunidades-fatia4.md`.
> Aqueles documentos criaram o teto de 65 como **carteira ativa**, uma
> classificação paralela ao status. Este documento muda o sentido do 65.

## 1. O problema, em uma tela

Na página de Leads, a Ana Rita aparecia com **248 em "Em atendimento"**, 233
deles frios, enquanto a Fila Única dizia que ela estava dentro do teto. Eram
dois números para a mesma pergunta. O 65 existia, mas não governava o status
que o corretor e o gestor enxergam.

## 2. A regra (decisões do dono)

### 2.1 O que é "Em atendimento"

| #   | Decisão                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | O teto de **65 conta só o status `em_atendimento`**. O fundo (agendado, visita realizada, proposta, análise de crédito) fica fora.                       |
| 2   | **Entra em Em atendimento só quem respondeu e tem próximo passo com data.** Cadência e lote da Prospecção ficam em Aguardando atendimento até responder. |
| 3   | **Qualificação Corretor** (entregue pelo Marquinhos ou pelo SDR) fica fora do teto, com **1 dia** para virar atendimento; senão volta para a roleta.     |
| 4   | **Lead próprio** (indicação, captação, plantão…) ocupa vaga, mas nunca sai do corretor.                                                                  |
| 5   | Teto **único** de 65 para todos. Contas sem papel de corretor (SDR, admin, robôs) ficam fora.                                                            |

### 2.2 O limite no dia a dia

| #   | Decisão                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6   | Em 65/65, vale a **troca "entra um, sai um"**: o sistema sugere os 5 mais parados e o corretor escolhe quem libera a vaga.                                                           |
| 7   | Para sair de Em atendimento, **um de 4 desfechos**: agendou, pediu retorno (data obrigatória), esfriou (data obrigatória), perdido com motivo.                                       |
| 8   | **Anti-ioiô**: o lead só volta para Em atendimento quando o **cliente** responde, nunca porque o corretor declarou.                                                                  |
| 9   | "Pediu retorno" e "Esfriou" vão para **Aguardando retorno com data de até 30 dias**. Data maior vira perda "retorno futuro" e volta pela reativação (o lead próprio, não).           |
| 10  | A roleta **para de mandar lead novo** com **60** em Em atendimento (5 de folga para as respostas da própria base) ou **150** na Minha base.                                          |
| 11  | Quando o sistema decide sozinho quem fica nos 65: passo com data futura > cliente escreveu em 7 dias > quente > toque mais recente > origem paga.                                    |
| 12  | Cliente duplicado: o primeiro corretor a levar o cliente a Visita realizada fica com ele; os outros registros viram perda "cliente seguiu com outro corretor", sem aviso (ver §6.1). |

### 2.3 O relógio de 5 dias

| Onde o lead está            | Prazo                          | O que acontece quando vence                                                                                |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Em atendimento              | 5 dias sem toque               | Perde a vaga dos 65 e desce para a Minha base (Aguardando retorno), levando a data do passo se tiver.      |
| Minha base                  | 5 dias sem toque               | Sai do corretor: lead pago volta à roleta; estoque vai ao Bolsão; lead próprio fica, com alerta ao gestor. |
| Aguardando retorno com data | Parado até a data + 2 dias     | Sem toque desde a data combinada, sai como acima.                                                          |
| Qualificação Corretor       | 1 dia                          | Volta para a roleta.                                                                                       |
| Cadência D0–D3              | Regra própria (toques diários) | Segue a cadência.                                                                                          |
| Fundo do funil              | **Nunca sai por robô**         | 3 dias: topo da Fila. 5: aparece ao gestor. 10: o gestor dá o desfecho.                                    |

**Toque = ligação ou WhatsApp registrado no CRM, mesmo sem resposta.** O
corretor perde a vaga **antes** de perder o cliente: são dois degraus de 5 dias.

### 2.4 Nomes

**"Minha base"** é como a tela chama as fases antes de Em atendimento (por
dentro, Reserva + Formação). **"Bolsão" continua sendo só a base sem dono**,
trabalhada por discador e SDR. Assim o corretor nunca ouve "seu cliente foi
para o Bolsão" querendo dizer que ele ainda é dele.

### 2.5 Virada, exceções e alertas

- **Virada:** 7 dias em modo sombra; nesse período o corretor escolhe os seus 65.
  No 8º dia o sistema aplica o critério do item 11 a quem não escolheu.
- **Alertas:** o corretor vê sempre o contador "58/65"; o gestor é avisado em
  60 e em 65.
- **Revisão mensal:** tempo mediano entre toques nos 65 de até 72 h (65 ÷ 20
  toques/dia = 3,25 dias) e taxa Em atendimento → Agendado (meta da casa 70%).

## 3. O que a produção mostrou (03/10/2026, somente leitura)

Rodando a regra da Fatia 1 contra o banco de produção, sem alterar nada:

| Corretor        | Em atendimento | Ficam nos 65 | Perdem a vaga | Minha base hoje → depois | Saem da base (roleta · Bolsão) | Fundo 10+ dias |
| --------------- | -------------: | -----------: | ------------: | -----------------------: | -----------------------------: | -------------: |
| Jefferson Luiz  |            286 |           48 |           238 |                352 → 239 |                        0 · 351 |             23 |
| Ana Rita        |            248 |            8 |           240 |                  3 → 241 |                          0 · 2 |              3 |
| Leticia Brandão |            202 |            1 |           201 |                245 → 202 |                       18 · 226 |             20 |
| Bruno Soares    |            173 |           31 |           142 |                202 → 143 |                       73 · 128 |              1 |
| Ana Caroline    |            169 |            1 |           168 |                233 → 170 |                       96 · 135 |              6 |
| graziele        |            121 |           47 |            74 |                  41 → 95 |                         3 · 17 |             46 |
| Sara Leoni      |             50 |           46 |             4 |                145 → 148 |                          0 · 1 |              0 |
| Amanda Dias     |             22 |            8 |            14 |                 124 → 14 |                        124 · 0 |             50 |

Casa inteira (47 corretores ativos):

- **1.760** em Em atendimento. **231 (13%)** tiveram contato real nos últimos 5
  dias; **1.529 perderiam a vaga** na virada.
- **Ninguém passa de 65** depois do relógio. O problema da casa não é excesso de
  conversa: é **lead parado com o status de conversa**.
- **3.454** na Minha base; **829 voltariam à roleta** e **2.383 iriam ao Bolsão**.
- **252** em Qualificação Corretor há mais de 1 dia; 172 deles com o Felipe França.
- **210 dos 240** leads do fundo do funil estão parados há 10+ dias: o gestor
  teria de dar desfecho em 210 negócios. A Amanda Dias tem **50 de 50** assim.
- **4 corretores** parariam de receber lead novo no 1º dia (Minha base acima de
  150 com o que desce dos 65); o número cai quando o 2º degrau de 5 dias roda.
- Fora das carteiras: **5.438 leads em Em atendimento sem dono**. É de lá que o
  lote da Prospecção puxa leads que chegam ao corretor já "em atendimento".
- **398** leads em Em atendimento **nunca** tiveram contato registrado.

**O exemplo que explica a porta:** em 5 dias, o Eduardo moveu **55 leads
recém-chegados** (D0) de Aguardando atendimento para Em atendimento pela ficha,
sem nenhuma ligação, mensagem ou tentativa registrada. A cadência leu a mudança
de status como "cliente respondeu" (`via = status`) e tirou os 55 da Fila do
Dia. É exatamente o que a decisão 2 fecha.

## 4. Por que o relógio desta regra não é o da casa

O relógio usado por higiene, Fila Única e carteira é
`GREATEST(ultima_interacao, ultimo_contato)`. O gatilho
`atualizar_ultima_interacao_lead` move `ultima_interacao` com **qualquer**
interação, inclusive `mudanca_status` e `nota` gravadas pelo sistema, sem
autor. Em 08/09 o motor gravou **4.805** mudanças de status automáticas num só
dia, e em 15/09 mais 1.846. Por esse relógio, **75 dos 306** leads que pareciam
tocados nos últimos 5 dias só tinham registro automático.

A decisão do dono foi "toque = ligação ou WhatsApp registrado". Então o
relógio desta regra é o **contato real**:

- `ultimo_contato` (o gatilho só o move em ligação, WhatsApp, e-mail, SMS,
  visita, reunião e proposta; a cadência o grava a cada tentativa);
- o recorte de eventos de `conversas_aguardando_resposta`: interação que entra
  (cliente) ou que sai com autor (humano), mensagem recebida ou enviada pelo
  corretor, chamada feita.

As outras telas continuam no relógio da casa. Trocar o relógio delas mudaria
higiene, fila e carteira em silêncio. Se o dono quiser um relógio só, é uma
decisão à parte.

**Limite honesto:** o relógio de contato não enxerga WhatsApp pelo celular
pessoal que não foi registrado. Com a regra ligada, contato não registrado
passa a custar a vaga. É o incentivo certo, mas precisa ser comunicado antes.

## 5. O que a Fatia 1 construiu (modo sombra: nada se move)

### 5.1 Banco

| Objeto                                       | O que faz                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `gestao_config.em_atendimento`               | Os números da regra (trava 60, teto da base 150, 5 dias, tolerância 2, máximo 30, 24 h, 7 dias, 3/5/10).   |
| `em_atendimento_config()`                    | Config vigente; o teto continua em `capacidade_leads_ativos_por_corretor` (uma chave para o mesmo número). |
| `_em_atendimento_classificar(uuid[])`        | **A regra única**: camada, posição na disputa, ação e destino de cada lead. Sem grant.                     |
| `em_atendimento_sombra_v1()`                 | A linha do gestor: por corretor, quem fica, quem desce, como fica a Minha base e se a roleta travaria.     |
| `em_atendimento_sombra_leads_v1(uuid, text)` | O detalhe por lead (drill do gestor; base da tela de escolha da Fatia 2). Corretor vê só a si.             |
| `em_atendimento_portas_v1()`                 | Fora das carteiras: Em atendimento sem dono, com dono inativo, em cadência; e o cliente duplicado.         |

A Fatia 3 vai reusar `_em_atendimento_classificar` para decidir o que mover. Se
o ensaio e a execução saíssem de consultas diferentes, divergiriam no primeiro
ajuste (a lição da Fase 0 da cadência).

### 5.2 Tela

**Painel do Gestor → aba Time**, no topo: "Regra dos 65 — simulação". Mostra os
totais, uma linha por corretor e, para admin e superintendência, as portas. O
texto diz, antes de qualquer número, que nenhum lead foi movido.

### 5.3 Deploy

Em produção, as migrations entram pelo **Drizzle** (`drizzle.config.ts` →
`LOVABLE_DB_MIGRATION_URL`). O migrador só aplica uma entrada cujo `when` seja
maior que o de toda entrada anterior (travado em `tests/drizzle-espelho.test.ts`).
A `0050` e a `0051` vêm logo depois das espelhadas da zona estrita (`0049`,
`1791558240000`), com `1791558300000` e `1791558360000` — os nomes
`20261009120500` e `20261009120600`. A `0044` tem `when` menor que a `0043` e
por isso nunca seria aplicada pelo migrador; o enum `portal` existe em produção
por outro caminho, e o espelho `0050` é no-op lá.

### 5.4 Como foi conferido

- Postgres 16 com as 428 migrations aplicadas do zero.
- `tests/db/em-atendimento-sombra.test.ts`: 26 testes. Cobrem a disputa e a
  ordem, os dois degraus do relógio, os destinos por origem, o retorno
  protegido, a qualificação, o fundo, a trava da roleta, o acesso por papel e a
  garantia de que nenhuma leitura altera lead.
- O fixture deixa `ultima_interacao` sempre em "agora". Assim, todo teste de
  lead parado só passa se a regra ignorar o relógio da casa.
- **Checagem de mutação**, cinco vezes: lead parado disputando vaga, ordem
  trocada, retorno vencido sem olhar o toque, mudança de status contando como
  toque, ligação ignorada. Cada mutação derruba pelo menos um teste.
- A medição de produção foi gerada do **mesmo corpo** da função: um script
  extrai o SQL da migration e troca só a config e a lista de corretores.

## 6. Decisões do dono depois da medição (03/10/2026)

Quatro pontos apareceram com os números de produção e foram decididos pelo dono.

1. **Cliente duplicado: permitir vários corretores com o mesmo cliente.** Hoje
   o banco **proíbe** isso: `leads_telefone_unico_ativo_uidx` (desde 02/09)
   permite um lead ativo por telefone na base inteira, e há **zero** telefones
   repetidos em 98 mil leads vivos. Mais que isso, a **regra do lead repetido**
   (01/10, `webhooks/lead/$token.ts` → `redistribuir_duplicado_campanha`) faz
   o oposto da decisão: quando o cliente volta por outra campanha, o MESMO
   registro é redistribuído pela roleta e pode trocar do corretor A para o B.
   Permitir vários corretores exige, numa fatia própria:
   - trocar o índice global por um que permita o mesmo telefone em corretores
     diferentes (e mantenha um por corretor);
   - fazer o webhook criar um registro novo para o corretor da roleta em vez de
     redistribuir o existente;
   - a regra do dono no avanço: o primeiro registro a chegar em Visita
     realizada encerra os outros como perda "cliente seguiu com outro
     corretor", que não conta como perda do corretor, sem aviso.
     A Fatia 1 já conta esses casos (`em_atendimento_portas_v1`); hoje são zero.
2. **Ritmo: tudo no dia da virada.** 829 leads pagos à roleta e 2.383 ao Bolsão
   no mesmo dia. A trava de 60/150 continua valendo, então a roleta só entrega a
   quem tem vaga; o que não couber espera na fila da roleta.
3. **Mudança de status feita pelo corretor não conta como toque.** Só ligação,
   WhatsApp, chamada e mensagem. É como a Fatia 1 já calcula.
4. **Portal é origem paga:** parado, volta à roleta. Já vale na simulação. Fica
   fora de `lead_origem_paga` até a Fatia 3, porque aquela função também
   decide o lote da Prospecção, e mudá-la agora tiraria os leads de Portal do
   lote em produção no mesmo dia. A migration `20261009120500` espelha o valor
   `portal` do enum, que só existia no Drizzle (0044), para o harness poder
   testar.

Continuam em aberto:

- **A régua de devolução da Fatia 4 nunca foi ligada.** Ela está em
  `modo = sombra` em produção desde 14/09 (`gestao_config.bolsao`), e é por
  isso que nada parado jamais saiu de ninguém. A regra dos 65 a substitui;
  ligar as duas ao mesmo tempo daria dois motores devolvendo o mesmo lead.
- **`investimento_corretor`** cai hoje em "estoque". Se for lead próprio, é
  uma linha em `lead_origem_conquistada`.

## 7. Fatia 2: as telas e a troca (03/10/2026)

Migration `20261010120500_em_atendimento_fatia2_troca_escolha` (Drizzle
`0056`). Testes: `tests/db/em-atendimento-fatia2.test.ts` (banco, 24 testes)
e `tests/em-atendimento-fatia2.test.tsx` (telas). Nada aqui move lead por
robô: tudo é ação do corretor.

### 7.1 Decisões do dono para esta fatia

| Pergunta                                          | Decisão                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Escolher os seus 65 protege do relógio de 5 dias? | **Não.** A escolha põe o lead na frente da disputa; escolhido sem ligação ou WhatsApp em 5 dias desce do mesmo jeito. |
| A troca "entra um, sai um" com a regra em sombra  | **Já obrigatória.** Com 65 em Em atendimento, o corretor só põe mais um liberando outro no mesmo passo.               |
| Saídas de Em atendimento                          | **Cinco desfechos:** Agendou, Pediu retorno, Esfriou, Perdido e **Mandou doc**. A tela não oferece outra saída.       |
| Retorno combinado para mais de 30 dias            | **Categoria nova "Retorno futuro"**, reciclável pela reativação. Lead próprio não perde: fica com a data longa.       |

### 7.2 O que o banco faz

| Peça                             | O que é                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trava em `transicionar_lead`     | Entrada em Em atendimento com `em_atendimento_ocupacao >= teto` é recusada com o código **EA065** e os números no DETAIL. Vale para o **próprio corretor dono** (com papel de corretor); gestão, serviço e quem age na carteira de outro (SDR agendando) seguem como antes. Cadeado por corretor: duas entradas ao mesmo tempo contam uma de cada vez. |
| `trocar_vaga_em_atendimento`     | Numa transação: quem sai recebe o desfecho (retorno, esfriou ou perdido) e **depois** quem entra passa pela trava de sempre, com a vaga já livre. Sem passe-livre: quem sai sem liberar vaga (lixeira) não abre espaço. Falhou qualquer parte, nada muda.                                                                                              |
| `registrar_retorno_lead`         | "Pediu retorno" e "Esfriou" → Aguardando retorno com a data (até `retorno_max_dias`). Além disso, perda seca `retorno_futuro` (sem a redistribuição do "Marcar como perdido") e evento com a data. "Esfriou" deixa o lead frio.                                                                                                                        |
| `em_atendimento_escolhas`        | Os leads que o corretor escolheu manter. `escolher_em_atendimento` (só o dono, só lead em Em atendimento, no máximo o teto). A escolha é o **primeiro critério** da disputa em `_em_atendimento_classificar`; o filtro de 5 dias continua antes dela.                                                                                                  |
| `em_atendimento_contador_v1`     | X/65, escolhidos, Minha base, trava, modo. O mesmo `em_atendimento_ocupacao` da trava — a tela nunca diz 64 quando o banco recusa por 65.                                                                                                                                                                                                              |
| `em_atendimento_sombra_leads_v2` | O detalhe por lead com a coluna `escolhido` (base da tela "Meus 65" e da janela de troca).                                                                                                                                                                                                                                                             |

Por que a trava mora no banco: são mais de nove telas que mudam status, mais
a API pública. Uma trava só na tela vazaria pela primeira que esquecesse.

### 7.3 O que a tela faz

- **Contador X/65** no chip da Base de leads (corretor), no anel da Fila
  (que passa a mostrar "em atendimento" em vez da carteira ativa antiga) e na
  coluna Em atendimento do Kanban. Verde até 60, âmbar até 65, vermelho lotado.
- **Janela de troca:** quando o banco recusa (EA065), a mutação de etapa abre
  a janela em vez do toast — em qualquer tela, porque ela mora uma vez no
  layout autenticado. Sugere os 5 mais parados; o corretor escolhe quem sai e
  com qual desfecho (retorno com data, esfriou, perdido). Agendou e Mandou doc
  liberam vaga pela ficha.
- **Saída de Em atendimento só por desfecho:** menu "⋯" do card, trilha da
  ficha e arrastar do Kanban oferecem só os cinco. `transicaoLeadPermitida`
  continua espelhando o banco (que ainda aceita outras saídas até a Fatia 3);
  `saidaOferecida` é a camada da tela por cima dele.
- **Pediu retorno / Esfriou:** diálogo com a data; acima de 30 dias avisa que
  vira "Retorno futuro" antes de confirmar.
- **"Meus 65"** (`/meus-65`): a lista na ordem da disputa, a posição, os dias
  sem toque, a ação da regra e a escolha ("Manter"). Escolhido parado mostra
  "toque até dd/mm para manter". A gestão abre a tela de um corretor em
  leitura (`?corretor=`).
- **"Minha base"** é o nome de tela da Reserva (menu e título); a rota
  `/reserva` fica.

### 7.4 Como foi conferido

- Banco: 24 testes com teto 3 (a regra lê o teto da mesma chave). Cobrem a
  trava para o dono e a liberdade de gestão, serviço, SDR e conta sem papel;
  lixeira e arquivado fora da ocupação; duas entradas simultâneas com uma vaga;
  a troca como transação (falha, lixeira, perdido); retorno até 30 dias, além
  (perda seca) e lead próprio; a escolha na frente da disputa, sem proteger do
  relógio, com limite e perdendo o efeito ao sair; o contador e o acesso.
- **Checagem de mutação, nove vezes.** Sete derrubaram testes de primeira.
  Duas sobreviveram e viraram correção: a trava sem o "só o dono" (faltava o
  SDR agendando para um corretor lotado — teste novo) e a marca de passe-livre
  da troca (código morto: o desfecho já libera a vaga antes da entrada; a
  marca foi removida, e um teste novo garante que quem sai da lixeira não
  abre vaga).
- Telas: a trava vira janela, os cinco desfechos, o aviso de retorno futuro,
  a ordem dos mais parados, a escolha e os pontos de fiação (mutação de
  etapa, layout, Kanban, ficha, menu).

## 8. Próximas fatias

| Fatia             | O que entra                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3. Ligar**      | Portas fechadas (cadência, lote e transição para Em atendimento exigem resposta + passo; saída só por desfecho também no banco); os 5.438 sem dono voltam para Aguardando atendimento; trava da roleta; os dois relógios; virada no 8º dia, tudo de uma vez; Portal em `lead_origem_paga`; alertas em 60 e 65. |
| **3b. Duplicado** | Feito: registro mãe, Fatias A e B (`docs/ops/registro-mae.md`).                                                                                                                                                                                                                                                |
| **4. Revisar**    | Painel mensal: tempo mediano entre toques nos 65 e taxa Em atendimento → Agendado.                                                                                                                                                                                                                             |
