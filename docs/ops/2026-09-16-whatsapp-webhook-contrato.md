# Fase 3 — WhatsApp de entrada ligado (contrato para o n8n)

Data: 2026-09-16. Nenhuma linha do webhook foi reescrita — ele estava certo,
só nunca havia sido chamado (faltava a chave).

## Chave

`WHATSAPP_WEBHOOK_SECRET` criada no projeto: **32 caracteres**. O valor não é
exibido em lugar nenhum; use o mesmo valor no nó HTTP do n8n.

## Contrato

- **URL (produção):** `https://project--862f238b-1c33-4bd3-aec6-6e4ffb74e9ba.lovable.app/api/public/webhooks/whatsapp`
- **URL (preview):** `https://project--862f238b-1c33-4bd3-aec6-6e4ffb74e9ba-dev.lovable.app/api/public/webhooks/whatsapp`
- **Método:** `POST`
- **Headers:** `content-type: application/json` e `x-webhook-secret: <valor da chave>`
  (nunca em query string)
- **Corpo máximo:** 64 KB

### Mensagem recebida do cliente

```json
{
  "tipo": "mensagem",
  "provider": "zapi",
  "provider_message_id": "ABCD1234",
  "telefone": "11999998888",
  "conteudo": "Oi, ainda tem a unidade?",
  "midia_url": null,
  "ocorrido_em": "2026-09-16T12:00:00-03:00"
}
```

`conteudo` ou `midia_url`: pelo menos um. `ocorrido_em` é opcional (ISO com
fuso). `provider_message_id` garante a idempotência — replay responde
`{"ok":true,"duplicada":true}`.

### Atualização de entrega (mensagem enviada)

```json
{ "tipo": "status", "provider_message_id": "ABCD1234", "status": "lida" }
```

`status`: `enviada` | `entregue` | `lida` | `falha` (com `erro` opcional).

### Respostas

| Código | Corpo | Significado |
| --- | --- | --- |
| 200 | `{"ok":true,"lead_id":"…","timeline":"ok"}` | gravado |
| 200 | `{"ok":true,"duplicada":true}` | replay, já gravado |
| 200 | `{"ok":true,"lead":"nao_encontrado"}` | telefone sem lead ativo — o n8n manda ao lead-intake e reenvia |
| 400 | `payload_invalido` / `telefone_invalido` / `mensagem_vazia` | corpo fora do contrato |
| 401 | `unauthorized` | header errado |
| 503 | `service_unavailable` | chave ausente no servidor |

## ⚠️ Formato do telefone (decidido aqui, não foi pedido)

A busca do lead compara **dígitos exatos** (`telefone_digits`): `5511999998888`
**não** casa com `11999998888`. Na base, **56.217** leads têm 11 dígitos (sem
DDI) contra **4.465** com 13. Portanto, **o n8n deve remover o `55` inicial**
quando o número tiver 12 ou 13 dígitos, antes de enviar. Se não achar, tentar
uma segunda chamada com o DDI — ou cair no lead-intake.

Não alterei o webhook nem a função de busca para "adivinhar" o DDI: seriam duas
definições da mesma regra de telefone.

## Teste ponta a ponta executado

1. Lead "TESTE WEBHOOK" (11900000001) criado para um corretor.
2. POST com o header → `{"ok":true,"lead_id":"…","timeline":"ok"}`.
3. 1 linha em `mensagens` (`direcao='entrada'`) e 1 em `interacoes`
   (`direcao='entrada'`).
4. `conversas_aguardando_resposta` → `aguardando: true`: o lead **acendeu o
   balde "Cliente respondeu e espera"** da Fila Única.
5. Lead de teste e todos os registros dele apagados (0 sobrando).

Primeira chamada de teste, com DDI (`5511900000001`), devolveu
`lead:"nao_encontrado"` — foi o que revelou o ponto do DDI acima.
