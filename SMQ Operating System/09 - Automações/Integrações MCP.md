---
type: automacao
status: rascunho
area: automacoes
owner: Squad IA
created: 2026-07-05
updated: 2026-07-05
tags: [automacao, mcp, integracoes]
---

# Integrações MCP

Como os agentes de IA acessam dados e ações via MCP (Model Context Protocol).

## O que é (contexto SMQ)
MCP permite que o Claude e os agentes consultem o CRM, campanhas e outras fontes de forma padronizada e segura.

## Integrações (exemplo — substituir pelas reais)

| Integração | Uso | Consumido por | Status |
|------------|-----|---------------|--------|
| CRM MCP | Consultar leads, funil, KPIs | [[Agente de CRM]] | rascunho |
| Marketing | Dados de campanha | [[Agente de Marketing]] | rascunho |

## Boas práticas
- Definir escopo de acesso por agente (mínimo necessário).
- Registrar entradas/saídas para auditoria.
- Nunca expor dados sensíveis de cliente sem necessidade.

## Relacionados
- [[n8n - Visão Geral]], [[Squad de IA - MOC]], [[Agente de CRM]].
