# PROMPT PARA O LOVABLE — Correções de distribuição de leads + UI

> Cole o bloco abaixo (a partir de "CONTEXTO") no Lovable do projeto
> **seumetroquadrado-crm**. Antes de colar, revise o bloco **CONFIG** e ajuste os
> valores se quiser. **Teste no preview e revise o diff antes de publicar** — isto
> altera a distribuição de leads em produção.

---

## CONTEXTO

Você vai corrigir bugs no subsistema de **distribuição de leads (roleta)** do CRM
SMQ. Hoje a distribuição é feita por **dois motores** que leem colunas diferentes e
não conversam, o que causa comportamentos errados. Aplique TODAS as correções
abaixo, em SQL (RPCs/migrations idempotentes) e na UI (React/TanStack Start).

**Objetos reais envolvidos (não invente outros nomes):**
- Tabelas: `profiles` (corretores: `ativo`, `presente`, `presente_em`, `cargo`,
  `last_lead_assigned_at`), `user_roles` (`role ∈ admin|gestor|corretor|superintendente`),
  `fila_distribuicao` (`ativo`, `max_leads_dia`, `leads_recebidos_hoje`, `posicao`,
  `posicao_facebook`, `ultima_distribuicao`), `leads` (`corretor_id`, `status`,
  `origem`, `data_distribuicao`, `via_webhook`), `distribution_log`.
- RPCs: `distribuir_lead_webhook()`, `gestor_fallback_webhook()`, `distribuir_lead()`,
  `corretor_elegivel()`, `processar_distribuicao_automatica()`,
  `redistribuir_sla_webhook()`, `produtividade_corretores()`, `marcar_presenca`.
- Rota: `src/routes/api/public/webhooks/lead/$token.ts`.
- Telas: `src/routes/_authenticated/distribuicao.tsx`,
  `src/routes/_authenticated/corretores.tsx`,
  `src/routes/_authenticated/meu-perfil.tsx`, `src/lib/leads.ts`.

## CONFIG (ajuste antes de aplicar)

- `MODO_PRESENCA = "preferencia"`  → presentes têm prioridade; se **ninguém** estiver
  presente, distribui para corretores ativos (nunca trava). Alternativa:
  `"obrigatoria"` (só quem marcou "Cheguei" recebe; fora do plantão vai pro gestor).
- `MANTER_REGRA_90 = true`  → mantém a trava de produtividade (≥90% da carteira
  trabalhada) **só** no motor interno (Facebook/cron). O webhook continua sem 90%.
- `TETO_UNICO = "fila_distribuicao.max_leads_dia"`  → passa a valer também no webhook.
- `GESTOR_PODE_MARCAR_PRESENCA = true`  → o gestor pode ligar/desligar o plantão de
  um corretor pela tela de gestão.

## REGRAS INVIOLÁVEIS

1. **NÃO altere o contrato do webhook** `POST /api/public/webhooks/lead/:token`: a
   resposta DEVE continuar com `ok, projeto, lead_id, corretor_id, corretor_nome,
   corretor_telefone, corretor_email, distributed, motivo` (e o shape de duplicado
   `{ ok, duplicate, projeto, lead_id }`). Pode ADICIONAR campos, nunca renomear/remover.
2. **Bots/admin/gestor nunca entram na roleta normal.** Use `role='corretor'` e exclua
   `nome='docs-bot'`. O gestor só pode receber pelo **fallback** existente
   (`gestor_fallback_webhook`), que permanece como rede de segurança.
3. **LGPD:** nenhum alerta/log ao corretor deve conter o telefone do cliente.
4. Todo SQL deve ser **idempotente** (`CREATE OR REPLACE FUNCTION`,
   `ADD COLUMN IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`).
5. **Não** mude a base de conhecimento nem status canônicos de lead existentes (só
   ADICIONE `aguardando_corretor` na tipagem do front — item UI-1).
6. Preserve o status canônico: leads distribuídos ficam `aguardando_atendimento`;
   fallback do gestor fica `aguardando_corretor`.

---

## PARTE 1 — CORREÇÕES DE DISTRIBUIÇÃO (SQL)

### DIST-1 — Elegibilidade unificada (uma fonte de verdade)

Hoje o motor webhook lê `profiles.ativo`/`presente` e o motor interno lê
`fila_distribuicao.ativo`/cota/90% — regras divergentes. Unifique o conceito de
"corretor elegível" para **ambos**:

