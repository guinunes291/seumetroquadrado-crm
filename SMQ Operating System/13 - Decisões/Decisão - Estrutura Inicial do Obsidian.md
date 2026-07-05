---
type: decisao
status: ativo
area: decisoes
owner: Guilherme
created: 2026-07-05
updated: 2026-07-05
tags: [decisao, obsidian, estrutura]
---

# Decisão — Estrutura Inicial do Obsidian

## Contexto
A SMQ precisava de um sistema central de organização e memória operacional, e de uma base de conhecimento para futuramente conectar com Claude, Cowork, n8n, MCP e o CRM.

## Decisão
Criar o vault **SMQ Operating System** em Markdown puro, na versão gratuita do Obsidian, com 17 áreas (00 a 99), MOCs por área, templates reutilizáveis e padrão de frontmatter YAML.

## Alternativas consideradas
- Notion (pago para escalar, menos "arquivo local").
- Google Docs soltos (sem estrutura nem links).
- Obsidian gratuito (escolhido: local, Markdown, escalável, ótimo para IA).

## Consequências
- Toda documentação passa a viver no vault.
- Preparado para leitura/edição por IA (ver [[COMO_USAR_COM_CLAUDE]]).
- Sem dependência de plugins ou recursos pagos.

## Regras adotadas
- Sem plugins e sem Dataview por enquanto.
- Frontmatter e links `[[...]]` obrigatórios (ver [[PADRAO_DE_NOTAS]]).

## Relacionados
- [[Decision Log]], [[Home]], [[README]].
