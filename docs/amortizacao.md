# Planilha de amortização: como a conta funciona

Motor: `src/lib/amortizacao.ts` (funções puras, sem React).
Tela: `/simulador-amortizacao` (módulo Documentação & Projetos) e atalho no dossiê do lead (aba Qualificação).
Testes: `tests/amortizacao.test.ts` (valores conferidos com implementação independente em Python/Decimal) e `tests/simulador-amortizacao-estado.test.ts`.

Toda conta de parcela nova no CRM deve usar este motor. `lib/simulador.ts` e `lib/mcmv-estimativa.ts` são anteriores e têm convenções diferentes (ver "Dívidas" no fim).

## 1. Taxa de juros: nominal x efetiva

O contrato da Caixa traz as duas. A mensal é sempre a nominal dividida por 12.

| Informado | Mensal | Exemplo (8,16%) |
|---|---|---|
| Nominal a.a. | nominal / 12 | 0,68% a.m. |
| Efetiva a.a. | (1 + efetiva)^(1/12) - 1 | 8,47% efetiva = 0,68% a.m. |

Erro comum: digitar a nominal como se fosse efetiva (ou o contrário). Em 200 mil e 420 meses, a diferença na parcela PRICE passa de R$ 40.

## 2. Ordem dos fatos dentro de um mês

1. Saldo anterior
2. Correção monetária: saldo x índice do mês (TR em 2026: cerca de 0,17% a.m.)
3. Juros: saldo corrigido x taxa mensal
4. Amortização (regra do sistema, abaixo)
5. Seguros: MIP sobre o saldo corrigido; DFI sobre o valor do imóvel (base corrigida pelo mesmo índice)
6. Taxa de administração (R$ fixo)
7. Encargo total = amortização + juros + MIP + DFI + taxa adm
8. Amortização extraordinária, se houver, depois da parcela paga

Cada componente é arredondado ao centavo no mês (meio centavo sobe). A última parcela absorve o resíduo para o saldo fechar em zero.

## 3. SAC

Amortização = saldo corrigido / prazo restante. Sem correção, é constante (oscila 1 centavo para não acumular resíduo). Os juros caem todo mês, então a parcela cai.

Com TR, a amortização sobe junto com o saldo corrigido. A parcela do SAC pode subir um pouco nos primeiros meses e depois cai.

## 4. PRICE

Prestação (amortização + juros) = saldo corrigido x i / (1 - (1 + i)^-n), com n = prazo restante, recalculada todo mês. Sem correção, ela é fixa do primeiro ao último mês. Com TR, ela sobe todo mês na proporção da TR.

Efeito que o cliente não espera: no início a amortização do PRICE é pequena, menor que a correção do mês. Resultado: o saldo devedor SOBE por anos antes de cair. Em 208 mil, 8,16%, 420 meses e TR de 0,17% a.m., o saldo passa de 250 mil por volta do 15º ano e a parcela sai de R$ 1.560 e termina em R$ 3.114.

## 5. Seguros e taxa

- MIP (morte e invalidez permanente): taxa mensal sobre o saldo devedor. Depende da idade e muda de faixa quando o proponente faz aniversário (por isso a parcela 13 pode ser maior que a 12). Com composição de renda, cada proponente paga a taxa da sua idade sobre a sua fatia da cobertura (soma = 100%).
- DFI (danos físicos ao imóvel): taxa mensal sobre o valor do imóvel.
- Taxa de administração: R$ por mês.

A tabela de MIP por idade (`TABELA_MIP_ESTIMADA`) é estimativa. Para bater com a proposta do banco, usar o modo "Taxas da proposta" e copiar MIP e DFI da proposta.

## 6. Fase de obra (compra na planta)

Durante a obra o banco libera o dinheiro para a construtora conforme a evolução. O cliente paga:

- juros sobre o valor já liberado
- atualização monetária sobre o liberado (padrão: paga; se desligado, é somada ao saldo)
- MIP, DFI e taxa adm (cada um pode ser desligado)

Não há amortização. Padrão: liberação linear até 100% no último mês de obra; dá para informar o cronograma (`curvaLiberacao`). A amortização começa depois, com o saldo cheio. O prazo informado é o de amortização (a obra vem antes), e a validação de idade soma os dois.

## 7. Amortização extraordinária

Abatida depois da parcela paga, no nº de parcela informado. Pode repetir (FGTS: a cada 24 parcelas).

- Reduzir prazo: mantém o tamanho da parcela e recalcula quantos meses faltam (SAC: saldo / amortização atual; PRICE: nper com a prestação atual). Economiza mais juros.
- Reduzir parcela: mantém o prazo; a próxima parcela é recalculada sobre o saldo menor.

## 8. Renda e CET

- Comprometimento = encargo total da 1ª parcela / renda bruta. Limite padrão 30%. No SAC a 1ª parcela é a maior, por isso o SAC exige mais renda.
- `valorMaximoFinanciavel`: busca binária do maior valor cuja 1ª parcela cabe nos 30%.
- CET estimado: taxa interna de retorno do fluxo do cliente (recebe o crédito menos tarifas no mês 0; paga encargos e extras). Inclui a correção projetada, então é estimativa.
- Idade + prazo (incluindo obra) não pode passar de 80 anos e 6 meses; o motor avisa e diz o prazo máximo.

## 9. Parâmetros que mudam com o tempo

| Constante | Valor | Revisar quando |
|---|---|---|
| `TR_MENSAL_REFERENCIA_2026` | 0,17% a.m. | a TR média mudar (BCB) |
| `TABELA_MIP_ESTIMADA` | estimativa | tiver tabela da seguradora |
| `DFI_MENSAL_PADRAO` | 0,0038% a.m. | idem |
| `TAXA_ADM_PADRAO` | R$ 25 | o banco mudar |

## Dívidas conhecidas

- `lib/simulador.ts` converte a taxa anual como EFETIVA; `lib/mcmv-estimativa.ts` trata como NOMINAL. Nenhum dos dois tem correção, SAC ou obra. Migrar os dois para este motor.
