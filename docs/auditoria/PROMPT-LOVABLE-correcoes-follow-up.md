# PROMPT PARA O LOVABLE — Correções de Follow-up (P0 + P1)

> Cole o bloco a partir de "CONTEXTO" no Lovable do projeto **seumetroquadrado-crm**.
> Revise o bloco **CONFIG** antes. **Teste no preview e revise o diff antes de
> publicar** — mexe em triggers de banco e em várias telas. Não inclui a cadência
> multi-toque (P2) — isso fica para um segundo passo.

---

## CONTEXTO

Você vai corrigir bugs do subsistema de **follow-up** do CRM SMQ para o corretor
fazer follow-up assertivo e sem erros. Hoje o "próximo follow-up" vive em dois
lugares que não conversam (`tarefas.data_vencimento` e `leads.proximo_followup`),
há perda silenciosa e tarefas duplicadas/orfãs. **Decisão já tomada:** a **tarefa é
a única fonte de verdade**; `leads.proximo_followup` vira **espelho derivado** (mantido
por trigger, read-only na UI); e o **motor de "tarefa por etapa" fica só no client**
(`src/lib/follow-up.ts`), removendo o trigger duplicado do banco.

**Objetos reais (não invente nomes):**
- Tabelas: `leads` (`status`, `proximo_followup`, `ultima_interacao`, `ultimo_contato`),
  `tarefas` (`lead_id`, `corretor_id`, `titulo`, `tipo`, `status`, `prioridade`,
  `data_vencimento`, `data_conclusao`, `origem_automatica`, `deleted_at`).
- Enums: `tarefa_status = pendente|em_andamento|concluida|cancelada`;
  `tarefa_tipo = ligacao|whatsapp|email|visita|follow_up|documentacao|outro`.
- Trigger a REMOVER: `trg_followup_em_atendimento` → `criar_followup_em_atendimento()`
  (`supabase/migrations/20260616095924_…:95-137`).
- Client: `src/lib/follow-up.ts`, `src/hooks/use-lead-status.ts`,
  `src/components/registrar-contato-dialog.tsx`,
  `src/components/lead-stage/{appointment-stage-dialog,visit-feedback-dialog,credit-analysis-dialog}.tsx`.
- Telas: `src/routes/_authenticated/{hoje,tarefas,leads.index,leads.$leadId,blitz}.tsx`,
  `src/components/leads-kanban-board.tsx`, `notification-bell.tsx`.
- Cron: `alertar-leads-parados` (`gerar_alertas_leads_parados`, hoje `0 8 * * *` UTC).

## CONFIG (ajuste antes de aplicar)

- `FONTE_VERDADE = "tarefa"` → `proximo_followup` é derivado (read-only). **[travado]**
- `MOTOR_TAREFA = "client"` → remover o trigger DB `criar_followup_em_atendimento`. **[travado]**
- `CANCELAR_NO_FECHAMENTO_TIPOS = ('follow_up','ligacao','whatsapp','email')` → tipos de
  tarefa a cancelar quando o lead vira fechado/perdido (mantém `documentacao`/`visita`).
- `ARQUIVAR_30D = "desligado"` → **não** agendar auto-arquivamento de 30 dias por ora
  (auto-marcar `perdido` é decisão de negócio). Mudar para `"ligado"` para agendar.
- `HORA_ALERTA_PARADO_BRT = 8` → alerta de "lead parado" às 08:00 BRT (hoje sai 05:00).

## REGRAS INVIOLÁVEIS

1. Todo SQL **idempotente** (`CREATE OR REPLACE`, `DROP … IF EXISTS`,
   `CREATE TRIGGER` após `DROP TRIGGER IF EXISTS`).
2. **LGPD:** não colocar telefone do cliente em alerta/log ao corretor (mantém o
   padrão atual do `gerar_alertas_leads_parados`).
3. Não quebrar o contrato da API pública de leads; `proxima_acao_em` continua alias de
   `proximo_followup` no PATCH público (`src/routes/api/public/leads/$id.ts:24`).
4. Não mexer na base de conhecimento nem nos status canônicos de lead.
5. Cuidado com recursão de trigger: o trigger de espelho escreve em
   `leads.proximo_followup` (coluna que **não** dispara o trigger de métricas, que é
   `AFTER UPDATE OF status, corretor_id`).

---

## PARTE 1 — BANCO (SQL)

### SQL-1 — `proximo_followup` vira espelho derivado (resolve F1, F2, F5)
Função + trigger em `tarefas` que recalcula `leads.proximo_followup` como a **menor
`data_vencimento` das tarefas ABERTAS** (`pendente`/`em_andamento`, não deletadas) do
lead — `null` se não houver nenhuma. Assim ele **se auto-limpa** ao concluir/adiar/cancelar.

