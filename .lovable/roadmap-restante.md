# Roadmap restante — paridade com o repositório original

> Atualizado ao final da **Fase 6 (parcial)**. Tudo abaixo é o que ainda **não foi implementado** comparado ao CRM original.

## ✅ Já entregue

| Fase | Módulo | Estado |
| ---- | ------ | ------ |
| 0 | Layout, sidebar, tema, gate `_authenticated`, TanStack Query | ✅ |
| 1 | Auth (e-mail/senha + Google), `profiles`, `user_roles`, equipes, perfil, convite básico | ✅ |
| 2 | Leads, Kanban, distribuição (round-robin), webhook por projeto (token) | ✅ |
| 3 | Agendamentos (CRUD + conflito de horários) | ✅ |
| 4 | Tarefas, follow-ups, alertas in-app + triggers automáticos | ✅ |
| 5 | Metas, Dashboard, Ranking | ✅ |
| 5b | Empreendimentos (CRUD + webhook token por projeto) | ✅ |
| 6 | Interações, timeline de lead, notificações em tempo real, templates de mensagem, botão WhatsApp | ✅ parcial |
| 7 | Unidades, histórico de preços (trigger), projeto em foco, página de detalhe do projeto | ✅ parcial |

45 testes unitários passando (`vitest`).

---

## ⏳ Falta implementar

### Fase 6 — Comunicação (continuar)
- [ ] **Chatbot público** (`chatbot_publico`, `conversas_chatbot`) — fluxo de qualificação básica para captura de leads em landing pages.
- [ ] **Mensagens rápidas** (`quick_messages`) — atalhos de texto curto para o corretor durante atendimento.
- [ ] **Logs de WhatsApp** (`whatsapp_logs`) — auditoria de mensagens enviadas + integração com gateway (Z-API/Twilio/Meta Cloud API).
- [ ] **Notificações via e-mail** (Resend) para alertas críticos (lead frio há X dias, agendamento amanhã).

### Fase 7 — Empreendimentos avançado
- [x] `unidades` (CRUD + status disponível/reservada/vendida/bloqueada).
- [x] `historico_precos` (trigger automático em mudança de valor).
- [x] `projeto_foco` (destaque rotativo).
- [ ] `tabelas_preco` (vigências e condições comerciais).
- [ ] `projetos_map` (vista de mapa com geocoding via Google Maps).
- [ ] `importar_projetos` (CSV/Sheets), `limpar_orfaos`, `atualizar_em_massa`.
- [ ] `project_suggestions` (sugestões automáticas baseadas no perfil do lead).

### Fase 8 — Oferta Ativa
- [ ] Tabelas: `sessao_oferta`, `oferta_ativa`, `item_oferta_ativa`, `atribuicao_sessao`.
- [ ] Páginas: Nova oferta, Detalhes da sessão, Kanban de oferta ativa.
- [ ] Lógica: distribuir lista de leads frios entre corretores em "sessões cronometradas".

### Fase 9 — Carteira Ativa
- [ ] `carteira_ativa`, `carteira_tarefas` — gestão proativa de leads sem movimentação.
- [ ] Job (`pg_cron`) que move leads inativos para a carteira.

### Fase 10 — Comissões, Contratos e Propostas
- [ ] `contratos`, `comissoes`, `templates_comissao`.
- [ ] `propostas`, `propostas_publicas` (link público assinável).
- [ ] `analises_credito`, `documentacoes`, `pre_analises_mcmv`.
- [ ] Geração de PDF (provavelmente via serviço externo — `pdf-lib` não roda em Workers).

### Fase 11 — Catálogo e conteúdo
- [ ] `construtoras`, `materiais`, `scripts_vendas`, `faq_chatbot`, `links_uteis`, `acessos_links`.
- [ ] Página de busca unificada (`buscador`).

### Fase 12 — Gamificação
- [ ] `tipos_conquista`, `conquistas`, `configuracao_pontuacao`.
- [ ] `modo_blitz`, `blitz_sessoes` — competições cronometradas.
- [ ] `copa_smq` — torneio mensal.
- [ ] Telas TV: `performance_tv`, `ranking_tv` (modo cheio para televisores no escritório).

