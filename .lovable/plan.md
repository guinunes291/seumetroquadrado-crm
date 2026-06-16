
# Plano: Portar CRM legado → Seu Metro Quadrado (5 fases)

## Diagnóstico (o que já existe vs. falta)

- **Já existe**: distribuição automática + redistribuição (`processar_distribuicao_automatica`, `redistribuir_leads_parados`, `corretor_elegivel`), trigger de transição de status com log + interação automática, dashboards (`dashboard_kpis/funil/serie_diaria/metricas_por_corretor/motivos_perda/leads_urgentes/redistribuicoes`), alertas e push (`enqueue_push`, `push_lead_distribuido`, `push_tarefa_criada`, `gerar_pushes_agendamentos_proximos`), modais de etapa (agendar/visita/análise/contrato/perdido), realtime parcial em leads, vendas/metas/copa.
- **Falta na Fase 1**: trigger de follow-up automático ao entrar em `em_atendimento`, RPC/coluna de SLA + temperatura derivada por origem, RPCs de relatórios avançados (tempo médio por etapa, conversão por corretor, evolução de vendas, origem efetiva), tabelas `scripts_vendas` e `objecoes` + seed, cron de distribuição agendado, publicação realtime estendida (tarefas/agendamentos), telas Tarefas do Dia, Modo Blitz, Scripts & Objeções, Relatórios com export CSV, Command Palette ⌘K, badge de SLA nos cards.

## Decisões já fechadas
- Fase 1 será dividida em **1a** (backend + SLA badge) e **1b** (telas novas).
- Ordem da fila Blitz: **SLA estourando → temperatura quente → follow-up vencido**.
- Scripts/Objeções: **CRUD restrito a admin/gestor**, corretor só lê.
- Follow-up automático: **24h após entrar em `em_atendimento`, qualquer dia**.
- IA (Claude) e integrações externas: adiados para Fases 3 e 5.

---

## FASE 1a — Backend de automação + SLA visual (esta entrega)

### Migration única (idempotente, timestamp posterior)

1. **SLA/temperatura por origem**
   - Adiciona coluna `distribuicao_config.sla_minutos int default 30` (mantém `timeout_horas` existente para redistribuição).
   - RPC `leads_com_sla(_corretor uuid default null)` → retorna `lead_id, sla_minutos, minutos_decorridos, sla_status ('ok'|'atencao'|'estourado'), temperatura_calc ('frio'|'morno'|'quente')`. Regras: `ok` < 60% do SLA, `atencao` 60-100%, `estourado` >100%; temperatura = quente se `em_atendimento` com interação <24h, morno 24-72h, frio >72h ou sem interação.
   - RPC `recalcular_temperatura_leads()` (cron 10 min) atualiza `leads.temperatura`.

2. **Follow-up automático em `em_atendimento`**
   - Trigger `AFTER UPDATE` em `leads` quando `NEW.status='em_atendimento' AND OLD.status<>'em_atendimento'`: insere `tarefas (tipo='follow_up', titulo='Follow-up automático', data_vencimento = now()+24h, corretor_id = NEW.corretor_id, lead_id = NEW.id, origem_automatica=true)`.
   - Adiciona coluna `tarefas.origem_automatica boolean default false` e `tarefas.cancelada_automatica boolean default false`.
   - Trigger complementar: ao sair do funil ativo (`perdido`, `contrato_fechado`, `pos_venda`), marca tarefas pendentes com `origem_automatica=true` como `status='cancelada'`.

3. **Cron de distribuição + temperatura**
   - `cron.schedule('distribuicao-auto', '*/5 * * * *', $$select public.processar_distribuicao_automatica()$$)`.
   - `cron.schedule('recalc-temperatura', '*/10 * * * *', $$select public.recalcular_temperatura_leads()$$)`.

4. **Realtime estendido**
   - `ALTER PUBLICATION supabase_realtime ADD TABLE public.tarefas, public.agendamentos, public.interacoes;` + `REPLICA IDENTITY FULL` nas três.

5. **Scripts & Objeções**
   - `scripts_vendas (id, titulo, categoria text, etapa lead_status null, conteudo text, ordem int, ativo bool)`.
   - `objecoes (id, objecao text, resposta text, categoria text, ordem int, ativo bool)`.
   - GRANTs: `SELECT` para `authenticated`; `ALL` para `service_role`. RLS: SELECT para todo autenticado; INSERT/UPDATE/DELETE só para admin/gestor (via `has_role`).
   - Seed inicial: 8 scripts (1 por etapa principal) + 10 objeções clássicas (preço, cônjuge, vou pensar, etc.).

