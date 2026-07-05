---
type: agente
status: rascunho
area: squad-ia
owner: Squad IA
created: 2026-07-05
updated: 2026-07-05
tags: [ia, agente, credito]
---

# Agente de Análise de Crédito

Apoia corretor e cliente na simulação inicial de crédito para MCMV (não substitui a Caixa).

## Responsabilidade
Estimar faixa de financiamento e subsídio com base em renda e perfil, e orientar próximos passos.

## Entradas
- Renda (individual/composta), FGTS, tempo de carteira, número de dependentes.

## Saídas
- Faixa estimada de crédito e subsídio.
- Lista de documentos necessários (ver [[SOP Documentação]]).
- Alertas de risco (nome negativado, tempo de registro).

## Base de conhecimento
- [[Treinamento de Crédito Caixa]]
- [[SOP Análise de Crédito]]
- [[Análise de Crédito Caixa]]

## Prompt (resumo)
- Papel: especialista em crédito MCMV.
- Regra crítica: sempre dizer que é uma **estimativa**, sujeita à análise oficial da Caixa.

## Erros comuns
- Passar valores como se fossem aprovados.
- Ignorar restrições cadastrais.

## Melhorias futuras
- Integração com tabelas atualizadas de subsídio.

## Relacionados
- [[Agente de Qualificação]], [[SOP Análise de Crédito]], [[KPIs de Agentes de IA]].
