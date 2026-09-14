# Fatia 4 — Bolsão de oportunidades, puxar e transferência

> Continuação direta de `carteira-ativa-40-fatia3.md`. A Fatia 3 definiu **quem
> são os 65** e construiu a Reserva em modo sombra (classifica, mas não devolve
> nada). A Fatia 4 responde a pergunta que ficou em aberto: **para onde vai o
> lead que sai da carteira** — e por qual porta ele volta.

## 1. O modelo em três camadas

| Camada             | Tem dono? | Quem trabalha                   | Tamanho hoje           |
| ------------------ | --------- | ------------------------------- | ---------------------- |
| **Carteira ativa** | sim       | o corretor, todo dia            | 65 por corretor (teto) |
| **Reserva**        | sim       | ninguém ativamente; espera vaga | o que excede o teto    |
| **Bolsão**         | **não**   | discador + SDR                  | ~50 mil                |

A Reserva não é um depósito permanente: é uma fila de espera com validade. A
régua de devolução (§6) drena a Reserva para o Bolsão ou para a roleta. O Bolsão
é a base geral da casa — sem dono, sem corretor responsável, matéria-prima do
discador e da equipe de SDR. É de lá que o lead volta qualificado para a roleta
e compõe de novo o teto de 65.

## 2. Quem compõe os 65 (origem qualificada)

O teto de 65 é alimentado por quatro fontes, e só por elas:

| Fonte                | Marca no banco                | Por quê                      |
| -------------------- | ----------------------------- | ---------------------------- |
| Facebook (anúncio)   | `origem = 'facebook'`         | a casa pagou mídia           |
| Marquinhos (chatbot) | `origem = 'chatbot'`          | o lead veio falar com a casa |
| Impulso SMQ          | `origem = 'impulso_smq'`      | **custeado pela empresa**    |
| SDR                  | `sdr_entregue_em IS NOT NULL` | já passou por triagem humana |

Tudo o mais é estoque e vive no Bolsão — salvo as exceções de posse do §4.

## 3. Medição (13/09/2026, base viva)

Base viva total: **55.695**. Com dono hoje: **15.649**. Sem dono: **40.046**.

Com dono, por origem:

| origem        | com dono | origem                               | com dono |
| ------------- | -------- | ------------------------------------ | -------- |
| google_sheets | 5.617    | captacao_corretor                    | 167      |
| importacao    | 3.538    | impulso_smq                          | 49       |
| outro         | 3.531    | indicacao                            | 18       |
| facebook      | 1.640    | whatsapp                             | 16       |
| chatbot       | 1.062    | telefone / plantao / site / acao_rua | 11       |

Dentro dos 12.810 que a primeira leitura mandaria para o Bolsão:

| corte                    | leads     | %       |
| ------------------------ | --------- | ------- |
| com alguma interação     | 7.050     | 55%     |
| com contato registrado   | 7.250     | 57%     |
| **com 3 ou mais toques** | **2.304** | **18%** |

**2.304 leads com três ou mais toques reais é alto.** Não é estoque parado: é
trabalho feito. Tirar esses leads do dono na virada é o que transforma uma
mudança de processo em crise de confiança. Daí a quarta exceção do §4.

## 4. Quem NÃO perde o dono na virada

Cinco exceções, em ordem de precedência:

1. **Venda registrada.** Lead com `status` em (`contrato_fechado`, `pos_venda`)
   ou com linha em `vendas` cujo `status_venda` não é `cancelada`/`rejeitada`.
   **Congelado**: fora da virada, fora do puxar, fora da régua de devolução,
   fora de tudo. Só se mexe por transferência aprovada pela gestão.
2. **Fundo do funil.** `agendado`, `visita_realizada`, `proposta_enviada`,
   `analise_credito` — 134 leads. Já era regra da Fatia 3 (§4.1): o fundo nunca
   é o excedente.
3. **Origem paga ou qualificada.** facebook, chatbot, impulso_smq, SDR — 2.705.
4. **Origem conquistada pelo corretor.** `captacao_corretor`, `indicacao`,
   `plantao`, `whatsapp`, `telefone`, `site`, `acao_rua` — 261. O corretor
   trouxe o lead; virar estoque comum seria confisco.
5. **Histórico real de atendimento.** 3 ou mais toques registrados — 2.304.

O princípio único por trás de 3 e 4: **estoque é só o que ninguém conquistou nem
pagou.** Na prática, estoque = `importacao` + `google_sheets` + `outro`
(12.686 com dono). Todo o resto é lead conquistado.

### Resultado da virada

|                               | leads       |
| ----------------------------- | ----------- |
| Com dono hoje                 | 15.649      |
| Ficam com dono (exceções 1–5) | ~5.350      |
| **Liberados para o Bolsão**   | **~10.300** |
| Bolsão final                  | ~50.300     |

Sem a quarta exceção seriam 12.810 liberados. As ~2.300 de diferença são
exatamente os leads que alguém trabalhou de verdade — o preço de comprar a
adesão da equipe.

Os ~5.350 que ficam dão **~130 por corretor** (41 corretores com carteira real):
65 ativos e ~65 na Reserva. Isso é esperado e não é problema — a Reserva existe
para isso e a régua do §6 a drena.

> Números exatos das exceções 1 e 5 dependem de duas medições ainda não feitas
> (§8). O intervalo real da virada é 10.250–10.400.

## 5. As duas portas de volta

O gate que decide qual porta é o **status do lead**, e o gate que decide se a
porta abre é o **relógio de 7 dias**.

### 5.1 O relógio de 7 dias (vale para as duas portas)

> **Lead com toque nos últimos 7 dias não sai do dono.** Nem por puxão, nem por
> transferência.

Toque = `COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)` — o
mesmo relógio que a higiene, a `fila_funil_v1` e a `fila_equipe_v1` já usam. Um
relógio só em toda a operação; nada de régua nova.

