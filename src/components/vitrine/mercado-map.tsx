// Mapa de Mercado — Leaflet real (OpenStreetMap) com os empreendimentos do CRM
// e da planilha, as zonas de São Paulo e as linhas de metrô/CPTM.
//
// Substitui o iframe do public/mapa-mercado.html: aqui o mapa é um componente da
// página, então ele reage aos filtros e ao simulador que vivem FORA dele, e
// ocupa a largura toda em vez de dividir espaço com uma sidebar interna.
//
// Três decisões que valem explicação:
//
//  1) Leaflet entra por `import()` dentro do efeito. A biblioteca toca `window`
//     no topo do módulo, então um import estático quebraria o SSR do app.
//  2) Os pinos são `circleMarker` com renderer de canvas (`preferCanvas`). O
//     catálogo passa de 900 empreendimentos e um marcador DOM por item trava a
//     rolagem; em canvas o mapa continua fluido.
//  3) O conteúdo do popup é montado com `createElement`/`textContent`, nunca com
//     string de HTML: nome e construtora vêm de planilha editada por humanos.

import { useEffect, useMemo, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  classificar,
  coberturaPercentual,
  parcelamentoConstrutora,
  type Enquadramento,
  type PoderDeCompra,
} from "@/lib/vitrine/poder-de-compra";
import type { EmpreendimentoMercado } from "@/lib/vitrine/mercado";
import type { Situacao } from "@/lib/vitrine/vitrine";
import { formatBRL } from "@/lib/projetos";
import { cn } from "@/lib/utils";

/** Centro e zoom iniciais: a mancha urbana de São Paulo inteira. */
const CENTRO_SP: [number, number] = [-23.5505, -46.6333];
const ZOOM_INICIAL = 10;

const COR_SITUACAO: Record<Situacao, string> = {
  Lançamento: "#2E5FA3",
  "Em obras": "#B4690E",
  Pronto: "#2E7D46",
  "A confirmar": "#8A8F98",
};

/** Dourado da marca: fecha na regra 80/20 do CRM. */
const COR_FECHA = "#E0A646";
/** Azul: só fecha se a construtora esticar o parcelamento para 25%. */
const COR_OTIMISTA = "#2E5FA3";
/** Cinza apagado: entra no filtro, mas não fecha nem no cenário otimista. */
const COR_NAO_FECHA = "#B7BEC7";

const COR_ENQUADRAMENTO: Record<Enquadramento, string> = {
  fecha: COR_FECHA,
  otimista: COR_OTIMISTA,
  "nao-fecha": COR_NAO_FECHA,
  "sem-preco": COR_NAO_FECHA,
};

function corDaSituacao(situacao: Situacao): string {
  return COR_SITUACAO[situacao];
}

type GeoLinha = { nome: string; cor: string; coords: [number, number][] };
type GeoMercado = { zonas: GeoLinha[]; metro: GeoLinha[] };

// Zonas + metrô são ~50 KB de coordenadas: ficam em public/ e são buscadas uma
// única vez por sessão, na primeira vez que alguma das camadas é ligada.
let geoPromise: Promise<GeoMercado> | null = null;
function carregarGeo(): Promise<GeoMercado> {
  geoPromise ??= fetch("/mercado-geo.json")
    .then((r) => {
      if (!r.ok) throw new Error(`geo_status_${r.status}`);
      return r.json() as Promise<GeoMercado>;
    })
    .catch((erro) => {
      geoPromise = null; // deixa tentar de novo no próximo toggle
      throw erro;
    });
  return geoPromise;
}

type Props = {
  /** Empreendimentos já filtrados pela barra — o mapa não filtra nada. */
  itens: EmpreendimentoMercado[];
  poder: PoderDeCompra | null;
  mostrarZonas: boolean;
  mostrarMetro: boolean;
  /** Abre a ficha do empreendimento (só existe para item do CRM). */
  onAbrirFicha: (id: string) => void;
  /** Item sob o cursor na lista — ganha um anel no mapa. */
  destacadoId?: string | null;
  /** Item aberto na ficha — o mapa navega até ele. */
  focadoId?: string | null;
  /** Muda quando o usuário pede reenquadramento manual. */
  enquadrarEm?: number;
  className?: string;
};

const preco = (v: number | null): string => (v == null ? "sob consulta" : formatBRL(v));

