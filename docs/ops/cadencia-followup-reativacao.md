# Cadência de follow-up e reativação

Data: 2026-09-21. Migrations `20260921120000`, `20260921120100`, `20260921120200`.

Todo lead ativo na carteira tem exatamente uma próxima ação com prazo, e sai da
carteira só por um destino definido. São quatro etapas desde 26/09/2026 — Lead
chegou (D0), 1º follow-up (D1), 2º follow-up (D2) e encerramento (D3), 10
tentativas em 4 dias (ver "Quatro etapas" abaixo) — e três saídas: qualificação
(o cliente respondeu), base de reativação (cumpriu 100% sem retorno) ou roleta
(deixou vencer).

## O que mudou em relação ao documento original

O desenho chegou escrito contra um schema que não é o deste CRM. Estas são as
traduções, e o porquê de cada uma.

| O documento pedia                                   | O que foi feito                                               | Por quê                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmar se o motor fica em MySQL/TiDB ou Postgres | Postgres, no mesmo banco do CRM                               | O CRM é Supabase/Postgres. O motor de higiene, a régua de devolução e o motor de SDR já rodam aqui por pg_cron. Sem espelho, sem sincronização, sem segunda fonte para divergir. |
| Tabela `perdas` com CHECK de motivos                | `leads.motivo_perda_categoria`, estendida com 3 motivos novos | A migration `20260914150000` existe para matar a segunda cópia da regra de motivos. Criar `perdas` recriaria o problema que ela pagou para resolver.                             |
| `lead_realocacoes`, `fila_aviso_redistribuicao`     | `distribution_log` + `alertas` + `cadencia_execucao_log`      | São as tabelas vivas que a casa já usa para redistribuição e aviso.                                                                                                              |
| `biblioteca_mensagens`                              | `templates_mensagem` com a coluna `contexto`                  | Mesma tabela, já existente, agora marcada por fluxo.                                                                                                                             |
| `reativacao_fila` com discador próprio              | `reativacao_fila` nova, entregando ao discador que já existe  | A fila de espera e a ficha das 7 tentativas são novas; a integração com o 3C é uma só.                                                                                           |
| `proxima_acao` e `proxima_acao_ts` obrigatórios     | A cadência **não escreve** nessas colunas                     | Ver a seção seguinte.                                                                                                                                                            |

### Cadência e régua de 13 toques: quem manda em que janela

O CRM já tinha a régua de 13 toques (`20260827130000`), com fila do dia própria.
Ela e a cadência se contradiriam para o lead que nunca respondeu: uma manda
insistir por semanas, a outra encerra em 3 dias.

A divisão: a **cadência** governa a janela pré-resposta, do momento em que o
lead ganha corretor até responder ou sair da carteira. Quando o corretor
registra "Cliente respondeu", o lead sai da cadência e a **régua** assume o
follow-up consultivo — que é para o que ela foi calibrada (gaps por
temperatura, multiplicador por etapa de funil), coisas que só fazem sentido com
um cliente que já conversa.

Por isso `cadencia_etapa` é campo próprio e não um valor de `leads.status`: o
status diz onde o lead está na venda, a etapa diz o que o corretor faz agora.

### Por que a cadência não escreve em `proxima_acao` nem `proximo_followup`

A primeira versão escrevia as duas, para cumprir ao pé da letra o "todo lead
ativo tem uma próxima ação com prazo". A suíte de banco cobrou o preço: **21
testes vermelhos em 8 arquivos** — carteira ativa, próximo passo vivo, faixa de
conversa, distribuição por vaga, guardas de MCP e transições de contrato.

Não eram expectativas desatualizadas. Eram dois donos legítimos sendo
atropelados:

1. `proximo_followup` é **espelho** de `min(data_vencimento)` das tarefas
   pendentes (`sync_proximo_followup`). Escrever nele sem tarefa por trás cria
   um espelho que não reflete nada, e a próxima operação em `tarefas` o
   apagaria. A migration `20260914190000` já tinha tirado essa coluna da conta
   de "tem próximo passo" justamente por ela ser espelho.
