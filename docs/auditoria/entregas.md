# Registro de Entrega — Auditoria + Melhorias do CRM SMQ

**Branch:** `claude/crm-forensic-audit-42itgl` · **Última atualização:** 2026-06-25

Resumo do que foi entregue nesta frente de trabalho, organizado por leva (cada uma testada com a
suíte pura, commitada e enviada ao branch). Detalhes de achados/priorização estão em
`relatorio-executivo.md`, `relatorio-tecnico.md`, `roadmap.md` e `melhorias-ux-funcoes.md`.

## Levas entregues

| Leva | Commit | Conteúdo |
| ---- | ------ | -------- |
| 1 — Auditoria + P0 | `40c3016` | Relatórios; API pública sem PII + rate limit; lead-intake idempotente (dedup) + telefone normalizado; alerta em falha de notificação; WhatsApp grava antes de abrir |
| 2 — Roadmap 30d | `c559a65` | push-dispatch com segredo dedicado + timing-safe + rate limit; teto/cache de custo de IA no match; CI (lint/test/build + gitleaks) + `.env.example`; índices compostos parciais |
| 3 — UX quick wins | `a7b91f3` | Relatório de UX; SLA no detalhe; nota rápida inline; split "Iniciar atendimento"; snooze de tarefa; presets de lembrete; confirmações destrutivas; empty states |
| 4 — Produtividade | `ca4ac0d` | Quick-add de tarefa; filtro de período em comissões; confirmação ao zerar cotas |
| 5 — Analytics | `17f3ed0` | Drill-down do dashboard (KPI → lista filtrada); progresso real vs meta (corretor/global) |
| Polish | `79cbfb4` | SLA do detalhe alinhado ao Kanban; lembrete legado no Select |
| 6 — Catálogo | `195a99a` | Busca/filtro na tabela de unidades; status de unidade com cor semântica |
| 7 — Massa | `49e016d` | Ações em massa: mudar temperatura e definir follow-up em lote |
| 8 — Finalização | (este) | Metas: progresso por equipe + barra de GMV; este registro de entrega |

## Estado de validação

- **Testes puros (vitest/bun): 32 verdes** (`metas`, `unidades`, `leads`, `rate-limit`,
  `public-api`, `lead-intake-dedup`, etc.).
- **Revisão estática** de todo o diff: sem bugs conhecidos.
- `lint`/`build`/`tsc`/suite completa **não rodam neste ambiente** (registro de pacotes do Lovable
  bloqueado por política de egresso; `bun.lock` fixo nele). Rodam no CI (`.github/workflows/ci.yml`,
  exige o secret `LOVABLE_NPM_TOKEN` para o `install`) ou no ambiente do usuário.
- Checklist de validação manual por leva está no arquivo de plano da sessão.

## Pendências (exigem banco/decisão de produto, não implementadas)

1. **Reprodutibilidade das migrations** — `CREATE TABLE public.comissoes` duplicado
   (`20260616130200` e `20260619185115`) quebra `supabase db reset`. Consolidar numa migration
   idempotente e validar num banco limpo. (P0 de DR.)
2. **Isolar leads por equipe na (re)distribuição** — hoje é pool único global; um gestor pode
   reatribuir leads de qualquer equipe. Exige `equipe_id` em `leads` + RLS/RPC e é decisão de produto.
3. **Guard de autenticação no servidor** — hoje `_authenticated` valida só no cliente (RLS protege
   os dados; risco é info-disclosure de UI).
4. **Ordenação real + colunas configuráveis na lista de leads** — requer parâmetro de ordenação na
   RPC de leads (mudança de backend a validar com build/banco).
5. **Rotação de chaves / secret scanning recorrente** — CI já tem gitleaks; falta política de rotação.

## Sugestão de próximos passos

Validar as levas no app (`bun install && bun run dev` num ambiente com acesso ao registro), depois
priorizar a pendência (1) (reprodutibilidade das migrations) por ser risco de recuperação de
desastre, e a decisão de produto sobre (2).
