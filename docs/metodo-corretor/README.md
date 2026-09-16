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

## Prompts prontos para o Lovable

| Arquivo | O que faz | Escreve? |
| --- | --- | :---: |
| [PROMPT-LOVABLE-EXTRACAO.md](PROMPT-LOVABLE-EXTRACAO.md) | Extrai os dados do banco (o que gerou o Documento 17) | não |
| [PROMPT-LOVABLE-CORRECOES.md](PROMPT-LOVABLE-CORRECOES.md) | Fase 0 (diagnóstico) + o plano das 3 correções | não (Fase 0) |
| [PROMPT-LOVABLE-FASES-1-3-2.md](PROMPT-LOVABLE-FASES-1-3-2.md) | Autoriza Fases 1 e 3; Fase 2 reescrita e retida | **sim** |
| [PROMPT-LOVABLE-FASE-3.1.md](PROMPT-LOVABLE-FASE-3.1.md) | Corrige a busca por telefone do webhook | **sim** |

## Os três problemas reais

| # | Problema | Número |
| - | --- | --- |
| 1 | Um SDR com **42.884 leads** | 97,8% dos 43.923 sem corretor estão na base de **uma pessoa**. Na meta de 40 contatos/dia, uma passada leva **49 meses** |
| 2 | ~~Régua de follow-up em colapso~~ | ✅ **corrigido 16/09.** O vazamento parou; 2.498 duplicatas canceladas. Os 5.126 leads com tarefa única e vencida ficaram de fora de propósito — são dívida comercial, não defeito |
| 3 | ~~WhatsApp nunca foi ligado~~ | ✅ **resolvido 16/09.** Segredo criado, teste ponta a ponta, e a busca por telefone migrada para a convenção de 9 dígitos sobre índice único — os 56.217 gravados sem o `55` passam a ser encontrados |

**Restam apenas os 42.884 leads num único SDR (problema 1), que depende de uma decisão
de negócio:** para onde vão os excedentes e qual o teto por SDR. Recomendação registrada
em [PROMPT-LOVABLE-FASES-1-3-2.md](PROMPT-LOVABLE-FASES-1-3-2.md), Fase 2.

Causas rastreadas até a linha em [PROMPT-LOVABLE-CORRECOES.md](PROMPT-LOVABLE-CORRECOES.md);
números confirmados pela Fase 0 em [PROMPT-LOVABLE-FASES-1-3-2.md](PROMPT-LOVABLE-FASES-1-3-2.md).
