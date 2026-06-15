
# Plano — Colocar o CRM no ar hoje

Foco escolhido: **Confiabilidade e dados**. As demais frentes (WhatsApp oficial, Google Sheets, Google Calendar, HUB de agentes) entram logo em seguida, com a fundação pronta.

---

## Parte 1 — Fundação para o go-live (hoje)

### 1.1 Importação de CSV (uma tabela por arquivo)
Você me envia os CSVs (`leads.csv`, `projetos.csv`, `corretores.csv`, `unidades.csv`, etc.) e eu:

1. Confirmo o mapeamento **coluna do CSV → coluna da tabela** com você (1 rodada de validação rápida por arquivo).
2. Copio o arquivo para `/tmp` e uso `psql \copy` para uma tabela de staging (`_import_*`).
3. Faço `INSERT ... SELECT` da staging para a tabela final, tratando:
   - normalização de telefone/e-mail,
   - resolução de FKs (corretor por e-mail, projeto por nome/slug),
   - deduplicação (telefone+email para leads, nome+cidade para projetos),
   - log do que foi inserido/ignorado/atualizado.
4. Rodo um *dry-run* mostrando totais antes de commitar.

**O que preciso de você antes**: me diga quais CSVs tem em mãos e me mande um (de preferência o de leads) para eu propor o mapeamento.

### 1.2 Endurecer confiabilidade
- **Lixeira (`soft delete`)**: coluna `deleted_at` em `leads`, `projetos`, `unidades`, `agendamentos`, `tarefas` + view `*_ativos` + tela `/lixeira` para restaurar.
- **Auditoria genérica**: tabela `audit_log` + trigger em tabelas críticas registrando `quem, quando, o que mudou` (JSONB diff).
- **Detector de duplicatas**: função SQL `detectar_duplicatas_leads()` + tela com merge manual.
- **Revisão de RLS**: rodar o linter, fechar qualquer policy `USING (true)` indevida, conferir GRANTs em todas as 16 tabelas atuais.
- **Backup lógico diário**: `pg_cron` chamando `/api/public/jobs/backup-snapshot` que exporta JSON para um bucket de storage (`backups/YYYY-MM-DD.json`).
- **Reset de cota diária**: agendar `resetar_cotas_diarias()` no `pg_cron` (a função já existe, falta o cron).

### 1.3 Testes
Acrescento `tests/import-csv.test.ts` (normalização + dedupe) e `tests/lixeira.test.ts` (soft-delete + restore). Meta: >50 testes passando.

---

## Parte 2 — HUB de Agentes de IA (próximo passo)

Como seus agentes já rodam fora (skills do Claude no seu Mac), o CRM funciona como **cliente** deles. Padrão:

- Tabela `agentes_hub` (nome, descrição, endpoint, método, headers JSON, ativo).
- Tabela `agente_execucoes` (agente_id, payload_in, payload_out, status, latência).
- Server function `executarAgente({ agenteId, payload })` que faz POST autenticado, registra a execução e devolve o resultado.
- Tela `/agentes` para cadastrar/testar.
- Gatilhos: botão "Rodar agente X" no lead, na tarefa, no agendamento (você escolhe quais agentes ficam disponíveis em cada contexto).

**Para isso eu preciso**: a lista dos agentes (nome, o que faz, URL/método, formato do request/response). Pode ser depois.

---

## Parte 3 — Integrações priorizadas (logo após o go-live)

1. **WhatsApp Meta Cloud API** — tabela `whatsapp_logs`, server function `enviarWhatsApp(leadId, templateId)`, troca do botão `wa.me` por envio direto, recibo de leitura via webhook `/api/public/webhooks/whatsapp`.
2. **Google Sheets** — via connector gateway, server function `importarLeadsSheets(sheetUrl)` + sync agendado.
3. **Google Calendar** — via connector gateway, sincronizar `agendamentos` (criar/atualizar/cancelar) na agenda do corretor.

---

## 30 sugestões priorizadas para o go-live

### 🔴 Críticas para subir hoje (1-10)
1. Importar a base real via CSV (com dry-run + rollback).
2. Lixeira com restauração em todas as tabelas operacionais.
3. Detector e merge de leads duplicados (telefone + e-mail).
4. Auditoria em `leads`, `agendamentos`, `tarefas` (quem fez o quê).
5. Backup diário automatizado para storage.
6. Cron de reset diário de cota da roleta.
7. Revisão completa de RLS + linter zerado.
8. Confirmação de exclusão em qualquer ação destrutiva.
9. Tratamento global de erro (toast amigável + log) no client.
10. Página `/status` simples mostrando saúde do banco e jobs.

### 🟠 Experiência do corretor (11-18)
11. Atalhos de teclado (`L` novo lead, `T` nova tarefa, `/` busca).
12. Busca global no topo (leads + projetos + tarefas).
13. Modo mobile do Kanban (cards arrastáveis em telas pequenas).
14. Notificação push in-app quando lead novo cai na fila.
15. "Meu dia" no dashboard: tarefas + agendamentos das próximas 24h.
16. Discador click-to-call (`tel:`) com registro automático de interação.
17. Botão "WhatsApp" com template já no link `wa.me` (até a Meta Cloud entrar).
18. Histórico de últimos 5 leads acessados na sidebar.

### 🟡 Captação (19-23)
19. Link público de auto-agendamento por corretor (Calendly-like).
20. Webhook por projeto já documentado em `/projetos/:id` com botão "copiar URL".
21. Página pública de empreendimento (`/p/:slug`) — landing simples + form que vira lead.
22. UTM tracking no webhook (`utm_source`, `utm_medium`, `utm_campaign`).
23. QR code do link de captação por projeto (para anúncios físicos).

### 🟢 Gestão e performance (24-28)
24. Ranking ao vivo na tela `/ranking` (Supabase Realtime).
25. Tela TV (`/tv/ranking`) modo fullscreen para o escritório.
26. Filtro "minha equipe" em todas as listagens (para gestor).
27. SLA de primeiro contato: alerta vermelho se lead > 15 min sem ação.
28. Export CSV em qualquer listagem com 1 clique.

### 🔵 Cuidados de produção (29-30)
29. E-mail transacional via Resend para alertas críticos (lead frio 7 dias, agendamento amanhã).
30. Documentação `/docs` interna (1 página) com fluxos básicos do corretor.

---

## Sequência sugerida de execução

```text
Hoje    → Parte 1 (CSV + lixeira + auditoria + RLS + backup + cron)
         + sugestões 1-10 e 27 (SLA)
Dia 2   → Sugestões 11-18 (UX do corretor) + agentes HUB (Parte 2)
Dia 3   → Parte 3 (WhatsApp Meta + Sheets + Calendar)
Dia 4   → Sugestões 19-23 (captação) + 24-26 (gestão/TV)
Dia 5   → 28-30 + ajustes
```

## O que preciso de você para começar
- O **CSV de leads** (ou amostra de 20-30 linhas) para eu propor o mapeamento.
- Confirmar se posso já criar **lixeira + auditoria + cron de backup** sem esperar.
- A lista dos **agentes de IA** (pode vir depois, mas quanto antes melhor).
