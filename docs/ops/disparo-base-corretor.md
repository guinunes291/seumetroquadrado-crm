# Disparo da base do corretor ("Marquinhos do corretor")

Pedido do dono (02/11/2026): o corretor importa a base dele no CRM, o Marquinhos
dispara pela API oficial do WhatsApp e **todo lead que avançar vai direto para o
corretor que importou**.

## Decisões do dono (02/11/2026)

| Tema                                                     | Decisão                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Número de envio                                          | O do Marquinhos, por enquanto                                                          |
| Custo                                                    | A empresa paga os primeiros **1000 contatos disparados**; depois, 50/50 com o corretor |
| Quem usa                                                 | Piloto com **1 corretor**                                                              |
| Corretor desligado/inativo quando o cliente se qualifica | O lead vai para a **roleta**                                                           |

A cota de 1000 é **somada entre todos os corretores** (`disparo_base_config.cota_empresa_contatos`).
Com um só corretor no piloto, dá no mesmo; se o dono quiser a cota **por corretor**, só muda
`disparo_base_custeio()`.

## Fases

1. **Fase 1 (esta):** regra de dono no webhook, importação da base, piloto e custeio
   (só a regra). Migration `20261102120000_disparo_base_corretor.sql` (espelho drizzle `0128`).
2. **Fase 2:** fila de envio pela API oficial (modelo aprovado pela Meta, limite diário,
   horário comercial, status de entrega pelo `provider_message_id`).
3. **Fase 3:** n8n do Marquinhos: contexto do disparo ao responder ("assistente da Ana"),
   SAIR → `opt_out`, resposta → `respondeu`.
4. **Fase 4:** painel de resultados e tela do admin (modelos, limites, qualidade do número).

## Como a base entra (Fase 1)

Tela `/disparo-base` (Prospecção → "Disparo da base", só para quem está no piloto).

- O corretor marca a declaração da LGPD ("a base é minha e os contatos aceitaram ser procurados");
  sem ela `disparo_base_criar` recusa.
- `importar_base_corretor_lote` (service role, chamada por `src/lib/disparo-base.functions.ts`
  com o corretor tirado do **token**, nunca do corpo) insere linha a linha:

| Situação do telefone              | Resultado                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Novo no CRM                       | Lead novo **do corretor**: `aguardando_retorno`, classe `base`, origem `captacao_corretor`, `canal_entrada = 'importacao'`, `import_batch_id = id do disparo` |
| Já é do corretor                  | Entra no disparo sem duplicar e sem mexer no status                                                                                                           |
| Aberto com outro corretor         | Bloqueado: `outra_carteira`                                                                                                                                   |
| No CRM sem ser dele (bolsão etc.) | Bloqueado: `ja_no_crm`                                                                                                                                        |
| Cliente/registro com `opt_out`    | Bloqueado: `pediu_para_sair`                                                                                                                                  |
| Repetido na planilha              | Bloqueado: `repetido_na_planilha`                                                                                                                             |

**Por que base fria e não "aguardando atendimento":** o primeiro contato é do Marquinhos.
Com `aguardando_retorno` + classe `base`, os 300 contatos não geram alerta nem push
(`app.prospeccao_lote`), não entram na cadência, não aparecem no SLA e não entram no repasse
por SLA (que só olha classe `quente` em `aguardando_atendimento`).

## Como o lead volta para o corretor

O Marquinhos qualifica e chama o mesmo webhook de lead de sempre (`origem: "chatbot"`).
`registrar_volta_campanha` ganhou o ramo **`base_do_corretor`**, entre "negociação avançada"
e "registro filho":

- a pessoa tem um item de disparo **enviado** nos últimos `janela_resposta_dias` (30), de um
  disparo do dono atual do lead, e não pediu para sair;
- então o item vira `qualificado` e o lead **fica com o corretor**: classe `quente`, status
  `qualificado` (status que o corretor já trabalhou não volta para trás);
- **dono inativo/bloqueado:** classe `quente` e `_reatribuir_se_dono_inativo` (roleta →
  fallback por velocidade → Marquinhos segue, como no resto do CRM);
- o webhook anota a qualificação inteira no histórico do lead, cria o alerta "Cliente da sua
  base foi qualificado" e responde com `motivo: "mantido_base_do_corretor"` e
  `corretor_telefone` — o Marquinhos manda o dossiê ao WhatsApp do corretor como já faz.

Sem a regra nova, o cliente ia para um **registro filho na roleta sem o corretor que o importou**.

Fora da regra (anúncio com outra origem, contato ainda não disparado, fora da janela), a volta
segue igual: registro filho na roleta.

## Operação

Ligar o piloto de um corretor (admin logado, ou SQL editor):

```sql
SELECT public.disparo_base_definir_piloto('<uuid do corretor>', true);
-- desligar: ... , false
```

Ver custeio: `SELECT public.disparo_base_custeio();`

Configurações em `disparo_base_config` (`cota_empresa_contatos`, `rateio_corretor_apos_cota`,
`janela_resposta_dias`, `limite_diario_corretor`, `max_contatos_por_disparo`).

## Testes

- Banco: `tests/db/disparo-base.test.ts`
- Unidade: `tests/disparo-base-importacao.test.ts`, `tests/webhook-lead-volta.test.ts`
