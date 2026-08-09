# Fase 7 — Mensageria WhatsApp 2 vias + Central de Mensagens (desenho)

> Documento de **desenho** (não implementa o provedor). Define o schema, os
> fluxos n8n e a UI para destravar a implementação assim que o provedor de
> WhatsApp for escolhido. O **Radar de fechamento** (parte D) já foi entregue,
> pois não depende de provedor.

## Estado atual (o que já existe)

- WhatsApp é só **link `wa.me`** (`buildWhatsAppUrl`): abre o app com a mensagem
  pré-preenchida, o corretor envia na mão, grava-se uma `interacao` (saída).
- **n8n cloud já em uso**: `copiloto-handoff` faz POST para
  `…/webhook/copiloto/handoff` (`N8N_COPILOTO_URL`) e grava em `copiloto_eventos`.
- `templates_mensagem` (templates de WhatsApp) e `interacoes` (histórico) existem.
- LGPD: colunas `opt_out`, `consentimento_lgpd` já existem em `leads`.

## A) Provedor de WhatsApp (decisão que destrava tudo)

| Opção                                   | Quando faz sentido                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Meta WhatsApp Cloud API** (oficial)   | Operação séria/escala. Exige número dedicado, verificação do Business, **aprovação de templates** e respeito à **janela de 24h** (fora dela, só template aprovado). |
| **BSP** (360dialog / Gupshup / Twilio)  | Mesmo Cloud API oficial, com onboarding mais fácil; custo por conversa.                                                                                             |
| **Evolution API / Z-API** (não-oficial) | MVP rápido, sem aprovação de template; **risco de ban** e fora dos ToS da Meta.                                                                                     |

> Recomendação: **Cloud API oficial** (direto ou via BSP) para sustentabilidade;
> Evolution/Z-API só como MVP temporário consciente do risco.

## B) Schema proposto (migration futura)

Tabela `mensagens` (conversa real, separada de `interacoes` que é timeline manual):

```sql
create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  corretor_id uuid references public.profiles(id),
  direcao text not null check (direcao in ('entrada','saida')),
  canal text not null default 'whatsapp',
  -- id da mensagem no provedor (idempotência de webhook)
  provider_message_id text unique,
  status text not null default 'enviada'
    check (status in ('fila','enviada','entregue','lida','falha','recebida')),
  conteudo text,
  midia_url text,
  template_nome text,            -- quando enviada via template aprovado
  erro text,
  criado_em timestamptz not null default now()
);
create index on public.mensagens (lead_id, criado_em desc);
-- RLS: corretor vê as do próprio lead; gestor/admin vê tudo (espelhar leads).
```

Em `leads`, derivar/!manter: `ultima_mensagem_em`, `nao_lidas` (contador) — ou
calcular na query. A `ultima_interacao` continua alimentando temperatura/score.

## C) Fluxos n8n

**Saída (CRM → cliente):**

1. CRM grava `mensagens` (status `fila`) e chama webhook n8n (igual ao
   `copiloto-handoff`, com `N8N_WHATSAPP_OUT_URL`).
2. n8n chama a API do provedor; on success grava `provider_message_id` e
   `status=enviada`; on error grava `falha`+`erro`.
3. Respeitar `opt_out`/`consentimento_lgpd` e a janela de 24h (fora dela, exigir
   `template_nome` aprovado).

**Entrada (cliente → CRM):**

1. Provedor → webhook n8n → `POST /api/public/webhooks/whatsapp/$token` (novo,
   no padrão dos webhooks já existentes em `routes/api/public/webhooks/*`).
2. Handler valida o token, faz **upsert por `provider_message_id`** (idempotência),
   insere `mensagens` (`direcao=entrada`, `status=recebida`), atualiza
   `leads.ultima_interacao` e dispara realtime (já há `use-realtime-invalidate`).
3. Status updates (entregue/lida) chegam pelo mesmo webhook e atualizam a linha.

## D) Central de Mensagens (UI) e Radar

- **Central de mensagens** (`/mensagens`): inbox unificada — lista de conversas
  (lead + última mensagem + não-lidas), thread por lead, responder inline,
  inserir template, atribuir. Lê/escreve em `mensagens` com realtime. Pode rodar
  em **modo simulado** (sem provedor) para validar a UX antes de ligar a API.
- **Radar de fechamento** (`/radar`) — ✅ **entregue**: ranqueia os leads em
  negociação por probabilidade de fechamento (`lib/fechamento.ts`), sem nenhuma
  dependência externa.

## Faseamento sugerido

- **7a** — ✅ **entregue (2026-08-09)** — migration `mensagens`
  (`20260809150000`) + `POST /api/public/webhooks/whatsapp`. Detalhes abaixo.
- **7b** — Central de mensagens lendo/escrevendo `mensagens` (modo simulado).
- **7c** — Ligar o provedor escolhido + aprovar templates + automações por etapa
  (casa com o motor anti-perda da Fase 1).
- **7d** — ✅ Radar de fechamento (já em produção).

## 7a entregue — contrato do webhook de entrada

**Endpoint:** `POST /api/public/webhooks/whatsapp` · auth por header
`x-webhook-secret` (env `WHATSAPP_WEBHOOK_SECRET`, mínimo 16 chars; sem env,
o endpoint responde 503 e nada entra). Nunca segredo em query (lição P-3).

**Payload normalizado** (o n8n traduz o formato do provedor para este —
o CRM nunca conhece payload de provedor):

```jsonc
// mensagem recebida do cliente
{ "tipo": "mensagem", "provider": "zapi",
  "provider_message_id": "ABCD1234", "telefone": "5511999998888",
  "conteudo": "Oi, ainda tem a unidade?", "midia_url": null,
  "ocorrido_em": "2026-08-09T14:03:00-03:00" }

// atualização de entrega de mensagem ENVIADA
{ "tipo": "status", "provider_message_id": "ABCD1234",
  "status": "lida" }            // enviada | entregue | lida | falha (+ erro)
```

**Comportamento:** resolve o lead por telefone
(`buscar_lead_ativo_por_telefone_global`, o mesmo dedup do webhook de leads);
grava em `mensagens` (idempotente por `provider_message_id` — replay responde
`{ok:true, duplicada:true}`); **ecoa** a entrada como `interacao`
(tipo whatsapp, direção entrada) — é o que classifica o lead na fila
**Responder** de Atender sem mudar nenhuma RPC. Lead não encontrado responde
`200 {ok:true, lead:"nao_encontrado"}` para o n8n rotear (ex.: lead-intake e
reenvio) — o CRM nunca cria lead aqui.

**Fluxo n8n de entrada (a montar no n8n cloud):**

1. Webhook do provedor (Z-API: `message-received` + `message-status`) → nó
   de normalização (Function) para o payload acima;
2. `POST` ao endpoint com o header `x-webhook-secret`;
3. Se `lead:"nao_encontrado"` → `POST` ao lead-intake (origem `whatsapp`) e
   repetir o passo 2.

**Env a criar no deploy:** `WHATSAPP_WEBHOOK_SECRET` (Cloudflare) e o mesmo
valor no nó HTTP do n8n.

## Dependências / riscos

- Conta + número de WhatsApp Business; custo recorrente por conversa.
- Aprovação de templates (Cloud API) e janela de 24h.
- LGPD: honrar `opt_out`/`consentimento_lgpd`; só iniciar conversa com
  template/consentimento.
- Idempotência de webhook (usar `provider_message_id`) para não duplicar.
