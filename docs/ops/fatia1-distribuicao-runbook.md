# Fatia 1 — Destravar a distribuição: runbook operacional

Data: 14/08/2026 · Branch: `claude/smq-leads-distribution-fix-yr40ys`
Contexto completo: diagnóstico da Fatia 0 (conversa "distribuição de leads", 14/08).

**Números ANTES (medidos 14/08):**

| métrica                                           | valor                                                          |
| ------------------------------------------------- | -------------------------------------------------------------- |
| tentativas `sem_corretor` (distribution_log, 14d) | 676.394 (~17k/dia hoje, pico 72k/dia em 01/08)                 |
| distribuições com sucesso (14d)                   | 4.046 (0,6% das tentativas)                                    |
| exceções pendentes                                | 1.086 (≈122 vivas + ≈964 órfãs)                                |
| aptos na roleta plantão                           | 1 de 33 (percentual_minimo=90; 13 corretores entre 87,5–89,9%) |
| aptos marquinhos / landing                        | 6 / 3                                                          |
| leads `aguardando_corretor` (fora da varredura)   | 45.525 (0 criados em agosto)                                   |
| alerta "roleta vazia" nos últimos 21 dias         | 2 dias com alerta (dedupe por não-lido silencia)               |

**Critério de aceite da fatia (medir 48h após P4):**
`sem_corretor`/dia < 2.000 · exceções pendentes ≈ escopo vivo (±30) ·
distribuição diária espalhada (nenhum corretor >20/dia) · alerta de roleta
vazia gravado no banco operacional no mesmo dia de qualquer janela sem apto.

---

## P0 — Freio imediato (console, ANTES do deploy; reversível)

Limita a rajada por corretor no plantão (hoje: Christiane recebeu 72 num dia).

```sql
-- Conferência (esperado: ~26 linhas com limite > 20; 7 já estão em 10):
SELECT p.nome, rp.limite_diario FROM roleta_participantes rp
JOIN roletas r ON r.id = rp.roleta_id JOIN profiles p ON p.id = rp.corretor_id
WHERE r.slug = 'plantao' AND COALESCE(rp.limite_diario, 999) > 20
ORDER BY p.nome;

-- Aplicar (guarda o valor antigo no log de participação? Não há coluna própria —
-- o rollback usa a lista da conferência acima; SALVE O RESULTADO antes):
UPDATE roleta_participantes rp SET limite_diario = 20
FROM roletas r
WHERE r.id = rp.roleta_id AND r.slug = 'plantao'
  AND COALESCE(rp.limite_diario, 999) > 20;
```

Rollback: re-aplicar os valores salvos na conferência (UPDATE por corretor_id).

## P1 — Contenção do reprocesso (migration `20260814180000`)

Backoff exponencial com teto: 30min → 1h → 2h → 4h → 8h → 12h (teto em
`distribuicao_settings.reprocesso_backoff_teto_minutos`, ajustável por UPDATE).
Auto-resgate preservado: nenhum lead vira estado terminal.

Chega via deploy do branch. **Rollback P1 sem deploy** (cola no console):
re-aplicar os corpos anteriores das duas funções — eles estão íntegros na
migration `20260709120300_distribuicao_v3_cutover.sql` (linhas 29–95 e
100–163 do repo). O helper `_excecao_em_backoff` fica inerte sem chamadores.

### P1b — Backfill das exceções órfãs (console, DEPOIS do deploy)

```sql
-- Conferência (esperado ≈ 964 = 743 status fora do escopo + ~188 já com
-- corretor + ~33 sem lead válido; medido 14/08):
SELECT count(*) FROM distribuicao_excecoes e
WHERE e.status = 'pendente'
  AND (
    NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = e.lead_id
                AND l.deleted_at IS NULL AND l.na_lixeira = false)
    OR EXISTS (SELECT 1 FROM leads l WHERE l.id = e.lead_id
               AND (l.corretor_id IS NOT NULL
                    OR l.status::text NOT IN ('novo','aguardando_atendimento')))
  );

-- Backfill (só roda se a conferência bater com ±30 do esperado):
UPDATE distribuicao_excecoes e
   SET status = 'resolvida', resolvida_em = now(),
       resolucao = 'backfill-orfas-20260814: lead fora do escopo de distribuição'
 WHERE e.status = 'pendente'
   AND (
     NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = e.lead_id
                 AND l.deleted_at IS NULL AND l.na_lixeira = false)
     OR EXISTS (SELECT 1 FROM leads l WHERE l.id = e.lead_id
                AND (l.corretor_id IS NOT NULL
                     OR l.status::text NOT IN ('novo','aguardando_atendimento')))
   );

-- Rollback do backfill:
UPDATE distribuicao_excecoes
   SET status = 'pendente', resolvida_em = NULL, resolucao = NULL
 WHERE resolucao LIKE 'backfill-orfas-20260814%';
```

