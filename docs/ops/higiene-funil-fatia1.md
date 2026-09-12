# Higiene do Funil — Fatia 1 (views + aba Agora)

Tela `/higiene-funil`: a fila do que está parado e custando dinheiro hoje.
Somente leitura. Não move lead, não marca perdido, não distribui.

## O que entrou

| Arquivo                                              | Assunto                                                            | Reversível sozinho |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ------------------ |
| `20260911230000_app_flags.sql`                       | infra de feature flag (não existia no repo)                        | sim                |
| `20260911230100_higiene_funil_views.sql`             | config, relógio, régua por fase e 4 views                          | sim                |
| `20260911230200_higiene_unificar_alerta_parados.sql` | **único que muda comportamento**: unifica a régua do alerta diário | sim                |

## Decisões que valem revisão

**O relógio é `COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)`.**
Não é `ultima_atividade_em`: aquela coluna nasceu em `20260826120000` como
`NOT NULL DEFAULT now()` e a própria migration diz que a régua "NÃO é
retroativa" — toda a base anterior a 26/08 carrega o mesmo carimbo, o que faria
lead abandonado há meses parecer ativo. Não é `updated_at` pelo mesmo motivo,
agravado por importação em massa.

**`GREATEST`, não `COALESCE` encadeado.** Com coalesce, um lead com
`ultima_interacao` de 40 dias e `ultimo_contato` de ontem aparecia como "parado
há 40 dias". Reproduzido no harness; hoje é teste de regressão.

**A fila filtra por FASE, nunca por temperatura.** `temperatura` é derivada e
reescrita a cada 10 min por `recalcular_temperatura_leads`, onde `quente` é
estar em agendado/visita_realizada/analise_credito OU ter interação nas últimas
24h. Medido em 2026-09-11: filtrar por `temperatura='quente'` escondia **1.018**
leads parados em `aguardando_retorno` / `proposta_enviada` /
`qualificacao_corretor` contra ~210 que a fila mostrava — escondia 5x mais do
que mostrava, e justamente as fases do estrangulamento do funil.

**A tela diz "sem movimento", nunca "sem contato".** `transicionar_lead` grava
`ultima_interacao = now()` em toda mudança de status, então arrastar card no
Kanban zera o relógio. A métrica disponível é movimento no sistema; prometer
contato seria vender garantia que o dado não dá.

**`escrita_em_lote` vive na view, não na tela.** 12.995 leads (22,4% da base)
compartilham o mesmo timestamp ao segundo em 2026-07-26. Marcar isso na view
faz o motor da Fatia 2 enxergar o mesmo flag e não arquivar uma importação como
abandono real.

## Medir ANTES de aplicar

```sql
-- 1) Baseline da tela (o número ANTES)
SELECT count(*) AS vivos,
       count(*) FILTER (WHERE COALESCE(GREATEST(ultima_interacao, ultimo_contato),
                                       created_at) < now() - interval '5 days') AS parados
  FROM public.leads
 WHERE deleted_at IS NULL AND na_lixeira = false
   AND status NOT IN ('contrato_fechado','pos_venda','perdido');

-- 2) Delta do alerta diário (o único comportamento que muda)
SELECT count(*) FILTER (WHERE COALESCE(ultima_interacao, created_at)
                              < now() - interval '5 days') AS alertaveis_hoje,
       count(*) FILTER (WHERE COALESCE(GREATEST(ultima_interacao, ultimo_contato),
                                       created_at) <= now() - interval '5 days') AS alertaveis_depois
  FROM public.leads
 WHERE corretor_id IS NOT NULL AND deleted_at IS NULL AND na_lixeira = false
   AND status NOT IN ('contrato_fechado','pos_venda','perdido');
```

## Provar DEPOIS de aplicar

```sql
-- O número da tela tem que bater com o baseline (1) acima.
SELECT vivos, parados, parados_nunca_tocados, parados_abandonados,
       parados_em_lote, prazo_dias, medido_em
  FROM public.v_higiene_resumo;
```

## Rollback

**Desligar a tela sem deploy** (primeira coisa a tentar; não desfaz nada):

```sql
UPDATE public.app_flags SET ativo = false, atualizado_em = now()
 WHERE chave = 'higiene_funil';
```

**Reverter só a mudança de comportamento** (o alerta diário volta ao original,
as views continuam de pé):

```sql
CREATE OR REPLACE FUNCTION public.gerar_alertas_leads_parados()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  SELECT l.corretor_id, 'follow_up', 'Lead parado: ' || l.nome,
         'Sem interação há 5+ dias. Retome o contato.',
         '/leads/' || l.id::text, l.id
  FROM public.leads l
  WHERE l.corretor_id IS NOT NULL AND l.deleted_at IS NULL AND l.na_lixeira = false
    AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
    AND COALESCE(l.ultima_interacao, l.created_at) < now() - interval '5 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.ref_id = l.id AND a.tipo = 'follow_up'
        AND a.created_at::date = now()::date);
END;
$$;
```

**Remover a camada de dados inteira** (aplicar na ordem; o alerta acima tem de
ser revertido ANTES, porque depende de `higiene_dias_parado`):

```sql
DROP VIEW IF EXISTS public.v_higiene_pastas_travadas;
DROP VIEW IF EXISTS public.v_higiene_fila;
DROP VIEW IF EXISTS public.v_higiene_resumo;
DROP VIEW IF EXISTS public.v_higiene_base;
DROP FUNCTION IF EXISTS public.higiene_dias_parado(timestamptz, timestamptz, timestamptz);
DROP TABLE IF EXISTS public.higiene_regra_fase;
DROP TABLE IF EXISTS public.higiene_config;
DELETE FROM public.app_flags WHERE chave = 'higiene_funil';
-- app_flags em si fica: é infra genérica, não é desta tela.
```

A rota some com o revert do commit; a flag em `false` já a torna inacessível
antes disso.

## Testes

```bash
npm run db:up && npm run db:apply     # ou Postgres local, ver scripts/db-harness/README.md
npm run test:db                        # 474 testes, 15 deles em tests/db/higiene-funil.test.ts
```

## O que NÃO entrou (fatias seguintes)

Cabeçalho do motor, aba Simulação, aba Regras e aba Carteiras dependem de
`sla_config` / `sla_regras` / `sla_execucao_log` / `sla_processar()`, que **não
existem** no banco nem no repo — o `PROMPT-LOVABLE-03` nunca foi aplicado.
