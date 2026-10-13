# Presença por filial — check-in e a regra do plantão

Pedido do dono (09/10/2026): _"Hoje temos 3 filiais: Barra Funda, Liberdade e
Belém. Preciso de um hub em que os corretores marquem em que loja estão logando
e marcando presença no dia para que estejam aptos para algumas roletas de
leads. Corretores com menos de 3 vendas no mês não podem pegar lead em casa,
apenas com presença no plantão."_

Decisões do dono na revisão (09/10/2026, noite):

1. As filas continuam as de hoje (zona, campanha, Marquinhos…): quem está
   cadastrado na fila recebe depois de registrar presença em **qualquer**
   filial. Não há roleta por filial.
2. O corretor precisa estar presente para receber leads de **todas** as filas
   em que está apto.
3. (Respondida no contexto de roleta por filial, que não existe — ver §9.)
4. Com a meta batida, em casa ele entra em todas as filas em que está apto.
5. A meta conta as vendas do **mês anterior**.

Migration: `supabase/migrations/20261013120000_presenca_por_filial.sql`
(espelho `drizzle/migrations/0074_presenca_por_filial.sql`). Testes:
`tests/db/presenca-filial.test.ts` (regra no banco) e
`tests/presenca-derive.test.ts` (tela).

## 1. Como era e por que não servia

| Antes                                                                                                                      | Efeito                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Todo login marcava presença sozinho (`auth-guard.ts`, "auto check-in", a cada hora)                                        | Quem abria o CRM de casa, do celular, às 22h, entrava na roleta   |
| A presença não dizia ONDE o corretor estava                                                                                | Impossível separar plantão de casa                                |
| O corretor podia ligar `profiles.presente` com um UPDATE direto no próprio perfil (a trava de campos sensíveis não cobria) | Qualquer regra de presença seria contornável pelo DevTools        |
| Cada fila tinha um interruptor "Exigir presença"                                                                           | Bastava desligar numa fila para a regra do plantão não valer nela |

Em 09/10 às ~18h, 24 corretores estavam "presentes" — todos pelo auto check-in.

## 2. A regra

O corretor faz o check-in em **/presenca** escolhendo **Barra Funda**,
**Liberdade**, **Belém** ou **Em casa**:

| Check-in                                             | Recebe das filas em que está?             | Pelo fallback (roleta vazia, §8c)?                                                        |
| ---------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Numa filial (plantão) — qualquer uma das três        | Sim — desde 12/10, com o GPS na loja (§3) | Sim                                                                                       |
| Numa filial, **barrado** pelo GPS (§3)               | **Não**                                   | **Não**, no dia — salvo check-in posterior que valha na loja ou liberação da gestão (§8c) |
| Em casa, com **3+ vendas** aprovadas no mês anterior | Sim                                       | Sim                                                                                       |
| Em casa, com **menos de 3** vendas no mês anterior   | **Não** (fica registrado, com o motivo)   | Sim (disse a verdade)                                                                     |
| Sem check-in, ou check-in encerrado                  | Não                                       | Não                                                                                       |

A fila **Agendados do SDR** não exige presença (§9): as visitas marcadas pelo
SDR chegam com ou sem check-in, inclusive para o barrado.

**"Vendas no mês anterior"** = vendas com `status_venda = 'aprovada'`, sem
distrato, com `data_assinatura` no mês-calendário anterior (BRT). Em outubro,
valem as assinadas em setembro. É o mesmo critério do tier de comissão
(`corretor_vendas_trimestre`), só que no mês. Venda **pendente** não conta
(senão bastaria lançar uma venda para trabalhar de casa).

Por que mês anterior é melhor do que o mês corrente: a meta fica **fixa o mês
inteiro** — não zera no dia 1º (com o mês corrente, todo mundo começaria o mês
preso ao plantão) e o corretor sabe no dia 1º se vai poder trabalhar de casa
até o dia 30. Ela só muda se a gestão aprovar ou distratar uma venda do mês
anterior.

Exemplos (em outubro):

- **Ana**, 0 vendas em setembro, check-in "Em casa" às 9h → registrado, fora
  das filas (mas pode receber pelo fallback quando a roleta esvazia, §8c). O
  card diz: _"Em casa, a roleta só libera com 3 vendas aprovadas em setembro —
  você teve 0. Para receber leads da roleta hoje, é preciso estar numa
  filial: vá até a loja e faça o check-in de lá."_ Às 10h ela chega na Barra
  Funda, faz o check-in lá → recebe da Zona Oeste, da campanha em que está e
  do Marquinhos (as filas em que já estava).
- **Beto**, 3 vendas aprovadas em setembro, check-in "Em casa" → recebe de
  todas as filas em que está, o mês de outubro inteiro.
- **Caio**, em setembro: 2 aprovadas + 1 pendente + 1 com distrato; em
  outubro: 1 aprovada → conta **2** (a de outubro só vale em novembro). Em
  casa, fora das filas. Se a gestão aprovar a venda pendente de setembro, ele
  clica "Em casa" de novo e entra.

### Check-in obrigatório para usar o CRM (decisão do dono, 12/10/2026)

_"checkin obrigatório"_: o corretor faz o check-in — **Barra Funda**,
**Liberdade**, **Belém** ou **Em casa** — para usar o CRM, não só para
receber leads. Vale para **quem tem o papel corretor**, inclusive quem também
é gestor (em 12/10, uma conta: Ingrid Queiroz). A obrigatoriedade é da tela;
no banco, sem check-in de hoje ele não recebe de fila nenhuma (decisão 2) nem
pelo fallback por velocidade (§8c, desde a `0082`), e o que libera ou não a
roleta continua decidido no próprio check-in (a regra das vendas acima e a da
localização, §3).

<!-- TELA -->

**O que o corretor vê.** Ao abrir o CRM sem nenhum check-in no dia, aparece um diálogo que não fecha: nem ESC, nem clique fora, nem X. Ele traz o título _"Check-in de hoje"_ e a frase _"Para usar o CRM hoje, diga onde você está."_. As opções são:

- **Barra Funda**, **Liberdade** e **Belém**, com o endereço curto embaixo (ou _"Plantão: libera a roleta"_);
- **Em casa**, com _"Libera a roleta (meta de setembro batida)"_ ou _"Não libera a roleta: 2 de 3 vendas em setembro"_.

Embaixo das opções:

- a dica _"Fora de uma filial (casa, visita, estande)? Escolha Em casa."_;
- a régua _"Vendas aprovadas em setembro: 2 de 3"_, com _"este mês, a roleta só libera no plantão"_ ou _"este mês, pode receber leads de casa"_ (a régua some quando o mínimo é 0);
- o aviso _"Na filial, a localização do celular é conferida quando você toca em Incluir minha localização e no momento do check-in: o check-in só vale de dentro da loja. Em casa, a localização nunca é pedida."_ (com a exigência desligada: _"Na filial, o celular informa a localização só quando você toca em Incluir minha localização ou faz o check-in, para confirmar o plantão. Em casa, a localização nunca é pedida."_).

As opções, a régua e a confirmação são as mesmas do card de /presenca e Meu Perfil. A trava é só da tela (`src/features/presenca/checkin-obrigatorio-global.tsx`, carregada sob demanda no shell). Ela não está no `beforeLoad`, para uma falha de leitura nunca barrar a navegação.

**Ordem da abertura.** Onboarding (treino prático) → **check-in** → estudo do funil (quinta) → metas do dia. O diálogo só abre depois que o treino está decidido e fora da tela, seja o obrigatório, seja o reaberto pelo menu. Assim o treino não é atrapalhado (AGENTS.md). O estudo e as metas esperam o check-in **e** o diálogo fechar, inclusive enquanto ele explica um barrado.

**Confirmação antes da filial.** Com a exigência de localização ligada, tocar numa filial não faz o check-in. Abre a pergunta _"Você está dentro da loja {Filial} agora?"_, com _"O celular vai conferir. Se não confirmar, o check-in fica barrado e você fica fora das roletas e do reforço hoje."_ e os botões **[Voltar]** e **[Estou na loja]**. No computador (aparelho sem tela de toque), entra mais um aviso: _"No computador a localização costuma falhar: se puder, faça o check-in pelo celular."_. "Em casa" nunca pede confirmação nem localização. Com a exigência desligada, a filial vai direto.

A confirmação evita o toque de sondagem. Em 11/10, 2 dos 3 corretores que usaram o check-in saíram de "Em casa" para uma filial e voltaram em segundos. Desde a `0082`, esse toque custa o reforço do dia.

#### Incluir minha localização (desde 13/10/2026)

Pedido do dono: ler o GPS **antes** da escolha e mostrar a distância até cada filial. Aparece no diálogo (obrigatório e voluntário), entre o cabeçalho e as opções, e no card de /presenca e Meu Perfil, entre _"Onde você está trabalhando hoje?"_ e as opções. Só aparece se alguma filial tem coordenadas. Vale com a exigência ligada ou desligada.

- **O que lê.** No toque do botão **Incluir minha localização**: o GPS na hora (`maximumAge 0`, até 10 s) e as coordenadas das filiais direto da tabela `filiais`, lidas de novo a cada toque (a gestão pode ter mudado o pino; sem rede, valem as últimas lidas, e sem nenhuma a tela diz que as distâncias não carregaram). Nada é lido ao abrir o diálogo ou o card, e nada fica observando a posição.
- **Nada vai ao servidor.** A distância é calculada no aparelho; a posição fica só na memória daquela tela (nunca em storage, URL, cache ou Sentry) e some ao fechar.
- **Validade de 60 s** (o mesmo `maximumAge` que o check-in já aceitava). Vencida, a tela diz a hora e o toque volta ao fluxo de antes (a pergunta e a leitura na hora). Nada bloqueia.
- **Lendo:** o botão vira _"Lendo a localização…"_ (girando) e as opções travam; ao lado, **Cancelar** descarta a resposta que ainda vai chegar.

A linha sob o botão:

| Estado                       | Texto                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Antes do toque               | _"Mostra a que distância você está de cada filial antes de escolher. Nada é registrado."_                                                                                                                                                              |
| Incluída                     | _"Localização incluída (±40 m)"_ (sem a precisão do aparelho: _"Localização incluída"_)                                                                                                                                                                |
| Precisão acima de 1 km       | _"Localização aproximada (±5 km): não dá para saber em que filial você está."_ + _"Ligue a localização precisa do celular e inclua de novo."_ (no computador, o aviso dele)                                                                            |
| A tabela de filiais não veio | _"Localização incluída (±40 m), mas as distâncias não carregaram agora: escolha normalmente."_                                                                                                                                                         |
| Vencida                      | _"A localização das 09:31 venceu: inclua de novo para ver as distâncias."_                                                                                                                                                                             |
| Falhou                       | _"O navegador bloqueou a localização"_, _"O celular não informou a localização"_, _"Este navegador não informa a localização"_ ou, no computador, _"Este computador não informou a localização"_, com o mesmo passo a passo do barrado sem localização |

