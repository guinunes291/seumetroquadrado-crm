# Evolução do CRM — implementação e rollout seguro

Data: 2026-07-11
Branch de trabalho: `codex/evolucao-seguranca-escala-ux`
Baseline auditado: `cfe951096b74cead926be363566d40329119732e`

## Estado desta entrega

Esta branch implementa a camada de aplicação e as migrations aditivas do plano.
Ela **não foi aplicada ao Supabase vivo**: o ambiente, as migrations de 10/07,
as Edge Functions e os secrets continuam pendentes de verificação operacional.

Entregue no código:

- acesso invite-only e estado de conta separado da elegibilidade da roleta;
- autorização central por carteira/equipe e RLS nas entidades ligadas ao lead;
- documentação privada mediada pelo servidor, versionada e auditada;
- clientes de API com hash, escopo, validade, rotação e restrição de equipe/projeto;
- landing com Turnstile, idempotência permanente e rate limit distribuído;
- outbox/claim atômico para push;
- máquina de estados do lead e aprovação gerencial de vendas com ledgers;
- busca, pipeline, inbox, ranking e métricas calculados por RPCs paginadas/compactas;
- provider único de autenticação, cache isolado por sessão e defaults de React Query;
- estados assíncronos explícitos, Kanban operável sem drag e componentes responsivos;
- lazy loading das superfícies pesadas, planilhas sob demanda e budget de bundle;
- governança do SamiQ com prompts/modelo versionados, minimização de PII e
  budgets distribuídos por usuário/equipe;
- shortlist comparável da Vitrine com link público temporário sem PII e sinais
  de abertura, projeto visto e CTA;
- Modo Visita mobile com rota, ficha, checklist, ditado sem retenção do áudio e
  conclusão transacional;
- sinais de fechamento calibrados apenas com vendas aprovadas e rotulados como
  índice de priorização, nunca como probabilidade garantida;
- CI bloqueante para lint, formatação alterada, tipos, testes, build, bundle, audit e secrets.

## Ordem das migrations novas

Aplicar somente depois do backup e da conferência do schema vivo, nesta ordem:

1. `20260711120000_invite_only_lead_access.sql`
2. `20260711121000_push_outbox_claim.sql`
3. `20260711121500_documentacao_server_mediation.sql`
4. `20260711122000_sales_approval_integrity.sql`
5. `20260711123000_invite_operations.sql`
6. `20260711123500_related_lead_rls.sql`
7. `20260711124000_scale_read_models_v2.sql`
8. `20260711125000_api_clientes.sql`
9. `20260711126000_landing_webhook_hardening.sql`
10. `20260711127000_atendimento_inbox_v2.sql`
11. `20260711130000_lead_status_transition_guard.sql`
12. `20260711131000_samiq_governance.sql`
13. `20260711132000_vitrine_publica.sql`
14. `20260711133000_modo_visita.sql`
15. `20260711134000_fechamento_sinais_calibrados.sql`
16. `20260711135000_projetos_vitrine_rich_media.sql`
17. `20260711136000_projetos_webhook_token_lockdown.sql`
18. `20260711137000_vitrine_rollout_upgrade.sql`

A migration 18 é um finalizador aditivo e idempotente: ela deve ser aplicada
mesmo quando uma revisão intermediária das migrations 13 ou 16 já constar como
registrada no ambiente vivo. Ela recompõe colunas, defaults, backfills,
constraints e as funções finais da Vitrine sem depender da reexecução de uma
migration histórica.

## Pré-flight obrigatório no ambiente vivo

1. Criar backup lógico e registrar o identificador do snapshot.
2. Comparar `supabase migration list --linked` com a pasta local.
3. Confirmar as cinco entregas de 10/07 descritas em
   `docs/auditoria/2026-07-entregas.md`.
4. Inventariar nos logs os consumidores de `READ_API_KEY`, `MCP_WRITE_API_KEY`,
   landing, push, MCP e n8n. Não cortar uma chave sem dono e última chamada.
5. Confirmar que signup público está desligado no projeto, além de
   `enable_signup = false` no `config.toml`.