2. `proxima_acao` é o que as travas de transição exigem **do humano** ("informe
   próxima ação ou follow-up"). Preenchê-la automaticamente desarma a trava: o
   corretor passaria a mover leads pelo funil sem nunca dizer o próximo passo,
   porque a cadência já teria escrito um por ele.

Onde a cadência expressa o que fazer agora: `cadencia_etapa` +
`cadencia_prazo_ts`, mostrados pela Fila do Dia. A exceção é "Cliente
respondeu", onde quem fala é o corretor — e mesmo ali o caminho é **criar uma
tarefa** e deixar o espelho existente funcionar.

## Modelo de dados

- `cadencia_config` — linha única. `modo` (`sombra`/`ativo`), `descanso_dias`
  (15), `espera_pos_d3_h` (24), `tolerancia_venc_d` (1), `intervalo_min_lig`
  (2 min), `lote_estoque_dia` (15).
- `cadencia_tentativas` — uma linha por ligação/mensagem. `ts` **sempre** do
  servidor. Carrega `ciclo`, para que o lead reativado não herde as tentativas
  da primeira passagem.
- `reativacao_fila` — a base de reativação, com `elegivel_em`, `prioridade`,
  `horarios_tentados` e o ciclo do SDR.
- `cadencia_execucao_log` — o que o motor fez, ou faria em sombra.
- Em `leads`: `cadencia_etapa`, `cadencia_inicio_ts`, `cadencia_prazo_ts`,
  `cadencia_ciclo`, `reativado`, `arquivado_em`.

### Motivos de perda: o mapeamento

Três são novos. Os demais do documento já existiam com outro nome, e não
viraram apelidos — dois nomes para a mesma coisa é o que a `20260914150000`
removeu.

| Documento              | CRM                                                   |
| ---------------------- | ----------------------------------------------------- |
| `sem_retorno_cadencia` | **novo** — a saída "no processo", recuperável         |
| `numero_invalido`      | **novo** — antes caía em `outro` e sumia do relatório |
| `opt_out`              | **novo** — é o que barra o discador                   |
| `sem_interesse`        | `sem_perfil`                                          |
| `sem_renda`            | `credito_renda`                                       |
| `restricao_credito`    | `credito_score`                                       |
| `comprou_outro`        | `comprou_concorrente`                                 |
| `duplicado`            | não é perda — o dedup faz merge                       |

`numero_invalido` e `opt_out` entraram em `motivo_perda_sem_retrabalho`.
`sem_retorno_cadencia` ficou **fora** de propósito: é o motivo de quem vai para
a reativação, e marcá-lo lá esvaziaria a base no dia seguinte ao go-live.

## O furo da janela de descanso

O lead que cumpre a cadência sai como `perdido` com `sem_retorno_cadencia`, sem
corretor, `classe_lead = 'base'` — exatamente o perfil que `_bolsao_elegivel`
aceita. Sem trava, ele entraria no Bolsão no mesmo dia e o discador ligaria no
dia seguinte à mensagem que disse "vou encerrar seu atendimento". A janela de
15 dias existiria no papel e não no comportamento, e o custo é bloqueio e
denúncia do número no 3C — que derruba junto SDR, atendimento e oferta ativa.

A trava está em `_bolsao_elegivel`: enquanto houver linha aberta em
`reativacao_fila`, o lead é da trilha de reativação e de mais ninguém. Lead
arquivado sai de todas as filas. Coberto por `tests/db/cadencia.test.ts`
("em descanso o lead NÃO cai no Bolsão nem aparece para o discador").

## O motor

Quatro jobs, todos obedecendo `cadencia_config.modo`, em UTC (o banco agenda em
UTC — 8h de Brasília é `0 11 * * *`).

| Job                  | Cron          | O que faz                                  |
| -------------------- | ------------- | ------------------------------------------ |
| `cadencia_avancar`   | `*/5 * * * *` | D0→D1→D2→D3 quando a etapa fecha           |
| `cadencia_encerrar`  | `7 * * * *`   | D3 cumprido + 24h → descanso e reativação  |
| `cadencia_vencidos`  | `0 11 * * *`  | D0/D1/D2 vencido → roleta                  |
| `cadencia_auditoria` | `0 10 * * *`  | lead em cadência sem corretor ou sem prazo |

Duas decisões que valem registro:

- **O corte de modo vem depois de decidir o destino.** Se viesse antes, 100% das
  linhas sairiam com motivo "modo_sombra" e a sombra não responderia a única
  pergunta que existe para responder: quantos leads, e quais, o motor moveria.
  É a lição do motor de higiene (`20260912120000`).
- **O prazo da etapa seguinte sai do `ts` da conclusão, não de `now()`.** Com
  `now()`, um lead cuja etapa fechou há três dias ganharia prazo para amanhã, e
  três dias de atraso do corretor virariam prazo em dia por causa de uma janela
  de indisponibilidade nossa.

"Não conta como perda do corretor" é regra de **relatório**, não de dado: o lead
vira `perdido` de verdade (meio-termo aqui é o que criou os 2.917 parados), e o
painel é que separa `sem_retorno_cadencia` das demais perdas.

## Aceite

`tests/db/cadencia.test.ts` — 34 testes, cobrindo os 12 cenários do documento
(reescritos para as 4 etapas) mais as travas fora da tabela e a virada. Datas simuladas com `make_interval`, sem sleep.

Os 12: entrada em D1 · 1 ligação + WhatsApp não fecha · 2 ligações em 30s não
fecham · D1 de ontem vira D2 vencendo hoje · D1 parado 3 dias vai à roleta (com
sombra antes) · cadência completa em 3 dias vira descanso + reativação em +15d ·
tudo no mesmo dia **não** vai para a reativação · resposta no D2 exige passo com
data · número inválido encerra · opt-out some do discador · SDR reativa (ciclo 2,
D1 com corretor novo) · reativado que cumpre de novo é arquivado.

Mais: fuso de São Paulo na contagem de dias distintos (uma tentativa às 23h30
conta no mesmo dia; em UTC viraria um dia a mais e daria "3 dias" a quem
trabalhou 2), telefone suspeito, coerência canal × resultado, RLS entre
corretores, ordenação da fila e a auditoria diária.

`tests/cadencia-templates.test.ts` — 17 testes do que o cliente final vê: o
primeiro nome na mensagem, o placeholder que não pode vazar, e o `wa.me` que
não pode duplicar o 55.

Suíte completa depois da Fatia 4: **666 testes de banco (46 arquivos) e 1.929
de unidade (188 arquivos), todos verdes** contra um Postgres 16 real com as
migrations aplicadas em ordem, mais build com `NITRO_PRESET=node-server` e
smoke.

## Implantação

A chave nasce em `sombra`. Nada age sozinho antes de 7 dias de sombra, e a
revisão dos 20 casos sorteados sai de `cadencia_execucao_log`.

```sql
-- Fase 2 → 3, depois da revisão dos 20 casos:
update public.cadencia_config set modo = 'ativo', atualizado_em = now() where id = 1;
```

Mudar a janela de descanso, a tolerância de vencimento ou o intervalo mínimo
entre ligações é `update` nessa mesma linha — sem deploy.

### Fase 0, feita em 22/09/2026

A régua da carga virou SQL versionado (`20260923120000`), e não script solto,
porque o ensaio e a execução precisavam sair da **mesma** função — duas
consultas parecidas divergem no primeiro ajuste, e a divergência só aparece
depois de mover mil leads.

O ensaio (`cadencia_fase0_classificar`, nada é movido) leu o estoque assim:

| destino                                           | leads |
| ------------------------------------------------- | ----- |
| cadência (parados ≤ 30 dias + importação em lote) | 5.087 |
| reativação (parados > 30 dias)                    | 191   |
| encerrar (telefone suspeito / opt-out)            | 8     |

A carga única (`cadencia_fase0_executar('ativo')`) aplicou os dois últimos —
199 leads, 199 aplicados. A admissão na cadência é gradual por decisão, em
lotes por corretor: a primeira chamada admitiu 128 leads em 32 corretores.

### O que a Fase 0 tornou visível, e que ela não resolve

4.944 leads em carteira para 23 corretores dão **215 por corretor**, contra a
política `carteira_teto_65`. A cadência não fecha essa diferença — ela a expõe
um lote por dia, porque cada lead admitido passa a ter etapa, prazo e cobrança.

São dois caminhos, e a escolha é de operação, não de código:

1. **Admitir tudo devagar.** A `lote_estoque_dia` atual (15) esvazia o estoque
   em ~14 dias e entrega 105 tentativas de toque por corretor por dia em
   regime — inviável. A 5/dia são ~43 dias e ~35 toques/dia, que é trabalhável.
2. **Reduzir o estoque antes.** `regua_devolucao_processar` devolve ao Bolsão o
   que está parado, a carteira converge para o teto, e a cadência passa a
   governar só o que cabe. O lead devolvido continua alcançável pelo discador.

Enquanto a escolha não é feita, a admissão diária fica parada de propósito: ela
não tem cron justamente para não decidir isto sozinha.

### Fatia 4 — painel do gestor e tela da reativação (24/09/2026)

`20260924120000` fecha o ciclo com a leitura do processo:

- **Painel da cadência** (`/cadencia?tab=painel`, gestão): quem está devendo
  hoje por corretor, taxa de resposta por etapa (denominador = quem _recebeu_
  toque na etapa, não quem passou por ela), reativação, log do motor e a
  admissão do estoque com ensaio, histórico e desfazer.
- **Reativação** (`/reativacao`, SDR + gestão): fila acionável priorizada e,
  em lista separada e somente leitura, quem ainda está em descanso — o SDR
  precisa saber que o lead existe sem poder ligar para ele.

`cadência cumprida sem retorno` aparece em coluna própria e **não** entra em
perdas do corretor. É a regra inteira do projeto num número: cumprir os sete
toques não é falhar; deixar a etapa vencer, sim.

#### Por que o painel não é seção da sidebar

O Follow-Up já tinha as seis seções que o teto por sistema permite, e "Config
da régua" está fixada por decisão registrada (`tests/sistemas.test.ts`). Em vez
de esticar o teto para sete, o painel seguiu o padrão do corte de 2026-08-30 —
**seção cortada vira atalho de ⌘K** — com um botão no cabeçalho da própria
Fila do Dia como porta visível. Quem cobra o time entra pela mesma fila que
está cobrando, que é melhor do que uma linha a mais no menu.

#### Dívida conhecida: o journal do Drizzle tem entrada repetida

`drizzle/migrations/` carrega `0005`/`0006` como cópias de `0003`/`0004` sem os
comentários, e o `_journal.json` lista as quatro. As migrations são
idempotentes e o que rodou duas vezes foi o mesmo DDL, então produção está
correta — o custo é que os `COMMENT ON FUNCTION` no banco ficaram com o texto
curto das cópias. Mexer no journal de migrations já aplicadas para arrumar
comentário não se paga; fica registrado para não virar arqueologia.

## Base em formação (22/09/2026)

Lead em D1/D2/D3 deixou de ocupar vaga da carteira de 65: é a **base em
formação**, trabalhada na Fila do Dia. Só o que avança de fase ou agenda para
frente sobe para os 65. Junto veio a correção de um defeito desta cadência: o
lead que avançava **pela ficha** (visita agendada, tarefa, perda) continuava em
D1 e o motor de vencidos o mandava para a roleta. Desenho completo em
`docs/ops/carteira-ativa-40-fatia3.md` §11.

## Corretor inativo (23/09/2026)

Medido em produção logo depois da base em formação: 5 leads em D1/D2/D3 de
perfis **inativos** (cauã Caetano, Ezequiel Silva, Juliana Alonso ×2, Emilly
Vitória). A admissão da Fase 0 exigia lead com corretor, mas nunca perguntou
se o corretor estava ativo. Ninguém trabalharia esses leads, o prazo venceria
e o painel registraria falha de quem já saiu da casa.

Migration `20260926120000` (Drizzle `0009`), uma regra — cadência é trabalho de
quem está na casa:

- `cadencia_fase0_classificar` não manda para a cadência lead de dono inativo.
  Encerrar e reativação continuam: não dependem do dono.
- `cadencia_iniciar` recusa dono inativo.
- `cadencia_devolver_inativos` devolve à roleta pelo caminho da própria
  cadência, com motivo `corretor_inativo`. Roda uma vez na migration e, daqui
  em diante, no início de `cadencia_vencidos`. O log usa o job `inativo`, e não
  `vencidos`: o painel conta como falha só `vencidos`, e sair da casa não é
  deixar a etapa vencer.

## Quatro etapas e o Kanban (26/09/2026)

Decisão do dono: "o primeiro toque não é um follow-up". A cadência passou a ter
o dia da chegada separado dos follow-ups, e a tela ganhou a visão em colunas.

| Etapa | Na tela                                   | O que o corretor faz             | Vence                     |
| ----- | ----------------------------------------- | -------------------------------- | ------------------------- |
| D0    | Clientes que chegaram hoje                | abertura + 2 ligações + WhatsApp | fim do dia da chegada     |
| D1    | Clientes para o 1º follow-up              | 2 ligações + WhatsApp            | fim do dia seguinte ao D0 |
| D2    | Clientes para o 2º follow-up              | 2 ligações + WhatsApp            | fim do dia seguinte ao D1 |
| D3    | Clientes para o follow-up de encerramento | mensagem de encerramento         | fim do dia seguinte ao D2 |

Cadência cumprida (100%) = as 4 etapas completas em **4 dias diferentes**. D0,
D1 ou D2 vencido vai para a roleta; o D3 continua terminando em descanso e
reativação.

Migration `20261001120000` (Drizzle `0014`):

- **Código interno `D0`, nome na tela "Lead chegou".** Com isso D1, D2 e D3
  querem dizer no banco o que o dono fala: 1º follow-up, 2º, encerramento. A
  alternativa (renumerar para D1..D4) deixaria "D3" com dois sentidos nos
  relatórios.
- **A virada dos leads em cadência roda uma vez**, guardada por
  `cadencia_config.quatro_etapas_desde` (função
  `_cadencia_virada_quatro_etapas`). D1 antigo → D0, D2 antigo → D1, D3 antigo
  **sem** a mensagem de encerramento → D2 (ganha o 2º follow-up), D3 **com** a
  mensagem → fica. As tentativas, os eventos de etapa e o log do motor são
  renomeados junto, senão o Painel misturaria nomes velhos e novos na semana
  da virada.
- **Quem já recebeu "vou encerrar seu atendimento" antes da virada** é julgado
  pela regra antiga (3 etapas em 3 dias). Sem isso, a cadência que ele cumpriu
  viraria "incompleta" e ele iria para a roleta em vez da reativação. A exceção
  some sozinha em 24 h.
- **Textos:** o de abertura passou para `cadencia_D0`, o de insistência para
  `cadencia_D1`, e o 2º follow-up ganhou `cadencia_D2` novo (editável por
  UPDATE, como os outros).
- **Kanban** (`/cadencia?tab=kanban`, RPC `cadencia_kanban_v1`): a cadência
  inteira do corretor, inclusive quem só vence amanhã — a Fila do Dia continua
  sendo a lista de trabalho. O card é o mesmo da fila (função `_cadencia_item`,
  compartilhada para os contadores não divergirem). **Sem arrastar**: a etapa
  anda por toque registrado, nunca por declaração.
- **A aba Esgotados (13/13) do Follow-Up saiu**, e o Kanban ficou no lugar dela
  na sidebar (teto de 6 seções). O lead que esgota a régua fica sem próximo
  passo e aparece na Reserva da carteira; a decisão (novo passo ou perda com
  motivo) é na ficha. A contagem de esgotados continua na Cobertura do time.

## Pontos que continuam em aberto

- **Sincronização do espelho.** Por que `estagio_funil` mostra 3.029 leads como
  "novo" antes da Fase 0.
- **3C Plus.** Se o discador lê `v_reativacao_discador` direto ou recebe lotes
  por API, e se devolve o resultado de cada ligação para `cadencia_tentativas`
  com `origem = 'discador'` (a coluna já aceita).
- **WhatsApp pelo número pessoal ou pelo 3C.** Hoje o botão abre `wa.me` no
  aparelho do corretor e grava a tentativa com o `template_id`. Se a mensagem
  precisar sair pelo número 3C, vira disparo de HSM pela API — o `template_id`
  já registrado é o que torna essa troca contida.
- **Prefixo de teste `551195555`.** A regra de telefone suspeito marca números
  gravados em E.164 nessa faixa. Um celular real `(11) 95555-xxxx` gravado com
  DDI cairia junto. A Fase 0 deve contar quantos leads reais caem aí antes do
  modo ativo; havendo algum, a regra vira lista configurável.
- **Texto do 2º follow-up.** Escrito na migration de 26/09/2026 ("sei que a
  rotina é corrida… te ligo às 12h ou prefere às 19h?") para a etapa não nascer
  sem mensagem. Precisa do aval do dono; trocar é um UPDATE em
  `templates_mensagem` (contexto `cadencia_D2`).
- **Segundo ciclo do reativado.** Implementado como o documento pede (cumpriu
  100% de novo sem retorno → arquivo direto, sem segunda reativação), e o
  documento marca isso como pendente de confirmação do Guilherme.
