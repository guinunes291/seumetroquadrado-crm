// Renderizador do comparativo de empreendimentos em PDF (material do CLIENTE).
//
// Mesmo padrão do raio-x-pdf: documento A4 auto-contido (HTML, paleta fixa),
// mandado à caixa de impressão; "Salvar como PDF" gera o arquivo com o nome do
// <title>. Carregado em lazy pelo botão, nada disso pesa na rota.
//
// Estrutura: capa (para quem, mensagem do corretor, o que o cliente busca) →
// tabela lado a lado com o encaixe → uma página por empreendimento (fotos,
// ficha, diferenciais, "por que combina com você", plantas) → aviso de valores.
// Todo texto que vem do banco ou do corretor passa por escHtml.

import { escHtml as esc, imprimirHtml } from "@/lib/pdf-print";
import { capaMarca, estilosMarca, MARCA, RODAPE_CLIENTE } from "@/lib/pdf-marca";
import type { Comparativo, ProjetoComparativo } from "./comparativo";
import { ROTULO_NIVEL, type NivelEncaixe } from "./encaixe";

// Visual da marca (kit lib/pdf-marca, 2026-10-11): mesma identidade dos
// demais PDFs do CRM.
const C = {
  navy: MARCA.navy,
  navy700: MARCA.navyMedio,
  navy400: MARCA.navySuave,
  gold: MARCA.gold,
  gold200: MARCA.goldClaro,
  texto: MARCA.texto,
  suave: MARCA.suave,
  linha: MARCA.linha,
  fundo: MARCA.cremeClaro,
  sucesso: MARCA.sucesso,
  sucessoFundo: MARCA.sucessoFundo,
  alerta: MARCA.alerta,
  alertaFundo: MARCA.alertaFundo,
  branco: MARCA.branco,
} as const;

const COR_NIVEL: Record<NivelEncaixe, { fg: string; bg: string }> = {
  otimo: { fg: C.sucesso, bg: C.sucessoFundo },
  bom: { fg: C.navy700, bg: "#E6EAF2" },
  parcial: { fg: C.alerta, bg: C.alertaFundo },
  sem_dados: { fg: C.suave, bg: C.fundo },
};

const multilinha = (s: string): string => esc(s).replace(/\r?\n/g, "<br>");

function selo(nivel: NivelEncaixe): string {
  const cor = COR_NIVEL[nivel];
  return `<span class="selo" style="color:${cor.fg};background:${cor.bg};border-color:${cor.fg}33">${esc(ROTULO_NIVEL[nivel])}</span>`;
}

function img(url: string, alt: string, classe: string): string {
  // referrerpolicy: miniaturas do Drive recusam alguns referers de iframe.
  return `<img class="${classe}" src="${esc(url)}" alt="${esc(alt)}" referrerpolicy="no-referrer">`;
}

function tabelaLadoALado(c: Comparativo): string {
  const cols = c.projetos;
  const linha = (rotulo: string, valor: (p: ProjetoComparativo) => string) =>
    `<tr><th scope="row">${esc(rotulo)}</th>${cols.map((p) => `<td>${valor(p)}</td>`).join("")}</tr>`;
  const cabecalho = cols
    .map(
      (p) => `<th scope="col">
        ${p.capa ? img(p.capa, p.nome, "mini") : '<div class="mini mini-vazia"></div>'}
        <div class="col-nome">${esc(p.nome)}</div>
        ${p.construtora ? `<div class="col-sub">${esc(p.construtora)}</div>` : ""}
      </th>`,
    )
    .join("");
  const linhas = [
    linha("Localização", (p) => esc(p.local)),
    linha("Preço", (p) => `<strong>${esc(p.preco)}</strong>`),
    linha("Dormitórios", (p) => esc(p.dorms)),
    linha("Metragem", (p) => esc(p.metragem)),
    linha("Vagas", (p) => esc(p.vagas)),
    linha("Entrega", (p) => esc(p.entrega)),
    linha("Renda sugerida", (p) => esc(p.renda)),
    linha("Principais diferenciais", (p) =>
      p.diferenciais.length
        ? esc(p.diferenciais.slice(0, 4).join(" · "))
        : '<span class="vazio">A confirmar</span>',
    ),
  ];
  if (c.temPerfil) {
    linhas.push(
      linha("Encaixe no seu perfil", (p) =>
        p.encaixe ? selo(p.encaixe.nivel) : selo("sem_dados"),
      ),
    );
  }
  return `<table class="lado">
    <thead><tr><th class="canto"></th>${cabecalho}</tr></thead>
    <tbody>${linhas.join("")}</tbody>
  </table>`;
}

