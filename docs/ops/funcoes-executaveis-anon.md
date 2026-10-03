# Funções SECURITY DEFINER ainda executáveis por `anon`

Levantamento de 03/10/2026, feito no banco do harness com TODAS as migrations
até `20261009120300_cron_distribuicao_sem_execute_publico.sql` aplicadas.

## Por que isto importa

Toda função criada sem `REVOKE ... FROM PUBLIC` nasce executável por qualquer
papel — inclusive `anon`, o da chamada SEM login à API (PostgREST). Em função
`SECURITY DEFINER` isso é sério por um detalhe do motor: muitas delas tratam
`auth.uid() IS NULL` como "chamada do sistema" (cron, webhook com
service_role). **A chamada anônima também chega com `auth.uid()` nulo** — e
passa pela mesma porta do sistema.

A migration `20261009120300` fechou o que era cron/job (o caso mais grave:
`processar_distribuicao_automatica`, que qualquer anônimo rodava, e
`resetar_presenca_diaria`, que zerava a presença de todos). O resto está
abaixo para revisão uma a uma — algumas servem telas públicas (vitrine,
landing) e não podem simplesmente perder o grant.

## Como revisar uma linha

1. Quem chama? `grep -rn "<nome>" src supabase/functions` e
   `SELECT jobname, command FROM cron.job WHERE command ILIKE '%<nome>%'`.
2. Se nenhuma tela SEM login usa: `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;`
   e `GRANT EXECUTE ... TO authenticated, service_role;` (ou só service_role,
   se só o cron/edge function chama).
3. Se a função trata "uid nulo" como sistema e o authenticated precisa dela,
   a checagem de papel tem de barrar o authenticated sem permissão (como em
   `processar_distribuicao_automatica`).
4. Teste de banco com `has_function_privilege('anon', ..., 'EXECUTE') = false`.

## Lista (prioridade de cima para baixo)

"Checagem" é uma leitura automática do corpo da função (busca por
`auth.uid()`, `has_role` e pelo padrão "uid nulo = sistema") — confirme no
código antes de mexer.

