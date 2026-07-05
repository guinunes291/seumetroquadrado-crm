---
type: agente
status: ativo
area: squad-ia
owner: Squad IA
created: 2026-07-05
updated: 2026-07-05
tags: [ia, agente, qualificacao]
---

# Agente de Qualificação

Agente que faz a primeira triagem dos leads que chegam pelo WhatsApp, antes do corretor.

## Responsabilidade
Qualificar o lead: entender renda, objetivo, FGTS e urgência; classificar e encaminhar.

## Entradas
- Mensagens do lead no WhatsApp.
- Origem da campanha (Meta Ads).

## Saídas
- Lead classificado (quente / morno / frio).
- Campos preenchidos: renda, FGTS, objetivo, cidade.
- Encaminhamento para corretor via [[SOP Distribuição de Leads]].

## Base de conhecimento
- [[Qualificação de Cliente]]
- [[Script de Primeiro Contato]]
- [[Objeções e Respostas]]

## Prompt (resumo — ver [[Padrões de Prompts]])
- Papel: assistente de qualificação da SMQ, tom acolhedor e objetivo.
- Objetivo: coletar renda, FGTS, tempo de carteira, objetivo e cidade.
- Regras: nunca prometer aprovação de crédito; sempre confirmar dados.

## Integrações
- [[WhatsApp e CRM]] (entrada/saída).
- [[Integrações MCP]] (consulta ao CRM).

## Erros comuns
- Prometer aprovação de crédito (proibido).
- Não confirmar o número de contato.
- Qualificar sem perguntar objetivo (morar x investir).

## Melhorias futuras
- Score automático de lead.
- Detecção de urgência por linguagem.

## Relacionados
- [[Visão Geral dos Agentes]], [[Agente de Follow-up]], [[Agente de Análise de Crédito]].
