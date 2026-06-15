
# Portar o CRM Seu Metro Quadrado para a Lovable

## Decisões já tomadas

- **Stack alvo:** TanStack Start (React 19) + Lovable Cloud (Postgres/Supabase) + Cloudflare Workers.
- **Backend:** server functions (`createServerFn`) + Supabase com RLS — substitui Express/tRPC/Drizzle/MySQL/Redis do repo.
- **Frontend:** TanStack Router + shadcn/ui + Tailwind (já no projeto). Substitui `wouter`.
- **Storage:** Supabase Storage no lugar de AWS S3.
- **E-mail:** Resend via Lovable Cloud (substitui nodemailer/SMTP).
- **Não suportado nativamente nos Workers** (precisa adaptação ou serviço externo): jobs cron persistentes (usar `pg_cron`/Edge Functions), `sharp`/`canvas`, `web-push`, `ioredis`. Integrações Google (Sheets/Calendar/Auth), Zapier/WhatsApp e geração de PDF (`pdf-lib`) ficam para fases posteriores.

## Escopo total mapeado (referência)

Repo tem **71 tabelas** e **71 páginas**. Vamos agrupar em módulos:

```text
1. Auth & Identidade        users, equipes, push_subscriptions
2. Corretores & Equipes     corretores, gestao_equipes, convite, desbloqueio
3. Leads & Funil            leads, lead_history, status_transitions, motivos_perda, lixeira
4. Distribuição             fila_distribuicao, distribution_log, controle_limites,
                            historico_distribuicao, roleta, controle_distribuicao
5. Kanban                   kanban (status), kanban_oferta_ativa
6. Agendamentos             agendamentos, visitas, disponibilidade, bloqueios,
                            links_agendamento, agendamento_publico, calendario_gestor,
                            historico_presenca, resumo_presenca
7. Tarefas & Follow-up      tarefas, follow_ups, atividades_diarias, escolha_diaria,
                            monitoramento_followups, tarefas_do_dia, alertas
8. Metas & Performance      metas, metas_diarias, metas_globais, minha_performance,
                            performance_tv, ranking_tv, dashboard, relatorios
9. Conquistas & Gamificação tipos_conquista, conquistas, modo_blitz, blitz_sessoes,
                            copa_smq, configuracao_pontuacao
10. Projetos/Empreendimentos projects, project_suggestions, properties, buscador,
                            aprovar, atualizar_em_massa, projeto_foco, projetos_map,
                            importar_projetos, limpar_orfaos, configuracao_projeto_foco
11. Oferta Ativa            sessao_oferta, oferta_ativa, item_oferta_ativa,
                            atribuicao_sessao, nova_oferta, detalhes_sessao
12. Carteira Ativa          carteira_ativa, carteira_tarefas
13. Comissões & Contratos   contratos, comissoes, templates_comissao,
                            analises_credito, documentacoes, propostas, propostas_publicas
14. Construtoras & Catálogo construtoras, materiais, tabeloes, historicos_precos,
                            scripts_vendas, faq_chatbot, links_uteis, acessos_links
15. Comunicação             notifications, whatsapp_logs, conversas_chatbot,
                            chatbot_publico, configuracao_webhooks, quick_messages
16. Integrações & Importação google_sheets_sync, importar_csv, importar_sheets,
                            sincronizacao_bi, logs_sincronizacao
17. Admin & Auditoria       transfer_history, log_transferencias, lixeira,
                            limpeza_duplicatas, configuracoes, meu_negocio_parametros,
                            objecoes_playbook, indicacoes, pre_analises_mcmv,
                            job_control
```

## Plano em fases (entregamos uma de cada vez)

### Fase 0 — Fundação (1 entrega)
- Ativar Lovable Cloud.
- Criar layout principal (sidebar/topbar como no repo), tema, navegação base.
- Configurar TanStack Query + `_authenticated/` (gate gerenciado pela integração).
- Página `BoasVindas` + redirect inicial.

### Fase 1 — Auth + Corretores + Equipes
- **Tabelas:** `profiles`, `user_roles` (admin/gestor/corretor), `equipes`, `equipe_membros`.
- **Auth:** e-mail/senha + Google (broker Lovable). Página `/auth`, `/reset-password`.
- **RLS:** função `has_role`, policies por papel.
- **Páginas:** `Corretores`, `GestaoEquipes`, `MinhaEquipe`, `MeuPerfil`, `ConviteCorretor`, `Desbloqueio`.
- **Server fns:** convidar corretor, ativar/desativar, transferir entre equipes.

