# Academia SMQ · Fatia 0 · Fechamento do diagnóstico (28/09/2026)

Registro do que foi medido em produção, do que isso muda no desenho da Academia e do que
ainda falta. Cada número vem de `fatia0-saidas/diagnostico.csv` (consulta única
`fatia0-diagnostico-console.sql`, rodada no SQL Editor do CRM em 28/09 às 14:31 BRT, 20 de
20 blocos sem erro). As decisões do dono estão em `fatia0-respostas.md`.

Nada foi escrito no banco. Nenhuma migration foi aplicada.

## 1. O instrumento

| Pergunta                                       | Medido                                                                                                              | Consequência                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| O MCP do CRM está mesmo quebrado?              | Sim. As tabelas têm 73 e 109 agendamentos de visita e 13 e 13 vendas em agosto e setembro. O MCP diz 0.             | A Academia nunca lê pelo MCP.                                                            |
| O histórico de status enxerga o funil?         | Sim. 136 de 141 leads com agendamento real nos últimos 60 dias (96,5%) têm a transição registrada.                  | "Passou por" pelo histórico é confiável, com a agenda como segundo caminho.              |
| Os status legados ainda são usados?            | Não. `qualificado`: 10 transições desde sempre, 0 em 90 dias. `proposta_enviada`: 3 e 0.                            | R04 e R08 não podem depender deles.                                                      |
| Há escrita em lote no histórico?               | Sim, concentrada em julho e em status de pré-funil (`aguardando_*`, `novo`, `perdido` em 04/07).                    | As janelas das regras (até 90 dias) quase não pegam lote; o filtro continua.             |
| Existe o "motor de SLA das 04:30"?             | Não. Nenhum job às 04:30 e nenhuma função `sla_*` em produção. O SLA roda dentro de `distribuicao-automatica-5min`. | O horário do job da Academia é decidido pelos jobs reais (seção 5).                      |
| Fuso do pg_cron                                | `GMT`.                                                                                                              | Todo horário de job é em UTC.                                                            |
| O gate de onboarding da roleta v2 está ligado? | Não (`modelo_v2_ativo = false`). Se ligar: 120 das 191 participações ativas ficam inaptas.                          | O "Apto" atual não bloqueia ninguém hoje. Ligar o v2 é decisão à parte, com esse número. |
| Existe algo `academia_*` no banco?             | Não.                                                                                                                | Terreno limpo.                                                                           |

Contexto da base, medido no mesmo momento: **100.316 leads vivos** (eram 55.435 em 12/09),
94.747 sem corretor, 5.569 em carteira. Setembro criou 44.486 leads, contra 2.101 em agosto.

## 2. Os oito indicadores com os números de hoje

Simulação das regras do seed (`02-seed-academia.sql`, R01 a R08) sobre o que foi medido.

| Regra | Indicador                   | O que os números mostram                                                                                                                                                                                                                                                  | Veredito para a Fatia 5                                                                                                                           |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01   | tempo_primeiro_contato      | 4.978 atribuições em 30 dias; só 143 são lead novo pago (`webhook`). Mensagem de saída: 0. Chamada: 32. O "contato" visível é o corretor mudar o status. Mediana do time: 8 min, então 1,5x = 12 min: dispara para 10 de 23 (16 de 23 com "sem contato conta como pior"). | Restringir a lead novo (gatilhos `webhook`, `sla_webhook*`, `agendamento_*`), janela de 90 dias, e exigir diferença mínima absoluta além do 1,5x. |
| R02   | taxa_agendamento            | Coorte de 4.897 leads, 75 passaram por agendado (1,5%). Mediana do time: 0,7%; 10 de 21 seriam marcados por 0%. 30 dos 75 "agendados" já chegaram agendados (SDR agenda e distribui).                                                                                     | Só lead novo, excluindo quem chega já agendado. Janela de 90 dias.                                                                                |
| R03   | taxa_comparecimento         | 65 visitas validadas em 30 dias na empresa (52% de comparecimento). Máximo por corretor: 13. 17 visitas passadas sem validação.                                                                                                                                           | Régua da casa (validação por agendamento, sem sintéticos). Janela de 90 dias. Mostrar "pendente de validação".                                    |
| R04   | taxa_visita_para_avanco     | 22 visitas na coorte, no máximo 9 por corretor. Avanço = análise ou pasta (decisão). Proposta: 0 registros.                                                                                                                                                               | Só como número do time por enquanto; individual quase nunca atinge amostra.                                                                       |
| R05   | pct_carteira_parada         | Régua 7/30 (decisão): 69% da carteira parada; mediana do time 82%, máximo 100%. 1,5x a mediana é impossível.                                                                                                                                                              | Nunca dispara. Problema da operação, não do corretor. Número de time; regra individual desativada.                                                |
| R06   | pct_sem_proximo_passo       | 94% sem próximo passo; mediana 98%.                                                                                                                                                                                                                                       | Nunca dispara. Desativada; número de time.                                                                                                        |
| R07   | taxa_pasta_devolvida        | Sem fonte: devolução por pendência não é registrada. Reprovação de crédito existe (`analises_credito.status = 'reprovada'`, 7 registros desde abril), mas é outra coisa.                                                                                                  | Desativada até existir o registro.                                                                                                                |
| R08   | taxa_perda_por_qualificacao | 2.174 perdas em 30 dias; 1.975 pelo próprio corretor. `sem_perfil` = 49% delas; `credito_renda` e `estourou_teto` = 0. O volume é limpeza de estoque. "Depois de avançar" medido a partir de `qualificacao_corretor` pega estoque que entra em `em_atendimento`.          | Redefinir "avançar" como passou por agendado e medir só lead novo. Em sombra antes de qualquer decisão.                                           |