Um corretor é elegível quando **todas** valem:
- tem `role='corretor'` em `user_roles` (exclui admin/gestor/superintendente);
- `lower(nome) <> 'docs-bot'`;
- `profiles.ativo = true`;
- está em `fila_distribuicao` com `fila_distribuicao.ativo = true`;
- `fila_distribuicao.leads_recebidos_hoje < fila_distribuicao.max_leads_dia` (teto único);
- (apenas no canal interno, se `MANTER_REGRA_90`) ≥90% da carteira ativa fora de
  `aguardando_atendimento` — a mesma regra de `corretor_elegivel` atual.

A **presença** NÃO entra como filtro rígido aqui — ela é tratada como prioridade na
seleção (DIST-2), para não recriar o problema antigo de "ninguém marca presença → nada
distribui".

### DIST-2 — Roleta do webhook: prioriza presentes, aplica teto, nunca ignora presença

Reescreva `distribuir_lead_webhook()` para selecionar em **camadas** (respeitando
`MODO_PRESENCA`) e **contabilizar a cota** (hoje o webhook não conta). Referência:

```sql
CREATE OR REPLACE FUNCTION public.distribuir_lead_webhook()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  -- Camada 1: PRESENTES elegíveis (rodízio justo por last_lead_assigned_at)
  SELECT p.id INTO _cid
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
  JOIN public.fila_distribuicao fd ON fd.corretor_id = p.id
  WHERE p.ativo AND fd.ativo
    AND p.telefone IS NOT NULL AND btrim(p.telefone) <> ''
    AND lower(coalesce(p.nome,'')) <> 'docs-bot'
    AND fd.leads_recebidos_hoje < fd.max_leads_dia
    AND p.presente = true AND p.presente_em IS NOT NULL
    AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date
          = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY p.last_lead_assigned_at NULLS FIRST, p.created_at ASC
  FOR UPDATE SKIP LOCKED LIMIT 1;

  -- Camada 2 (só se MODO_PRESENCA='preferencia'): ninguém presente → ativos elegíveis
  IF _cid IS NULL /* AND MODO_PRESENCA = 'preferencia' */ THEN
    SELECT p.id INTO _cid
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
    JOIN public.fila_distribuicao fd ON fd.corretor_id = p.id
    WHERE p.ativo AND fd.ativo
      AND p.telefone IS NOT NULL AND btrim(p.telefone) <> ''
      AND lower(coalesce(p.nome,'')) <> 'docs-bot'
      AND fd.leads_recebidos_hoje < fd.max_leads_dia
    ORDER BY p.last_lead_assigned_at NULLS FIRST, p.created_at ASC
    FOR UPDATE SKIP LOCKED LIMIT 1;
  END IF;

  IF _cid IS NULL THEN RETURN NULL; END IF;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _cid;
  UPDATE public.fila_distribuicao
     SET leads_recebidos_hoje = leads_recebidos_hoje + 1, ultima_distribuicao = now()
   WHERE corretor_id = _cid;
  RETURN _cid;
END; $$;
```

> Se `MODO_PRESENCA = "obrigatoria"`, **remova a Camada 2** (aí, sem presentes, a rota
> cai no `gestor_fallback_webhook` como já faz hoje).

O `gestor_fallback_webhook()` e a chamada em `$token.ts:178-189` **permanecem iguais**
(rede de segurança quando não há corretor).

### DIST-3 — Motor interno: exige corretor de verdade e prioriza presentes

Ajuste `distribuir_lead()` (e/ou `corretor_elegivel()`) para:
- **Excluir admin/gestor/docs-bot**: adicione `JOIN user_roles ur ON ur.user_id =
  fila.corretor_id AND ur.role='corretor'` e `nome <> 'docs-bot'` na seleção (hoje ele
  confia só na participação na fila — por isso conta não-corretor recebe).
- **Priorizar presentes** (mesma lógica de camadas do DIST-2): na ordenação, presentes
  primeiro; se ninguém presente, cai para ativos. Mantenha a ordenação secundária atual
  (`posicao`, ou `COALESCE(posicao_facebook, posicao)` para origem `facebook`).
- **Manter** a trava dos 90% e a cota `max_leads_dia` (se `MANTER_REGRA_90`).

Isso corrige "presente é ignorado" sem recriar o travamento antigo.

### DIST-4 — Higiene da fila

Garanta (via SQL de manutenção, idempotente) que **nenhum admin/gestor/superintendente
e nenhum `docs-bot`** esteja em `fila_distribuicao` — remova-os da fila se estiverem.
Corretores continuam. (Não apaga contas; só tira da roleta.)

---

## PARTE 2 — CORREÇÕES DE UI

