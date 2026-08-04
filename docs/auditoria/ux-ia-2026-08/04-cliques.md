# Fase 4 — Contagem de cliques das tarefas críticas

> Caminhos reconstituídos do código, clique a clique, incluindo filtro, confirmação e navegação.
> **Digitação não conta como clique.** Abrir modal e salvar contam.
>
> Metas: tarefa diária do corretor **≤3** a partir da home · leitura do gestor **≤2** ·
> qualquer tarefa **≤5**. 🔴 = estourou.
>
> Lista revisada com você: as 14 originais + **aprovar venda pendente**, **cobrar corretor sem
> atividade hoje** e **ver leads parados na roleta**.

## Premissas de contagem

| Persona | Ponto de partida | Navegação disponível |
|---|---|---|
| Corretor | `/hoje` no **celular** | barra de polegar: Início · Leads · [FAB SamiQ] · Atender · Pipeline (`bottom-nav.tsx:13-20`); demais destinos só pelo hambúrguer → item → subitem |
| Gestor | `/hoje` no **desktop** | sidebar com 6 grupos, subitens recolhíveis (`app-sidebar.tsx:53-131`) |

---

## Corretor — celular

| # | Tarefa | Caminho atual | Cliques | Telas | Meta | Gargalo |
|---|---|---|---|---|---|---|
| 1 | Buscar lead por telefone e abrir histórico | lupa no header → *digita* → toca resultado → dossiê abre na Timeline (aba padrão) | **2** | 2 | ≤3 | OK. Mas a lupa é alvo pequeno no topo da tela — H-Fitts ruim para o polegar (`route.tsx:122-134`) |
| 2 | Registrar interação em lead existente | Atender → toca card (abre drawer) → "Registrar contato" → *preenche* → Salvar | **4** 🔴 | 2 | ≤3 | A ação mais repetida do dia não tem alvo primário. O FAB — maior alvo da tela — é o SamiQ, que não escreve nada |
| 3 | Avançar lead uma etapa | lupa → resultado → toca a etapa na barra inline do dossiê (`leads.$leadId.tsx:340-355`) | **3** | 2 | ≤3 | No limite. Com modal obrigatório (agendado / visita / crédito / venda) vira **4** 🔴 — e são 4 das 8 etapas |
| 4 | Cadastrar lead novo | lupa → ação "Novo lead" no ⌘K → *preenche* → Salvar | **3** | 1 | ≤3 | OK, mas depende de o corretor **saber** que a busca também executa ações — H-Reconh. Pelo caminho óbvio (Leads → Novo lead → Salvar) também dá 3 |
| 5a | Agendar visita | hambúrguer → Atendimento → Agenda & Tarefas → "Novo agendamento" → *preenche* → Salvar | **5** 🔴 | 2 | ≤3 | Agenda está a 3 toques de distância: não existe na barra de polegar |
| 5b | **Confirmar** a visita | **INEXISTENTE** para o corretor | — | — | ≤3 | Só há `marcar_presenca` dentro do Modo Visita (`features/visitas/`). A exceção `visita_sem_confirmacao` existe **só no painel do gestor** (`painel-dia/derive.ts:12`) — o sistema sabe que a visita não foi confirmada e não oferece ao corretor onde confirmar |
| 6 | Consultar projeto → tabela de preços | hambúrguer → Projetos → card do projeto → alternar unidades para "tabela" | **4** 🔴 | 3 | ≤3 | Projetos não está na barra de polegar. É consulta com **cliente na frente** — o pior lugar para gastar 4 toques |
| 7 | "O que eu tenho para fazer hoje" | já é a home (`/hoje`) | **0–1** | 1 | ≤3 | ✅ A melhor tarefa do sistema. Widgets de agenda + tarefas + NBA na primeira dobra |
| 8 | Status da pasta e o que falta | lupa → resultado → aba "Documentação" | **3** | 2 | ≤3 | No limite. Pelo Atendimento (fila "docs") o drawer não mostra a pasta — precisa abrir o lead assim mesmo |

**Média do corretor: 3,0 cliques. Três tarefas estouram (2, 5a, 6); uma não existe (5b).**

---

## Gestor — desktop

