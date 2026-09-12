// Fiação do mapa de mercado. O Leaflet é mockado de propósito: quem está sob
// teste é o COMPONENTE (quando o mapa é criado, quando os pinos são refeitos,
// quando o enquadramento muda, o que vai dentro do popup), não a biblioteca —
// que além disso não roda em jsdom, porque o renderer de canvas precisa de um
// `getContext("2d")` de verdade.

import { render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkProjeto } from "./helpers/projeto";
import { mesclarMercado } from "@/lib/vitrine/mercado";
import { calcularPoderDeCompra, perfilClienteVazio } from "@/lib/vitrine/poder-de-compra";

type MarcadorFake = {
  opcoes: Record<string, unknown>;
  latlng: [number, number];
  tooltip?: string;
  popup?: () => HTMLElement;
};

const estado = {
  mapasCriados: 0,
  fitBounds: 0,
  marcadores: [] as MarcadorFake[],
  camadaLimpa: 0,
  camadasAdicionadas: [] as string[],
  aneis: 0,
};

vi.mock("leaflet", () => {
  const camadaPinos = {
    clearLayers() {
      estado.camadaLimpa += 1;
      estado.marcadores = [];
    },
    addLayer(m: MarcadorFake) {
      estado.marcadores.push(m);
    },
    addTo: () => camadaPinos,
  };

  const grupoDeCamadas = (rotulo: string) => {
    const grupo = {
      addTo() {
        estado.camadasAdicionadas.push(rotulo);
        return grupo;
      },
      remove() {},
      eachLayer() {},
    };
    return grupo;
  };

  const L = {
    map() {
      estado.mapasCriados += 1;
      const mapa = {
        setView: () => mapa,
        remove() {},
        fitBounds() {
          estado.fitBounds += 1;
        },
        invalidateSize() {},
        getZoom: () => 10,
        attributionControl: { setPrefix() {} },
      };
      return mapa;
    },
    tileLayer: () => ({ addTo() {} }),
    // Sem argumento é a camada de pinos; com argumento é zona ou metrô.
    layerGroup: (camadas?: unknown[]) =>
      camadas === undefined ? camadaPinos : grupoDeCamadas("geo"),
    // O marcador é o próprio registro: bindTooltip/bindPopup mutam o objeto que
    // já foi (ou será) empilhado na camada, como faz o Leaflet de verdade.
    circleMarker(latlng: [number, number], opcoes: Record<string, unknown>) {
      const marcador: MarcadorFake & {
        bindTooltip: (t: string) => typeof marcador;
        bindPopup: (fn: () => HTMLElement) => typeof marcador;
        bringToFront: () => void;
        addTo: () => typeof marcador;
        remove: () => void;
      } = {
        latlng,
        opcoes,
        bindTooltip(texto) {
          marcador.tooltip = texto;
          return marcador;
        },
        bindPopup(fn) {
          marcador.popup = fn;
          return marcador;
        },
        bringToFront() {},
        // O anel de destaque vai direto no mapa, não na camada de pinos.
        addTo() {
          estado.aneis += 1;
          return marcador;
        },
        remove() {},
      };
      return marcador;
    },
    polygon: () => ({ bindTooltip: () => ({}) }),
    polyline: () => ({ bindTooltip: () => ({}) }),
    latLngBounds: (pts: unknown[]) => pts,
  };
  return { ...L, default: L };
});

// O componente importa o CSS do Leaflet; jsdom não precisa dele.
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const { MercadoMap } = await import("@/components/vitrine/mercado-map");

const projeto = (over: Parameters<typeof mkProjeto>[0]) =>
  mkProjeto({ lat: -23.55, lng: -46.63, ...over });

const itensBase = mesclarMercado(
  [
    projeto({ id: "1", nome: "Barato", preco_a_partir: 180000 }),
    projeto({ id: "2", nome: "Caro", preco_a_partir: 900000 }),
  ],
  [],
);

beforeEach(() => {
  estado.mapasCriados = 0;
  estado.fitBounds = 0;
  estado.marcadores = [];
  estado.camadaLimpa = 0;
  estado.camadasAdicionadas = [];
  estado.aneis = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ zonas: [], metro: [] }) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const props = {
  poder: null,
  mostrarZonas: false,
  mostrarMetro: false,
  onAbrirFicha: () => {},
};

