# Identidade v3 — decisões de redesign visual (registro)

> Terceira rodada do redesign. As duas anteriores estão em `central-de-comando.md`
> (conceito) e `v2-command.md` (acabamento premium). Esta rodada não muda o
> conceito: tira a "cara de template" trocando ícones, fonte de corpo, regra do
> dourado, rótulos, cantos e superfícies, e passa o tema claro a padrão.
>
> Origem: 20 perguntas respondidas pelo dono em 2026-09-02. Mock visual publicado
> como artefato para aprovação antes de qualquer código (decisão 20):
> https://claude.ai/code/artifact/c3ff54d7-92b3-4e10-b5b4-80abcfaed057

## As 20 decisões

| #   | Tema                | Escolha                                       | Efeito no código                                                                                                         |
| --- | ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Direção estética    | Manter conceito atual                         | Navy + dourado, sidebar navy e faixa de saudação continuam; removem-se só os excessos da decisão 3.                      |
| 2   | Tema padrão         | **Claro**                                     | `defaultTheme` passa a `light`; escuro "Modo Comando" continua em paridade no toggle.                                    |
| 3   | O que dá cara de IA | Sparkles e rótulos em caixa alta              | 11 telas trocam `Sparkles` pelo monograma da Sami; 64 `uppercase tracking-*` viram frase normal. Glows e glass ficam.    |
| 4   | Referência          | Pipedrive / HubSpot                           | Densidade compacta, cor por módulo, ícone preenchido no ativo, tabela como tela principal.                               |
| 5   | Biblioteca de ícone | **Phosphor**                                  | `@phosphor-icons/react` substitui `lucide-react` (192 arquivos). Mapa nome a nome abaixo.                                |
| 6   | Estilo do ícone     | Duotone navy + dourado                        | Peso `duotone` padrão; item ativo de navegação em `fill`. Área interna recebe a cor do módulo (dourado na sidebar navy). |
| 7   | Módulos             | Cor fixa por módulo                           | Campo `cor` no registro `SISTEMAS` (`features/nav/sistemas.ts`); sidebar, portal, header e badges leem dele.             |
| 8   | SamiQ / IA          | Monograma da Sami                             | Componente `<SamiMark/>` (SVG: disco navy, "S" em Sora, fio e ponto dourados). Usado no FAB, painel, Resumo IA, Match.   |
| 9   | Tipografia          | Trocar corpo (Geist ou Manrope) → **Manrope** | Geist é a fonte da Vercel (novo "padrão de template"). Sora continua nos títulos e KPIs. Inter sai.                      |
| 10  | Dourado             | Acento raro, nunca em texto                   | No claro: trilho ativo, anel de meta, medalhas, foco de teclado, FAB. Sai de texto, badges e botões.                     |
| 11  | Cores de módulo     | 6 tons derivados da marca                     | Chroma ≈ 0,09–0,11 em oklch para parecerem família. Dourado só na Central de Comando; BI e Configurações em neutros.     |
| 12  | Rótulos             | Frase normal, cinza, peso 500                 | Eyebrows de KPI, títulos de seção e cabeçalhos de widget: 12–13px, `text-muted-foreground`, `font-medium`.               |
| 13  | Cantos              | 8px controles, 10px cards                     | `--radius: 0.5rem`; badges 6px; cards `rounded-[10px]` via token; pills continuam `rounded-full`.                        |
| 14  | Superfícies         | Borda fina + fundo off-white                  | Fundo `navy-50`, cards brancos com hairline navy a 10%, sem sombra. Sombra só em popover, menu, diálogo e sheet.         |
| 15  | Movimento           | Manter celebração e transições; sem shimmer   | Skeleton vira pulso de opacidade. Beam-border e pulse-glow ficam (não foram marcados para remoção).                      |
| 16  | Densidade           | Compacta no desktop, confortável no mobile    | Linhas 36–44px e texto 13px acima de `md`; 44px e 14px abaixo. Toggle de densidade da DataTable continua.                |
| 17  | Telas primeiro      | Todas as quatro frentes                       | Shell (sidebar, portal, BottomNav), Home, Leads (tabela, kanban, dossiê), Login/Perfil/Projetos.                         |
| 18  | Marca               | Manter o PNG atual                            | `public/icons/icon-192.png` continua como logo. Sem wordmark novo.                                                       |
| 19  | Estados vazios      | Ícone duotone + frase de ação                 | `EmptyState` recebe ícone Phosphor 44px navy/dourado e ação obrigatória.                                                 |
| 20  | Entrega             | Mock primeiro, depois código                  | Artefato de aprovação; depois implementação em fases com typecheck, lint, testes e build verdes a cada commit.           |

