# Identidade Lançamento — o CRM com a cara do vídeo (2026-10)

> Quinta rodada do redesign. As anteriores: `central-de-comando.md` (conceito),
> `v2-command.md` (acabamento), `v3-identidade.md` (identidade visual) e
> `modulos-2-menus-2026-09.md` (o que há dentro de cada módulo).
>
> Origem: o vídeo de lançamento de 30 s do CRM (`SMQ_Lancamento_CRM_30s.mp4`,
> 2026-10-09). O dono gostou do visual "bacana e simplificado" do vídeo e pediu
> o CRM real o mais perto possível dele.

## O diagnóstico

O vídeo NÃO é outro produto: os 10 módulos, os nomes, a paleta navy +
dourado, as fontes (Sora nos títulos, Manrope no corpo) e até o texto do
login são os do CRM. O que o vídeo simplifica é a **moldura** — sidebar,
header, cabeçalho de página e hub — que aparece em 100% dos quadros. Por isso
esta rodada mexe só na moldura; o miolo de cada módulo fica para as próximas
fases (tabela no fim).

## O que mudou, e por quê

| Peça                    | Antes (v3 / 2 menus)                                                                         | Agora (Lançamento)                                                                                                                                                                                         | Por quê                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sidebar**             | Contextual: "← Módulos" + só as seções do módulo ativo                                       | Lista de **todos** os módulos do papel, rótulo "MÓDULOS", seções do módulo aberto **aninhadas** sob ele                                                                                                    | É o que o vídeo mostra, e trocar de módulo deixa de exigir a volta ao hub. A regra dos 2 menus continua: módulos → páginas, e no máximo uma linha de abas.  |
| Ícones da navegação     | Duotone com miolo dourado; `fill` no ativo                                                   | Traço (`regular`), brancos; ativo é um "pílula" clara com contorno                                                                                                                                         | O vídeo usa ícone de linha. Dentro das páginas o duotone continua o padrão (`IconContext`).                                                                 |
| Rodapé da sidebar       | Meu perfil · Configurações · Como usar o CRM · Sair · Recolher (5 linhas)                    | Configurações (admin) + **menu da pessoa** (avatar, nome, papel → Meu perfil, Como usar o CRM, Tema, Sair) + botão de recolher                                                                             | O vídeo só mostra Configurações. Juntar o resto num menu tira 4 linhas sem perder nada.                                                                     |
| **Header**              | Trilha com ícone colorido · "Buscar ⌘K" · "$ Registrar venda" · tema · sino                  | Trilha em texto `Módulos / Módulo / Página` · três quadrados: busca, **$** (navy, preenchido) e sino                                                                                                       | Igual ao vídeo. O "$" é o único preenchido porque é a ação que vale dinheiro. O tema foi para o menu da pessoa. Busca e "$" têm tooltip e `aria-label`.     |
| **Cabeçalho de página** | Título 24 px semibold                                                                        | Eyebrow dourado `MÓDULO 03 · GESTÃO DE CARTEIRA` + título 36 px bold                                                                                                                                       | O "MÓDULO 01" do vídeo dá orientação em toda tela. Vale para as 55 telas que usam `PageHeader`.                                                             |
| **Hub /inicio**         | Fora do shell (sem sidebar), faixa navy, agenda no topo, 3 grupos, 4 colunas, cor por módulo | **Dentro do shell**, saudação sem faixa, data como eyebrow, **grade única de 5 colunas** monocromática, pendência em ponto vermelho; a agenda do dia continua acima da grade (decisão do dono, 2026-10-09) | Igual ao vídeo. Na ordem do registro a 1ª linha de 5 já é o "Seu dia" (Central, Prospecção, Carteira, Visita, Follow-Up), então os títulos de grupo saíram. |
| Descrições dos módulos  | Frases longas                                                                                | O texto curto do vídeo (conferido: tudo existe no CRM — ex.: o "briefing de 30 segundos" é `briefing-visita.tsx`)                                                                                          | Cabem no card de 5 colunas e são o texto que o dono escreveu.                                                                                               |
| **Login**               | Painel navy de 46 % + área clara com o cartão                                                | Uma tela navy só, tese à esquerda, cartão branco flutuando à direita                                                                                                                                       | Igual ao vídeo. Formulário, Google, "Esqueci minha senha" e regras de teste intactos.                                                                       |
| Título do BI            | "BI — Relatórios"                                                                            | "BI · Relatórios"                                                                                                                                                                                          | Igual ao vídeo.                                                                                                                                             |

