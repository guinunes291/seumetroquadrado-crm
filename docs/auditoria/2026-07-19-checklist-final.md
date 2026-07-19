# Auditoria funcional — Onda 5 (2026-07-19) — Checklist final de produção

✅ aprovado · ⚠️ aprovado com ressalva · ❌ reprovado · 🔄 pendente de validação

## Funcional

| Item | Status |
|---|---|
| Máquina de estados do funil (TS = SQL, guard de UPDATE e INSERT, trilha atômica) | ✅ |
| Criação de lead com dedup atômico (RPC + índices) | ✅ (⚠️ índices ativam em prod após limpeza de duplicatas históricas — P-11) |
| Follow-ups (espelho, dedup, cancelamento no fechamento, motor anti-perda audível) | ✅ |
| Agendamentos (compensação, RLS, jornada) | ✅ |
| Distribuição v3 (rodízio, exceções, concorrência) | ✅ |
| Motor ponderado (idempotência + lock) | ✅ (⚠️ elegibilidade diverge do canônico — P-4) |
| Vendas/comissões (aprovação atômica, idempotente, imutável) | ✅ (⚠️ beneficiário NULL — P-2) |
| Transferência de leads (RPC, acesso, log) | ✅ |
| Permissões RLS por papel (49 casos) | ✅ (🔄 metas — P-1) |
| KPIs consistentes entre RPCs (escopo, vendas aprovadas, perda histórica) | ✅ |
| Telas de decisão sem "zero falso" (isError + retry em toda seção) | ✅ |
| Truncamentos sinalizados | ✅ |
| Integrações (intake, landing, push, convites) | ✅ (⚠️ Z-API sem retry — P-7; ?secret= depreciado — P-3) |

## Técnico

| Item | Status |
|---|---|
| `npm ci` / lockfile | ✅ (⚠️ dual-lockfile mantido — P-6) |
| Suíte vitest (628) + suíte de banco (201) | ✅ |
| Typecheck / lint / type-escape (162/220) / bundle budget | ✅ |
| Build (Cloudflare + node-server) + smoke Playwright | ✅ |
| Replay do zero das 209 migrations | ✅ |
| CI com gate de banco real (job db-tests) | ✅ |
| Reprodutibilidade do schema | ⚠️ (drift documentado: copa_ranking() vivo — P-5) |

## Passos pós-deploy em produção (fluxo usual do projeto)

1. 🔄 Aplicar as 5 migrations novas (`20260719120000` → `20260719130000`) pelo fluxo
   normal (Lovable/dashboard). Todas são idempotentes e no-op onde produção já está
   no estado final.
2. 🔄 Conferir os índices de dedup: se o log da migration emitir WARNING, consultar
   `vw_leads_telefone_duplicado` e `vw_leads_sem_projeto_telefone_duplicado`, mesclar
   pela tela de Duplicatas e reaplicar o DO-block dos índices.
3. 🔄 Fazer deploy da edge function `lead-intake` (comparação timing-safe) e depois
   migrar o Zap para o header `x-webhook-secret` (P-3).
4. 🔄 Smoke manual das telas de decisão como GESTOR: kanban × lista × dashboard devem
   mostrar os MESMOS totais (agora escopados à equipe); confirmar que a mudança de
   escopo é a esperada pelo negócio (antes o gestor via números globais).
5. 🔄 Comparar os KPIs do dashboard com `crm_kpis_do_periodo` (MCP) após as migrations
   — a contagem de vendas deve cair para somente aprovadas, se havia pendentes.
6. 🔄 Decidir P-1 (escopo de metas) e P-2 (comissão sem beneficiário) com o dono do
   negócio; aplicar em migration própria.
7. 🔄 Exportar `pg_get_functiondef('public.copa_ranking()')` de produção e comitar
   (P-5).

## Critério de aprovação da auditoria

Uma funcionalidade só recebeu ✅ com: regra documentada, fluxo de sucesso E de erro
exercitados contra o banco real, persistência confirmada, permissões testadas,
idempotência/concorrência cobertas onde aplicável, teste automatizado passando e
indicadores refletindo a ação. Tudo que não atingiu esse critério está em
2026-07-19-pendencias.md com impacto e próxima ação — nada foi omitido.
