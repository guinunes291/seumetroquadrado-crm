# Roadmap — CRM Seu Metro Quadrado

Plano para suportar **1.000 corretores, milhões de leads e dezenas de milhares de vendas/ano**.
Trilhas: **Correções · Melhorias · Performance · IA · Escalabilidade · Produto**. Cruzado com
`.lovable/roadmap-restante.md` (gaps de produto já mapeados pelo time). Ver achados em
[`relatorio-tecnico.md`](./relatorio-tecnico.md).

Legenda de esforço: **P** pequeno (≤1d) · **M** médio (2-5d) · **G** grande (1-3 semanas).

---

## 30 dias — Estancar o sangramento (Correções + base de confiabilidade)

| Item | Trilha | Esforço | Status |
|------|--------|---------|--------|
| API pública sem PII + rate limit (S1) | Correções/Seg | P | ✅ feito |
| Intake idempotente + dedup + normalização de telefone (B1) | Correções | P | ✅ feito |
| Alerta in-app em falha de notificação (B2) | Correções | P | ✅ feito |
| Gravar interação WhatsApp antes de abrir (B3) | Correções | P | ✅ feito |
| Consolidar migrations idempotentes; validar `db reset` (B4) | Escalabilidade | M | a fazer |
| `PUSH_DISPATCH_SECRET` dedicado + timing-safe + rate limit (S2) | Segurança | P | a fazer |
| RLS por projeto/equipe na (re)distribuição (S5) | Segurança | M | a fazer |
| CI/CD: lint + `vitest` + build + secret scanning; `.env` no `.gitignore` (S4) | Performance/Qualidade | M | a fazer |
| Teto + cache de catálogo no match IA (custo) | IA/Financeiro | P-M | a fazer |
| `UNIQUE` parcial em `(projeto_id, telefone_norm)` nos leads | Dados | P | a fazer |
| Índices compostos parciais (`corretor_id,status`; temperatura/status) | Performance | P | a fazer |
| UX-1 retry visível no kanban; UX-2 erros de import linha a linha; UX-3 validar oferta | UX | M | a fazer |

## 90 dias — Confiabilidade & escala

- **Performance:** mover agregações de `ranking`/`dashboard`/`copa` para views/RPCs agregadoras
  no servidor; otimizar `recalcular_temperatura_leads` (lote/somente-mudou). *(G)*
- **Observabilidade/SRE:** auditoria de mutações sensíveis (reatribuição, mudança de papel,
  exclusão); painel de jobs `pg_cron`; alertas de DLQ para intake/notificação. *(M-G)*
- **Comunicação:** **WhatsApp oficial** (Meta Cloud API/Z-API/Twilio) substituindo `wa.me`;
  logs de WhatsApp; e-mail transacional (Resend) para alertas críticos. *(G)*
- **Qualidade:** testes de integração (RLS, RPCs de distribuição/comissão, webhooks). *(M-G)*
- **UX P1:** validação de campos do lead (CPF/renda), confirmação de alterações não salvas,
  update otimista na oferta ativa, invalidação de cache type-safe. *(M)*
- **Segurança:** mover guard de auth para o servidor (S3); rotação de chaves. *(M)*

## 6 meses — Produto (operação imobiliária completa)

- **Comissões/Contratos/Propostas:** `contratos`, `comissoes` (consolidado), `templates_comissao`,
  `propostas`/`propostas_publicas` (link assinável), geração de PDF. *(G)*
- **Crédito/Documentação:** `analises_credito`, `documentacoes`, **pré-análise MCMV** automática. *(G)*
- **Oferta/Carteira Ativa:** sessões cronometradas de leads frios; job que move inativos. *(G)*
- **Agendamento avançado:** disponibilidade/bloqueios + **agendamento público** (Calendly-like). *(G)*
- **Catálogo:** `tabelas_preco`, mapa com geocoding, sugestões de imóvel por perfil. *(M-G)*

## 12 meses — Diferenciação & escala 1.000 corretores

- **IA:** score/priorização de lead, distribuição por afinidade, follow-up automático por estágio,
  auditoria de atendimento, score de corretor. *(G)*
- **BI & Integrações:** sync para Metabase/Looker; Google Sheets/Calendar; Zapier/Make de saída. *(G)*
- **Escalabilidade:** particionamento/arquivamento de `leads`/`interacoes` por tempo; revisão de
  multi-tenant; cache de borda; revisão de cota/limites de distribuição por turno/projeto. *(G)*
- **Mobile/PWA:** app instalável + push nativo para corretores em campo. *(G)*

---

## Métricas de sucesso

- **Confiabilidade:** 0 leads duplicados por retry; 100% das falhas de notificação geram alerta;
  `db reset` reproduz o schema em ambiente limpo.
- **Segurança:** 0 PII sensível em endpoints públicos; rate limit ativo; CI com secret scanning verde.
- **Performance:** dashboards/ranking < 200ms no servidor; operações críticas < 100ms.
- **Operação:** SLA de 1º contato cumprido; queda na perda de leads por inação.