describe("<MercadoMap />", () => {
  it("cria o mapa uma vez só e desenha um pino por empreendimento com coordenada", async () => {
    render(<MercadoMap itens={itensBase} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));
    expect(estado.mapasCriados).toBe(1);
    expect(estado.marcadores.map((m) => m.tooltip)).toEqual(["Barato", "Caro"]);
  });

  it("ignora empreendimento sem coordenada e avisa quantos ficaram de fora", async () => {
    const comSemCoord = mesclarMercado(
      [projeto({ id: "1", nome: "Com" }), mkProjeto({ id: "2", nome: "Sem", lat: null })],
      [],
    );
    const { findByText } = render(<MercadoMap itens={comSemCoord} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(1));
    expect(await findByText(/1 sem localização/)).toBeInTheDocument();
  });

  it("refaz os pinos quando a lista filtrada muda, sem recriar o mapa", async () => {
    const { rerender } = render(<MercadoMap itens={itensBase} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));

    rerender(<MercadoMap itens={[itensBase[0]]} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(1));
    expect(estado.mapasCriados).toBe(1);
    expect(estado.camadaLimpa).toBeGreaterThan(1);
  });

  it("não reenquadra o mapa quando só a identidade do callback muda", async () => {
    const { rerender } = render(<MercadoMap itens={itensBase} {...props} />);
    await waitFor(() => expect(estado.fitBounds).toBe(1));

    rerender(<MercadoMap itens={itensBase} {...props} onAbrirFicha={() => {}} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));
    expect(estado.fitBounds).toBe(1);
  });

  it("reenquadra quando o usuário pede", async () => {
    const { rerender } = render(<MercadoMap itens={itensBase} {...props} enquadrarEm={0} />);
    await waitFor(() => expect(estado.fitBounds).toBe(1));
    rerender(<MercadoMap itens={itensBase} {...props} enquadrarEm={1} />);
    await waitFor(() => expect(estado.fitBounds).toBe(2));
  });

  it("só busca as camadas de zona/metrô quando alguma está ligada", async () => {
    const { rerender } = render(<MercadoMap itens={itensBase} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));
    expect(fetch).not.toHaveBeenCalled();

    rerender(<MercadoMap itens={itensBase} {...props} mostrarMetro />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/mercado-geo.json"));
  });

  it("destaca em dourado quem fecha e apaga quem não fecha", async () => {
    const poder = calcularPoderDeCompra({ ...perfilClienteVazio, renda: 3000 });
    render(<MercadoMap itens={itensBase} {...props} poder={poder} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));

    const porNome = (n: string) => estado.marcadores.find((m) => m.tooltip === n)!;
    const barato = porNome("Barato");
    const caro = porNome("Caro");
    expect(barato.opcoes.fillColor).toBe("#E0A646");
    expect(barato.opcoes.radius).toBe(9);
    expect(caro.opcoes.fillColor).toBe("#B7BEC7");
    expect(caro.opcoes.fillOpacity).toBeLessThan(1);
    // Quem fecha é desenhado por último, para ficar por cima no canvas.
    expect(estado.marcadores.at(-1)!.tooltip).toBe("Barato");
  });

  it("destaca no mapa o item sob o cursor sem refazer os pinos", async () => {
    const { rerender } = render(<MercadoMap itens={itensBase} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(2));
    const limpezasAntes = estado.camadaLimpa;

    rerender(<MercadoMap itens={itensBase} {...props} destacadoId={itensBase[0].id} />);
    await waitFor(() => expect(estado.aneis).toBe(1));
    expect(estado.camadaLimpa).toBe(limpezasAntes);
  });

  it("monta o popup como texto, sem interpretar HTML vindo da planilha", async () => {
    const malicioso = mesclarMercado(
      [],
      [
        {
          construtora: "<img src=x onerror=alert(1)>",
          nome: "<script>alert(1)</script>",
          status: "Em obras",
          cidade: null,
          regiao: null,
          endereco: null,
          lat: -23.5,
          lng: -46.6,
          precoMin: 200000,
          precoMax: null,
          m2min: null,
          m2max: null,
          bookUrl: null,
          tabelaUrl: null,
          atualizadoEm: null,
        },
      ],
    );
    render(<MercadoMap itens={malicioso} {...props} />);
    await waitFor(() => expect(estado.marcadores).toHaveLength(1));

    const popup = estado.marcadores[0].popup!();
    expect(popup.querySelector("script")).toBeNull();
    expect(popup.querySelector("img")).toBeNull();
    expect(popup.textContent).toContain("<script>alert(1)</script>");
    expect(popup.textContent).toContain("Fora do catálogo do CRM");
  });
});