export function MercadoMap({
  itens,
  poder,
  mostrarZonas,
  mostrarMetro,
  onAbrirFicha,
  destacadoId = null,
  focadoId = null,
  enquadrarEm = 0,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof LeafletNS | null>(null);
  const mapaRef = useRef<LeafletNS.Map | null>(null);
  const pinosRef = useRef<LeafletNS.LayerGroup | null>(null);
  const zonasRef = useRef<LeafletNS.LayerGroup | null>(null);
  const metroRef = useRef<LeafletNS.LayerGroup | null>(null);
  const destaqueRef = useRef<LeafletNS.CircleMarker | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O callback muda a cada render do pai; guardá-lo numa ref evita reconstruir
  // os ~900 pinos só porque a identidade da função mudou.
  const abrirFichaRef = useRef(onAbrirFicha);
  abrirFichaRef.current = onAbrirFicha;

  const comCoordenada = useMemo(() => itens.filter((e) => e.lat != null && e.lng != null), [itens]);
  // Assinatura do conjunto visível: só quando ELA muda o mapa se reenquadra —
  // passar o mouse ou abrir uma ficha não deve mexer no enquadramento.
  const assinatura = useMemo(() => comCoordenada.map((e) => e.id).join(","), [comCoordenada]);

  // --- Criação do mapa (uma vez) -------------------------------------------
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const L = await import("leaflet");
        if (cancelado || !containerRef.current || mapaRef.current) return;
        const mapa = L.map(containerRef.current, {
          preferCanvas: true,
          zoomControl: true,
          attributionControl: true,
          worldCopyJump: false,
        }).setView(CENTRO_SP, ZOOM_INICIAL);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(mapa);
        mapa.attributionControl.setPrefix(false);

        leafletRef.current = L;
        mapaRef.current = mapa;
        pinosRef.current = L.layerGroup().addTo(mapa);
        setPronto(true);
      } catch {
        if (!cancelado) setErro("Não foi possível carregar o mapa.");
      }
    })();

    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
      pinosRef.current = null;
      zonasRef.current = null;
      metroRef.current = null;
      destaqueRef.current = null;
    };
  }, []);

  // O contêiner nasce com altura definida pelo layout; se ele mudar de tamanho
  // (abrir/fechar a barra de filtros, girar o celular), o Leaflet precisa saber.
  useEffect(() => {
    if (!pronto || !containerRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapaRef.current?.invalidateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pronto]);

  // --- Pinos ----------------------------------------------------------------
  useEffect(() => {
    const L = leafletRef.current;
    const camada = pinosRef.current;
    if (!pronto || !L || !camada) return;
    camada.clearLayers();

    const simulando = poder != null;
    // Quem fecha é desenhado por ÚLTIMO para ficar por cima dos demais. Ordenar
    // é o jeito confiável no renderer de canvas: `bringToFront()` só reordena um
    // marcador que já está no mapa, e aqui ele ainda está sendo criado.
    const ordenados = simulando
      ? [...comCoordenada].sort(
          (a, b) =>
            Number(classificar(a.precoMin, poder) === "fecha") -
            Number(classificar(b.precoMin, poder) === "fecha"),
        )
      : comCoordenada;

    for (const item of ordenados) {
      const enquadramento = classificar(item.precoMin, poder);
      const destaque = enquadramento === "fecha";
      const apagado = simulando && enquadramento !== "fecha" && enquadramento !== "otimista";
      const marcador = L.circleMarker([item.lat!, item.lng!], {
        radius: simulando ? (destaque ? 9 : apagado ? 5 : 7) : 7,
        color: "#ffffff",
        weight: destaque ? 2 : 1,
        fillColor: simulando ? COR_ENQUADRAMENTO[enquadramento] : corDaSituacao(item.situacao),
        fillOpacity: apagado ? 0.55 : 0.95,
        opacity: apagado ? 0.55 : 1,
      });
      marcador.bindTooltip(item.nome, { direction: "top", offset: [0, -6] });
      marcador.bindPopup(() => popupDoItem(item, poder, abrirFichaRef.current));
      camada.addLayer(marcador);
    }
  }, [pronto, comCoordenada, poder]);

  // --- Destaque de quem está sob o cursor na lista ---------------------------
  // Um anel sobreposto, e não uma re-renderização dos pinos: passar o mouse pela
  // lista não pode custar o redesenho de centenas de marcadores.
  useEffect(() => {
    const L = leafletRef.current;
    const mapa = mapaRef.current;
    if (!pronto || !L || !mapa) return;

    destaqueRef.current?.remove();
    destaqueRef.current = null;

    const alvo = comCoordenada.find((e) => e.id === destacadoId);
    if (!alvo) return;
    destaqueRef.current = L.circleMarker([alvo.lat!, alvo.lng!], {
      radius: 14,
      color: "#E0A646",
      weight: 3,
      fill: false,
      interactive: false,
    }).addTo(mapa);
  }, [pronto, destacadoId, comCoordenada]);

  // --- Foco no item aberto na ficha -----------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!pronto || !mapa || !focadoId) return;
    const alvo = comCoordenada.find((e) => e.id === focadoId);
    if (!alvo) return;
    mapa.setView([alvo.lat!, alvo.lng!], Math.max(mapa.getZoom(), 14), { animate: true });
  }, [pronto, focadoId, comCoordenada]);

  // --- Enquadramento --------------------------------------------------------
  useEffect(() => {
    const L = leafletRef.current;
    const mapa = mapaRef.current;
    if (!pronto || !L || !mapa || comCoordenada.length === 0) return;
    const bounds = L.latLngBounds(comCoordenada.map((e) => [e.lat!, e.lng!] as [number, number]));
    mapa.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    // `assinatura` é a dependência real (o conjunto de pinos); `comCoordenada`
    // entra só para ler as coordenadas do enquadramento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, assinatura, enquadrarEm]);

  // --- Camadas de zona e metrô ---------------------------------------------
  useEffect(() => {
    const L = leafletRef.current;
    const mapa = mapaRef.current;
    if (!pronto || !L || !mapa) return;
    if (!mostrarZonas && !mostrarMetro) {
      zonasRef.current?.remove();
      metroRef.current?.remove();
      return;
    }

    let cancelado = false;
    void carregarGeo()
      .then((geo) => {
        if (cancelado || !mapaRef.current) return;
        zonasRef.current ??= L.layerGroup(
          geo.zonas.map((z) =>
            L.polygon(z.coords, {
              color: z.cor,
              weight: 2,
              opacity: 0.9,
              fillColor: z.cor,
              fillOpacity: 0.16,
              interactive: false,
            }),
          ),
        );
        metroRef.current ??= L.layerGroup(
          geo.metro.map((m) =>
            L.polyline(m.coords, { color: m.cor, weight: 3, opacity: 0.85 }).bindTooltip(m.nome, {
              sticky: true,
            }),
          ),
        );
        // Zonas por baixo dos pinos, metrô por cima das zonas.
        if (mostrarZonas)
          zonasRef.current.addTo(mapa).eachLayer((l) => (l as LeafletNS.Path).bringToBack());
        else zonasRef.current.remove();
        if (mostrarMetro) metroRef.current.addTo(mapa);
        else metroRef.current.remove();
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar as camadas de zona e metrô.");
      });

    return () => {
      cancelado = true;
    };
  }, [pronto, mostrarZonas, mostrarMetro]);

  const semCoordenada = itens.length - comCoordenada.length;

  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-card", className)}>
      <div ref={containerRef} className="h-full w-full" aria-label="Mapa de empreendimentos" />

      {!pronto && !erro && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-card text-sm text-muted-foreground">
          Carregando mapa…
        </div>
      )}
      {erro && (
        <div className="absolute inset-x-3 top-3 z-[1000] rounded-md border border-destructive/40 bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm">
          {erro}
        </div>
      )}

      {pronto && semCoordenada > 0 && (
        <div className="absolute right-3 top-3 z-[500] rounded-md border bg-background/95 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          {semCoordenada} sem localização — aparece só na lista
        </div>
      )}

      {pronto && <Legenda simulando={poder != null} />}
    </div>
  );
}

