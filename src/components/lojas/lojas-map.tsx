// Mapa de Lojas — Leaflet real (OpenStreetMap) com os stands de vendas das
// construtoras, as zonas de São Paulo e as linhas de metrô/CPTM.
//
// Mesmo esqueleto do MercadoMap (Vitrine), com duas diferenças deliberadas:
//
//  1) Pino em DOM (divIcon em gota, com as iniciais da construtora), não
//     circleMarker em canvas. Aqui são dezenas de stands, não 900
//     empreendimentos — o custo do DOM é irrelevante e o pino com a marca é o
//     que o corretor reconhece de relance ("o laranja é Cury").
//  2) O popup é feito para o ATENDIMENTO: rota pelo endereço, fotos do Google,
//     Street View e "Enviar ao cliente". Preço e book não entram — stand não
//     é produto.
//
// Como na Vitrine: Leaflet entra por `import()` (toca `window` no topo do
// módulo e quebraria o SSR), e o popup é montado com createElement/textContent,
// nunca com string de HTML — os textos vêm de planilha editada por humanos.

import { useEffect, useMemo, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  corDaConstrutora,
  iniciaisDaConstrutora,
  linkComoChegar,
  linkFotosGoogle,
  linkStreetView,
  type Loja,
  type Ponto,
} from "@/lib/lojas/lojas";
import { logoDaConstrutora, urlLogo } from "@/lib/logos-construtoras";
import { carregarGeoSP } from "@/lib/mapa-geo-sp";
import { cn } from "@/lib/utils";

/** Centro e zoom iniciais: a mancha urbana de São Paulo inteira. */
const CENTRO_SP: [number, number] = [-23.5505, -46.6333];
const ZOOM_INICIAL = 11;
/** Zoom de rua: ao escolher um stand na lista, o mapa chega até a quadra. */
const ZOOM_LOJA = 16;

type Props = {
  /** Lojas já filtradas pela página — o mapa não filtra nada. */
  lojas: Loja[];
  mostrarZonas: boolean;
  mostrarMetro: boolean;
  /** Loja escolhida na lista: o mapa vai até ela e abre o popup. */
  focadaId?: string | null;
  /** Muda a cada escolha — clicar de novo no mesmo stand volta a focar. */
  focarEm?: number;
  /** Muda quando o usuário pede reenquadramento manual. */
  enquadrarEm?: number;
  /** "Você está aqui" — ligado pelo botão Perto de mim. */
  origem?: Ponto | null;
  /** Clique no pino: a página destaca o item na lista. */
  onSelecionar: (id: string) => void;
  /** Botão "Enviar ao cliente" do popup. */
  onEnviar: (loja: Loja) => void;
  className?: string;
};

