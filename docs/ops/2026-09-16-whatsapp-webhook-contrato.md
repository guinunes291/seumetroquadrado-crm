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

| Código | Corpo                                                       | Significado                                                    |
| ------ | ----------------------------------------------------------- | -------------------------------------------------------------- |
| 200    | `{"ok":true,"lead_id":"…","timeline":"ok"}`                 | gravado                                                        |
| 200    | `{"ok":true,"duplicada":true}`                              | replay, já gravado                                             |
| 200    | `{"ok":true,"lead":"nao_encontrado"}`                       | telefone sem lead ativo — o n8n manda ao lead-intake e reenvia |
| 400    | `payload_invalido` / `telefone_invalido` / `mensagem_vazia` | corpo fora do contrato                                         |
| 401    | `unauthorized`                                              | header errado                                                  |
| 503    | `service_unavailable`                                       | chave ausente no servidor                                      |

## Formato do telefone (corrigido na Fase 3.1)

**O n8n manda o telefone como o provedor entrega (E.164, com o `55`). Sem tirar
nada.** A normalização é do banco.

Convenção única, agora válida para **busca e merge**: casamento pelos **9
últimos dígitos** sobre `coalesce(telefone_e164, telefone)`, apoiado no índice
`leads_tel9_ativo_idx` (a mesma expressão de `mesclar_leads_por_telefone`).
`buscar_lead_ativo_por_telefone_global` foi reescrita nessa expressão; o corpo
antigo (comparação de dígitos exatos, que só achava leads gravados no mesmo
formato) está em comentário de rollback na própria migration.

Medições feitas antes de aplicar:

- chaves de 9 dígitos colidindo entre leads ativos: **0**
- leads com menos de 9 dígitos (fixo antigo): **101** — resíduo conhecido, não
  corrigido (WhatsApp em telefone fixo é raro)

Teste: dois leads criados, um com `11900000011` e outro com `5511900000022`,
consultados no formato E.164 — **ambos encontrados** — e apagados em seguida.

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
