# Simuladores das construtoras: como o fluxo é calculado

Motor genérico: `src/lib/simuladores/fluxo.ts` (funções puras, sem React).
Motor da Vibra: `src/lib/simuladores/vibra.ts`, com a tabela oficial em `src/lib/simuladores/tabela-vibra.ts` (ver a seção 10).
Motor da Mundo Apto: `src/lib/simuladores/mundo-apto.ts`, com os vencimentos da política em `src/lib/simuladores/tabela-mundo-apto.ts` (ver a seção 11).
Motor da Longitude: `src/lib/simuladores/longitude.ts`, com as premissas por empreendimento em `src/lib/simuladores/tabela-longitude.ts` (ver a seção 12).
Regras por construtora: `src/lib/simuladores/construtoras.ts`.
Recursos estimados pela renda: `src/lib/simuladores/recursos.ts` (reusa `lib/orcamento`, tabela APROVE 2026).
Tela: `/simuladores` (módulo Documentação & Projetos), uma aba por construtora: Vibra, Direcional, Longitude e Mundo Apto.
Testes: `tests/simuladores-fluxo.test.ts`, `tests/simuladores-estado.test.ts`, `tests/simuladores-pdf.test.ts`, `tests/simuladores-vibra.test.ts`, `tests/simuladores-vibra-saidas.test.ts`, `tests/simuladores-mundo-apto.test.ts`, `tests/simuladores-mundo-apto-saidas.test.ts`, `tests/simuladores-longitude.test.ts`, `tests/simuladores-longitude-saidas.test.ts` e `tests/simuladores-page.test.tsx`.

**Pró-soluto** (definição da operação, 2026-10-11): tudo o que sobra depois do financiamento (com FGTS e subsídio), do ato e dos sinais. Entram anuais, mensais durante a obra, mensais pós-obra, única, semestrais e o que mais houver. É o critério das três abas com regra própria: na Vibra fica de fora os 4 atos; na Mundo Apto, o ato e as entradas de 30/60/90 dias; na Longitude, o ato.

A Planilha de amortização (`/simulador-amortizacao`, ver `docs/amortizacao.md`) responde quanto o cliente paga **ao banco**. Os Simuladores respondem quanto ele paga **à construtora**. As duas telas têm link uma para a outra.

## 1. A conta

```
Saldo com a construtora = Valor do imóvel − Financiamento − Subsídio − FGTS
Parcelado               = Saldo com a construtora − Ato
```

O saldo vira o fluxo:

| Parcela        | Quando                                          | Quem define o valor                        |
| -------------- | ----------------------------------------------- | ------------------------------------------ |
| Ato            | Mês do ato (padrão: o mês corrente)             | Corretor (com piso da regra)               |
| Mensais        | Do mês seguinte ao ato até a última mensal      | O resto dividido igualmente (modo padrão)  |
| Intermediárias | Anual, semestral ou todo dezembro, no prazo     | Corretor (valor de cada uma)               |
| Chaves         | Mês da entrega                                  | Corretor (ou o resto, no modo mensal fixa) |
| Pós-chaves     | Os N meses depois da entrega (se a regra deixa) | Tabela Price com juros da regra            |

Dois modos de fechar o saldo:

- **Saldo nas mensais** (padrão, é como a tabela da construtora apresenta): ato, intermediárias e chaves são digitados; o resto é dividido nas mensais. A última mensal absorve o centavo que sobra da divisão.
- **Mensal fixa**: o corretor fixa a mensal que cabe no bolso do cliente e o resto vai para as chaves. Se a mensal quitar o saldo antes das chaves, a tela corta na mensal máxima possível e avisa.

## 2. Por que o fluxo muda todo mês

O nº de mensais **não é digitado**. Ele é contado do mês seguinte ao ato até a última mensal, e a última mensal é presa à entrega (padrão: o mês anterior às chaves). Cada mês que o cliente demora para assinar, o produto perde uma mensal e o mesmo saldo se divide por menos parcelas.

Exemplo (o caso dos testes): imóvel de R$ 260 mil, banco + subsídio + FGTS = R$ 210 mil, ato de R$ 3 mil, chaves de R$ 9 mil, entrega em jun/2028.

