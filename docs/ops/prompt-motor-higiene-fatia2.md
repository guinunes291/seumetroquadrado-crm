# PROMPT · Motor de Higiene por Fase (Fatia 2) — CRM da SMQ

> Cole inteiro no Claude Code. Autocontido. Substitui o `PROMPT-LOVABLE-03-motor-sla-higiene.md`,
> escrito antes das medições de 11–12/09/2026 e que hoje proporia tabelas duplicadas.
> Números e travas vêm de `docs/ops/higiene-diagnostico-2026-09.md`.

Você vai construir o **motor de higiene por fase**: a rotina que move lead parado sozinho, e o
painel que a comanda. A tela que ela alimenta **já está no ar** (PR #184).

Sistema **em produção, fazendo dinheiro**. A regra que manda em tudo: **o que já funciona não
pode parar.**

## 0. As regras de medição da casa (não são opcionais)

1. **Medir antes de mexer.** Nada entra sem número ANTES e DEPOIS.
2. **Controle positivo antes de afirmar ausência.**
3. **Três leituras da MESMA camada não são três provas.** Esta sessão errou DUAS vezes por
   violá-la: concluiu que um job não rodava porque não havia `cron.schedule` em migration, e
   que a SLA de 15 min não rodava porque não havia job com o nome dela. Ver §2.4.
4. **Estado de lead não se lê no ÚLTIMO rótulo, se lê em "passou por"** (`bool_or`).
5. **Timestamps idênticos ao segundo = escrita em lote**, não comportamento.
6. **Trocar falha ruidosa por falha silenciosa é PIORA**, mesmo acertando mais vezes.

## 1. Stack real (adapte ao que existe, não o contrário)

React 19 · Vite 7 · TS 5.8 · Tailwind 4 · shadcn/ui · `@tanstack/react-query` v5 ·
`@supabase/supabase-js` v2 · **TanStack Router + Start, file-based**.

**Não é `react-router-dom`.** Rota é arquivo em `src/routes/_authenticated/` com
`createFileRoute`; link é `<Link to="/leads/$leadId" params={{ leadId }}>` de
`@tanstack/react-router`. `src/routeTree.gen.ts` é gerado no build.

Guard de papel: `useUserRoles()`, padrão de `/distribuicao`
(`if (!loading && !isAdmin && !isGestor && !isSuperintendente) throw redirect({to:"/"})`).
O `!loading` importa: sem ele a tela expulsa o usuário antes do papel chegar.

Testes: `npm run test` (unit) · `npm run db:up && npm run db:apply && npm run test:db`
(Postgres real, `tests/db/`).

## 2. 🔴 O QUE JÁ EXISTE — e que você NÃO vai duplicar

| Objeto                                                              | O que é                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `higiene_config`                                                    | `dias_parado_min` (5), `lote_min_leads` (50). O prazo mora AQUI  |
| `higiene_dias_parado(ui, uc, created)`                              | o relógio, como função `STABLE`. Definição ÚNICA                 |
| `higiene_regra_fase`                                                | `status` (enum), `peso`, `acao_sugerida`, `ativa`                |
| `v_higiene_base`                                                    | vivo, `dias_parado`, `parado`, `nunca_tocado`, `escrita_em_lote` |
| `v_higiene_resumo` · `v_higiene_fila` · `v_higiene_pastas_travadas` | as leituras da tela                                              |
| `app_flags`                                                         | feature flag genérica                                            |
| `/higiene-funil`                                                    | a tela, `src/features/higiene/`, menu BI — Relatórios            |
| `src/integrations/supabase/higiene-pendente.ts`                     | boundary tipado (views fora de `types.ts`)                       |
| `tests/db/higiene-funil.test.ts`                                    | 15 casos contra Postgres real                                    |

- ❌ **NÃO crie `sla_config`** → adicione colunas a `higiene_config`.
- ❌ **NÃO crie `sla_regras`** → adicione colunas a `higiene_regra_fase`.
- ❌ **NÃO reescreva o relógio** → chame `public.higiene_dias_parado(...)`.
- ✅ **Crie `higiene_execucao_log`** — é o que falta.
- ✅ `higiene_processar()` decide lendo `v_higiene_base`. Se a tela conta 32.627 parados e o
  motor avalia 30.000, a diferença é **bug**, não mistério.

**Por quê:** antes da Fatia 1 havia TRÊS definições de "parado" convivendo no banco. Foi
unificado. Tabela paralela recria a doença em uma semana.

### 2.1 A régua do relógio

`COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)` — o toque MAIS RECENTE.
**Limite honesto:** `transicionar_lead` grava `ultima_interacao = now()` em toda mudança de
status. Mede _movimento no sistema_, não _contato com cliente_. A UI rotula "sem movimento".

## 3. O que está no ar e você não pode quebrar

### 3.1 A SLA de 15 minutos — ESTÁ RODANDO

`redistribuir_sla_webhook()` é chamada de dentro de `processar_distribuicao_automatica()`
(`20260904102000_sdr_motor.sql:1594`), agendada como `distribuicao-auto`, `*/5 * * * *`.
**Não existe job com o nome dela — e isso já enganou duas análises.**

Só age em `status='aguardando_atendimento' AND via_webhook`, teto de 2 saltos, horário
comercial. **Cobre o PRIMEIRO CONTATO.** Não mexa, e não escreva nada que dispute o mesmo lead.

### 3.2 Guardas que continuam valendo

`mcp_g1_delete`, `mcp_g2_update`, `mcp_g4_audit`, teto diário de perdidos,
`trg_proteger_fechamento_sem_venda_aprovada`, `transicao_lead_permitida`. O motor trabalha
DENTRO delas. Nada de `UPDATE leads SET status` direto.

### 3.3 Jobs que já mexem em `leads` sozinhos

| Job                              | Cron (UTC) | Efeito                                                    |
| -------------------------------- | ---------- | --------------------------------------------------------- |
| `distribuicao-auto`              | `*/5`      | distribui + SLA + redistribui parados                     |
| `distribuir-estoque-plantao`     | `*/10`     | `aguardando_corretor` → `aguardando_atendimento`, lote 30 |
| `recalc-temperatura`             | `*/10`     | reescreve `temperatura`                                   |
| `alertar-leads-parados`          | `0 11`     | alerta (já unificado com `higiene_config`)                |
| `sdr-alimentar-perdidos`         | `0 11`     | recicla `perdido`, `LIMIT 100`                            |
| `followup-devolver-vencidos`     | `15 12`    | devolve                                                   |
| `sdr-devolver-parados`           | `30 12`    | devolve                                                   |
| `arquivar-leads-sem-contato-30d` | `0 6`      | **stub `RETURN 0`** desde 17/07                           |

Agende o motor longe de todos. Sugestão: `0 4 * * *`.

### 3.4 Armadilhas

- **`public.alertas` NÃO tem coluna `lead_id`.** O uuid do lead vai em **`ref_id`**.
- **`lead_status` tem 14 valores**, incluindo `qualificacao_corretor` e `aguardando_corretor`.
- **Numeração de migration:** o arquivo novo precisa ser MAIOR que todos os já aplicados no
  remoto, ou o runner recusa o lote inteiro e a migration nunca roda — com o CI verde.

## 4. Números medidos (12/09/2026 — reconfirme)

```
vivos                55.435
parados (5+ dias)    32.627   (58,9%)
  abandono real      18.982   ← único universo que o motor pode perder
  lote + virgem      12.714
  lote, tocado          927
  virgem, sem lote        4   ← a trava de nunca_tocado protege SÓ isto
fila de ação          1.230   (2 em lote)
```

`analise_credito`: 124 parados de 134 — **92,5%** — numa fase que converte 39,1% para venda.

**A leitura que define o desenho:** escrita em lote é **42% do denominador** e **0,16% da
fila**. O motor age sobre o denominador, ou seja, exatamente onde o dado é sujo.

## 5. Tarefa zero — só leitura. Pare e me relate.

Boa parte já foi feita (ver `docs/ops/higiene-diagnostico-2026-09.md`). Falta:

1. **O movimento noturno não explicado.** 90 leads saíram de "lote + nunca tocado" para
   "tocado" entre 00:37 e 01:05 de 12/09. As esteiras conhecidas não gravam
   `ultima_interacao`/`ultimo_contato` diretamente. **Resolva antes de o motor sair da sombra.**

```sql
SELECT e.tipo, e.agente, e.payload->>'gatilho' AS gatilho, count(*),
       min(e.created_at), max(e.created_at)
  FROM public.lead_eventos e
 WHERE e.created_at > now() - interval '3 days'
   AND e.created_at::time BETWEEN '00:00' AND '05:00'
 GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 20;
```

2. **Reconfirme a partição do §4** e os blocos perto do limiar (consultas em
   `docs/ops/higiene-diagnostico-2026-09.md` §5).

## 6. As travas inegociáveis

### 6.1 `aguardando_atendimento` é PROIBIDO

A SLA de 15 min é dona. Garanta por `CHECK`, não por disciplina:

```sql
ALTER TABLE public.higiene_regra_fase
  ADD CONSTRAINT higiene_regra_fase_nao_disputa_sla
  CHECK (status <> 'aguardando_atendimento'::public.lead_status);
```

### 6.2 `escrita_em_lote` nunca vira perdido — com detecção GLOBAL

13.641 leads têm relógio de importação. **Mas atenção:** `v_higiene_base` calcula a janela
DEPOIS do filtro de vivo. Conforme o bloco encolhe e cruza 50 para baixo, todos os
remanescentes perdem a proteção de uma vez. Blocos de 58 e 56 leads (11/09) estão a 8 e 6
leads disso.

**O motor usa detecção sobre a tabela inteira**, e registra as DUAS leituras no log:

```sql
WITH lotes_globais AS (
  SELECT date_trunc('second',
           COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)) AS instante
    FROM public.leads
   WHERE deleted_at IS NULL          -- SEM o filtro de vivo
   GROUP BY 1
  HAVING count(*) >= (SELECT lote_min_leads FROM public.higiene_config WHERE id)
)
```

### 6.3 `nunca_tocado` nunca vira perdido

Protege só 4 leads sozinha (99,97% dos nunca-tocados também são lote), mas é conceitualmente
distinta: perder lead que ninguém atendeu esconde falha de distribuição. Ação permitida:
`devolver_roleta` ou `alertar`.

### 6.4 `analise_credito` não aceita `dias_perda`

Converte 39,1% e está 92,5% parada. Ali o problema é cobrança, não descarte.

```sql
ALTER TABLE public.higiene_regra_fase
  ADD CONSTRAINT higiene_credito_nao_perde
  CHECK (status <> 'analise_credito'::public.lead_status OR dias_perda IS NULL);
```

### 6.5 Sombra é o default; teto e desfazer são obrigatórios

`modo IN ('sombra','ativo_parcial','ativo')` começando em `'sombra'`. Em sombra o motor **só
escreve log** — nenhum `UPDATE` em `leads`. Mais `teto_perdidos_dia` e
`higiene_desfazer_lote(uuid)` idempotente.

### 6.6 O log carimba a CONFIG usada

`lote_min_leads = 50` é o que protege 13.641 leads. Um `UPDATE` os torna elegíveis
instantaneamente, sem rastro. Toda linha de log grava `cfg_modo`, `cfg_dias_parado_min`,
`cfg_lote_min_leads`, `cfg_teto_perdidos_dia`.

### 6.7 Ressurreições do SDR aparecem como tal

`alimentar_base_sdr_perdidos` traz 100 `perdido`/dia de volta ao funil. Não há disputa (caem
na fase proibida pela 6.1), mas o log marca `motivo_pulo='ressurreicao_sdr'` quando
`corretor_anterior_id IS NOT NULL AND sdr_id IS NOT NULL`, e a Simulação mostra
"N avaliados vieram do SDR de reativação". Sem isso, o gestor vê o número parado não cair e
não entende por quê.

## 7. Camada de dados

```sql
ALTER TABLE public.higiene_config
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'sombra'
    CHECK (modo IN ('sombra','ativo_parcial','ativo')),
  ADD COLUMN IF NOT EXISTS roleta_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teto_perdidos_dia integer NOT NULL DEFAULT 200
    CHECK (teto_perdidos_dia BETWEEN 0 AND 5000),
  ADD COLUMN IF NOT EXISTS lote_max integer NOT NULL DEFAULT 500
    CHECK (lote_max BETWEEN 1 AND 5000);

ALTER TABLE public.higiene_regra_fase
  ADD COLUMN IF NOT EXISTS dias_perda integer
    CHECK (dias_perda IS NULL OR dias_perda BETWEEN 1 AND 365),
  ADD COLUMN IF NOT EXISTS acao_automatica text NOT NULL DEFAULT 'nenhuma'
    CHECK (acao_automatica IN ('nenhuma','alertar','devolver_roleta','perdido'));

GRANT UPDATE (modo, roleta_ativa, teto_perdidos_dia, lote_max) ON public.higiene_config TO authenticated;
GRANT UPDATE (dias_perda, acao_automatica) ON public.higiene_regra_fase TO authenticated;

CREATE TABLE IF NOT EXISTS public.higiene_execucao_log (
  id            bigserial PRIMARY KEY,
  execucao_id   uuid NOT NULL,
  ts            timestamptz NOT NULL DEFAULT now(),
  lead_id       uuid NOT NULL,
  corretor_id   uuid,
  status_antes  public.lead_status NOT NULL,
  acao          text NOT NULL,
  dias_parado   integer NOT NULL,
  -- Por que o motor NÃO agiu. Sem isto, "0 aplicados" é indistinguível de
  -- "motor quebrado" — a falha silenciosa que este projeto existe para evitar.
  motivo_pulo   text,
  nunca_tocado  boolean NOT NULL,
  escrita_lote  boolean NOT NULL,   -- leitura da view (conjunto vivo)
  escrita_lote_global boolean NOT NULL,  -- leitura global (ver 6.2)
  cfg_modo              text,
  cfg_dias_parado_min   integer,
  cfg_lote_min_leads    integer,
  cfg_teto_perdidos_dia integer,
  aplicado      boolean NOT NULL DEFAULT false,
  erro          text,
  desfeito_em   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_hig_log_execucao ON public.higiene_execucao_log (execucao_id);
CREATE INDEX IF NOT EXISTS idx_hig_log_lead     ON public.higiene_execucao_log (lead_id);
ALTER TABLE public.higiene_execucao_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY higiene_log_select_gestao ON public.higiene_execucao_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR public.has_role(auth.uid(), 'superintendente'::public.app_role));
GRANT SELECT ON public.higiene_execucao_log TO authenticated;
```

E `v_higiene_motor_status` (heartbeat): modo, última execução, `motor_atrasado` (> 26h),
total/aplicados/pulados/erros. ⚠️ **`motor_atrasado` tem que ser `true` quando NUNCA rodou.**
Se a subquery não devolver linha, a view devolve zero linhas e a tela carrega para sempre.
Diga como tratou.

## 8. `higiene_processar()`

```
1. execucao_id := gen_random_uuid(); lê config; conta perdidos de hoje.
2. SELECT de v_higiene_base JOIN higiene_regra_fase (ativa, acao_automatica <> 'nenhuma')
     WHERE parado AND dias_parado >= COALESCE(dias_perda, dias_parado_min)
     ORDER BY dias_parado DESC LIMIT lote_max
     FOR UPDATE SKIP LOCKED   (em public.leads, não na view)
3. Para CADA lead GRAVA NO LOG SEMPRE, inclusive ao pular, com motivo_pulo:
     escrita_lote OU escrita_lote_global -> 'escrita_em_lote'
     nunca_tocado + acao 'perdido'       -> 'nunca_tocado' (rebaixa para alertar)
     modo='sombra'                       -> 'modo_sombra'
     modo='ativo_parcial'                -> pula 'perdido' e 'devolver_roleta'
     teto batido                         -> 'teto_diario'
     transição não permitida             -> 'transicao_bloqueada'
     ressurreição do SDR                 -> 'ressurreicao_sdr'
4. Aplicando, use as RPCs existentes: mcp_marcar_perdido, a RPC da roleta, INSERT em
   alertas (ref_id, NUNCA lead_id). NUNCA UPDATE direto em leads.status.
5. Erro em um lead não derruba o lote: captura em `erro` e segue.
6. RETURNS jsonb {execucao_id, total, aplicados, pulados, erros}.
```

```sql
REVOKE ALL ON FUNCTION public.higiene_processar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.higiene_processar() TO service_role;
SELECT cron.schedule('higiene-processar', '0 4 * * *', $$ SELECT public.higiene_processar(); $$);
```

## 9. A tela (estender `/higiene-funil`, não criar outra)

**Cabeçalho do motor:** badge do modo, seletor (só admin), resumo da última execução. Se
`motor_atrasado`, card **vermelho**: "O motor não roda desde X. Os números abaixo estão
velhos." Se `isError`, `QueryErrorState` — nunca card vazio.

**Aba Simulação:** `higiene_execucao_log` da última execução, filtro por `acao`,
`motivo_pulo` e corretor, **coluna `motivo_pulo` visível por padrão**, export CSV, e botão
**Desfazer** que exige digitar o `execucao_id`.

**Aba Regras:** `dias_perda`, `acao_automatica`, `ativa` inline. `analise_credito` com
`dias_perda` desabilitado e o porquê na tela. Mudar prazo mostra o impacto ANTES de salvar
(RPC de simulação, não `UPDATE` no escuro).

## 10. Critério de aceite que vale mais que todos

> **Nenhuma mudança pode transformar uma falha ruidosa em falha silenciosa.**

1. **Motor parado não pode parecer "nada a fazer".** > 26h sem execução → cabeçalho vermelho.
2. **"0 aplicados" tem que ser explicável** — daí `motivo_pulo` obrigatório.
3. **Erro de leitura nunca vira lista vazia.**

Para cada ponto que tocar: qual sinal existe hoje quando falha, qual existirá depois, e por
que o novo não é mais fraco.

## 11. Testes (`tests/db/higiene-motor.test.ts`)

1. `modo='sombra'` → nenhum status muda, log tem `motivo_pulo='modo_sombra'`.
2. `escrita_em_lote` → nunca `aplicado=true` com `acao='perdido'`.
3. **Bloco que encolhe abaixo do limiar continua protegido pela detecção global.**
4. `nunca_tocado` + regra `'perdido'` → rebaixa para alertar.
5. `CHECK` de `aguardando_atendimento` → `INSERT` falha com `23514`.
6. `CHECK` de `analise_credito` + `dias_perda` → falha com `23514`.
7. Teto batido → `motivo_pulo='teto_diario'`.
8. `higiene_desfazer_lote` devolve o status anterior e é idempotente.
9. Erro em um lead não impede os outros do lote.
10. `motor_atrasado = true` com log vazio.
11. Config carimbada no log bate com `higiene_config` no momento da execução.

⚠️ `limparDados()` (`tests/db/helpers.ts`) **não conhece as tabelas de higiene** — resete
`higiene_regra_fase` e `higiene_config` no `beforeEach`, ou o teste que desativa uma fase
vaza estado. Já aconteceu na Fatia 1.

**Sugestão:** um teste que afirme que `higiene_processar` é alcançável a partir de um job
agendado. A casa já faz asserção parecida (`pg_get_functiondef` em `20260826121000:960`), e
esta sessão errou duas vezes por confiar em nome de job.

## 12. Ordem de trabalho — pare para eu aprovar entre uma e outra

- **2b** — migrations de config + log + `higiene_processar()` em SOMBRA + heartbeat + cron +
  aposentadoria do `arquivar_leads_sem_contato_30d` (desagendar + renomear `_deprecated_`).
  **Zero efeito em `leads`.**
- **2c** — cabeçalho do motor + aba Simulação.
- **2d** — `ativo_parcial`, só após **uma semana** de sombra com número que convença. Com
  `abandono_real = 18.982` e teto de 200/dia são ~95 dias para a fila inteira. **Essa
  lentidão é o recurso, não o problema.**

## 13. Entrega

Migrations reversíveis, uma por assunto. Feature flag em `app_flags`. **Rollback escrito: o
comando exato**, não "reverter o commit". Para cada fatia: o que mediu, o que mudou, como
provar, o que falta. Documente em `docs/ops/`, no molde de `higiene-funil-fatia1.md`.

## 14. Fora de escopo (não toque)

A SLA de 15 minutos · a roleta e a distribuição · o prompt do Marquinhos e demais agentes ·
a régua de follow-up · a máquina de documentos · qualquer coisa de WhatsApp, Z-API ou Cloud
API. Se achar que um deles é causa raiz, **me diga, não conserte.**