### Fase 13 — Distribuição avançada
- [ ] `controle_limites` (limites por corretor/turno/projeto).
- [ ] `historico_distribuicao` rica com motivos detalhados.
- [ ] `roleta` visual (animação de sorteio para auditoria).
- [ ] `controle_distribuicao` (pausar/retomar fila por projeto).

### Fase 14 — Agendamentos avançado
- [ ] `disponibilidade_corretor` (janelas por dia da semana).
- [ ] `bloqueios_agenda` (férias/folgas).
- [ ] `links_agendamento` + `agendamento_publico` (Calendly-like para clientes).
- [ ] `historico_presenca`, `resumo_presenca_diaria`.
- [ ] `calendario_gestor` (visão consolidada da equipe).

### Fase 15 — Tarefas avançado
- [ ] `escolha_diaria` (corretor escolhe foco do dia).
- [ ] `monitoramento_followups` (gestor acompanha SLA).
- [ ] `atividades_diarias` (registro estruturado de produção).

### Fase 16 — Integrações
- [ ] **Google Sheets sync** (`google_sheets_sync`, `importar_sheets`) — via OAuth do Google.
- [ ] **Google Calendar** — sincronizar agendamentos.
- [ ] **BI sync** (`sincronizacao_bi`, `logs_sincronizacao`) — exportar para Metabase/Looker.
- [ ] **Zapier/Make** — webhooks de saída em eventos do CRM.
- [ ] **WhatsApp gateway oficial** — Meta Cloud API ou Twilio (substituir o link `wa.me` por envio direto).

### Fase 17 — Admin & auditoria
- [ ] `transfer_history`, `log_transferencias` (já parcialmente cobertos por `distribution_log`).
- [ ] `lixeira` + restauração de leads excluídos.
- [ ] `limpeza_duplicatas` (detector + merge).
- [ ] `configuracoes`, `meu_negocio_parametros` (parametrização global).
- [ ] `objecoes_playbook` (biblioteca de respostas a objeções).
- [ ] `indicacoes` (programa de indicação entre corretores).
- [ ] `job_control` (painel para acompanhar `pg_cron`).
- [ ] `desbloqueio` (fluxo para desbloquear corretor suspenso).

### Fase 18 — Push & PWA
- [ ] `push_subscriptions` — substituir `web-push` por OneSignal/Firebase ou manter só in-app.
- [ ] PWA installable + ícones.

### Jobs automáticos (`pg_cron`)
- [ ] Reset diário de cota (`resetar_cotas_diarias` já existe — falta o cron).
- [ ] `agendamentosSyncJob` — lembrar agendamentos próximos.
- [ ] `agentePriorizacaoJob` — recalcular prioridade de leads.
- [ ] `backupJob` — snapshot lógico.
- [ ] `biSyncJob` — push para BI.
- [ ] `carteiraAtivaJob` — mover leads frios para a carteira.
- [ ] `conquistasJob` — apurar conquistas.

### Telas que ainda aparecem como "em breve" no menu
- `/conquistas`
- `/oferta-ativa`
- `/carteira`
- `/comissoes`
- `/scripts`
- `/integracoes`
- `/configuracoes`

---

## Decisões pendentes

1. **Gateway de WhatsApp** — Meta Cloud API (oficial), Z-API (BR), Twilio? Hoje só abrimos `wa.me`.
2. **Geração de PDF** — usar um worker externo (DocRaptor, PDFShift) ou edge function dedicada com `@react-pdf/renderer`?
3. **Cron jobs** — usar `pg_cron` no Postgres do Lovable Cloud ou serviço externo (Upstash QStash)?
4. **Integração Google** — Sheets/Calendar exigem OAuth completo (`access_token` + refresh). Definir se entra em V1.
5. **Push notifications nativas** — manter só in-app ou contratar OneSignal/Firebase?

## Sugestão de próximo passo

**Fase 7 (Empreendimentos avançado)** ou **Fase 14 (Agendamento público — link Calendly-like)**, já que ambos destravam captação de leads externos. O usuário escolhe.
