# Roletas por filial — três times, as zonas no lead

> Migration `20261018120000_roletas_por_filial.sql` (espelho drizzle `0079`).
> Testes: `tests/db/roletas-por-filial.test.ts` (banco) e os de tela listados
> no §9. Substitui, na prática, o "time por zona" de
> `docs/distribuicao-por-zonas.md` (a zona continua no lead; o time passa a
> ser a filial).

## 1. O pedido e as decisões (12/10/2026)

Dono, 11/10 à noite: **"vamos montar roletas por filial, fica mais simples de
distribuir em apenas 3 roletas"**. Isso inverte a decisão 1 de 09/10 em
`docs/ops/presenca-filiais.md` ("não há roleta por filial"). Decisões na
revisão, 12/10 de manhã:

| Pergunta                                    | Decisão                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Qual zona cada filial atende?               | **Barra Funda = Oeste, Norte e Sul · Liberdade = Centro e Leste · Belém = Leste e Grande SP.** A Zona Leste é atendida pelas duas lojas.    |
| A Leste em duas filiais: como fica o lead?  | **Alterna**: cada lead da Leste vai para a filial que está há mais tempo sem receber lead da Leste (rodízio entre as duas roletas).         |
| Quem está na roleta da filial?              | **Time fixo, montado pela gestão** na Central de Distribuição (como hoje, só que por filial). Migração inicial pela carteira de zonas (§5). |
| Um corretor pode estar em duas filiais?     | **Sim, quando a gestão quiser.** A regra "a vez é uma só" continua, agora por filial.                                                       |
| O check-in precisa ser na filial da roleta? | **Não.** Como em 09/10: presente em qualquer loja (ou em casa com 3 vendas no mês anterior) recebe de todas as filas em que está.           |

E, no mesmo dia, **"dentro de cada filial teremos algumas campanhas
específicas para adicionar os corretores a receberem leads de outras zonas,
para não ficar totalmente travado na sua zona"**:

| Pergunta                                                | Decisão                                                                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| O que é a campanha da filial?                           | **As campanhas de anúncio (Meta Ads) de hoje**, cada uma pertencendo a uma filial (`roletas.filial_id`). Nada muda na forma de criar campanha.        |
| O lead da campanha ignora a zona do corretor?           | **Sim.** A campanha manda: quem está na equipe fixa recebe, de qualquer zona. Acaba o corte por zona de 03/10 nas campanhas.                          |
| Quem pode entrar na campanha da filial?                 | **Qualquer corretor, de qualquer filial.** A filial da campanha é rótulo e agrupamento.                                                               |
| Depois da entrega, pode ir para quem não atende a zona? | **Sim, entre os participantes da campanha.** Repasse por SLA e transferência valem entre quem está na equipe; a guarda de região libera só esse caso. |

O que **não** muda: a zona do lead (vem do projeto), a zona estrita (lead
da Leste só para quem atende a Leste), os motores (roleta, SDR, Marquinhos,
campanhas, repasse por SLA, Bolsão, lote, discador), a presença, a guarda de
região em `leads.corretor_id`, os webhooks e as edge functions.

## 2. O modelo

- **Zona fica no lead**; **filial é o time.** `zonas_roletas` passa a aceitar
  várias zonas na mesma roleta e a mesma zona em mais de uma roleta (chave
  primária `(zona, roleta_slug)`), com um cursor por par: `ultimo_lead_em`
  = a última vez que aquela roleta recebeu lead daquela zona.
- **Três roletas de tipo `zona`** (nada muda nos ~10 pontos do código que
  testam o tipo): `filial-barra-funda` "Roleta Barra Funda",
  `filial-liberdade` "Roleta Liberdade", `filial-belem` "Roleta Belém",
  cada uma com `roletas.filial_id` apontando para `filiais`.
- **Mapa**: Oeste, Norte, Sul → Barra Funda; Centro, Leste → Liberdade;
  Leste, Grande SP → Belém.
- **A região do corretor** continua sendo o espelho das roletas em que ele
  está (`profiles.zonas`, trigger): quem está na Roleta Belém atende Leste e
  Grande SP; quem está na Liberdade atende Centro e Leste. Acaba a "região
  só Oeste": o time é da filial inteira.
- **As 6 roletas antigas** (`zona-*`) ficam `ativo = false`, nunca apagadas:
  histórico, tokens de webhook (lead com token antigo entra pela triagem) e
  rollback por script.

## 3. Como o lead escolhe a filial

`_roletas_da_zona(zona)` devolve as roletas da zona na ordem do rodízio
(`ultimo_lead_em` mais antigo primeiro, `NULL` na frente; empate pela ordem
das filiais) e diz quais estão **prontas** (ativa e com alguém apto) e qual é
a **da vez** (a primeira pronta). `roleta_da_zona(zona)` continua existindo
(mesma assinatura, usada por motores, repasse e webhooks) e devolve a da vez.

No motor da roleta (`_distribuir_lead_v3`), lead com zona e zona estrita:

1. **Pino válido**: se o lead já tem `roleta_slug` de uma roleta desta zona
   (memória do repasse por SLA: o lead fica no mesmo time), tenta ela
   primeiro.