Sob cada filial, no lugar do endereço curto:

| Situação                            | Rótulo                                                       |
| ----------------------------------- | ------------------------------------------------------------ |
| A filial dentro do raio mais perto  | **Você está aqui** (verde, com a borda da opção em destaque) |
| Outra filial dentro do raio         | _"Dentro do raio (a 250 m)"_ (verde)                         |
| Fora do raio                        | _"a 6,1 km"_                                                 |
| Leitura aproximada (> 1 km)         | _"≈ 6,1 km"_, e ninguém é "aqui"                             |
| Filial sem coordenadas, sem leitura | o endereço curto, como antes                                 |

A ordem das filiais **nunca muda** (nada sai de baixo do dedo).

**A tela é prévia; quem decide é o banco.** A conta é um espelho termo a termo de `public._distancia_metros` e de `presenca_checkin` (`0082`): `2·6 371 000·asin(√(sin²(Δlat/2) + cos(lat₁)·cos(lat₂)·sin²(Δlng/2)))`, arredondada como o `round()` do Postgres em double (**rint**: o empate vai para o par — `Math.round` daria "dentro" onde o banco diz "fora"), e dentro ⇔ distância ≤ raio + min(precisão arredondada, 150). Para pular a pergunta, a tela ainda exige **1 m de folga** sobre o limite: a diferença de matemática entre o aparelho e o Postgres nunca vira um barrado surpresa. `tests/db/presenca-previa-paridade.test.ts` confere no CI a distância (300 pontos) e a decisão nas bordas contra o banco de verdade.

Falha da leitura vai para o Sentry com prefixo próprio, `geolocalizacao-previa:<falha>` (e `geolocalizacao-previa:aproximada`), área `presenca.previa` — separada do `geolocalizacao:<falha>` do check-in (§3).

#### Tocar a filial com a localização incluída

A regra, nesta ordem (a primeira que bater):

1. **Exigência desligada** → o check-in vai direto (com a leitura, se houver; sem ela, o GPS é lido na hora, como antes).
2. **Filial sem coordenadas** → a pergunta de antes (o banco libera com `filial_sem_coordenadas`).
3. **O Incluir acabou de falhar** (até 60 s) → o aviso de "sem localização", **sem** RPC.
4. **Sem leitura válida, ou sem as distâncias** → a pergunta de antes.
5. **Fora do raio** → o aviso antes do check-in, **sem** RPC (com ou sem leitura aproximada).
6. **Dentro, mas leitura aproximada** → a pergunta.
7. **Dentro com 1 m de folga** → check-in **direto**, sem a pergunta, com a **mesma** leitura (no iPhone, nenhum segundo pedido de permissão).
8. **Na borda exata** → a pergunta.

Tocar a filial em que ele já está na roleta só avisa (_"Você já está na roleta hoje: Barra Funda."_), sem RPC; no diálogo voluntário, fecha.

Antes de **qualquer** RPC (direto, resgate, "assim mesmo", Estou na loja, Em casa), a presença é relida na hora: se o check-in de hoje já liberou a roleta sem ele ver, fecha com o verde e não chama `presenca_checkin`. Se a leitura venceu durante essa releitura, nada de RPC com posição velha: abre a pergunta dessa filial. Na pergunta, **Estou na loja** reaproveita a leitura do painel (se ainda vale) **só se não houve barrado no mesmo diálogo**; depois de um barrado, a posição é lida na hora, como sempre.

Se a prévia disse "dentro" e o banco, com a mesma leitura, não confirmou, a tela mostra o que o banco devolveu (o barrado) e o Sentry recebe `presenca:previa_divergente:dentro:<localizacao>` (área `presenca.previa`, sem coordenada nem distância).

#### O aviso antes do check-in

No diálogo é uma tela; no card, aparece no lugar das opções. O foco vai para o título.

- **Título:** _"Você está a 6,1 km da filial Liberdade"_; com a leitura aproximada, _"A localização deste aparelho é aproximada (±5 km)"_ (mais _"Ligue a localização precisa do celular e inclua de novo."_, ou o aviso do computador); sem localização, _"Sem a localização, o check-in na filial Belém fica barrado"_, com o passo a passo da falha.
- **Consequência:** _"Se fizer o check-in na filial Liberdade agora, ele fica barrado: você fica fora das roletas e do reforço hoje. O reforço só volta com um check-in na loja que valha (ou se a gestão liberar você); escolher Em casa depois não devolve. As visitas marcadas pelo SDR continuam chegando."_ Já barrado hoje: _"Se fizer o check-in na filial Liberdade agora, ele também fica barrado: você continua fora das roletas e do reforço hoje."_.
- **O que encerra** (só com um check-in valendo): _"Isso também encerra o plantão na Barra Funda confirmado pela gestão."_, _"Isso também encerra a liberação da gestão de hoje."_ ou _"Isso também encerra o seu check-in de agora (Barra Funda), que está valendo."_.
- **Dica** (fora, leitura precisa): _"Está dentro da loja e o celular não confirma? Peça ao gestor para confirmar no plantão."_.
- **Resgate**, quando a leitura precisa diz que ele está noutra filial: _"Pela localização, você está na filial Barra Funda."_.

Botões, nesta ordem: **Fazer check-in na Barra Funda** (o resgate: o caminho direto dessa filial, com a mesma leitura), **Voltar** (às opções, com a prévia), **Incluir minha localização de novo** (no sem localização, **Incluir minha localização**: volta às opções e relê; **não** faz check-in depois) e o link **Fazer o check-in na filial Liberdade assim mesmo**, que lê a posição **de novo** (`maximumAge 0`) e deixa o banco decidir.

**Enquanto confere.** Os botões travam e aparece _"Conferindo a localização…"_ (no "Em casa", _"Registrando o check-in…"_). Para o leitor de tela:

- o foco vai para o título de cada tela nova, nunca para uma filial (um Enter solto não faz check-in);
- uma região `aria-live`, sempre montada, troca só o texto: primeiro o "Conferindo…", depois o motivo do barrado ou do recusado.

**Depois do check-in:**

| Resultado do banco                                     | O que a tela faz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liberou a roleta                                       | Fecha. Toast verde _"Check-in feito: Barra Funda. Você está na roleta hoje."_ (ou _"Check-in feito: Em casa. Você está na roleta hoje."_). O verde só aparece quando o banco liberou.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Em casa abaixo do mínimo (`casa_abaixo_minimo_vendas`) | Mostra a tela _"Check-in feito: Em casa"_ com _"Em casa, a roleta só libera com 3 vendas aprovadas em setembro — você teve 2. Para receber leads da roleta hoje, é preciso estar numa filial: vá até a loja e faça o check-in de lá."_ e _"Você já pode usar o CRM: o check-in de hoje está feito."_. **Libera o CRM** (**Entendi**, ESC, X ou clique fora): ele disse a verdade e segue podendo receber pelo fallback. Se antes, no mesmo diálogo, um check-in na filial foi barrado, acrescenta _"Como o check-in na filial foi barrado hoje, você também fica fora do reforço até um check-in na loja que valha (ou a gestão liberar você)."_.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Filial, fora do raio (`fora_da_filial`)                | O diálogo **continua**. Título _"A localização não confirmou a filial Barra Funda"_. Motivo: _"A localização deste aparelho ficou a 5,8 km da filial Barra Funda. O check-in na filial só vale de dentro da loja. Se você está na loja, peça ao gestor para confirmar no plantão."_. Quando o aparelho informa precisão acima de 1 km (Wi-Fi ou IP, típico de computador), a tela não acusa a distância. O título vira _"A localização deste aparelho é aproximada"_, e o motivo, _"A localização deste aparelho é aproximada (±5 km): faça o check-in pelo celular, de dentro da loja, ou peça ao gestor para confirmar no plantão."_.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Filial, sem localização (`sem_localizacao`)            | O diálogo **continua**. O título é _"Sem a localização do celular"_ (no computador, _"Sem a localização deste computador"_). O texto diz o que fazer conforme o navegador respondeu. Permissão negada: _"O navegador está bloqueando a localização para o CRM. Para liberar no Android (Chrome): toque no cadeado (ou no ícone) ao lado do endereço do site → Localização → Permitir. No iPhone (Safari): toque em aA ao lado do endereço → Ajustes do Site → Localização → Permitir; se não aparecer, vá em Ajustes → Privacidade e Segurança → Serviços de Localização → Sites do Safari → Durante o Uso do App. Depois, tente de novo."_. GPS indisponível ou sem resposta: _"O celular não conseguiu informar a localização. Ligue a localização do celular e tente de novo, de preferência perto de uma janela."_. Navegador sem suporte: _"Este navegador não informa a localização. Abra o CRM no navegador do celular (Chrome ou Safari) e tente de novo."_. No computador, qualquer falha: _"No computador a localização costuma falhar: faça o check-in pelo celular, de dentro da loja, ou peça ao gestor para confirmar no plantão."_. O porquê vai para o banco (`_falha_localizacao` → `falha_localizacao`, §3) e para o Sentry (`geolocalizacao:<falha>`). Se o banco ainda não tem a `0082` (erro PGRST202), o mesmo check-in é refeito sem o parâmetro.                                                                          |
| Barrado (qualquer dos dois)                            | Diz _"Seu check-in em Barra Funda ficou registrado, mas não vale para as roletas nem para o reforço de hoje. Visitas marcadas pelo SDR continuam chegando."_ e, sem localização, _"Chegou à loja depois? Inclua a localização pela faixa no topo do CRM ou pelo Check-in da barra lateral."_ (fora do raio: _"Chegou à loja depois? Refaça o check-in pela faixa no topo do CRM ou pelo Check-in da barra lateral."_). Botões: sem localização, **Incluir localização** (desde 13/10: lê o GPS **antes** e refaz na mesma filial com essa leitura; se a leitura falhar, nada é gravado, o motivo muda para o da falha nova e o Sentry conta `geolocalizacao:<falha>`, porque é uma tentativa de check-in); fora do raio, **Tentar de novo** (lê o GPS na hora, sem reaproveitar a posição antiga); e **Estou em casa** e **Continuar fora das roletas**. Com a localização incluída ainda valendo e dizendo que ele está noutra filial, aparece o resgate _"Pela localização, você está na filial Barra Funda."_ com **Fazer check-in na Barra Funda**. O link **Escolher outra filial** volta às opções sem marcar a filial barrada. A filial nova pede a confirmação e também lê o GPS na hora, e o "Continuar fora das roletas" continua lá. Se um desses der erro técnico, aparece _"Não foi possível registrar o check-in: {erro}"_, e o barrado e as saídas continuam. Não sai toast amarelo nem vermelho repetindo o que o diálogo já diz. |

