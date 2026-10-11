# PDFs do CRM: padrão da marca

Todo PDF exportável do CRM usa o kit `src/lib/pdf-marca.ts` (decisão do dono, 2026-10-11). O visual nasceu do PDF da planilha de amortização, desenhado no Claude Design ("PDF Simulação de Financiamento SMQ").

## Identidade

- Cores: Azul Marinho #0F1E3A, Dourado Aurum #B89968, Creme #F5F1EA (`MARCA` tem também os tons de apoio e as cores de sucesso, alerta e perigo).
- Fontes: Montserrat nos títulos e Inter no texto, self-hosted em `public/fonts/aurum` (o PDF não depende do Google).
- Logo em vetor (`logoMarca`): moldura, telhado duplo e m².
- Folha creme até a borda e rodapé com "página X de Y" nas margens (`@page` margin boxes, Chrome 131+).

## Peças do kit

| Função                                                                                  | Uso                                                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `estilosMarca({ paisagem, rodape, origem })`                                            | `@font-face`, `@page`, corpo e títulos; página nomeada `paisagem` para trechos deitados (`.m-paisagem`) |
| `capaMarca({ sobre, tituloHtml, destaqueHtml, subtituloHtml, direitaHtml, extraHtml })` | Capa azul da primeira página                                                                            |
| `faixaMarca({ rotuloHtml, direitaHtml })`                                               | Faixa azul do topo das páginas internas                                                                 |
| `RODAPE_CLIENTE` / `RODAPE_INTERNO`                                                     | Texto do rodapé para material de cliente ou de gestão                                                   |

Os textos passados como `...Html` já chegam escapados (`escHtml` de `lib/pdf-print`). Todo PDF sai por `imprimirHtml`, que espera imagens e fontes antes de abrir a impressão.

## PDFs no padrão

| PDF                            | Gerador                                          | Rodapé   |
| ------------------------------ | ------------------------------------------------ | -------- |
| Planilha de amortização        | `features/simulador-amortizacao/planilha-pdf.ts` | cliente  |
| Comparativo de empreendimentos | `features/comparativo/comparativo-pdf.ts`        | cliente  |
| Relatórios do Dashboard        | `features/dashboard/relatorios-pdf.ts`           | interno  |
| Raio-X do corretor             | `features/inteligencia/raio-x-pdf.ts`            | interno  |
| DRE                            | `lib/dre.ts` (`montarHtmlDre`)                   | interno  |
| Certificado da Academia        | `features/academia/certificado-pdf.ts`           | Academia |

PDF novo: use `estilosMarca` + `capaMarca`/`faixaMarca`, cores de `MARCA`, e saia por `imprimirHtml`.