### UI-1 — Status `aguardando_corretor` no front (bug do "sem corretor")

Em `src/lib/leads.ts`: adicione `"aguardando_corretor"` ao tipo `LeadStatus`, com
rótulo em `LEAD_STATUS_LABEL` = **"Aguardando corretor"** e uma cor (`Hue`) disponível
e distinta em `LEAD_STATUS_HUE` (ex.: um tom ainda não usado, como `sky` ou `fuchsia`).
**Não** o inclua em `LEAD_STATUS_ORDER` (é um estado de pré-atribuição, como `novo`).
Garanta que os leads nesse status apareçam com o badge correto em lista/kanban/detalhe,
e não mais como "(sem corretor)".

### UI-2 — Deixar claras as 3 flags (fim da confusão do gestor)

Hoje há três liga/desliga diferentes que parecem o mesmo botão. Rotule cada um de forma
inequívoca:
- Tela **Corretores** (`corretores.tsx`, escreve `profiles.ativo`): rótulo **"Conta
  ativa"** (com tooltip: "bloqueia o login/uso; não é a roleta").
- Tela **Distribuição** (`distribuicao.tsx`, switch que escreve `fila_distribuicao.ativo`):
  rótulo **"Na roleta"** (tooltip: "participa da distribuição automática").
- **Plantão/presença** (`profiles.presente`): mostre o estado **"Presente hoje"** de cada
  corretor na tela de Distribuição, ao lado da fila.

### UI-3 — Gestor pode marcar presença (se `GESTOR_PODE_MARCAR_PRESENCA`)

Hoje só o próprio corretor marca "Cheguei" (`meu-perfil.tsx` → `marcar_presenca`, self).
Crie um RPC `marcar_presenca_admin(_corretor_id uuid, _presente boolean)`
(`SECURITY DEFINER`, restrito a `admin`/`gestor` via `has_role`) que seta
`profiles.presente` e `presente_em` (usar `now()` quando ligar) para outro corretor. Na
tela de Distribuição, adicione um toggle **"Presente hoje"** por linha que chame esse RPC.

### UI-4 — "Próximo da vez" e ranking transparentes

Na tela de Distribuição (`distribuicao.tsx`):
- Exiba a coluna **"Última atribuição"** usando `profiles.last_lead_assigned_at` (o cursor
  real do webhook), além da `fila_distribuicao.ultima_distribuicao` que já aparece.
- Adicione um indicador **"Próximo da vez"**: o 1º corretor **presente e elegível** por
  `last_lead_assigned_at` (webhook) e o 1º por `posicao` (interno). Assim a ordem deixa de
  ser opaca.
- O card **"Últimas distribuições"** (feed de `distribution_log`) já existe — mantenha.

---

## PARTE 3 — DADOS ÓRFÃOS (opcional, seguro)

Sem apagar nada: garanta que leads em `aguardando_corretor` e leads `novo`/
`aguardando_atendimento` **sem corretor** apareçam num filtro/aba "Sem corretor" na tela
de leads, para o gestor redistribuir manualmente. Reaproveite o alerta existente
`gerar_alertas_leads_parados` (não altere a regra LGPD dele).

---

## CRITÉRIOS DE ACEITE (verifique antes de publicar)

- [ ] Um corretor com `presente=false` **não** recebe lead novo enquanto houver algum
      corretor presente e elegível (webhook e interno).
- [ ] Nenhum admin/gestor/superintendente e nenhum `docs-bot` recebe pela roleta normal
      (só o gestor, e só pelo fallback).
- [ ] O teto diário (`max_leads_dia`) é respeitado **também** no webhook.
- [ ] Marcar "Conta ativa", "Na roleta" e "Presente hoje" têm efeitos distintos e
      previsíveis; o gestor consegue marcar presença de um corretor.
- [ ] Leads de fallback aparecem como "Aguardando corretor" (não "sem corretor").
- [ ] A resposta do webhook mantém exatamente os campos `ok, lead_id, corretor_id,
      distributed, motivo`.
- [ ] Com **ninguém** presente, a distribuição **não trava** (cai para ativos se
      `MODO_PRESENCA='preferencia'`, ou para o gestor se `'obrigatoria'`).

## NÃO FAÇA

- Não remova/renomeie campos do contrato do webhook.
- Não coloque telefone do cliente em alertas/logs ao corretor.
- Não reintroduza presença como filtro rígido no motor interno sem a camada de fallback
  (isso já travou a distribuição antes).
- Não mexa em `02-BASE-CONHECIMENTO`/`knowledge.js` nem nos status canônicos existentes.
