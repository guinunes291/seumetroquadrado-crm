# Sami no WhatsApp — contrato do `/api/sami` para o n8n

Onda S4 do plano em `docs/samiq/2026-09-05-decisoes-copiloto.md` (decisões D8 parte 2 e D15:
**um cérebro, dois canais**). O n8n deixa de ter um cérebro próprio para a Sami do WhatsApp:
vira transporte. Recebe a mensagem do corretor, chama o CRM e envia de volta o `texto` que o
CRM devolver. Tudo o que a Sami sabe (prompt versionado no banco, ferramentas de leitura da
carteira, propostas com confirmação, cota por papel, memória de 12 h, telemetria) é o mesmo do
painel. Uma correção de prompt vale nos dois canais.

## Autenticação

Todas as rotas exigem o header `x-sami-key` igual ao segredo `SAMI_WRITE_KEY` (o mesmo das
edge functions `sami-*`, mínimo 16 caracteres). Comparação em tempo constante. Sem a env no
deploy, o CRM responde 503 `canal_nao_configurado`.

Env necessárias no deploy do CRM (Cloudflare): `SAMI_WRITE_KEY`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`.

## Como o CRM identifica o corretor

Pelo telefone do WhatsApp que mandou a mensagem, comparado com `profiles.telefone` dos
corretores ativos pelos últimos 9 dígitos (celular) ou 8 (fixo). Só resolve se a
correspondência for **única**. Erros: 404 `corretor_nao_encontrado`, 409 `corretor_ambiguo`.

Com o corretor resolvido, o CRM abre uma **sessão real** desse corretor (magic link gerado pelo
admin e trocado por um JWT, encerrado ao fim da requisição) e roda o cérebro com o RLS dele.
Consequência prática: a Sami do WhatsApp vê exatamente a carteira que o corretor vê no CRM, e
tudo o que ela registra fica com o corretor como autor e a marca "via Sami".

## Rotas

Todas `POST`, corpo JSON (máx. 32 KB), resposta JSON. Toda resposta, com sucesso ou erro,
traz `texto`: o n8n pode simplesmente enviar esse campo ao corretor.

### `POST /api/sami/mensagem`

```json
{
  "corretor_telefone": "5511912345678",
  "texto": "Liguei pra Maria agora, ela topou visitar sábado 10h no Reserva Guarulhos",
  "origem_midia": "audio",
  "lead_id": "uuid opcional",
  "nova_conversa": false
}
```

- `origem_midia`: `"texto"` (padrão) ou `"audio"`. **Áudio é transcrito pelo n8n** (nó de
  transcrição) e chega como `texto`; a Sami recebe a instrução de tolerar erros de transcrição.
- `nova_conversa: true` ignora a conversa das últimas 12 h e começa outra.

Resposta quando a Sami responde (`tipo: "resposta"`):

```json
{
  "ok": true,
  "tipo": "resposta",
  "texto": "Preparei os registros da Maria.\n\n📝 Preparei 2 registros:\n1) Registrar contato com Maria da Silva — whatsapp · Atendeu\n2) Agendar visita com Maria da Silva — Quando: sáb 12/09 10h00\n\nResponda CONFIRMAR para registrar ou CANCELAR para descartar.",
  "resposta": {
    "texto": "Preparei os registros da Maria.",
    "propostas": [{ "id": "…", "tipo": "registrar_contato", "titulo": "…", "detalhes": ["…"] }],
    "conversa_id": "…",
    "execution_id": "…",
    "fallback": false,
    "custo_mes_pct": 12,
    "ferramentas": ["buscar_clientes"]
  },
  "corretor": { "id": "…", "nome": "Ana Souza" }
}
```

Resposta quando o corretor respondeu **CONFIRMAR** ou **CANCELAR** a um pacote pendente
(`tipo: "decisao"`): o CRM executa (ou descarta) sem chamar o modelo e devolve o resultado em
`texto` ("✅ Registrei 2 itens: …"). Vocabulário aceito: `confirmar`, `sim`, `ok`, `pode
registrar`, `1`, ✅, 👍 / `cancelar`, `não`, `descartar`, `2`, ❌, 👎 (até 3 palavras). Qualquer
frase fora disso ("sim, mas muda a data") vai para a Sami como pergunta.

### `POST /api/sami/propostas`

Para fluxos com botões interativos, ou como atalho explícito:

```json
{ "corretor_telefone": "5511912345678", "decisao": "confirmar", "ids": ["uuid", "uuid"] }
```

Sem `ids`, decide o que está pendente na conversa ativa do canal. Mesma execução do botão do
card no painel; o modelo nunca participa.

### `POST /api/sami/briefing`

```json
{ "corretor_telefone": "5511912345678" }
```

Devolve `texto` ("Bom dia, Ana! Seu dia: • 1 visita hoje: Maria 10h00 • 3 follow-ups
vencidos…") e o objeto `briefing`. Não gasta cota de IA. O n8n dispara de manhã para os
corretores que usam o WhatsApp da Sami.

## Erros

| status | `erro`                    | quando                                       |
| ------ | ------------------------- | -------------------------------------------- |
| 401    | `nao_autorizado`          | `x-sami-key` ausente ou diferente            |
| 404    | `corretor_nao_encontrado` | telefone não bate com corretor ativo         |
| 409    | `corretor_ambiguo`        | mais de um corretor com o mesmo sufixo       |
| 413    | `corpo_grande`            | corpo acima de 32 KB                         |
| 422    | `corpo_invalido`          | campos fora do contrato                      |
| 429    | `muitas_mensagens`        | mais de 20 mensagens/min do mesmo corretor   |
| 429    | `cota`                    | cota de IA do corretor/equipe atingida (D18) |
| 502    | `sami_indisponivel`       | gateway de IA ou CRM fora                    |
| 503    | `canal_nao_configurado`   | `SAMI_WRITE_KEY` ausente no deploy           |
| 503    | `sessao_indisponivel`     | não foi possível abrir a sessão do corretor  |

Em todos, `texto` traz uma frase que pode ir ao corretor; `retry_after` (segundos) acompanha os 429.

## O que muda no n8n

1. **Fluxo de mensagem**: WhatsApp → (se áudio, transcrever) → `POST /api/sami/mensagem` →
   enviar `texto` de volta. Nada de prompt, nada de decidir intenção no n8n.
2. **Edge functions `sami-consultar-agenda` e `sami-agendar-visita`** ficam obsoletas: a
   ferramenta `minha_agenda` e a proposta `propor_visita` (com confirmação) fazem o mesmo, com a
   sessão do corretor. Podem ser removidas depois que o fluxo migrar.
3. **`sami-anexar-documento`** continua: é transporte de arquivo binário, não conversa.
4. **Briefing matinal**: um agendamento no n8n chamando `/api/sami/briefing` por corretor.

## Segurança e LGPD

- O modelo nunca escreve: registros só após CONFIRMAR do corretor, com a mesma trilha do painel
  (`metadata.origem = 'samiq'`, desfazer em 24 h).
- PII (telefone, CPF, endereço, banco) é redigida antes de ir ao modelo e antes de ir à memória,
  como no painel (D12).
- A sessão do corretor aberta pelo CRM dura só a requisição; o token não sai do servidor.
