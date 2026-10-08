// Fiação do Mapa de Lojas. O Leaflet é mockado como no teste do MercadoMap:
// quem está sob teste é o COMPONENTE — em especial a atualização incremental
// dos pinos (o refinamento de posição não pode fechar o popup aberto) e o
// popup montado como texto.

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Loja } from "@/lib/lojas/lojas";

type MarcadorFake = {
  latlng: [number, number];
  icones: number;
  popup?: () => HTMLElement;
  cliques: (() => void)[];
  popupAberto: boolean;
};

const estado = {
  mapasCriados: 0,
  fitBounds: 0,
  setView: [] as [number, number][],
  marcadores: [] as MarcadorFake[],
  removidos: 0,
};

vi.mock("leaflet", () => {
  const camadaPinos = {
    addLayer(m: MarcadorFake) {
      estado.marcadores.push(m);
    },
    removeLayer(m: MarcadorFake) {
      estado.removidos += 1;
      estado.marcadores = estado.marcadores.filter((x) => x !== m);
    },
    addTo: () => camadaPinos,
  };

  const L = {
    map() {
      estado.mapasCriados += 1;
      const mapa = {
        setView(c: [number, number]) {
          estado.setView.push(c);
          return mapa;
        },
        remove() {},
        fitBounds() {
          estado.fitBounds += 1;
        },
        invalidateSize() {},
        getZoom: () => 11,
        attributionControl: { setPrefix() {} },
      };
      return mapa;
    },
    tileLayer: () => ({ addTo() {} }),
    layerGroup: (camadas?: unknown[]) =>
      camadas === undefined
        ? camadaPinos
        : { addTo: () => ({ eachLayer() {} }), remove() {}, eachLayer() {} },
    divIcon: (o: { html: HTMLElement }) => o,
    marker(latlng: [number, number]) {
      const m: MarcadorFake & Record<string, unknown> = {
        latlng,
        icones: 1,
        cliques: [],
        popupAberto: false,
        bindPopup(fn: () => HTMLElement) {
          m.popup = fn;
          return m;
        },
        on(_ev: string, fn: () => void) {
          m.cliques.push(fn);
          return m;
        },
        getLatLng: () => ({ lat: m.latlng[0], lng: m.latlng[1] }),
        setLatLng(p: [number, number]) {
          m.latlng = p;
          return m;
        },
        setIcon() {
          m.icones += 1;
          return m;
        },
        openPopup() {
          m.popupAberto = true;
          return m;
        },
      };
      return m;
    },
    circleMarker: () => {
      const c = { bindTooltip: () => c, addTo: () => c, remove() {} };
      return c;
    },
    polygon: () => ({ bindTooltip: () => ({}) }),
    polyline: () => ({ bindTooltip: () => ({}) }),
    latLngBounds: (pts: unknown[]) => pts,
  };
  return { ...L, default: L };
});

vi.mock("leaflet/dist/leaflet.css", () => ({}));

const { LojasMap } = await import("@/components/lojas/lojas-map");

const loja = (over: Partial<Loja>): Loja => ({
  id: "a",
  construtora: "Cury",
  nome: "Cambuci",
  endereco: "Rua Clímaco Barbosa, 750",
  bairro: "Cambuci",
  zona: "Centro",
  lat: -23.57,
  lng: -46.624,
  exata: false,
  fotoUrl: null,
  obs: null,
  ...over,
});

const A = loja({ id: "a" });
const B = loja({ id: "b", construtora: "Econ", nome: "Interlagos", lat: -23.7, lng: -46.69 });

const props = {
  mostrarZonas: false,
  mostrarMetro: false,
  onSelecionar: () => {},
  onEnviar: () => {},
};

