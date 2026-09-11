# Módulos — regra dos 2 menus (2026-09-11)

> Quarta rodada do redesign. As anteriores estão em `central-de-comando.md`
> (conceito), `v2-command.md` (acabamento) e `v3-identidade.md` (identidade
> visual). Esta rodada não mexe na aparência: mexe no que há DENTRO de cada
> módulo. Origem: pedido do dono em 2026-09-11 — "não quero mais do que 2
> menus dentro dos módulos; a navegação precisa ser muito mais simples".

## A regra

Dentro de um módulo existem no máximo **dois níveis de menu**:

1. **A sidebar do módulo** — uma lista curta e plana de PÁGINAS. Para o
   corretor, nenhum módulo do dia passa de 4 itens (guardado em
   `tests/sistemas.test.ts`).
2. **No máximo uma linha de abas interna** na página, quando a página tem
   visões (Funil × Fechamento no Kanban; Prioridade × Volume × Consulta nas
   filas).

O que a regra proíbe:

- Seção de sidebar que só repete uma aba da mesma tela (era o caso de
  "Agenda & Tarefas" + abas Agenda/Tarefas: dois menus para uma escolha).
- Hub "vitrine" que só reagrupa telas de outros módulos (era o caso de
  Comunicações: Mensagens, Discador e Oferta Ativa não tinham identidade
  própria de módulo).
- Um modo de trabalho inteiro escondido como subitem de outro módulo (era o
  caso do Modo Visita dentro da Carteira).

## O que mudou, e por quê

| Antes                                                                                           | Depois                                                             | Por quê                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Prospecção**: Modo Foco · Base de leads (+ Distribuição · Captação para gestão)               | Modo Foco · **Oferta Ativa** · **Discador** (+ gestão, inalterado) | Oferta Ativa (listas segmentadas) e Discador (PABX) são ferramentas de topo de funil, não "comunicação". A Base de leads é a carteira inteira — pertence à Gestão de Carteira.                                                                                           |
| **Comunicações**: Mensagens · Discador · Oferta Ativa                                           | **saiu**                                                           | Hub sem identidade: reagrupava três telas de outros domínios. Mensagens (modo simulado) segue viva como rota da Carteira, no ⌘K.                                                                                                                                         |
| **Gestão de Carteira**: Funil da carteira · Trabalhar carteira · Agenda & Tarefas · Modo Visita | **Base de leads** · **Kanban** · **Agenda** · **Tarefas**          | A carteira é o que o corretor tem em mãos: a lista, a mesma lista em colunas, e os compromissos dela. Agenda e Tarefas viraram duas seções — a página esconde as abas no desktop (`md:hidden`), a sidebar é o menu. No celular a aba fica, porque a sidebar vira gaveta. |
| Modo Visita: seção da Carteira                                                                  | **Modo Visita**: módulo próprio                                    | É um modo de trabalho inteiro (campo, celular, cliente na frente). Um card no hub, uma tela, sem menu — como a Central de Comando.                                                                                                                                       |
| Card Carteira abria em `/pipeline?fase=carteira`                                                | Abre em `/leads` (Base de leads)                                   | A porta é a 1ª seção. O Kanban passou a ser o quadro COMPLETO (`/pipeline` cru): um lead que está na Base está no Kanban, sem fase escondida. A Reta final continua aba interna do Kanban e atalho no ⌘K.                                                                |

Follow-Up, Pré-venda (SDR), Documentação & Projetos, Assinaturas & Comissões,
BI e Configurações não mudaram: neles a sidebar já é o único menu (o Follow-Up
não tem abas próprias — a sidebar navega por `?tab=`), ou as abas internas não
se repetem na sidebar.

## Rotas que saíram do menu (nenhuma morreu)

| Rota           | Dono (`dominioExtra`) | Como se chega                                                                 |
| -------------- | --------------------- | ----------------------------------------------------------------------------- |
| `/atendimento` | Gestão de Carteira    | ⌘K "Trabalhar carteira (filas por prioridade)", barra mobile "Atender", links |
| `/mensagens`   | Gestão de Carteira    | ⌘K "Mensagens (WhatsApp)"                                                     |
| `/match`       | Gestão de Carteira    | ação na ficha do lead, ⌘K (corte 2026-08-30, inalterado)                      |
| `/links-uteis` | Docs & Projetos       | botão em Projetos em Foco, ⌘K (corte 2026-08-30, inalterado)                  |

`dominioExtra` garante que, ao abrir uma dessas rotas, a sidebar mostra o
módulo dono (sem item aceso) em vez de ficar em branco.

## Contadores (cada um com UM dono)

| Contador (`nav_pendencias`) | Dono                                | Observação                                                                                        |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `atendimento`               | Prospecção (card + Modo Foco)       | inalterado                                                                                        |
| `tarefas_vencidas`          | Gestão de Carteira (card + Tarefas) | antes na seção "Trabalhar carteira"                                                               |
| `agenda_hoje`               | Gestão de Carteira (card + Agenda)  | conta TODO compromisso do dia (visita, reunião, ligação) — por isso NÃO foi para o Modo Visita    |
| `followups`                 | Follow-Up                           | inalterado                                                                                        |
| `aprovacoes`                | Assinaturas & Comissões (gestão)    | inalterado                                                                                        |
| `mensagens_aguardando`      | **ninguém**                         | a RPC continua devolvendo; a contagem aparece in-page (fila Responder de `/atendimento`, Central) |

O card da Carteira leva `badgeRoles: OPERACAO`: o SDR só vê a Base de leads
nele, então um badge de agenda/tarefas não teria onde cair.

## SDR: superfície preservada

A decisão de 2026-09-04 (SDR vê Modo Foco + Base de leads pela carteira antiga,
e mais nada da operação) continua valendo — só que a Base de leads mudou de
módulo. Por isso o card Gestão de Carteira aparece para o SDR com uma única
seção, e Oferta Ativa, Discador, Kanban, Agenda e Tarefas levam
`roles: OPERACAO`. Os atalhos do ⌘K que saíram do menu também são só da
operação.

## Cor

O teal (`oklch(0.58 0.09 195)`) que era do hub Comunicações passou ao Modo
Visita: `--modulo-atendimento` → `--modulo-visita` em `styles.css`,
`cores-modulo.ts` e na tabela de `v3-identidade.md`. A família continua com
dez tons.

## Onde está no código

| Peça                                 | Arquivo                                                                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro dos módulos (fonte única)   | `src/features/nav/sistemas.ts`                                                                                                                                                            |
| Cor por módulo                       | `src/features/nav/cores-modulo.ts`, `src/styles.css`                                                                                                                                      |
| Agenda/Tarefas sem abas no desktop   | `src/routes/_authenticated/agendamentos.tsx`                                                                                                                                              |
| Kanban (quadro completo) como título | `src/routes/_authenticated/pipeline.tsx`                                                                                                                                                  |
| Guardas                              | `tests/sistemas.test.ts`, `tests/cores-modulo.test.ts`, `tests/porta-unica.test.ts`, `tests/mensagens-central.test.ts`, `tests/telefonia-sonax.test.ts`, `tests/contexto-jornada.test.ts` |
