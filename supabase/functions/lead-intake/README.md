# lead-intake — Facebook Lead Ads → Zapier → CRM

Recebe leads do **formulário do Facebook ADS** via Zapier e cria o lead no CRM
(`origem = facebook`), distribuindo automaticamente pela roleta de elegibilidade.

## 1. Deploy

O Lovable faz deploy das Edge Functions ao sincronizar a `main`. Manualmente:

```bash
supabase functions deploy lead-intake
```

URL da função:

```
https://<PROJECT_REF>.supabase.co/functions/v1/lead-intake
```

`PROJECT_REF` é o `project_id` em `supabase/config.toml`.

## 2. Secret (obrigatório)

Defina um segredo compartilhado com o Zapier (qualquer string forte):

```bash
supabase secrets set LEAD_INTAKE_SECRET="cole-um-segredo-forte-aqui"
```

ou em **Supabase → Edge Functions → Manage secrets**. `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` já são injetadas automaticamente.

> `verify_jwt = false` está em `supabase/config.toml` — a autenticação é o secret,
> não um JWT do Supabase. Se o deploy não respeitar o config, marque "Verify JWT =
> off" para esta função no painel do Supabase.

## 3. Zapier

1. **Trigger:** *Facebook Lead Ads* → **New Lead** (escolha a Página e o Formulário).
2. **Action:** *Webhooks by Zapier* → **POST**.
   - **URL:** a URL da função (acima).
   - **Payload Type:** `json`.
   - **Headers:**
     - `x-webhook-secret`: o valor de `LEAD_INTAKE_SECRET`.
     - `Content-Type`: `application/json`.
   - **Data (mapeie os campos do Facebook):**

     | Campo enviado     | Origem no Facebook Lead Ads        |
     | ----------------- | ---------------------------------- |
     | `full_name`       | Full Name (ou `first_name`/`last_name`) |
     | `phone_number`    | Phone Number                       |
     | `email`           | Email                              |
     | `campaign_name`   | Campaign Name                      |
     | `adset_name`      | Ad Set Name                        |
     | `ad_name`         | Ad Name                            |
     | `form_name`       | Form Name                          |

3. **Test** — deve retornar `{ "ok": true, "lead_id": "...", "distribuido": true|false }`
   e o lead aparece em **Leads** já atribuído a um corretor (se houver elegível).

## Comportamento

- **Sempre cria um lead novo** (duplicatas tratadas depois na tela *Duplicatas*).
- **Auto-distribui** via `distribuir_lead_elegivel` (mesma roleta da tela de
  Distribuição). Sem corretor elegível na fila, o lead fica `novo` e entra no fluxo
  normal de distribuição/redistribuição.
- Campos aceitos com nomes alternativos: `nome`, `name`; `telefone`, `phone`,
  `whatsapp`, `celular`; `e-mail`, `email_address`; `utm_source/medium/campaign/content`.

## Respostas

| Status | Significado                                  |
| ------ | -------------------------------------------- |
| 200    | Lead criado (`ok: true`)                     |
| 401    | Secret ausente/incorreto                     |
| 422    | Faltou `nome` e `telefone`                   |
| 400    | JSON inválido                                |
| 500    | Falha ao inserir (ver logs da função)        |

## Teste rápido (curl)

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/lead-intake" \
  -H "x-webhook-secret: <LEAD_INTAKE_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Fulano de Teste","phone_number":"+55 51 99999-0000","email":"teste@ex.com","campaign_name":"Campanha X","ad_name":"Anúncio Y"}'
```