## Tokens propostos (tema claro)

Valores em oklch como em `src/styles.css`; hex aproximado ao lado.

| Token             | Valor                              | Uso                                     |
| ----------------- | ---------------------------------- | --------------------------------------- |
| `--background`    | `oklch(0.975 0.004 250)` · #f5f7f9 | fundo da página (era quase branco puro) |
| `--card`          | `oklch(1 0 0)` · #ffffff           | cards, com hairline em vez de sombra    |
| `--border-subtle` | `oklch(0.22 0.05 250 / .10)`       | hairline dos cards (era .08)            |
| `--radius`        | `0.5rem`                           | controles 8px, cards 10px, badges 6px   |
| `--font-sans`     | `"Manrope Variable"`               | corpo; substitui Inter                  |
| `--font-display`  | `"Sora Variable"`                  | inalterado                              |
| `--shadow-elev-*` | inalterados                        | passam a ser usados só em overlays      |

### Cores por módulo (mesma saturação)

| Módulo             | Token                  | Valor                            | Nome      |
| ------------------ | ---------------------- | -------------------------------- | --------- |
| Central de Comando | `--modulo-central`     | `oklch(0.72 0.12 85)` · #c79e41  | dourado   |
| Prospecção         | `--modulo-prospeccao`  | `oklch(0.55 0.10 240)` · #3179a6 | azul-aço  |
| Atendimento        | `--modulo-atendimento` | `oklch(0.58 0.09 195)` · #238b8b | teal      |
| Carteira           | `--modulo-carteira`    | `oklch(0.42 0.09 262)` · #314c7e | navy      |
| Follow-up          | `--modulo-followup`    | `oklch(0.60 0.11 40)` · #b7684c  | terracota |
| Projetos           | `--modulo-projetos`    | `oklch(0.50 0.10 320)` · #7c4f86 | ameixa    |
| Financeiro         | `--modulo-financeiro`  | `oklch(0.58 0.09 150)` · #51895e | sálvia    |
| Inteligência (BI)  | `--modulo-bi`          | `oklch(0.50 0.03 250)` · #576574 | grafite   |
| Configurações      | `--modulo-config`      | `oklch(0.55 0.01 250)` · #6d7277 | cinza     |

No escuro, as seis cores cromáticas sobem ~0,14 de luminosidade (ex.: azul-aço
`oklch(0.70 0.10 240)`) para manter contraste sobre `--card` escuro.

## Mapa de ícones Lucide → Phosphor

Regra: mesmo nome quando existe; duas trocas de metáfora propositais
(`MessageCircle` → `WhatsAppLogo`, porque é o que o botão abre; `Sparkles` →
`<SamiMark/>`, porque a assistente é um personagem, não um "recurso de IA").

