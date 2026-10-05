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

| #   | Decisão                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | Em 65/65, vale a **troca "entra um, sai um"**: o sistema sugere os 5 mais parados e o corretor escolhe quem libera a vaga.                                                                                                                                                        |
| 7   | Para sair de Em atendimento, **um de 4 desfechos**: agendou, pediu retorno (data obrigatória), esfriou (data obrigatória), perdido com motivo.                                                                                                                                    |
| 8   | **Anti-ioiô**: o lead só volta para Em atendimento quando o **cliente** responde, nunca porque o corretor declarou.                                                                                                                                                               |
| 9   | "Pediu retorno" e "Esfriou" vão para **Aguardando retorno com data de até 30 dias**. Data maior vira perda "retorno futuro" e volta pela reativação (o lead próprio, não).                                                                                                        |
| 10  | A roleta **para de mandar lead novo** com **60** em Em atendimento (5 de folga para as respostas da própria base) ou **150** na Minha base.                                                                                                                                       |
| 11  | Quando o sistema decide sozinho quem fica nos 65: passo com data futura > cliente escreveu em 7 dias > quente > toque mais recente > origem paga.                                                                                                                                 |
| 12  | Cliente duplicado: o primeiro corretor a levar o cliente a Visita realizada fica com ele; os outros registros viram perda "cliente seguiu com outro corretor", sem aviso (ver §6.1).                                                                                              |
| 13  | **Em atendimento não se escolhe** (05/10/2026): o corretor nunca "seleciona" a etapa. O lead entra como consequência de uma sequência — registrou o contato, o cliente respondeu, há um próximo passo com data. Só a gestão move para lá à mão, como correção de dado (ver §8.7). |

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
  continua espelhando o banco (que passou a exigir o desfecho na Fatia 3a, §8);
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

### 7.5 A revisão adversarial (04/10/2026)

Antes do merge, o diff da Fatia 2 passou por quatro revisores independentes
(SQL, telas, regressão, deploy), e cada achado por três céticos com a ordem
de refutar. Sobreviveram e viraram a migration
`20261010120600_em_atendimento_fatia2_revisao` (Drizzle `0057`) e o PR de
correção:

| Achado                                                                                                                                                          | Correção                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Pediu retorno" / "Esfriou" gravavam a data direto em `proximo_followup`, que é espelho das tarefas: a próxima mexida em tarefas apagava a data combinada.      | O desfecho cria a tarefa do retorno (como a cadência faz); o espelho se preenche sozinho e o retorno fica protegido até a data.                      |
| Quem entrava pela troca ficava sem próximo passo (a entrada normal ganha follow-up em 1 dia pelo hook).                                                         | A troca cria a tarefa de quem entra.                                                                                                                 |
| A janela de troca aceitava data acima de 30 dias sem avisar; quem saía virava "retorno futuro" em silêncio.                                                     | O mesmo aviso do diálogo de retorno, e o toast diz o que aconteceu com quem saiu.                                                                    |
| A escolha do dono anterior engolia a do dono novo; escolha de lead que saía revivia quando ele voltava; arquivado contava como escolhido.                       | Escolha é do dono atual; gatilho apaga a escolha quando o lead sai de Em atendimento ou troca de dono; o recorte de "vivo" é o da ocupação.          |
| A troca aceitava dois leads sem dono como "mesma carteira".                                                                                                     | Exige dono.                                                                                                                                          |
| `cadencia_marcar_respondeu` gravava Em atendimento por fora da trava: o corretor lotado entrava pela Fila do Dia.                                               | A trava virou uma função só (`_em_atendimento_travar`), usada por `transicionar_lead` e pela cadência; a tela da cadência abre a janela.             |
| "Iniciar atendimento" (Base de leads) e "Falei · qualificar" (Fila Única) não abriam a janela e deixavam interação gravada; o primeiro dava um "toque" ao lead. | "Iniciar atendimento" muda a etapa antes de gravar a interação; os dois abrem a janela na trava, com o toast dizendo que o contato ficou registrado. |
| A coluna Em atendimento do Kanban mostrava N/65 com N filtrado pela busca.                                                                                      | O numerador é a ocupação do banco, a mesma da trava.                                                                                                 |

