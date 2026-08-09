# 05 · O que NÃO fazer

> Metade de uma estratégia é o que ela proíbe. Esta lista herda integralmente o "o que não fazer agora" da auditoria vigente (`ux-ia-2026-08/06-plano.md`) e acrescenta as proibições que este estudo descobriu. Cada item tem o motivo — para que a proibição caia quando o motivo cair.

## Herdadas da auditoria vigente (continuam valendo)

1. **Não tocar as roletas (núcleo transacional).** SECURITY DEFINER, distribuição automática e SLA são o coração da operação; a v3 foi validada com testes de banco reais. O item P-4 (elegibilidade única) se resolve **extraindo função comum**, não reescrevendo o motor.
2. **Não reescrever `/leads` de uma vez.** O caminho é esvaziá-la por partes (item 2.7 em três PRs), não substituí-la.
3. **Não apagar as ~30 RPCs órfãs antes de medir.** `pg_stat_statements` por 7+ dias (item 0.2) vem antes de qualquer eliminação — "sem consumidor no frontend" não prova "sem consumidor" (bots, n8n, MCP).
4. **Não mexer nos 4 modais obrigatórios de etapa.** [DECIDIDO]: a fricção é proposital — cada transição relevante exige o registro que alimenta os KPIs.
5. **Não renomear conceitos do domínio** (lead, funil, etapa, roleta) — os renomes de navegação já foram feitos; renomear domínio quebra treinamento e suporte.
6. **Não fazer 3.1 e 3.2 juntas.** Cada mudança de `LEAD_STATUS_ORDER` em janela própria, com migração e validação isoladas.
7. **Não remover os redirects antigos.** Toda URL que hoje abre alguma coisa continua abrindo — custo de manutenção baixo, custo de quebrar link alto.
8. **Não voltar com personalização de layout.** Ordem fixa de widgets foi decisão consciente (commits `904bc7d`, `23225f5`).

## Novas — descobertas deste estudo

9. **Não construir IA nova sobre a base suja.** Score v2, follow-up automático, distribuição por afinidade e auditoria de atendimento (Onda E) só entram depois da Onda A. Um modelo treinado/calibrado numa base onde 83% dos leads são invisíveis, 0,01% têm desfecho e a temperatura está morta aprende exatamente essas distorções — e passa a **recomendá-las**.
10. **Não ligar provedor de WhatsApp antes do modo simulado validar a Central.** A fase 7b existe para provar a UX e o fluxo de atribuição sem custo por conversa nem risco de banimento. Contratar provedor primeiro inverte o risco.
11. **Não aplicar migração de risco alto sem ensaio.** Depois da Onda D.3 (staging + pipeline), toda migração classificada de risco alto (como D.1, crédito em 3 estados) ensaia em staging primeiro. Até lá, migração de risco alto exige o ritual completo de `2026-07-11-evolucao-crm.md` (backup identificado + pré-flight + janela).
12. **Não criar nova superfície de IA fora da governança.** Depois de 0.6, toda função de IA nova nasce dentro do padrão SamiQ (prompt/modelo no banco, quota, redação de PII, telemetria em `samiq_execucoes`). Modelo hardcoded em código novo = regressão de C3.
13. **Não adicionar colunas de estado de motor na tabela `leads`.** Ela já tem ~85 colunas com estado de distribuição, contadores de janela e idempotência da entidade misturados. Estado novo de processo vai em tabela própria (como `roleta_participantes` faz) — a dieta da `leads` é gradual, mas o ganho de peso para agora.
14. **Não misturar dados de produção em migration nova sem guarda.** 106 migrations contêm `INSERT`; as que patcheiam produção devem continuar guardadas por existência da linha-alvo (padrão do harness) — e dados de seed novos vão para seeds, não para DDL.
15. **Não tratar `.lovable/roadmap-restante.md` como fonte de verdade.** Está desatualizado (lista como pendente o que já foi entregue). As fontes vigentes são `ux-ia-2026-08/06-plano.md`, `2026-07-19-pendencias.md` e este estudo.
16. **Não resolver o dual-lockfile apagando um lado sem confirmar com a plataforma.** A Lovable pode depender do `bun.lock`; o CI usa `npm ci`. Primeiro confirmar qual é o canônico do deploy (P-6), depois remover o outro.

## Quando cada proibição cai

| Proibição                  | Cai quando                                                 |
| -------------------------- | ---------------------------------------------------------- |
| 3 (não apagar RPCs)        | `pg_stat_statements` com 7+ dias de janela e zero chamadas |
| 9 (não IA em base suja)    | G1 = 100% e G2 > 30%                                       |
| 10 (não ligar provedor)    | Central validada em modo simulado + decisão D1             |
| 11 (não migrar sem ensaio) | staging + pipeline da Onda D.3 operacionais                |
| 13 (dieta da `leads`)      | nunca — é regra permanente de modelagem                    |