6. Conferir SMTP, URL do CRM e deploy da Edge Function `crm-convites`.
7. Configurar `LANDING_HASH_SECRET`, `TURNSTILE_SECRET_KEY`, allowlist de origem,
   `PUSH_DISPATCH_SECRET` e os secrets existentes somente no servidor.
8. Se a janela legada for indispensável, preencher `PUBLIC_API_LEGACY_STARTED_AT`
   e `PUBLIC_API_LEGACY_UNTIL` com intervalo total máximo de sete dias. O padrão é
   desligado.
9. Configurar a versão ativa, o modelo, as cotas e as tarifas reais do SamiQ;
   enquanto as tarifas estiverem nulas, o limite por custo não é aplicado.
   A redação local de PIS/PASEP, dados bancários, documentos, contatos e nomes
   rotulados é defesa em profundidade e **best-effort**, não garantia de anonimização.
   A barreira principal continua sendo a allowlist de contexto estruturado e a
   exclusão de texto livre do banco; para uso regulado, validar também um DLP
   dedicado antes do gateway.
10. Preencher `VITRINE_PUBLIC_ALLOWED_HOSTS` somente com hosts HTTPS aprovados
    e agendar `limpar_vitrine_eventos_expirados()` diariamente. O banco ainda
    limita cada link a 1.000 eventos e 20.000 requisições mesmo sem o cron.

## Pontos de atenção do backfill comercial

- vendas legadas não distratadas entram como aprovadas para preservar os efeitos
  financeiros já contabilizados;
- duplicatas ativas por lead são inventariadas e as excedentes são canceladas;
- leads fechados sem qualquer venda aprovada são reabertos com próxima ação e
  evento explícito;
- nenhuma venda nova altera ranking, meta, VGV ou comissão antes da aprovação.

Revisar as contagens desses três grupos em uma cópia do banco antes de liberar a
migration comercial no ambiente vivo.

## Canário e matriz de segurança

Criar contas descartáveis para: corretor A/equipe A, corretor B/equipe B, gestor
A, gestor B, admin e conta bloqueada. Validar:

- signup sem convite falha e não cria papel;
- corretor não acessa lead, timeline, tarefa ou documento de outra carteira;
- gestor não atravessa equipe;
- após transferência, o corretor anterior perde acesso;
- CRUD direto no bucket `documentacao` retorna negação;
- URL assinada expira em cinco minutos;
- venda pendente não aparece no ranking, meta, métricas ou comissão;
- somente gestão da equipe consegue aprovar a venda;
- conta bloqueada perde a sessão e continua negada por RLS com JWT antigo;
- cliente de API sem escopo/restrição adequada recebe `403`/`404` fail-closed;
- replay da landing com a mesma idempotency key devolve a resposta pública
  persistida, sem criar outro lead.

## Rollout

1. Backup e validação em clone/staging.
2. Schema aditivo.
3. Aplicação compatível e Edge Function de convites.
4. Backfills e reconciliação comercial.
5. Canário com as contas da matriz.
6. Ativação das policies e mediações server-side.
7. Criação dos clientes de API e migração dos consumidores.
8. Corte da janela legada e rotação das chaves antigas.
9. Remoção dos caminhos legados após sete dias sem uso.

## Limitação de recuperação de desastre

O histórico contém definições divergentes de `vendas`/`comissoes` em migrations
antigas. Sem o schema vivo e um PostgreSQL local disponível, esta branch não
altera retroativamente esse histórico e não declara `supabase db reset` aprovado.
Antes de tornar o job de banco bloqueante, gerar um baseline a partir do schema
vivo, reconciliar checksums e validar o replay em um projeto descartável. Alterar
migration já aplicada sem essa reconciliação pode criar divergência silenciosa.

## Evidências locais esperadas antes do merge

```text
npm run format:check
npm run lint:ci
npm run type-escape-budget
npm run typecheck
npm run test
npm run build
npm run bundle-budget
npm audit --omit=dev --audit-level=high
git diff --check
```

O teste do banco vivo, pgTAP/RLS e E2E autenticado continuam sendo gates do
rollout — não devem ser substituídos pelos testes estáticos desta branch.