2. Senão, a **da vez** pelo rodízio. Uma filial sem ninguém apto é pulada:
   o lead da Leste não espera a Liberdade acordar se a Belém está pronta.
   "Apto" aqui é para **este** lead: quem já teve o lead não conta
   (`_roleta_pronta_para_lead`). No repasse por SLA, se na filial do pino só
   o dono que estourou está apto, o lead vai para a outra filial da zona em
   vez de esperar.
3. Nenhuma pronta: vai para a primeira da ordem e **espera lá** (exceção
   `sem_corretor_na_zona` / `zona_sem_time`, como hoje), nunca para outra
   zona.
4. Ao entregar, o motor grava `zonas_roletas.ultimo_lead_em` do par
   (zona, roleta): é isso que faz a Leste alternar.

Exemplo: dois leads da Leste chegam às 9h00 e 9h05. Liberdade e Belém
prontas, nenhuma recebeu Leste hoje → o 1º vai para a Liberdade (ordem das
filiais no empate), o 2º para a Belém, o 3º para a Liberdade… Se às 9h05 a
Belém não tem ninguém com check-in, o 2º também vai para a Liberdade, e a
Belém recebe o próximo assim que alguém dela fizer o check-in.

A reserva do SDR (passo 3 de `_distribuir_lead_sdr`, visita sem ninguém do
time do SDR na zona) segue a mesma ordem: tenta a da vez, depois as outras.

## 3b. Campanhas por filial — a válvula

A roleta da filial é o fluxo normal e **estrito** (lead da Leste só para quem
atende a Leste). A campanha é a exceção organizada: a gestão escolhe a filial
dona da campanha, monta a equipe (de qualquer filial) e o lead que chega pelo
webhook da campanha vai para essa equipe, **de qualquer zona** — o corretor da
Barra Funda recebe o lead do empreendimento da Zona Leste anunciado pela
campanha dele.

- `distribuir_lead_ponderado` (webhook da campanha) e `_repassar_lead_campanha`
  (repasse por SLA dentro da campanha) deixam de cortar a equipe pela zona do
  lead. Ninguém da equipe apto → o lead vai para a filial da zona (como
  antes, "equipe sem apto").
- Campanha **comum** (sem equipe fixa) continua: lead com zona vai para a
  filial da zona; a campanha fica como rótulo.
- A guarda de região (`tg_leads_guarda_zona`) e a transferência da gestão
  (`transferir_leads`) liberam quando o lead é de uma campanha ativa e o
  corretor de destino é participante ativo dela
  (`_lead_liberado_por_campanha`). Para quem não está na campanha, a guarda
  continua.
- `criar_roleta_campanha` e `atualizar_roleta` ganham `_filial_slug`
  (assinaturas novas; as antigas saem para a chamada por nome não ficar
  ambígua). As campanhas de hoje nascem sem filial; a gestão define na Central.
- Na tela: a aba Filas agrupa as campanhas por filial; a Pré-venda e a aba
  "A vez" mostram, numa zona, as campanhas da(s) filial(is) que a atendem e
  as sem filial, com a equipe inteira; "Sua vez" mostra a campanha como uma
  fila só (sem zona).

Exemplo: a campanha "Well Perdizes" (empreendimento na Zona Leste) passa a
ser da Barra Funda, com 6 corretores da Barra Funda. O lead do anúncio cai
para um deles mesmo sendo da Leste; se o corretor estourar o SLA, o repasse
fica entre os 6; a gestão pode transferir o lead para outro dos 6 sem a
exceção de região. Um lead da Leste que chegou pelo site (sem campanha)
continua indo para a Liberdade ou a Belém.

## 4. A vez é uma só, por filial

`docs/ops/roletas-fila-por-zona.md` §8 continua valendo, com a **unidade**
certa para cada família: nos Agendados do SDR a fila é por zona (a visita
tem zona), então a unidade é a zona; nas roletas de filial a fila é uma por
roleta (o 1º da Belém é o 1º para lead da Leste e da Grande SP), então a
unidade é a **roleta**. As unidades são olhadas da mais movimentada para a
menos (leads entregues nos 30 dias anteriores ao começo desta semana: por
zona no SDR, por roleta nas filiais; empate pela ordem canônica das zonas ou
das filiais), e quem já é o 1º de uma unidade anterior sai da fila das
outras. Na tela: "Igor (vez no Sul)" na fila do SDR; "Igor (vez na Belém)"
na Roleta Liberdade. Chave: a mesma `vez_unica_por_zona`.

## 5. Migração dos times (determinística, reversível)

Quem estava ativo numa roleta de zona entra na(s) roleta(s) das filiais que
atendem aquela zona — a **união**: Oeste ∪ Norte ∪ Sul → Barra Funda; Centro
∪ Leste → Liberdade; Leste ∪ Grande SP → Belém. Quem atende a Leste entra
nas duas (Liberdade e Belém); a gestão enxuga na Central (lista no §8).

