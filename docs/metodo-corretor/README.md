# Método do Corretor SMQ — como usar o CRM para vender toda semana

Estudo completo do CRM da Seu Metro Quadrado e o método operacional derivado dele.
Auditoria feita em **16/09/2026** sobre o código em produção (383 migrations, ~60 rotas,
28 módulos de feature) e sobre **dados reais de produção** lidos pelo MCP do CRM.

## Regra de honestidade deste estudo

Todo número aqui tem carimbo:

| Carimbo         | Significado                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| **[MEDIDO]**    | lido do banco de produção em 16/09/2026, ou de diagnóstico anterior da casa |
| **[META CASA]** | meta já declarada no código (`PASSAGENS` em `funil-derive.ts`)              |
| **[HIPÓTESE]**  | estimativa minha, sem amostra suficiente — a calibrar em 4 semanas          |

Nenhuma hipótese é apresentada como dado. Onde o CRM não sabe responder, está escrito
que não sabe.

## Os 13 documentos

| #   | Documento                                                          | Para quem            |
| --- | ------------------------------------------------------------------ | -------------------- |
| 01  | [Diagnóstico completo do CRM](01-diagnostico.md)                   | dono / gestão        |
| 02  | [Mapa de funcionalidades](02-mapa-funcionalidades.md)              | gestão / produto     |
| 03  | [Funil comercial recomendado](03-funil-recomendado.md)             | gestão / corretor    |
| 04  | [Passo a passo diário do corretor](04-rotina-diaria.md)            | corretor             |
| 05  | [Checklist diário](05-checklist-diario.md)                         | corretor             |
| 06  | [Cadência ideal de atendimento e follow-up](06-cadencia.md)        | corretor / gestão    |
| 07  | [Matriz de prioridades](07-matriz-prioridades.md)                  | corretor             |
| 08  | [Indicadores mínimos para 1 venda/semana](08-indicadores.md)       | corretor / gestão    |
| 09  | [Os 15 erros que matam venda no CRM](09-erros.md)                  | corretor             |
| 10  | [Recomendações de melhoria no CRM](10-melhorias.md)                | dono / produto       |
| 11  | [Automações recomendadas](11-automacoes.md)                        | produto / engenharia |
| 12  | [Manual: como usar o CRM SMQ para vender toda semana](12-manual.md) | corretor novo        |
| 13  | [Uma página: o que fazer todos os dias](13-uma-pagina.md)          | parede / celular     |

Complementos:

| #   | Documento                                                     | Cobre                          |
| --- | ------------------------------------------------------------- | ------------------------------ |
| 14  | [Modelo de treinamento em 10 módulos](14-treinamento.md)      | Etapa 19                       |
| 15  | [Modo Corretor e a regra dos 5 minutos](15-modo-corretor.md)  | Etapas 15 e 18                 |
| 16  | [Gargalos do funil e qualidade da carteira](16-gargalos-e-carteira.md) | Etapas 11 e 12        |
| 17  | **[Recalibração com os dados reais](17-recalibracao.md)** ⭐ | corrige 01, 08 e 16 |

## ⚠️ Leia o Documento 17 primeiro

A primeira rodada deste estudo usou o MCP do CRM, cujas RPCs devolviam zero para vendas,
tarefas e agendamentos. **A extração completa do banco desmentiu isso.** Os documentos
01, 08 e 16 carregam aviso de correção no topo; a
**[Recalibração (17)](17-recalibracao.md)** é a versão boa dos números.

## A conclusão em cinco linhas — versão corrigida **[MEDIDO 16/09/2026]**

1. A SMQ **vende bem**: 126 vendas, 116 aprovadas, **R$ 32,2 mi de VGV**, e setembro de
   2026 é o melhor mês do ano com 29 vendas.
2. A metade de baixo do funil é **forte e acima da meta da casa**: comparecimento em
   visita de **80,4%** (meta 65%) e **44,3%** das visitas realizadas viram venda.
3. O funil perde **98,1% dos leads antes da visita** — e a razão principal é a
   matéria-prima: 80% da base é importação, que converte **0,02%**.
4. **1% dos leads gera 83% das vendas.** Um lead captado pelo próprio corretor converte
   **16,2%** — 1 venda a cada 6 leads — contra 0,24% do Facebook.
5. Por isso a meta muda de natureza: não é "toque mais leads", é **capte 2 leads por dia
   útil**. É a única conta que fecha 1 venda por semana.

## Os três problemas reais

| # | Problema | Número |
| - | --- | --- |
| 1 | Leads sem dono no meio do funil | **50.196** — 43.923 deles em `aguardando_atendimento`, etapa que por definição significa "distribuído" |
| 2 | Régua de follow-up em colapso | **95,8%** das tarefas pendentes já venceram; 3% de conclusão |
| 3 | Resposta do cliente não é gravada | **1 interação de entrada em 90 dias** — o balde "Cliente respondeu" nunca acende |