| Assinando em | Mensais | Mensal      | Diferença  |
| ------------ | ------- | ----------- | ---------- |
| out/2026     | 19      | R$ 2.000,00 | —          |
| nov/2026     | 18      | R$ 2.111,11 | +R$ 111,11 |
| dez/2026     | 17      | R$ 2.235,29 | +R$ 235,29 |
| jan/2027     | 16      | R$ 2.375,00 | +R$ 375,00 |

A tela mostra essa tabela no card **Quanto custa esperar**: é o argumento de urgência pronto para o atendimento ("fechando este mês são 19 mensais de R$ 2.000; no mês que vem, 18 de R$ 2.111").

As intermediárias também somem com o tempo: um balão de dezembro só conta se o dezembro ainda estiver dentro do prazo das mensais.

Se a tabela da construtora disser "mensais até mm/aaaa", preencha **Última mensal**: ela manda sobre a regra automática.

## 3. Regras da construtora

Todas as regras numéricas usam **0 = sem regra**.

| Regra                                  | O que faz                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Ato mínimo (% e R$)                    | Vale o maior dos dois. Ato abaixo: erro.                                  |
| Mensal mínima                          | Mensal abaixo do piso: aviso.                                             |
| Última mensal (meses antes da entrega) | 1 = mês anterior às chaves; 0 = no próprio mês.                           |
| Intermediárias                         | Nenhuma, anual (12 meses do ato), semestral (6 meses do ato) ou dezembro. |
| Parcelado máximo (% do imóvel)         | Tudo menos o ato. Acima: erro, com quanto falta em reais.                 |
| Renda comprometida máxima              | (Mensal + parcela do banco) ÷ renda. Acima: aviso.                        |
| Pós-chaves (permitido, teto, juros)    | Parcelas depois das chaves, Tabela Price com os juros mensais da regra.   |
| INCC projetado (% ao ano)              | Só para a coluna "com INCC". A tabela continua nominal.                   |

O **parcelado máximo** abre em 20%, a mesma regra 80/20 do CRM (`TETO_PARCELAMENTO_CONSTRUTORA` em `lib/orcamento.ts`, a do Match e da pré-qualificação APROVE). O ato fica fora dos 20% pelo mesmo motivo de lá: é recurso próprio pago na assinatura, não parcelamento.

Na **renda comprometida** a tela soma a mensal com a parcela cheia do banco. É conservador: durante a obra o cliente paga ao banco só os encargos de obra, que são menores.

## 4. Estado das regras (out/2026) e como calibrar

A **Vibra** está conferida com o simulador oficial do canal (seção 10), a **Mundo Apto** com a política de crédito do Tabelão de out/2026 (seção 11) e a **Longitude** com o código do simulador oficial (seção 12), cada uma com motor próprio. Só a **Direcional** ainda abre no fluxo genérico com o **padrão da operação**, porque o simulador de referência dela (_smq-fluxo_) não pôde ser lido:

- parcelado até 20% do imóvel (regra 80/20 do CRM);
- INCC projetado de 6,55% ao ano (INCC-M acumulado em 12 meses até ago/2026, FGV);
- juros pós-chaves de 1% a.m., a convenção mais comum de mercado, mas **pós-chaves desligado**;
- ato mínimo, piso da mensal e intermediárias **sem regra**.

Enquanto `conferidoEm` for `null`, a tela mostra "regras a conferir". Para calibrar uma construtora do fluxo genérico com a tabela vigente:

1. Em `SIMULADORES_CONSTRUTORAS`, troque o `preset(...)` dela por regras explícitas.
2. Preencha `conferidoEm` (data) e `fonte` (ex.: "tabela out/2026 enviada pelo gerente").
3. Suba a `versao`. A chave dos ajustes salvos (`simuladores:regras:v{versao}:{id}`) muda e os ajustes antigos de todos os corretores são descartados. Assim ninguém fica simulando com regra velha.

Enquanto isso, o corretor pode ajustar as regras no card **Regras da construtora**. O ajuste fica salvo só para ele (user_preferences) e a tela marca "ajustadas por você" com o botão "Restaurar regras padrão".

## 5. Recursos do banco

