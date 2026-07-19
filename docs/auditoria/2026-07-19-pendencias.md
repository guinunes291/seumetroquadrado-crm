# Auditoria funcional — Onda 5 (2026-07-19) — Pendências reais

Nada aqui está escondido: cada item tem impacto, motivo de não ter sido concluído,
próxima ação e risco.

## Decisões de produto (exigem o dono do negócio)

### P-1. `metas` legível e editável fora do escopo de equipe

- **Descrição**: qualquer autenticado LÊ as metas de todos (`USING true`); gestor de
  QUALQUER equipe cria/edita/apaga metas de qualquer corretor; superintendente NÃO pode
  escrever metas (inconsistente com o resto da hierarquia).
- **Impacto**: exposição de metas entre equipes; escrita cruzada indevida.
- **Motivo de não corrigir**: pode ser intencional (ranking/copa dependem de leitura
  global?); restringir sem confirmação quebraria telas silenciosamente.
- **Próxima ação**: decidir escopo (sugestão: leitura própria+gestão da equipe+admin/
  superintendente; escrita de gestor restrita à equipe; incluir superintendente) e
  aplicar em migration. Comportamento atual está ASSERTADO em
  `tests/db/rls-por-papel.test.ts` com comentário "decisão de produto pendente".
- **Risco em produção**: médio (vazamento interno, não externo).

### P-2. Comissão com `beneficiario_id NULL`

- **Descrição**: `gerar_comissoes_para_venda` cria linhas de comissão de gerente/
  superintendente com beneficiário NULL quando a hierarquia não é resolvível
  (corretor sem equipe/equipe sem gestor).
- **Impacto**: valores de comissão "de ninguém" somam no total e nunca serão pagos a
  alguém identificável.
- **Próxima ação**: decidir — não gerar a linha, ou gerar marcada para resolução manual.
- **Risco**: médio (financeiro/relatórios).

## Técnicas (planejadas, não executadas nesta onda)

### P-3. Remover `?secret=` do lead-intake

- **Descrição**: secret por query string segue aceito (com log de deprecação e comparação
  timing-safe).
- **Motivo**: remover agora quebraria o Zap em produção silenciosamente.
- **Próxima ação**: migrar o Zap para o header `x-webhook-secret` e remover o fallback.
- **Risco**: baixo (o secret continua validado; exposição é via logs de infra).

### P-4. Unificar os motores de distribuição

- **Descrição**: coexistem o motor canônico v3 (`_distribuir_lead_v3`, com cota, % de
  leads trabalhados, presença) e o ponderado por tier (`distribuir_lead_ponderado`,
  campanhas), com elegibilidades DIFERENTES — o ponderado ignora cota/% do canônico e
  coloca o lead direto em `em_atendimento` (pula o SLA de `aguardando_atendimento`).
  Além do legado v1 (`distribuir_lead`, `fila_distribuicao`) ainda presente.
- **Motivo**: consolidar é refactor de alto risco sem necessidade funcional imediata;
  os bugs de correção (roubo de lead, concorrência) foram fechados nesta onda.
- **Próxima ação**: extrair a elegibilidade para função única usada pelos dois motores;
  aposentar o v1.
- **Risco**: médio (regras comerciais divergentes entre canais de entrada).

### P-5. Drift: `copa_ranking()` de produção não está no repo

- **Descrição**: a função viva em produção retorna (selecao*id, grupo, total*\*) — shape
  que não existe em NENHUMA migration. O types.ts mantém o shape de produção via ajuste
  manual documentado.
- **Próxima ação**: exportar a definição viva de produção (dashboard SQL editor:
  `SELECT pg_get_functiondef('public.copa_ranking()'::regprocedure)`) e comitar como
  migration de registro.
- **Risco**: baixo (Copa é gamificação), mas fura a reprodutibilidade do banco.

### P-6. Dual-lockfile (bun.lock × package-lock.json)

- **Descrição**: não foi possível confirmar se o builder do Lovable usa bun; remover
  `bun.lock`/`bunfig.toml` às cegas poderia quebrar o deploy deles.
- **Próxima ação**: confirmar com o Lovable; se npm-only, remover os arquivos bun.
  Enquanto isso o CI (npm) está verde e o lockfile npm sincronizado.
- **Risco**: baixo→médio (o drift que quebrou o `npm ci` pode voltar a cada bump do bun).

### P-7. WhatsApp (Z-API) sem fila/retry

- **Descrição**: notificações best-effort; falha vira alerta in-app, sem reenvio.
- **Próxima ação**: fila com retry (padrão push_outbox) OU migração para a API oficial
  (Meta Cloud) já desenhada em docs/fase7-mensageria.md.
- **Risco**: baixo (perda de notificação, não de dado).

### P-8. Estruturas legadas coexistindo

- `na_lixeira`/`data_movido_lixeira` × `deleted_at`; `fila_distribuicao`/
  `distribuicao_config`/`distribution_log` (v1) × stack v3; `documentacoes` ×
  `documentacao_versoes`. Funcionais, mas duplicam conceito e confundem consultas.
- **Próxima ação**: plano de migração de dados + remoção em onda própria.
- **Risco**: baixo.

### P-9. Rate limit distribuído no caminho legado de escrita

- **Descrição**: `requireWriteKeyOrLegacy` (síncrono, janela legada) segue só com o
  limite em memória.
- **Motivo**: tornar async ripple por todas as rotas legadas que estão saindo de cena.
- **Risco**: baixo (a janela legada é temporária e fail-closed).

### P-10. Smoke autenticado (browser)

- **Descrição**: o e2e/smoke cobre só rotas públicas; jornadas autenticadas de browser
  exigiriam GoTrue local (supabase CLI + stack Docker completa).
- **Mitigação**: as jornadas 1–3 estão cobertas no nível de banco
  (`tests/db/jornada-lead-venda.test.ts`), onde mora a autoridade das regras.
- **Próxima ação (opcional)**: `supabase start` + seed de usuários + Playwright logado.

### P-11. Duplicatas históricas de telefone em produção

- **Descrição**: os índices únicos são guardados — se produção tiver duplicatas ativas,
  eles NÃO são criados (fica warning + views de relatório). A RPC `criar_lead_dedup`
  protege o fluxo novo mesmo sem índice.
- **Próxima ação pós-deploy**: consultar `vw_leads_telefone_duplicado` e
  `vw_leads_sem_projeto_telefone_duplicado` em produção; mesclar via tela de Duplicatas
  (`mesclar_leads`); reaplicar a migration (ou re-rodar o DO-block) para ativar os índices.
- **Risco**: médio até os índices existirem em produção.
