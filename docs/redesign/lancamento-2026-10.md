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

| Peça                    | Antes (v3 / 2 menus)                                                                         | Agora (Lançamento)                                                                                                                                          | Por quê                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sidebar**             | Contextual: "← Módulos" + só as seções do módulo ativo                                       | Lista de **todos** os módulos do papel, rótulo "MÓDULOS", seções do módulo aberto **aninhadas** sob ele                                                     | É o que o vídeo mostra, e trocar de módulo deixa de exigir a volta ao hub. A regra dos 2 menus continua: módulos → páginas, e no máximo uma linha de abas.  |
| Ícones da navegação     | Duotone com miolo dourado; `fill` no ativo                                                   | Traço (`regular`), brancos; ativo é um "pílula" clara com contorno                                                                                          | O vídeo usa ícone de linha. Dentro das páginas o duotone continua o padrão (`IconContext`).                                                                 |
| Rodapé da sidebar       | Meu perfil · Configurações · Como usar o CRM · Sair · Recolher (5 linhas)                    | Configurações (admin) + **menu da pessoa** (avatar, nome, papel → Meu perfil, Como usar o CRM, Tema, Sair) + botão de recolher                              | O vídeo só mostra Configurações. Juntar o resto num menu tira 4 linhas sem perder nada.                                                                     |
| **Header**              | Trilha com ícone colorido · "Buscar ⌘K" · "$ Registrar venda" · tema · sino                  | Trilha em texto `Módulos / Módulo / Página` · três quadrados: busca, **$** (navy, preenchido) e sino                                                        | Igual ao vídeo. O "$" é o único preenchido porque é a ação que vale dinheiro. O tema foi para o menu da pessoa. Busca e "$" têm tooltip e `aria-label`.     |
| **Cabeçalho de página** | Título 24 px semibold                                                                        | Eyebrow dourado `MÓDULO 03 · GESTÃO DE CARTEIRA` + título 36 px bold                                                                                        | O "MÓDULO 01" do vídeo dá orientação em toda tela. Vale para as 55 telas que usam `PageHeader`.                                                             |
| **Hub /inicio**         | Fora do shell (sem sidebar), faixa navy, agenda no topo, 3 grupos, 4 colunas, cor por módulo | **Dentro do shell**, saudação sem faixa, data como eyebrow, **grade única de 5 colunas** monocromática, pendência em ponto vermelho, agenda abaixo da grade | Igual ao vídeo. Na ordem do registro a 1ª linha de 5 já é o "Seu dia" (Central, Prospecção, Carteira, Visita, Follow-Up), então os títulos de grupo saíram. |
| Descrições dos módulos  | Frases longas                                                                                | O texto curto do vídeo (conferido: tudo existe no CRM — ex.: o "briefing de 30 segundos" é `briefing-visita.tsx`)                                           | Cabem no card de 5 colunas e são o texto que o dono escreveu.                                                                                               |
| **Login**               | Painel navy de 46 % + área clara com o cartão                                                | Uma tela navy só, tese à esquerda, cartão branco flutuando à direita                                                                                        | Igual ao vídeo. Formulário, Google, "Esqueci minha senha" e regras de teste intactos.                                                                       |
| Título do BI            | "BI — Relatórios"                                                                            | "BI · Relatórios"                                                                                                                                           | Igual ao vídeo.                                                                                                                                             |

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
  `contexto="…"` troca o nome do módulo (a Fila Única usa a data);
  `eyebrow="…"` troca o texto inteiro; `eyebrow={false}` desliga.
- **De onde vem o módulo:** `ModuloAtualProvider` (shell) resolve pela mesma
  regra da sidebar e da trilha e entrega por contexto (`useModuloAtual`). O
  contexto mora num arquivo leve de propósito (`modulo-atual.ts`): se o
  `PageHeader` importasse o registro, o Rollup o içaria para o chunk
  principal (+13 KB gzip, estourando o orçamento de 250 KB).
- **Tema:** `ThemeMenuItems` (em `components/theme-toggle.tsx`) dentro de
  qualquer `DropdownMenuContent`.

## Próximas fases — o miolo de cada módulo

Tudo o que o vídeo mostra dentro dos módulos tem par no CRM; a diferença é
de composição e acabamento. Ordem sugerida pelo uso diário:

| Módulo                     | O vídeo mostra                                                                                                                                                               | O que já existe                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 01 Central de Comando      | Card "Fila Única" com anel `37 de 65`, três números (vencidos, vencem hoje, sem próximo passo) e "Atender agora"; funil "Onde os clientes somem" com a maior perda destacada | `FilaCockpit`, regra dos 65, `fila-funil.tsx`                    |
| 02 Prospecção              | "Bases do dia" (contagem por base) + cartão do lead com renda, FGTS, entrada e atalhos L / W / R / J / K                                                                     | Modo Foco com bases, lote e atalhos                              |
| 03 Gestão de Carteira      | Kanban de 4 colunas com cartões enxutos (temperatura, horário, próximo passo) e alternador Lista / Kanban                                                                    | `/pipeline`, `leads-kanban-board.tsx`                            |
| 05 Follow-Up               | D1 / D2 / D3 lado a lado com checklist e a régua dos 13 toques como linha de passos                                                                                          | `/cadencia` (Fila do Dia, Kanban) e `/follow-up` (régua)         |
| 04 Modo Visita             | Cartão navy da visita (Ligar, WhatsApp, Rota, Documentos), briefing de 30 s, potencial de crédito e checklist                                                                | `briefing-visita.tsx`, simulador de financiamento                |
| 07 Docs & Projetos         | Chips de renda + "Só o que cabe", cards com faixa "cabe na renda · parcela" e Book / Tabela / Enviar                                                                         | Projetos em Foco já tem renda e "Só o que cabe"                  |
| 08 Assinaturas & Comissões | Aprovação de venda com os quatro marcos (contrato, ato, repasse, efetivação) e quatro KPIs do período                                                                        | Hub financeiro, `efetivacao-flags-field.tsx`, aprovação pendente |
| 09 BI · Relatórios         | Abas Dia / Relatórios / Funil / Time / Metas & Ritmo "ao vivo", KPIs, vendas das 12 semanas e exceções em R$                                                                 | Painel do Gestor já tem as abas e as exceções                    |
| 06 Pré-venda (SDR)         | Quatro colunas de contagem e a roleta desenhada como roda de corretores                                                                                                      | Hub `/sdr`; a roda é desenho novo                                |
| 10 Academia                | Trilha em 5 passos, quiz e certificado                                                                                                                                       | Trilha, quiz e certificado existem                               |

Fora de escopo de propósito: o contador `00 / 10` e a pílula com a URL são
recursos de edição do vídeo, não do produto. O logo continua o PNG da marca
(decisão 18 da v3) — o vídeo usa uma versão simplificada da casa; trocar é
decisão de marca, não de tela.