O corretor digita financiamento, subsídio, FGTS e a parcela do banco (de preferência os valores da aprovação). Sem aprovação, o botão **Estimar pela renda** usa a tabela APROVE 2026 (`calcularOrcamento`) com a mesma regra do `avaliarAderencia`: o banco financia o **menor** entre o máximo da renda e 80% do imóvel, e a parcela acompanha o corte.

## 6. Correção (INCC)

A coluna "com INCC" corrige cada parcela pelo INCC projetado do mês do ato até o mês dela, parando nas chaves:

```
valor corrigido = valor × (1 + INCC mensal)^(meses desde o ato, no máximo até as chaves)
INCC mensal     = (1 + INCC anual)^(1/12) − 1
```

O ato não corrige. O pós-chaves corrige só até as chaves, porque depois o contrato costuma trocar de índice (IPCA, IGP-M), e esse índice não é projetado. Exemplo: chaves de R$ 9.000 em 20 meses a 6,55% ao ano ficam em cerca de R$ 10.004.

## 7. Entrega e empreendimento

A entrega vem de `projetos.mes_entrega` / `ano_entrega`. Se o cadastro só tem o ano, a tela assume dezembro e avisa. Os projetos listados em cada aba são os ativos do catálogo (os mesmos da prateleira) cuja construtora casa com a aba (`parceiraDoProjetoOuNome`, a mesma regra das parceiras). As unidades vêm de `unidades` com status `disponivel` e valor preenchido.

## 8. Saídas: WhatsApp e PDF

- **Copiar para WhatsApp**: o fluxo em texto (`textoWhatsApp`), com a validade da condição ("assinatura em out/2026: a cada mês o número de mensais diminui").
- **Exportar PDF**: A4 retrato (`features/simuladores/fluxo-pdf.ts`), no mesmo padrão da planilha de amortização: recursos, fluxo, quanto custa esperar, cronograma mês a mês e premissas. PDF é o único formato de exportação, pela mesma decisão de 2026-10-11 que tirou o Excel da planilha: o material vai para o cliente.

## 9. Links e dossiê

`/simuladores?construtora=mundo-apto&projeto={id}&valor=250000&renda=7000` abre a aba e preenche os campos. Também aceita `financiamento`, `subsidio`, `fgts` e `parcela`.

Trocar de aba leva valor, renda e recursos do banco na URL: o mesmo cliente aparece já preenchido na outra construtora, mesmo quando o formulário é diferente (a Vibra soma subsídio e FGTS num campo só; de volta às outras abas a soma vai como subsídio).

O dossiê do lead (aba Qualificação) tem o botão **Fluxo da construtora**. Com aprovação de crédito vigente (view `aprovacoes_credito_vigentes`), ele leva financiamento, subsídio, FGTS, parcela e a renda da carta (`features/simuladores/prefill-lead.ts`, mesma fonte da planilha de amortização). Sem aprovação, leva só a renda informada.

## 10. Vibra: a tabela oficial do canal

Fonte: o simulador do canal Vibra Parcerias (Equipe Grego), versão de out/2026, conferido em 11/10/2026. A Vibra não divide o saldo em mensais iguais: cada **tipo** de parcela tem um teto pela **renda**, e o corretor monta o fluxo até a soma bater.

```
Financiamento líquido = financiado × retenção     (0,99 ou 0,985: 1% ou 1,5% para o INCC até a Caixa)
Total até a entrega   = valor − financiamento líquido − (subsídio + FGTS)
FECHOU                = soma do fluxo = total até a entrega
```

| Linha     | Quando                                           | Teto de cada parcela               |
| --------- | ------------------------------------------------ | ---------------------------------- |
| 4 atos    | mês do ato e os 3 seguintes (0, 30, 60, 90 dias) | livre                              |
| Mensais 1 | a partir do 5º mês, em sequência                 | 28% da renda                       |
| Mensais 2 | logo depois das Mensais 1                        | 22% da renda                       |
| Mensais 3 | logo depois das Mensais 2                        | 18% da renda                       |
| Anuais    | dezembro da tabela (a 2ª, 12 meses depois)       | 100% da renda                      |
| Única     | data da tabela                                   | 50% ou 100% da renda (tabela)      |
| Pós-chave | a partir da data da tabela                       | 10% da renda; total ≤ 5% do imóvel |

