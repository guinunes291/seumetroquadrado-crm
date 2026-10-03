# Regra dos 65 em "Em atendimento"

Decisões do dono em 03/10/2026, em resposta a um questionário de 24 perguntas.
Migration da Fatia 1: `20261009120000_em_atendimento_teto_65_sombra` (Drizzle
`0045`). Testes: `tests/db/em-atendimento-sombra.test.ts` (banco) e
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
maior que o da última aplicada: em 03/10 a última era `0043`, com
`1791471900000` (08/10 15:05 UTC). A `0045` usa `1791547200000` (09/10 12:00
UTC), batendo com o nome `20261009120000`. A `0044` tem `when` menor que a
`0043` e por isso nunca seria aplicada pelo migrador; o enum `portal` existe em
produção por outro caminho.

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

## 6. Pontos em aberto antes de ligar (Fatia 3)

1. **Cliente duplicado.** A regra do dono ("vários corretores com o mesmo
   cliente; o primeiro a chegar em Visita realizada fica, os outros registros
   são encerrados, sem aviso") supõe que o mesmo cliente pode estar em dois
   leads ativos. Hoje o banco **proíbe** isso: `leads_telefone_unico_ativo_uidx`
   (desde 02/09) permite um lead ativo por telefone na base inteira. Em
   produção há **zero** telefones repetidos em 98 mil leads vivos. Ou se mantém
   a proibição (e a regra vira só uma guarda, que é o que a Fatia 1 conta), ou
   se relaxa o índice. Relaxar mexe em dedup, roleta e na regra do lead
   repetido; não é para a Fatia 3 decidir sozinha.
2. **Ritmo da devolução.** Ligar tudo de uma vez manda 829 leads pagos à roleta
   e 2.383 ao Bolsão num dia só. A roleta precisa de vazão (por exemplo, por
   lote diário) para não despejar centenas de leads em quem tem vaga.
3. **Mudança de status feita pelo corretor conta como toque?** Hoje não conta
   (é o caso do Eduardo). Contar seria a opção "qualquer edição no lead", que o
   dono rejeitou.
4. **A régua de devolução da Fatia 4 nunca foi ligada.** Ela está em
   `modo = sombra` em produção desde 14/09 (`gestao_config.bolsao`), e é por
   isso que nada parado jamais saiu de ninguém. A regra dos 65 a substitui;
   ligar as duas ao mesmo tempo daria dois motores devolvendo o mesmo lead.
5. **Origens sem classificação clara:** `portal` e `investimento_corretor`
   caem hoje em "estoque". Se o portal for pago, ou se `investimento_corretor`
   for lead próprio, é uma linha em `lead_origem_paga` / `lead_origem_conquistada`.

## 7. Próximas fatias

| Fatia          | O que entra                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2. Telas**   | Contador X/65 no chip da página de Leads, na Fila e no Kanban; janela de troca; os 4 desfechos com data de até 30 dias; nome "Minha base"; tela para o corretor escolher os seus 65 (lê `em_atendimento_sombra_leads_v1`). |
| **3. Ligar**   | Portas fechadas (cadência, lote e transição para Em atendimento exigem resposta + passo); os 5.438 sem dono voltam para Aguardando atendimento; trava da roleta; os dois relógios; virada no 8º dia; alertas.              |
| **4. Revisar** | Painel mensal: tempo mediano entre toques nos 65 e taxa Em atendimento → Agendado.                                                                                                                                         |