### Decisões da v3 que esta rodada substitui

- **3 e 12 (sem caixa alta):** a caixa alta volta em **dois** usos só — o
  rótulo "MÓDULOS" da sidebar e o eyebrow (`MÓDULO 0X`, a data do hub). Rótulo
  de KPI, de seção e de widget continua em frase normal.
- **10 (dourado nunca em texto):** o eyebrow é dourado. Usa `gold-700` no
  claro (4,6:1 sobre o fundo — passa AA) e `gold-400` no escuro.
- **7 e 11 (cor por módulo):** a cor saiu do hub e da trilha (o vídeo é
  monocromático: o nome e o ícone já identificam). Os tokens `--modulo-*` e
  `CLASSES_MODULO` ficam, travados por `tests/cores-modulo.test.ts`, para uma
  eventual volta.
- **Hub fora do shell (estilo Dommus, 2026-08-30):** o hub entrou no shell.
  Efeito colateral bom: os hosts globais (⌘K, Novo lead, metas, Meu Funil)
  deixaram de ser montados em duplicata no hub, e o treino prático do
  primeiro acesso já abre na primeira tela.

### O que NÃO mudou

Tokens de cor, fontes, raio, cards, a ordem e a visibilidade dos módulos por
papel (`tests/sistemas.test.ts`), a regra dos 2 menus, os contadores e seus
donos, BottomNav do celular, máquina de etapas, roletas, follow-up. Redesign
só visual.

## Numeração dos módulos

`numeroDoModulo(id)` (em `features/nav/sistemas.ts`) numera pela ordem do
registro `SISTEMAS_NAV`, **sem** Configurações: 01 Central de Comando · 02
Prospecção · 03 Gestão de Carteira · 04 Modo Visita · 05 Follow-Up · 06
Pré-venda (SDR) · 07 Documentação & Projetos · 08 Assinaturas & Comissões ·
09 BI · Relatórios · 10 Academia. O número é o mesmo para todo papel (o
corretor não vê o 06, mas o 07 continua 07) — "abra o módulo 04" vale no
treino e no suporte. A ordem do vídeo é um pouco diferente (SDR em 03,
Follow-Up antes do Modo Visita); a do registro foi mantida porque é decisão
registrada ("na ordem do fluxo") e travada em teste.

## Como usar

- **Eyebrow:** automático em todo `PageHeader` dentro do shell. Na página que
  É o módulo sai `Módulo 03`; numa seção, `Módulo 03 · Gestão de Carteira`.
  `eyebrow="…"` troca o texto inteiro; `eyebrow={false}` desliga.
- **De onde vem o módulo:** `ModuloAtualProvider` (shell) resolve pela mesma
  regra da sidebar e da trilha e entrega por contexto (`useModuloAtual`). O
  contexto mora num arquivo leve de propósito (`modulo-atual.ts`): se o
  `PageHeader` importasse o registro, o Rollup o içaria para o chunk
  principal (+13 KB gzip, estourando o orçamento de 250 KB).
- **Tema:** `ThemeMenuItems` (em `components/theme-toggle.tsx`) dentro de
  qualquer `DropdownMenuContent`.

## Fase 2 — Central de Comando (01) ✅

O topo da Fila Única (`/fila`, a porta do módulo) ficou como o quadro do
vídeo:

- **Título do módulo.** `PageHeader` com "Central de Comando" e "Uma lista
  só, na ordem em que o dinheiro está em risco." — o eyebrow sai
  `MÓDULO 01`. A página continua sendo a Fila Única: é o que a trilha, a
  sidebar e o card dizem.
- **Card "Fila Única"** (`FilaCartao`, em `fila-cockpit.tsx`): dia e carteira
  no subtítulo, anel dourado `37 de 65` (o contador da regra dos 65, ou a
  carteira ativa em banco antigo), os três números (vencidos em vermelho,
  vencem hoje em âmbar, sem próximo passo em navy — a cor só acende acima de
  zero) e "Atender agora", que desce até a lista. Fila zerada vira
  "prospectar". O dinheiro em jogo continua no rodapé. Substituiu o painel
  `grande` do cockpit; o compacto do celular não mudou.
- **"Onde os clientes somem"** (`FunilResumo`, `fila-funil-resumo.tsx`): uma
  barra centrada por etapa (a mesma raiz quadrada do degrau), a contagem ao
  lado do nome, a **queda na chegada** a cada etapa (100 − a conversão
  aproximada da passagem, `resumoDoFunil` em `funil-derive.ts`) e a venda em
  dourado. A **maior perda** é a passagem mais longe da META da casa, não a
  maior queda bruta — o fechamento sempre cai mais e acusá-lo todo dia não
  ensina nada. Usa a base inteira (a safra de 30 dias deixa a venda em
  branco) e a mesma chave de cache do funil completo: uma chamada só.
- **O funil completo desceu** para depois da lista (o "Ver funil" leva até
  ele): no trabalho do dia a lista vem antes da análise. No celular, o
  placar compacto continua acima da lista e o funil fecha a página.

Testes: `tests/central-comando-lancamento.test.tsx` (quedas, maior perda pela
meta, safra sem venda, linhas e "Ver funil", card com anel e números).

## Fase 3 — Prospecção (02) ✅

O Modo Foco (`/prospeccao`, a porta do módulo) ficou como o quadro do vídeo:

- **Título do módulo** ("Prospecção", eyebrow `MÓDULO 02`) e o subtítulo do
  vídeo.
- **"Bases do dia"** à esquerda: as três bases do topo do funil (Aguardando
  atendimento, Aguardando retorno, Em qualificação) com a contagem e a regra
  de ordem de cada uma. A escolhida fica em dourado; sem escolha, a primeira
  com lead. Se a escolhida zera, a tela passa para a próxima com gente.
- **O próximo lead** à direita (`ProximoLeadCard`): temperatura e etapa,
  "1 de N", o nome e os seis campos do primeiro contato (empreendimento,
  origem, renda, FGTS, entrada, último contato), e as ações **Ligar** (3C
  Plus, "Chamando…" enquanto disca), **WhatsApp** e **Registrar contato**.
  Antes, escolher a base abria direto o foco em tela cheia, sem prévia.
- **O Modo Foco em tela cheia continua** sendo onde se trabalha a fila
  inteira com J/K — abre do card ("Trabalhar a fila", tecla F) já no lead
  mostrado. Os atalhos W/L/R/F do card se calam com o foco aberto (ele tem
  os próprios) e com qualquer diálogo na tela.
- **A fila não anda em tempo real** (só as contagens): trocá-la por baixo do
  foco aberto deslocaria o lead do J/K. Ela se refaz nas ações da tela.
- **O lote do Bolsão desceu** para depois das bases: é a porta de base
  nova, e as bases que o corretor já tem são o trabalho do dia.
- No celular as teclas somem (barra de atalhos e chips) — não há teclado.

Testes: `tests/prospeccao-lancamento.test.tsx` (campos, posição, atalhos,
silêncio com o foco aberto e com modificador, botões).

## Fase 4 — Gestão de Carteira (03) ✅