**Barrado → "Estou em casa".** Com a meta, ou com o mínimo 0 como em 12/10, a roleta libera. O diálogo fecha com o verde, e o mesmo toast traz _"Como o check-in na filial foi barrado hoje, você também fica fora do reforço até um check-in na loja que valha (ou a gestão liberar você)."_. Abaixo do mínimo, aparece a tela do recusado com o mesmo aviso. O card de /presenca repete o aviso enquanto ele estiver em casa sem destrave (lido dos check-ins de hoje).

**Releitura de 15 s e o check-in que veio de fora.** Com o diálogo na tela, a presença é relida a cada 15 s, quando a aba volta a ficar visível e quando a janela ganha o foco. Se aparece um check-in de hoje que liberou a roleta, o diálogo fecha com um verde que diz de onde ele veio:

- feito no celular: _"Check-in feito: Barra Funda. Você está na roleta hoje."_;
- **Confirmar no plantão** da gestão: _"Plantão confirmado pela gestão: Barra Funda. Você está na roleta hoje."_;
- interruptor: _"Liberado pela gestão: você está na roleta hoje."_.

Um check-in de outro aparelho que não liberou também fecha o diálogo das opções, sem verde; a faixa passa a avisar.

Antes de **qualquer** check-in daqui (filial, Em casa, Tentar de novo, Estou em casa), a tela relê a presença na hora. Se o check-in de hoje já liberou a roleta, fecha sem chamar `presenca_checkin`, porque refazer encerraria a confirmação da gestão e gravaria um barrado novo.

**O card de /presenca e Meu Perfil.** É o mesmo check-in, com um cabeçalho que mostra a situação do dia:

- _"Você ainda não fez o check-in de hoje"_, com _"Sem check-in, você não recebe leads das roletas nem do reforço (as visitas marcadas pelo SDR continuam chegando). Escolha onde está trabalhando."_;
- _"Barra Funda — na roleta"_, com _"Você está apto a receber leads das roletas hoje."_;
- _"Barra Funda — fora da roleta"_, com o motivo (os mesmos textos da tabela acima);
- _"Presença encerrada (Barra Funda)"_, com _"Você saiu das roletas e do reforço. Faça o check-in de novo para voltar a receber."_.

Junto vem o selo da evidência: _"Na filial (80 m)"_, _"A 5,8 km da filial"_, _"Sem localização"_ ou _"Confirmado pela gestão"_.

Abaixo do cabeçalho:

- a pergunta _"Onde você está trabalhando hoje?"_, com as opções e a dica;
- a mesma confirmação [Voltar]/[Estou na loja];
- a régua das vendas;
- o botão **Encerrar presença**.

Depois do check-in sai um toast: verde quando liberou, ou amarelo _"Check-in registrado: Barra Funda. Você está fora da roleta."_ com o motivo.

O card tem a mesma proteção do diálogo. Antes de qualquer check-in, relê a presença na hora. Se o check-in de hoje já liberou a roleta e o corretor não estava vendo isso quando tocou, o card **não** chama a RPC. Ele avisa _"Você já está na roleta hoje: Barra Funda (plantão confirmado pela gestão)."_ (ou _"Você já está na roleta hoje: Barra Funda."_, _"Você já está na roleta hoje: liberado pela gestão."_, _"Você já está na roleta hoje: Em casa."_), fecha a confirmação e mostra o que vale agora. Tocar de novo a filial em que ele já está na roleta dá o mesmo aviso. Se ele já via o check-in valendo e escolheu outra filial ou "Em casa", é troca de propósito, e o check-in segue.

No barrado sem localização, o card diz _"Está na loja? Inclua a localização para ser liberado."_ com o botão **Incluir localização**: lê o GPS antes e refaz na mesma filial; se falhar, nada é gravado e o cabeçalho mostra o passo a passo novo. Um pedido do bloco da barra lateral (ou da faixa) feito em /presenca ou /meu-perfil é atendido pelo card: ele rola até o card e põe o foco no título _"Check-in de hoje"_ (nunca dois check-ins na tela).

Enquanto mostra um barrado, o card relê sozinho: a cada 15 s, quando a aba volta a ficar visível e quando a janela ganha o foco. Quando a gestão confirma no plantão ou o interruptor libera, ele sai do "fora da roleta" sem recarregar a página e para de reler. Uma releitura com erro mantém o último dado, sem trocar o card pela tela de erro.

**A faixa do topo.** Aparece fora de /presenca e /meu-perfil, inclusive em /modo-visita, onde o diálogo não abre.

- Barrado fora do raio (check-in aberto numa filial que a localização barrou): _"Seu check-in em Barra Funda não valeu: a localização não confirmou a loja. Chegou à loja? Refaça o check-in."_, com o botão **Refazer check-in** (leva a /presenca).
- Barrado **sem localização** (desde 13/10/2026): _"Seu check-in em Barra Funda ficou sem a localização e não vale para as roletas. Está na loja? Inclua a localização para ser liberado."_, com **Incluir localização** e o link **Refazer check-in** (/presenca). **Incluir localização** só pede: o diálogo abre (voluntário) no barrado, lê o GPS antes e refaz na mesma filial — liberou, verde e a faixa some; barrou de novo, o diálogo fica no barrado com o motivo. Se a gestão já confirmou antes, só o aviso _"Você já está na roleta hoje: Barra Funda (plantão confirmado pela gestão)."_ (ou, se a tela ainda não sabia, a releitura antes da RPC fecha com o verde da gestão). A faixa nunca chama a RPC.
- Enquanto mostra qualquer barrado, a faixa relê a presença (15 s, aba e janela). Ela **some sozinha** quando a gestão confirma no plantão, quando o interruptor libera ou quando chega de outro aparelho um check-in que vale.
- Sem check-in ou presença encerrada: _"Faça o check-in de hoje."_ ou _"Sua presença de hoje foi encerrada."_, mais _"Escolha a filial em que você está (ou se está em casa) para entrar nas roletas de leads."_, com o botão **Fazer check-in**. Essa faixa não relê.

#### Bloco de check-in na barra lateral (desde 13/10/2026)

No rodapé da barra lateral, entre Configurações (admin) e o menu da pessoa, um bloco fixo diz onde e como o corretor está hoje, com a ação do momento. É painel de **estado**, não seção nem módulo (fora da regra dos 2 menus). Só para quem tem o papel corretor (inclusive gestor e corretor); a gestão sem o papel não vê nem lê nada.

| Situação                 | Linha                                                                | Estado                                                                             | Bolinha  | Ação                                |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- | ----------------------------------- |
| A leitura falhou         | —                                                                    | _"Não deu para ler o check-in"_                                                    | neutra   | link **Abrir check-in** (/presenca) |
| Lendo                    | —                                                                    | _"Lendo o check-in…"_                                                              | neutra   | —                                   |
| Sem check-in             | _"Sem check-in hoje"_                                                | _"Fora das roletas"_                                                               | amarela  | **Fazer check-in**                  |
| Presença encerrada       | _"Barra Funda · saiu às 18:02"_                                      | _"Presença encerrada"_                                                             | neutra   | **Fazer check-in**                  |
| Barrado sem localização  | _"Barra Funda · 09:31"_                                              | _"Barrado: sem localização"_                                                       | vermelha | **Incluir localização**             |
| Barrado fora do raio     | _"Barra Funda · 09:31"_                                              | _"Barrado: a 6,1 km da loja"_ (aproximada: _"Barrado: localização aproximada"_)    | vermelha | **Refazer check-in**                |
| Na roleta                | _"Barra Funda · 09:31"_ (liberado: _"Liberado pela gestão · 09:31"_) | _"Nas roletas"_ (confirmado pela gestão: _"Nas roletas · confirmado pela gestão"_) | verde    | **Trocar**                          |
| Em casa abaixo do mínimo | _"Em casa · 09:31"_                                                  | _"Fora das roletas: 2 de 3 vendas"_                                                | amarela  | **Trocar**                          |

- O estado é sempre **texto** (a cor nunca é a única pista). Sem `aria-live`: o toast e a região do diálogo já anunciam.
- **Toda ação só pede** (`pedirCheckin`): quem faz o check-in é o diálogo, em qualquer tela, ou o card em /presenca e /meu-perfil. O bloco nunca chama `presenca_checkin`.
- **Barra recolhida (72 px):** um ícone com a bolinha da cor do estado. O `aria-label` diz tudo (_"Check-in: Barra Funda · 09:31, Nas roletas. Abrir o check-in."_), e o clique **sempre** abre o diálogo (nunca refaz no próprio ícone). Com a leitura falhando, vira link para /presenca.
- **Celular:** o bloco vem junto no menu (Sheet). O toque fecha o Sheet e abre o diálogo com o foco no título (o Sheet não devolve o foco ao ☰ por cima dele).
- **Sem leitura própria:** usa a mesma leitura da presença do shell (a que decide o check-in obrigatório), sem intervalo nem foco — nenhuma consulta a mais.
- Com o treino do onboarding na tela, os botões ficam desabilitados (AGENTS.md).

#### Trocar pelo diálogo (voluntário)

O bloco da barra lateral e a faixa abrem o **mesmo** diálogo do check-in, em modo voluntário:

- abre em qualquer tela, inclusive /modo-visita; em /presenca e /meu-perfil quem atende é o card (rola e põe o foco no título);
- **nunca prende**: ESC, X e clique fora fecham;
- a descrição diz onde ele está agora: _"Agora: Barra Funda · 09:31 — nas roletas. Para trocar, escolha onde você está."_ (sem check-in: _"Diga onde você está para entrar nas roletas."_; encerrado: _"Agora: Barra Funda · saiu às 18:02 — presença encerrada. Escolha onde você está para voltar às roletas."_); o título continua _"Check-in de hoje"_;
- com o plantão confirmado pela gestão, uma caixa avisa: _"Seu plantão na Barra Funda foi confirmado pela gestão. Um check-in novo substitui essa confirmação."_ (liberado pelo interruptor: _"Você foi liberado pela gestão hoje. Um check-in novo substitui essa liberação."_);
- não fecha sozinho ao ver o check-in que ele veio trocar; fecha com o verde só quando chega um check-in **novo** que liberou (o celular, a gestão);
- no barrado, **Refazer check-in** abre direto na tela do barrado (e **Incluir localização** já refaz);
- erro técnico: _"Não foi possível registrar o check-in ({erro}). Tente de novo ou feche esta janela."_, sem o "Continuar sem check-in";
- o pedido vale 15 s; com o treino do onboarding na tela é **descartado** (nada abre por cima do treino); com o treino ainda não decidido ou a presença ainda chegando, espera;
- se o dia virar com ele aberto, vira **obrigatório**: o X some, a descrição volta a _"Para usar o CRM hoje, diga onde você está."_ e as telas zeram.

**Quem não passa pela trava, e quando ela não abre:**

