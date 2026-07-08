# Webhook do Simulador Aluguel vs. Parcela

`POST /api/public/webhooks/simulacao` — recebe cada simulação feita na
ferramenta de visita (Simulador Aluguel vs. Parcela, deploy próprio no
Railway) e a transforma em registro + lead no CRM.

Implementa o contrato do `DESIGN.md` §2.4 do simulador.

## Autenticação

Header `X-API-Key` = secret **`SIMULADOR_API_KEY`** (variável de ambiente do
CRM). É um secret **próprio** — não reutiliza `READ_API_KEY` nem
`MCP_WRITE_API_KEY`, para que um vazamento da chave do simulador não exponha
as outras APIs. Comparação em tempo constante + rate limit em memória
(mesma mecânica de `src/lib/public-api-auth.ts`).

No lado do simulador (Railway), a mesma chave vai em `CRM_API_KEY` e a URL em
`CRM_SIMULACAO_URL=https://<app>/api/public/webhooks/simulacao`.

## Payload

```json
{
  "origem": "simulador-aluguel-parcela",
  "versao_calculo": "2026-07-portaria-333",
  "corretor_id": "COR001",
  "cliente_telefone": "5511999998888",
  "empreendimento": null,
  "inputs":    { "aluguel": 1800, "renda": 4200, "entrada": 20000 },
  "resultado": { "faixa": "F2", "taxa_aa": 7.22, "parcela_estimada": 1650.00,
                 "valor_imovel_max": 264000, "aluguel_10anos": 259000,
                 "patrimonio_10anos": 310000, "mes_cruzamento": 38 },
  "ts": "2026-07-03T14:22:00-03:00"
}
```

Validação (422 quando viola): `inputs.aluguel` 200–20.000 · `inputs.renda`
500–50.000 · `inputs.entrada` 0–1.000.000 · `cliente_telefone`
`^55\d{10,11}$` (aceita 10–11 dígitos nacionais e prefixa o 55; vazio/ausente
é válido) · `corretor_id` `^COR\d+$` ou null · `resultado.mes_cruzamento`
1–120 ou null. `resultado` inteiro é opcional (casos FORA_MCMV etc. mandam só
flags). `ts` ilegível não derruba o payload — vira null.

`corretor_id` é o id do corretor **no simulador** (corretores.csv) e é gravado
como `corretor_ref` — não é o uuid de `profiles`; o lead criado NÃO vai para
esse corretor, e sim para a roleta (decisão do DESIGN §2.4).

## Comportamento

1. **Sempre** grava a simulação na tabela `simulacoes` (inputs/resultado
   achatados para relatório + `raw` com o payload completo).
2. `cliente_telefone` presente:
   - **casa com lead ativo** (`buscar_lead_por_telefone`, tolerante ao DDI 55
     — a base tem telefones com e sem o 55) → anexa nota "Simulação Aluguel
     vs. Parcela" na timeline (`interacoes`) do lead mais recente;
   - **telefone novo** → cria lead `origem='simulador'` e distribui pela
     roleta de presença dos webhooks (`distribuir_lead_webhook`, fallback
     gestor; `via_webhook=true`, entra no repasse por SLA de minutos), grava a
     nota na timeline e um alerta in-app para o corretor sorteado.
3. Sem telefone: grava só o evento.

Falha ao casar/criar o lead **não** derruba a resposta: a simulação já está
registrada e o simulador nunca trava a visita (princípio do DESIGN §2.2) —
o erro fica no log e `lead_id` volta null.

## Respostas

| Status | Significado |
| --- | --- |
| 201 | `{ ok: true, id, lead_id, lead_criado }` |
| 400 | JSON inválido |
| 401 | X-API-Key ausente/incorreta |
| 422 | payload viola o contrato (`detalhes` traz o flatten do zod) |
| 429 | rate limit (60/min por chave) |
| 500 | `SIMULADOR_API_KEY` não configurada ou erro de banco |

## Banco (migrations)

- `20260708090000_simulador_lead_origem.sql` — valor `simulador` no enum
  `lead_origem` (arquivo próprio: valor novo de enum não pode ser usado na
  mesma transação).
- `20260708090100_webhook_simulacao.sql` — tabela `simulacoes` (RLS:
  admin/gestor/superintendente leem tudo; corretor lê as dos seus leads),
  `telefone_canonico` + `buscar_lead_por_telefone` (EXECUTE só para
  `service_role`) e config de distribuição da origem `simulador`
  (timeout 24h, SLA webhook 5 min).

## Teste (curl)

```bash
curl -i -X POST "https://<app>/api/public/webhooks/simulacao" \
  -H "X-API-Key: $SIMULADOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"origem":"simulador-aluguel-parcela","versao_calculo":"2026-07-portaria-333",
       "corretor_id":"COR001","cliente_telefone":"5511999998888",
       "inputs":{"aluguel":1800,"renda":4200,"entrada":20000},
       "resultado":{"faixa":"F2","taxa_aa":7.22,"parcela_estimada":1650,
                    "valor_imovel_max":264000,"aluguel_10anos":259000,
                    "patrimonio_10anos":310000,"mes_cruzamento":38},
       "ts":"2026-07-03T14:22:00-03:00"}'
```

Depois: conferir a linha em `simulacoes`, o lead criado/casado e a nota na
timeline — e apagar o teste (checklist §2.8 do DESIGN).

## Checklist de ativação

1. Aplicar as duas migrations no Lovable Cloud.
2. Configurar `SIMULADOR_API_KEY` nos secrets do app.
3. Configurar `CRM_SIMULACAO_URL` + `CRM_API_KEY` no Railway do simulador.
4. 1 simulação de teste ponta a ponta → conferir `simulacoes` → apagar.
