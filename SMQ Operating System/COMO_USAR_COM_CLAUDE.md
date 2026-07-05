# Como Usar o Vault com o Claude

Este vault foi escrito em Markdown puro justamente para ser lido, revisado e melhorado por IA. Abaixo, como pedir ao Claude (Claude Code, Cowork ou API) para trabalhar em cima dele.

---

## Princípio geral

O Claude lê melhor quando os documentos têm:
- Título claro (`#`)
- Frontmatter YAML simples
- Links internos `[[...]]`
- Uma responsabilidade por arquivo

Este vault já segue esse padrão (ver [[PADRAO_DE_NOTAS]]).

---

## Como pedir para o Claude LER

> "Leia a pasta `SMQ Operating System` e me dê um resumo do que já está documentado sobre o CRM."

> "Abra `02 - CRM/Backlog de Melhorias CRM.md` e me diga quais itens têm maior impacto com menor esforço."

---

## Como pedir para o Claude REVISAR

> "Revise `04 - Vendas/Objeções e Respostas.md` e melhore as respostas para o contexto de Minha Casa Minha Vida. Mantenha o frontmatter e os links."

> "Confira se todos os documentos da pasta `08 - Processos SOPs` seguem o [[PADRAO_DE_NOTAS]]."

---

## Como pedir para o Claude MELHORAR / CRIAR

> "Crie um novo agente em `03 - Squad de IA` seguindo o template [[Template - Agente de IA]]. Ele deve fazer triagem de leads do WhatsApp."

> "Com base em `02 - CRM/Bugs Conhecidos CRM.md`, gere um plano de correção priorizado."

---

## Boas práticas ao usar o Claude

1. **Sempre aponte o arquivo ou a pasta** exata.
2. **Peça para manter o frontmatter e os links** ao editar.
3. **Peça mudanças pequenas e revisáveis** (um doc por vez no começo).
4. **Use os templates** de `15 - Templates` como base para novos documentos.
5. Ao final de cada sessão, peça um resumo do que mudou.

---

## Exemplos de tarefas recorrentes

- "Transforme esta ata de reunião em decisões e ações no formato [[Template - Reunião]]."
- "Gere um roleplay de objeção de crédito para treinar corretores."
- "Atualize o [[Roadmap Squad IA]] com o que combinamos hoje."
- "Liste tudo que está com `status: revisar` no vault."

---

## Conexões futuras
Quando conectar com **n8n / MCP / CRM**, o vault vira fonte de contexto para os agentes. Ver [[Integrações MCP]] e [[Automações - MOC]].