export function LojasMap({
  lojas,
  mostrarZonas,
  mostrarMetro,
  focadaId = null,
  focarEm = 0,
  enquadrarEm = 0,
  origem = null,
  onSelecionar,
  onEnviar,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof LeafletNS | null>(null);
  const mapaRef = useRef<LeafletNS.Map | null>(null);
  const pinosRef = useRef<LeafletNS.LayerGroup | null>(null);
  const marcadoresRef = useRef(new Map<string, LeafletNS.Marker>());
  /** Dado mais recente de cada loja com pino (o popup lê daqui ao abrir). */
  const lojasRef = useRef(new Map<string, Loja>());
  /** O que o ícone desenha (construtora + exata): mudou, troca o ícone. */
  const carasRef = useRef(new Map<string, string>());
  const zonasRef = useRef<LeafletNS.LayerGroup | null>(null);
  const metroRef = useRef<LeafletNS.LayerGroup | null>(null);
  const origemRef = useRef<LeafletNS.CircleMarker | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Callbacks mudam a cada render do pai; em ref, não reconstroem os pinos.
  const selecionarRef = useRef(onSelecionar);
  selecionarRef.current = onSelecionar;
  const enviarRef = useRef(onEnviar);
  enviarRef.current = onEnviar;

  const comCoordenada = useMemo(() => lojas.filter((l) => l.lat != null && l.lng != null), [lojas]);
  // Só quando o CONJUNTO muda o mapa se reenquadra. A posição refinada de um
  // pino (estimada → exata) não entra na assinatura: o mapa não pode pular a
  // cada endereço que o navegador acha.
  const assinatura = useMemo(() => comCoordenada.map((l) => l.id).join(","), [comCoordenada]);

  // --- Criação do mapa (uma vez) -------------------------------------------
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const L = await import("leaflet");
        if (cancelado || !containerRef.current || mapaRef.current) return;
        const mapa = L.map(containerRef.current, { zoomControl: true }).setView(
          CENTRO_SP,
          ZOOM_INICIAL,
        );
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

    const marcadores = marcadoresRef.current;
    const lojasComPino = lojasRef.current;
    const caras = carasRef.current;
    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
      pinosRef.current = null;
      zonasRef.current = null;
      metroRef.current = null;
      origemRef.current = null;
      marcadores.clear();
      lojasComPino.clear();
      caras.clear();
    };
  }, []);

  // O contêiner muda de tamanho (lista abre/fecha, celular gira): avisa o Leaflet.
  useEffect(() => {
    if (!pronto || !containerRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapaRef.current?.invalidateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pronto]);

  // --- Pinos ----------------------------------------------------------------
  // Atualização INCREMENTAL, não "apaga tudo e redesenha": no primeiro acesso o
  // navegador refina uma posição por segundo, e redesenhar fecharia o popup que
  // o corretor está lendo a cada endereço achado. Pino existente só se move
  // (setLatLng) ou troca de cara (setIcon) — o popup aberto acompanha.
  useEffect(() => {
    const L = leafletRef.current;
    const camada = pinosRef.current;
    if (!pronto || !L || !camada) return;
    const marcadores = marcadoresRef.current;
    const vivas = new Set<string>();

    for (const loja of comCoordenada) {
      vivas.add(loja.id);
      lojasRef.current.set(loja.id, loja);
      const cara = `${loja.construtora}|${loja.exata}`;
      const existente = marcadores.get(loja.id);
      if (existente) {
        const pos = existente.getLatLng();
        if (pos.lat !== loja.lat || pos.lng !== loja.lng)
          existente.setLatLng([loja.lat!, loja.lng!]);
        if (carasRef.current.get(loja.id) !== cara) existente.setIcon(iconeDaLoja(L, loja));
        carasRef.current.set(loja.id, cara);
        continue;
      }

      const id = loja.id;
      const marcador = L.marker([loja.lat!, loja.lng!], {
        icon: iconeDaLoja(L, loja),
        title: `${loja.construtora} · ${loja.nome}`,
        alt: `${loja.construtora} · ${loja.nome}`,
        keyboard: true,
      });
      // O popup é montado na ABERTURA, com o dado mais recente da loja.
      marcador.bindPopup(
        () => popupDaLoja(lojasRef.current.get(id) ?? loja, (l) => enviarRef.current(l)),
        { maxWidth: 300, minWidth: 240 },
      );
      marcador.on("click", () => selecionarRef.current(id));
      camada.addLayer(marcador);
      marcadores.set(id, marcador);
      carasRef.current.set(id, cara);
    }

    for (const [id, marcador] of marcadores) {
      if (vivas.has(id)) continue;
      camada.removeLayer(marcador);
      marcadores.delete(id);
      carasRef.current.delete(id);
      lojasRef.current.delete(id);
    }
  }, [pronto, comCoordenada]);

  // --- Foco no stand escolhido na lista --------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!pronto || !mapa || !focadaId) return;
    const alvo = comCoordenada.find((l) => l.id === focadaId);
    if (!alvo) return;
    mapa.setView([alvo.lat!, alvo.lng!], Math.max(mapa.getZoom(), ZOOM_LOJA), { animate: true });
    marcadoresRef.current.get(focadaId)?.openPopup();
    // Reage à ESCOLHA (id + nonce), não a cada pino refinado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, focadaId, focarEm]);

  // --- Enquadramento --------------------------------------------------------
  useEffect(() => {
    const L = leafletRef.current;
    const mapa = mapaRef.current;
    if (!pronto || !L || !mapa || comCoordenada.length === 0) return;
    const bounds = L.latLngBounds(comCoordenada.map((l) => [l.lat!, l.lng!] as [number, number]));
    mapa.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    // `assinatura` é a dependência real (o conjunto de pinos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, assinatura, enquadrarEm]);

  // --- Você está aqui --------------------------------------------------------
  useEffect(() => {
    const L = leafletRef.current;
    const mapa = mapaRef.current;
    if (!pronto || !L || !mapa) return;
    origemRef.current?.remove();
    origemRef.current = null;
    if (!origem) return;
    origemRef.current = L.circleMarker([origem.lat, origem.lng], {
      radius: 8,
      color: "#ffffff",
      weight: 3,
      fillColor: "#2563eb",
      fillOpacity: 1,
    })
      .bindTooltip("Você está aqui", { direction: "top", offset: [0, -8] })
      .addTo(mapa);
  }, [pronto, origem]);

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
    void carregarGeoSP()
      .then((geo) => {
        if (cancelado || !mapaRef.current) return;
        zonasRef.current ??= L.layerGroup(
          geo.zonas.map((z) =>
            L.polygon(z.coords, {
              color: z.cor,
              weight: 2,
              opacity: 0.9,
              fillColor: z.cor,
              fillOpacity: 0.14,
            }).bindTooltip(z.nome, { sticky: true }),
          ),
        );
        metroRef.current ??= L.layerGroup(
          geo.metro.map((m) =>
            L.polyline(m.coords, { color: m.cor, weight: 3, opacity: 0.85 }).bindTooltip(m.nome, {
              sticky: true,
            }),
          ),
        );
        // Zonas por baixo de tudo; os pinos (DOM) ficam sempre por cima.
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

  const semCoordenada = lojas.length - comCoordenada.length;

  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-card", className)}>
      <div ref={containerRef} className="h-full w-full" aria-label="Mapa de lojas" />

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
          {semCoordenada} localizando pelo endereço — aparece na lista
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pino e popup — montados em DOM (nunca innerHTML: os textos vêm da planilha)
// ---------------------------------------------------------------------------

function iconeDaLoja(L: typeof LeafletNS, loja: Loja): LeafletNS.DivIcon {
  return L.divIcon({
    className: "",
    html: pinoDaLoja(loja),
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

function pinoDaLoja(loja: Loja): HTMLElement {
  const gota = document.createElement("div");
  // Gota girada 45°: a ponta (canto sem arredondar) aponta para o endereço.
  gota.className = cn(
    "flex h-[30px] w-[30px] -rotate-45 items-center justify-center rounded-[50%_50%_50%_0] border-[2.5px] border-white shadow-[0_2px_6px_rgba(0,0,0,0.4)]",
    // Posição estimada: pino apagado — o popup explica.
    !loja.exata && "opacity-75",
  );
  gota.style.background = corDaConstrutora(loja.construtora);
  const sigla = document.createElement("span");
  sigla.className = "rotate-45 text-[11px] font-extrabold leading-none text-white";
  sigla.textContent = iniciaisDaConstrutora(loja.construtora);
  gota.appendChild(sigla);
  return gota;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto != null) e.textContent = texto;
  return e;
}

function link(href: string, rotulo: string, classe: string): HTMLAnchorElement {
  const a = el("a", classe, rotulo);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

/** Cabeçalho do popup: foto da planilha > logo local da construtora > iniciais. */
function cabecalho(loja: Loja): HTMLElement {
  const cor = corDaConstrutora(loja.construtora);
  const caixa = el("div", "mb-2 flex h-20 items-center justify-center overflow-hidden rounded-lg");

  const iniciais = () => {
    caixa.replaceChildren(
      el("span", "text-2xl font-extrabold text-white", iniciaisDaConstrutora(loja.construtora)),
    );
    caixa.style.background = `linear-gradient(135deg, #092A4D, ${cor})`;
  };

  if (loja.fotoUrl) {
    const img = el("img", "h-full w-full object-cover");
    img.src = loja.fotoUrl;
    img.alt = `Stand ${loja.construtora} · ${loja.nome}`;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", iniciais, { once: true });
    caixa.appendChild(img);
    return caixa;
  }

  const logo = logoDaConstrutora(loja.construtora);
  if (!logo) {
    iniciais();
    return caixa;
  }
  // Logo branca some em fundo claro (e vice-versa): o manifesto diz o fundo.
  caixa.style.background = logo.fundo === "escuro" ? "#0D3B66" : "#ffffff";
  caixa.style.borderBottom = `4px solid ${cor}`;
  const img = el("img", "max-h-12 max-w-[70%] object-contain");
  img.src = urlLogo(logo);
  img.alt = loja.construtora;
  img.addEventListener("error", iniciais, { once: true });
  caixa.appendChild(img);
  return caixa;
}

function popupDaLoja(loja: Loja, enviar: (loja: Loja) => void): HTMLElement {
  const cor = corDaConstrutora(loja.construtora);
  const box = el("div", "w-[240px] text-[12.5px] text-slate-600");

  box.appendChild(cabecalho(loja));

  const badge = el(
    "span",
    "mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold text-white",
    loja.construtora,
  );
  badge.style.background = cor;
  box.appendChild(badge);

  box.appendChild(el("div", "text-[15px] font-extrabold leading-tight text-slate-900", loja.nome));
  box.appendChild(el("div", "mt-1", loja.endereco));
  box.appendChild(el("div", "", [loja.bairro, loja.zona].filter(Boolean).join(" · ")));
  if (loja.obs) box.appendChild(el("div", "mt-1 font-semibold text-[#0D3B66]", loja.obs));
  if (!loja.exata) {
    box.appendChild(
      el(
        "div",
        "mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11.5px] text-amber-800",
        "Posição aproximada no mapa. “Como chegar” leva ao endereço exato.",
      ),
    );
  }

  const botoes = el("div", "mt-2.5 grid grid-cols-2 gap-1.5");
  const base =
    "rounded-lg border px-1.5 py-2 text-center text-[12px] font-bold no-underline transition-colors";
  botoes.appendChild(
    link(
      linkComoChegar(loja),
      "Como chegar",
      cn(base, "border-[#C8973C] bg-[#E0A646] !text-[#092A4D] hover:bg-[#C8973C]"),
    ),
  );
  botoes.appendChild(
    link(
      linkFotosGoogle(loja),
      "Fotos no Google",
      cn(base, "border-[#0D3B66] bg-white !text-[#0D3B66] hover:bg-slate-50"),
    ),
  );
  const street = linkStreetView(loja);
  if (street) {
    botoes.appendChild(
      link(
        street,
        "Street View",
        cn(base, "border-[#0D3B66] bg-white !text-[#0D3B66] hover:bg-slate-50"),
      ),
    );
  }
  const enviarBtn = el(
    "button",
    cn(
      base,
      "cursor-pointer border-[#1f8f4e] bg-[#25D366] text-white hover:bg-[#1fb85a]",
      !street && "col-span-2",
    ),
    "Enviar ao cliente",
  );
  enviarBtn.type = "button";
  enviarBtn.addEventListener("click", () => enviar(loja));
  botoes.appendChild(enviarBtn);
  box.appendChild(botoes);

  return box;
}
