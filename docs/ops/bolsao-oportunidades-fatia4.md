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

### 5.1 Puxar (auto-serviço, anônimo) — antes de `agendado`

`carteira_puxar(_lead uuid)`. Todas as condições são obrigatórias:

1. **Status anterior a `agendado`**: `novo`, `aguardando_atendimento`,
   `em_atendimento`, `qualificado`, `aguardando_retorno`, `aguardando_corretor`,
   `qualificacao_corretor`. `perdido` é permitido — é onde mora valor reciclável
   — mas com carência dobrada.
2. **Sem venda registrada** (exceção 1 do §4).
3. **Lead frio**: `COALESCE(GREATEST(ultima_interacao, ultimo_contato),
created_at) <= now() - puxar_frio_dias`. Proposta: **15 dias** (30 para
   `perdido`). Se o dono falou com o cliente ontem, ninguém puxa.
4. **Tem vaga**: `carteira_vagas_v1(caller) > 0` **e** a faixa `resgate` não
   está cheia (cap 13). Reaproveita o mecanismo da Fatia 3 — nada novo.
5. **Cota diária**: `puxar_por_dia`, proposta **10**. Impede varredura da base.
6. **Anti-ioiô**: não pode puxar lead que ele mesmo soltou nos últimos 30 dias.
7. **Registro obrigatório** em `carteira_resgates`, agora com `dono_anterior_id`
   e `origem_do_puxao` — invisível para o corretor, obrigatório para a gestão.

#### Anonimização de verdade

A view `bolsao_v1` não expõe `corretor_id` nem o nome do dono anterior. Isso não
basta: **o nome vaza pelo histórico**. Na tela de puxar o histórico aparece
agregado — "4 toques, último há 23 dias" — sem autor e sem texto. Depois de
puxar, o histórico completo abre: aí ele é o dono e precisa do contexto.

Sem essa segunda metade, a anonimização é decorativa.

### 5.2 Transferência (pela gestão) — de `agendado` em diante

Tabela `transferencias_pedidos`: `lead_id`, `solicitante_id`, `motivo`,
`status` (`pendente`/`aprovado`/`negado`/`expirado`), `decidido_por`,
`decidido_em`, `comissao_regra`.

A aprovação chama `transferir_leads([lead], solicitante)`, que **já existe** e já
tem o gate forte (admin/superintendente/gestor + `pode_atribuir_lead` +
`pode_acessar_lead` por lead, restaurado em `20260711210000`). Não se cria
função nova de transferência.

O campo `comissao_regra` é **obrigatório no formulário de aprovação**:
`100% novo dono` | `50/50` | `100% dono anterior`. Decidir na hora da aprovação,
por escrito, é o que evita a briga depois da venda.

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

## 7. A regra de comissão do puxar — a decisão bloqueante

**Isto precisa estar escrito e comunicado antes do primeiro puxão.** Se não
estiver, vira o maior gerador de conflito da operação.

**Proposta:**

> Lead sem toque há mais de `puxar_frio_dias` é considerado **abandonado**.
> Quem puxa assume **100%** da comissão. Não há direito retroativo do dono
> anterior.

Racional: se o corretor não falou com o cliente em 15 dias, ele não está
trabalhando o lead; e a regra tem que ser automática, senão toda venda vira
arbitragem da gestão.

O contraponto honesto: um corretor que deu 4 toques e viu o cliente sumir perde
o trabalho. Duas mitigações já embutidas: a carência de 15 dias e a quarta
exceção do §4 (3+ toques mantém dono na virada). E o log de `carteira_resgates`
permite a gestão reverter caso a caso.

**Alternativa** se a diretoria não aceitar 100%: **70/30 nos primeiros 60 dias**
após o puxão, 100% depois. Mais justo e mais caro de operar — precisa entrar no
cálculo que hoje vive em `vendas.percentual_corretor`.

A tela de confirmação do puxão deve exibir a regra vigente em texto. O corretor
clica sabendo.

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
3. `carteira_puxar` com cota baixa (3/dia) + regra de comissão publicada.
4. Fila de transferência pela gestão.
5. **Só então** a virada: libera os ~10,3 mil de estoque sem toque.
6. **Por último** a régua de devolução automática, ligada grupo a grupo,
   começando por `reserva` + estoque — o grupo mais barato de errar.

## 10. Configuração

Tudo em `gestao_config`, chave `bolsao`, seguindo o padrão da Fatia 3:

```json
{
  "puxar_frio_dias": 15,
  "puxar_frio_dias_perdido": 30,
  "puxar_por_dia": 10,
  "puxar_anti_ioio_dias": 30,
  "transferencia_expira_dias": 7,
  "devolver_pago_dias": 15,
  "devolver_estoque_dias": 30
}
```
