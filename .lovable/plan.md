
# Reformulação completa da página /copa

Página única em 4 abas, com sistema completo de chaveamento, lançamento manual de pontos e premiação configurável. Mantém calendário 2026 e todos os dados atuais (participantes, seleções, pontuações S1/S2).

---

## 1. Backend (Supabase) — migração única

### 1.1 Atribuição manual de seleções e grupos
- Adicionar coluna `grupo text` em `copa_participantes` (A, B, C…).
- Manter `selecao_id` (já existe) — admin define manualmente, sem sorteio.
- Função `copa_set_selecao_grupo(_participante_id, _selecao_id, _grupo)` (admin/gestor).

### 1.2 Bônus automático W.O. (+10)
- Trigger em `copa_confrontos`: quando `definido_manual = true`, `vencedor_id IS NOT NULL` e o adversário é NULL (ou marcado W.O.), insere automaticamente em `copa_pontuacoes` uma linha com `total = 10`, `observacao = 'W.O. semana N'`, evitando duplicar (chave `edicao_id + corretor_id + semana + observacao`).

### 1.3 Bônus final automático
- Função `copa_aplicar_bonus_final(_edicao_id)` que lê campeão/vice/3º/4º a partir dos confrontos das fases `final` e `terceiro` e insere bônus em `copa_pontuacoes` (+10/+7/+5/+3) com `observacao = 'Campeão' | 'Vice' | '3º lugar' | '4º lugar'`. Idempotente.

### 1.4 Avanço automático ao fim da semana
- Função `copa_avancar_fase(_fase_id)`: se a data atual > `semana_fim` da fase, apura vencedores via `copa_pontos_corretor` (já existe) e gera os confrontos da próxima fase conforme chaveamento.
- Cron `pg_cron` diário 23:55 BRT → roda `copa_avancar_fase` para a fase corrente. Admin pode ajustar antes ou rodar manualmente.

### 1.5 Ranking
- `copa_ranking()` já soma CRM + manual (ag/vi/an/ve × pesos) + `total` (bônus). Manter.

### 1.6 Histórico semanal
- View `copa_pontuacao_semanal(edicao_id)` retornando `corretor_id, nome, semana, agendamentos, visitas, analise, vendas, total_semana` para a tela "Pontuação".

### 1.7 Dados atuais
- Preservar: `copa_edicao`, `copa_selecoes`, `copa_participantes` (e suas seleções), `copa_confrontos`, `copa_pontuacoes` (S1+S2 já lançadas).

---

## 2. Frontend — `src/routes/_authenticated/copa.tsx`

Substituir completamente a página atual. Layout em 4 abas (shadcn `Tabs`):

### Aba 1 — Chaveamento (todos)
- **Header**: semana atual + nome da fase (calendário fixo das 14 semanas, igual ao arquivo).
- **Fase de grupos**: cards por grupo (A, B, C…) com participantes, bandeiras e pontos totais.
- **Confrontos da semana**: cards mostrando A vs B, pontos da semana de cada um, vencedor parcial. Não-admin vê seus próprios confrontos destacados.
- **Mata-mata**: árvore visual (oitavas → quartas → semi → final + 3º lugar). Confrontos vazios aparecem como "A definir".

### Aba 2 — Pontuação (todos)
- Tabela ranking geral: posição, bandeira, nome, ag, vi, an, ve, bônus, total.
- Botão "Ver histórico semanal" expande breakdown semana×categoria por corretor (view `copa_pontuacao_semanal`).

### Aba 3 — Premiação (todos)
- Cards por posição (campeão/vice/3º/4º) com `icone + descrição + valor`. Editáveis pelo admin via dialog.

### Aba 4 — Admin (somente admin/gestor)
Sub-abas internas:

**4.a Participantes & grupos**
- Lista de corretores: checkbox "na copa" + select de seleção + select de grupo.
- Botão "Salvar" → `copa_set_participantes` + `copa_set_selecao_grupo`.

**4.b Lançamento manual (PLANILHA EM GRADE)**
- Seletor de semana (1–14).
- Tabela: linhas = participantes, colunas = `agendamentos | visitas | análise | vendas | bônus livre | observação`.
- Edição inline (inputs numéricos). Botão "Salvar semana" → upsert em `copa_pontuacoes` (uma linha por corretor/semana).
- Indicador visual de "folga" (botão que zera e marca obs=folga).

**4.c Confrontos**
- Lista de confrontos da fase atual com botão "Marcar vencedor" e "Marcar W.O.".
- W.O. dispara o bônus +10 automaticamente.
- Botão "Avançar fase agora" (chama `copa_avancar_fase`).

**4.d Configurações**
- Pesos por categoria (editáveis: 1/5/10/40).
- Prêmios (icone/descrição/valor por posição).
- Botão "Aplicar bônus de classificação final" (manual, após semana 13).

---

## 3. Detalhes técnicos

- Server functions (`createServerFn` + `requireSupabaseAuth`) em `src/lib/copa.functions.ts`:
  - `getCopaDados`, `getRanking`, `getPontuacaoSemanal`, `getConfrontosFase`
  - `setParticipantesGrupos`, `salvarPontuacaoSemana` (batch upsert), `marcarVencedor`, `marcarWO`, `avancarFase`, `aplicarBonusFinal`, `updateConfigPontos`, `updateConfigPremio`.
- TanStack Query + Realtime em `copa_pontuacoes`, `copa_confrontos`, `copa_participantes` para atualização ao vivo.
- Componentes em `src/components/copa/`: `BracketView`, `GrupoCard`, `RankingTable`, `PontuacaoGrid`, `AdminPanel`.

---

## 4. Fora de escopo

- Sorteio automático de seleções (admin define manualmente).
- Edições além da 2026 (calendário fixo).
- Aprovação de lançamentos por gestor (só admin/gestor lança).

---

## 5. Verificação ao final

- S1+S2 atuais (Jefferson 118, Graziele 39, Andrew 20 com W.O., etc.) continuam aparecendo iguais no ranking.
- Lançar pontos via planilha em S3 e ver refletindo no ranking + nos confrontos da semana 3.
- Marcar W.O. em um confronto e ver +10 aparecendo no breakdown semanal.
