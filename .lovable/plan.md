
## Objetivo

Transformar `/projetos` em um catálogo navegável de empreendimentos, com cards informativos e filtros cruzados. Gestores mantêm as ações de admin (webhook, editar, importar); corretores veem um catálogo limpo focado em achar projetos.

## 1. Cards de empreendimento

Cada card mostra:
- Cabeçalho: ícone/placeholder (`Building2`), **Nome**, badge da construtora, badge "Inativo" (somente gestor).
- Localização: `Cidade · Região · Bairro` (linha discreta).
- Linha de specs com ícones: **Tipologia**, **Vagas**, **Status de entrega**.
- **Preço a partir de** (formatado em BRL quando numérico; fallback para o texto livre).
- Observações: truncadas em 2 linhas.
- Rodapé: link "Ver detalhes" → `/projetos/$projetoId`.
- Gestor/admin: bloco webhook permanece como hoje, dentro de um `<details>` colapsado por padrão para não poluir o card. Switch Ativo + Editar continuam no topo.

Layout em grid responsiva: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`.

## 2. Visão por papel

- **Corretor** (não-gestor): catálogo limpo — sem webhook, sem switch Ativo, sem botões de editar/importar; vê apenas projetos com `ativo = true`.
- **Gestor/Admin**: vê todos (ativos + inativos com opacidade reduzida), com todas as ações atuais preservadas.

## 3. Filtros cruzados (barra acima do grid)

Toda combinação aplicada em conjunto (AND). Estado serializado nos search params da rota (`validateSearch` + zod) para permitir compartilhar links filtrados.

Controles:
- **Busca textual** (`q`): casa em nome, construtora, bairro, endereço.
- **Cidade** (select) → ao escolher, **Região** filtra pelas regiões dessa cidade; ao escolher região, **Bairro** filtra pelos bairros correspondentes (cascata).
- **Construtora** (multi-select via popover com checkboxes).
- **Tipologia** (multi-select; valores derivados dos dados, ex.: "1 dorm", "2 dorms", "3 dorms", "Studio").
- **Vagas** (multi-select: 0, 1, 2, 3+).
- **Status de entrega** (multi-select: Lançamento, Em obras, Pronto).
- **Faixa de preço** (slider duplo min/max baseado no `preco_inicial` numérico dos dados; projetos sem preço numérico ficam sob um toggle "Incluir sem preço").

Acima do grid: contador "X projetos encontrados" e botão "Limpar filtros". Chips removíveis para cada filtro ativo.

Toda filtragem ocorre no cliente sobre o resultado de `select * from projetos` (volume baixo). As opções dos selects são derivadas dinamicamente do dataset carregado.

## 4. Parsing/normalização auxiliar

`preco_inicial`, `vagas` e `tipologia` hoje são `text`. Sem alterar schema, criamos helpers em `src/lib/projetos.ts`:
- `parsePrecoBRL(text)` → `number | null` (remove "R$", pontos, vírgula).
- `formatBRL(n)` → "R$ 450.000".
- `normalizeVagas(text)` → bucket "0" | "1" | "2" | "3+".
- `normalizeTipologia(text)` → string padronizada para agrupar.

## 5. Arquivos a tocar (somente frontend)

- `src/routes/_authenticated/projetos.tsx` — reescrita do componente: search params via zod, hook de filtros, grid de cards, separação por papel. Mantém dialogs de criar/editar/importar e mutations existentes.
- `src/components/projeto-card.tsx` (novo) — card de empreendimento (versão corretor e versão gestor via prop `canManage`).
- `src/components/projetos-filters.tsx` (novo) — barra de filtros + chips.
- `src/lib/projetos.ts` — adiciona helpers de parsing/format (não remove o que já existe).

Sem mudanças de banco, RLS, server functions ou rotas.

## 6. Checks finais

- Corretor logado não vê webhook nem inativos.
- Filtros funcionam combinados, refletem na URL e podem ser limpos.
- Estado vazio quando nenhum projeto bate com os filtros (diferente de "nenhum projeto cadastrado").
- Mobile: filtros recolhem em um `Sheet` lateral.
