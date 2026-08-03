# Sumário executivo — Auditoria de UX e Arquitetura de Informação

**Sistema:** `seumetroquadrado-crm` · **Data:** agosto/2026
**Método:** leitura do código (21 páginas, 246 migrations, 244 funções de banco), 20 perguntas
dirigidas ao dono, 17 tarefas críticas cronometradas clique a clique.
**Nenhum código de aplicação foi alterado.**

---

## A conclusão em um parágrafo

Este CRM **não tem o problema que o briefing descrevia**. O menu já foi reestruturado por
intenção, as rotas antigas já são redirects mapeados, já existem busca global, drawer, ações
in-line e ações em massa, e o tratamento de estado vazio e de erro está acima da média
(7/7 nas páginas amostradas). O problema mudou de lugar: hoje é **excesso de portas para os
mesmos objetos**, **concentração de perguntas diferentes na mesma tela**, e — o mais caro —
**três tarefas que você precisa fazer e que simplesmente não têm caminho no sistema**.

---

## Os 5 achados mais graves

### 1. Três tarefas reais não existem no sistema
Nenhuma reorganização de menu resolve uma tela que não foi feita.

- **Confirmar visita (corretor).** O sistema *sabe* que a visita não foi confirmada — calcula
  `visita_sem_confirmacao` para o painel do gestor (`painel-dia/derive.ts:12`) — e não oferece
  ao corretor onde confirmar. A cobrança existe; a ação, não.
- **Ver pastas travadas de toda a operação (gestor).** O Painel do Dia tem 7 tipos de exceção e
  **nenhum é de documentação**. Só o corretor vê a fila da própria carteira. Existe uma
  ferramenta MCP externa `crm_listar_pastas_por_status` — ou seja, **a pergunta é feita, só não
  pelo CRM**.
- **Comparar período ou corretor com a referência.** Filtrar *substitui* os números; não compara.
  "Melhorei ou piorei?" e "este corretor está acima ou abaixo da média?" dependem de anotar e
  comparar de cabeça.

### 2. O aviso aponta para um lugar e a ação está em outro
O badge de aprovações pendentes é exibido no item **Gestão** da sidebar (`app-sidebar.tsx:120`),
mas a tela que aprova a venda está montada dentro de `comissoes-page.tsx`, servida por
**Desempenho → Comissões**. Quem seguir o aviso não encontra a ação. Você confirmou que aprovar
venda é tarefa sua: são **5 cliques com o sistema apontando para o lugar errado**.

### 3. O funil não mostra quem acabou de chegar
`novo` e `aguardando_corretor` recebem lead — você confirmou — mas nenhum dos dois está em
`LEAD_STATUS_ORDER` (`lib/leads.ts:24-33`). **O kanban, que existe para mostrar onde os negócios
estão, não mostra os que entraram.** Eles só aparecem em Atendimento, Distribuição e Captação:
três telas, nenhuma delas o funil.

### 4. `analise_credito` é uma etapa onde a operação tem três
Você apontou que faltam **Em Análise**, **Aprovada** e **Reprovada**. Hoje um negócio liberado
pela Caixa e um negócio morto no banco são **visualmente idênticos** no funil. Em MCMV, onde o
negócio vive ou morre na aprovação, esta é a lacuna de modelagem mais cara do sistema — e
explica boa parte da sensação de que o CRM "não ajuda a gerir".

### 5. Duas telas concentram o excesso
- **`/leads`**: 2.071 linhas, ~20 ações competindo no nível primário, com um kanban que duplica
  `/pipeline` e uma busca que duplica o ⌘K. Maior violação de Lei de Hick do sistema.
- **`/painel-gestor`**: 12 abas, das quais 5 são cadastro e configuração ocupando metade do hub
  que você abre todo dia.

---

## As 5 mudanças de maior retorno

| # | Mudança | Ganho | Esforço |
|---|---|---|---|
| 1 | **FAB vira menu de ação** (Registrar contato · Novo lead · Projetos · SamiQ) | **~260 cliques/semana por corretor.** Registrar interação cai de 4 para 2; tabela de preços de 4 para 2 | horas |
| 2 | **Corrigir o badge de aprovações** e criar a rota **Dinheiro** (fechamento + comissões + aprovação) | Aprovar venda de 5 para 2 cliques; conserta um loop de trabalho quebrado | horas (badge) + dias (rota) |
| 3 | **Bloco admin sai da Gestão para Configurações**, e Funil+Gargalos e Time+Leads-por-Corretor se fundem | Hub de gestão de **12 abas para 5** | dias |
| 4 | **6ª fila "Confirmar visita"** em Atender e **8ª exceção "pasta travada"** no Painel do Dia | Duas tarefas hoje **inexistentes** passam a custar 2 cliques. O dado já é calculado — falta expor | dias |
| 5 | **Atender absorve `/leads` e `/blitz`** em três modos (Prioridade · Volume · Consulta) | Uma porta para o objeto lead. Tira ~20 ações do nível primário | semanas — **quebrar em 3 PRs** |

