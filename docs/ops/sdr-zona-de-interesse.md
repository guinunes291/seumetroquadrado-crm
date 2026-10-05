# SDR: zona de interesse obrigatória no registro (05/10/2026)

**Decisão do dono.** _"O lead que vem agendado ou com análise do SDR, quando
eles vão fazer o registro, é necessário que selecionem a zona em que o
cliente tem interesse para que o lead seja direcionado para corretores que
atendem aquela zona."_

## 1. O problema, em uma tela

A zona estrita (03/10/2026, migrations `20261009120000` e `20261009120100`) já
faz a entrega do SDR respeitar a região: a roleta de agendados filtra por
quem atende a zona do lead e, sem ninguém, vai ao time da zona. O furo era
antes disso: o lead **sem zona resolvível** (sem zona na ficha, sem bairro
mapeado, sem projeto com zona) "segue o fluxo por origem" e cai com qualquer
corretor. E os dois diálogos do SDR (Agendar visita, Entregar ao corretor)
nunca perguntavam a zona.

Produção, 05/10/2026, somente leitura (`distribution_log` × `leads`):

| Caminho do SDR (60 dias) | Entregas | Lead sem zona resolvível hoje |
| ------------------------ | -------- | ----------------------------- |
| Visita agendada pelo SDR | 27       | 11                            |

Onze de 27 visitas marcadas pelo SDR saíram para um corretor sem que o
sistema soubesse a zona do cliente.

## 2. O que o banco faz (migration `20261010120900_sdr_zona_obrigatoria`, Drizzle `0060`)

| Peça                                     | O que é                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_sdr_exigir_zona(lead, zona)`           | A exigência, uma função só. Zona informada: canoniza (`zona_canonica`: "Zona Leste" → Leste, "ABC" → Sul, "Guarulhos" → Grande SP; inválida → `22023`) e grava em `leads.zona`. Depois exige `zona_do_lead(lead)` não nula (zona da ficha → bairro mapeado → projeto); senão **SQLSTATE `SMQZ2`** com mensagem legível e `DETAIL {lead_id, campo}`. |
| `agendar_visita_sdr(…, _zona)`           | Ganha `_zona` (DEFAULT NULL, para quem só tem bairro ou projeto) e chama a exigência **antes da roleta**: sem zona nada é gravado (sem agendamento, sem log). A assinatura antiga caiu.                                                                                                                                                             |
| `entregar_lead_sdr(lead, motivo, _zona)` | Idem.                                                                                                                                                                                                                                                                                                                                               |
| `trg_sdr_visita_roleta_fn`               | A visita pelo modal comum num lead da base do SDR exige a zona da ficha, no mesmo ponto em que já exige o endereço.                                                                                                                                                                                                                                 |

A exigência vale com a zona estrita ligada **ou desligada**: a zona é um dado
que só o SDR tem, e fica gravado para quando a régua religar. A zona escolhida
no registro vale mais que a da ficha (o SDR acabou de falar com o cliente).

## 3. O que a tela faz

- Os dois diálogos ganham o campo **"Zona de interesse do cliente \*"**
  (seis chips: Norte, Sul, Leste, Oeste, Centro, Grande SP). O botão de
  envio trava sem ele.
- A zona que o banco já resolve pela ficha (`zona_do_lead`) entra como
  sugestão; o SDR confirma ou troca.
- O toast de sucesso diz a zona; o erro do banco (`SMQZ2`) chega como
  mensagem.

## 4. Como foi conferido

- `tests/db/sdr-zona.test.ts`: sem zona → `SMQZ2` e nada gravado; mensagem e
  `DETAIL`; com zona → canoniza, grava e entrega a quem atende (quem está na
  frente do rodízio mas é de outra zona é pulado); a escolha vale mais que a
  ficha; zona inválida; bairro mapeado resolve sozinho; ninguém da zona →
  o lead fica na base; entregar com a mesma exigência; modal comum; zona
  estrita desligada; acesso (anon sem EXECUTE, assinaturas antigas sumiram).
- `tests/db/sdr.test.ts` passou a dar zona a todo lead e região completa aos
  corretores: o motor continua testado, a regra nova vive na suíte própria.
- `tests/sdr-zona.test.tsx`: campo obrigatório nos dois diálogos, sugestão do
  banco, zona no pedido, erro do banco no toast, fiação.

## 5. Deploy

`0060` entra na mesma transação das pendentes (`0054`–`0059`) no próximo
publish; só funções, sem dado movido. Depois do publish, os types gerados do
Supabase podem ser regerados para tipar `_zona` (hoje as duas chamadas passam
pela fronteira `rpc`).