function paginaProjeto(p: ProjetoComparativo, indice: number, c: Comparativo): string {
  const fotos = p.fotos.length
    ? `<div class="fotos fotos-${Math.min(p.fotos.length, 4)}">${p.fotos.map((f, i) => img(f, `${p.nome} — foto ${i + 2}`, "foto")).join("")}</div>`
    : "";
  const capa = p.capa
    ? img(p.capa, p.nome, "capa-img")
    : `<div class="capa-img capa-vazia">${esc(p.nome)}</div>`;

  const ficha = [
    ["Localização", p.local],
    ["Endereço", p.endereco],
    ["Construtora", p.construtora],
    ["Preço", p.preco],
    ["Dormitórios", p.suites ? `${p.dorms} (${p.suites})` : p.dorms],
    ["Metragem", p.metragem],
    ["Vagas", p.vagas],
    ["Entrega", p.entrega],
    ["Renda sugerida", p.renda],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `<div class="ficha-item"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`,
    )
    .join("");

  const diferenciais = p.diferenciais.length
    ? `<div class="bloco"><h3>Lazer e facilidades</h3><div class="chips">${p.diferenciais.map((d) => `<span>${esc(d)}</span>`).join("")}</div></div>`
    : "";

  let combina = "";
  if (p.encaixe || p.nota) {
    const pontos = (p.encaixe?.pontos ?? []).map((t) => `<li class="ok">${esc(t)}</li>`).join("");
    const atencao = (p.encaixe?.atencao ?? []).map((t) => `<li class="at">${esc(t)}</li>`).join("");
    const titulo = c.clientePrimeiroNome
      ? `Por que combina com você, ${esc(c.clientePrimeiroNome)}`
      : "Por que indicamos";
    combina = `<div class="bloco combina">
      <div class="combina-topo"><h3>${titulo}</h3>${p.encaixe ? selo(p.encaixe.nivel) : ""}</div>
      ${p.nota ? `<p class="nota-corretor">${multilinha(p.nota)}</p>` : ""}
      ${pontos || atencao ? `<ul class="encaixe">${pontos}${atencao}</ul>` : ""}
    </div>`;
  }

  const plantas = p.plantas.length
    ? `<div class="bloco plantas-bloco"><h3>Plantas</h3><div class="plantas">${p.plantas
        .map(
          (pl) =>
            `<figure>${img(pl.url, pl.legenda ?? `Planta — ${p.nome}`, "planta")}${pl.legenda ? `<figcaption>${esc(pl.legenda)}</figcaption>` : ""}</figure>`,
        )
        .join("")}</div></div>`
    : "";

  return `<section class="projeto quebra">
    <div class="projeto-topo">
      <span class="num">${indice + 1}</span>
      <div>
        <h2>${esc(p.nome)}</h2>
        <div class="projeto-sub">${esc(p.local)}${p.construtora ? ` · ${esc(p.construtora)}` : ""}</div>
      </div>
    </div>
    ${capa}
    ${fotos}
    <div class="ficha">${ficha}</div>
    ${combina}
    ${diferenciais}
    ${plantas}
  </section>`;
}