Sete dias é o prazo em que um corretor ou está trabalhando o lead ou não está.
Abaixo disso é roubo; acima disso é abandono.

#### A exceção: quem avançou de fase leva

O bloqueio de 7 dias cai quando **outro corretor avançou de fase com o mesmo
cliente** (`agendado` para a frente). Atividade não é posse; progresso é.

Isso é detectável no banco, e por um motivo específico: o índice de dedup é
`uq_leads_projeto_telefone_ativo` — único por **projeto**, não global. O mesmo
`telefone_e164` existe legitimamente em dois leads quando são projetos
diferentes. É exatamente o caso real: o cliente falou com o corretor A sobre um
empreendimento e o corretor B o levou a agendado em outro.

```sql
EXISTS (
  SELECT 1 FROM public.leads AS outro
  WHERE outro.telefone_e164 = alvo.telefone_e164
    AND outro.id <> alvo.id
    AND outro.deleted_at IS NULL AND NOT outro.na_lixeira
    AND outro.corretor_id = _solicitante
    AND outro.status IN ('agendado','visita_realizada',
                         'proposta_enviada','analise_credito')
)
```

**Essa exceção nunca é auto-serviço.** Ela vai para a fila da gestão com a
evidência na tela ("o solicitante já tem este telefone em `agendado` no projeto
Y desde 03/09"), e um humano decide. Auto-aprovar seria um convite para criar
lead de fachada e marcá-lo agendado.

### 5.2 Puxar (auto-serviço, anônimo) — antes de `agendado`

`carteira_puxar(_lead uuid)`. Condições, todas obrigatórias:

1. **Status anterior a `agendado`**: `novo`, `aguardando_atendimento`,
   `em_atendimento`, `qualificado`, `aguardando_retorno`, `aguardando_corretor`,
   `qualificacao_corretor`, `perdido`.
2. **Sem venda registrada** (exceção 1 do §4).
3. **Frio há 7 dias** (§5.1).
4. **Tem vaga**: `carteira_vagas_v1(caller) > 0` **e** a faixa `resgate` não
   está cheia (cap 13). Reaproveita o mecanismo da Fatia 3 — nada novo.
5. **Cota diária**: `puxar_por_dia`, proposta **10**. Impede varredura da base.
6. **Anti-ioiô**: não pode puxar lead que ele mesmo soltou nos últimos 30 dias.
7. **Registro obrigatório** em `carteira_resgates`, com `dono_anterior_id` —
   invisível para o corretor, obrigatório para a gestão.

**Comissão: 100% do puxador.** Antes de `agendado` não há trabalho avançado a
proteger, e o relógio de 7 dias já provou o abandono.

#### Anonimização de verdade

A view `bolsao_v1` não expõe `corretor_id` nem o nome do dono anterior. Isso não
basta: **o nome vaza pelo histórico**. Na tela de puxar o histórico aparece
agregado — "4 toques, último há 23 dias" — sem autor e sem texto. Depois de
puxar, o histórico completo abre: aí ele é o dono e precisa do contexto.

Sem essa segunda metade, a anonimização é decorativa.

### 5.3 Transferência (pela gestão) — de `agendado` em diante

De `agendado` para a frente **sempre** passa pela gestão, com ou sem os 7 dias.

Tabela `transferencias_pedidos`: `lead_id`, `solicitante_id`, `motivo`,
`status` (`pendente`/`aprovado`/`negado`/`expirado`), `decidido_por`,
`decidido_em`, `comissao_regra`, `evidencia` (jsonb — o lead duplicado do §5.1
quando houver).

A aprovação chama `transferir_leads([lead], solicitante)`, que **já existe** e já
tem o gate forte (admin/superintendente/gestor + `pode_atribuir_lead` +
`pode_acessar_lead` por lead, restaurado em `20260711210000`). Não se cria
função nova de transferência.

Pedido sem decisão **expira em 7 dias**, para a fila não virar cemitério.

## 6. Régua de devolução — com destino

A Fatia 3 classificava e não devolvia nada. A Fatia 4 liga a devolução, e o
destino depende de quem pagou pelo lead:

| Grupo                                                  | Parado há N dias → destino               |
| ------------------------------------------------------ | ---------------------------------------- |
| Pago/qualificado (facebook, chatbot, impulso_smq, SDR) | **volta para a roleta** — outro corretor |
| Estoque (importacao, google_sheets, outro)             | **Bolsão** — discador + SDR              |
| Conquistado pelo corretor (§4.4)                       | **não sai**; gera alerta para a gestão   |
| Fundo do funil                                         | **não sai** automaticamente              |
| Com venda registrada                                   | **congelado**                            |

A distinção entre as duas primeiras linhas é o que honra "impulso_smq é custeado
pela empresa": lead que a casa pagou nunca vira estoque de discador — ele merece
atenção humana e volta para a fila de um corretor.

## 7. A escada de comissão

Decidida pela diretoria. Deixa de ser bloqueante.

| Status na hora da transferência        | Janela    | Comissão                 |
| -------------------------------------- | --------- | ------------------------ |
| antes de `agendado` (puxão)            | —         | **100% do puxador**      |
| `agendado`, `visita_realizada`         | ≤ 15 dias | **50/50**                |
| `proposta_enviada`, `analise_credito`  | ≤ 30 dias | **50/50**                |
| qualquer um dos quatro, fora da janela | —         | **100% do puxador**      |
| com venda registrada                   | —         | congelado, não transfere |

> A diretoria fixou dois pontos: `agendado` em 15 dias e `analise_credito` em 30.
> `visita_realizada` e `proposta_enviada` ficaram sem prazo declarado e estão
> preenchidos por herança — `visita_realizada` é a continuação natural de
> `agendado`, e `proposta_enviada` carrega o mesmo peso de trabalho de
> `analise_credito`. É uma linha de configuração; se a leitura for outra, muda
> em um lugar só.

### 7.1 De quando conta a janela

Da **entrada no status**, não do último toque. O lead chegou a `agendado` há 12
dias → 50/50. Chegou há 40 e parou ali → 100% do puxador: o corretor teve seis
semanas e não converteu.

A fonte é `lead_eventos` (`tipo = 'transicao_lead'`,
`payload ->> 'para_status'`), pegando a ocorrência mais recente. **Essa fonte é
confiável por construção**: o banco bloqueia qualquer UPDATE de `status` fora de
`transicionar_lead`, e `transicionar_lead` sempre grava o evento. É a mesma
trava que derrubou o botão "escoar estoque" na Fatia 3 (§9.6 daquele documento)
— ali ela atrapalhou, aqui ela é a garantia.

### 7.2 Onde o 50/50 mora

`leads.corretor_anterior_id` **já existe** na tabela. Faltam dois campos,
carimbados no momento da transferência:

- `comissao_anterior_id uuid` — quem divide
- `comissao_anterior_pct numeric` — quanto (50)

**50/50 de quê:** da parte do corretor (`vendas.percentual_corretor`), não do
bruto. Sem essa frase explícita, a divisão come silenciosamente a parte do
gerente e do superintendente.

### 7.3 Três casos que a regra não cobriu

1. **A divisão expira?** Proposta: **não**. Ela é carimbada no ato e vale quando
   a venda fechar, seja em dois ou em oito meses. A janela de 15/30 dias já
   respondeu a única pergunta que importa — o lead estava quente quando trocou
   de mão. Se estava, o dono anterior ganhou a metade.
2. **Transferência em cadeia (A→B→C).** Proposta: só o **dono imediatamente
   anterior** participa; uma nova transferência substitui o carimbo. A
   alternativa é uma árvore de comissão que ninguém consegue calcular nem
   auditar.
3. **Dono anterior inativo** (saiu da casa). Não há 50/50: **100% do puxador**.

### 7.4 O que isso faz com a exceção nº 5 da virada

O relógio de 7 dias é bem mais apertado do que os 15 que eu havia proposto. Na
prática, os 2.304 leads com 3+ toques ficam com o dono na virada — e viram
puxáveis uma semana depois, se ele não os tocar.

A exceção continua valendo a pena, e o argumento não é aritmético, é político:
**muda quem age.** Na virada, quem tira é o sistema, por decreto, e o corretor
lê como confisco. Com o relógio de 7 dias, quem tira é um colega, depois de o
dono ter demonstrado abandono, e o corretor lê como consequência. Os mesmos
leads, leituras opostas.

E há uma diferença operacional real: solto no Bolsão, o lead é discado por um
robô. Mantido com o dono, um humano que conhece o histórico tem sete dias para
agir.

## 8. Medições que faltam antes de virar

1. **Quantos dos 15.649 têm venda registrada.** É o grupo intocável e ainda não
   foi dimensionado. `vendas` com `status_venda NOT IN ('cancelada','rejeitada')`.
2. **Quantos dos 12.686 de estoque têm telefone válido.** O Bolsão só vale o que
   o discador consegue discar. Se metade não tem telefone, ele é bem menor do
   que os 50 mil aparentes.
3. ~~Distribuição de `ultima_interacao` dentro dos 2.304 com 3+ toques~~ —
   **dispensada**. Ela existia para calibrar `puxar_frio_dias`, e a diretoria
   fixou o prazo em 7 dias (§5.1). Medição que não decide nada não se faz.

As duas primeiras são respondidas por `bolsao_diagnostico_v1()` (§11), que é
repetível: roda de novo no dia de virar e depois, para comparar.

## 9. Ordem de implantação

A ordem importa mais que o código. Virar antes de o Bolsão ser utilizável é
tirar lead do corretor sem dar nada em troca — queima a mudança politicamente.

1. `bolsao_v1` + congelamento de venda. **Só leitura, ninguém muda de dono.**
2. Tela de busca no Bolsão, anonimizada, **sem** botão puxar. Mede quem busca e
   o que busca.
3. `carteira_puxar` com cota baixa (3/dia) e a escada de comissão publicada.
4. Fila de transferência pela gestão.
5. **Só então** a virada: libera os ~10,3 mil de estoque sem toque.
6. **Por último** a régua de devolução automática, ligada grupo a grupo,
   começando por `reserva` + estoque — o grupo mais barato de errar.

## 10. Configuração

Tudo em `gestao_config`, chave `bolsao`, seguindo o padrão da Fatia 3:

```json
{
  "puxar_frio_dias": 7,
  "puxar_por_dia": 10,
  "puxar_anti_ioio_dias": 30,
  "transferencia_expira_dias": 7,
  "comissao_5050_dias_agendado": 15,
  "comissao_5050_dias_analise": 30,
  "devolver_pago_dias": 15,
  "devolver_estoque_dias": 30
}
```

## 11. O que foi construído — passo 1 (migration `20260914120000_bolsao_v1.sql`)

Só leitura. Nada aqui muda o dono de lead nenhum, e uma guarda de sanidade no
fim da migration falha o deploy se alguma dessas funções virar `VOLATILE` —
o dia em que alguém começar a escrever, o passo 1 deixa de ser só leitura e
a migration avisa em vez de deixar passar.

| Objeto                             | Papel                                         |
| ---------------------------------- | --------------------------------------------- |
| `_lead_venda_viva(uuid)`           | congelamento por venda (§4.1)                 |
| `telefone_discavel(text)`          | 10–13 dígitos: o piso do que o discador disca |
| `telefone_mascarado(text)`         | `(11) •••••0001`                              |
| `bolsao_v1(busca, limite, offset)` | a base sem dono, anonimizada                  |
| `bolsao_diagnostico_v1()`          | as medições 1 e 2 do §8                       |

### 11.1 Três decisões que valem registro

**Venda viva reusa o recorte que o banco já protege.** O índice
`uq_vendas_lead_ativa` já garante no máximo uma venda `rascunho`/`pendente`/
`aprovada` por lead. Congelar por esse mesmo conjunto (em vez de inventar
outro) faz o congelamento e a unicidade de venda falarem da mesma coisa — e o
índice parcial responde a consulta sem varrer `vendas`. Distrato é a exceção da
exceção: a venda caiu, o lead volta a ser lead.

**O telefone sai mascarado, e isso não é cosmético.** Sem máscara, "puxar" vira
opcional: bastaria copiar o número da tela e ligar por fora do CRM — que é
exatamente como uma carteira deixa de ser auditável. A máscara mantém o
reconhecimento (quem já falou com o cliente identifica o número) sem entregar a
discagem.

**`_lead_venda_viva` não tem grant para `authenticated`.** Exposta como função
pública, ela viraria uma sonda: qualquer corretor poderia varrer uuids
perguntando "esse tem venda?" sobre leads que não enxerga. Quem chama são as
RPCs `SECURITY DEFINER`, que devolvem o congelamento como **coluna**. Mesmo
padrão de `_carteira_classificar` na Fatia 3.

### 11.2 O Bolsão já existia no schema

`leads.classe_lead` vale `'quente' | 'base'` desde `20260826120000`, e o motor
de SDR, a régua de follow-up e a distribuição v2 já devolvem lead para a base
exatamente como a virada vai fazer: `corretor_anterior_id := corretor_id`,
`corretor_id := NULL`, `classe_lead := 'base'`. E `corretor_anterior_id` já é
coluna de `leads`.

A Fatia 4 não inventa um conceito — ela nomeia o trilho que já estava lá e o
torna consultável. Isso encurta os passos 5 e 6 do §9 de forma material: a
virada é um UPDATE no trilho existente, não uma migração de modelo.

### 11.3 Provas

16 testes em `tests/db/bolsao.test.ts`, verificados por mutação — tirar o
congelamento de venda, o opt-out ou a máscara de telefone faz o teste
correspondente quebrar, um a um. Suíte de banco inteira em 540 testes verdes,
com replay das 366 migrations do zero.

### 11.4 O que o passo 1 deliberadamente não faz

Não tem tela. A busca no Bolsão é o passo 2 do §9, e ela vem sem botão de
puxar — primeiro se mede quem busca e o quê. `bolsao_v1` já nasce com busca,
paginação e ordenação para a tela não precisar de RPC nova.

## 12. Primeira medição depois do passo 1 (13/09/2026, produção)

|                                            | leads            |
| ------------------------------------------ | ---------------- |
| base viva                                  | 58.168           |
| com dono                                   | 18.100           |
| sem dono                                   | 40.068           |
| **congelados por venda**                   | **116**          |
| **sem dono, sem telefone discável**        | **1.473** (3,7%) |
| sem dono com opt-out                       | 0                |
| Bolsão elegível hoje                       | 38.575           |
| estoque com dono (importacao/sheets/outro) | 14.841           |
| estoque com dono congelado por venda       | 35               |

### 12.1 O Bolsão não é ficção

A medição 2 do §8 existia para saber se os 40 mil sem dono eram material real
ou lixo sem telefone. **Só 3,7% não tem telefone discável.** O discador tem
38.575 números para trabalhar, e o passo 2 continua valendo a pena.

### 12.2 O grupo intocável custa quase nada

116 leads com venda viva, dos quais 35 dentro do estoque com dono. A regra
"não se mexe em lead com venda" tira 35 leads da virada — 0,2% dela. Era o
maior risco de a restrição inviabilizar o desenho; não é.

### 12.3 Zero opt-out em 40 mil é um alerta, não um resultado

Numa base desse tamanho, ninguém nunca ter pedido para não ser contatado é
implausível. A leitura mais provável é que `leads.opt_out` não esteja sendo
escrito por nenhum fluxo — nem pelo WhatsApp, nem pelo SDR, nem pela mão.

O Bolsão alimenta discador e SDR. Antes de apontar um robô para 38.575
pessoas, é preciso saber onde o pedido de descadastro é registrado hoje — e se
a resposta for "em lugar nenhum", isso é bloqueante para o passo 3, não item
de backlog. A guarda de `opt_out` no código está certa e é inútil se ninguém
preenche a coluna.

### 12.4 A base cresceu 2.473 entre duas medições e isso não fecha

A medição de §3 (mesma manhã) somava 55.695 vivos e 15.649 com dono. Quatro
horas depois: 58.168 e 18.100. O crescimento é quase todo em leads **com
dono** (+2.451), enquanto os sem dono ficaram parados (+22).

**A conta fechou, e a causa era minha.** As duas medições não mediam a mesma
população: a consulta do §3 não contava `perdido` nem `contrato_fechado` entre
os leads com dono.

| status excluído no §3 | com dono  |
| --------------------- | --------- |
| `perdido`             | 2.354     |
| `contrato_fechado`    | 94        |
| **soma**              | **2.448** |

Contra uma diferença de 2.452. Os 4 que sobram são o movimento normal de
quatro horas — a medição de entrada confirmou 15 leads em 12 horas, em nenhum
lote de importação. Não houve crescimento anômalo da base; houve um filtro meu
não declarado.

### 12.5 A forma do funil, e o que ela diz do teto

Com dono, por status (13/09/2026):

| status                   | com dono |     | status             | com dono |
| ------------------------ | -------- | --- | ------------------ | -------- |
| `em_atendimento`         | 8.034    |     | `analise_credito`  | 136      |
| `aguardando_atendimento` | 6.186    |     | `contrato_fechado` | 94       |
| `perdido`                | 2.354    |     | `agendado`         | 66       |
| `aguardando_retorno`     | 700      |     | `visita_realizada` | 37       |
| `qualificacao_corretor`  | 476      |     | `novo`             | 18       |

Dois números carregam o resto:

**14.220 leads — 78,6% de tudo que tem dono — estão em `em_atendimento` ou
`aguardando_atendimento`.** É a boca do funil inteira parada na mão de alguém.

**O fundo do funil inteiro são 239 leads.** Agendado (66) + visita realizada
(37) + proposta enviada (0) + análise de crédito (136), numa casa com 18.100
leads com dono. **1,3%.**

Dividido pelos 41 corretores com carteira real: **441 leads por corretor, dos
quais 6 no fundo do funil.** É a justificativa inteira do teto de 65 num par de
números — a carteira média não é um portfólio, é um cemitério com seis pessoas
vivas dentro. Nenhum corretor trabalha 441 leads; ele trabalha os que lembra,
e os outros 435 existem só para impedir que a roleta entregue leads novos.

### 12.6 `proposta_enviada` = 0, e isso mexe na escada de comissão

Nenhum lead em `proposta_enviada`. Ou o status não é usado, ou a proposta não é
registrada no CRM.

Isso torna acadêmica metade do §7: a janela de 30 dias que herdei para
`proposta_enviada` não governa lead nenhum hoje. A escada continua certa como
regra escrita, mas na prática ela opera em `agendado` (66 leads) e
`analise_credito` (136). O 50/50 é regra de justiça, não de volume — e vale
saber disso antes de gastar reunião com ela.

## 13. Correção do passo 1: posse e discagem são perguntas diferentes

`congelados_por_venda = 116` pareceu baixo, e a primeira hipótese foi venda
legada sem `vendas.lead_id`. **A hipótese está errada**, e o registro importa:
as duas portas de entrada em `contrato_fechado`/`pos_venda` já exigem venda
aprovada apontando para o lead — o trigger `trg_proteger_fechamento_insert`
(20260719120000) no INSERT, e `transicionar_lead` na transição, que é o único
caminho para mudar status no banco. Os 116 são provavelmente o número real.

O furo que sobra é estreito e real: **venda cancelada, rejeitada ou distratada
não reverte o status do lead.** Ele fica parado em `contrato_fechado` sem venda
viva, e `_lead_venda_viva` — correta em respeitar o distrato — deixa de
congelá-lo. No passo 1, ele entraria na lista do discador.

E a resposta certa não é congelar por status. Congelar por status desfaria a
regra do distrato: negócio que caiu devolve o lead à operação, e essa é a
intenção. São duas perguntas:

| pergunta                     | regra                           | respeita distrato?  |
| ---------------------------- | ------------------------------- | ------------------- |
| **posse** — de quem é o lead | `_lead_venda_viva(id)`          | sim                 |
| **discagem** — pode ligar    | filtro de status em `bolsao_v1` | não, e é proposital |

Uma função só respondendo as duas acertaria a lista e erraria a virada.

`status_de_venda_sem_venda_viva` no diagnóstico mede esse descasamento — leads
cujo status mente sobre a realidade. É número para a gestão zerar, não para o
código conviver com ele.

Migration: `20260914130000_bolsao_congelamento_por_status.sql`.

## 14. O buraco do §13 tem tamanho zero — e a guarda fica

Medido logo depois da correção:

|                                       | leads |
| ------------------------------------- | ----- |
| status `contrato_fechado`/`pos_venda` | 114   |
| desses, **sem venda viva por trás**   | **0** |
| que iriam para o discador             | **0** |

**Nenhum lead tem status mentindo hoje.** A correção do §13 conserta um furo
vazio, e isso merece ser dito sem maquiagem: não houve dano evitado, houve
estado futuro fechado.

A guarda fica, por duas razões. A primeira é que o estado é alcançável a
qualquer momento — basta uma venda ser cancelada ou distratada, e nada no
sistema reverte o status do lead. A segunda é que o custo é uma linha de
`WHERE` num filtro que já roda.

E os 114 fecham a conta dos 116 congelados do §12: dois leads têm venda em
`rascunho`/`pendente` enquanto ainda estão em fase anterior do funil. O
congelamento por venda viva está fazendo exatamente o que deve.

## 15. Passo 2 — a tela de consulta (`/bolsao`)

Terceira seção da Central de Comando: Fila Única (trabalho agora) → Reserva
(meu, esperando vaga) → Bolsão (da casa, sem dono).

**Sem botão de puxar, de propósito**, e a tela diz isso em texto. Uma tela que
só lista sem explicar a ausência do botão lê como funcionalidade quebrada, e
alguém "conserta" adicionando o botão — antes de a regra de comissão estar
publicada.

### 15.1 O que a tela deliberadamente não mostra

| não mostra                  | por quê                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| de quem o lead era          | a briga por lead começa quando se sabe de quem ele era (§5.2)           |
| o telefone inteiro          | sem máscara, puxar vira opcional: copia o número e liga por fora do CRM |
| autor ou texto do histórico | é por aí que o nome do corretor anterior vaza                           |

No lugar do histórico, dois rótulos agregados: o **sinal** (nunca tocado /
tentaram sem resposta / já houve conversa) e a **frieza** (tocado esta semana /
parado há semanas / há meses / há mais de 6 meses). A frieza usa os mesmos 7
dias da régua de posse do §5.1 — tela e banco não podem contar tempo de
formas diferentes.

### 15.2 Sem régua de papel

`/fila` e `/reserva` mandam o SDR para `/sdr`: ele não tem carteira de
corretor. `/bolsao` não faz isso, e é o ponto — o Bolsão é a base que o SDR
trabalha tanto quanto o corretor. O escopo real é decidido no banco
(`is_active_member`), e o que sai é anonimizado para todos igualmente.

### 15.3 Provas

9 testes de lógica pura e 6 guardas de fonte, verificadas por mutação: pôr o
telefone cru na tela ou importar um `useMutation` derruba a guarda
correspondente. As guardas leem o **código**, não os comentários — a prosa
desta feature fala justamente de autor e dono anterior, e uma guarda ingênua
acusaria a própria documentação.

1.785 testes de unidade, 542 de banco, bundle em 230,6 KB.

## 16. Perdido entra no Bolsão, menos três motivos

A reconciliação do §12.4 trouxe à tona um grupo que o desenho nunca tratou:
**2.354 leads `perdido` com dono.**

Eles vão para o Bolsão na virada. Foi o próprio corretor que os deu por
perdidos — soltá-los não é confisco, é coerência. E o motor de SDR já os
recicla depois de 30 dias, então incluí-los não inaugura política nenhuma:
alinha a virada com o que o sistema já faz.

Mas nem todo perdido é material de discador. O motor de SDR resolveu isso em
setembro e a resposta está no código: ao reciclar, ele pula
`ja_possui_imovel`, `comprou_concorrente` e `sem_perfil`. São os três motivos
em que reabordar não é oportunidade, é incômodo — ligar para quem acabou de
comprar apartamento, nosso ou do concorrente, queima a marca.

`bolsao_v1` reusa a mesma lista, via `motivo_perda_sem_retrabalho(text)`. A
alternativa seria discador e SDR trabalharem populações diferentes por
acidente de escrita.

Migration: `20260914140000_bolsao_nao_disca_quem_ja_comprou.sql`.

### 16.1 Dívida quitada: a fonte é uma só

Por um commit, a regra existiu em dois lugares — inline em
`alimentar_base_sdr_perdidos` e na função nova. Duas cópias da mesma regra não
divergem por descuido; divergem por trabalho normal. Alguém acrescenta um
motivo numa delas, a suíte passa, e a partir daí o discador e o SDR trabalham
populações diferentes sem que nada acuse. É divergência que não dá erro: dá
número errado, meses depois.

`20260914150000_motivo_perda_uma_fonte_so.sql` põe o motor de SDR sobre a
função. É refatoração pura — o corpo da migration é o corpo **vivo** da função
(`pg_get_functiondef`, não o texto do arquivo: se alguma migration a tivesse
redefinido, é a versão viva que vale), com exatamente uma linha trocada. O
diff do corpo antes/depois tem uma linha, e só.

Duas coisas sustentam a palavra "equivalente", em vez de ela ser só promessa
de cabeçalho:

- **Equivalência sobre todo o domínio.** `tests/db/motivo-perda.test.ts`
  compara as duas formas nos 11 valores do CHECK mais NULL. Um caso feliz não
  provaria nada sobre `NULL`, que é justamente onde as duas poderiam divergir
  — a função faz `COALESCE(_motivo, 'outro')` por dentro, e lead sem categoria
  de perda continua reciclável, como sempre foi.
- **Uma guarda no fim da migration** falha o deploy se qualquer outra função do
  schema voltar a carregar os três literais. A próxima cópia não chega em
  produção.

## 17. A conta da virada, refeita sobre a base de 18.100

|                                                               | leads       |
| ------------------------------------------------------------- | ----------- |
| com dono                                                      | 18.100      |
| congelados (venda viva ou status de venda)                    | ~96         |
| fundo do funil                                                | 239         |
| origem paga/qualificada (facebook, chatbot, impulso_smq, SDR) | ~2.754      |
| origem conquistada pelo corretor                              | ~212        |
| 3+ toques reais                                               | ~2.400      |
| **liberados para o Bolsão**                                   | **~12.400** |

Os grupos se sobrepõem (um lead de fundo pode ser do Facebook), então o número
real de protegidos é menor e o de liberados, maior. O intervalo honesto é
12,4–13,0 mil.

A diferença para os ~10,3 mil do §4 é quase inteira os 2.354 perdidos mais os
94 fechados que a conta antiga não enxergava.

Isso não se recalcula por estimativa no dia de virar: roda-se
`bolsao_diagnostico_v1()` e uma consulta de exceções sobre a foto do dia. É
para isso que o diagnóstico é repetível.

## 18. Destino por origem, implementado (`20260914160000`)

A régua do §6 saiu do papel. `devolver_leads_posse_expirada` mandava **todo**
lead de posse expirada para a base — inclusive o de Facebook, que custou
mídia. O problema é de dinheiro, não de arquitetura: mandar um lead pago para
a fila do discador quando um corretor o abandona é jogar fora o que a casa
pagou.

| origem                                     | destino            | como                                  |
| ------------------------------------------ | ------------------ | ------------------------------------- |
| paga (facebook, chatbot, impulso_smq, SDR) | **outro corretor** | `classe_lead='quente'`, `sdr_id=NULL` |
| conquistada pelo corretor                  | **não sai**        | excluída dos candidatos               |
| estoque (importacao, sheets, outro)        | base               | como antes                            |

**Não se chama o distribuidor aqui dentro.** Basta deixar o lead no estado que
o cron de distribuição já consome — `corretor_id IS NULL`, `sdr_id IS NULL`,
status `aguardando_atendimento` — e ele é redistribuído em até um minuto, com
`corretores_que_tentaram` impedindo que volte para quem o abandonou. Esta
função roda dentro de um cron; chamar o distribuidor em loop seria a forma
mais fácil de criar uma tempestade de escrita difícil de auditar.

Fecha também uma brecha: lead com **venda viva** não sai, mesmo em status
anterior ao fechamento. O filtro antigo só olhava `contrato_fechado`/
`pos_venda`, que são consequência da venda, não a venda.

## 19. A medição que mudou o desenho da carteira ativa (14/09/2026)

| corte, dentro de `em_atendimento` (8.057)  | leads     | %        |
| ------------------------------------------ | --------- | -------- |
| tocado nos últimos 7 dias                  | 599       | **7,4%** |
| com `proximo_followup` nos próximos 7 dias | **7.395** | **92%**  |

### 19.1 O "ou tarefa futura" está morto

A proposta de definir a carteira ativa como "fase avançada **e** atualizado
**ou** com tarefa futura" não sobrevive a esses números. `proximo_followup`
está preenchido em 92% dos leads em atendimento porque **o sistema o preenche
sozinho**, pela régua automática de 13 toques. O campo não significa "o
corretor se comprometeu"; significa "a régua calculou uma data".

| definição da carteira ativa                      | por corretor (41) |
| ------------------------------------------------ | ----------------- |
| qualificação + fundo + em atendimento **tocado** | **32**            |
| idem, aceitando `proximo_followup` como prova    | ≈ 198             |

O "ou" traria de volta o cemitério de hoje, agora carimbado como legítimo pelo
próprio sistema. Se a intenção for preservar o corretor que combinou de voltar
em 10 dias, o critério certo é **tarefa ou agendamento criados por ele** — que
é outra coisa, e o sistema já distingue.

### 19.2 O cemitério não é a importação

A releitura que os números impõem: **7.458 leads em `em_atendimento` não são
tocados há mais de uma semana** — 182 por corretor. Não são leads que ninguém
abriu; são leads que alguém começou a atender e abandonou. É pior que estoque
frio, porque o cliente foi contatado e criou expectativa.

### 19.3 O freio existente leva 5 meses

Com a régua de posse ligada, 7.458 leads sairiam. O freio de
`devolver_leads_posse_expirada` é `rn <= 10` por corretor **e `LIMIT 50` por
execução**, uma vez ao dia: **50/dia na casa inteira**, ou cerca de 5 meses
para drenar.

Antes de subir esse teto, a pergunta a medir é outra: **o lead devolvido volta
a ser trabalhado por quem recebe?** Se morrer também na mão do próximo,
acelerar só espalha o problema mais rápido.

## 20. O teto de 65 chega na gestão de carteira (`20260914180000`)

A Fatia 3 já tinha o teto: `carteira_ativa_v1` entrega no máximo
`capacidade_leads_ativos_por_corretor` (65) leads por corretor na Fila Única. A
tela de **gestão de carteira** não sabia disso — `carteira_stats_por_corretor_v1`
(§19, migration `20260914170000`) contava como "ativa" tudo que estava em
tratativa com sinal de vida, sem teto nenhum. Resultado: o corretor via 65 na
sua fila e o gestor via 90 no card do mesmo corretor. Dois números para o mesmo
nome, na mesma casa.

### 20.1 O que muda na RPC

| coluna                               | antes             | agora                               |
| ------------------------------------ | ----------------- | ----------------------------------- |
| `ativa`                              | tudo em tratativa | `LEAST(em tratativa, teto)`         |
| `acima_do_teto`                      | —                 | o excedente, como número próprio    |
| `teto`                               | —                 | o valor vigente da config           |
| `dias_atendimento` / `dias_avancado` | —                 | 7 e 30, para a tela filtrar a lista |

O excedente **não some da tela**. Um corretor com 90 em tratativa num teto de 65
é informação de gestão; mostrar 65 e calar os 25 seria o card mentindo por
omissão. Ele aparece como uma linha própria, em vermelho: `+25 acima do teto`.

O teto sai de `gestao_config_valor('capacidade_leads_ativos_por_corretor')`, a
**mesma** fonte da Fila Única, e volta na resposta para a tela não guardar uma
segunda cópia de 65. Uma guarda `DO $guard$` na migration reprova o deploy se
alguém fixar o número (ou os prazos) dentro da função — o modo de falhar que
importa aqui não é erro de cálculo, é divergência silenciosa entre duas telas.

### 20.2 O teto é por corretor, não do balcão

A linha de `corretor_id IS NULL` (leads sem dono) **não** é limitada. Ela não é
a carteira de ninguém; cortar o balcão em 65 seria inventar um número que não
existe em lugar nenhum. Há teste para isso, e o mutante que aplica o teto a todo
mundo morre nele.

### 20.3 A lista também para de mostrar o que não é carteira

Os cards contavam certo e a **lista** continuava mostrando a base inteira — ou
seja, continuava dominada por "Aguardando Atendimento", que é prospecção e tem
tela própria. A lista agora abre em **Em tratativa**, com um seletor de escopo
de três posições: `Em tratativa` (padrão) · `Parados` · `Todos`.

Duas decisões deliberadas:

- **`Todos` continua a um clique.** Esconder linhas de uma tela de gestão tem
  custo real: é justamente nela que o gestor seleciona e transfere em lote os
  leads que estouram o teto. Filtrar por padrão resolve a leitura; remover a
  saída resolveria a leitura e quebraria a ação.
- **A tela diz que está filtrando.** Ao lado da contagem, em letra pequena:
  "só o que está em tratativa (prospecção fica em Prospecção)". Uma lista
  filtrada que não avisa que está filtrada é pior que a lista cheia.

O escopo usa a mesma classificação da RPC, lead a lead, com o mesmo relógio
(`COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)`) e os
prazos vindos da resposta — nunca fixados no cliente. Sem os prazos na resposta
(banco com a migration anterior e não esta), o seletor não aparece e a lista
volta a mostrar tudo: melhor o comportamento antigo do que um recorte feito com
prazo chutado.

## 21. O discador disca o Bolsão (2026-09-15)

Decisão do dono: **"a base que o discador deve gerar é tudo que está fora da
carteira ativa dos corretores."** No vocabulário deste documento, isso é o
Bolsão — a camada sem dono do §1 — e não a Reserva: a Reserva ainda tem dono,
e o §6 já diz por qual porta um lead com dono chega ao discador (a régua de
devolução), nunca por um robô discando a carteira alheia.

O que mudou no código (desenho completo em
`docs/integracoes/3cplus-discador.md`, item 6):

- **Uma regra só para "quem está no Bolsão".** O predicado de `bolsao_v1` foi
  fatorado em `_bolsao_elegivel(leads)`; `bolsao_v1` e a reserva do discador
  leem a mesma função. As guardas deste documento (venda viva, opt-out,
  fechado sem venda, perdido sem retrabalho) valem para o discador por
  construção, não por cópia.
- **A fila é reservada no servidor**, não montada no navegador: a RLS esconde
  (e deve esconder) o telefone de lead que não é do corretor. A tabela
  `bolsao_discagem` registra qual corretor está discando qual lead, e a RPC
  `discador_bolsao_reservar_v1` (service_role só — devolve o telefone
  inteiro) pega os mais frios primeiro, pulando quem está com o SDR, quem
  foi discado há pouco, quem está reservado e quem o próprio corretor devolveu
  há pouco (anti-ioiô do §5.2). O corretor vê a própria sessão mascarada
  (`bolsao_discagem_minha_v1`) — a máscara do §11.1 continua valendo.
- **Quem atende entra na carteira de quem falou** (`discador_bolsao_assumir_v1`,
  chamada pelo webhook no primeiro atendimento real): só lead sem dono, fora
  do SDR e sem venda viva. Discar sem atender não dá posse. É a única escrita
  que o discador faz em `leads`, e fica em `distribution_log` (regra
  `discador_bolsao`). Não é o "puxar" do §5.2: puxar é escolher um lead
  específico; aqui é o robô conectando o corretor a um lead frio que ninguém
  tinha — sem dono anterior a proteger e sem cota, porque não há como
  garimpar a base pelo discador (a ordem é a frieza, não a escolha).
- As funções que escrevem chamam-se `discador_bolsao_*`, não `bolsao_*`: a
  guarda de `tests/db/bolsao.test.ts` ("nenhuma função do Bolsão é VOLATILE")
  continua verdadeira — o Bolsão em si segue só leitura.

Configuração em `gestao_config.bolsao`: `discador_lote` (200),
`discador_rediscagem_dias` (7), `discador_reserva_horas` (24),
`discador_anti_ioio_dias` (30), `discador_assume_ao_atender` (true).

## 22. "Próximo passo" era qualquer tarefa aberta — inclusive as vencidas (`20260914190000`)

A §20 pôs o teto na tela e mediu 4 corretores acima dele, 181 leads de
excedente. A pergunta seguinte — _o que são esses leads?_ — descobriu um
defeito que invalidava a leitura inteira.

### 22.1 O que a medição encontrou (14/09/2026, os 4 acima do teto)

| pergunta                                   | resposta               |
| ------------------------------------------ | ---------------------- |
| leads em tratativa                         | 444                    |
| com tarefa **escrita** pelo corretor       | **0**                  |
| com tarefa de título gerado pela régua     | 374                    |
| com `origem_automatica = true` (motor SDR) | 2                      |
| com visita/reunião marcada                 | 2                      |
| **com algo marcado no futuro**             | **79 (18%)**           |
| tarefas abertas **já vencidas**            | 567                    |
| atraso máximo                              | 88 dias (o CRM tem 91) |

As tarefas **não** nasceram em lote: 644 tarefas abertas em 596 minutos
distintos, maior aglomeração de 5 num minuto. Os corretores trabalham um a um
— registram o contato, aceitam o follow-up sugerido ("Amanhã" é o padrão do
diálogo) e não fecham a tarefa quando a data chega.

### 22.2 O defeito

A regra de `sem_proximo_passo` vivia em dois lugares, com o mesmo texto —
`_carteira_classificar` (o motivo da Reserva) e `fila_equipe_v1` (o contador
do gestor):

```sql
AND NOT EXISTS (
  SELECT 1 FROM public.tarefas AS t
  WHERE t.lead_id = v.id AND t.status IN ('pendente', 'em_andamento')
)
```

Sem filtro de vencimento e sem `deleted_at IS NULL`. Uma tarefa que venceu há
40 dias continua `pendente` e blindava o lead. Dos 444, **365 apareciam como
"com próximo passo"** — a tela de equipe mostrava time em dia.

`leads.proximo_followup` não salva a conta e por isso ficou fora da regra
nova: ele é espelho de `min(data_vencimento)` das tarefas pendentes
(`sync_proximo_followup`, `20260708155905`). Sendo `min`, ele aponta para a
dívida mais **velha**, não para o próximo passo. As tabelas de origem
respondem melhor a pergunta do que o espelho delas.

### 22.3 O conserto

`public.lead_sem_proximo_passo(uuid)` passa a ser a fonte única: nenhuma tarefa
aberta com vencimento no futuro, nenhum agendamento futuro. `_carteira_classificar`,
`fila_equipe_v1` e `carteira_stats_por_corretor_v1` chamam a mesma função — a
regra em três cópias foi exatamente o que deixou o defeito sobreviver em dois
lugares sem ninguém notar.

A gestão de carteira ganha `sem_passo_vivo`: dentro do que está em tratativa,
quantos não têm nada marcado adiante. O card mostra a linha em âmbar.

**O que este conserto deliberadamente NÃO faz:** mudar o que é "em tratativa".
A carteira continua contada pelo relógio do último toque, o mesmo da régua de
devolução. A alternativa — exigir passo vivo para o lead contar como tratativa
— daria um número mais honesto (a carteira dos quatro cairia de 444 para 79) ao
custo de a tela passar a discordar da operação. Tela e régua medindo tempo de
formas diferentes é o pior dos dois mundos, e é contra isso que este documento
existe.

### 22.4 O que isso faz com os 181 do §20

Reenquadra. O excedente dos quatro não é trabalho que não cabe no teto: é
carteira morta que ainda respira no relógio da higiene. Redistribuir os 181
para quem tem folga seria mudar de lugar o mesmo problema. Os quatro
corretores mais carregados da casa somam **79 tratativas vivas** contra um teto
somado de 260.

Uma guarda `DO $guard$` reprova o deploy se alguém voltar a perguntar "existe
tarefa pendente" sem olhar a data, ou se qualquer uma das três funções deixar
de chamar `lead_sem_proximo_passo(`. O parêntese na guarda não é enfeite: a
primeira versão procurava só o nome, e um comentário citando a função
satisfazia a checagem sem que a chamada existisse — pego por teste de mutação.