Refutados pelos céticos, e registrados aqui para não voltarem:

- **Retorno futuro reciclado pelo SDR em 30 dias**, antes da data pedida. É a
  política vigente do SDR (`sdr_perdidos_dias`) por cima da decisão do dono
  ("volta pela reativação"); a data fica em `lead_eventos`. Se a reativação
  passar a respeitar a data, é decisão à parte.
- **Entrada por posse**: lote da Prospecção, discador e oferta ativa entregam
  lead que já está em `em_atendimento` sem dono; o corretor lotado recebe sem
  trava. É comportamento anterior à regra e a porta que a Fatia 3 fecha ao
  devolver os 5.438 para Aguardando atendimento.
- **Janela de bloqueio do deploy**: o migrador do Drizzle aplica todas as
  pendentes numa transação só; `0054` (backfill do registro mãe) dita o tempo
  com `leads` travada, e `0056`/`0057` acrescentam milissegundos. Publicar fora
  do pico; se der para configurar, `lock_timeout` na sessão do migrador.

## 8. Fatia 3a: as portas fechadas no banco (04/10/2026)

Migration `20261010120700_em_atendimento_fatia3a_portas` (Drizzle `0058`),
idempotente. Testes: `tests/db/em-atendimento-fatia3a.test.ts` (banco) e os
ajustes nas suítes que entravam em Em atendimento pela porta antiga. Nada
aqui move lead por relógio: isso é a Fatia 3b.

### 8.1 O que a produção mostrou antes (04/10, somente leitura)

- **7.238** em Em atendimento; **5.438 sem dono** (importação 2.547, "outro"
  2.152, planilha 732; só 3 pagos; **nenhum tocado em 5 dias**). **55** deles
  são carteira do SDR (`sdr_id`), que fica como está.
- Só **uma trava** existia (`_em_atendimento_travar`) e só duas portas
  passavam por ela; **nenhuma roleta** lia 60/150.
- A porta do §3 continuava aberta: a entrada exigia "próxima ação **ou**
  follow-up", e aceitava texto sem data e lead sem nenhum contato.
- Dos robôs que devolvem lead, só a cadência e a devolução do SDR estão
  ativos; posse expirada e follow-up vencido estão desligados pelo modelo v2
  (`_modelo_v2_ativo() = false`); higiene e régua de devolução, em sombra.

### 8.2 O que o banco faz agora