function Legenda({ simulando }: { simulando: boolean }) {
  const linhas: { cor: string; texto: string }[] = simulando
    ? [
        { cor: COR_FECHA, texto: "Fecha com esse cliente" },
        { cor: COR_OTIMISTA, texto: "Fecha se a construtora parcelar 25%" },
        { cor: COR_NAO_FECHA, texto: "Não fecha" },
      ]
    : [
        { cor: COR_SITUACAO["Lançamento"], texto: "Lançamento" },
        { cor: COR_SITUACAO["Em obras"], texto: "Em obras" },
        { cor: COR_SITUACAO.Pronto, texto: "Pronto para morar" },
        { cor: COR_SITUACAO["A confirmar"], texto: "A confirmar" },
      ];

  return (
    <div className="absolute bottom-6 left-3 z-[500] rounded-lg border bg-background/95 p-2.5 text-[11px] shadow-sm backdrop-blur">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">Legenda</div>
      <div className="space-y-1">
        {linhas.map((l) => (
          <div key={l.texto} className="flex items-center gap-2 text-muted-foreground">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
              style={{ background: l.cor }}
            />
            {l.texto}
          </div>
        ))}
      </div>
      <div className="mt-2 max-w-[180px] border-t pt-1.5 text-[10.5px] leading-snug text-muted-foreground">
        {simulando
          ? "Pino dourado: cabe na regra 80/20 do CRM, sem esticar o parcelamento."
          : "Preencha a renda do cliente para ver quem fecha."}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popup — montado em DOM (nunca innerHTML: os textos vêm da planilha)
// ---------------------------------------------------------------------------

function linha(pai: HTMLElement, texto: string, classe: string): void {
  const el = document.createElement("div");
  el.className = classe;
  el.textContent = texto;
  pai.appendChild(el);
}

function popupDoItem(
  item: EmpreendimentoMercado,
  poder: PoderDeCompra | null,
  abrirFicha: (id: string) => void,
): HTMLElement {
  const box = document.createElement("div");
  box.className = "min-w-[190px] space-y-1 text-[12px]";

  linha(box, item.nome, "text-sm font-bold leading-tight text-foreground");
  linha(
    box,
    [item.construtora, item.entrega].filter(Boolean).join(" · ") || "Sem construtora",
    "text-[11px] text-muted-foreground",
  );

  const faixa =
    item.precoMax != null && item.precoMax !== item.precoMin
      ? `${preco(item.precoMin)} — ${preco(item.precoMax)}`
      : preco(item.precoMin);
  linha(box, `A partir de ${faixa}`, "font-semibold tabular-nums text-foreground");

  const m2 = [item.m2min, item.m2max].filter((v) => v != null);
  if (m2.length > 0) linha(box, `${m2.join("–")} m²`, "text-muted-foreground");

  const enquadramento = classificar(item.precoMin, poder);
  const cobertura = coberturaPercentual(item.precoMin, poder);
  if (poder && cobertura != null) {
    const el = document.createElement("div");
    el.className = "font-bold";
    el.style.color =
      enquadramento === "fecha" ? "#2E7D46" : enquadramento === "otimista" ? "#2E5FA3" : "#B4690E";
    el.textContent =
      enquadramento === "fecha"
        ? `Fecha — cliente cobre ${cobertura}% do valor`
        : enquadramento === "otimista"
          ? `Fecha só a 25% de parcelamento — cliente cobre ${cobertura}%`
          : `Não fecha — cliente cobre ${cobertura}%`;
    box.appendChild(el);

    const parcelamento = parcelamentoConstrutora(item.precoMin, poder);
    if (parcelamento && parcelamento.valor > 0) {
      linha(
        box,
        `Parcelar com a construtora: ${formatBRL(parcelamento.valor)} (${parcelamento.percentual}%)`,
        "text-[11px] text-muted-foreground",
      );
    }
  }
  if (poder && !poder.orcamento.enquadra) {
    linha(box, "Renda fora da tabela de crédito.", "text-[11px] text-amber-700");
  }

  if (item.origem === "planilha") {
    linha(
      box,
      "Fora do catálogo do CRM — cadastre o projeto para enviar pelo sistema.",
      "text-[10.5px] leading-snug text-amber-700",
    );
  }

  const acoes = document.createElement("div");
  acoes.className = "flex flex-wrap items-center gap-2 pt-1";
  for (const [rotulo, href] of [
    ["Book", item.bookUrl],
    ["Tabela", item.tabelaUrl],
  ] as const) {
    if (!href) continue;
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "font-semibold underline";
    a.textContent = rotulo;
    acoes.appendChild(a);
  }
  if (item.projeto) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "font-semibold text-primary underline";
    botao.textContent = "Ver ficha";
    botao.addEventListener("click", () => abrirFicha(item.id));
    acoes.appendChild(botao);
  }
  if (acoes.childElementCount > 0) box.appendChild(acoes);

  return box;
}
