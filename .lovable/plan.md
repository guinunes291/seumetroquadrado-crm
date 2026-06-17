## Objetivo

Para o corretor (não gestor/admin):
1. Leads "Novo" não aparecem — só aparecem quando já estão `aguardando_atendimento` (ou seja, atribuídos a ele pela roleta).
2. Em cada lead `aguardando_atendimento`, exibir um botão destacado **"Iniciar Atendimento"** que move o lead para `em_atendimento` em um clique.
3. Daí em diante, ações detalhadas (mudar etapa, registrar interação, agendamento, etc.) só pelo perfil do lead — clicando no nome abre `/leads/$leadId`.

Gestor/admin continua vendo tudo (inclusive `novo`, roleta, lixeira) como hoje.

## Mudanças

### `src/routes/_authenticated/leads.index.tsx`
- Na query de leads, quando `!canManage`: forçar filtro `corretor_id = user.id` e `status != 'novo'` (mesmo se o usuário trocar filtros — esconder também as opções "Novo" e o seletor de corretor já está oculto).
- Remover do `Select` de status a opção "Novo" para corretor; default do `statusFilter` para corretor: `"aguardando_atendimento"` (mantendo "Todos os status" sem incluir novo).
- Nova coluna/área de ação por linha:
  - Se `status === 'aguardando_atendimento'` e (corretor dono OU canManage): botão primário **"Iniciar Atendimento"** (ícone Play) que chama `updateStatus.mutate({ id, status: 'em_atendimento' })`.
  - Demais status: manter `LeadStageMenu` apenas para `canManage`. Para o corretor, **remover** o menu de etapas da listagem — ações ficam no perfil do lead.
- Roleta e Lixeira permanecem apenas para `canManage` (já é o caso).
- Melhorias de UI/UX inspiradas no anexo:
  - Linha clicável para o nome (já é link) — manter; adicionar hover sutil na linha.
  - Badge de origem com `capitalize` + ícone.
  - Indicador visual de "novo lead recebido" (badge "Novo!" pulsante quando `aguardando_atendimento` e sem interações) — opcional leve.
  - Botão "Iniciar Atendimento" com destaque (`variant="default"`, `size="sm"`, ícone Play, cor primária).

### Sem mudanças de schema/RLS
RLS já restringe corretor aos próprios leads; o ajuste é só de UI/filtros.

### Página de detalhe (`leads.$leadId.tsx`)
Sem alterações nesta entrega — todas as fases/ações já existem lá.

## Fora de escopo
- Mexer no cron de redistribuição (item 1 da conversa anterior).
- Alterar fluxo de distribuição automática — corretor continua recebendo via roleta como `aguardando_atendimento`.
