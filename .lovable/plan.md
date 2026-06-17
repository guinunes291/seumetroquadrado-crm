# Plano: Oferta Ativa

Inspirado nas duas páginas de referência (`OfertaAtiva.tsx` e `NovaOfertaAtiva.tsx`), adaptado ao stack atual (TanStack Start + Supabase + tabelas/enums já existentes no CRM).

## Conceito
Uma **Lista de Oferta Ativa** é um agrupamento de leads filtrados por critérios (status, temperatura, projeto, origem, sem interação há X dias) que o gestor cria e atribui a um corretor (ou ele mesmo) para "trabalhar" como uma campanha — com acompanhamento de progresso (contatados vs avançados) e ciclo de vida (rascunho → ativa → concluída → arquivada).

## Banco de dados (migração nova)

### Tabela `ofertas_ativas`
- `id uuid pk`
- `nome text not null`
- `descricao text`
- `status text not null default 'ativa'` (`rascunho|ativa|concluida|arquivada`)
- `criado_por uuid` → `auth.users`
- `corretor_id uuid` → `profiles` (opcional, null = todos)
- `filtros jsonb not null` — snapshot dos filtros usados na criação
- `created_at`, `updated_at`

### Tabela `oferta_ativa_leads` (associação)
- `id uuid pk`
- `oferta_id uuid` → `ofertas_ativas(id)` ON DELETE CASCADE
- `lead_id uuid` → `leads(id)` ON DELETE CASCADE
- `contatado boolean default false` (true quando houver interação após inclusão)
- `avancado boolean default false` (true quando status virar `agendado|qualificado|venda`)
- `created_at`
- UNIQUE (`oferta_id`, `lead_id`)

GRANT/RLS: GRANTs explícitos para `authenticated` e `service_role`. Policies:
- SELECT: gestor/admin tudo; corretor só ofertas onde `corretor_id = auth.uid()` ou que ele criou.
- INSERT/UPDATE: gestor/admin; corretor pode marcar progresso (UPDATE só de `contatado`).
- DELETE: admin.

### Função RPC `preview_oferta_ativa(filtros jsonb, corretor uuid)`
Retorna `{ count, sample }` (até 5 leads) aplicando os filtros sobre `leads` (exclui lixeira). Security definer respeitando role.

## Camada `src/lib/oferta-ativa.ts`
- Tipos `OfertaAtiva`, `OfertaFiltros`
- `listOfertas({ incluirArquivadas })`
- `previewFiltros(filtros, corretorId)` → chama RPC
- `createOferta(input)` → cria registro + popula `oferta_ativa_leads` aplicando filtros (server function `createServerFn` com `requireSupabaseAuth`)
- `archiveOferta(id)` / `restaurarOferta(id)`
- `getOferta(id)` (detalhe + leads)
- `marcarContatado(ofertaId, leadId, valor)`

Para escrita usa server functions; leituras simples direto pelo client Supabase.

## Rotas (TanStack)
- `src/routes/_authenticated/oferta-ativa.index.tsx` — lista de campanhas (tabs Ativas / Arquivadas, cards com progresso, botões "Nova Lista", arquivar/restaurar). Equivalente ao `OfertaAtiva.tsx`.
- `src/routes/_authenticated/oferta-ativa.nova.tsx` — formulário de criação (nome, descrição, seleção de corretor para gestor, filtros: status, temperatura, projeto, origem, sem interação há X dias) com preview ao vivo (debounce 500ms). Equivalente ao `NovaOfertaAtiva.tsx`.
- `src/routes/_authenticated/oferta-ativa.$ofertaId.tsx` — detalhe: cabeçalho com KPIs (total, contatados, avançados), tabela de leads da campanha com botão WhatsApp pré-formatado (mesmo padrão da página Leads), marcar contatado, link para abrir ficha do lead.

## Sidebar
`src/components/app-sidebar.tsx`: remover flag `comingSoon` do item "Oferta Ativa" (linha 76).

## Adaptações vs referência
- `wouter` → `@tanstack/react-router` (`Link`, `useNavigate`).
- `trpc` → server functions + `useQuery`/`useMutation` do React Query já presente no projeto.
- `DashboardLayout` → o layout já é aplicado pelo `_authenticated/route.tsx`; usar `<PageHeader>` existente.
- Remover filtro "Faixa de Renda" (campo não existe como enum no schema atual — `renda_informada` é texto livre). Adicionar filtro "Origem" (`facebook`, `site`, etc.) que casa melhor com o CRM.
- Métrica "avançados" = status em (`agendado`, `qualificado`, `venda`).
- Botão WhatsApp reaproveita helper já criado na página de Leads para manter a UX consistente (mensagem pré-formada).

## Detalhes técnicos
- Server functions ficam em `src/lib/oferta-ativa.functions.ts` (client-safe path) com `requireSupabaseAuth`.
- `createOferta` no handler: roda o filtro como SELECT em `leads` respeitando RLS, faz INSERT em `ofertas_ativas` e bulk insert em `oferta_ativa_leads`.
- Realtime: hook `use-realtime-invalidate` para `ofertas_ativas` e `oferta_ativa_leads`.
- Sem mudanças em código de negócio fora deste escopo.

## Entregáveis
1. Migração SQL (tabelas + RLS + GRANT + RPC `preview_oferta_ativa`).
2. `src/lib/oferta-ativa.ts` + `src/lib/oferta-ativa.functions.ts`.
3. Três rotas novas em `src/routes/_authenticated/`.
4. Atualização da sidebar (remover "em breve").