| # | Tarefa | Caminho atual | Cliques | Telas | Meta | Gargalo |
|---|---|---|---|---|---|---|
| 9 | Funil consolidado e onde acumula | Gestão → aba "Gargalos" | **2** | 1 | ≤2 | ✅ OK. Mas a resposta está partida em duas abas: "Funil" mostra a distribuição, "Gargalos" mostra o acúmulo — os mesmos filtros nas duas (`painel-gestor.tsx:192`) |
| 10 | Funil de UM corretor vs média do time | Gestão → Funil → abre select "Corretor" → escolhe | **4** 🔴 | 1 | ≤2 | E **a comparação não existe**: o filtro *troca* a visão, não compara. Para ver a média é preciso limpar o filtro e memorizar o número — H-Reconh violada na tarefa central de gestão de time |
| 11 | KPIs do mês vs mês anterior | Gestão → Relatórios *(preset já vem "este mês")* | **2** | 1 | ≤2 | ✅ **CORRIGIDO — eu errei aqui.** Escrevi que a comparação era INEXISTENTE. Ela existe: `dashboard_kpis` calcula `prev` deslocando a janela e `derive.ts:124-127` mostra a variação % de leads novos, vendas, perdidos e VGV. O que **não** existe é comparação do conjunto todo lado a lado — mas as 4 métricas que importam já vêm com delta, em 2 cliques |
| 12 | Redistribuir/realocar lead | Gestão *(aba Dia é a padrão)* → exceção → "Transferir" → escolhe corretor → confirma | **4** | 1 | ≤5 | ✅ dentro da meta geral. Ação in-line no Painel do Dia é o melhor padrão do sistema (`painel-dia-view.tsx:335-358`). O caminho alternativo por `/leads` custa **5** |
| 13 | Leads parados há mais de X dias | Leads → filtro de contato → "Sem contato 5+ dias" ou "30+ dias" | **3** | 1 | ≤2 | ⚠️ **X só aceita 5 ou 30** (`lib/leads-views.ts:30-33`). Não há como perguntar "parados há 15". Ampliar exige migração: o `CASE` de `leads_filtered_v3` termina em `ELSE true` (`20260728100000_leads_filtered_v3.sql:246`), então um valor novo devolveria a lista inteira sem filtro — e no caminho v3 o cliente confia no servidor (`leads.index.tsx:637`) |
| 14 | Pastas travadas por pendência (toda a operação) | **INEXISTENTE** | — | — | ≤2 | 🔴 O Painel do Dia tem 7 tipos de exceção e **nenhum é de documentação** (`painel-dia/derive.ts:9-15`). Só o corretor vê a fila "docs" da própria carteira (`atendimento.tsx:42`). O gestor não tem tela para a pergunta — existe ferramenta MCP externa `crm_listar_pastas_por_status`, ou seja, **a pergunta é feita, só não pelo CRM** |
| 15 | Aprovar venda pendente | Início → *(badge aparece em **Gestão**)* → Gestão → não está lá → Desempenho → aba Comissões → aprovar | **5** 🔴 | 3 | ≤2 | 🔴 **O badge mente.** O contador vive no item Gestão (`app-sidebar.tsx:120`) e a tela está montada em `features/comissoes/comissoes-page.tsx`, servida por **Desempenho → Comissões**. Quem seguir o aviso não encontra a ação |
| 16 | Cobrar corretor sem atividade hoje | Gestão → aba "Time" | **2** | 1 | ≤2 | ✅ para ver performance (`performance-view.tsx`: Corretor, Leads recebidos, Contatos reais). Mas o recorte é do **período**, não do **dia** — "quem não fez nada hoje" exige leitura de coluna e comparação mental. A RPC `gestao_metricas`, que agrega atividade e aderência, existe e **nenhuma tela chama** |
| 17 | Leads parados na roleta | Gestão → Distribuição | **2** | 1 | ≤2 | ✅ OK |

**Média do gestor: 2,9 cliques (nas que existem). Quatro estouram (10, 13, 15, e a 11 na metade que importa); uma não existe (14).**

---

## Placar

