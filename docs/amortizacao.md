# Planilha de amortização: como a conta funciona

Motor: `src/lib/amortizacao.ts` (funções puras, sem React).
Tela: `/simulador-amortizacao` (módulo Documentação & Projetos) e atalho no dossiê do lead (aba Qualificação).
Testes: `tests/amortizacao.test.ts` (valores conferidos com implementação independente em Python/Decimal) e `tests/simulador-amortizacao-estado.test.ts`.

Toda conta de parcela nova no CRM deve usar este motor. `lib/simulador.ts` e `lib/mcmv-estimativa.ts` são anteriores e têm convenções diferentes (ver "Dívidas" no fim).

## Entrada da tela

O corretor digita só os três dados do contrato: valor do financiamento, taxa de juros a.a. (nominal por padrão; na Caixa, os "Juros Nominais") e prazo em meses, e escolhe SAC, PRICE ou comparar. Os campos aceitam "208.000" e "8,16".

Todo o resto tem padrão e fica recolhido em "Calculado automaticamente": TR projetada, seguros por idade, taxa adm, 1ª cobrança no mês seguinte. A base do DFI (valor do imóvel) é estimada como financiamento ÷ 0,8 quando o corretor não informa a avaliação.

O botão do dossiê do lead preenche os três dados, o sistema, a renda e o valor do imóvel da simulação a partir da aprovação de crédito vigente (view `aprovacoes_credito_vigentes`). Sem aprovação, leva só a renda informada.

## 1. Taxa de juros: nominal x efetiva

O contrato da Caixa traz as duas. A mensal é sempre a nominal dividida por 12.

| Informado    | Mensal                   | Exemplo (8,16%)            |
| ------------ | ------------------------ | -------------------------- |
| Nominal a.a. | nominal / 12             | 0,68% a.m.                 |
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

### Efeito de cada amortização (`analisarAmortizacoes`)

Para cada amortização extra executada, a planilha mostra: parcelas tiradas (prazo restante sem ela menos prazo restante com ela), prazo restante antes e depois, parcela seguinte antes e depois e juros economizados. No total: parcelas tiradas, novo prazo (com o mês em que o contrato termina), juros economizados e economia total (juros + correção + seguros + taxa adm).

A economia de cada evento é medida de forma acumulada: contrato com as amortizações até a anterior contra contrato com as amortizações até esta. Assim a soma dos eventos fecha com o total. Medir cada uma isolada contaria economia em dobro, porque o efeito de uma depende do saldo que as anteriores já reduziram.

Exemplo conferido: R$ 200 mil, 8,16%, 420 meses, PRICE sem TR, R$ 20 mil na parcela 24 com reduzir prazo: o prazo restante cai de 396 para 269 (127 parcelas tiradas), o contrato termina em 293 parcelas e os juros caem de R$ 406.406,33 para R$ 242.593,24 (R$ 163.813,09 economizados).

## 8. Renda e CET

- Comprometimento = encargo total da 1ª parcela / renda bruta. Limite padrão 30%. No SAC a 1ª parcela é a maior, por isso o SAC exige mais renda.
- `valorMaximoFinanciavel`: busca binária do maior valor cuja 1ª parcela cabe nos 30%.
- CET estimado: taxa interna de retorno do fluxo do cliente (recebe o crédito menos tarifas no mês 0; paga encargos e extras). Inclui a correção projetada, então é estimativa.
- Idade + prazo (incluindo obra) não pode passar de 80 anos e 6 meses; o motor avisa e diz o prazo máximo.

## 9. Parâmetros que mudam com o tempo

| Constante                   | Valor        | Revisar quando             |
| --------------------------- | ------------ | -------------------------- |
| `TR_MENSAL_REFERENCIA_2026` | 0,17% a.m.   | a TR média mudar (BCB)     |
| `TABELA_MIP_ESTIMADA`       | estimativa   | tiver tabela da seguradora |
| `DFI_MENSAL_PADRAO`         | 0,0038% a.m. | idem                       |
| `TAXA_ADM_PADRAO`           | R$ 25        | o banco mudar              |

## PDF (único formato de exportação)

Gerador: `src/features/simulador-amortizacao/planilha-pdf.ts`, carregado só no clique. Visual desenhado no Claude Design (artifact "PDF Simulação de Financiamento SMQ") na identidade da SMQ: Azul Marinho #0F1E3A, Dourado Aurum #B89968, Creme #F5F1EA, Montserrat nos títulos e Inter no texto (fontes self-hosted em `public/fonts/aurum`), logo redesenhado em vetor.

Páginas: capa e resumo (dados do contrato, 1ª parcela de cada sistema, comparativo) · efeito das amortizações (se houver) · leitura para o cliente, premissas, glossário e próximo passo com o consultor · evolução ano a ano por sistema · (PDF completo) mês a mês por sistema em paisagem. Rodapé com "página X de Y" nas margens da folha (`@page` margin boxes, Chrome 131+).

A capa leva o nome do cliente (campo na tela, preenchido pelo dossiê) e o consultor (nome, telefone e CRECI do perfil do corretor logado).

## Dívidas conhecidas

- `lib/simulador.ts` converte a taxa anual como EFETIVA; `lib/mcmv-estimativa.ts` trata como NOMINAL. Nenhum dos dois tem correção, SAC ou obra. Migrar os dois para este motor.
