# Simuladores das construtoras: como o fluxo é calculado

Motor: `src/lib/simuladores/fluxo.ts` (funções puras, sem React).
Regras por construtora: `src/lib/simuladores/construtoras.ts`.
Recursos estimados pela renda: `src/lib/simuladores/recursos.ts` (reusa `lib/orcamento`, tabela APROVE 2026).
Tela: `/simuladores` (módulo Documentação & Projetos), uma aba por construtora: Vibra, Direcional, Longitude e Mundo Apto.
Testes: `tests/simuladores-fluxo.test.ts`, `tests/simuladores-estado.test.ts` e `tests/simuladores-pdf.test.ts`.

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

Os simuladores de referência da operação (o site _smq-fluxo_ para Vibra, Direcional e Longitude, e o do Canal Imob para a Mundo Apto) não puderam ser lidos quando a tela foi criada. As quatro construtoras abrem com o **padrão da operação**:

- parcelado até 20% do imóvel (regra 80/20 do CRM);
- INCC projetado de 6,55% ao ano (INCC-M acumulado em 12 meses até ago/2026, FGV);
- juros pós-chaves de 1% a.m., a convenção mais comum de mercado, mas **pós-chaves desligado**;
- ato mínimo, piso da mensal e intermediárias **sem regra**.

Enquanto `conferidoEm` for `null`, a tela mostra "regras a conferir". Para calibrar uma construtora com a tabela vigente:

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

O dossiê do lead (aba Qualificação) tem o botão **Fluxo da construtora**. Com aprovação de crédito vigente (view `aprovacoes_credito_vigentes`), ele leva financiamento, subsídio, FGTS, parcela e a renda da carta (`features/simuladores/prefill-lead.ts`, mesma fonte da planilha de amortização). Sem aprovação, leva só a renda informada.