As quatro primeiras cabem em PRs pequenos e **não mudam nenhuma rota**.

---

## Números

| Métrica | Hoje |
|---|---|
| Cliques médios — corretor (celular) | **3,0** (meta ≤2) — 3 tarefas estouram, 1 não existe |
| Cliques médios — gestor (desktop) | **2,9** (meta ≤2) — 3 estouram, 2 não existem |
| Itens no menu de 1º nível | corretor 5 · gestão 6 — mas `/leads` e `/atendimento` são a mesma porta |
| Abas no hub de gestão | **12** |
| Rotas órfãs | **1** (`/match` — fora do menu **e** do ⌘K) |
| Rotas eliminadas na proposta | **0** — toda URL que hoje abre algo continua abrindo |
| RPCs sem consumidor no front | **55%** (135/244); ~30 são consulta/comando |

---

## Decisões que dependem de você

### Já decididas nesta auditoria
Registradas em `02-objetivos.md` e refletidas em todas as fases: bloco admin sai da Gestão ·
Comissões ganha lugar próprio de dinheiro · Atender absorve Leads · Blitz vira modo "Volume" ·
Oferta Ativa dividida por papel · `/match` fica fora do menu · Links Úteis promovido a 1º nível
com botão único na última posição · FAB vira menu de ação · Pipeline sai da barra de polegar e
entra a Busca · os 4 modais obrigatórios ficam · ordem dos widgets fixada · toggle de escopo sai ·
`superintendente` é legado · correspondente não usa o CRM.

### Abertas — precisam de você

1. **Onda 3 (etapas de crédito): quando?** É a mudança de maior valor de gestão do plano e a de
   maior risco: muda `LEAD_STATUS_ORDER`, transições, modais, kanban e exige migrar os leads que
   hoje estão em `analise_credito`. Não cabe em PR pequeno. Precisa de janela própria.

2. **`novo` e `aguardando_corretor` entram no funil?** Torna o kanban honesto, mas muda a leitura
   de todos os gráficos históricos de funil. É decisão sua se a série histórica pode mudar de
   forma.

3. **As ~30 RPCs sem tela: medir antes de apagar.** Sua hipótese foi que servem ao MCP.
   Verifiquei as três portas deste repositório e **nenhuma as usa** — o servidor MCP interno tem
   4 ferramentas que consultam tabelas direto, e `api/public/metricas.ts` agrega das tabelas em
   vez de usar `metricas_periodo_v2`, que existe exatamente para isso. **Mas não posso descartar
   um cliente externo** chamando a RPC direto no Supabase com service key. Antes de eliminar
   qualquer coisa: `pg_stat_statements` por 7 dias (item 3.4).

4. **Autorização para a Onda 1.** Dez itens, nenhuma mudança de rota, nenhuma migração.
   O item mais barato — corrigir o badge de aprovações — deve ser o primeiro commit.

---

## Os documentos

| Arquivo | Conteúdo |
|---|---|
| `01-inventario.md` | Rotas, navegação, elementos acionáveis, RPCs sem consumidor, 10 sinais de duplicação |
| `02-objetivos.md` | Ficha de objetivo das 21 páginas + as 7 dúvidas resolvidas |
| `03-aderencia.md` | Cada função julgada contra o objetivo da sua página, com heurística citada |
| `04-cliques.md` | As 17 tarefas críticas, clique a clique, com ranking de custo semanal |
| `05-nova-ia.md` | Menus por papel, home por papel, mapa de-para completo, nomenclatura, 5 wireframes |
| `06-plano.md` | Backlog em 3 ondas, matriz impacto × esforço, o que não fazer, 5 métricas |

---

## Uma observação honesta sobre o método

Contei o caminho que **o código permite**, não o que o time de fato faz. Duas fontes de erro,
ambas a favor do sistema — a realidade pode ser pior:

- **Não medi tempo de procura.** Um caminho de 2 cliques que exige lembrar onde fica custa mais
  que um de 3 óbvio.
- **Não medi rolagem.** Achar o lead certo numa lista virtualizada pode custar scroll que não
  aparece na contagem.

E três premissas do briefing original não se confirmaram no código: a stack não é
tRPC/Express/Drizzle/MySQL (é TanStack Start + Supabase), o funil tem 8 etapas ativas e não 14,
e as "páginas órfãs" já eram redirects mapeados. Onde o código contradisse o briefing, segui o
código.
