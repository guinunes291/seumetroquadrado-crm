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

## A conclusão em cinco linhas

1. O CRM **já é** o gerente comercial digital que se pediu. A Fila Única, a régua de 13
   toques, o Score de prioridade, a carteira ativa de 65 e o cálculo reverso de meta
   estão construídos, testados e no ar.
2. O que falta não é software: é **registro**. A camada de inteligência lê
   `interacoes`, `tarefas` e `agendamentos` — e essas três tabelas estão praticamente
   vazias. **[MEDIDO]**
3. Por isso o funil mente: 82,6% da base está em `aguardando_atendimento` e a passagem
   "em atendimento → agendado" marca 7% contra meta de 70%. **[MEDIDO]**
4. 89,4% das negociações paradas há 5+ dias **não têm corretor**. Não é falta de
   disciplina do corretor: é lead órfão no meio do funil. **[MEDIDO]**
5. O método deste estudo tem um único eixo: **o desfecho de um toque na Fila Única
   passa a ser a única forma de trabalhar**. Ele grava interação + próximo passo +
   etapa de uma vez — é o registro que acende todo o resto do sistema.