```sql
CREATE OR REPLACE FUNCTION public.sync_proximo_followup(_lead_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.leads l
     SET proximo_followup = (
       SELECT min(t.data_vencimento)
         FROM public.tarefas t
        WHERE t.lead_id = _lead_id
          AND t.status IN ('pendente','em_andamento')
          AND t.deleted_at IS NULL
          AND t.data_vencimento IS NOT NULL
     )
   WHERE l.id = _lead_id
     AND l.proximo_followup IS DISTINCT FROM (
       SELECT min(t.data_vencimento) FROM public.tarefas t
        WHERE t.lead_id = _lead_id AND t.status IN ('pendente','em_andamento')
          AND t.deleted_at IS NULL AND t.data_vencimento IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.trg_tarefa_sync_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_proximo_followup(OLD.lead_id);
    RETURN OLD;
  END IF;
  IF NEW.lead_id IS NOT NULL THEN PERFORM public.sync_proximo_followup(NEW.lead_id); END IF;
  IF TG_OP = 'UPDATE' AND OLD.lead_id IS DISTINCT FROM NEW.lead_id AND OLD.lead_id IS NOT NULL THEN
    PERFORM public.sync_proximo_followup(OLD.lead_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tarefa_sync_followup ON public.tarefas;
CREATE TRIGGER trg_tarefa_sync_followup
AFTER INSERT OR DELETE OR UPDATE OF status, data_vencimento, deleted_at, lead_id
ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_sync_followup();
```

### SQL-2 — Cancelar follow-ups ao fechar/perder (resolve F3)
Cancela **todas** as tarefas de contato abertas (não só `origem_automatica=true`) quando
o lead vira `contrato_fechado/perdido/pos_venda`.

```sql
CREATE OR REPLACE FUNCTION public.trg_cancelar_followups_fechamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('contrato_fechado','perdido','pos_venda')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.tarefas
       SET status = 'cancelada', updated_at = now()
     WHERE lead_id = NEW.id
       AND status IN ('pendente','em_andamento')
       AND tipo IN ('follow_up','ligacao','whatsapp','email');  -- CANCELAR_NO_FECHAMENTO_TIPOS
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_leads_cancelar_followups ON public.leads;
CREATE TRIGGER trg_leads_cancelar_followups
AFTER UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_cancelar_followups_fechamento();
```

### SQL-3 — Remover o motor duplicado do banco (resolve F6)
O motor de "tarefa por etapa" fica só no client (`src/lib/follow-up.ts`). Remova o
trigger/func do banco que criava a segunda tarefa em `em_atendimento` e setava
`proximo_followup` (agora derivado por SQL-1) — o cancelamento no fechamento agora é o
SQL-2.

```sql
DROP TRIGGER IF EXISTS trg_followup_em_atendimento ON public.leads;
DROP FUNCTION IF EXISTS public.criar_followup_em_atendimento() CASCADE;
```

### SQL-4 — Corrigir o fuso do alerta de parado (resolve F12a)
Reagenda `alertar-leads-parados` para **08:00 BRT = 11:00 UTC**.

```sql
SELECT cron.unschedule('alertar-leads-parados')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertar-leads-parados');
SELECT cron.schedule('alertar-leads-parados','0 11 * * *',
       $$ SELECT public.gerar_alertas_leads_parados(); $$);  -- 11:00 UTC = 08:00 BRT
```

### SQL-5 — Backfill (rodar UMA vez, após os triggers)
Repara os dados legados.

```sql
-- (a) Recalcular proximo_followup de todo mundo a partir das tarefas abertas
UPDATE public.leads l SET proximo_followup = s.prox
FROM (SELECT lead_id, min(data_vencimento) AS prox FROM public.tarefas
      WHERE status IN ('pendente','em_andamento') AND deleted_at IS NULL
        AND data_vencimento IS NOT NULL GROUP BY lead_id) s
WHERE l.id = s.lead_id AND l.proximo_followup IS DISTINCT FROM s.prox;
UPDATE public.leads SET proximo_followup = NULL
WHERE proximo_followup IS NOT NULL
  AND id NOT IN (SELECT lead_id FROM public.tarefas
                 WHERE status IN ('pendente','em_andamento') AND deleted_at IS NULL
                   AND data_vencimento IS NOT NULL AND lead_id IS NOT NULL);

-- (b) Cancelar follow-ups abertos de leads já fechados/perdidos
UPDATE public.tarefas SET status='cancelada', updated_at=now()
WHERE status IN ('pendente','em_andamento')
  AND tipo IN ('follow_up','ligacao','whatsapp','email')
  AND lead_id IN (SELECT id FROM public.leads
                  WHERE status IN ('contrato_fechado','perdido','pos_venda'));

-- (c) Preencher data_conclusao faltante em tarefas já concluídas (resolve F4 no legado)
UPDATE public.tarefas SET data_conclusao = COALESCE(updated_at, now())
WHERE status='concluida' AND data_conclusao IS NULL;
```

