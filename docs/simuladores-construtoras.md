# Simuladores das construtoras: como o fluxo é calculado

Motor genérico: `src/lib/simuladores/fluxo.ts` (funções puras, sem React).
Motor da Vibra: `src/lib/simuladores/vibra.ts`, com a tabela oficial em `src/lib/simuladores/tabela-vibra.ts` (ver a seção 10).
Regras por construtora: `src/lib/simuladores/construtoras.ts`.
Recursos estimados pela renda: `src/lib/simuladores/recursos.ts` (reusa `lib/orcamento`, tabela APROVE 2026).
Tela: `/simuladores` (módulo Documentação & Projetos), uma aba por construtora: Vibra, Direcional, Longitude e Mundo Apto.
Testes: `tests/simuladores-fluxo.test.ts`, `tests/simuladores-estado.test.ts`, `tests/simuladores-pdf.test.ts`, `tests/simuladores-vibra.test.ts`, `tests/simuladores-vibra-saidas.test.ts` e `tests/simuladores-page.test.tsx`.

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

A **Vibra** está conferida com o simulador oficial do canal e usa um motor próprio (seção 10). As outras três (Direcional, Longitude e Mundo Apto) ainda abrem no fluxo genérico com o **padrão da operação**, porque os simuladores de referência delas não puderam ser lidos (o da Longitude exige login; o _smq-fluxo_ e o do Canal Imob não abriram daqui):

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