Atributos da união, por corretor e filial: `ativo` = algum ativo;
`ultimo_lead_em` = o mais recente (ninguém fura a fila por ter mudado de
roleta); `pausado_ate`/`motivo_pausa` = a pausa mais longa em vigor;
`limite_diario` = o maior definido (NULL = padrão); `tier` = o da linha
com `tier_updated_at` mais recente; `wrr_current` = 0 (cursor do modelo v2,
hoje desligado); `incluido_em`/`incluido_por` = o mais antigo. Uma linha em
`roleta_participantes_log` por inclusão ("Roletas por filial (12/10/2026):
união das zonas da filial").

Pino antigo em `leads.roleta_slug` (1.831 leads vivos): `zona-oeste`,
`zona-norte`, `zona-sul` → `filial-barra-funda`; `zona-centro` →
`filial-liberdade`; `zona-grande-sp` → `filial-belem`; `zona-leste` → a
filial em que o corretor atual do lead está (Liberdade se estiver nas duas;
sem corretor, `NULL` — o rodízio decide no próximo repasse).

Cota diária: passa a contar por roleta de filial (uma cota por filial, não
uma por zona). Quem estava em três zonas da mesma filial tinha três cotas;
agora tem uma. Ajuste na Central se precisar.

Rollback (script, não migration): reativar as 6 roletas, devolver as 6
linhas de `zonas_roletas` (1:1), desativar as 3 de filial — as linhas de
participação antigas continuam lá, intactas.

## 6. O que a gestão e o SDR veem

- **Central de Distribuição → Filas**: grupo "Roletas por filial" com as três;
  cada uma diz as zonas que atende ("Leste · alterna com a Belém").
- **Visão geral**: um cartão por filial.
- **Corretores**: a região passa a ser escolhida por filial (três caixas:
  "Belém — Leste, Grande SP"); por baixo é a mesma RPC
  (`atualizar_corretor_distribuicao`) recebendo a união das zonas das
  filiais marcadas, reescrita para incluir/remover por roleta inteira.
- **A vez por zona / Pré-venda**: o SDR continua escolhendo a zona da visita;
  a tela mostra a fila do SDR e, embaixo, as roletas de filial daquela zona,
  com "da vez" na que recebe o próximo lead da zona.
- **Central de Comando → Sua vez**: "Roleta Belém — 2º de 7"; fora pela vez
  única: "Sua vez agora é na Belém: Roleta Liberdade".

## 7. Peças no banco

| Peça                                                                      | O quê                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `zonas_roletas (zona, roleta_slug, ultimo_lead_em)`                       | O mapa e o cursor do rodízio entre as roletas da mesma zona.                                                 |
| `roletas.filial_id`                                                       | A filial da roleta (nome e ordem nas telas).                                                                 |
| `_roletas_da_zona(zona)`                                                  | As roletas da zona na ordem do rodízio, com `pronta` e `da_vez`.                                             |
| `roleta_da_zona(zona)`                                                    | Mesma assinatura de antes: a roleta da vez (pronta), ou NULL.                                                |
| `_distribuir_lead_v3`, `_distribuir_lead_sdr`                             | Pino válido → da vez → próxima pronta; grava o cursor do par ao entregar.                                    |
| `_roleta_pronta_para_lead(slug, tentaram)`                                | Pronta para este lead: alguém apto que ainda não o teve (a escolha da filial no motor).                      |
| `atualizar_corretor_distribuicao`                                         | Inclui/remove por roleta inteira (zonas desejadas = união de filiais).                                       |
| `_vez_unica_unidades(familia)` e as peças da vez única                    | Unidade = zona (SDR) ou roleta (filiais).                                                                    |
| `roletas_filas_zona_v1`, `minhas_posicoes_roletas_v1`                     | Todas as roletas da zona, com `da_vez`, `filial` e `zonas`; posição por roleta de filial; campanha sem zona. |
| `_lead_liberado_por_campanha`, `tg_leads_guarda_zona`, `transferir_leads` | Lead de campanha vai para quem está na campanha, de qualquer zona.                                           |
| `criar_roleta_campanha`, `atualizar_roleta`                               | Campanha com filial (`_filial_slug`).                                                                        |

## 8. Em produção

(preenchido na aplicação: horário, conferências, os três times e a lista de
quem ficou em duas ou três filiais para a gestão enxugar.)

## 9. Testes

- Banco: `tests/db/roletas-por-filial.test.ts` (mapa, rodízio da Leste,
  filial sem apto é pulada — também quando só quem já teve o lead está apto
  —, pino respeitado e com queda para a outra, união dos atributos, cursor
  do par, SDR reserva, vez única por roleta, telas por roleta). Ajustados:
  `zona-estrita`, `roletas-fila-zona`, `vez-unica-zona`, `sdr-zona`,
  `sdr-passagem`, `marquinhos-na-zona`, `repasse-sla-campanha` (slugs e
  expectativas por filial; região por filial; campanha de equipe fixa sem
  corte por zona). `tests/db/helpers.ts`: `darRegiao` por filial e
  `limparDados` zera o cursor do rodízio entre filiais.
- Telas: `central-distribuicao-unica`, `zona-estrita`, `roletas-por-zona`,
  `roletas-fila-zona` (chips, "da vez", editor por filial).