| Lucide (usos)                | Phosphor                         | Observação                         |
| ---------------------------- | -------------------------------- | ---------------------------------- |
| MessageCircle (16)           | WhatsAppLogo                     |                                    |
| Plus (15)                    | Plus                             |                                    |
| CheckCircle2 (14)            | CheckCircle                      |                                    |
| AlertTriangle (14)           | Warning                          |                                    |
| X (13)                       | X                                |                                    |
| Users (13)                   | UsersThree                       | módulo Prospecção                  |
| Check (12)                   | Check                            |                                    |
| ArrowRight (12)              | ArrowRight                       |                                    |
| Sparkles (11)                | `<SamiMark/>`                    | componente próprio                 |
| Trash2 (10)                  | Trash                            |                                    |
| Search (10)                  | MagnifyingGlass                  |                                    |
| Phone (9)                    | Phone                            |                                    |
| Trophy (8)                   | Trophy                           |                                    |
| Loader2 (8)                  | CircleNotch                      | com `animate-spin`                 |
| ExternalLink (8)             | ArrowSquareOut                   |                                    |
| Building2 (8)                | Buildings                        | módulo Projetos                    |
| Target (7)                   | Target                           |                                    |
| Copy (7)                     | Copy                             |                                    |
| Eye / EyeOff                 | Eye / EyeSlash                   |                                    |
| TrendingUp / Down            | TrendUp / TrendDown              |                                    |
| Flame                        | Fire                             | temperatura quente, streak         |
| Thermometer                  | Thermometer                      | temperatura morna                  |
| Snowflake                    | Snowflake                        | temperatura fria                   |
| Clock                        | Clock                            | SLA                                |
| CalendarDays                 | CalendarDots                     |                                    |
| CalendarCheck                | CalendarCheck                    |                                    |
| CalendarClock                | CalendarBlank + Clock            | ou `ClockCountdown`                |
| MapPin                       | MapPin                           |                                    |
| FileText                     | FileText                         |                                    |
| Wallet                       | Wallet                           | módulo Financeiro                  |
| Gauge                        | Gauge                            |                                    |
| Zap                          | Lightning                        |                                    |
| Send                         | PaperPlaneTilt                   |                                    |
| Pencil                       | PencilSimple                     |                                    |
| Download / Upload            | DownloadSimple / UploadSimple    |                                    |
| Lock                         | Lock                             |                                    |
| ShieldAlert                  | ShieldWarning                    |                                    |
| RefreshCw                    | ArrowClockwise                   | tentar novamente                   |
| RotateCcw                    | ArrowCounterClockwise            | desfazer                           |
| Repeat                       | ArrowsClockwise                  | módulo Follow-up                   |
| Headset                      | Headset                          | módulo Atendimento                 |
| Briefcase                    | Briefcase                        | módulo Carteira                    |
| Sun (Central)                | SunHorizon                       | o toggle de tema mantém Sun / Moon |
| LineChart                    | ChartLineUp                      | módulo BI                          |
| BarChart3                    | ChartBar                         |                                    |
| Settings / Settings2         | GearSix / Sliders                |                                    |
| Crosshair                    | Crosshair                        | Modo Foco                          |
| Shuffle                      | Shuffle                          | Distribuição                       |
| Megaphone                    | Megaphone                        | Captação, Materiais                |
| Trello                       | Kanban                           | Funil da carteira                  |
| MapPinned                    | MapTrifold                       | Modo Visita                        |
| Hourglass                    | Hourglass                        |                                    |
| LayoutGrid                   | SquaresFour                      | voltar aos Módulos                 |
| LogOut                       | SignOut                          |                                    |
| Bell                         | Bell                             |                                    |
| Star                         | Star                             |                                    |
| Timer                        | Timer                            | Sprint                             |
| Chevron\*                    | Caret\*                          |                                    |
| SlidersHorizontal            | SlidersHorizontal                |                                    |
| UserPlus / UserX / UserCheck | UserPlus / UserMinus / UserCheck |                                    |
| Info                         | Info                             |                                    |
| Table2                       | Table                            |                                    |
| Calculator                   | Calculator                       |                                    |
| PhoneCall / PhoneOutgoing    | PhoneCall / PhoneOutgoing        |                                    |
| CheckCheck                   | Checks                           |                                    |
| Circle                       | Circle                           |                                    |
| Link2                        | Link                             |                                    |
| PanelLeftClose/Open          | SidebarSimple                    | com rotação no colapsado           |
| Menu                         | List                             |                                    |

## Fases de implementação (após aprovação do mock)

1. **Fundação** — Manrope via fontsource; Inter sai; `--radius` 0.5rem; fundo
   `navy-50`; hairline; sombras só em overlay; tema claro padrão; skeleton sem
   shimmer; campo `cor` em `SISTEMAS`.
2. **Ícones** — `@phosphor-icons/react` com duotone padrão; codemod pelo mapa
   acima; `<SamiMark/>` substitui `Sparkles`; sidebar e BottomNav com `fill`
   no ativo.
3. **Shell e Home** — tiles coloridos no portal; hero sem glass; StatTile com
   rótulo em frase; 64 rótulos uppercase convertidos; header com breadcrumb.