export function montarHtmlComparativo(
  c: Comparativo,
  /** origem das fontes self-hosted (padrão: a do app; "" em testes). */
  opts: { origem?: string } = {},
): string {
  const para = c.clientePrimeiroNome
    ? `Seleção para ${esc(c.clientePrimeiroNome)}`
    : "Seleção de empreendimentos";
  const corretorLinha = [
    c.corretor.nome ? `Corretor(a): ${esc(c.corretor.nome)}` : null,
    c.corretor.creci ? `CRECI ${esc(c.corretor.creci)}` : null,
    c.corretor.telefone ? esc(c.corretor.telefone) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const perfil = c.resumoPerfil.length
    ? `<div class="perfil"><div class="perfil-rotulo">O que você procura</div><div class="chips">${c.resumoPerfil.map((r) => `<span>${esc(r)}</span>`).join("")}</div></div>`
    : "";

  const mensagem = c.mensagem ? `<div class="mensagem">${multilinha(c.mensagem)}</div>` : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(c.titulo)}</title>
<style>
  ${estilosMarca({ rodape: RODAPE_CLIENTE, origem: opts.origem })}
  h1, h2, h3 { margin: 0; font-weight: 700; }
  p { margin: 0 0 6px; }
  img { display: block; object-fit: cover; background: ${C.fundo}; }

  .mensagem {
    padding: 10px 12px; border-radius: 8px; font-size: 10pt;
    background: rgba(245,241,234,.08); border-left: 3px solid ${C.gold}; color: ${MARCA.textoSobreNavy};
  }
  .perfil-rotulo { font-family: Montserrat, Inter, sans-serif; font-size: 8pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${C.gold}; margin-bottom: 5px; }
  .m-capa .chips span { background: rgba(245,241,234,.10); color: ${MARCA.textoSobreNavy}; border-color: rgba(245,241,234,.22); }

  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chips span {
    font-size: 8.5pt; padding: 2px 9px; border-radius: 999px;
    background: ${C.branco}; border: 1px solid ${MARCA.borda}; color: ${C.texto};
  }

  h2.secao { font-size: 13pt; font-weight: 800; color: ${C.navy}; border-bottom: 2px solid ${C.gold}; padding-bottom: 4px; margin: 4px 0 8px; }

  table.lado { width: 100%; border-collapse: collapse; font-size: 9pt; table-layout: fixed; background: ${C.branco}; }
  table.lado th, table.lado td { padding: 6px 7px; border-bottom: 1px solid ${C.linha}; text-align: left; vertical-align: top; }
  table.lado thead th { vertical-align: bottom; }
  table.lado th[scope=row] { width: 25mm; font-size: 8pt; color: ${C.suave}; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  table.lado .canto { width: 25mm; border-bottom: 2px solid ${C.gold}; }
  table.lado thead th[scope=col] { border-bottom: 2px solid ${C.gold}; }
  .mini { width: 100%; height: 26mm; border-radius: 6px; margin-bottom: 5px; }
  .mini-vazia { background: ${C.fundo}; border: 1px dashed ${C.linha}; }
  .col-nome { font-family: Montserrat, Inter, sans-serif; font-size: 10.5pt; color: ${C.navy}; font-weight: 800; line-height: 1.2; }
  .col-sub { font-size: 8pt; color: ${C.suave}; font-weight: 400; }
  .selo { display: inline-block; font-size: 8pt; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
  .vazio { color: ${C.suave}; font-style: italic; }

  .projeto-topo { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .num {
    flex: none; width: 9mm; height: 9mm; border-radius: 50%; background: ${C.navy}; color: ${C.gold200};
    display: grid; place-items: center; font-family: Montserrat, Inter, sans-serif; font-weight: 800; font-size: 11pt;
  }
  .projeto h2 { font-size: 17pt; font-weight: 800; color: ${C.navy}; line-height: 1.15; }
  .projeto-sub { font-size: 9pt; color: ${C.suave}; }
  .capa-img { width: 100%; height: 78mm; border-radius: 8px; }
  .capa-vazia { display: grid; place-items: center; color: ${C.navy400}; font-size: 14pt; border: 1px dashed ${C.linha}; }
  .fotos { display: grid; gap: 5px; margin-top: 5px; }
  .fotos-1 { grid-template-columns: 1fr; }
  .fotos-2 { grid-template-columns: 1fr 1fr; }
  .fotos-3 { grid-template-columns: 1fr 1fr 1fr; }
  .fotos-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
  .foto { width: 100%; height: 30mm; border-radius: 6px; }

  .ficha { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 12px; margin: 10px 0; padding: 10px 12px; background: ${C.branco}; border: 1px solid ${MARCA.borda}; border-radius: 10px; }
  .ficha-item span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: ${C.suave}; }
  .ficha-item strong { font-size: 9.5pt; color: ${C.navy}; }

  .bloco { margin-top: 10px; break-inside: avoid; }
  .bloco h3 { font-size: 10.5pt; color: ${C.navy}; margin-bottom: 6px; }
  .combina { border: 1px solid ${C.gold}; border-left: 4px solid ${C.gold}; background: ${C.branco}; border-radius: 10px; padding: 10px 12px; }
  .combina-topo { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
  .combina-topo h3 { margin: 0; }
  .nota-corretor { font-size: 9.5pt; font-style: italic; }
  ul.encaixe { margin: 4px 0 0; padding: 0; list-style: none; font-size: 9.5pt; }
  ul.encaixe li { padding: 2px 0 2px 18px; position: relative; }
  ul.encaixe li::before { position: absolute; left: 0; font-weight: 700; }
  ul.encaixe li.ok::before { content: "✓"; color: ${C.sucesso}; }
  ul.encaixe li.at::before { content: "!"; color: ${C.alerta}; left: 4px; }
  ul.encaixe li.at { color: ${C.alerta}; }

  .plantas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .plantas figure { margin: 0; border: 1px solid ${C.linha}; border-radius: 8px; padding: 4px; break-inside: avoid; }
  .planta { width: 100%; height: 72mm; object-fit: contain; background: ${C.branco}; }
  .plantas figcaption { font-size: 8.5pt; text-align: center; color: ${C.navy}; font-weight: 600; padding-top: 3px; }

  .rodape { margin-top: 16px; border-top: 2px solid ${C.gold}; padding-top: 6px; font-size: 7.5pt; color: ${C.suave}; break-inside: avoid; }

</style>
</head>
<body>
  ${capaMarca({
    sobre: "SELEÇÃO DE EMPREENDIMENTOS",
    tituloHtml: para,
    subtituloHtml: `${c.projetos.length} empreendimentos lado a lado · ${esc(c.dataLabel)}${corretorLinha ? ` · ${corretorLinha}` : ""}`,
    extraHtml: mensagem + perfil || undefined,
  })}

  <h2 class="secao">Comparativo lado a lado</h2>
  ${tabelaLadoALado(c)}

  ${c.projetos.map((p, i) => paginaProjeto(p, i, c)).join("")}

  <div class="rodape">
    Valores, disponibilidade e condições sujeitos a alteração sem aviso — consulte a tabela vigente antes de decidir.
    ${c.temPerfil ? "O encaixe no perfil é uma estimativa comercial a partir das informações que você passou; não substitui a análise de crédito do banco." : ""}
    Imagens meramente ilustrativas.
    ${corretorLinha ? `<br>${corretorLinha} · Seu Metro Quadrado` : "<br>Seu Metro Quadrado"}
  </div>
</body>
</html>`;
}

export function imprimirComparativo(c: Comparativo): Promise<void> {
  return imprimirHtml(montarHtmlComparativo(c), { tituloIframe: "Comparativo para impressão" });
}