Pró-soluto (tudo menos os atos) ≤ 15% do imóvel. "Parcela morando" = 30% da renda.

**Cada mês sem assinar o produto perde uma mensal.** As quantidades da tabela (g1, g2, g3) valem para quem assina no mês-base dela (out/2026). As faixas são datas fixas da obra; quem assina um mês depois empurra os 4 atos um mês e a mensal que caía no 5º mês some. A tela recalcula a partir do **Mês do ato**: sai primeiro a faixa de 28%, depois a de 22%, depois a de 18%. Exemplo (Parque Vila Sônia, renda de R$ 5 mil, imóvel de R$ 300 mil, R$ 210 mil financiados e R$ 40 mil de subsídio + FGTS, total até a entrega de R$ 52.100):

| Assinando em | Mensais | Parcelado máximo | Atos no mínimo | Diferença |
| ------------ | ------- | ---------------- | -------------- | --------- |
| out/2026     | 17      | R$ 37.400,00     | R$ 14.700,00   | -         |
| nov/2026     | 16      | R$ 36.000,00     | R$ 16.100,00   | +R$ 1.400 |
| dez/2026     | 15      | R$ 34.600,00     | R$ 17.500,00   | +R$ 2.800 |
| jan/2027     | 14      | R$ 33.500,00     | R$ 18.600,00   | +R$ 3.900 |

Anual, única e pós-chave seguem a mesma lógica: o que cairia dentro do período dos atos sai do fluxo (vira ato).

O que a tela do CRM faz além do simulador oficial:

- **Preencher pelo teto**: põe cada parcela no máximo, na ordem do calendário (Mensais 1, 2, 3, anuais, única e por último o pós-chave, que pesa junto com a parcela do banco), até cobrir o total ou bater os 15% de pró-soluto. O que não cabe vai para os 4 atos, em partes iguais. É ponto de partida: o corretor ajusta linha a linha.
- **Status mais honesto**: o oficial mostra "FECHOU!" sempre que a soma bate, mesmo com parcela acima do teto. Aqui, se a soma bate mas algo passa do limite, o status diz o quê ("A conta fecha, mas passa do limite da Vibra: Mensais 2 (máx. R$ 1.100,00 cada)").
- **Unidade do catálogo**: o empreendimento da tabela é ligado ao projeto do catálogo pelo nome normalizado (sem acento, sem "Vibra", Pq./Vl./Jd. por extenso) e, nos casos de grafia diferente, pela lista `NOMES_NO_CATALOGO`. A **previsão de entrega** vale a da tabela da Vibra, não a do catálogo (o Marechal Tito, por exemplo, está jul/2027 no catálogo e jan/2028 na tabela).
- WhatsApp, PDF (a mesma folha do oficial, com quanto custa esperar e o cronograma) e o cronograma mês a mês.

**Atualizar a tabela todo mês**: copie o objeto `EMPREENDIMENTOS` do código-fonte do simulador oficial e cole em `tabela-vibra.ts` sem mudar o formato (o `prettier-ignore` mantém uma linha por empreendimento, igual à fonte). Atualize `CONFERIDA_EM` e suba a `versao` da Vibra em `construtoras.ts`. Os testes de `tests/simuladores-vibra.test.ts` conferem que as datas são válidas e que as mensais terminam antes do pós-chave.

## 11. Mundo Apto: a política de crédito do Tabelão

Fonte: "Tabelão Promocional Outubro 2026" da Mundo Apto Parcerias, páginas da Política de Análise de Crédito (versão de 09/04/2026), conferidas em 11/10/2026. Vale também para a marca Elevato. Como na Vibra, cada parcela tem teto pela renda (aqui, a **renda líquida**) e a política limita quanto do preço vai em cada grupo.

```
Com a construtora = valor − financiamento − subsídio − FGTS   (tabela direta: o valor inteiro)
FECHOU            = soma do fluxo = com a construtora, e todas as regras da política atendidas
```