### Fase 2 — Leads + Kanban + Distribuição
- **Tabelas:** `leads`, `lead_history`, `lead_status_transitions`, `fila_distribuicao`, `distribution_log`, `controle_limites`, `lead_estoque`, `historico_atribuicoes`, `transfer_history`, `log_transferencias`.
- **Páginas:** `Leads`, `Kanban`, `LeadsPorCorretor`, `ControleDistribuicao`, `HistoricoDistribuicao`, `ControleLimites`, `Roleta`, `LogTransferencias`, `Lixeira`, `ImportarCSV`.
- **Server fns:** importar CSV (parse no server), distribuir (round-robin/limite), transferir, mover status (drag-and-drop), histórico, desfazer.
- **Webhook público:** `/api/public/webhooks/lead` para receber leads externos (com assinatura HMAC).

### Fase 3 — Agendamentos + Calendário
- **Tabelas:** `agendamentos`, `visitas`, `disponibilidade_corretor`, `bloqueios_agenda`, `links_agendamento`, `historico_presenca`, `resumo_presenca_diaria`.
- **Páginas:** `Agendamentos`, `MinhaAgenda`, `CalendarioGestor`, `AgendamentoPublico` (rota pública), `HistoricoPresenca`.
- **Lógica:** timezone-safe (date-fns-tz), conflito de horários, link público de auto-agendamento.

### Fases 4+ (mapeadas, prioridade a definir depois)
- 4: Tarefas, Follow-up e Alertas
- 5: Metas, Dashboards, Performance/Ranking TV, Relatórios
- 6: Conquistas, Modo Blitz, Copa SMQ
- 7: Projetos/Empreendimentos + Map View + Importação
- 8: Oferta Ativa + Sessões + Atribuição
- 9: Carteira Ativa
- 10: Comissões, Contratos, Propostas, Análises de Crédito
- 11: Construtoras, Materiais, Tabelões, Scripts, FAQ, Links Úteis
- 12: Comunicação (Notificações in-app, WhatsApp via Zapier, Chatbot)
- 13: Integrações (Google Sheets, BI Sync) e Admin/Auditoria

## Convenções técnicas

- **Tabelas no schema `public`** com `GRANT` explícito + `ENABLE RLS` + policies (RLS por `auth.uid()` e via `has_role`).
- **Server functions** em `src/lib/<modulo>.functions.ts` (não em `src/server/`). Privilegiadas usam `requireSupabaseAuth` + check de role; `supabaseAdmin` carregado dentro do handler.
- **Rotas** em `src/routes/_authenticated/<modulo>.tsx`; rotas públicas (agendamento, proposta, chatbot, webhooks) ficam no topo / em `api/public/`.
- **Roteamento:** mapeamento direto das rotas do repo (`/leads`, `/kanban`, `/corretores`, `/agendamentos`, etc.).
- **UI:** reaproveitar componentes do repo onde fizer sentido, adaptados para os tokens do design system daqui. Mantemos a estética do CRM original (sidebar escura, cards densos, badges de status).

## O que NÃO vai ser portado 1:1

- Jobs em Node (`agendamentosSyncJob`, `agentePriorizacaoJob`, `backupJob`, `biSyncJob`, `carteiraAtivaJob`, `conquistasJob`): viram `pg_cron` + server routes em `api/public/cron/*` (Fase correspondente).
- `web-push` (push notifications nativas): substituído por notificações in-app + opcional Resend e-mail.
- `sharp`/`canvas`/`pdf-lib`: geração de PDFs/imagens fica para uma fase dedicada, possivelmente via serviço externo.
- Patches do `wouter`: irrelevantes (vamos usar TanStack Router).

## Próximo passo

Se aprovar, começo pela **Fase 0 + Fase 1** (Fundação + Auth/Corretores/Equipes) — entrego rodando aqui, com as tabelas criadas no Lovable Cloud, login funcionando e telas de Corretores/Equipes/MeuPerfil já navegáveis. Depois seguimos para Leads/Kanban (Fase 2) e Agendamentos (Fase 3).