4. **Leads** — DataTable compacta acima de `md`; badges de etapa 6px com tons
   abafados; dossiê com cabeçalho unificado e trilha de etapas; Resumo IA com
   monograma.
5. **Restante** — login e reset; ficha do projeto e Vitrine; `EmptyState` novo
   em todas as rotas; sweep de a11y e contraste AA.

Regras que não mudam: máquina de etapas via RPC `transicionarLead`, aprovação
de venda pela gestão, follow-up automático, roletas. Redesign é só visual.

## Implementação (registro de execução)

Executada em fases na branch `claude/crm-visual-redesign-exa0tr`, cada uma
com typecheck, lint, orçamento de tipos, Prettier, 1.398 testes, build e
orçamento de bundle verdes antes do commit.

| Fase | Entrega                                                                                                                                                                                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Tema claro padrão; Manrope no corpo; `--radius` 0.5rem; fundo off-white e hairline; `elev-1` nula no claro; skeleton sem shimmer; tokens `--modulo-*`, campo `cor` em `SISTEMAS` e `cores-modulo.ts` (com teste que trava os literais); utilitário `icon-duo`.               |
| 2    | `@phosphor-icons/react` no lugar do `lucide-react` em 193 arquivos via `scripts/codemods/lucide-to-phosphor.mjs` (AST); `IconContext` duotone no `__root`; `fill` no item ativo da sidebar e do BottomNav; `<SamiMark/>`; plugin `smq:phosphor-weights` no `vite.config.ts`. |
| 3    | Escala de raio 6/8/10/14; `Card` com hairline; portal por cor de módulo com data e pendências na faixa; `NavBreadcrumb` no header do shell; hero da Home sem vidro; 77 rótulos em caixa alta convertidos; dourado deixa de ser CTA em 12 botões.                             |
| 4    | DataTable compacta no desktop (confortável no celular); dossiê com cabeçalho unificado (`PageHeader.titleAddon`), trilha de etapas numerada e "Resumo da Sami"; kanban com a cor da etapa só no fio de 2px do topo.                                                          |
| 5    | `EmptyState` com ícone duotone navy/dourado; este registro; smoke test do artefato de produção.                                                                                                                                                                              |

### Como usar o que ficou

- **Ícone novo:** `import { Nome } from "@phosphor-icons/react"`; o peso
  padrão (duotone) vem do `IconContext`. Para o item ativo de uma navegação,
  `weight="fill"`. Só duotone, fill e regular embarcam no bundle — se um dia
  precisar de `bold`/`thin`/`light`, ajuste `PHOSPHOR_WEIGHTS` no
  `vite.config.ts`.
- **Área interna do duotone com outra cor:** envolva num contêiner com
  `icon-duo` e defina `--icon-duo` (e opcionalmente `--icon-duo-opacity`).
  Exemplos: sidebar (dourado), `CLASSES_MODULO[cor].tile`, `EmptyState`.
- **Cor de um módulo:** `CLASSES_MODULO[sistema.cor]` dá `tile`, `text`,
  `pill` e `line`. Novo módulo = novo token `--modulo-*` (claro e escuro em
  `styles.css`), nova cor em `cores-modulo.ts` e `cor` no registro.
- **Sami:** `<SamiMark className="h-4 w-4" />` em qualquer slot de ícone
  (é tipado como `IconProps`). Não envolva num círculo dourado: o monograma
  já é o disco.
- **Rótulos:** `text-xs font-medium text-muted-foreground`, frase normal.
  Nada de `uppercase tracking-*` fora do cabeçalho de dias do calendário.

### O que ficou de fora, de propósito

- **Copa (ranking) e mapa da Vitrine** usam `textTransform: "uppercase"`
  inline como identidade própria de torneio/mapa, não como eyebrow de
  template — ficaram como estão.
- **Beam-border, pulse-glow, glass** em outras superfícies (pódio, Copa,
  fechamento, insights) continuam: a decisão 15 não marcou removê-los.
- **`components.json`** ainda declara `iconLibrary: "lucide"` porque o CLI
  do shadcn não conhece o Phosphor; componentes novos gerados por ele
  precisam ter o import trocado à mão (ou rodar o codemod).