6. **RPCs de relatórios** (SECURITY DEFINER, reaplicam escopo do corretor):
   - `rel_tempo_medio_por_etapa(_di, _df, _corretor)` → etapa, media_horas, p50_horas, n.
   - `rel_conversao_por_corretor(_di, _df)` → corretor_id, nome, leads, fechados, conv_pct, ticket_medio.
   - `rel_evolucao_vendas(_di, _df, _corretor)` → mes, vendas, vgv.
   - `rel_origem_efetiva(_di, _df, _corretor)` → origem, leads, fechados, conv_pct, custo_por_fechado (null por enquanto).

### Frontend Fase 1a
- **Hook `useRealtimeInvalidate(tables, queryKeys)`** em `src/hooks/use-realtime-invalidate.ts`; aplicar em leads, tarefas, agendamentos. Remover `refetchInterval` correspondentes.
- **Componente `<SlaBadge leadId minutos sla />`** em `src/components/sla-badge.tsx`: countdown ao vivo, cor por status (verde/amarelo/vermelho), tooltip com origem e SLA.
- Integrar `<SlaBadge>` em `LeadCard` (Kanban) e `lead-list-row`.
- Regenerar types Supabase; remover casts temporários.

### Verificação Fase 1a
- Mudar lead para `em_atendimento` → aparece tarefa de follow-up para +24h.
- Lead em `aguardando_atendimento` por >SLA → badge vermelho em outra sessão sem refresh.
- `select public.rel_tempo_medio_por_etapa(now()-interval '30 days', now(), null)` retorna linhas.
- Cron registrado: `select jobname, schedule from cron.job;`.

---

## FASE 1b — Telas novas (próxima entrega após aprovar 1a)
- **Tarefas do Dia** (`/tarefas-do-dia`): grupos Atrasadas / Hoje / Próximas, ações rápidas (concluir, adiar, WhatsApp via `wa.me`, abrir lead).
- **Modo Blitz** (`/blitz`): card único em foco, fila ordenada SLA estourado → temperatura quente → follow-up vencido; atalhos `J/K` navegar, `L` ligar, `W` WhatsApp, `A` agendar, `→` avançar etapa, `X` perder.
- **Scripts & Objeções** (`/scripts`): abas Scripts/Objeções, busca, copiar com placeholders substituídos `{{nome}}/{{projeto}}`, CRUD condicional (admin/gestor). Painel lateral no detalhe do lead e no Blitz.
- **Relatórios** (`/relatorios`): 4 cards consumindo as RPCs, gráficos (recharts), botão **Exportar CSV** com BOM `\uFEFF` p/ Excel pt-BR.
- **Command Palette ⌘K**: `cmdk` já em shadcn; ações de navegação + busca de leads/projetos via RPC simples.
- Atualizar sidebar e nav mobile.

---

## FASE 2 — IA com Claude (Bloco B itens 10–13)
Edge Function `ia-claude` (única, com action: briefing | objecoes | analise_credito | qualificar | script_whatsapp). Secret `ANTHROPIC_API_KEY`. Botão "Copilot IA" no detalhe do lead, no Blitz e na lista. Score grava em `leads.score_ia` + `interacoes.metadata`. Adiciona sinal de IA no ordenamento Blitz.

## FASE 3 — Gamificação, presença e dashboards pessoais (Bloco C)
- Pontuação automática via trigger em `lead_status_transitions` + `agendamentos` (tabela `pontos_diarios`).
- Conquistas (`conquistas`, `conquistas_corretor`) + confete.
- `/ranking-tv` (modo TV fullscreen, realtime).
- `/meu-painel` (KPIs do corretor + tendência).
- Metas diárias e alertas de produtividade ao gestor.
- Auto-checkout de presença via cron diário.

## FASE 4 — Vendas & autoatendimento (Bloco D)
Propostas (tabela + link público + PDF via `@react-pdf/renderer`), comissões (cálculo reusando `vendas`), agendamento público (`/agendar/[slug]`), carteira ativa (coluna `leads.protegido_ate timestamptz`).

## FASE 5 — Integrações externas (Bloco E)
Z-API (WhatsApp), Resend (e-mail), Web Push já existe, Google Calendar/Sheets, Notion, chatbot público, oferta ativa.

---

## Detalhes técnicos importantes
- Toda nova tabela: RLS habilitada + GRANTs explícitos + políticas espelhando padrões existentes (admin/gestor full, corretor escopo `auth.uid()`).
- RPCs `SECURITY DEFINER` reaplicam o escopo no WHERE (como `dashboard_*`).
- Migration idempotente: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS … CREATE TRIGGER`.
- Após migration, regenerar `src/integrations/supabase/types.ts` e remover casts.
- Não logar manualmente mudança de status no cliente (trigger já faz).
- Não duplicar `lead-stage-menu` / modais — Blitz e Tarefas do Dia reusam.

Confirma o plano para eu começar a Fase 1a?