---

## PARTE 2 — UI (React)

### UI-1 — `proximo_followup` só via tarefa (resolve F2/F5)
- **`bulkFollowup`** (`src/routes/_authenticated/leads.index.tsx:946-963`): parar de gravar
  `leads.proximo_followup` direto; passar a **criar uma tarefa** `tipo='follow_up'`,
  `data_vencimento` = data escolhida, por lead selecionado. (O trigger SQL-1 atualiza
  `proximo_followup`.)
- **Form "Editar dados"** (`leads.$leadId.tsx:322-324, 1209-1216`): remover o campo
  editável `proximo_followup`; exibir na aba Dados como **read-only derivado**
  (`leads.$leadId.tsx:939-947`) com texto tipo "definido pela próxima tarefa".

### UI-2 — Concluir pelo Hoje grava `data_conclusao` (resolve F4)
Em `hoje.tsx` (`concluirTarefa`, ~`:214-220`): incluir `data_conclusao: new Date().toISOString()`
no update, igual ao `tarefas.tsx:135-139`.

### UI-3 — Aba "Tarefas" do lead com Concluir/Adiar (resolve F8)
Em `leads.$leadId.tsx` (aba Tarefas, `:1058-1073`): adicionar, por linha, botão
**Concluir** (status `concluida` + `data_conclusao=now()`) e **Adiar** (1h/1d/1sem,
atualiza `data_vencimento`) — reutilizando as mutations equivalentes de `tarefas.tsx`
(`concluirMutation` `:135-148`, `snoozeMutation` `:151-165`).

### UI-4 — Atrasado mostra dias + data (resolve F9)
No card "Tarefas & follow-ups" do Hoje (`hoje.tsx:647-660`) e na aba Tarefas do lead:
para itens atrasados, mostrar **"atrasada há N dias" e a data**, não só `HH:mm`. Um item
atrasado há dias não pode parecer "vence hoje".

### UI-5 — Botão "próxima ação" no Kanban e no Blitz (resolve F10)
Levar o smart button `PROXIMA_ACAO` (de `src/lib/leads.ts`, já usado em
`leads.index.tsx:1648-1667` e `leads.$leadId.tsx:690-712`) para os cards do
**Kanban** (`src/components/leads-kanban-board.tsx`, hoje só têm o menu "⋯") e para o
**Blitz** (`blitz.tsx:397-414`).

### UI-6 — Confirmação nas ações em massa (resolve F11)
Em `leads.index.tsx`, ações em massa (follow-up, temperatura, registrar ligação) passam
por um diálogo de confirmação com a **contagem de leads afetados** antes de aplicar.

### UI-7 — Dedup de follow-up por lead+tipo+janela (resolve F7)
Em `criarFollowUpAutomatico` (`follow-up.ts:111-147`), `registrar-contato-dialog.tsx:100`
e `hoje.tsx:291`: antes de inserir, checar se já existe tarefa aberta do mesmo
`lead_id` + `tipo` com `data_vencimento` dentro de uma janela (ex.: ±1 dia) e, se
existir, **atualizar** essa em vez de criar outra. Dedup por `(lead_id, tipo, janela)`,
não por título exato.

---

## CRITÉRIOS DE ACEITE

- [ ] Concluir/adiar/cancelar uma tarefa **atualiza sozinho** `leads.proximo_followup`
      (via trigger). Ao não sobrar tarefa aberta, o campo fica **null** e o lead
      **reaparece** na rede "Sem próxima ação" do Hoje.
- [ ] Follow-up em massa e "Editar dados" **criam tarefa** (aparecem no Hoje), não um
      `proximo_followup` fantasma.
- [ ] Lead vira `contrato_fechado`/`perdido` → **some** o follow-up pendente dele.
- [ ] Entrar em `em_atendimento` cria **uma** tarefa (não duas).
- [ ] Concluir tarefa pelo Hoje conta em "Concluídas hoje" (tem `data_conclusao`).
- [ ] Dá pra concluir/adiar a tarefa **de dentro do lead**.
- [ ] Item atrasado há dias mostra "há N dias" + data, diferente de "hoje".
- [ ] `PROXIMA_ACAO` aparece no Kanban e no Blitz.
- [ ] Ação em massa pede confirmação com a contagem.
- [ ] Alerta de "lead parado" dispara **08:00 BRT**.

## NÃO FAÇA

- Não reintroduzir escrita direta de `proximo_followup` na UI (é derivado).
- Não deixar os dois motores de tarefa-por-etapa (o trigger DB foi removido de propósito).
- Não cancelar tarefas de `documentacao`/`visita` no fechamento (só os tipos de contato).
- Não colocar telefone do cliente em alertas.
- Não implementar a cadência multi-toque agora (P2, próximo passo).
