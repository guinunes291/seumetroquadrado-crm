# Roletas por zona — a fila de cada roleta e a posição de cada corretor

> Migrations `20261015120000_roletas_fila_por_zona.sql` (espelho drizzle
> `0076`), `20261016120000` (`0077`) e `20261017120000_vez_unica_por_zona.sql`
> (`0078`, §8). Testes: `tests/db/roletas-fila-zona.test.ts` e
> `tests/db/vez-unica-zona.test.ts` (banco), `tests/roletas-fila-zona.test.tsx`
> (telas).

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

| Quem                                                                                                        | Onde                                         | O quê                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDR (Pré-venda → Painel) e gestão (Central de Distribuição → **A vez por zona**; admin também na Pré-venda) | cartão **Roleta**                            | Escolhe a zona (ou "Sem zona"). A fila do SDR em destaque, na roda de iniciais com o 1º na seta; embaixo, a roleta da zona, o Marquinhos e as campanhas de equipe fixa, "1º Lara · 2º Leo…". Na Central de Distribuição é só leitura: montar a fila é na aba Filas. |
| Corretor (na própria fila)                                                                                  | Central de Comando → **Sua vez nas roletas** | Em cima, onde ele está na fila: "Agendados do SDR · Leste — 2º de 6". Embaixo, onde está fora, agrupado pelo motivo ("Sem check-in…: Marquinhos, Cury Leopoldina, Jardim BF e mais 8"), com o atalho do check-in quando o motivo é esse. Nenhum nome de colega.     |

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
| `_roleta_fila_prevista(slug, zona, regua, cabecas)`              | só o banco                    | A fila prevista de uma roleta numa zona (já sem quem é o 1º de outra zona, §8).                         |
| `_fila_swrr`, `_roleta_fila_mecanica`, `_roleta_fora_do_horario` | só o banco                    | Peças da previsão.                                                                                      |
| `_vez_unica_*` (§8)                                              | só o banco                    | A ordem das zonas, as cabeças de cada família e quem já é o 1º de uma zona anterior.                    |

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

## 6b. Correção 0077 — só a participação ativa

A linha de participação removida pela gestão (`roleta_participantes.ativo =
false`) entrava em "Sua vez" como "Não atende esta zona" (visto com a Zona
Norte de uma corretora em 11/10). Removido não é "fora da fila": a roleta
não é dele. `minhas_posicoes_roletas_v1` passa a listar só a participação
ativa (`20261016120000`, drizzle `0077`). Para o SDR nada muda: removido de
uma roleta de zona, o corretor deixa de atender a zona e some da lista dela.

## 7. Em produção (11/10/2026)

Só funções novas, de leitura. Entrou no banco da Lovable em 11/10, às 20:30
UTC, depois do merge do #275:

1. Os 13 motores e réguas que a previsão imita (`_distribuir_lead_v3`,
   `_distribuir_lead_sdr`, `distribuir_lead_ponderado`, as elegibilidades,
   `corretor_atende_zona` e os pesos da semana) foram comparados com o
   repositório antes: md5 de `pg_get_functiondef` igual em 12; em
   `_elegibilidade_roleta_sdr` só os comentários diferem (o corpo, sem
   comentários e espaços, é idêntico).
2. `drizzle/migrations/0076_roletas_fila_por_zona.sql` em 4 blocos; as 6
   funções novas com md5 igual ao do harness e as permissões conferidas (anon
   nada; logado só as duas portas).
3. Registrada em `drizzle.__drizzle_migrations` (id 79, `created_at =
1792076400000`).
4. Conferido com usuários reais: a tela do SDR na Zona Leste respondeu em
   175 ms; a posição de uma corretora que atende 3 zonas, em 400 ms (34 filas).

**O que o primeiro uso mostrou.** Num domingo à noite, sem check-in, a
corretora que atende 3 zonas aparecia fora de 30+ filas, uma linha por
roleta e zona. O painel passou a agrupar quem está fora pelo motivo. Também
apareceu participação em roleta de zona que o perfil não atende (Zona Norte
para quem atende Leste, Oeste e Sul): o motor já a ignora, e o painel diz
"Não atende esta zona" — é ajuste de cadastro na Central de Distribuição.

