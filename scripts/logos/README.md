# Logos das construtoras

Os arquivos servidos em `public/logos/construtoras/` e o manifesto `src/lib/logos-construtoras.ts`
foram montados em 02/09/2026 (docs/revisao-projetos-foco.md §11). Este diretório guarda o
**como**, para a próxima marca não exigir arqueologia.

## Fontes, em ordem de preferência

1. **Site oficial** — `<img>` com "logo" no `src`/`alt`/classe, SVG inline no cabeçalho, `og:image`
   e ícones grandes, nessa ordem de confiança. Quando o site é uma SPA sem `<img>` (Vivaz), a logo
   está referenciada no bundle `static/js/main.*.js`.
2. **Site de RI** (`ri.<marca>.com.br`) — as marcas com WAF/Cloudflare no institucional (Cury,
   Trisul, Direcional) deixam o RI aberto.
3. **Tabelas de venda no Drive** — PyMuPDF (`page.get_images()` + `doc.extract_image(xref)`) tira a
   imagem do cabeçalho do PDF. Serviu para Vibra e Maskan.

## O workflow n8n

`n8n-logos-construtoras.sdk.js` é o código (n8n Workflow SDK) do workflow "Logos construtoras SMQ":
Manual → **Alvos** (lista de páginas) → **Baixar HTML** → **Candidatos** (pontua) → **É imagem?** →
**Baixar imagem** → **Para base64** → **Juntar**. Roda fora do sandbox do assistente (que não tem
saída para a internet) e devolve cada candidato em base64 no nó Juntar, com `slug`, `url`, `pontos`
e `motivo`; o nó Candidatos traz um item `diag` por página (tamanho do HTML, nº de `<img>`, título)
e `erro` com o trecho inicial quando nada foi encontrado.

Armadilhas já pagas:

- O Code node do n8n **não expõe `URL`**: a resolução de caminho relativo é manual (`resolver`).
- Cloudflare devolve "Just a moment..." / "Attention Required!" com HTTP 200 — o diagnóstico mostra.
- Sites que só publicam a logo **branca** (Tenda, Emccamp, Kazzas, Vitta, Cury RI) precisam de
  `fundo: "escuro"` no manifesto; a `PlacaLogo` escolhe o fundo por isso.
- Imagens acima de ~675 KB são descartadas no nó Juntar (`grande demais`): logo nunca é desse tamanho.

## Para adicionar uma marca

1. Conseguir o arquivo (SVG de preferência). Recortar borda vazia e, se raster, manter ≤ 640 px.
2. Salvar em `public/logos/construtoras/<slug>.(svg|png)`.
3. Incluir no manifesto com `fundo` ("claro" para arte escura/colorida, "escuro" para arte branca)
   e os `nomes` que a coluna `projetos.construtora` costuma trazer.
4. `npx vitest run tests/logos-construtoras.test.ts` confere slug único e arquivo presente.

Logo enviada pela gestão pelo diálogo "Construtoras parceiras" (`logo_url`) vence a local e não
precisa de nada disso.
