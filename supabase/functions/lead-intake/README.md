# lead-intake — Facebook Lead Ads → Zapier → CRM

Recebe leads do **Facebook ADS** via Zapier, cria o lead (`origem=facebook`,
`canal_entrada=edge_facebook`) **com o projeto correto**, distribui pela
**Roleta Plantão** (distribuição v3 — `triar_e_distribuir_lead`) e **notifica o
corretor no WhatsApp (Z-API)** — sem expor o telefone do lead.

## Secrets (Cloud → Secrets)

| Secret | Obrigatório | Para quê |
| --- | --- | --- |
| `LEAD_INTAKE_SECRET` | sim | senha do webhook (header `x-webhook-secret`) |
| `ZAPI_INSTANCE_ID` | p/ notificar | ID da instância Z-API |
| `ZAPI_TOKEN` | p/ notificar | token da instância Z-API |
| `ZAPI_CLIENT_TOKEN` | se exigido | "Client-Token" de segurança da conta Z-API |
| `APP_BASE_URL` | p/ o link | URL pública do app, ex.: `https://app.seumetroquadrado.com` |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente. Sem as
variáveis do Z-API, o lead é criado/distribuído normalmente e a notificação é apenas
pulada (log).

## Deploy / redeploy (Lovable Cloud)

O Lovable Cloud **não** deploya por commit no GitHub — peça no chat do Lovable:
> Faça o **redeploy** da Edge Function `lead-intake` (arquivo `supabase/functions/lead-intake/index.ts`). Não reescreva a lógica. Mantenha `verify_jwt = false`.

URL de invoke: `https://<PROJECT_REF>.supabase.co/functions/v1/lead-intake`

## Zapier (1 Zap por formulário/projeto)

1. **Trigger:** *Facebook Lead Ads* → **New Lead** (a Página + o Formulário do projeto).
2. **Action:** *Webhooks by Zapier* → **POST**:
   - **URL:** a URL de invoke.
   - **Payload Type:** `json`.
   - **Headers:** `x-webhook-secret` = `LEAD_INTAKE_SECRET` · `Content-Type` = `application/json`.
   - **Data:**

     | Campo | Origem / valor |
     | --- | --- |
     | `full_name` | Full Name (ou `first_name`/`last_name`) |
     | `phone_number` | Phone Number |
     | `email` | Email |
     | `renda` | a pergunta de renda do formulário (vira "faixa de renda") |
     | **`projeto`** | **fixo neste Zap** = o `slug` (ou nome) do projeto no CRM |
     | `campaign_name`, `ad_name`, `adset_name`, `form_name` | do Facebook |

> **Projeto correto por Zap:** cada Zap manda `projeto` com um valor **fixo** (o `slug`
> do projeto, visto em Empreendimentos no CRM). A função resolve para `projeto_id` +
> `projeto_nome`. Alternativa: mandar `projeto_token` = o `webhook_token` do projeto.
> Se não casar com nenhum projeto, o texto vai para `projeto_nome` (nada se perde).

## Comportamento

- **Dedup por telefone no projeto** (`buscar_lead_duplicado`); duplicata retorna
  `deduplicado: true` sem criar lead novo.
- **Roleta Plantão** (`triar_e_distribuir_lead`, distribuição v3): rodízio
  "há mais tempo sem receber" entre corretores **presentes no plantão**, dentro
  da **cota diária**, não pausados e com **% de leads trabalhados ≥ mínimo**
  (padrão 90%). Sem corretor apto → o lead entra na **fila de exceções** com
  alerta ao gestor e o cron re-tenta a cada minuto. Toda decisão fica auditada
  em `distribution_log` + `distribuicao_log_contexto`.
- **Notificação ao corretor** (só quando há corretor atribuído): WhatsApp via Z-API com
  **nome, projeto, faixa de renda e link** `APP_BASE_URL/leads/<id>`. **Sem o telefone do lead.**

## Respostas

| Status | Significado |
| --- | --- |
| 200 | `{ ok, lead_id, projeto_id, corretor_id, distribuido }` |
| 401 | secret ausente/incorreto |
| 422 | faltou `nome` e `telefone` |
| 400 | JSON inválido |

## Teste (curl)

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/lead-intake" \
  -H "x-webhook-secret: <LEAD_INTAKE_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Lead Teste","phone_number":"+55 51 99999-0000","email":"t@ex.com","renda":"R$ 3.000 a R$ 5.000","projeto":"slug-do-projeto","campaign_name":"Campanha X"}'
```
