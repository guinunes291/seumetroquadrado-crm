# Cowork Setup — Continuando no Claude Cowork

Guia para retomar o trabalho neste vault dentro do **Claude Cowork**, mantendo continuidade entre sessões.

---

## O que é o objetivo

O Cowork permite trabalhar de forma contínua com o Claude em cima dos arquivos do projeto. Como este vault é Markdown puro dentro do repositório, ele funciona como memória compartilhada entre você e o Claude.

---

## Passo a passo para continuar uma sessão

1. **Abra o projeto** (`seumetroquadrado-crm`) no Claude Cowork.
2. Aponte o Claude para a pasta `SMQ Operating System`.
3. Comece a sessão com contexto, por exemplo:
   > "Estamos evoluindo o vault `SMQ Operating System`. Leia a [[Home]] e o [[Decision Log]] para pegar o contexto. Hoje vamos trabalhar em [área]."
4. Trabalhe em **um MOC ou uma área por sessão**.
5. Ao final, peça:
   > "Registre o que decidimos hoje em [[Decision Log]] e atualize os documentos que mudaram."

---

## Como manter continuidade entre sessões

- **[[Decision Log]]** é a memória de longo prazo. Toda decisão importante entra lá.
- **`updated:`** no frontmatter deve ser atualizado quando um doc muda.
- **`status:`** indica o que ainda precisa de trabalho (`rascunho`, `revisar`).
- Comece cada sessão pedindo ao Claude para listar o que está `revisar` ou `rascunho`.

---

## Fluxo recomendado por sessão

```
1. Contexto  → Claude lê Home + Decision Log
2. Foco      → escolher 1 área/MOC
3. Execução  → criar/editar docs com base nos templates
4. Registro  → atualizar Decision Log + frontmatter
5. Resumo    → Claude entrega o que mudou
```

---

## Dicas
- Guarde o vault no Git para versionar (histórico grátis de tudo).
- Faça commits pequenos e descritivos a cada sessão.
- Não misture mudanças de código do CRM com mudanças do vault no mesmo commit.

Relacionado: [[COMO_USAR_COM_CLAUDE]], [[Automações - MOC]].