| Situação | Tarefas |
|---|---|
| ✅ Dentro da meta | 1, 3 (sem modal), 4, 7, 8, 9, **11**, 12, 16, 17 |
| 🔴 Estoura a meta | 2, 3 (com modal), 5a, 6, 10, 13, 15 |
| ⛔ **INEXISTENTE** | 5b (confirmar visita), 14 (pastas travadas — gestor) |

**Duas** tarefas que você precisa fazer não têm caminho no sistema. Isso é achado de auditoria,
não de UX: nenhuma reorganização de menu resolve uma tela que não existe.

> **Correção.** A primeira versão desta fase listava três inexistentes, incluindo "comparar com
> o período anterior". Estava errado — a comparação existe desde sempre em `dashboard_kpis`
> (`prev`) e aparece como variação % em Relatórios. Encontrei ao reescrever a função para a
> Onda 3 e ver o retorno real `{pipeline, periodo, prev}`. Contei o caminho que o código
> permite, e neste caso li o consumidor errado.

---

## Ranking — as 10 piores razões cliques ÷ frequência

Frequência estimada em execuções por semana, por usuário. Onde a tarefa é inexistente, conto o
caminho manual que a substitui hoje (WhatsApp, planilha, memória) como **custo infinito**.

| # | Tarefa | Cliques | Freq/semana | Custo semanal | Por que está aqui |
|---|---|---|---|---|---|
| 1 | **#2 Registrar interação** | 4 | ~100 | **400** | A ação mais repetida do sistema, com 1 clique a mais que a meta. Um clique economizado aqui vale mais que qualquer outra mudança isolada |
| 2 | **#3 Avançar etapa (com modal)** | 4 | ~40 | **160** | 4 das 8 etapas exigem modal. Você decidiu manter os modais — então o ganho tem de vir do caminho até a etapa, não da fricção |
| 3 | **#6 Tabela de preços** | 4 | ~30 | **120** | Consulta com cliente na frente. Custo do erro é alto: perder o momento vale mais que o clique |
| 4 | **#5b Confirmar visita** | ⛔ | ~20 | **∞** | Não existe. Vira WhatsApp e memória — e a falha aparece depois como exceção no painel do gestor |
| 5 | **#5a Agendar visita** | 5 | ~15 | **75** | Agenda a 3 toques de distância no celular |
| 6 | **#14 Pastas travadas (gestor)** | ⛔ | ~10 | **∞** | Não existe. A pergunta é feita por fora do CRM |
| 7 | **#1 Buscar lead** | 2 | ~60 | 120 | Dentro da meta, mas o alvo é ruim para polegar — ganho fácil ao levar a busca para a barra inferior |
| 8 | **#15 Aprovar venda** | 5 | ~8 | **40** | O badge aponta para o lugar errado. Custo real é maior que 5: inclui procurar |
| 9 | **#10 Funil de um corretor vs média** | 4 | ~4 | 16 | A comparação, que é o ponto da tarefa, não existe |
| 10 | **#11 KPI mês vs anterior** | 2 + ⛔ | ~4 | **∞** na comparação | Ver o mês custa 2; comparar custa memória |

**Onde está o dinheiro:** as três primeiras linhas concentram **680 de ~940 cliques semanais**
mapeados do corretor. São todas resolvíveis sem migração de dados e sem mudança de rota:

- **#2** → menu de ação no FAB (você já decidiu) leva de 4 para **2**.
- **#3** → avançar etapa a partir do drawer de Atendimento, sem abrir o dossiê: de 4 para **3**.
- **#6** → Projetos na barra de polegar (ou no menu do FAB): de 4 para **2**.

Só esses três: **~340 cliques por corretor por semana**.

---

## Nota de método

Contei o caminho que o código permite, não o que o usuário de fato faz. Duas fontes de erro
conhecidas, ambas a favor do sistema (ou seja, a realidade pode ser pior):

1. **Não medi o tempo de procura.** Um caminho de 2 cliques que exige lembrar onde fica custa
   mais que um de 3 óbvio. As tarefas #4 e #15 sofrem disso.
2. **Não medi rolagem.** `/leads` renderiza lista virtualizada; achar o lead certo pode custar
   scroll que não aparece na contagem.

Para fechar com dado real, a Fase 6 propõe recontagem por instrumentação — ver métrica M1.