- gestão **sem** papel corretor (admin, gestor, superintendente) e SDR: nem leem a presença;
- quem é gestor **e** corretor passa pela trava (decisão do dono: vale para quem tem o papel corretor);
- quem já fez **qualquer** check-in hoje: aberto, encerrado, barrado pela localização ou liberado pela gestão (o "Encerrar presença" não reabre o diálogo; fica a faixa);
- nas telas que já têm o card (/presenca e /meu-perfil) e na tela cheia de campo (/modo-visita) — em /modo-visita, o diálogo **voluntário** (pedido pelo bloco ou pela faixa) abre, e nunca prende;
- enquanto o treino do onboarding está na tela ou ainda não foi decidido;
- enquanto a leitura da presença carrega (nada pisca).

**Falha técnica nunca prende.**

- Se a **primeira** leitura da presença falha, o CRM fica liberado, e o estudo e as metas seguem.
- Já com o diálogo aberto, uma releitura que falha **não** fecha nada: vale o último dado bom, e a releitura de 15 s continua até a leitura voltar.
- Se o próprio check-in der erro técnico nas opções, o diálogo mostra _"Não foi possível registrar o check-in ({erro}). Tente de novo ou siga sem ele por hoje."_, com o botão **Continuar sem check-in**. Essa saída vale naquele aparelho até a meia-noite. Sem check-in, ele continua fora das roletas e do reforço, e a faixa segue avisando. (No voluntário, que não prende, não há essa saída: _"Tente de novo ou feche esta janela."_.)
- Na aba aberta desde ontem, a presença é relida na virada do dia (00:00, o reset diário; não há auto-checkout às 23h), e o check-in do dia novo é cobrado.

**No quadro da gestão (§4).**

- O número da coluna da filial conta só os válidos. Os barrados ficam no selo ao lado (_"1 barrado"_) e no tile _"Fora da conta: 1 barrado pela localização"_.
- O selo da linha diz o porquê: _"Barrado: a 5,8 km da filial"_ ou _"Barrado: sem localização (permissão negada)"_. Com a precisão acima de 1 km (coluna `precisao_m` de `presenca_hoje_v1`, desde a `0082`), aparece _"Barrado: localização imprecisa (±5 km)"_ no lugar da distância.
- Quem foi barrado e trocou para casa ganha o selo _"fora do reforço hoje"_.
- O menu **Confirmar no plantão** faz o check-in do corretor numa filial, com o toast _"{Nome}: check-in confirmado pela gestão."_.

<!-- /TELA -->

### Onde a regra mora

Os motores (roleta v3/`_elegibilidade_roleta`, campanha ponderada, repasse por
SLA, Escoar estoque) já liam a mesma chave: `profiles.presente`. **Nenhum
motor mudou.** A regra entra no único lugar que liga essa chave — o check-in
(`presenca_checkin`). Check-in em casa abaixo do mínimo grava a linha com
`apto_roleta = false` e deixa `presente = false`. A exceção, desde a `0082`,
é o fallback por velocidade (§8c): ele lê o próprio `presenca_checkins` (o
check-in de hoje aberto, e se houve barrado pela localização), porque
`presente = false` não distingue quem disse "Em casa" de quem não disse nada.

### Presença obrigatória em toda fila

Os motores só olham a presença em fila com `roletas.exigir_presenca`. A
migration liga essa chave em todas as filas e o gatilho
`trg_roletas_presenca_obrigatoria` religa em qualquer fila criada ou editada
depois (Central, `criar_roleta_campanha`, SQL avulso). Na Central, o
interruptor "Exigir presença" aparece travado.

**Exceção, por decisão do dono: Agendados do SDR.** A elegibilidade dessa
fila (`_elegibilidade_roleta_sdr`) nunca leu a presença: a política do SDR
(04/09, `docs/politica-sdr-v1.md` item 7) entrega a visita marcada pelo SDR por
**agenda livre no horário**, "sem presença do dia" — o SDR marca às 19h uma
visita para amanhã e o corretor recebe na hora. Continua assim (§9).

### Sem burla

- `presente`/`presente_em` só mudam pelas RPCs de presença
  (`protect_profile_sensitive_fields`, item 4): UPDATE direto é ignorado.
- `marcar_presenca(true)` (o que o auto check-in chamava) **não marca mais
  presença sem check-in** — responde _"Faça o check-in: escolha a filial…"_.
  Isso fecha a porta das abas antigas abertas no dia do deploy. Com check-in em
  casa aberto, ele reavalia (a gestão aprovou uma venda do mês anterior →
  entra).
- `marcar_presenca(false)` continua sendo o "Sair".

## 3. Filiais e localização

A migration cria as três filiais com endereço e coordenadas passados pelo
dono (09/10/2026 — o pino de cada loja no Google Maps), raio de 300 m:

| Filial      | Endereço                                                                  | Coordenadas            |
| ----------- | ------------------------------------------------------------------------- | ---------------------- |
| Barra Funda | Av. Marquês de São Vicente, 1619 - Barra Funda, São Paulo - SP, 01139-003 | -23.520116, -46.676975 |
| Liberdade   | Av. da Liberdade, 1000 - Liberdade, São Paulo - SP, 01502-001             | -23.561250, -46.638897 |
| Belém       | Av. Álvaro Ramos, 896 - Quarta Parada, São Paulo - SP, 03330-002          | -23.544943, -46.585915 |

Conferência: o ponto da Barra Funda fica a 222 m do centro da Av. Marquês de
São Vicente; o da Liberdade, a **491 m** do centro do CEP 01502-001 (que cobre
a avenida "do 370 ao fim"). É por isso que as coordenadas vêm do pino da loja e
não do CEP: com raio de 300 m, o centro do CEP faria todo check-in legítimo na
Liberdade aparecer "fora do raio" (`tests/db/presenca-filial.test.ts` prova os
dois casos).

**Filial nova** (ou para corrigir um ponto): /presenca → Filiais (admin ou
gestor) → **"Buscar pelo endereço"** (consulta o OpenStreetMap no navegador, o
mesmo do Mapa de Lojas) → **"Ver no mapa"** para conferir → **Salvar**. Se a
busca achar só a avenida (não o número), a tela avisa; nesse caso, no Google
Maps, botão direito na porta da loja → clique nos números → cole no campo.

No check-in **na filial**, o celular informa a localização **só naquele
momento** e quando o corretor toca **Incluir minha localização** — só na
tela: nada vai ao servidor, a distância é calculada no aparelho e serve de
prévia (§2, "Incluir minha localização"). No check-in, o banco calcula a
**distância até a loja** e descarta a coordenada (a tabela não tem
latitude/longitude do corretor). **Em casa, a localização nunca é pedida.**

| `localizacao`            | Quando                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `confirmada`             | dentro do raio (+ até 150 m de tolerância pela precisão do GPS)                                                         |
| `fora_do_raio`           | longe da loja                                                                                                           |
| `sem_localizacao`        | o corretor negou, o aparelho não tem GPS ou demorou 10 s — o porquê fica em `falha_localizacao` desde a `0082` (abaixo) |
| `filial_sem_coordenadas` | a filial ainda não tem coordenadas cadastradas                                                                          |
| `confirmada_gestao`      | a gestão fez o check-in pelo corretor                                                                                   |