## 8. A vez é uma só (0078)

**O pedido.** Em 11/10, olhando "A vez por zona", o dono viu Igor Nigro em 1º
no Sul e no Leste: "o mesmo corretor não pode ficar em primeiro em mais de
uma Zona". Decisão: **a vez é uma só**, para os Agendados do SDR e para as
roletas de zona (Marquinhos, campanhas e a reserva do SDR ficam fora).

**Por que acontecia.** Na fila do SDR o cursor é um por corretor
(`ultimo_lead_em` em `agendados-sdr`); a fila de cada zona é esse cursor
filtrado por quem atende a zona. Quem atende duas zonas e nunca recebeu é o 1º
nas duas. Nas roletas de zona o cursor é por roleta, mas um corretor em duas
roletas de zona também pode ser o 1º nas duas ao mesmo tempo.

**A regra** (a mesma conta no motor e na tela, migration `20261017120000`):

1. As zonas são olhadas da mais movimentada para a menos: leads entregues na
   zona nos últimos 30 dias, por qualquer roleta (`contexto->>'zona'` do log);
   empate pela ordem Norte, Sul, Leste, Oeste, Centro, Grande SP
   (`_vez_unica_zonas_ordem`). É o volume total, e não o da família, para a
   ordem não virar a cada visita do SDR (3 por mês com zona) e a vez de um
   corretor não pular de zona a cada lead.
2. Zona a zona, o 1º é o primeiro da fila do motor que ainda não é o 1º de uma
   zona anterior (`_vez_unica_cabecas`). Quem já é o 1º de uma zona mais
   movimentada sai da fila das outras enquanto a vez dele não chega. Na tela:
   "Igor (vez no Sul)" para o SDR; "Sua vez agora é no Sul: Agendados do SDR
   · Leste" para o corretor. No banco: motivo `vez_em_outra_zona` + `vez_em`.
3. Se a regra pulasse todo mundo de uma zona, a fila fica como estava: a vez
   nunca segura o lead (`vez_unica_forcada` no contexto da decisão).

Quem é o 1º em duas zonas fica com a mais movimentada porque é lá que o lead
chega primeiro; depois que ele recebe, o cursor anda e a conta refaz sozinha.
Só o 1º lugar muda; as posições seguintes são a ordem do motor sem ele.

**No motor.** `_distribuir_lead_sdr` (passo 2) e `_distribuir_lead_v3` (só
`tipo = 'zona'`) chamam `_vez_unica_tomados(família, zona)` — as cabeças das
zonas anteriores à do lead — e tiram esses corretores dos candidatos antes do
rodízio ou do ponderado (no ponderado, eles não entram na rodada: o cursor
deles não anda por um lead que não era deles). O contexto da decisão grava
`vez_unica`, `vez_em_outra_zona` (quem saiu e onde está a vez dele) e
`vez_unica_forcada`.

**Chave.** `distribuicao_settings.vez_unica_por_zona` (ausente = ligada;
Central de Distribuição → Configurações). Desligada, motor e tela voltam ao
comportamento anterior.

**Custo.** As cabeças de cada família são calculadas uma vez por chamada das
duas portas (`roletas_filas_zona_v1`, `minhas_posicoes_roletas_v1`) e
passadas a cada fila; o motor calcula só as zonas anteriores à do lead.

**Como foi conferido** (`tests/db/vez-unica-zona.test.ts`, 7 testes): Igor
(Sul e Leste), Ana (Sul) e Gra (Leste). Com o Sul mais movimentado, Igor é o
1º no Sul e "vez no Sul" no Leste, e o motor entrega a visita do Leste à Gra e
a do Sul ao Igor; com o Leste mais movimentado, o contrário; o mesmo com a
regra semanal (ponderado); só o Igor no Sul = forçado (recebe mesmo assim);
chave desligada = Igor 1º nas duas; roletas de zona (motor v3) idem; Marquinhos
fora da regra; ler as filas não mexe em cursor.
