# Auditoria julho/2026 — Registro de entrega

**Branch:** `claude/smq-crm-audit-26ety6` · Diagnóstico completo em
[`2026-07-diagnostico.md`](./2026-07-diagnostico.md).

Todas as levas passam em `npm run test` (41 arquivos, 370 testes) e `npm run build`.
Validação: `npm ci && npm run test && npm run build` (registro npmjs; o CI atual só roda o
job de build/test com `LOVABLE_NPM_TOKEN` — ver "Pendências").

## Commits (por etapa)

### Etapa 1 — Correções críticas
| Área | O que mudou |
| ---- | ----------- |
| C2/C3 `security(db)` | Migração `20260710120000`: RLS + REVOKE nas 4 tabelas de staging (PII); INSERT de `vendas`/`analises_credito` restrito a criador+dono/gestão (elimina venda fabricada para outro corretor). |
| C1 `security(api)` | `requireWriteKeyOrLegacy` nos 4 endpoints de escrita (`leads/:id`, `/corretor`, `/perda`, `/eventos`): aceita `MCP_WRITE_API_KEY`; aceita `READ_API_KEY` só enquanto `PUBLIC_WRITE_ALLOW_READ_KEY!=false`, auditando cada escrita legada em `api_escrita_log`. PATCH deixa nota no histórico. |
| C4 `security(webhook)` | Landing: rate limit por IP, secret opcional, cap de 32KB, `parseLandingPayload` puro, sem vazar `corretor_id`. |
| A1 `fix(push)` | Migração `20260710121000` (attempts/next_attempt_at/last_error) + `decidirDisposicao`: só marca `sent` com entrega real; senão retry com backoff; descarta após 8 tentativas. |
| A2/A4 `fix(agendamentos)` | `criarAgendamento` com compensação (desfaz agendamento se o status do lead não mover) + `invalidateAgendamentoQueries` (a página /agendamentos passa a atualizar a aba do lead). |
| A3 `fix(dedup)` | Migração `20260710122000`: `telefone_digits()`, view de duplicatas e índice único parcial guardado; intakes tratam 23505 como duplicado. |
| M1 `fix(copiloto)` | Claim atômico (`UPDATE ... WHERE copiloto_notificado_em IS NULL`) evita duplo disparo do n8n; reset em falha. |
| A5 `fix(perm)` | `<RequireRole>` real (skeleton + redirect) em `/painel-gestor` e `/inteligencia`; dialog de venda filtra leads por corretor. |

### Etapa 2 — Estabilidade
| Área | O que mudou |
| ---- | ----------- |
| M2 `refactor(follow-up)` | `garantirFollowUpAberto` como fonte única de dedup de follow-up. |
| M3 `feat(historico)` | `notaSistemaPayload`; nota na timeline para temperatura em lote e transferência em lote. |
| M4 `fix(edge)` | sami-*/admin-reset: comparação timing-safe (SHA-256), dedup de visita, `listUsers` paginado + rate limit. |
| M6/B1/B2 `fix(estabilidade)` | FK guardada em `leads.corretor_anterior_id`; `escapeLike` nos ILIKE públicos; fim do `.catch(()=>{})` na documentação; `tests/migrations.test.ts`. |

### Etapa 4 — UX/UI
| Área | O que mudou |
| ---- | ----------- |
| FE#6/#9/#7/#4 `fix(ux)` | `<QueryErrorState>` (retry) em Tarefas/Agenda; anti-duplo-clique ao concluir tarefa; validação de escopo em Metas; WhatsApp sem falso sucesso; remove input morto. |

### Etapa 5 — Testes
`write-api-auth`, `push-outbox`, `agendamentos`, `landing-webhook`, `migrations` (estático) +
ampliações (`validators/escapeLike`, `interacoes/notaSistemaPayload`, `follow-up`).

## Pendências (exigem ação do usuário ou banco vivo)

1. **Aplicar as migrações novas** no Supabase (`20260710120000/121000/122000/123000`).
2. **Deploy das edge functions** alteradas: `sami-agendar-visita`, `sami-consultar-agenda`,
   `admin-reset-password`, `lead-intake` (`supabase functions deploy`).
3. **Secrets:** `MCP_WRITE_API_KEY` nos clientes de escrita (n8n/MCP); quando migrados, definir
   `PUBLIC_WRITE_ALLOW_READ_KEY=false`; opcional `LANDING_WEBHOOK_SECRET`. Conferir o uso legado
   em `api_escrita_log` (agente `legacy-read-key`) antes de cortar.
4. **CI:** configurar `LOVABLE_NPM_TOKEN` **ou** trocar o job para `npm ci` (o `package-lock.json`
   resolve tudo no registro público) — hoje o job de build/test não roda sem o token.
5. **Duplicatas de telefone:** consultar `vw_leads_telefone_duplicado`, resolver e então rodar
   `VALIDATE`/recriar o índice único.
6. **Não feito nesta rodada (documentado):** consolidar as migrações duplicadas de
   `comissoes`/`vendas`/`analises_credito` (schemas divergentes — precisa de introspecção do
   banco vivo para não recriar o schema errado num `db reset`); ajustar timezone dos dedups de
   alerta (baixa severidade); isolar redistribuição por equipe (decisão de produto); WhatsApp API
   oficial. Posso executar a consolidação de migrações via MCP Supabase mediante aprovação.
