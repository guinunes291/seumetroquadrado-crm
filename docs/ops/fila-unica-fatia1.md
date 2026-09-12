# Fila Única — Fatia 1 (leitura + ações que já existem)

Tela `/fila`, seção "Fila Única" da Central de Comando: uma lista só, ordenada,
no lugar de seis filas e sete widgets. O corretor não escolhe a fila; a fila
escolhe por ele. Esta fatia **não escreve nada novo**: WhatsApp, ligar,
registrar contato, Sami, mudar etapa e confirmar visita são os mesmos caminhos
de `/atendimento`. Não move lead, não marca perdido, não limita carteira.

Origem: pedido do dono em 12/09/2026 ("uma única página de operação essencial
para pararmos de perder clientes ao longo do processo"), depois do diagnóstico
medido no banco no mesmo dia. Mockup aprovado antes do código:
https://claude.ai/code/artifact/8ae2448b-90d8-438a-997c-53cc7a7ff45d

## O que entrou

| Arquivo                                       | Assunto                                                                                       | Reversível sozinho |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------ |
| `src/features/fila-unica/derive.ts`           | lógica PURA: funde as fontes, deduplica, ordena por balde, corta no teto                      | sim                |
| `src/features/fila-unica/use-fila-unica.ts`   | hook: inbox v4 (30/fila) + régua + leads_sem_acao + extras por id                             | sim                |
| `src/features/fila-unica/fila-card.tsx`       | card: dias parado em destaque, etapa, projeto, motivo, próximo passo, 4 ações de polegar, "⋯" | sim                |
| `src/features/fila-unica/fila-cockpit.tsx`    | placar do celular: anel "N de 40" + vencidos / vencem hoje / sem passo                        | sim                |
| `src/features/fila-unica/fila-unica-page.tsx` | página: placar, grupos, diálogos de Atender reaproveitados                                    | sim                |
| `src/routes/_authenticated/fila.tsx`          | rota `/fila` (SDR vai para `/sdr`, como a Hoje)                                               | sim                |
| `src/features/nav/sistemas.ts`                | seção "Fila Única" na Central de Comando (a Hoje continua a home)                             | sim                |
| `src/components/bottom-nav.tsx`               | slot "Fila" na barra do polegar, no lugar de "Atender"                                        | sim                |
| `tests/fila-unica-derive.test.ts`             | 25 casos da lógica pura                                                                       | —                  |
| `tests/fila-card.test.tsx`                    | 8 casos do card (projeto, etapa, dias parado, próximo passo, Resumo, peek, travas, ações)     | —                  |
| `tests/fila-cockpit.test.tsx`                 | 2 casos do placar do celular                                                                  | —                  |

Zero migration. Zero RPC nova. Zero mudança nas telas existentes.

## Decisões que valem revisão

**A ordem é por balde, e o fundo do funil vem antes de qualquer lead frio.**
Medido em 12/09/2026: 124 dos 134 leads em análise de crédito estavam parados
há 5+ dias, numa etapa que converte 39% para venda; a passagem "em atendimento
→ agendado" estava em 7% na safra de 30 dias, contra meta de 70%. Ordem:

1. `sla` — lead novo na mesa (a inbox conta a carteira inteira; estourado, o
   lead vai para o próximo da roleta). Dentro: quem chegou primeiro.
2. `fundo` — agendado, visita realizada, proposta e análise de crédito, de
   qualquer fonte. Dentro: mais dias sem movimento primeiro (o score empata,
   porque a temperatura é derivada da etapa).
3. `responder` — o cliente falou por último.
4. `followup` — toque da régua vencido ou de hoje. Dentro: mais vencido primeiro
   (a mesma ordem do hub Follow-Up).
5. `sem_acao` — sem tarefa, agendamento ou follow-up aberto.
6. `esfriando` — quente/morno sem contato há 3+ dias.
7. `docs` — pasta travada fora do fundo.

Dentro dos demais baldes vale o Score de prioridade (`lib/priority.ts`), o
mesmo das filas de Atender.

**Um lead, um balde.** A inbox e a régua podem trazer a mesma pessoa; a fila
deduplica e fica com o balde mais urgente. Empate no mesmo balde fica com a
inbox, cujas contagens vêm do banco — completada com o que só a outra fonte
trouxe (texto livre do próximo passo, projeto, visita a confirmar, pasta) e,
quando a outra é a régua com toque marcado, com o vencimento medido pela RPC.

**Fonte única com o Follow-Up.** Com `followup_fila_v1` disponível, a fila
"followups" da inbox é ignorada, exatamente como `aplicarFilaRegua` faz em
Atender. Sem a RPC (banco antigo), a fila da inbox volta a valer.

**Cache e teto da inbox.** A inbox é pedida com 30 cards por fila (o teto da
RPC) sob a chave `["atendimento:inbox", "fila-unica", userId]` — chave própria,
porque o payload não é o de `/atendimento` (15 por fila), mas sob o mesmo
prefixo, para toda invalidação alcançar as duas telas. A régua usa o prefixo
`["followup:fila"]`. O que a inbox conta numa fila mas não manda como card é
somado em `resumo.ocultosInbox` e mostrado no cabeçalho ("+ N nas filas de
Atender além dos cards carregados"): a fila nunca apresenta os cards recebidos
como se fossem a carteira inteira.

**A precedência vale para qualquer fonte.** A régua (`followup_fila_v1`) devolve
TODO lead ativo sem toque agendado, com `proximo_followup` nulo e
`minutos_vencido` 0. Isso não é "vence hoje": é lead sem próximo passo, e entra
no balde `sem_acao`. Da mesma forma, `respondeu` na régua manda o lead para
"responder", e lead em `novo`/`aguardando_atendimento` vindo de qualquer fonte
vai para o SLA — o corte por fila da inbox não pode rebaixar um lead para o
balde errado.

**Enriquecimento por id.** `leads_sem_acao` devolve 7 colunas (sem `created_at`,
projeto nem corretor) e nenhuma fonte traz `ultimo_contato`. O hook lê esses
campos em `leads` por `.in(ids)` em lotes de 100 ids em paralelo (RLS da
carteira aplica; centenas de UUIDs numa query string só estouram o limite de
URL de proxy e PostgREST). Qualquer lote com erro derruba a query inteira: um
enriquecimento parcial mentiria no relógio. Com isso o
relógio "dias sem movimento" é o da Higiene (`GREATEST(ultima_interacao,
ultimo_contato)`, senão `created_at`), o card mostra o projeto de interesse de
qualquer fonte e os modais de etapa recebem o `corretor_id` real. A lógica pura
nunca inventa data: sem data conhecida, `diasParado` é `null` e o lead é
tratado como o mais negligenciado do fundo do funil.

**Falha de leitura nunca vira fila vazia.** Erro em qualquer fonte propaga para
`QueryErrorState`. A única degradação silenciosa é `leads_sem_acao` ausente
(banco antigo): a fila fica de pé sem o balde "sem próximo passo".

**O teto de 40 é visual.** A tela mostra os 40 primeiros dos candidatos
recebidos e diz quantos ficaram de fora — e, separadamente, quantos a inbox
contou sem mandar card. A "carteira ativa" como regra de banco (o lead
excedente vai para a pré-venda) é a Fatia 3.

**Projeto e Resumo no card.** Pedido do dono: o projeto de interesse aparece
como chip sempre que existir (todas as fontes o trazem), e o botão Resumo abre,
sem sair da fila, o Resumo da Sami (gerado sob demanda, cacheado por lead) com
renda, FGTS, entrada e origem, mais a porta do histórico completo (peek).

**Ligar usa o click-to-call.** `useLigarLead` (Sonax com fallback `tel:`),
como a fila do Follow-Up faz — não o `tel:` puro do card de Atender. Enquanto
o discador está em chamada, o Ligar de todos os cards trava (é um discador por
corretor); a confirmação de visita trava só o card em voo.

**O corpo do card abre o histórico.** Clique fora de botão, link e menu abre o
peek do lead, como a linha de Atender; o painel do Resumo fica de fora, porque
é onde o corretor seleciona texto.

## No celular (paridade com o mockup, 12/09/2026)

A primeira entrega usava os componentes de desktop no celular: quatro
StatTiles empilhados, cabeçalho com descrição de três linhas e sete botões de
ícone de 28 px por card — o primeiro lead aparecia depois de duas telas de
rolagem, e nada lembrava o mockup aprovado. O que vale agora, abaixo de `md`:

- **Cabeçalho**: data por extenso + título. A descrição e o atalho "ver as
  filas de Atender" só aparecem no desktop.
- **Placar** (`FilaCockpit`): um card só com o anel "N de 40" (quantos dos
  candidatos cabem no dia; acima do teto o anel enche e o excedente vira uma
  linha) e os três números da lista — vencidos, vencem hoje, sem próximo passo.
  O SLA e os ocultos da inbox viram uma linha pequena embaixo. O anel usa a cor
  do módulo Central de Comando (dourado do tema), não o dourado sólido do FAB.
- **Grupos**: nome + contagem; a frase explicativa só no desktop.
- **Card**: nome e temperatura; à direita o número grande — dias sem movimento
  (a chave de ordem do fundo do funil) ou, no SLA, há quanto tempo o lead
  chegou; sem data conhecida, "—". O mockup mostrava R$ em risco nesse lugar;
  sem valor por lead (Fatia 3), os dias são o número honesto. Linha "por quê":
  chip da etapa (cor por hue de `lib/leads`) · projeto · motivo. Depois o
  próximo passo com prazo. Quatro botões de 44 px, sem ícone abaixo de `sm`
  (cabem em 360 px): Ligar, Zap, Resumo, Registrar (primário). Sami e mudar
  etapa ficam no "⋯" do canto; a visita a confirmar ganha um botão inteiro
  acima da fila de ações.
- **Barra do polegar**: o slot "Atender" vira "Fila" (`/fila`). A Fila Única
  absorve as seis filas; Atender continua no menu lateral e no ⌘K. É a decisão
  mais visível desta rodada e reverte com uma linha em `bottom-nav.tsx`.

No desktop o mesmo card vira a coluna lateral do mockup: informação à
esquerda, número e "⋯" em cima à direita, ações embaixo à direita. O placar
continua sendo os quatro StatTiles.

## Funil das etapas (12/09/2026)

O mockup tinha o funil e a primeira entrega não. Entrou como painel próprio na
Fila Única, entre o placar e a lista (`fila-funil.tsx`), fechado no celular e
aberto no desktop:

- **Dados**: RPC nova `fila_funil_v1(_dias, _corretor)` (migration
  `20260912190000`), que devolve os dois recortes numa chamada — `safra` (leads
  criados nos últimos N dias) e `base` (carteira inteira) — com leads na etapa
  e parados há 5+ dias pelo relógio da Higiene. Corretor vê só a própria
  carteira (o `_corretor` é ignorado); gestão vê o que o papel alcança. Sem a
  RPC, o painel diz "sem dado" — nunca um funil vazio.
- **Desenho** (`funil-derive.ts`, puro): oito degraus com largura pela raiz
  quadrada do volume ("entrada" só aparece com lead sem dono), barra vermelha
  de parados, um marcador por divisa com a conversão atual → meta da casa
  (`PASSAGENS`, com a fonte de cada meta no tooltip) e a saída lateral dos
  perdidos. A conversão é a aproximação do mockup — "chegou à seguinte ou além
  ÷ chegou a esta ou além" pelo status atual — e o texto do recorte diz isso.
  A coorte real continua na Inteligência, só para a gestão.
- **Vazamentos**: as três etapas com mais leads parados, com percentual e a
  frase do custo de cada uma.
- **No celular** (medido no Chromium a 390 e 360 px): cada etapa tem um
  rótulo curto (`labelCurto`, "Aguard. atend.", "Qualific. corretor"…) em até
  duas linhas, sem quebrar palavra; o trilho tem 94 px e o marcador perde a
  bolinha — o tom (na meta / perto / longe) vai na cor do número atual —
  porque a casa não renderiza texto auxiliar abaixo de 12 px (piso em
  `styles.css`) e, a 12 px, "100% → 100%" com bolinha não cabia sem cobrir os
  dígitos. No desktop o rótulo completo também pode quebrar em duas linhas em
  vez de cortar com reticências ("Aguardando atendimento" não cabe em 150 px).
- **Teste de banco** (`tests/db/fila-funil.test.ts`): a fixture de venda
  antiga entra em `contrato_fechado` por baixo do trigger
  (`session_replication_role = replica`), como em `higiene-funil.test.ts` — a
  guarda "só fecha com venda aprovada" segue valendo no caminho real.

## Fatia 2 — igual ao mockup (12/09/2026)

Pedido do dono: "quero que esse módulo fique igual o artefato". O que faltava
entre a Fatia 1 e o mockup aprovado entrou de uma vez. Em ordem de peso:

- **Desfecho de um toque** (`desfecho.ts` puro, `use-desfecho.ts`,
  `fila-desfecho.tsx`). "Registrar" abre "o que aconteceu?" com 3 a 5
  respostas por situação — análise de crédito (aprovado, aguardando Caixa,
  reprovado, não atendeu, perdeu), agendado (foi, no-show, remarcou,
  desistiu), visita realizada (quer proposta, objeção, não atendeu, perdeu),
  chegou agora (qualificar, não atendeu, WhatsApp enviado, sem perfil),
  respondeu (enviei simulação, agendei visita, objeção), pasta travada e o
  genérico (avançar, pediu retorno, objeção, não atendeu, perdeu). Cada
  resposta já carrega o próximo passo com data e, quando cabe, a etapa.
  Confirmar grava, nesta ordem e pelos caminhos das telas donas: a interação
  (título no vocabulário de `RESULTADOS_CONTATO`, `metadata.origem =
fila-unica`), a objeção em `leads.objecoes`, a tarefa do próximo passo
  (`garantirFollowUpAberto`; `leads.proximo_followup` é espelho por trigger)
  e a etapa por `transicionar_lead` quando a resposta a muda. Respostas com
  formulário obrigatório (visita realizada, agendar) abrem o modal da casa;
  "perdeu" abre o diálogo de perda. Uma resposta nunca oferece transição que
  o funil recusaria (`transicaoLeadPermitida`): ela vira só interação +
  próximo passo. **Desfazer** (5 s, `useUndoableMutation` em modo
  compensate) apaga a interação e a tarefa por soft-delete e devolve as
  objeções — o mesmo que `samiq_desfazer_proposta` faz; a mudança de etapa
  fica fora do undo por regra de negócio. No desktop o painel abre dentro do
  card; no celular é a folha que sobe de baixo (vaul), duas colunas de 44 px,
  "Perdeu" na linha inteira, "ditar" abre a Sami com o lead. O card registrado
  vira "Registrado ✓ · próximo passo …" por 6 s ou até a fila se atualizar.
  O registro detalhado (canal, texto livre) continua no "⋯".
- **Dinheiro em jogo.** O R$ do mockup. Sem valor por lead no banco, o número
  honesto é o VGV estimado pelo preço de tabela do projeto de interesse
  (`projetos.preco_a_partir`, a mesma convenção `valor_potencial` das
  métricas; sob consulta ou sem projeto, null — nunca um chute). O
  enriquecimento por id embute o projeto; o card mostra "R$ 250 mil · em jogo
  · 79 d parado" e o hero soma a fila ("Dinheiro em jogo na sua fila"). Não
  é comissão: o percentual de comissão é interno à gestão (decisão 10 dos
  projetos) e a comissão do corretor depende do split. A ordem continua por
  balde e dias parado — VGV de MCMV varia pouco entre projetos e ordenar por
  ele só adicionaria ruído.
- **Ordem dos grupos como no mockup**: fundo do funil parado antes de
  "chegaram agora". O SLA do 1º contato continua contado no placar e o lead
  novo continua no topo do seu grupo; o mockup e a tese ("um lead em análise
  parado há 66 dias vale mais do que 200 leads frios novos") põem o fundo
  primeiro.
- **Hero do desktop**: data, título, tese com negritos, "Começar pelo mais
  caro" (âncora na fila) e "Ver onde os clientes somem" (âncora no funil), e o
  cockpit grande (`FilaCockpit grande`): anel de 150 px "N/40 carteira ativa",
  três números com o filete colorido e a linha do dinheiro em jogo. Os quatro
  StatTiles saíram do desktop.
- **Resumo do card em duas colunas**: Resumo da Sami + fatos (faixa MCMV,
  FGTS, decisor, renda, entrada, origem) | Histórico recente (as quatro
  últimas interações, mesma chave do peek) + "Abrir dossiê completo →".
- **Coluna lateral do desktop** (`fila-lateral.tsx`): Agenda de hoje (a
  `useAgendaDoDia`, com "confirmada" / "sem confirmação" / "validar" pela
  régua da Agenda), "Como a fila se mantém finita" (os números reais da
  semana: desfechos registrados por aqui, perdidos com motivo, reentradas por
  WhatsApp — e a frase honesta de que a devolução automática à pré-venda é a
  próxima fatia) e "O que a Sami faz aqui". No celular não aparece: a Agenda
  tem o próprio slot.
- **Funil**: legenda (leads na etapa, parados, na meta/perto/longe, total do
  recorte), tooltip por degrau (leads, parados, a passagem seguinte), o
  trilho fino por trás dos marcadores, e a ligação visual degrau ↔ card de
  vazamento ao passar o mouse.
- **"Entrou agora"**: quem não estava na lista na leitura anterior ganha o
  chip dourado — é o lead que a fila puxou quando outro saiu.
- **As cinco regras da página** no pé do desktop, em texto.
- **A Sami no meio da barra do polegar** (`bottom-nav.tsx`): o slot central
  deixa de ser o "+" com três ações e passa a abrir a Sami num toque, como o
  mockup ("a Sami fica no meio da barra"). Novo lead continua na Leads e no
  ⌘K; Projetos e preços, na bancada e no menu. Reverte com uma linha.
- **A mesma fila, vista pelo gestor** (`fila-equipe.tsx`, RPC nova
  `fila_equipe_v1`, migration `20260912230000`): para admin, gestor e
  superintendente, abaixo da lista, uma linha por corretor do escopo com
  carteira ativa (leads vivos com dono, contra o teto de 40), próximos passos
  vencidos, sem próximo passo (a mesma régua de `leads_sem_acao`), fundo do
  funil parado (5+ dias pelo relógio da Higiene) e o dinheiro em jogo, na
  ordem de quem precisa de ajuda (fundo parado, depois vencidos). Corretor da
  equipe sem lead aparece zerado; admin/superintendente ganham a linha "Sem
  corretor" com o estoque sem dono, que leva à Higiene. "Ver a fila" abre
  `/fila?corretor=<id>`: a página pede as três fontes com o alvo (a inbox v4
  já checa `pode_acessar_corretor`, a régua e `leads_sem_acao` aceitam o
  corretor no escopo) e o funil do corretor (`_corretor` de `fila_funil_v1`),
  com "Vendo a fila de …" e o caminho de volta. Corretor chamando a RPC
  recebe 42501, nunca lista vazia. Teste: `tests/db/fila-equipe.test.ts`.
- **Toque duplo é contado uma vez.** Ligar e WhatsApp já registram o contato
  (o discador grava `chamadas`, o WhatsApp grava a interação); o desfecho
  grava a interação com o resultado. `followup_toques_do_lead` colapsa
  eventos a menos de 10 minutos num toque só — é assim que a régua já lida
  com discador + registro manual.

## A página Hoje foi retirada (12/09/2026)

Decisão do dono: a Fila Única é a porta da Central de Comando. `/hoje` vira
redirecionamento para `/fila` (a antiga aba Analytics segue para os
relatórios do Painel do Gestor), a seção sai do módulo, o slot da barra do
polegar vira Fila | Leads | + | Agenda | Buscar, e a pasta
`src/features/command-center` (widgets, ronda, missões) foi removida com seus
testes — nada fora dela a importava. Reverter é reverter o commit.

Para a **gestão**, a porta do módulo no hub também é a Fila Única (decisão do
dono, 12/09/2026). No intervalo entre a retirada da Hoje e a Fatia 2 o card
desviava a gestão para o cockpit do Painel do Gestor (aba Dia) via
`homePorPapel`, porque a fila era só a carteira pessoal; a Fatia 2 trouxe a
tabela "a mesma fila, vista pelo gestor" e o `?corretor=` na própria `/fila`,
e o desvio saiu — o gestor caía no painel e não achava a página nova. O painel
segue acessível por BI → Painel do Gestor. O que a Hoje mostrava ao
**corretor** e não tem substituto ainda: o widget de meta e ritmo do mês (o Meu
Raio-X mostra os KPIs, não a meta). Fica anotado para a Fatia 3.

**Como foi conferido.** Sem login de produção neste ambiente, os componentes
foram renderizados com fixtures em jsdom, envelopados no shell real (header,
`px-4 pb-24`, BottomNav) com o CSS do build e fotografados no Chromium em
390 px e 360 px (claro e escuro) e 1280 px. Os testes unitários não cobrem
breakpoint; a foto é a prova.

## Medir ANTES de aplicar

Não há migration; o "antes" é o comportamento das telas donas, que não muda.
Para a comparação da Fatia 2, registrar hoje:

```sql
-- Quantos leads vivos da carteira dos corretores não têm próximo passo
SELECT count(*) FROM public.leads l
 WHERE l.deleted_at IS NULL AND l.na_lixeira = false AND l.corretor_id IS NOT NULL
   AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
   AND NOT EXISTS (SELECT 1 FROM public.tarefas t WHERE t.lead_id = l.id AND t.status IN ('pendente','em_andamento'))
   AND NOT EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.lead_id = l.id AND a.data_inicio >= now() AND a.status NOT IN ('cancelado','realizado','nao_compareceu'))
   AND (l.proximo_followup IS NULL OR l.proximo_followup <= now());

-- Fundo do funil parado (5+ dias sem movimento)
SELECT status, count(*) FROM public.leads
 WHERE deleted_at IS NULL AND na_lixeira = false
   AND status IN ('agendado','visita_realizada','proposta_enviada','analise_credito')
   AND COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at) < now() - interval '5 days'
 GROUP BY 1;
```

## Provar DEPOIS de aplicar

A tela é leitura. O que tem de bater: o placar "Fundo do funil parado" de um
corretor = os leads dele nas quatro etapas do fundo que aparecem em qualquer
fila da inbox, na régua ou em `leads_sem_acao`. E `/atendimento` continua
mostrando exatamente o que mostrava — nenhum arquivo dela foi tocado.

## Rollback

Sem deploy não há como desligar (não há flag: a tela não escreve nada e não
tem custo além das três RPCs que a home e Atender já pagam). Reverter =
reverter o commit: some a rota, a seção do menu e a pasta da feature; nada no
banco muda.

## Testes

```bash
npm run test -- tests/fila-unica-derive.test.ts tests/fila-card.test.tsx tests/sistemas.test.ts
```

## Leitura relacionada

- `docs/ops/higiene-diagnostico-2026-09.md` — as medições que sustentam a ordem
  dos baldes (fundo do funil parado, escrita em lote).
- `docs/auditoria/ux-ia-2026-08/05-nova-ia.md` — as seis filas de Atender e a
  home por papel, que esta tela absorve.
- `docs/samiq/2026-09-05-decisoes-copiloto.md` — o registro por proposta da
  Sami, que a Fatia 2 vai usar como desfecho por voz.

## O que NÃO entrou (fatias seguintes)

- **Carteira ativa limitada e devolução (Fatia 3).** O teto de 40 continua
  visual: a tela mostra os 40 primeiros e diz quantos ficaram de fora. A regra
  de banco — tabela própria, teto em `gestao_config`, três tentativas sem
  resposta devolvem à pré-venda, dois dias sem próximo passo idem — fica para
  a próxima fatia; o painel "Como a fila se mantém finita" diz isso com todas
  as letras.
- **Push no SLA do 1º contato e nos vencidos.** O mockup mostra o push "Carla
  M. · SLA vence em 4 min". A infraestrutura de push existe; nada a dispara
  para o que importa. Precisa de um disparador no banco (pg_cron) ou na edge,
  não de tela.
- **Comissão em risco em reais.** O card e o hero mostram o VGV pelo preço de
  tabela, não a comissão: o percentual é interno à gestão e a comissão do
  corretor depende do split. Ordenar por dinheiro fica para quando houver
  valor por lead de verdade.
- **Desfecho por voz de ponta a ponta.** "Ditar" abre a Sami com o lead e o
  texto de registro; o pacote (interação + objeção + follow-up) continua sendo
  confirmado no painel da Sami, não no card.