O quadro do vídeo é a Base de leads (`/leads`) na visão Kanban — a mesma
página tem a alternância Lista / Kanban:

- **Título do módulo** ("Gestão de Carteira", eyebrow `MÓDULO 03`) e o
  subtítulo do vídeo; a trilha e a sidebar continuam dizendo "Base de
  leads". A alternância Lista / Kanban virou pílula.
- **Cartão enxuto** (`leads-kanban-board.tsx`, vale também para o
  `/pipeline`): nome e temperatura, o empreendimento e "próximo passo: …".
  Saíram do cartão o telefone e o e-mail (estão no dossiê-relâmpago, no
  clique do nome) e a alça de arrasto (o cartão inteiro arrasta). O nome do
  corretor só aparece para a gestão — para o corretor a carteira é toda
  dele. Os prazos (SLA, transferência, dias parado) só aparecem quando há o
  que cobrar.
- **"Próximo passo" continua com alvo de 44 px** (decisão travada em
  `tests/final-regressions.test.ts`), agora com cara de linha de texto.
- **Menu de etapa e descarte** aparecem no canto ao passar o mouse ou focar
  o cartão no desktop; no toque ficam sempre visíveis.
- **Coluna** em painel cinza-claro, título em Sora e a contagem como número
  simples. O fio de 2 px da cor da etapa ficou: com ~10 colunas lado a lado
  ele é o que ajuda a achar a etapa (o vídeo mostra 4).
- **Correção de passagem:** `useCountUp` (números que "contam" — kanban,
  ranking, KPIs) ficava parado em 0 no modo de desenvolvimento (o efeito
  duplo do StrictMode marcava "já cheguei" na limpeza). Agora cada animação
  parte do valor que está na tela. Testado em `tests/animated-number.test.tsx`.

## Próximas fases — o miolo de cada módulo

Tudo o que o vídeo mostra dentro dos módulos tem par no CRM; a diferença é
de composição e acabamento. Ordem sugerida pelo uso diário (Central de
Comando, Prospecção e Gestão de Carteira estão feitas — acima):

| Módulo                     | O vídeo mostra                                                                                                | O que já existe                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 05 Follow-Up               | D1 / D2 / D3 lado a lado com checklist e a régua dos 13 toques como linha de passos                           | `/cadencia` (Fila do Dia, Kanban) e `/follow-up` (régua)         |
| 04 Modo Visita             | Cartão navy da visita (Ligar, WhatsApp, Rota, Documentos), briefing de 30 s, potencial de crédito e checklist | `briefing-visita.tsx`, simulador de financiamento                |
| 07 Docs & Projetos         | Chips de renda + "Só o que cabe", cards com faixa "cabe na renda · parcela" e Book / Tabela / Enviar          | Projetos em Foco já tem renda e "Só o que cabe"                  |
| 08 Assinaturas & Comissões | Aprovação de venda com os quatro marcos (contrato, ato, repasse, efetivação) e quatro KPIs do período         | Hub financeiro, `efetivacao-flags-field.tsx`, aprovação pendente |
| 09 BI · Relatórios         | Abas Dia / Relatórios / Funil / Time / Metas & Ritmo "ao vivo", KPIs, vendas das 12 semanas e exceções em R$  | Painel do Gestor já tem as abas e as exceções                    |
| 06 Pré-venda (SDR)         | Quatro colunas de contagem e a roleta desenhada como roda de corretores                                       | Hub `/sdr`; a roda é desenho novo                                |
| 10 Academia                | Trilha em 5 passos, quiz e certificado                                                                        | Trilha, quiz e certificado existem                               |

Fora de escopo de propósito: o contador `00 / 10` e a pílula com a URL são
recursos de edição do vídeo, não do produto. O logo continua o PNG da marca
(decisão 18 da v3) — o vídeo usa uma versão simplificada da casa; trocar é
decisão de marca, não de tela.