| Peça                                           | O que é                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_em_atendimento_travar` (assinatura nova)     | A porta, uma função só, chamada por `transicionar_lead`, pela cadência e pela troca. Para o **próprio corretor dono** (papel corretor), nesta ordem: **EA067** lead em cadência D0–D3 só entra pela Fila do Dia ("Cliente respondeu"); **EA066** sem contato registrado nas últimas 24 h (`entrada_contato_horas`); **EA068** sem próximo passo com data futura (follow-up no pedido, tarefa ou agendamento); **EA065** teto. Gestão, serviço e SDR seguem livres. |
| `_em_atendimento_contato_recente`              | O recorte de toque do classificador (§4): interação de entrada ou com autor (nota e mudança de status não), mensagem recebida ou enviada pelo corretor, chamada feita, ou `ultimo_contato` (a cadência grava a cada tentativa).                                                                                                                                                                                                                                    |
| `transicao_lead_permitida` (saída)             | De Em atendimento o corretor sai só por desfecho: `aguardando_retorno`, `agendado`, `analise_credito`, `perdido`. A gestão mantém `qualificacao_corretor`, `qualificado` e `visita_realizada` para corrigir dado. Em `transicionar_lead`, quem **não** é o corretor dono (SDR entregando, serviço) recebe a matriz ampla; `entregar_lead_sdr` passa a consultá-la assim.                                                                                           |
| `trg_zz_em_atendimento_posse`                  | **Lead sem corretor não está em atendimento.** Perdeu o dono (Bolsão, régua, devolução do lote) ou nasceu sem dono → Aguardando atendimento; ganhou dono por posse de um lead que estava "em atendimento" sem ninguém (lote, discador, roleta) → Aguardando atendimento (decisão 2). Fora: lead do SDR (`sdr_id`) e serviço (a telefonia passa por Em atendimento a caminho de Agendado em lead do Bolsão). Os **5.383** do Bolsão foram movidos pela migration.   |
| `_em_atendimento_recebe_lead` (decisão 10)     | Com `modo = 'ligado'`: 60 em Em atendimento ou 150 na Minha base (`em_atendimento_minha_base`, a mesma conta do contador) param a roleta — v3 e estoque pela `_elegibilidade_roleta` (motivo `regra_65_sem_vaga`), campanha ponderada e repasse pelo filtro inline. Em sombra devolve `true`: a virada liga tudo de uma vez.                                                                                                                                       |
| `iniciar_atendimento_lead`                     | "Iniciar atendimento" numa transação: registra o contato (ligação/WhatsApp), entra pela porta e cria a tarefa do passo. Se o teto recusar, nada fica gravado.                                                                                                                                                                                                                                                                                                      |
| `trocar_vaga_em_atendimento(…, _contato_tipo)` | A troca registra o contato de quem entra quando a janela abriu a partir de "Iniciar atendimento" (o EA065 desfez o original), e a entrada leva a marca da troca (não repete a exigência).                                                                                                                                                                                                                                                                          |
| `lead_origem_paga`                             | Portal é origem paga (decisão 4 do §6): parado, volta à roleta; sai do lote da Prospecção.                                                                                                                                                                                                                                                                                                                                                                         |

### 8.3 O que a tela faz

- **Erros novos como mensagem:** a tela já mostra a mensagem do banco no
  toast; EA067 diz para registrar a resposta pela Fila do Dia, EA066 para
  registrar o contato, EA068 para dar o passo com data.
- **"Iniciar atendimento"** chama a RPC; na trava abre a janela com o contato
  escolhido, que a troca registra para quem entra.
- **Espelho da matriz** (`TRANSICOES` + `TRANSICOES_GESTAO`): de Em atendimento
  o corretor vê só os desfechos; `saidaOferecida` continua a camada da tela.

### 8.4 O que isto muda no dia a dia

- Lead que chega pela roleta ou pelo lote entra em cadência D0: a ficha e o
  Kanban **não** o põem em Em atendimento. Quem põe é "Cliente respondeu" na
  Fila do Dia, com o passo e a data. É o fechamento da porta do §3.
- Lead fora da cadência (Aguardando retorno, Qualificação Corretor, base
  antiga): registre o contato e dê o passo com data — "Iniciar atendimento"
  faz os dois.
- O Bolsão não tem mais lead "em atendimento": o lote entrega em Aguardando
  atendimento e a cadência começa de verdade.

### 8.5 Como foi conferido

- 31 testes de banco (teto 3): cada porta e sua exceção (gestão, serviço, SDR
  com `sdr_id`), a ordem dos erros, a cadência pela RPC e pela ficha, a saída
  por desfecho para o corretor e ampla para gestão/SDR, o gatilho (nasce sem
  dono, perde o dono, carteira do SDR, serviço de passagem, posse do estado
  legado), a trava da roleta em sombra e ligada (ocupação e Minha base) com o
  motivo na elegibilidade, a RPC de iniciar (contato + tarefa, rollback no
  EA065, troca com contato, cadência, carteira de outro) e Portal.
- **Checagem de mutação, treze vezes** (contato, cadência, passo, saída,
  gatilho sem dono, gatilho posse, roleta, elegibilidade, troca sem contato,
  iniciar sem contato, portal, saída restrita para todos, serviço convertido):
  onze derrubam pelo menos um teste; duas (matriz de saída e Portal) nem
  chegam a aplicar — a sanidade no fim da própria migration as barra.
- As suítes que entravam pela porta antiga foram ajustadas para a nova:
  a jornada do lead passa pela Fila do Dia; o balcão da carteira usa o fundo;
  o lote devolve ao Bolsão em Aguardando atendimento.

### 8.6 Deploy

`0058` entra na mesma transação de `0054`–`0057`. O UPDATE dos 5.383 leads
roda com os gatilhos da tabela (zona, métricas, transição): segundos, não
minutos; a `0054` continua ditando a janela. Publicar fora do pico.

### 8.7 Fatia 3a.2: Em atendimento por consequência (05/10/2026)

Decisão 13 do dono, logo depois do merge da 3a: _"o corretor não deve mais
poder selecionar para levar o cliente ao status de Em atendimento; isso deve
ser uma consequência de uma sequência de ações que ele realizar com o lead"_.
A 3a tinha fechado as portas (contato + passo + cadência + teto), mas ainda
deixava o corretor **escolher** a etapa — pelo menu "Mover para", pelo
arrastar do Kanban, pelo botão "Iniciar atendimento". A 3a.2 tira a escolha e
põe no lugar a sequência. Migration `20261010120800_em_atendimento_fatia3a2_consequencia`
(Drizzle `0059`).

**A sequência.** O corretor registra o **contato** (canal + resultado). Se o
cliente **respondeu** (atendeu, interessado, pediu retorno) e o lead ainda
está antes de Em atendimento (novo, aguardando corretor/atendimento/retorno,
qualificação, qualificado), o banco o põe em atendimento **com o próximo
passo com data** — pela cadência quando o lead está em D0–D3 (é o "Cliente
respondeu" da Fila do Dia), pela transição com origem `resposta` fora dela.
Não atendeu, sem interesse: só o contato e o follow-up; a etapa fica. Lead já
em atendimento ou no fundo do funil: só o contato e o follow-up.

| Peça                                               | O que é                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transicao_lead_permitida` (entrada)               | `em_atendimento` deixa de ser destino do corretor a partir de **qualquer** status; a gestão continua podendo (correção de dado). As saídas de Em atendimento ficam as da 3a.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `transicionar_lead`                                | Lê a origem da entrada (`app.em_atendimento_origem`: `resposta` posta por `registrar_contato_lead`, `troca` pela troca) e, para o corretor dono, só deixa `em_atendimento` passar pela matriz quando a origem é uma dessas. Pela ficha, 22023 ("transição não permitida") antes de qualquer porta.                                                                                                                                                                                                                                                                                          |
| `_em_atendimento_travar` (origem `resposta`)       | A porta aceita a quarta origem: exige contato (que a própria RPC acabou de gravar) e passo com data, e conta o teto; a regra da cadência (EA067) vale só para `transicao`, porque a resposta de um lead em cadência chega pela própria cadência.                                                                                                                                                                                                                                                                                                                                            |
| `registrar_contato_lead(lead, tipo, resultado, …)` | **A RPC da sequência**, numa transação: grava a interação (com o resultado no título e em `metadata`), decide a consequência (acima), e grava o próximo passo como tarefa `follow_up` (dedup a ±1 dia, prioridade alta quando o cliente respondeu). Sem data no pedido, o passo é amanhã — a porta nunca devolve EA068 por aqui. Teto cheio não é erro: o contato e o passo ficam, e a resposta volta com `lotado` (ocupação, teto) para a tela abrir a janela de troca. Tentativa em lead D0–D3 não cria tarefa (um follow-up com data encerra a cadência; a régua marca o próximo toque). |
| `iniciar_atendimento_lead`                         | **Derrubada.** Era "contato + etapa" com o corretor escolhendo a etapa; a sequência acima a substitui.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**O que a tela faz.** Nenhuma tela do corretor oferece Em atendimento:

- O menu de etapas (lista, Kanban, peek, foco, ficha) troca o item "Em
  atendimento" por **"Cliente respondeu…"**, que abre Registrar contato com o
  resultado "Atendeu". Arrastar o card para a coluna abre o mesmo diálogo.
  Para a gestão o item continua "Em atendimento".
- O botão "inteligente" antes de Em atendimento vira **"Registrar contato"**
  (tipo `contato`, sem etapa). O split da lista vira "Contato por
  WhatsApp/ligação": WhatsApp registra a tentativa em um clique e abre a
  conversa; ligação abre o diálogo.
- O diálogo **Registrar contato** explica a consequência quando o lead está
  antes de Em atendimento, exige o passo com data quando o cliente respondeu
  (o botão trava sem ele) e, no teto cheio, abre a janela de troca com o
  contato já gravado.
- A Fila Única manda "Falei · qualificar" pela RPC sem criar tarefa (ela cria
  a sua, com os títulos da Fila) e trata `lotado` abrindo a janela; a opção
  não carrega mais a etapa. A resposta que põe o lead em atendimento não se
  desfaz pelo botão, como já era com a etapa direta.
- O motivo do destino bloqueado passa a explicar a sequência ("Em atendimento
  não se escolhe: registre o contato e, quando o cliente responder, o próximo
  passo com data. O lead entra sozinho.").

**O que isto muda no dia a dia.** Quem "selecionava Em atendimento para
marcar que está trabalhando o lead" agora registra o contato — que é o que a
regra sempre quis medir. A etapa vira o retrato do que aconteceu com o
cliente, não uma declaração do corretor; o teto e o relógio (3b) passam a
contar sobre leads que de fato responderam.

**Como foi conferido.** Os casos de banco da 3a que entravam pela ficha
passaram a testar a porta diretamente (`_em_atendimento_travar`, por origem)
e a matriz (22023 para o corretor de todo status; gestão, serviço e SDR
seguem); treze casos novos cobrem a RPC (tentativa, resposta, passo padrão,
interessado/pediu retorno, cadência, já em atendimento/fundo, teto cheio e
troca, sem tarefa, dedup, gestão/SDR, recusas, troca com contato, acesso). As
suítes que entravam como corretor (fatia 2, contrato de transições, métricas,
jornada 2, pontuação) passaram a entrar pela RPC ou pela gestão. **Checagem
de mutação, catorze vezes** (matriz, origem na transição, EA065 virando
erro, passo padrão, tarefa na cadência, cadência e contato na porta, troca
sem origem, carteira, dedup, sem interesse, fundo, prioridade): todas
derrubam pelo menos um teste; a da matriz nem chega a aplicar — a sanidade
da própria migration a barra. No front, a suíte
`tests/em-atendimento-fatia3a2.test.tsx` trava o espelho da matriz, a fiação
de cada tela e o diálogo.

### 8.8 Fatia 3b: os relógios, a virada e os alertas (05/10/2026)

Migration `20261010121000_em_atendimento_fatia3b_relogios`. A regra única da
Fatia 1 (`_em_atendimento_classificar`) deixa de só olhar: o cron a executa.
Ensaio e execução saem da mesma consulta — a fotografia da sombra é, linha a
linha, a leitura da simulação.

**O que a produção faria hoje** (05/10, somente leitura — é o tamanho da
virada): 1.608 perdem a vaga (desce para a Minha base); 8 excedentes; 2.688
saem da Minha base por 5 dias sem toque (1.881 Bolsão, 802 roleta, 5 próprios
com alerta); 222 retornos vencidos; 267 qualificações vencidas; 208 no fundo
há 10+ dias e 11 há 5+ (só alerta).

| Peça                                                            | O que é                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `em_atendimento_processar(modo, limite)`                        | A rodada (cron `em-atendimento-processar`, `41 * * * *`). Classifica a carteira de todo corretor ativo e, para cada lead com ação, **faz** (ligado) ou **registra o que faria** (sombra). Em sombra registra uma vez por dia e só a última fotografia fica. Uma rodada por vez (advisory lock). Admin, service e o cron rodam; anon e corretor, não.                                                                                                                                                                                                                                                                   |
| `_em_atendimento_aplicar` / `_em_atendimento_soltar`            | perde a vaga/excedente → `aguardando_retorno` com o dono e a data do passo; porta de cadência → `aguardando_atendimento`; sem toque/retorno vencido/qualificação vencida → roleta (pago: `aguardando_corretor` sem dono, a triagem do minuto distribui pela zona), Bolsão (estoque: sem dono, classe base) ou fica com alerta ao gestor (próprio); retorno além de 30 dias → perda "retorno futuro" (volta pela reativação); fundo só alerta. Cada movimento deixa `lead_eventos` (`em_atendimento_regra`), `distribution_log` (`regra_65_<acao>`) e aviso ao corretor. Lote de prospecção volta pelo caminho do lote. |
| `em_atendimento_execucoes` / `em_atendimento_movimentos`        | O registro de cada rodada e de cada lead (status e dono de antes). Sem leitura direta; o painel lê `em_atendimento_execucoes_v1` (gestão).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `em_atendimento_desfazer(execucao)`                             | Emergência: devolve dono e status a quem ainda está como a rodada deixou (lead que já ganhou outro dono não é mexido). Admin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `em_atendimento_ligar(virada_em)` / `em_atendimento_desligar()` | A virada (§2.5): marca `modo = ligado` e a data. Até a data a regra continua em sombra — inclusive a trava da roleta, que passa a ler `em_atendimento_ligada()` (modo ligado **e** virada passada). No dia, a primeira rodada aplica tudo de uma vez (decisão 2 do §6); a trava 60/150 segura a roleta e o que não couber espera na fila. Recusa ligar com a régua de devolução da Fatia 4 ativa (dois motores, não). Admin.                                                                                                                                                                                           |
| Alertas 60 / 65                                                 | A cada rodada ligada, o gestor (admin + gestor) recebe "chegou a 60/65" e "está lotado (65/65)" por corretor, no máximo um por dia. Os avisos de lead (próprio parado, fundo 5 e 10 dias) seguem a mesma janela.                                                                                                                                                                                                                                                                                                                                                                                                       |

**O que a tela faz.** O cartão "Regra dos 65" do Painel do Gestor (aba Time)
ganha o estado (sombra / agendada / ligada), a última rodada do cron e, para o
admin, o interruptor: "Ligar a regra" com a data da virada, "Desligar (voltar à
sombra)". Os avisos chegam pelos alertas de sempre.

