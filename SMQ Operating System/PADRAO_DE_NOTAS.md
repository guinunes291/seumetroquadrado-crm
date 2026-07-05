# Padrão de Notas — SMQ Operating System

Regras simples para manter o vault legível, escalável e pronto para IA. **Comece simples.**

---

## 1. Frontmatter (obrigatório em todo documento)

Todo arquivo começa com este bloco YAML:

```yaml
---
type:
status:
area:
owner:
created:
updated:
tags:
---
```

### Valores de `status`
- `ativo` — em uso.
- `rascunho` — em construção.
- `revisar` — precisa de revisão.
- `arquivado` — não usar mais (mover para `99 - Arquivo`).

### Valores de `type`
`moc`, `processo`, `agente`, `prompt`, `reuniao`, `decisao`, `treinamento`, `crm`, `marketing`, `vendas`, `automacao`, `metrica`, `projeto`, `conhecimento`.

### `owner`
Responsável pelo documento (ex.: `Guilherme`, `Comercial`, `Squad IA`). Se ninguém, use `a definir`.

---

## 2. Nomenclatura de arquivos

- Nome claro e direto: `SOP Atendimento de Lead.md`, não `sop1.md`.
- Use maiúsculas no começo das palavras principais.
- MOCs sempre terminam com ` - MOC`: `CRM - MOC.md`.
- Evite acentuar de forma inconsistente — mantenha o padrão do título.
- Um arquivo = um propósito. Se um doc virar dois assuntos, divida.

---

## 3. Links internos

- Sempre conecte documentos com `[[Nome da Página]]`.
- Use o nome exato do arquivo (sem `.md`).
- Cada MOC deve linkar seus documentos filhos.
- A [[Home]] linka todos os MOCs.
- Prefira muitos links a pastas profundas — a navegação no Obsidian é por links.

---

## 4. Estrutura interna de cada nota

1. Título `#` (igual ao nome do arquivo).
2. Uma frase de propósito.
3. Conteúdo em seções `##`.
4. Quando útil: seção `## Próximos passos` ou `## Links relacionados`.

---

## 5. MOCs (Maps of Content)

Um MOC é o índice de uma área. Deve conter:
- **Objetivo da área**
- **Documentos principais** (com links)
- **Próximos passos**

---

## 6. O que NÃO fazer agora

- Não instalar plugins.
- Não usar Dataview.
- Não criar hierarquias de pastas profundas.
- Não deixar arquivos sem frontmatter.
- Não usar nomes genéricos (`doc1`, `notas`, `teste`).

---

## 7. Regra de ouro

> Escreva de forma **objetiva, operacional e voltada para execução**. Se um corretor novo abrir a nota, ele deve saber o que fazer.