| Parcela       | Associativo (SICAQ)                | SFH (banco)                        | Tabela direta        |
| ------------- | ---------------------------------- | ---------------------------------- | -------------------- |
| Ato           | livre                              | livre, mínimo 6% do preço          | ato + entradas = 30% |
| Entrada 30    | livre                              | 100% da renda                      | (idem)               |
| Entrada 60/90 | 100% da renda                      | 100% da renda                      | (idem)               |
| Mensal pré    | 30% da renda, até 12% do preço\*   | 30% da renda, "24% (mín.)"\*\*     | parcelas = 70%       |
| Semestral     | 100% da renda                      | 100% da renda                      | (idem)               |
| Anual         | 100% da renda, até 5% do preço     | 100% da renda                      | (idem)               |
| Única         | 100% da renda (no habite-se)       | 100% da renda (no habite-se)       | (idem)               |
| Mensal pós    | 10% da renda, até 8%, até 42 meses | só R$ 100/mês para fechar 36 meses | não tem              |
| Financiamento | livre                              | até 70% com o FGTS                 | não tem              |

\* Os 12% podem ser ultrapassados se cada mensal cabe nos 30% da renda e o pró-soluto fica até 25% (observação 7). A tela mostra "acima de 12%, permitido".

\*\* Ao pé da letra, 6% de ato + 70% de financiamento + 24% de mensais já fecham 100%, sem espaço para entradas, intermediárias ou o pós de R$ 100 que a própria política permite. A tela mostra essa regra com o ícone "a confirmar", sem tirar o FECHOU, até o gerente confirmar a leitura.

Regras gerais, conferidas no card **Conferência da política**: pró-soluto até 25% (associativo e SFH), prazo mínimo de 36 meses (associativo e SFH), nenhuma parcela abaixo de R$ 100, semestral **ou** anual (a tela deixa escolher uma).

**Vencimentos por empreendimento**: a única cai no **habite-se** e a mensal pós começa no mês seguinte (a tabela da política bate com a entrega do catálogo: MA Brooklin jun/2027, Santa Cecília abr/2027 etc.). Os seis empreendimentos com "—" na política (Praça da Sé, Pacaembu, Vila Matilde, Jabaquara, Freguesia, Inajar) não têm semestral, anual, única nem mensal pós; o habite-se vem do catálogo ou é digitado. "Outro" serve para empreendimento fora da tabela.

**Cada mês sem assinar sai uma mensal**: as mensais pré vão do 5º mês (depois da entrada de 90 dias) até o mês anterior ao habite-se. Exemplo (MA Brooklin, unidade 2006 a R$ 322.720, renda líquida de R$ 6 mil, R$ 230 mil de financiamento, R$ 10 mil de subsídio e R$ 15 mil de FGTS, com a construtora R$ 67.720):

| Assinando em | Mensais | Parcelado máximo | Entrada mínima | Diferença |
| ------------ | ------- | ---------------- | -------------- | --------- |
| out/2026     | 4       | R$ 29.400,00     | R$ 38.320,00   | -         |
| nov/2026     | 3       | R$ 28.200,00     | R$ 39.520,00   | +R$ 1.200 |
| dez/2026     | 2       | R$ 27.000,00     | R$ 40.720,00   | +R$ 2.400 |
| jan/2027     | 1       | R$ 25.800,00     | R$ 41.920,00   | +R$ 3.600 |

Cada mês sai uma mensal de até R$ 1.800 (30% da renda) e entra uma de pós de até R$ 600 (o prazo de 36 meses passa a terminar um mês depois): a entrada sobe R$ 1.200 por mês.

**Preencher pela política** põe R$ 100 em cada parcela de pós (é o que fecha os 36 meses), leva as parcelas até o limite de cada regra (no associativo: mensais até 12%, anual ou semestral, única, pós até o teto e, só se ainda faltar, mensais acima de 12%) e deixa o resto no ato e nas entradas, com o teto das entradas pela renda (o excedente fica no ato, que é livre) e o ato mínimo do SFH.

**Pró-soluto** é tudo menos ato e entradas (definição confirmada pela operação). **Leituras da política** (o que ela não diz com todas as letras, todas em `mundo-apto.ts`): as mensais pré começam depois da entrada de 90 dias; semestrais em junho e dezembro (a política diz "livre" e o quadro da campanha de adimplência põe a primeira em 30/12/2026); o prazo mínimo de 36 meses não é cobrado na tabela direta, que não tem pós para completá-lo.