`em_analise` fica intocada (é reivindicação humana).

## P2 — O sinal (migration `20260814181000` + endpoint + vigia n8n)

- `GET /api/public/roletas` (X-API-Key escopo `leads:read`, mesma credencial
  "SMQ CRM Read" do n8n). Payload: slug, nome, tipo, ativo, projeto_id,
  tem_token (boolean — o token em si NUNCA sai), participantes_ativos,
  corretores_aptos.
- Kill switch sem deploy:
  `UPDATE distribuicao_settings SET valor='false'::jsonb WHERE chave='endpoint_roletas_ativo';`
  → endpoint devolve **503 explícito** (o vigia trata como "sinal indisponível",
  nunca como "tudo certo").
- Vigia (n8n, workflow novo "SMQ - Sergio Vigia Roletas", criado após o
  deploy): a cada 15 min chama o endpoint; para cada roleta `ativo=true` com
  `corretores_aptos=0` grava em `public.alertas` do banco operacional
  (lwebydmveyqyzfgmbqfk) `tipo='roleta_sem_apto'`, com **dedupe por
  roleta+dia** (não por "não-lido" — foi o dedupe por não-lido que calou o
  alerta do painel em 19 dos últimos 21 dias). 503/timeout do endpoint →
  alerta `tipo='vigia_roletas_sem_sinal'` (falha ruidosa, nunca silenciosa).
  Atenção à armadilha conhecida: `alertas.lead_id` é uuid — o vigia nunca
  envia lead_id (usa telefone/descricao), então o insert não pode falhar por
  string vazia.
- Rastro do match no funil: nó "Preparar handoff" do Marquinhos passa a
  incluir `match=projeto|geral | roleta=<slug>` no `motivo` do
  `eventos_funil` — o % que cai no geral vira métrica contínua.
  Rollback: restaurar a versão anterior do workflow (histórico do n8n).

## P3 — Conferir limites (se P0 foi feito, só validar)

## P4 — Régua 90 → 85 (console, manhã, com o vigia já no ar)

Simulado com a foto real de 14/08: libera +11 aptos no plantão (total 12).
Pré-condições: P0 aplicado · P1 no ar · P1b executado · vigia do P2 gravando.

```sql
UPDATE distribuicao_settings SET valor = '85'::jsonb
 WHERE chave = 'percentual_minimo_trabalhado';

-- Rollback imediato, sem deploy:
UPDATE distribuicao_settings SET valor = '90'::jsonb
 WHERE chave = 'percentual_minimo_trabalhado';
```

Drenagem esperada: ~122 leads vivos / ~12 aptos ≈ 10 por corretor, com teto
de 20/dia (P0). Monitorar 48h: consultas do "critério de aceite" acima.

## Campanhas novas para a rota direta (console; me devolva os 2 tokens)

Mesmo mecanismo da migration 20260718000305 (que criou as 8 campanhas):

```sql
INSERT INTO roletas (slug, nome, ativo, criterio_participacao, exigir_presenca, tipo, webhook_token)
VALUES
  ('cury-leopoldina', 'Cury Leopoldina (Mundo APTO)', true, 'manual', true, 'campanha', encode(gen_random_bytes(24),'hex')),
  ('engj', 'ENGJ - SEM 2% CAMP - VID MOB',  true, 'manual', true, 'campanha', encode(gen_random_bytes(24),'hex'))
ON CONFLICT (slug) DO NOTHING
RETURNING slug, webhook_token;
```

⚠️ **Campanha sem participante apto manda o lead para a fila de exceções**
(visto ao vivo em 14/08: handoff Well Perdizes casou o projeto e falhou
`sem_corretor_disponivel`). Ao criar as campanhas, incluir participantes na
mesma hora — roster conforme decisão (opções na conversa; recomendação: os
aptos do marquinhos):

```sql
INSERT INTO roleta_participantes (roleta_id, corretor_id, ativo, limite_diario)
SELECT r.id, rp.corretor_id, true, 10
FROM roletas r
CROSS JOIN (SELECT rp2.corretor_id FROM roleta_participantes rp2
            JOIN roletas rm ON rm.id = rp2.roleta_id AND rm.slug = 'marquinhos'
            WHERE rp2.ativo AND rp2.pausado_ate IS NULL) rp
WHERE r.slug IN ('cury-leopoldina','engj')
ON CONFLICT (roleta_id, corretor_id) DO NOTHING;
```

Com os 2 tokens em mãos, eu atualizo `rotas_intake` (banco operacional) — não
é preciso mexer lá manualmente.
