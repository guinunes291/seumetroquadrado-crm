# Devolver ao Marquinhos — contrato CRM ⇄ n8n

Decisão do Guilherme (06/11/2026). Princípio **um número, uma voz**: o 4099 é sempre o Marquinhos e
o corretor fala sempre do próprio WhatsApp. Depois do handoff o robô fica pausado. Quando o corretor
quiser, ele **devolve o cliente ao Marquinhos com um objetivo**, o robô cumpre esse objetivo no 4099
e devolve o cliente com um resumo.

| Objetivo (`objetivo`) | O corretor vê                  | O Marquinhos faz                                                                 | Encerra com                                                                                         |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `remarcar_visita`     | Cliente pediu para remarcar    | Pede o novo dia e horário e confirma dia, hora e empreendimento numa mensagem só | `objetivo_cumprido` com a nova data no `resultado`                                                  |
| `recolher_documentos` | Tentar recolher a documentação | Pede um documento por vez (régua de documentos do prompt)                        | `objetivo_cumprido` quando a pasta fecha; `precisa_corretor` depois de 2 resistências               |
| `tirar_duvidas`       | Tirar dúvidas do cliente       | Responde com a ficha do empreendimento                                           | `objetivo_cumprido` quando acabam as dúvidas; `precisa_corretor` para preço, desconto ou negociação |

O texto de cada objetivo (rótulo, missão e abertura sugerida) fica em
`src/features/mensagens/devolucao-marquinhos.ts`. Mudou ali, muda na tela e no pedido ao n8n.

## Estados (tabela `marquinhos_devolucoes`)

```
pendente ──(n8n ok)──▶ com_marquinhos ──(n8n encerra)──▶ concluida
   │                        │
   │ 3 falhas               │ corretor retoma ──(n8n pausou)──▶ cancelada
   ▼                        ▼
 falhou (push)        (pausa falhou 3x: continua com_marquinhos + push)
```

- Cada lead tem no máximo **uma devolução ativa** (`pendente` ou `com_marquinhos`). Quem garante é
  um índice único.
- Só podem devolver: o **corretor dono** do lead, o gestor da equipe, o superintendente e o admin.
  Cliente com opt-out, sem corretor ou perdido é recusado.
- Leitura: mesma régua do lead (`pode_acessar_lead`). O corretor só vê as devoluções dos próprios
  clientes.

## 1) CRM → n8n: o pedido

O CRM faz `POST` em `N8N_MARQUINHOS_DEVOLUCAO_URL` com o header `x-sami-key: <SAMI_WRITE_KEY>`.

- O primeiro envio acontece logo depois do clique do corretor.
- As novas tentativas acontecem a cada 5 minutos, até 3, pelo cron `push-dispatch`.
- Sem a env, nada é enviado: os pedidos ficam esperando, **sem gastar as tentativas**.

**Devolver**

```json
{
  "acao": "devolver",
  "devolucao_id": "9b2f…",
  "lead_id": "4c1a…",
  "telefone": "5511987654321",
  "objetivo": "remarcar_visita",
  "objetivo_rotulo": "Cliente pediu para remarcar",
  "cliente_nome": "Regina",
  "corretor_nome": "Ana",
  "recado_do_corretor": "Só consegue sábado de manhã",
  "missao": "Ajude o cliente a REMARCAR a visita. … Você está atendendo a pedido do consultor Ana … Recado do consultor: Só consegue sábado de manhã",
  "abertura_sugerida": "Oi, Regina! Aqui é o Marquinhos, assistente da Seu Metro Quadrado. Ana me pediu pra te ajudar a remarcar a visita 😊 Qual dia e horário ficam bons pra você?",
  "tentativa": 1
}
```

**Retomar** (o corretor reassumiu e o robô precisa parar)

```json
{
  "acao": "retomar",
  "devolucao_id": "9b2f…",
  "lead_id": "4c1a…",
  "telefone": "5511987654321",
  "corretor_nome": "Ana",
  "tentativa": 1
}
```

**Resposta esperada:** HTTP 2xx com `{ "ok": true }` depois que o n8n despausou (devolver) ou pausou
(retomar) o robô para esse telefone. Qualquer outra resposta conta como falha, e o texto de
`{ "ok": false, "erro": "…" }` aparece para o corretor na faixa da conversa.

O n8n precisa ser **idempotente por `devolucao_id` e `acao`**: um timeout depois de ter executado gera
um reenvio do mesmo pedido.

