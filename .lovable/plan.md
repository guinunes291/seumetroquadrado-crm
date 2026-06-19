# Match com Busca por IA (linguagem natural)

Hoje `/match` tem um wizard de 3 etapas (Cliente → Orçamento → Match). Vamos adicionar um **segundo modo** na mesma página, inspirado no `BuscadorProjetos.tsx` enviado, em que o corretor descreve em texto livre o que procura e a IA retorna projetos rankeados — sem precisar preencher renda/FGTS/entrada.

## UX

Topo da página `/match` ganha um toggle (Tabs) com dois modos:

- **Match financeiro** — fluxo atual (wizard APROVE 2026), intocado.
- **Buscador IA** — novo. Caixa de texto grande + chips de exemplos + botão "Buscar Projetos". Resultado: resumo da IA, filtros detectados (badges) e cards rankeados (1, 2, 3…) com nota 0-10, motivo, preço a partir e link para `/projetos/$projetoId`.

Exemplos de prompt (chips clicáveis):
- "Zona Oeste próximo à estação, 2 dormitórios, até R$350 mil"
- "MCMV HIS2 Zona Norte, 1 ou 2 dorms, entrada com FGTS"
- "Lançamento Zona Sul, 2 ou 3 dorms com vaga, até R$600 mil, entrega 2026"

Atalho Ctrl/Cmd+Enter dispara a busca. Loading: "Analisando catálogo…". Estado vazio quando nada bate. Se a URL tiver `?leadId=…`, mostramos badge "Buscando para o lead #…" (sem persistência por ora).

## Backend

Nova server function `buscarProjetosIA` em `src/lib/match-ia.functions.ts`:

- Input: `{ descricao: string (>=10 chars), leadId?: string }`.
- Carrega projetos ativos (`projetos` onde `ativo=true` e `deleted_at is null`) com colunas leves: id, nome, construtora, bairro, cidade, preco_a_partir, tipologias/dorms/vagas/entrega quando existirem.
- Chama Lovable AI Gateway (`google/gemini-2.5-flash`, sem chave do usuário) com prompt estruturado em PT-BR pedindo JSON:
  ```
  { resumo: string,
    filtrosUsados: { regiao?, dorms?, vagas?, precoMax?, programa?, entrega? },
    projetos: [{ id, pontuacao (0-10), motivo, tipologiaRecomendada? }],
    totalFiltrados: number }
  ```
  Usa `generateObject` com schema Zod para garantir formato.
- Devolve até os 6 melhores, ordenados por pontuação. Faz join com os dados originais para devolver `nome`, `construtora`, `preco_a_partir` ao cliente.
- Sem persistência nesta etapa.

## Frontend

- `src/routes/_authenticated/match.tsx`: envolver conteúdo atual num `<Tabs>` com value `financeiro` (default) e `ia`.
- Novo componente `src/components/match/buscador-ia.tsx` baseado no arquivo enviado, **adaptado para o nosso stack**: shadcn tokens (sem `bg-purple-*` cru — usar `primary`/`accent`), `@tanstack/react-router` `Link` para `/projetos/$projetoId`, `useServerFn` + `useMutation` do TanStack Query no lugar de tRPC, `useSearch` da rota para ler `leadId`.

## Fora de escopo

- Salvar histórico de buscas / vincular ao lead no banco.
- Chat multi-turno (é one-shot: descrição → resultado). Pode virar próximo passo se quiser.
- Mexer no wizard financeiro existente.