beforeEach(() => {
  estado.mapasCriados = 0;
  estado.fitBounds = 0;
  estado.setView = [];
  estado.marcadores = [];
  estado.removidos = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ zonas: [], metro: [] }) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<LojasMap />", () => {
  it("cria o mapa uma vez e um pino por loja com posição", async () => {
    const semPos = loja({ id: "c", lat: null, lng: null });
    const { findByText } = render(<LojasMap lojas={[A, B, semPos]} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));
    expect(estado.mapasCriados).toBe(1);
    expect(await findByText(/1 localizando pelo endereço/)).toBeInTheDocument();
  });

  it("posição refinada MOVE o pino existente — não recria (o popup aberto fica)", async () => {
    const { rerender } = render(<LojasMap lojas={[A, B]} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));
    const pinoA = estado.marcadores[0];

    const refinada = { ...A, lat: -23.5701, lng: -46.6249, exata: true };
    rerender(<LojasMap lojas={[refinada, B]} {...props} />);

    await waitFor(() => expect(pinoA.latlng).toEqual([-23.5701, -46.6249]));
    expect(estado.marcadores[0]).toBe(pinoA);
    expect(estado.removidos).toBe(0);
    // Estimada → exata muda a cara do pino (deixa de ser apagado).
    expect(pinoA.icones).toBe(2);
    // E o mapa não reenquadra a cada endereço achado.
    expect(estado.fitBounds).toBe(1);
  });

  it("filtro que tira uma loja remove só o pino dela", async () => {
    const { rerender } = render(<LojasMap lojas={[A, B]} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));
    rerender(<LojasMap lojas={[B]} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(1));
    expect(estado.removidos).toBe(1);
    expect(estado.fitBounds).toBe(2);
  });

  it("escolher na lista vai até o stand e abre o popup — de novo a cada escolha", async () => {
    const { rerender } = render(<LojasMap lojas={[A, B]} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));

    rerender(<LojasMap lojas={[A, B]} {...props} focadaId="b" focarEm={1} />);
    await waitFor(() => expect(estado.marcadores[1].popupAberto).toBe(true));
    expect(estado.setView.at(-1)).toEqual([B.lat, B.lng]);

    const antes = estado.setView.length;
    rerender(<LojasMap lojas={[A, B]} {...props} focadaId="b" focarEm={2} />);
    await waitFor(() => expect(estado.setView.length).toBe(antes + 1));
  });

  it("clique no pino avisa a página qual loja foi escolhida", async () => {
    const onSelecionar = vi.fn();
    render(<LojasMap lojas={[A, B]} {...props} onSelecionar={onSelecionar} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));
    estado.marcadores[1].cliques.forEach((fn) => fn());
    expect(onSelecionar).toHaveBeenCalledWith("b");
  });

  it("popup: texto puro, rota pelo endereço e Enviar ao cliente", async () => {
    const onEnviar = vi.fn();
    const malicioso = loja({
      id: "m",
      construtora: '<img src=x onerror="alert(1)">',
      nome: "<b>Stand</b>",
      obs: "Decorado de 2 dorm",
    });
    render(<LojasMap lojas={[malicioso]} {...props} onEnviar={onEnviar} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(1));

    const popup = estado.marcadores[0].popup!();
    expect(popup.querySelector("[onerror]")).toBeNull();
    expect(popup.querySelector("b")).toBeNull();
    expect(popup.textContent).toContain("<b>Stand</b>");
    expect(popup.textContent).toContain("Decorado de 2 dorm");
    expect(popup.textContent).toContain("Posição aproximada");

    const rota = [...popup.querySelectorAll("a")].find((a) => a.textContent === "Como chegar")!;
    expect(rota.getAttribute("href")).toContain("destination=");
    expect(rota.getAttribute("rel")).toBe("noopener noreferrer");

    const enviar = [...popup.querySelectorAll("button")].find(
      (b) => b.textContent === "Enviar ao cliente",
    )!;
    enviar.click();
    expect(onEnviar).toHaveBeenCalledWith(malicioso);
  });

  it("popup de stand com posição conferida não mostra o aviso de aproximada", async () => {
    render(<LojasMap lojas={[{ ...A, exata: true }]} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(1));
    expect(estado.marcadores[0].popup!().textContent).not.toContain("Posição aproximada");
  });
});
