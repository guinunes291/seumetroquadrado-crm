# Roletas por zona — a fila de cada roleta e a posição de cada corretor

> Migration `20261015120000_roletas_fila_por_zona.sql` (espelho drizzle
> `0076`). Testes: `tests/db/roletas-fila-zona.test.ts` (banco) e
> `tests/roletas-fila-zona.test.tsx` (telas).

## 1. O pedido

Em 11/10/2026, ao comparar a Pré-venda com a roleta do vídeo de lançamento, o
dono decidiu: **"a roleta será apenas para o SDR e os corretores vendo em qual
posição da fila estão. Por fila de zona."** Valem todas as roletas: a da zona,
a fila do SDR (Agendados do SDR), a do Marquinhos e as de campanha (Facebook
Ads). O SDR vê a fila inteira, com nomes; o corretor vê a própria posição, na
Central de Comando.

Antes, o painel do SDR mostrava a roleta "só em número" (quantos aptos, pontos
anônimos). Isso saiu.

## 2. O que cada um vê

| Quem                          | Onde                                         | O quê                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDR, admin, gestor, superint. | Pré-venda → Painel, cartão **Roleta**        | Escolhe a zona (ou "Sem zona"). A fila do SDR em destaque, na roda de iniciais com o 1º na seta; embaixo, a roleta da zona, o Marquinhos e as campanhas de equipe fixa, "1º Lara · 2º Leo…". |
| Corretor (na própria fila)    | Central de Comando → **Sua vez nas roletas** | Uma linha por roleta e zona: "Agendados do SDR · Leste — 2º de 6", ou "fora da fila agora" com o motivo, e o atalho do check-in quando o motivo é esse. Nenhum nome de colega.               |

A zona escolhida pelo SDR fica lembrada no navegador dele (`localStorage`); é
só conveniência.

## 3. De onde vem a ordem

Nada aqui muda quem recebe. As funções **leem** o estado de cada motor e
preveem a vez com a régua dele, sem escrever nada (o teste "ler as filas não
mexe em cursor nenhum" trava isso).

| Fila                       | Motor que distribui            | Quem está apto                                                                                      | Como a vez anda                                                                                                                                        |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Roleta da zona, Marquinhos | `_distribuir_lead_v3`          | `_elegibilidade_roleta` (check-in do dia, pausa, cota, regra dos 65…), só quem atende a zona        | Rodízio: há mais tempo sem receber (`ultimo_lead_em`, `incluido_em`). Com o modelo v2 ligado, o lead quente usa o ponderado por faixa (A/B/C = 3/2/1). |
| Agendados do SDR           | `_distribuir_lead_sdr`         | `_elegibilidade_roleta_sdr` (sem presença, sem horário de visita), só quem atende a zona            | Regra semanal valendo: ponderado pelo peso da semana. Senão, rodízio.                                                                                  |
| Reserva do SDR             | `_distribuir_lead_sdr` passo 3 | Ninguém do time do SDR atende a zona: o time da zona, pela régua do SDR (sem presença)              | Rodízio.                                                                                                                                               |
| Campanha de equipe fixa    | `distribuir_lead_ponderado`    | Os filtros da função (participação, pausa, perfil, telefone, presença, cota), só quem atende a zona | Ponderado por faixa, com os pesos da roleta.                                                                                                           |
| Campanha comum             | `distribuir_lead_ponderado`    | Lead com zona vai para a roleta da zona: a campanha só tem fila para lead **sem zona**              | Ponderado por faixa.                                                                                                                                   |

O ponderado é o mesmo nos três motores (smooth weighted round-robin): soma o
peso de todos, escolhe o maior cursor, desconta a soma de quem recebeu. A
previsão (`_fila_swrr`) roda essa conta sem gravar, com o desempate de cada
motor. **Posição** = a ordem da primeira vez de cada um se os próximos leads
forem desta zona; no ponderado, peso maior pode receber de novo antes de outro
chegar à vez.

## 4. O que a previsão não sabe (e a tela diz)

Depende do lead, não da fila:

- quem já teve o lead é pulado;
- na visita do SDR, quem tem compromisso no horário é pulado;
- na visita do SDR, o corretor que falou com o cliente nos últimos 7 dias fura
  a fila (política do SDR §7, item 4).

Também não entram: as roletas de sistema (Plantão, Base, Landing), que não
foram pedidas, e o horário de funcionamento (nenhuma roleta tem janela hoje;
se tiver, a resposta traz `fora_do_horario`).

## 5. Peças no banco

| Função                                                           | Quem chama                    | O quê                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `roletas_filas_zona_v1(_zona)`                                   | SDR, admin, gestor, superint. | Todas as roletas de uma zona (`NULL` = lead sem zona), com nomes, a fila e quem está fora com o motivo. |
| `minhas_posicoes_roletas_v1()`                                   | quem está logado              | A posição do próprio corretor em cada roleta de que participa, por zona que atende.                     |
| `_roleta_fila_prevista(slug, zona)`                              | só o banco                    | A fila prevista de uma roleta numa zona.                                                                |
| `_fila_swrr`, `_roleta_fila_mecanica`, `_roleta_fora_do_horario` | só o banco                    | Peças da previsão.                                                                                      |

Corretor sem zona no perfil: fora das filas filtradas por zona (a zona
estrita só sorteia quem atende a zona do lead). Na fila do SDR aparece "Sem
zona no perfil"; a gestão define a região na Central de Distribuição.

## 6. Como foi conferido

- `tests/db/roletas-fila-zona.test.ts` (10 testes): para a roleta da zona, a
  fila do SDR com peso semanal e a campanha de equipe fixa, a fila prevista
  ANTES bate com a ordem em que o motor real entrega os leads DEPOIS (no
  ponderado, a ordem da primeira vez numa volta inteira). Também: filtro de
  zona no Marquinhos e nas campanhas, reserva do SDR, campanha comum fora da
  zona, acesso por papel, o corretor sem nomes de colegas, e nenhuma escrita.
- `tests/roletas-fila-zona.test.tsx` (12 testes): textos, troca de zona,
  reserva e o painel do corretor com o atalho do check-in.

## 7. Ligar em produção

Só funções novas, de leitura. No banco da Lovable:

1. aplicar `drizzle/migrations/0076_roletas_fila_por_zona.sql`;
2. registrar em `drizzle.__drizzle_migrations` com o sha256 do arquivo e
   `created_at = 1792076400000` (o `when` do journal), como em
   `docs/ops/em-atendimento-teto-65.md` §5.3;
3. conferir: `SELECT public.roletas_filas_zona_v1('Leste')` como SDR devolve
   as filas, e o corretor vê "Sua vez nas roletas" na Central.

Sem a migration, o cartão da Roleta e o painel do corretor mostram o erro de
leitura; o resto da Pré-venda e da Central segue igual.