## 3. Perfis (bloco P)

68 perfis. A lista de quem entra na Academia é do dono; a separação abaixo é só por sinal.

- **Corretor com distribuição ou atividade em setembro (26):** Amanda Dias, Ana Rita Oliveira Sousa, Andrew, Bruno Soares
  Martins, Camila Jasmin Torres, Christiane Praxedes, Daniel Queiroz Consultor, eduardo
  santana, Ellen Santos, Emily Damasceno da Silva, Erick Santos, Felipe França, graziele
  gomes de jesus, Guilherme Cillo, Ingrid Queiroz, Jefferson Luiz, Jessica Sobral, Kauanny
  vieira, Leonardo vrena, Leticia Brandão, Leticia Castro, Maria Santos, Rangel, Sara Braga,
  Sara Leoni, Thiago Fávaro.
- **Corretor sem atividade recente (9):** Caique Caetano, Camille Derolle, Emilly Vitória,
  Felippe Andrade, Igor Nigro, João Victor Paes Dantas, Luiz Fernando, Michelli Lopes,
  Thauany Cobra.
- **Corretor sem login no CRM (4):** Evellyn (Equipe Sheldon), Kamilla Lima, Patrícia
  Santos, Pitter Reis Souza. Têm vendas registradas, mas não entram no app: sem login não
  estudam na Academia.
- **SDR (2):** Kauan, Vanessa Melo.
- **Gestão (4):** Bruno Carmo (gestor), Fabio Magazoni (admin), Guilherme Nunes Barbosa
  (admin e gestor), Sheldon Barbosa (gestor; **não é aluno**, decisão do dono).
- **Não é pessoa (2):** docs-bot, Seu Metro Quadrado.
- **Conta de teste com acesso ativo (5):** Edson teste junior, Leticia amaral braga (2),
  Meu metro De Login (2).
- **Conta bloqueada (16).**

## 4. Achados fora do escopo da Academia (para decisão do dono)

1. **Ana Caroline Pereira está bloqueada com 402 leads vivos e 12 participações ativas em
   roleta** (última distribuição 21/09). Aline Dias, bloqueada, está em 8 roletas.
2. **Cinco contas de teste com e-mail descartável estão com `status_conta = 'ativa'` e papel
   `corretor`.** Conseguem entrar no CRM.
3. **O `docs-bot` tem papel `gestor`.**
4. **`distribuir-estoque-plantao` não está agendado em produção**, embora a doc da Higiene
   (12/09) o registre e o replay das migrations o agende. Produção e repo divergem.
5. **O CI está vermelho no `main`** por um teste de banco da cadência
   (`tests/db/cadencia-painel.test.ts:248`), não relacionado à Academia.

## 5. Horário do job da Academia

Jobs noturnos reais (UTC): `higiene-processar-diaria` 04:00, `mcp-aplicar-guardas` 04:17,
`regua-devolucao-diaria` 05:00. Proposta: cálculo de indicadores e geração de recomendações
às **05:45 UTC (02:45 de Brasília)**, depois da última mexida noturna na carteira.

## 6. O que falta

- Separar as 1.386 atribuições sem gatilho registrado. No schema, sete funções gravam em
  `distribution_log` sem `distribuicao_log_contexto`: `discador_bolsao_assumir_v1` (o corretor
  puxa do bolsão), `transferir_leads` (transferência manual), `_cadencia_devolver_roleta`,
  `regua_devolucao_processar`, `marcar_lead_perdido`, `atribuir_lead_a_corretor` e
  `distribuir_lead_ponderado` (legado). Lead puxado pelo próprio corretor não entra no tempo
  de primeiro contato. A Fatia 5 separa pelos campos `tipo`, `motivo` e `regra_aplicada`.
- Aprovação do dono para a lista de participantes e para as redefinições das regras.