| Função                                                                                     | Efeito  | Checagem                        | Observação                                                   |
| ------------------------------------------------------------------------------------------ | ------- | ------------------------------- | ------------------------------------------------------------ |
| `copa_inicializar_dados()`                                                                 | escreve | uid nulo = sistema (anon passa) | escreve com uid nulo tratado como sistema — revisar primeiro |
| `create_oferta_ativa(text,text,jsonb,uuid)`                                                | escreve | uid nulo = sistema (anon passa) | escreve com uid nulo tratado como sistema — revisar primeiro |
| `dashboard_metricas_por_corretor(timestamp with time zone,timestamp with time zone,text)`  | lê      | uid nulo = sistema (anon passa) | métricas por corretor legíveis sem login                     |
| `dashboard_redistribuicoes(timestamp with time zone,timestamp with time zone)`             | lê      | uid nulo = sistema (anon passa) | histórico de redistribuição legível sem login                |
| `equipe_metricas_campanha(uuid)`                                                           | lê      | uid nulo = sistema (anon passa) | métricas de campanha legíveis sem login                      |
| `rel_conversao_por_corretor(timestamp with time zone,timestamp with time zone)`            | lê      | uid nulo = sistema (anon passa) | conversão por corretor legível sem login                     |
| `cadencia_cumprida_100(uuid)`                                                              | lê      | sem checagem                    |                                                              |
| `cadencia_etapa_completa(uuid,text)`                                                       | lê      | sem checagem                    |                                                              |
| `cadencia_horarios_tentados(uuid)`                                                         | lê      | sem checagem                    |                                                              |
| `cadencia_prioridade_reativacao(uuid)`                                                     | lê      | sem checagem                    |                                                              |
| `copa_ranking(uuid)`                                                                       | lê      | sem checagem                    |                                                              |
| `corretor_elegivel(uuid)`                                                                  | lê      | sem checagem                    |                                                              |
| `gestor_gere_corretor(uuid,uuid)`                                                          | lê      | sem checagem                    |                                                              |
| `mcp_aplicar_guardas()`                                                                    | lê      | sem checagem                    |                                                              |
| `pode_escrever(text,text)`                                                                 | lê      | sem checagem                    |                                                              |
| `pontos_de(text)`                                                                          | lê      | sem checagem                    |                                                              |
| `produtividade_corretores()`                                                               | lê      | sem checagem                    |                                                              |
| `regua_devolucao_candidatos_v1()`                                                          | lê      | sem checagem                    |                                                              |
| `roleta_da_zona(text)`                                                                     | lê      | sem checagem                    | devolve o slug da roleta (baixo risco)                       |
| `zona_do_bairro(text)`                                                                     | lê      | sem checagem                    | tabela pública de bairros (baixo risco)                      |
| `zona_do_lead(uuid)`                                                                       | lê      | sem checagem                    | devolve só a zona de um id de lead (baixo risco)             |
| `atribuir_oferta_ativa(uuid,uuid[])`                                                       | escreve | checa usuário                   |                                                              |
| `atribuir_oferta_ativa_lote(uuid,uuid[],integer)`                                          | escreve | checa usuário                   |                                                              |
| `copa_salvar_pontuacao_lote(uuid,integer,jsonb)`                                           | escreve | checa usuário                   |                                                              |
| `copa_set_participante(uuid,uuid,uuid,text,boolean)`                                       | escreve | checa usuário                   |                                                              |
| `marcar_presenca(boolean)`                                                                 | escreve | checa usuário                   | exige usuário (auth.uid())                                   |
| `mcp_log_bloqueio(text,text,text)`                                                         | escreve | checa usuário                   |                                                              |
| `transicionar_lead(uuid,lead_status,text,text,timestamp with time zone,text)`              | escreve | checa usuário                   | exige usuário (auth.uid())                                   |
| `dashboard_atividade_periodo(timestamp with time zone,timestamp with time zone,uuid,text)` | lê      | checa usuário                   |                                                              |
| `dashboard_funil(timestamp with time zone,timestamp with time zone,uuid,text)`             | lê      | checa usuário                   |                                                              |
| `dashboard_kpis(timestamp with time zone,timestamp with time zone,uuid,text)`              | lê      | checa usuário                   |                                                              |
| `dashboard_leads_urgentes(uuid,integer)`                                                   | lê      | checa usuário                   |                                                              |
| `dashboard_motivos_perda(timestamp with time zone,timestamp with time zone,uuid,text)`     | lê      | checa usuário                   |                                                              |
| `dashboard_serie_diaria(timestamp with time zone,timestamp with time zone,uuid,text)`      | lê      | checa usuário                   |                                                              |
| `is_mcp()`                                                                                 | lê      | checa usuário                   |                                                              |
| `leads_com_sla(uuid)`                                                                      | lê      | checa usuário                   |                                                              |
| `preview_oferta_ativa(jsonb,uuid)`                                                         | lê      | checa usuário                   |                                                              |
| `ranking_atividades(date,date)`                                                            | lê      | checa usuário                   |                                                              |
| `rel_evolucao_vendas(timestamp with time zone,timestamp with time zone,uuid)`              | lê      | checa usuário                   |                                                              |
| `rel_origem_efetiva(timestamp with time zone,timestamp with time zone,uuid)`               | lê      | checa usuário                   |                                                              |
| `rel_tempo_medio_por_etapa(timestamp with time zone,timestamp with time zone,uuid)`        | lê      | checa usuário                   |                                                              |
| `tempo_primeira_resposta(date,date,uuid)`                                                  | lê      | checa usuário                   |                                                              |
| `verificar_minhas_conquistas()`                                                            | lê      | checa usuário                   |                                                              |
