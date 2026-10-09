# Funções SECURITY DEFINER e o papel `anon`

Atualizado em 03/10/2026, com o banco do harness em
`20261009120400_rpcs_sem_execute_anon.sql`.

## Por que isto importa

Toda função criada sem `REVOKE ... FROM PUBLIC` nasce executável por qualquer
papel — inclusive `anon`, o da chamada SEM login à API (PostgREST). Em função
`SECURITY DEFINER` (roda como o dono, passando por cima do RLS) isso vira
vazamento quando a função trata `auth.uid() IS NULL` como "chamada do
sistema": **a chamada anônima também chega com `auth.uid()` nulo**.

## Correção desta lista

A primeira versão deste documento classificava as funções lendo o corpo com
uma expressão regular — e errou. Ela marcou como perigosas seis funções que
fazem `IF _caller IS NULL OR NOT <papel> THEN RAISE 'forbidden'` (isso
**recusa** uid nulo) e deixou passar a que tinha o padrão perigoso de verdade
(`_sem_caller := (_caller IS NULL)`). A auditoria foi refeita **chamando cada
função como `anon`**, numa transação desfeita no fim — o método abaixo.

## Resultado

| Momento                    | SECURITY DEFINER executáveis por anon | Executavam de fato para anon   |
| -------------------------- | ------------------------------------- | ------------------------------ |
| antes de `20261009120300`  | 52                                    | —                              |
| antes de `20261009120400`  | 43                                    | 19                             |
| depois de `20261009120400` | 18                                    | **0** — todas recusam no corpo |

O que o anônimo conseguia e foi fechado:

| Função                                               | O que vazava                                                              | Migration |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| `processar_distribuicao_automatica()`                | rodada inteira de distribuição sob demanda                                | 120300    |
| `resetar_presenca_diaria()` e outros jobs do pg_cron | zerar a presença de todos, gerar alertas/pushes                           | 120300    |
| `dashboard_atividade_periodo(...)`                   | números da empresa inteira: leads, agendamentos, visitas, vendas, **VGV** | 120400    |
| `regua_devolucao_candidatos_v1()`                    | leads candidatos a devolução (lead, corretor, status, dias parado)        | 120400    |
| `produtividade_corretores()`                         | carteira, aguardando e % trabalhado de cada corretor                      | 120400    |
| `mcp_aplicar_guardas()`                              | DDL como dono (cria triggers, sincroniza grants) — agora só service_role  | 120400    |
| `mcp_log_bloqueio(...)`                              | gravar no `api_escrita_log`                                               | 120400    |
| `copa_ranking(uuid)`                                 | ranking da Copa (id da edição é previsível)                               | 120400    |

Regra aplicada em 120400: sai `PUBLIC`/`anon`, ficam `authenticated` e
`service_role` (telas logadas e funções `SECURITY INVOKER` que as chamam
continuam iguais). Nenhuma política RLS nem view usa essas funções, e as rotas
públicas do app chamam RPC só pelo `service_role`.

### As 17 que ainda aceitam anon — todas recusam no corpo

(Eram 18: `marcar_presenca(boolean)` perdeu o EXECUTE de `anon` na presença por
filial, `20261013120000`.)

Defesa em profundidade possível numa próxima passada (revogar `anon` também
delas), mas hoje nenhuma entrega dado ao anônimo:

| Função                                                                                 | Resposta à chamada anônima |
| -------------------------------------------------------------------------------------- | -------------------------- |
| `atribuir_oferta_ativa(uuid,uuid[])`                                                   | `28000` Não autenticado    |
| `atribuir_oferta_ativa_lote(uuid,uuid[],integer)`                                      | `28000` Não autenticado    |
| `copa_salvar_pontuacao_lote(uuid,integer,jsonb)`                                       | `P0001` forbidden          |
| `copa_set_participante(uuid,uuid,uuid,text,boolean)`                                   | `P0001` forbidden          |
| `dashboard_funil(timestamp with time zone,timestamp with time zone,uuid,text)`         | `P0001` unauthorized       |
| `dashboard_kpis(timestamp with time zone,timestamp with time zone,uuid,text)`          | `P0001` unauthorized       |
| `dashboard_leads_urgentes(uuid,integer)`                                               | `P0001` unauthorized       |
| `dashboard_motivos_perda(timestamp with time zone,timestamp with time zone,uuid,text)` | `P0001` unauthorized       |
| `dashboard_serie_diaria(timestamp with time zone,timestamp with time zone,uuid,text)`  | `P0001` unauthorized       |
| `leads_com_sla(uuid)`                                                                  | `P0001` unauthorized       |
| `preview_oferta_ativa(jsonb,uuid)`                                                     | `P0001` unauthorized       |
| `ranking_atividades(date,date)`                                                        | `P0001` unauthorized       |
| `rel_evolucao_vendas(timestamp with time zone,timestamp with time zone,uuid)`          | `P0001` unauthorized       |
| `rel_origem_efetiva(timestamp with time zone,timestamp with time zone,uuid)`           | `P0001` unauthorized       |
| `rel_tempo_medio_por_etapa(timestamp with time zone,timestamp with time zone,uuid)`    | `P0001` unauthorized       |
| `tempo_primeira_resposta(date,date,uuid)`                                              | `P0001` unauthorized       |
| `transicionar_lead(uuid,lead_status,text,text,timestamp with time zone,text)`          | `42501` conta inativa      |

## O guarda permanente

`tests/db/rpcs-sem-execute-anon.test.ts` ("sonda") chama, como `anon`, TODA
função `SECURITY DEFINER` que anon ainda pode executar e falha se alguma
devolver resultado. Função nova que precise mesmo atender anônimo (ex.: uma
RPC da vitrine pública) entra em `PUBLICAS_DE_PROPOSITO` no teste, com o
motivo — decisão explícita, revisada no PR.

## Como revisar uma função nova

1. Quem chama? `grep -rn "<nome>" src supabase/functions` e
   `SELECT jobname, command FROM cron.job WHERE command ILIKE '%<nome>%'`.
   Política ou view? `SELECT * FROM pg_policies WHERE qual ILIKE '%<nome>(%'`.
2. Sem tela anônima nem política para anon: `REVOKE ALL ... FROM PUBLIC, anon;`
   e `GRANT EXECUTE ... TO authenticated, service_role;` (ou só
   `service_role` se só o cron/edge function chama).
3. Se a função trata "uid nulo" como sistema e `authenticated` precisa dela,
   a checagem de papel tem de barrar o `authenticated` sem permissão.