## 2) n8n → CRM: espelho das mensagens do 4099

O endpoint é `POST /api/public/webhooks/whatsapp`, com o header `x-webhook-secret` (o contrato da
Fase 7a, em `docs/fase7-mensageria.md`).

- **Mensagem do cliente:** sem mudança.
- **Mensagem do robô** (novo): mesmo corpo, com `"direcao": "saida"` e `"agente": "marquinhos"`.

```json
{
  "tipo": "mensagem",
  "provider": "meta_4099",
  "provider_message_id": "wamid.HBgN…",
  "telefone": "5511987654321",
  "conteudo": "Oi, Regina! Aqui é o Marquinhos…",
  "direcao": "saida",
  "agente": "marquinhos"
}
```

Como o CRM trata a mensagem do robô:

- grava **sem corretor**. A resposta automática depois do handoff **não** tira o cliente da fila
  Responder do corretor;
- com devolução ativa, carimba `devolucao_id`. Aí a resposta do robô conta como resposta, e a fala do
  cliente não cobra o corretor enquanto o robô atende a pedido dele;
- não ecoa na timeline. Saída sem `agente` é recusada com `saida_sem_agente`.

## 3) n8n → CRM: encerrar

O endpoint é `POST /api/sami/devolucao`, com o header `x-sami-key`.

```json
{
  "devolucao_id": "9b2f…",
  "desfecho": "objetivo_cumprido",
  "resultado": "Visita remarcada para sábado 14/11 às 10h no Playball."
}
```

`desfecho` aceita `objetivo_cumprido`, `sem_resposta` ou `precisa_corretor`.

O CRM então:

- marca a devolução como `concluida`;
- grava uma nota na timeline do lead, sem autor (é o robô);
- manda push ao **dono** do lead com o resumo.

Um replay responde `status: "ignorado"`. Depois de responder, o n8n pausa o robô de novo para esse
telefone.

## O que muda no n8n (só aplicar com o "pode" do Guilherme)

O Marquinhos (workflow `Bxr2DuaUDz24d7Dp`) atende clientes reais. Por isso, nada abaixo foi aplicado.

1. **Workflow novo "SMQ - Marquinhos: devolução do corretor".** Recebe o pedido do item 1 e confere o
   `x-sami-key`.
   - Em `devolver`: remove o telefone de **Bot Pausado SMQ** e grava `devolucao_id`, `missao` e
     `objetivo` numa tabela "Devolução Ativa". Depois envia a `abertura_sugerida` pelo 4099: texto
     dentro da janela de 24h, template aprovado (`retomada_atendimento_v1`) fora dela. Espelha a
     mensagem pelo item 2 e responde `{ok:true}`.
   - Em `retomar`: devolve o telefone à **Bot Pausado SMQ** (motivo "corretor retomou"), apaga a
     "Devolução Ativa" e responde `{ok:true}`.
2. **No funil do Marquinhos:**
   - Em "Montar entrada (contexto)", se o telefone tem devolução ativa, injeta a `missao` como bloco
     **MISSÃO DO CONSULTOR**, acima da qualificação.
   - A saída estruturada ganha `devolucao_encerrar { desfecho, resultado }`. Quando vier preenchida,
     o fluxo chama o item 3, pausa o robô e apaga a "Devolução Ativa".
   - Um handoff durante uma devolução vira `precisa_corretor`, e não um lead novo na roleta.
3. **Espelho**: depois de "Log inbound" e "Log Marquinhos (out)", chamar o item 2. Hoje o Marquinhos
   espelha no Supabase **operacional** (`lwebydmveyqyzfgmbqfk`), e não no CRM (`rldnprwjlomjmjvinxuh`).
4. **Pendente de decisão** (conversa de 06/11): frase do handoff com o nome do corretor ("Passei seu
   perfil pra Ana, ela vai te chamar do WhatsApp dela"), com ou sem o número dele; e a resposta curta
   pós-handoff no 4099.

## Envs do deploy do CRM

| Nome                           | Para quê                                                       |
| ------------------------------ | -------------------------------------------------------------- |
| `N8N_MARQUINHOS_DEVOLUCAO_URL` | Webhook do workflow do item 1 (https). Sem ela, nada é enviado |
| `SAMI_WRITE_KEY`               | Já existe. Header `x-sami-key` nos dois sentidos               |
| `WHATSAPP_WEBHOOK_SECRET`      | Já existe. Espelho das mensagens (item 2)                      |