De 09/10 a 12/10 a localização **só informou** (a gestão via no quadro: "Na
filial (80 m)", "A 4,2 km da filial"), como recomendado na entrega.

### Exigência LIGADA desde 12/10/2026, 14:19 BRT

Decisão do dono: _"localização deve barrar caso não esteja na filial"_. A
chave `presenca_loja_exige_localizacao` foi ligada em produção às 14:19 BRT
(com linha em `audit_log` dizendo a origem) e a migration `20261021120000`
(drizzle `0082`) registra o valor no repositório — ambiente novo já nasce
exigindo. A recomendação de rodar 1–2 semanas só informando ficou para trás
por decisão do dono.

O que muda para o corretor, no check-in **na filial**:

| Localização do check-in                                 | Até 12/10 14:19     | Desde 12/10 14:19                         |
| ------------------------------------------------------- | ------------------- | ----------------------------------------- |
| Dentro do raio (`confirmada`)                           | libera              | libera                                    |
| Longe da loja (`fora_do_raio`)                          | libera (só o aviso) | **não libera** — motivo `fora_da_filial`  |
| Sem localização (negou, aparelho sem GPS, demorou 10 s) | libera              | **não libera** — motivo `sem_localizacao` |
| Filial sem coordenadas (`filial_sem_coordenadas`)       | libera              | libera (não há como conferir)             |
| Feito pela gestão (`confirmada_gestao`)                 | libera              | libera                                    |

- O check-in barrado fica registrado, com a distância e o motivo; o corretor
  fica sem presença e fora das filas — e, desde a `0082`, **fora também do
  fallback por velocidade naquele dia** (§8c): quem disse estar na loja e
  não estava não recebe o lead que a exigência segurou. Trocar para "Em
  casa" depois devolve a roleta (se tiver a meta, ou com o mínimo 0), mas
  **não** o fallback. A fila Agendados do SDR continua entregando a ele (§9).
- **Em casa** continua sem pedir localização (e com a regra das vendas).
- A regra vale **no momento do check-in**: quem fez o check-in na filial
  antes das 14:19 de 12/10 seguiu liberado até o fim do dia (havia um, sem
  localização, das 14:05).
- **Como a gestão destrava:** /presenca → Presença de hoje → menu ⋮ do
  corretor → **Confirmar no plantão** (admin ou gestor). É o check-in feito
  pela gestão numa filial: localização `confirmada_gestao`, libera a roleta
  e tira o corretor da exclusão do fallback. Serve para quem está na loja e o
  celular não ajuda (GPS ruim dentro do prédio, computador de mesa, celular
  sem bateria). O **interruptor de presença** da Central (ligar) também
  destrava (`liberado_gestao`). O próprio corretor destrava refazendo o
  check-in com a localização do celular ligada, de dentro da loja. Atenção:
  se, depois da confirmação da gestão, o corretor refizer o check-in na
  filial e o GPS barrar de novo, vale o último — ele volta a ficar barrado.
- **Voltar a só informar** (sem deploy): Central de Distribuição →
  Configurações → desligar _"Check-in na filial exige a localização do
  celular"_ — ou `presenca_loja_exige_localizacao = false`. **Cuidado:** a
  `0082` grava `true`; se a exigência for desligada antes de ela chegar à
  produção, o deploy a religa (sem linha em `audit_log`). Conferir antes
  (§6).

### Por que a localização não veio (`falha_localizacao`, desde a `0082`)

Até 12/10 à tarde, **3 de 3** check-ins reais na filial chegaram ao banco
como `sem_localizacao` (11/10 09:08 e 09:53; 12/10 14:05) — nenhum
`confirmada`, nenhum `fora_do_raio`, com as três filiais com coordenadas. Até
as 14:19 isso não barrava; com a exigência ligada, se a causa for do sistema
(permissão, app instalado, computador), amanhã cedo todo corretor na loja
sai barrado e depende do "Confirmar no plantão".

A tela sabe por que o navegador não deu a posição e, desde a `0082`, manda
para o banco: `presenca_checkin(…, _falha_localizacao)` grava em
`presenca_checkins.falha_localizacao`, **só quando a localização não veio**
(`localizacao = 'sem_localizacao'`). Com coordenada, em casa ou feito pela
gestão, fica `NULL`; valor fora da lista também vira `NULL` (o diagnóstico
nunca impede o check-in).

| `falha_localizacao` | O que o navegador disse                               | O que fazer                                                                     |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `negada`            | permissão negada (`PERMISSION_DENIED`)                | o corretor libera a localização do site no navegador (a tela explica o caminho) |
| `indisponivel`      | o aparelho não conseguiu a posição                    | ligar a localização do celular; perto de uma janela                             |
| `tempo`             | demorou mais que o limite (10 s, ou a guarda de 30 s) | tentar de novo; se repetir com todos, é sinal de GPS fraco dentro da loja       |
| `sem_suporte`       | navegador sem geolocalização                          | abrir o CRM no Chrome ou no Safari                                              |
| `NULL`              | antes da `0082`, ou o front antigo (não manda)        | —                                                                               |

`presenca_minha_v1` (e o retorno do check-in) traz a chave
`checkin.falha_localizacao`; `presenca_hoje_v1` (quadro da gestão) traz as
colunas `falha_localizacao` e `precisao_m` (a última). Com a precisão acima de
1 km (Wi-Fi ou IP, típico de computador), o quadro mostra "Barrado: localização
imprecisa (±X km)" em vez de "a X km da filial", que pareceria mentira do
corretor.

**Diagnóstico de amanhã (13/10), às 8h** — rodar no SQL editor (só leitura;
precisa da `0082` em produção — antes dela, tirar `falha_localizacao` das
consultas 1 e 2):

```sql
-- 1) Como os check-ins na filial chegaram hoje: localização × porquê.
SELECT c.localizacao, c.falha_localizacao, c.apto_roleta, c.motivo, count(*) AS n
  FROM public.presenca_checkins c
 WHERE c.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   AND c.modo = 'loja' AND c.origem = 'corretor'
 GROUP BY 1, 2, 3, 4
 ORDER BY n DESC;

-- 2) Um por um: quem foi barrado, onde, a que distância e por quê.
SELECT to_char(c.created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS') AS hora,
       p.nome, f.nome AS filial, c.localizacao, c.falha_localizacao,
       c.distancia_m, c.precisao_m, c.motivo,
       c.encerrado_em IS NULL AS aberto
  FROM public.presenca_checkins c
  JOIN public.profiles p ON p.id = c.corretor_id
  LEFT JOIN public.filiais f ON f.id = c.filial_id
 WHERE c.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   AND c.modo = 'loja'
 ORDER BY c.created_at;

-- 3) Quantos barrados a gestão destravou depois ("Confirmar no plantão"
--    ou interruptor) — se for quase todo mundo, a causa é do sistema.
SELECT count(DISTINCT b.corretor_id) AS barrados,
       count(DISTINCT b.corretor_id) FILTER (WHERE EXISTS (
         SELECT 1 FROM public.presenca_checkins d
          WHERE d.corretor_id = b.corretor_id AND d.dia = b.dia
            AND d.created_at > b.created_at AND d.apto_roleta
            AND d.origem = 'gestao')) AS destravados_pela_gestao
  FROM public.presenca_checkins b
 WHERE b.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   AND b.modo = 'loja' AND NOT b.apto_roleta;
```

No Sentry, desde 13/10/2026, a prévia tem eventos próprios:
`geolocalizacao-previa:<falha>` (o **Incluir minha localização** não conseguiu
a posição, ou veio aproximada) e `presenca:previa_divergente:dentro:<localizacao>`
(a prévia disse "dentro" e o banco, com a mesma leitura, não confirmou). Eles
**não** entram na conta do "todo mundo barrado", que continua sendo
`geolocalizacao:<falha>` (área `presenca.checkin`).

Como ler: `sem_localizacao` com `falha_localizacao = NULL` em check-in feito
depois do deploy = o front publicado ainda não manda o porquê (conferir a
publicação). Maioria `negada` = permissão (orientar o time a liberar o site
no navegador). Maioria `tempo`/`indisponivel` = GPS dentro da loja (avaliar
com o dono aumentar o tempo de leitura ou a tolerância). `fora_do_raio` com
`precisao_m` de quilômetros = computador ou localização por IP (check-in pelo
celular).

## 4. O que a gestão vê e faz

- **/presenca → Presença de hoje** (admin, gestor, superintendente): uma
  coluna por filial, Em casa, Liberados pela gestão e Sem check-in; contadores
  de "na roleta", "no plantão", "em casa fora da roleta" e "sem check-in";
  vendas do mês anterior e evidência de localização de cada um.
- **Confirmar no plantão** (admin e gestor, menu ⋮ do corretor): faz o
  check-in por ele numa filial — para quem está na loja sem celular.
- **Interruptor de presença da Central** (aba Corretores/Filas): continua
  furando a regra de propósito (é decisão da gestão), mas agora fica registrado
  como **"Liberado pela gestão"**, com quem liberou. Ligado, vale como
  check-in válido também para o fallback (e destrava o barrado). **Desligado,
  encerra o check-in do dia**: o corretor sai das roletas e do fallback até
  um check-in novo.

## 5. Configurações (Central de Distribuição → Configurações, admin)

| Chave                                   | Valor                                                              | Efeito                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `presenca_casa_min_vendas_mes_anterior` | `3` (em 12/10, `0` só no dia; volta a `3` às 00:00 de 13/10 — §8c) | Mínimo de vendas no mês anterior para o check-in em casa liberar. `0` = em casa sempre libera |
| `presenca_loja_exige_localizacao`       | **`true`** desde 12/10/2026 14:19 (era `false`)                    | Check-in na filial só libera dentro do raio (§3)                                              |
| `fallback_velocidade_ativo`             | `true` (12/10/2026)                                                | Roleta sem ninguém apto → o lead vai ao mais rápido ativo no CRM (§8c). `false` = desligado   |
| `fallback_velocidade_atividade_min`     | `30`                                                               | Minutos desde a última ação no CRM para contar como ativo no fallback                         |
| `velocidade_janela_dias`                | `14`                                                               | Janela da métrica de velocidade de primeiro contato                                           |

**O mínimo 0 de 12/10.** Por decisão do dono, só no dia 12/10 o mínimo foi
a `0` (em casa libera para todos). A volta a `3` é o cron one-shot
`restaurar-presenca-casa-1310`, `0 3 13 10 *` (UTC) = **00:00 BRT de 13/10**,
no mesmo minuto do reset diário (`resetar-presenca-diaria`, jobid 6, que
encerra todos os check-ins). Ele foi **movido às ~15:30 BRT de 12/10**, por
decisão do dono — antes era `0 9 13 10 *` (06:00 BRT). Por quê: a regra vale
no momento do check-in, e o diálogo obrigatório reabre à meia-noite em aba
aberta; com o cron às 06:00, quem fizesse "Em casa" entre 00:00 e 06:00 de
13/10 ficaria apto o dia 13 inteiro com menos de 3 vendas. Conferir em 13/10:

```sql
SELECT valor, updated_at AT TIME ZONE 'America/Sao_Paulo' AS em
  FROM public.distribuicao_settings
 WHERE chave = 'presenca_casa_min_vendas_mes_anterior';           -- 3, ~00:00 de 13/10
SELECT jobname FROM cron.job WHERE jobname = 'restaurar-presenca-casa-1310';  -- nenhum (se desagenda)
```

**Rollback da regra, sem deploy:**

```sql
UPDATE public.distribuicao_settings SET valor = '0'
 WHERE chave = 'presenca_casa_min_vendas_mes_anterior';
```

O check-in continua (e continua dizendo onde cada um está); só a trava das
vendas sai. A presença obrigatória nas filas não tem chave: é a decisão 2.

## 6. Antes de ligar em produção (checklist)

1. **Vendas de setembro no CRM.** Em outubro, a regra lê as vendas de
   **setembro** aprovadas no CRM. Venda feita e não lançada/aprovada deixa o
   corretor que vendeu preso ao plantão por erro de cadastro. Conferir no
   próprio CRM (Assinaturas & Comissões) quem tem 3+ aprovadas em setembro e
   aprovar as pendentes antes do deploy. **Não confiar no conector MCP do CRM
   para isso**: em 09/10 ele respondeu 0 vendas, 0 agendamentos e 0 tarefas
   concluídas para julho, agosto, setembro e outubro inteiros — não enxerga
   essas tabelas.
2. **Comunicado ao time** (rascunho): _"A partir de [data], a presença no CRM
   passa a ser por check-in: ao abrir o CRM, escolha a filial em que você está
   (Barra Funda, Liberdade ou Belém) ou Em casa. Sem check-in, você não recebe
   lead de nenhuma fila. Quem teve 3 ou mais vendas aprovadas no mês anterior
   recebe leads de casa o mês inteiro; abaixo disso, só no plantão. O CRM
   mostra quantas vendas você teve."_
3. **Deploy:** o Lovable aplica `drizzle/migrations` ao chegar no `main`
   (`0074`, `when` maior que o da `0073`). Depois do merge, conferir:

```sql
SELECT slug, endereco, latitude, longitude
  FROM public.filiais ORDER BY ordem;                                    -- 3, com endereço e coordenadas
SELECT chave, valor FROM public.distribuicao_settings
 WHERE chave LIKE 'presenca_%';                                          -- 3 / false
SELECT slug FROM public.roletas
 WHERE tipo IS DISTINCT FROM 'sdr' AND NOT exigir_presenca;              -- nenhuma
SELECT has_function_privilege('anon', 'public.marcar_presenca(boolean)', 'EXECUTE');  -- false
```

### Estado em produção (11/10/2026)

| Migration                            | No banco                | Em `drizzle.__drizzle_migrations` |
| ------------------------------------ | ----------------------- | --------------------------------- |
| `0073` (Marquinhos antes da zona)    | aplicada à mão em 10/10 | sim (id 76)                       |
| `0074` (esta)                        | aplicada à mão em 11/10 | sim (id 77)                       |
| `0075` (passagem do discador do SDR) | aplicada à mão em 10/10 | sim (id 78)                       |

**Por que a 0074 esperou um dia.** Em 10/10, o site publicado ainda era
anterior ao #264: o check-in automático do login antigo marcava presença. A
0074 liga `exigir_presenca` em todas as filas e trava o `UPDATE` direto em
`profiles.presente`, que é o que o login antigo usa. Se entrasse antes da
publicação, ninguém ficaria apto e as filas parariam de distribuir. A 0075
ficou sem registro até lá porque o migrador da Lovable só aplica as entradas
com `when` maior que o `created_at` do último registro: registrá-la antes faria
o migrador pular a 0074 para sempre.

**Como entrou (11/10, ~10:55 UTC).** Depois da publicação do `main` em
`caf3900`:

1. Antes de aplicar, as 4 funções que a 0074 substitui (`marcar_presenca`,
   `marcar_presenca_admin`, `protect_profile_sensitive_fields` e
   `resetar_presenca_diaria`) foram comparadas com o repositório. O md5 de
   `pg_get_functiondef` bateu: nada feito direto em produção foi perdido.
2. O arquivo entrou em 5 blocos pela ferramenta de banco da Lovable.
3. Conferência contra o harness local com o repositório inteiro aplicado:
   - as 17 funções têm o md5 da definição idêntico;
   - colunas, restrições, índices, políticas, gatilhos, configurações e as 3
     filiais também são iguais;
   - só as permissões padrão da plataforma diferem: o papel `sandbox_exec`, o
     privilégio `m` do Postgres 17 e os grants automáticos a `service_role`.
4. Registro no drizzle: 0074 (id 77) e depois 0075 (id 78).
5. Resultado: 33 filas com presença obrigatória; só `agendados-sdr` fica fora.

**O que a regra encontrou.** Em outubro conta setembro: 14 vendas aprovadas e
nenhuma pendente de aprovação (2 rejeitadas). Com o mínimo de 3, só 1 dos 48
corretores ativos pode trabalhar de casa; os outros precisam do check-in numa
filial. Os 2 corretores que o login antigo marcou presentes às 07:45 de 11/10
seguem presentes até o reset da meia-noite (a 0074 não mexe em quem já estava
presente); o check-in deles em `/presenca` registra onde estão.

**Falta:**

- Quando o Lovable regenerar `types.ts` com `filiais` e as RPCs de presença,
  apagar o bloco de presença de `src/integrations/supabase/pendentes.ts` e
  trocar `supabasePendente` por `supabase` em
  `src/features/presenca/presenca-client.ts`.
- **Cron das 23h.** A produção não tem o job `auto-checkout-presenca`; só
  existe `resetar-presenca-diaria` (`0 3 * * *`, meia-noite de Brasília). A
  0074 recriou a função `auto_checkout_presenca()`, mas não agenda o job, que
  vinha de uma migration de junho que nunca chegou à produção. Se a gestão
  quiser o encerramento às 23h:

  ```sql
  SELECT cron.schedule('auto-checkout-presenca', '0 2 * * *',
    $$ SELECT public.auto_checkout_presenca(); $$);
  ```

### Estado em produção (12/10/2026, tarde)

**Aplicado em 12/10/2026, ~17:56 BRT** (registro abaixo, em "Registro da
aplicação da 0080–0082").

| O quê                                                       | Em produção                                                 | No repositório                  |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| Fallback por velocidade (tabela, 3 funções, cron)           | desde 12/10, por SQL direto (§8c)                           | `0080` (#284), igual à produção |
| `processar_distribuicao_automatica` reescrita               | desde 12/10, por SQL direto                                 | `0080` (#284), igual à produção |
| `_fallback_velocidade` com dono inativo + `_dono_ativo`     | desde ~15:27 de 12/10, por SQL direto                       | `0081` (#286), igual à produção |
| `_reatribuir_se_dono_inativo`, `registrar_volta_campanha`   | desde ~15:27 de 12/10, por SQL direto                       | `0081` (#286), igual à produção |
| Regras de presença no fallback (D4, D5, destrave — §8c)     | desde 12/10 ~17:56, pela `0082`                             | `0082`                          |
| `falha_localizacao` (coluna, parâmetro, chave nos retornos) | desde 12/10 ~17:56, pela `0082`                             | `0082`                          |
| `REVOKE` de anon/authenticated em `corretor_velocidade`     | desde 12/10 ~17:56, pela `0082`                             | `0082`                          |
| `presenca_loja_exige_localizacao = true`                    | desde 12/10 14:19 (com `audit_log`)                         | `0082`                          |
| `presenca_casa_min_vendas_mes_anterior = 0`                 | só 12/10; o cron one-shot devolve 3 em 13/10 00:00 BRT (§5) | não (fica `3`, de propósito)    |

A `0080` e a `0081` vieram da outra conversa do dono (#284 e #286). Elas
versionam o que ele aplicou direto em produção, mas não foram registradas em
`drizzle.__drizzle_migrations` (o último registro, às 17:26 de 12/10, era o id
82, da `0079`). Às 17:26, um banco montado no harness só até a `0081` deu o
**mesmo md5 de produção** nas dez funções da tabela acima. Por isso, aplicar as
duas em produção não muda nada: é só registro.

A `0082` (`when` 1792594800000, depois das duas) é a que muda produção: as
regras de presença no ranking, o diagnóstico do GPS (coluna
`falha_localizacao`, `presenca_checkin` com o parâmetro novo — a assinatura de
6 argumentos é apagada —, a chave em `_presenca_status`/`presenca_minha_v1` e
as colunas `falha_localizacao` e `precisao_m` em `presenca_hoje_v1`) e o
`REVOKE` de anon/authenticated em `corretor_velocidade`.

**Antes do merge (só SELECT em produção).** Essas funções estão sendo
mexidas direto em produção (11:20, 14:50, ~15:27 de 12/10). A `0082` recria
o ranking e as três funções de presença a partir do texto de produção
(conferido às 15:32, 15:52, 16:33, 17:03 e 17:26, sem mudança); o que mudar
depois disso é **desfeito em silêncio** pelo deploy. Logo antes do merge,
conferir que nada mudou — se algum md5 for outro, reler o
`pg_get_functiondef` e reembutir:

```sql
SELECT p.oid::regprocedure AS funcao, md5(pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('processar_distribuicao_automatica', '_fallback_velocidade',
                     'recalcular_velocidade_contato', 'fallback_velocidade_ranking',
                     '_dono_ativo', 'presenca_checkin', '_presenca_status', 'presenca_hoje_v1',
                     '_reatribuir_se_dono_inativo', 'registrar_volta_campanha')
 ORDER BY 1;
-- _dono_ativo(uuid)                     4e1cd9bb3a0ecec9c0118139b72bf93c
-- _fallback_velocidade(uuid)            2317edb2460317f7ef4f7f96e5958b23
-- _presenca_status(uuid)                15e331424b9aaba309f5498c49ad7ccc
-- _reatribuir_se_dono_inativo(uuid)     053bfda34ea69b59268ef055966bef32
-- fallback_velocidade_ranking(uuid)     a94e816480d16cc9db64f04fa763b8ce
-- presenca_checkin(text,text,double precision,double precision,double precision,uuid)
--                                       5029000a0c185327f2d5fec9222f6dcc
-- presenca_hoje_v1()                    8a0b3369d046c73ffbfb4629cb7b3451
-- processar_distribuicao_automatica()   700bd6b2163aae1649901b4ba0d5ec82
-- recalcular_velocidade_contato()       7f00c496551ff1d3fbd5b7a57c90ff83
-- registrar_volta_campanha(jsonb)       c4cf1a145e18c2a69ae5be39e81fddd5
SELECT valor FROM public.distribuicao_settings
 WHERE chave = 'presenca_loja_exige_localizacao';  -- true (se for false, o deploy RELIGA: falar com o dono)
SELECT jobid, schedule, command FROM cron.job
 WHERE jobname = 'recalcular-velocidade-contato';  -- 45 | 7 * * * * | SELECT public.recalcular_velocidade_contato();
```

**Ordem do deploy: a `0082` antes do front (ou junto).** O front novo manda
`_falha_localizacao` ao `presenca_checkin`. Sem a `0082`, o PostgREST responde
404 `PGRST202` e a tela refaz o mesmo check-in sem o parâmetro — nada quebra,
mas cada falha de GPS custa duas chamadas e o porquê não é gravado, e os
textos sobre o reforço ficam mais duros que o banco até a `0082` entrar. A
`0082` é compatível com o front publicado hoje (chamada nomeada de 6
argumentos funciona na função de 7 com `DEFAULT NULL`; a coluna a mais de
`presenca_hoje_v1` é ignorada).

**Depois do deploy:**

```sql
-- (mesma consulta de md5)
-- _dono_ativo(uuid)                     4e1cd9bb3a0ecec9c0118139b72bf93c (igual)
-- _fallback_velocidade(uuid)            2317edb2460317f7ef4f7f96e5958b23 (igual)
-- _presenca_status(uuid)                8bcc2f640ef4b0b6576bd50bb1e6045e (+ falha_localizacao)
-- _reatribuir_se_dono_inativo(uuid)     053bfda34ea69b59268ef055966bef32 (igual)
-- fallback_velocidade_ranking(uuid)     1179f52d43022ceb19e5fd65a6e36894 (+ [PRESENÇA 12/10])
-- presenca_checkin(text,text,double precision,double precision,double precision,uuid,text)
--                                       93374641bcf273b4a6d58d3704ce1fbf (só esta; a de 6 argumentos sumiu)
-- presenca_hoje_v1()                    58f6fec37be5484903f7d541a82250fb (+ falha_localizacao, precisao_m)
-- processar_distribuicao_automatica()   700bd6b2163aae1649901b4ba0d5ec82 (igual)
-- recalcular_velocidade_contato()       7f00c496551ff1d3fbd5b7a57c90ff83 (igual)
-- registrar_volta_campanha(jsonb)       c4cf1a145e18c2a69ae5be39e81fddd5 (igual)
SELECT has_table_privilege('authenticated', 'public.corretor_velocidade', 'SELECT');  -- false
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'presenca_checkins'
   AND column_name = 'falha_localizacao';                                            -- 1 linha
SELECT 'precisao_m' = ANY(proargnames) FROM pg_proc
 WHERE oid = 'public.presenca_hoje_v1()'::regprocedure;                             -- true
```

Os md5 "depois" foram medidos no harness: um banco montado só até a `0081`
(md5 iguais aos de produção), com os grants padrão da plataforma em
`corretor_velocidade` e a exigência ligada, como em produção, e a `0082`
aplicada por cima (duas vezes: é idempotente). Tirando os acréscimos da
`0082`, o texto de cada função alterada dá exatamente o md5 "antes" de
produção.

### Registro da aplicação da 0080–0082 (12/10/2026)

Feito pelo orquestrador desta leva, depois do merge do #287 (`b5b65547`),
pela ferramenta de banco do Lovable. Horários de Brasília.

1. **17:52 — conferência antes do merge** (só SELECT). Os dez md5 iguais aos
   "antes" da tabela acima; exigência `true`; cron 45 igual; último registro
   do drizzle = id 82 (`0079`); `0080` e `0081` ainda sem registro.
2. **~17:55 — `0080` e `0081` registradas sem reexecutar.** Ids 83
   (`fdeed8bd…`, `created_at` 1792422000000) e 84 (`12312d9b…`,
   1792508400000), com `WHERE NOT EXISTS` pelo hash (a outra conversa podia
   registrar ao mesmo tempo). Por que sem reexecutar: produção já tinha tudo
   o que elas fazem — md5 das funções (17:26 e 17:52), ACLs (só
   `service_role` nas internas; `authenticated` em
   `processar_distribuicao_automatica`), as 8 colunas de
   `corretor_velocidade`, as três chaves e o cron 45. Rodá-las de novo só
   tomaria lock em `processar_distribuicao_automatica` no meio do cron de 5 em
   5 minutos, para nada.
3. **~17:56 — `0082` aplicada numa transação só**, com `SET LOCAL
lock_timeout = '5s'`: o texto do arquivo sem os comentários de topo (os
   de dentro das funções, que entram no md5, ficaram) e, no fim da mesma
   transação, um bloco que confere o md5 das dez funções e aborta tudo se um
   só divergir. Esse bloco foi testado antes no harness: com um caractere
   trocado no ranking, a transação inteira voltou. Em produção passou de
   primeira.
4. **17:57 — conferência depois:** os md5 "depois" da tabela acima, todos
   iguais; `corretor_velocidade` sem SELECT para anon/authenticated; a
   coluna `falha_localizacao` criada; `presenca_hoje_v1` com `precisao_m`;
   `presenca_checkin` só a de 7 argumentos, com EXECUTE para authenticated.
   `0082` registrada: id 85 (`54350eab…`, `created_at` 1792594800000).

**O que isso mudou no dia 12/10.** Os três check-ins do dia estavam liberados
(Priscila e Graziele em casa, com o mínimo 0; Lucas na Liberdade às 14:05,
**sem localização** — passou porque a exigência só foi ligada às 14:19, e a
regra vale no momento do check-in). A única entrega do fallback no dia
(13:20) foi para um corretor **sem check-in**; com a `0082`, esse lead teria
ficado com o Marquinhos.

## 7. Conferências do dia a dia

```sql
-- Quem está onde hoje, e se está nas filas.
SELECT p.nome, c.modo, f.nome AS filial, c.apto_roleta, c.motivo,
       c.vendas_mes_anterior, c.localizacao, c.falha_localizacao, c.distancia_m,
       to_char(c.created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS hora
  FROM public.presenca_checkins c
  JOIN public.profiles p ON p.id = c.corretor_id
  LEFT JOIN public.filiais f ON f.id = c.filial_id
 WHERE c.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   AND c.encerrado_em IS NULL
 ORDER BY f.nome NULLS LAST, p.nome;

-- Frequência no plantão por filial no mês (dias com check-in na loja).
SELECT f.nome AS filial, p.nome, count(DISTINCT c.dia) AS dias_no_plantao
  FROM public.presenca_checkins c
  JOIN public.filiais f ON f.id = c.filial_id
  JOIN public.profiles p ON p.id = c.corretor_id
 WHERE c.modo = 'loja'
   AND c.dia >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
 GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- Quem pode trabalhar de casa este mês (3+ vendas aprovadas no mês anterior).
SELECT p.nome, public._corretor_vendas_mes_anterior(p.id) AS vendas_mes_anterior
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'
 WHERE p.ativo
 ORDER BY 2 DESC, 1;
```

## 8. Limites conhecidos (de propósito)

- A regra é avaliada **no check-in**. Distrato de uma venda do mês anterior no
  meio do dia não tira das filas até o próximo check-in (no máximo até a
  meia-noite). **Em produção não existe auto-checkout às 23h**: a função
  `auto_checkout_presenca()` existe, mas nenhum cron a chama (§6, "Falta");
  quem encerra o dia é o reset das **00:00 BRT** (`resetar-presenca-diaria`,
  jobid 6, `0 3 * * *`), que fecha todos os check-ins abertos e zera a
  presença. Até lá, quem fez check-in segue nas roletas (e no fallback).
- Venda do mês anterior aprovada no meio do dia: o corretor em casa clica "Em
  casa" de novo para entrar (`marcar_presenca(true)` também reavalia, mas a
  tela nova não o chama sozinha).
- A localização do navegador pode ser falsificada por quem souber usar o
  DevTools. A conferência eleva muito o custo de mentir sem pôr nada no
  caminho de quem está de fato na loja; o registro (com distância e hora) fica
  para auditoria.

## 8b. Revisto em 12/10/2026: roletas por filial

A decisão 1 acima ("não há roleta por filial") foi **invertida** pelo dono em
11/10 à noite: _"vamos montar roletas por filial, fica mais simples de
distribuir em apenas 3 roletas"_. Desde a migration `20261018120000` o time
que recebe os leads de uma zona é a **roleta da filial** que atende a zona
(Barra Funda = Oeste, Norte e Sul; Liberdade = Centro e Leste; Belém = Leste
e Grande SP), e as campanhas passam a ter uma filial dona. O que **não**
mudou deste doc: o check-in continua valendo em qualquer filial (ou em casa
com a meta) e libera todas as filas em que o corretor está. Ver
[`roletas-por-filial.md`](./roletas-por-filial.md).

## 8c. Fallback por velocidade (12/10/2026)

O fallback em si: migration `supabase/migrations/20261019120000_fallback_velocidade_distribuicao.sql`
(drizzle `0080`, #284) e, para o cliente que volta com o dono inativo,
`20261020120000_volta_dono_inativo.sql` (drizzle `0081`, #286). As regras de
presença (D4, D5, o destrave) e o diagnóstico do GPS:
`supabase/migrations/20261021120000_presenca_exigida_fallback_velocidade.sql`
(drizzle `0082`). Testes: `tests/db/fallback-velocidade.test.ts` (o fallback),
`tests/db/registro-mae-campanha.test.ts` (a volta) e
`tests/db/presenca-fallback-velocidade.test.ts` (a presença).

### O que faz

Com a presença obrigatória, a roleta da filial pode ficar sem ninguém apto
(ninguém fez o check-in, ou fez e foi recusado). Antes, o lead **esperava**.
Desde 12/10, o cron da distribuição (`processar_distribuicao_automatica`,
`distribuicao-automatica-5min`, a cada 5 min) tenta um **fallback**: se a
triagem falhou por falta de apto (`sem_corretor_na_zona`,
`sem_corretor_elegivel`, `sem_corretor_ativo` ou `zona_sem_time`), o lead vai
para o corretor **mais rápido** entre os que **disseram onde estão hoje** e
estão **usando o CRM agora**. Ninguém nessas condições: o lead fica com o
Marquinhos, como antes. Fora do horário da roleta (`fora_do_horario`) não
entra: é espera de propósito.

A entrega passa pelo motor de sempre (`_distribuir_lead_v3`, atribuição
direta, com a exceção de zona escrita: _"Fallback por velocidade: ninguém apto
na roleta"_ — o mais rápido pode não atender a zona do lead) e fica no
`distribution_log` com `regra_aplicada = 'fallback_velocidade'` e o motivo
_"…foi para o mais rápido ativo no CRM (Nome, X% contatados em até 15 min,
última ação há Y min)"_. A exceção aberta pela triagem fica resolvida.

Junto veio uma mudança no próprio cron: ele só reprocessa lead **criado nos
últimos 7 dias**, o mais novo primeiro. Lead mais antigo sem corretor (base,
importação) fica com o Marquinhos pelo escalonado da base. Antes, o cron
retentava os mesmos leads velhos a cada 5 minutos — em 12/10 eram ~2.400
linhas `sem_corretor` por hora no `distribution_log` até as 11h; depois das
12h, de 14 a 31.

### Quem o fallback escolhe

`fallback_velocidade_ranking(lead)` — entra quem cumpre **tudo**:

- é corretor ativo;
- **agiu no CRM** nos últimos `fallback_velocidade_atividade_min` minutos
  (30): uma alteração auditada (`audit_log`) ou uma interação registrada;
- participa (ativo) de alguma roleta ativa que não seja `base` nem
  `agendados-sdr`, e o **único** motivo de não estar apto nela é a ausência
  (`ausente_hoje`) — pausado, cota do dia, regra dos 65, sem telefone
  continuam barrando;
- ainda não teve este lead (`corretores_que_tentaram`);
- tem o **check-in de hoje aberto e válido** (decisão 5, abaixo);
- **não foi barrado pela localização hoje**, ou foi e destravou (decisão 4,
  abaixo).

Ordem: o **score de velocidade** (`corretor_velocidade.score`), depois quem
está há mais tempo sem receber. O score é a taxa de leads contatados em até
**15 minutos úteis** (08:00–19:00 BRT) por WhatsApp ou ligação **do próprio
corretor**, nos últimos `velocidade_janela_dias` (14) — sem as 2 últimas
horas —, suavizada para a média do time (`k = 10`) para quem tem pouca
amostra não disparar no topo nem no fim:
`score = 100 × (contatados em 15 min + 10 × média do time) / (recebidos + 10)`.
Lead nunca contatado conta como falha.

### Presença no fallback: quem entra e quem fica fora (decisões 4 e 5)

Decisões do dono (12/10/2026), na `0082` (bloco `[PRESENÇA 12/10]` de
`fallback_velocidade_ranking`):

- **Decisão 5 — só com check-in de hoje ainda aberto.** Entra quem tem o
  check-in de **hoje** (dia em BRT), **aberto** (`encerrado_em IS NULL`) e
  válido: na filial **liberado** (o GPS confirmou, ou a gestão usou
  "Confirmar no plantão" = `confirmada_gestao`), **liberado pela gestão** no
  interruptor (`liberado_gestao`), ou **Em casa** — liberado, ou recusado
  **só** pelas vendas (`casa_abaixo_minimo_vendas`). Fica fora: sem check-in
  hoje, check-in encerrado ("Encerrar presença", reset da meia-noite),
  check-in de ontem, e quem a gestão **desligou** no interruptor (desligar
  encerra o check-in).
- **Decisão 4 — barrado pela localização fica fora no dia.** Quem escolheu
  uma filial hoje e o GPS barrou (`fora_da_filial` ou `sem_localizacao`, com a
  exigência ligada — §3) não recebe pelo fallback, mesmo que depois troque de
  opção. O "Em casa" sincero (mesmo recusado pelas vendas) recebe.
- **Destrave do barrado.** Só um check-in **posterior**, no mesmo dia, que
  prove a loja — na filial liberado (o GPS confirmou, ou "Confirmar no
  plantão") — ou o **interruptor** ligado pela gestão. **"Em casa" depois do
  barrado não devolve o fallback**, nem liberado: com a meta (ou com o mínimo
  0, como em 12/10) ele volta à **roleta** — isso é regra da presença —, mas
  não ao reforço. Se, depois do destrave, ele refizer o check-in na filial e
  for barrado de novo, vale o último. No dia seguinte, começa do zero (o
  barrado de ontem não pesa). Pela letra do banco, destrava qualquer
  check-in posterior **liberado** em `loja` ou `liberado_gestao`: hoje isso é
  sempre GPS confirmado ou "Confirmar no plantão", porque as três filiais têm
  coordenadas e a exigência está ligada. Uma filial sem coordenadas
  (`filial_sem_coordenadas`) ou a exigência desligada no meio do dia também
  destravariam.

**Por quê.** O fallback nasceu aceitando "ausente", para a roleta vazia por
falta de check-in. Com o check-in obrigatório e a localização barrando,
"ausente" passou a esconder três situações: quem não disse onde está, quem
disse e encerrou (ou a gestão desligou), e quem disse uma filial e o GPS
desmentiu. Do jeito que entrou em produção, o reforço pegava as três; e a
primeira versão da `0082`, que só tirava o barrado, invertia o incentivo:
quem nunca disse onde está recebia, e quem disse e o GPS falhou, não. Agora **dizer onde está é a condição** para o
reforço, e **mentir a filial não compensa**: escolher a filial sem estar nela
custa o reforço do dia, enquanto quem disse "Em casa" desde o início segue
recebendo. Por isso trocar para "Em casa" depois não destrava — senão tocar
numa filial "para ver se passa" não custaria nada (a tela pede a confirmação
"Você está dentro da loja?" antes, §2).

**Matriz (o que `tests/db/fallback-velocidade.test.ts` cobre):**

| Situação hoje                                                  | Roleta        | Fallback |
| -------------------------------------------------------------- | ------------- | -------- |
| Filial, o GPS confirmou                                        | sim           | **sim**  |
| "Confirmar no plantão" (`confirmada_gestao`)                   | sim           | **sim**  |
| Interruptor da gestão ligado (`liberado_gestao`)               | sim           | **sim**  |
| "Em casa" liberado (meta, ou mínimo 0)                         | sim           | **sim**  |
| "Em casa" recusado pelas vendas                                | não           | **sim**  |
| Sem check-in hoje (mesmo ativo no CRM)                         | não           | não      |
| Check-in encerrado ("Encerrar presença")                       | não           | não      |
| Interruptor da gestão desligado                                | não           | não      |
| Check-in de ontem (mesmo aberto)                               | não           | não      |
| Filial barrada (`fora_da_filial` / `sem_localizacao`)          | não           | não      |
| Barrado → "Em casa" liberado (mínimo 0)                        | sim           | não      |
| Barrado → "Em casa" recusado                                   | não           | não      |
| Barrado → "Confirmar no plantão" / interruptor / GPS confirmou | sim           | **sim**  |
| GPS confirmou → barrado depois → "Em casa"                     | (pela casa)   | não      |
| Barrado ONTEM, hoje com check-in válido                        | conforme hoje | **sim**  |
| Qualquer um, na fila Agendados do SDR                          | sem presença  | —        |

Pausado, cota do dia, sem ação no CRM na janela e quem já teve o lead
continuam fora, como antes.

### Chaves e como desligar

| Chave                               | Valor  | Para quê                                                         |
| ----------------------------------- | ------ | ---------------------------------------------------------------- |
| `fallback_velocidade_ativo`         | `true` | `false` desliga: roleta vazia volta a significar "o lead espera" |
| `fallback_velocidade_atividade_min` | `30`   | Janela de "ativo no CRM", em minutos                             |
| `velocidade_janela_dias`            | `14`   | Janela da métrica de velocidade                                  |

```sql
-- Desligar o fallback (sem deploy; o cron segue, só sem o fallback):
UPDATE public.distribuicao_settings SET valor = 'false'::jsonb, updated_at = now()
 WHERE chave = 'fallback_velocidade_ativo';
```

### O cron horário

`recalcular-velocidade-contato` (`7 * * * *`, de hora em hora no minuto 7 —
o mesmo minuto do `cadencia-encerrar`, jobid 34, que mexe em outras tabelas;
o :00 fica para os crons pesados) roda `recalcular_velocidade_contato()`, que
refaz a foto inteira de `corretor_velocidade` (recebidos, contatados,
contatados em 15 min, %, score). Tabela com RLS ligado e sem policy, sem
grant para anon/authenticated: pela API ninguém lê nem escreve; as funções do
fallback (e `_dono_ativo`) são internas (só o pg_cron e o `service_role`).

```sql
-- O ranking de agora, para um lead (como service_role / no SQL editor):
SELECT * FROM public.fallback_velocidade_ranking('<lead_id>');
-- O que o fallback entregou hoje:
SELECT dl.created_at AT TIME ZONE 'America/Sao_Paulo' AS hora, p.nome, dl.motivo
  FROM public.distribution_log dl JOIN public.profiles p ON p.id = dl.corretor_id
 WHERE dl.regra_aplicada = 'fallback_velocidade'
   AND dl.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                        AT TIME ZONE 'America/Sao_Paulo'
 ORDER BY 1;
```

### Registro: o que entrou direto em produção em 12/10/2026

Feito por outra conversa do dono, pela ferramenta de banco, ao longo do dia
(e, às ~15:30, pelo orquestrador desta leva, por decisão do dono). O dono
confirmou que **fica** (_"sim"_). A `0080` e a `0081` (#284 e #286, da outra
conversa) trazem para o repositório o fallback e a volta pela campanha; a
`0082` registra a exigência de localização. Horários de Brasília,
pelos registros do banco (`updated_at` das chaves, `audit_log`,
`distribution_log`, `cron.job` e, onde não há carimbo, o `xmin` dos
catálogos comparado com linhas de horário conhecido):

| Hora        | Evento                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11:08       | **Operação de catálogo:** cópia de `projetos` em `public.projetos_backup_20261012` (985 linhas; RLS ligado, sem grant para anon/authenticated)                                                                                                                                  |
| 11:09–11:15 | **Operação de catálogo:** `UPDATE` em 242 `projetos` (book, preço a partir de, tabela de preços, metragem, entrega, construtora…)                                                                                                                                               |
| 11:20       | `presenca_casa_min_vendas_mes_anterior` 3 → **0**, só por hoje (em casa libera para todos). Cron one-shot `restaurar-presenca-casa-1310` (então `0 9 13 10 *` UTC = 13/10 06:00 BRT) para voltar a 3 e se desagendar                                                            |
| 11:23       | O check-in "Em casa" da Priscila (das 10:27) reescrito por SQL para liberado                                                                                                                                                                                                    |
| 11:27       | A presença dela ligada por SQL; handoff manual de um lead ao Andrew                                                                                                                                                                                                             |
| 11:20–12:18 | Tabela `corretor_velocidade`, `recalcular_velocidade_contato`, `fallback_velocidade_ranking`, `_fallback_velocidade`, `processar_distribuicao_automatica` reescrita, cron `recalcular-velocidade-contato` (jobid 45)                                                            |
| 12:17       | As chaves `fallback_velocidade_ativo` (true), `fallback_velocidade_atividade_min` (30) e `velocidade_janela_dias` (14)                                                                                                                                                          |
| 13h         | Primeira entrega pelo fallback (`regra_aplicada = 'fallback_velocidade'`)                                                                                                                                                                                                       |
| 14:19       | `presenca_loja_exige_localizacao` → **true**, com linha em `audit_log` (`UPDATE` em `distribuicao_settings`, origem _"Decisão do dono em 12/10/2026 ('localização deve barrar caso não esteja na filial')…"_) — §3                                                              |
| 14:50–14:53 | As 3 funções do fallback recriadas numa transação só, **só com comentários novos** (`-- Só lead quente, ainda sem dono.`, `-- Ninguém ativo: o lead fica com o Marquinhos.`, `-- Elegível = passa em TODOS os critérios…`); sem `audit_log`                                     |
| ~15:27      | `_fallback_velocidade` passa a aceitar também lead com **dono inativo/bloqueado** (função nova `_dono_ativo`); na mesma transação, `_reatribuir_se_dono_inativo` (nova) e `registrar_volta_campanha` (o dono inativo nunca é devolvido na volta pela campanha); sem `audit_log` |
| ~15:30      | Cron `restaurar-presenca-casa-1310` movido para `0 3 13 10 *` (UTC) = **00:00 BRT de 13/10**, junto do reset diário — decisão do dono (§5)                                                                                                                                      |

O que nenhuma das três registra, de propósito:

- o mínimo em 0 (é só de 12/10; o cron one-shot cuida da volta a 3 —
  registrar 0 reabriria a casa em qualquer ambiente novo);
- as correções pontuais de dados (o check-in, a presença e o handoff), que
  são operação daquele dia, não regra;
- a **operação de catálogo** (o backup e o `UPDATE` dos 242 projetos): é
  dado, não estrutura. **Pendência:** decidir quando apagar
  `projetos_backup_20261012` (é segura enquanto existir: RLS e sem grant para
  a API);
- ~~`_reatribuir_se_dono_inativo` e `registrar_volta_campanha`~~ (~15:27):
  resolvido — vieram na `0081` (#286), com testes em
  `tests/db/registro-mae-campanha.test.ts`, iguais à produção.

**Correção de registro.** A regra a mais de `_em_atendimento_classificar` em
produção (`WHEN m.status IN ('qualificacao_corretor','qualificado') THEN
'base_ok'`, antes de `sem_toque`: lead qualificado não sai por 5 dias sem
toque), apontada na conferência de 12/10 como "talvez de hoje", **é de
06/10** — não faz parte do que entrou em 12/10 e continua sem migration no
repositório (pendência antiga, à parte desta leva).

## 9. O que fica de fora (decisões do dono, 09/10/2026)

1. **Fila Agendados do SDR não exige presença.** Continua entregando a visita
   marcada pelo SDR a quem tem agenda livre no horário (política de 04/09). O
   gatilho de presença obrigatória pula filas `tipo = 'sdr'` e o interruptor
   dela segue editável na Central.
2. **Lead que o corretor PUXA não exige check-in** (Bolsão, lote de
   prospecção, Discador): não é fila — é o corretor pedindo. A regra do
   plantão vale para o que as filas ENTREGAM.
3. **Zona sem ninguém presente: o lead espera alguém da zona chegar.** É a
   zona estrita de 03/10 (`docs/distribuicao-por-zonas.md`), sem mudança:
   quando um corretor da zona faz o check-in, as esperas daquela zona voltam
   no minuto seguinte (`tg_profiles_presenca_destrava_zona`, que dispara no
   mesmo `profiles.presente` que o check-in liga). O lead nunca cai na geral.
   **Revisto em 12/10/2026 (fallback por velocidade, §8c):** a espera agora
   dura até o próximo ciclo do cron da distribuição (5 min). Se a triagem
   ainda falhar por falta de apto, o lead vai pelo **fallback** ao corretor
   mais rápido com check-in válido hoje e ativo no CRM — **mesmo fora da
   zona** (a entrega força a exceção de zona, com o motivo escrito no log).
   Ninguém assim: o lead espera com o Marquinhos, como antes. Com
   `fallback_velocidade_ativo = false`, vale de novo a espera pura.
