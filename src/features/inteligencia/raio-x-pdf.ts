// Renderizador do PDF do Raio-X do Corretor.
//
// Monta um documento A4 completo (HTML + SVG inline, zero dependência nova) e
// manda para a caixa de impressão do browser — "Salvar como PDF" gera o
// arquivo. O nome do arquivo sai do <title>. Carregado em lazy pela tela, então
// nada disso pesa no chunk da rota.
//
// Por que não uma lib de PDF: o relatório é tipografia + tabela + gráfico
// simples. HTML imprime isso melhor (e acessível, e sem 300 KB de bundle) do
// que canvas rasterizado.

import {
  brl,
  brlCompacto,
  decimal,
  mesCurto,
  minutos,
  numero,
  pct,
  type Leitura,
  type RaioXRelatorio,
  type Tom,
} from "./raio-x-relatorio";
import type { ComparacaoMetrica } from "./raio-x-derive";
import type { PerformanceDrillRow } from "./queries";

// ---------------------------------------------------------------------------
// Paleta (hex fixo: o PDF não herda o tema do app e precisa imprimir igual)
// ---------------------------------------------------------------------------

const C = {
  navy: "#1b2a4a",
  navy700: "#2c4270",
  navy400: "#7386a8",
  gold: "#c69a2e",
  gold200: "#f0e2bd",
  texto: "#16202e",
  suave: "#5b6577",
  linha: "#dfe4ec",
  fundo: "#f6f8fb",
  sucesso: "#1f7a4d",
  alerta: "#b26a00",
  perigo: "#bc3b2e",
  branco: "#ffffff",
} as const;

const TOM_COR: Record<Tom, string> = {
  positivo: C.sucesso,
  atencao: C.alerta,
  critico: C.perigo,
  neutro: C.navy400,
};

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const slug = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ---------------------------------------------------------------------------
// Gráficos (SVG artesanal — nada de recharts fora do React)
// ---------------------------------------------------------------------------

type SerieBarra = { label: string; a: number | null; b: number | null };

