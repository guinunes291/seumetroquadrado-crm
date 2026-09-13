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
3. **Distribuição de `ultima_interacao` dentro dos 2.304 com 3+ toques**, para
   calibrar `puxar_frio_dias` com dado em vez de palpite.

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