**Como foi conferido.** `tests/db/em-atendimento-fatia3b.test.ts` (15 casos):
sombra registra e não move, uma fotografia por dia, igual à simulação; ligar só
pelo admin, virada futura mantém sombra e a trava da roleta, régua ativa barra;
ligado move cada caso da regra (perde a vaga com o passo, excedente respeitando
a escolha, cadência, pago/estoque/próprio, retorno protegido × vencido,
qualificação, retorno futuro, fundo só alerta), avisos 60/65 uma vez por dia e
nenhum em sombra; desfazer devolve e não mexe em quem mudou de dono; acesso e
cron. No front, `tests/regra-65.test.tsx` cobre o estado, a descrição da rodada
e o interruptor.

**Deploy e virada.** A migration só cria funções, tabelas e o job; nada se
move no publish. Operação: publicar; acompanhar a fotografia diária da sombra
no cartão; no dia escolhido, o admin liga com a data da virada; a primeira
rodada ligada aplica tudo (minutos, não horas: são updates por lead). Se algo
sair errado, `em_atendimento_desfazer(execucao)` devolve a rodada e
"Desligar" volta à sombra.

## 9. Próximas fatias

| Fatia             | O que entra                                                                        |
| ----------------- | ---------------------------------------------------------------------------------- |
| **3b. Relógios**  | Feito (§8.7): cron, virada, alertas 60/65, desfazer.                               |
| **3c. Duplicado** | Feito: registro mãe, Fatias A e B (`docs/ops/registro-mae.md`).                    |
| **4. Revisar**    | Painel mensal: tempo mediano entre toques nos 65 e taxa Em atendimento → Agendado. |