/** Barras agrupadas: corretor × time, com eixo em % e rótulo em cima. */
function svgBarrasAgrupadas(
  rows: SerieBarra[],
  legenda: { a: string; b: string },
  sufixo = "%",
): string {
  if (rows.length === 0) return "";
  const W = 700;
  const H = 260;
  const padX = 34;
  const padTop = 26;
  const padBottom = 42;
  const alturaUtil = H - padTop - padBottom;
  const max = Math.max(10, ...rows.flatMap((r) => [r.a ?? 0, r.b ?? 0])) * 1.15;
  const passo = (W - padX * 2) / rows.length;
  const larguraBarra = Math.min(30, passo / 3.2);
  const y = (v: number) => padTop + alturaUtil - (v / max) * alturaUtil;

  const grades = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const yy = padTop + alturaUtil - f * alturaUtil;
      return `<line x1="${padX}" y1="${yy}" x2="${W - padX / 2}" y2="${yy}" stroke="${C.linha}" stroke-width="1"/>
        <text x="${padX - 6}" y="${yy + 3}" text-anchor="end" font-size="9" fill="${C.suave}">${Math.round(max * f)}${sufixo}</text>`;
    })
    .join("");

  const barras = rows
    .map((r, i) => {
      const cx = padX + passo * i + passo / 2;
      const xa = cx - larguraBarra - 2;
      const xb = cx + 2;
      const partes: string[] = [];
      if (r.a !== null) {
        partes.push(
          `<rect x="${xa}" y="${y(r.a)}" width="${larguraBarra}" height="${Math.max(1, padTop + alturaUtil - y(r.a))}" fill="${C.navy700}" rx="2"/>
           <text x="${xa + larguraBarra / 2}" y="${y(r.a) - 4}" text-anchor="middle" font-size="9" font-weight="600" fill="${C.navy}">${Math.round(r.a)}${sufixo}</text>`,
        );
      }
      if (r.b !== null) {
        partes.push(
          `<rect x="${xb}" y="${y(r.b)}" width="${larguraBarra}" height="${Math.max(1, padTop + alturaUtil - y(r.b))}" fill="${C.gold}" rx="2"/>
           <text x="${xb + larguraBarra / 2}" y="${y(r.b) - 4}" text-anchor="middle" font-size="9" fill="${C.suave}">${Math.round(r.b)}${sufixo}</text>`,
        );
      }
      partes.push(
        `<text x="${cx}" y="${H - padBottom + 16}" text-anchor="middle" font-size="9.5" fill="${C.texto}">${esc(r.label)}</text>`,
      );
      return partes.join("");
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" class="grafico">
    ${grades}
    <line x1="${padX}" y1="${padTop + alturaUtil}" x2="${W - padX / 2}" y2="${padTop + alturaUtil}" stroke="${C.navy400}" stroke-width="1"/>
    ${barras}
    <g transform="translate(${padX},12)">
      <rect width="9" height="9" y="-8" fill="${C.navy700}" rx="2"/>
      <text x="14" y="0" font-size="10" fill="${C.texto}">${esc(legenda.a)}</text>
      <rect width="9" height="9" x="${14 + legenda.a.length * 5.6 + 14}" y="-8" fill="${C.gold}" rx="2"/>
      <text x="${14 + legenda.a.length * 5.6 + 32}" y="0" font-size="10" fill="${C.texto}">${esc(legenda.b)}</text>
    </g>
  </svg>`;
}

/** Vendas (barras) + VGV (linha) por mês — a evolução do resultado. */
function svgEvolucao(serie: PerformanceDrillRow[]): string {
  if (serie.length === 0) return "";
  const W = 700;
  const H = 250;
  const padX = 34;
  // O eixo direito carrega "R$ 862,5 mil": precisa de folga para não cortar.
  const padDireita = 78;
  const padTop = 24;
  const padBottom = 40;
  const alturaUtil = H - padTop - padBottom;
  const maxVendas = Math.max(1, ...serie.map((m) => m.vendas)) * 1.25;
  const maxVgv = Math.max(1, ...serie.map((m) => Number(m.vgv) || 0)) * 1.25;
  const passo = (W - padX - padDireita) / serie.length;
  const larguraBarra = Math.min(38, passo * 0.42);
  const yv = (v: number) => padTop + alturaUtil - (v / maxVendas) * alturaUtil;
  const yg = (v: number) => padTop + alturaUtil - (v / maxVgv) * alturaUtil;

  const grades = [0, 0.5, 1]
    .map((f) => {
      const yy = padTop + alturaUtil - f * alturaUtil;
      return `<line x1="${padX}" y1="${yy}" x2="${W - padDireita}" y2="${yy}" stroke="${C.linha}" stroke-width="1"/>
        <text x="${padX - 6}" y="${yy + 3}" text-anchor="end" font-size="9" fill="${C.suave}">${Math.round(maxVendas * f)}</text>
        <text x="${W - padDireita + 6}" y="${yy + 3}" font-size="8.5" fill="${C.suave}">${brlCompacto(maxVgv * f)}</text>`;
    })
    .join("");

  const barras = serie
    .map((m, i) => {
      const cx = padX + passo * i + passo / 2;
      return `<rect x="${cx - larguraBarra / 2}" y="${yv(m.vendas)}" width="${larguraBarra}" height="${Math.max(1, padTop + alturaUtil - yv(m.vendas))}" fill="${C.navy700}" rx="2"/>
        ${m.vendas > 0 ? `<text x="${cx}" y="${yv(m.vendas) - 4}" text-anchor="middle" font-size="9" font-weight="600" fill="${C.navy}">${m.vendas}</text>` : ""}
        <text x="${cx}" y="${H - padBottom + 16}" text-anchor="middle" font-size="9.5" fill="${C.texto}">${esc(mesCurto(m.mes))}</text>`;
    })
    .join("");

  const pontos = serie
    .map((m, i) => `${padX + passo * i + passo / 2},${yg(Number(m.vgv) || 0)}`)
    .join(" ");
  const marcadores = serie
    .map(
      (m, i) =>
        `<circle cx="${padX + passo * i + passo / 2}" cy="${yg(Number(m.vgv) || 0)}" r="3" fill="${C.gold}"/>`,
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" class="grafico">
    ${grades}
    ${barras}
    <polyline points="${pontos}" fill="none" stroke="${C.gold}" stroke-width="2.2" stroke-linejoin="round"/>
    ${marcadores}
    <g transform="translate(${padX},12)">
      <rect width="9" height="9" y="-8" fill="${C.navy700}" rx="2"/>
      <text x="14" y="0" font-size="10" fill="${C.texto}">Vendas</text>
      <rect width="9" height="9" x="70" y="-8" fill="${C.gold}" rx="2"/>
      <text x="88" y="0" font-size="10" fill="${C.texto}">VGV</text>
    </g>
  </svg>`;
}

/**
 * Barras horizontais com rótulo à esquerda (perdas, carteira). `largura` existe
 * porque o SVG escala com a coluna: na grade de duas colunas um viewBox de 700
 * deixaria a tipografia ilegível.
 */
function svgBarrasHorizontais(
  rows: Array<{ label: string; valor: number; nota?: string | null; destaque?: boolean }>,
  largura: "cheia" | "meia" = "cheia",
): string {
  if (rows.length === 0) return "";
  const meia = largura === "meia";
  const W = meia ? 340 : 700;
  const alturaLinha = meia ? 22 : 26;
  const H = rows.length * alturaLinha + 12;
  const labelW = meia ? 110 : 210;
  const max = Math.max(1, ...rows.map((r) => r.valor));
  const trilho = W - labelW - (meia ? 78 : 90);

  return `<svg viewBox="0 0 ${W} ${H}" role="img" class="grafico">
    ${rows
      .map((r, i) => {
        const y = i * alturaLinha + 6;
        const alturaBarra = meia ? 11 : 13;
        const w = Math.max(2, (r.valor / max) * trilho);
        const baseline = y + alturaBarra + 2;
        return `<text x="${labelW - 8}" y="${baseline}" text-anchor="end" font-size="${meia ? 9 : 10}" fill="${C.texto}">${esc(r.label)}</text>
          <rect x="${labelW}" y="${y + 3}" width="${trilho}" height="${alturaBarra}" fill="${C.fundo}" rx="3"/>
          <rect x="${labelW}" y="${y + 3}" width="${w}" height="${alturaBarra}" fill="${r.destaque ? C.perigo : C.navy700}" rx="3"/>
          <text x="${labelW + w + 6}" y="${baseline}" font-size="${meia ? 9 : 10}" font-weight="600" fill="${C.texto}">${numero(r.valor)}${r.nota ? `<tspan fill="${C.suave}" font-weight="400"> · ${esc(r.nota)}</tspan>` : ""}</text>`;
      })
      .join("")}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Blocos do documento
// ---------------------------------------------------------------------------

const FAROL_LABEL: Record<string, string> = {
  verde: "no ritmo",
  ambar: "atenção",
  vermelho: "risco",
  neutro: "sem base",
};

function kpiCard(c: ComparacaoMetrica): string {
  const ehVgv = c.chave === "vgv";
  const ehTempo = c.chave === "primeira_resposta";
  const valor =
    c.valor === null ? "—" : ehVgv ? brl(c.valor) : ehTempo ? minutos(c.valor) : numero(c.valor);
  const acima = c.deltaPct === null ? null : c.menorMelhor ? c.deltaPct < 0 : c.deltaPct > 0;
  const cor = acima === null ? C.suave : acima ? C.sucesso : C.alerta;
  const base =
    c.mediaTime === null
      ? "time: sem amostra"
      : `time: ${ehVgv ? brlCompacto(c.mediaTime) : ehTempo ? minutos(Math.round(c.mediaTime)) : numero(Math.round(c.mediaTime * 10) / 10)}`;
  // A unidade já aparece no valor ("47min"): o rótulo não repete "(min)".
  const rotulo = ehTempo ? "1ª resposta (mediana)" : c.label;
  return `<div class="kpi">
    <div class="kpi-label">${esc(rotulo)}</div>
    <div class="kpi-valor">${esc(valor)}</div>
    <div class="kpi-base">${esc(base)}${
      c.deltaPct !== null
        ? ` <span style="color:${cor};font-weight:600">(${c.deltaPct > 0 ? "+" : ""}${c.deltaPct}%)</span>`
        : ""
    }</div>
  </div>`;
}

function leituraCard(l: Leitura): string {
  return `<div class="leitura" style="border-left-color:${TOM_COR[l.tom]}">
    <div class="leitura-titulo" style="color:${TOM_COR[l.tom]}">${esc(l.titulo)}</div>
    <p>${esc(l.texto)}</p>
  </div>`;
}

function tabela(
  cabecalho: string[],
  linhas: string[][],
  alinhamentos: Array<"l" | "r"> = [],
): string {
  const al = (i: number) => (alinhamentos[i] === "r" ? ' class="r"' : "");
  return `<table>
    <thead><tr>${cabecalho.map((h, i) => `<th${al(i)}>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${linhas
      .map((l) => `<tr>${l.map((c, i) => `<td${al(i)}>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody>
  </table>`;
}

function secao(titulo: string, subtitulo: string | null, conteudo: string): string {
  return `<section class="secao">
    <h2>${esc(titulo)}${subtitulo ? `<span>${esc(subtitulo)}</span>` : ""}</h2>
    ${conteudo}
  </section>`;
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

export function montarHtmlRaioX(r: RaioXRelatorio): string {
  const primeiroNome = r.nome.split(" ")[0];
  const dataGeracao = r.geradoEm.toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const kpis = r.comparacoes.map(kpiCard).join("");

  // --- Destaque do impacto (o número que justifica a reunião) ---------------
  const destaque = r.impacto
    ? `<div class="destaque">
        <div class="destaque-rotulo">Oportunidade nº 1 do período</div>
        <div class="destaque-valor">${esc(
          r.impacto.vgvExtra !== null
            ? `${brl(r.impacto.vgvExtra)} em VGV`
            : `${decimal(r.impacto.vendasExtras)} venda(s)`,
        )}</div>
        <p>Levar a passagem <strong>${esc(r.impacto.etapa)}</strong> de ${esc(pct(r.impacto.minhaTaxa))} para os ${esc(pct(r.impacto.taxaTime))} do time — sem nenhum lead a mais — valeria cerca de <strong>${decimal(r.impacto.vendasExtras)} venda(s)</strong> adicionais no mesmo período.</p>
      </div>`
    : "";

  // --- Funil ---------------------------------------------------------------
  const funilConteudo = r.funilIndisponivel
    ? `<p class="vazio">Cobertura de histórico abaixo de ${esc(r.coberturaMinima)}% na janela: as taxas de passagem seriam enganosas e foram suprimidas. Os volumes absolutos das outras seções continuam válidos.</p>`
    : r.funil.length === 0
      ? `<p class="vazio">Sem coorte no período.</p>`
      : svgBarrasAgrupadas(
          r.funil.map((f) => ({ label: f.etapa, a: f.minhaTaxa, b: f.taxaTime })),
          { a: primeiroNome, b: "Média do time" },
        ) +
        tabela(
          ["Passagem", `${primeiroNome}`, "Time", "Gap"],
          r.funil.map((f) => {
            const cor =
              f.gapPp === null
                ? C.suave
                : f.gapPp < -5
                  ? C.perigo
                  : f.gapPp > 5
                    ? C.sucesso
                    : C.texto;
            return [
              `${esc(f.etapa)}${r.gargalo?.etapa === f.etapa ? ' <span class="tag tag-risco">gargalo</span>' : ""}`,
              f.minhaTaxa === null ? "—" : esc(pct(f.minhaTaxa)),
              f.taxaTime === null ? "—" : esc(pct(f.taxaTime)),
              `<span style="color:${cor};font-weight:600">${f.gapPp === null ? "—" : `${f.gapPp > 0 ? "+" : ""}${f.gapPp} p.p.`}</span>`,
            ];
          }),
          ["l", "r", "r", "r"],
        ) +
        (r.coorte
          ? `<p class="nota">Coorte de ${numero(r.coorte.leads)} leads criados no período — ${numero(r.coorte.atingiu_visita)} chegaram a visitar, ${numero(r.coorte.vendas)} fecharam, ${numero(r.coorte.perdidos)} foram perdidos. Cobertura de histórico: ${esc(r.coorte.cobertura_pct === null ? "—" : pct(r.coorte.cobertura_pct))}.</p>`
          : "");

  // --- Evolução ------------------------------------------------------------
  const evolucao =
    r.serie.length === 0
      ? `<p class="vazio">Sem histórico mensal no período.</p>`
      : svgEvolucao(r.serie) +
        tabela(
          [
            "Mês",
            "Leads",
            "Contatos",
            "Agend.",
            "Visitas",
            "No-show",
            "Análises",
            "Vendas",
            "VGV",
            "1ª resp.",
          ],
          [
            ...r.serie.map((m) => [
              esc(mesCurto(m.mes)),
              numero(m.leads_recebidos),
              numero(m.contatos),
              numero(m.agendamentos_criados),
              numero(m.visitas_realizadas),
              m.no_shows > 0 ? `<span style="color:${C.perigo}">${numero(m.no_shows)}</span>` : "0",
              numero(m.analises),
              `<strong>${numero(m.vendas)}</strong>`,
              Number(m.vgv) > 0 ? esc(brlCompacto(Number(m.vgv))) : "—",
              esc(minutos(m.primeira_resposta_p50_min)),
            ]),
            [
              "<strong>Total</strong>",
              `<strong>${numero(r.totais.leads)}</strong>`,
              `<strong>${numero(r.totais.contatos)}</strong>`,
              `<strong>${numero(r.totais.agendamentos)}</strong>`,
              `<strong>${numero(r.totais.visitas)}</strong>`,
              `<strong>${numero(r.totais.noShows)}</strong>`,
              `<strong>${numero(r.totais.analises)}</strong>`,
              `<strong>${numero(r.totais.vendas)}</strong>`,
              `<strong>${esc(brlCompacto(r.totais.vgv))}</strong>`,
              "—",
            ],
          ],
          ["l", "r", "r", "r", "r", "r", "r", "r", "r", "r"],
        ) +
        (r.trimestres.length > 1
          ? `<p class="nota"><strong>Trimestres</strong> (base do escalonamento de comissão): ${esc(
              r.trimestres
                .map((t) => `${t.trimestre}: ${t.vendas}v · ${brlCompacto(t.vgv)}`)
                .join("  →  "),
            )}</p>`
          : "") +
        (r.totais.ticketMedio !== null
          ? `<p class="nota">Ticket médio no período: <strong>${esc(brl(r.totais.ticketMedio))}</strong>${
              r.totais.conversaoPct !== null
                ? ` · conversão lead→venda: <strong>${esc(pct(r.totais.conversaoPct))}</strong>`
                : ""
            }</p>`
          : "");

  // --- Carteira e exceções -------------------------------------------------
  const carteira =
    r.carteira.length === 0
      ? `<p class="vazio">Sem leads ativos na carteira.</p>`
      : svgBarrasHorizontais(
          r.carteira.map((c) => ({
            label: c.label,
            valor: c.quantidade,
            nota: c.parados ? `${c.parados} parados` : null,
            destaque: (c.parados ?? 0) > 0 && (c.parados ?? 0) >= c.quantidade / 2,
          })),
          "meia",
        ) +
        `<p class="nota">Carga ativa: <strong>${numero(r.cargaAtiva)}</strong> leads${
          r.capacidadePct != null ? ` (${r.capacidadePct}% da capacidade)` : ""
        }${r.paradosNaCarteira > 0 ? ` · <strong style="color:${C.perigo}">${numero(r.paradosNaCarteira)} parados</strong>` : ""}.</p>`;

  const excecoes =
    r.excecoes.length === 0
      ? `<p class="vazio">Nenhuma exceção aberta no momento da geração.</p>`
      : `<ul class="lista">${r.excecoes
          .slice(0, 12)
          .map((e) => `<li><span class="tag">${esc(e.tipoLabel)}</span> ${esc(e.leadNome)}</li>`)
          .join("")}${
          r.excecoes.length > 12
            ? `<li class="nota">+${r.excecoes.length - 12} no Painel do Dia</li>`
            : ""
        }</ul>`;

  // --- Perdas --------------------------------------------------------------
  const perdas =
    r.perdas.length === 0
      ? `<p class="vazio">Sem perdas registradas com motivo no período.</p>`
      : svgBarrasHorizontais(
          r.perdas.slice(0, 8).map((p) => ({
            label: p.label,
            valor: p.quantidade,
            nota: p.vgv_estimado ? `~${brlCompacto(Number(p.vgv_estimado))}` : null,
          })),
        ) +
        `<p class="nota">Total de ${numero(r.perdas.reduce((s, p) => s + p.quantidade, 0))} leads perdidos com motivo registrado. O VGV é estimado pelo valor potencial do lead.</p>`;

  // --- Comissões e meta ----------------------------------------------------
  const comissoes = `<div class="cards">
    <div class="card">
      <div class="card-rotulo">Comissões pagas</div>
      <div class="card-valor" style="color:${C.sucesso}">${esc(brl(r.comissoes.pago))}</div>
    </div>
    <div class="card">
      <div class="card-rotulo">Em aberto</div>
      <div class="card-valor">${esc(brl(r.comissoes.aberto))}</div>
    </div>
    <div class="card">
      <div class="card-rotulo">Total do período</div>
      <div class="card-valor">${esc(brl(r.comissoes.pago + r.comissoes.aberto))}</div>
    </div>
    ${
      r.meta && r.meta.metaVgv > 0
        ? `<div class="card">
            <div class="card-rotulo">Meta do mês (VGV)</div>
            <div class="card-valor">${esc(brlCompacto(r.meta.realizadoVgv))}</div>
            <div class="card-sub">de ${esc(brlCompacto(r.meta.metaVgv))} · projeção ${esc(r.meta.projecaoVgv !== null ? brlCompacto(r.meta.projecaoVgv) : "—")} (${esc(FAROL_LABEL[r.meta.farol] ?? r.meta.farol)})</div>
          </div>`
        : ""
    }
  </div>`;

  // --- Plano de ação -------------------------------------------------------
  const plano = `<table class="plano">
    <thead><tr><th style="width:26px">#</th><th>Ação</th><th>Por quê</th><th>Como fazer</th></tr></thead>
    <tbody>${r.acoes
      .map(
        (a) => `<tr>
          <td class="prio">${a.prioridade}</td>
          <td><strong>${esc(a.titulo)}</strong></td>
          <td>${esc(a.porque)}</td>
          <td>${esc(a.como)}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table>
  <div class="acordo">
    <div class="campo"><span>Compromisso acordado na 1:1</span><div class="linha-escrita"></div><div class="linha-escrita"></div></div>
    <div class="campo-lado">
      <div class="campo"><span>Próxima revisão</span><div class="linha-escrita"></div></div>
      <div class="campo"><span>Assinatura do corretor</span><div class="linha-escrita"></div></div>
      <div class="campo"><span>Assinatura do gestor</span><div class="linha-escrita"></div></div>
    </div>
  </div>`;

  const chips = [
    `Período: ${r.periodoLabel}`,
    r.de
      ? `${r.de.split("-").reverse().join("/")}${r.ate ? ` – ${r.ate.split("-").reverse().join("/")}` : " – hoje"}`
      : null,
    `Carga ativa: ${numero(r.cargaAtiva)}`,
    r.capacidadePct != null ? `${r.capacidadePct}% da capacidade` : null,
    r.presente === null ? null : r.presente ? "Presente hoje" : "Ausente hoje",
  ].filter(Boolean) as string[];

  const sinalTexto =
    r.sinal === "mentoria"
      ? "Sinal de gestão: precisa de mentoria — esforço alto, conversão abaixo do time."
      : r.sinal === "dar_mais_lead"
        ? "Sinal de gestão: converte acima do time — candidato a receber mais leads."
        : "Sinal de gestão: dentro do padrão do time no mês.";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(`raio-x-${slug(r.nome)}-${r.geradoEm.toISOString().slice(0, 10)}`)}</title>
<style>
  @page { size: A4 portrait; margin: 13mm 12mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Sora", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: ${C.texto};
    font-size: 10pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1, h2, h3 { margin: 0; font-weight: 600; }
  p { margin: 0 0 6px; }

  /* Cabeçalho */
  .capa {
    background: ${C.navy};
    color: ${C.branco};
    padding: 16px 18px;
    border-radius: 8px;
    border-bottom: 4px solid ${C.gold};
    margin-bottom: 14px;
  }
  .capa .marca { font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase; color: ${C.gold200}; }
  .capa h1 { font-size: 20pt; line-height: 1.15; margin: 4px 0 2px; }
  .capa .sub { font-size: 9.5pt; color: #c9d3e6; }
  .chips { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chips span {
    font-size: 8pt; padding: 2px 8px; border-radius: 999px;
    background: rgba(255,255,255,.12); color: #eef2f9; border: 1px solid rgba(255,255,255,.18);
  }
  .sinal { margin-top: 10px; font-size: 9pt; color: ${C.gold200}; border-top: 1px solid rgba(255,255,255,.15); padding-top: 8px; }

  /* Seções */
  .secao { break-inside: avoid; margin-bottom: 14px; }
  .secao h2 {
    font-size: 11.5pt; color: ${C.navy};
    border-bottom: 2px solid ${C.gold};
    padding-bottom: 4px; margin-bottom: 8px;
    display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  }
  .secao h2 span { font-size: 8.5pt; font-weight: 400; color: ${C.suave}; }

  /* KPIs */
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .kpi { border: 1px solid ${C.linha}; border-radius: 6px; padding: 8px 10px; background: ${C.fundo}; }
  .kpi-label { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: ${C.suave}; }
  .kpi-valor { font-size: 15pt; font-weight: 600; color: ${C.navy}; line-height: 1.25; }
  .kpi-base { font-size: 8pt; color: ${C.suave}; }

  /* Leitura do período */
  .leitura { border-left: 3px solid ${C.navy400}; padding: 2px 0 2px 10px; margin-bottom: 8px; break-inside: avoid; }
  .leitura-titulo { font-size: 9.5pt; font-weight: 600; }
  .leitura p { font-size: 9.5pt; color: ${C.texto}; margin: 1px 0 0; }

  /* Destaque */
  .destaque {
    border: 1px solid ${C.gold}; background: #fdf8ec; border-radius: 8px;
    padding: 12px 14px; margin-bottom: 14px; break-inside: avoid;
  }
  .destaque-rotulo { font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: ${C.gold}; font-weight: 600; }
  .destaque-valor { font-size: 19pt; font-weight: 700; color: ${C.navy}; line-height: 1.2; }
  .destaque p { font-size: 9.5pt; margin: 4px 0 0; }

  /* Tabelas */
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9pt; }
  th, td { padding: 4px 6px; border-bottom: 1px solid ${C.linha}; text-align: left; vertical-align: top; }
  th { background: ${C.fundo}; color: ${C.navy}; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
  td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: none; }
  .plano td { font-size: 9pt; }
  .plano .prio { font-weight: 700; color: ${C.gold}; font-size: 12pt; text-align: center; }

  /* Gráficos */
  .grafico { width: 100%; height: auto; display: block; margin: 4px 0 2px; }

  /* Cards */
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .card { border: 1px solid ${C.linha}; border-radius: 6px; padding: 8px 10px; }
  .card-rotulo { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: ${C.suave}; }
  .card-valor { font-size: 13pt; font-weight: 600; color: ${C.navy}; }
  .card-sub { font-size: 8pt; color: ${C.suave}; font-weight: 400; }

  /* Duas colunas */
  .duas { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  .lista { margin: 4px 0 0; padding: 0; list-style: none; font-size: 9pt; }
  .lista li { padding: 2px 0; border-bottom: 1px dotted ${C.linha}; }
  .tag { display: inline-block; font-size: 7.5pt; padding: 1px 6px; border-radius: 999px; background: ${C.fundo}; border: 1px solid ${C.linha}; color: ${C.suave}; margin-right: 4px; }
  .tag-risco { background: #fdecea; border-color: #f3c9c3; color: ${C.perigo}; }
  .nota { font-size: 8.5pt; color: ${C.suave}; margin-top: 6px; }
  .vazio { font-size: 9pt; color: ${C.suave}; font-style: italic; }

  /* Acordo da 1:1 */
  .acordo { margin-top: 10px; display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; break-inside: avoid; }
  .campo span { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: ${C.suave}; }
  .campo-lado { display: grid; gap: 8px; }
  .linha-escrita { border-bottom: 1px solid ${C.navy400}; height: 18px; }

  .rodape {
    margin-top: 16px; border-top: 1px solid ${C.linha}; padding-top: 6px;
    font-size: 7.5pt; color: ${C.suave};
  }
  @media print { .quebra { break-before: page; } }
</style>
</head>
<body>
  <header class="capa">
    <div class="marca">Seu Metro Quadrado · Inteligência comercial</div>
    <h1>Raio-X do Corretor — ${esc(r.nome)}</h1>
    <div class="sub">Relatório individual de performance · gerado em ${esc(dataGeracao)}${r.geradoPor ? ` por ${esc(r.geradoPor)}` : ""}</div>
    <div class="chips">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>
    <div class="sinal">${esc(sinalTexto)}</div>
  </header>

  ${secao("1. Placar do período", r.periodoLabel, `<div class="kpis">${kpis}</div>`)}

  ${destaque}

  ${secao("2. Leitura do período", "o que os números dizem", r.leituras.map(leituraCard).join(""))}

  ${secao("3. Onde o funil dele(a) trava", `coorte · ${r.periodoLabel}`, funilConteudo)}

  ${secao("4. Evolução mês a mês", r.periodoLabel, evolucao)}

  <div class="duas">
    ${secao("5. Carteira agora", "leads ativos", carteira)}
    ${secao("6. Exceções abertas", "no momento da geração", excecoes)}
  </div>

  ${secao("7. Onde ele(a) mais perde", r.periodoLabel, perdas)}

  ${secao("8. Comissões e meta", r.periodoLabel, comissoes)}

  ${secao("9. Plano de ação da 1:1", "prioridade decrescente", plano)}

  <div class="rodape">
    <strong>Metodologia:</strong> funil em leitura de coorte (leads criados na janela seguidos até hoje); comparações usam a média dos demais corretores com atividade no período, com amostra mínima de 3 corretores — abaixo disso o relatório mostra "sem amostra" em vez de um número frágil. Taxas são suprimidas quando a cobertura de histórico fica abaixo de ${esc(r.coberturaMinima)}%. Projeção de meta é linear sobre dias úteis. Dados atualizados em ${esc(r.atualizadoEm ?? "—")}.<br>
    Documento interno e confidencial · Seu Metro Quadrado · ${esc(dataGeracao)}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Impressão
// ---------------------------------------------------------------------------

/**
 * Abre a caixa de impressão com o relatório renderizado. Usa iframe oculto
 * (mesma origem, sem bloqueio de pop-up); se o browser recusar, cai para uma
 * aba nova.
 */
export function imprimirRaioX(relatorio: RaioXRelatorio): void {
  const html = montarHtmlRaioX(relatorio);
  const iframe = document.createElement("iframe");
  if (!("srcdoc" in iframe)) {
    abrirEmAba(html);
    return;
  }
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Raio-X para impressão");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";

  let encerrado = false;
  const limpar = () => {
    if (encerrado) return;
    encerrado = true;
    // Um tick depois do print para o Safari não abortar o job.
    window.setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      abrirEmAba(html);
      return;
    }
    win.addEventListener("afterprint", limpar, { once: true });
    win.focus();
    win.print();
    // Rede de segurança para browsers que não emitem afterprint.
    window.setTimeout(limpar, 60_000);
  };

  // srcdoc (e não document.write): o load só dispara com o relatório pronto,
  // sem corrida com o about:blank inicial do iframe.
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

function abrirEmAba(html: string): void {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Bloqueio de pop-up: libere pop-ups para gerar o PDF.");
  win.document.write(html);
  win.document.close();
  win.focus();
  win.setTimeout(() => win.print(), 300);
}