**Atualizar**: quando vier Tabelão novo, confira as páginas "Modalidades de pagamento" e "Vencimentos e regras gerais". Vencimentos e versão ficam em `tabela-mundo-apto.ts`; os percentuais de cada modalidade em `MODALIDADES_MA` (`mundo-apto.ts`). Suba a `versao` da Mundo Apto em `construtoras.ts`. Os preços promocionais das unidades do Tabelão não entram aqui: o valor vem da tabela de unidades do catálogo ou é digitado.

## 12. Longitude: as regras do simulador oficial

Fonte: o código do simulador oficial (simulador.longitude.com.br, `simulador.js`), modo **linear**, conferido em 11/10/2026. O fluxo é uma tabela de linhas, como no simulador da Longitude:

| Linha         | Quantidade                                   | Teto de cada parcela                             |
| ------------- | -------------------------------------------- | ------------------------------------------------ |
| Ato           | 1                                            | ato mínimo do empreendimento (quando cadastrado) |
| Pré-chaves    | meses do ato até a entrega (entra a entrega) | comprometimento pré × renda (ex.: 25,99%)        |
| Anuais        | dezembros depois do ato até a entrega        | 100% da renda                                    |
| Pós-chaves    | total de parcelas − pré-chaves               | total pós × renda − 1ª parcela do banco          |
| Outros        | 1                                            | livre, mas sempre pede aprovação                 |
| Periodicidade | R$ 100 no 37º mês, se ato + pré + pós ≤ 36   | fixo                                             |
| Adimplência   | avaliação − tabela, fora do valor final      | fixo                                             |

Banco: financiamento até 80% da avaliação; FGTS + subsídio + financiamento até a avaliação. A 1ª parcela do financiamento é limitada a 30% da renda (vazio = os 30%).

**Premissas práticas** (o quadro do simulador oficial): comprometimento pré-chaves, pró-soluto pós-chaves (total pós ÷ valor final), comprometimento total pós ((pós + 1ª parcela) ÷ renda) e referência ((ato + banco) ÷ valor final, mínimo de 60%). Sem erro e sem aviso: **APTO PARA VENDA**. Senão: **NECESSÁRIO APROVAÇÃO**, com a lista do que pede aprovação. Fluxo abaixo da tabela é **desconto** (pede aprovação); acima é **ganho de preço** (não pede).

**Cada mês sem assinar**: o total de parcelas do pró-soluto é fixo; sai uma pré-chaves (teto alto, % da renda) e entra uma pós-chaves (teto baixo, também limitado a % do valor). Assinando em dezembro, aquele dezembro sai das anuais. Exemplo (Cittá, renda de R$ 4 mil, tabela de R$ 220 mil, banco de R$ 170 mil, entrega jun/2028):

| Assinando em | Pré-chaves | Ato mínimo para fechar | Diferença    |
| ------------ | ---------- | ---------------------- | ------------ |
| out/2026     | 20         | R$ 10.230,00           | -            |
| nov/2026     | 19         | R$ 11.269,60           | +R$ 1.039,60 |
| dez/2026     | 18         | R$ 16.309,20           | +R$ 6.079,20 |
| jan/2027     | 17         | R$ 17.348,80           | +R$ 7.118,80 |

**Premissas por empreendimento**: no simulador oficial elas vêm do painel da Longitude (e variam pelo score de crédito B2E do cliente). O código só traz um fallback de 7 empreendimentos (Vibe, Zen, Cittá, Estação Dom Bosco, Perus, Rio Branco e Tietê) e o padrão (60 parcelas; 25,99% / 8,99% / 45% / 60%). A tela abre com esses valores, mostra todos no card **Premissas do empreendimento** e deixa o corretor ajustar para o que o simulador oficial mostrar. A previsão de entrega vem do catálogo quando ele tem a data (quase nenhum tem); senão o corretor digita.

Fica de fora: o modo **regressivo** e as regras por **score B2E**, que dependem do motor de crédito e do painel da Longitude. O pró-soluto exibido inclui os R$ 100 da periodicidade (o oficial deixa de fora), pela definição da operação.
