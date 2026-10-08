// Domínio do Mapa de Lojas: leitura da planilha de stands, base de segurança,
// filtros, distância, links para o cliente e as regras do refinamento de
// posição pelo endereço.

import { describe, expect, it } from "vitest";
import {
  aceitarGeocodificacao,
  aplicarCacheGeo,
  chaveGeo,
  construtorasDasLojas,
  corDaConstrutora,
  distanciaDaLoja,
  distanciaKm,
  enderecoCompleto,
  filtrarLojas,
  filtrosLojasVazios,
  formatarDistancia,
  iniciaisDaConstrutora,
  lerCacheGeo,
  linkComoChegar,
  linkFotosGoogle,
  linkStreetView,
  LOJAS_BASE,
  normalizarEndereco,
  ordenarPorDistancia,
  rowsToLojas,
  urlGeocodificacao,
  zonasDasLojas,
  type Loja,
} from "@/lib/lojas/lojas";
import { mensagemLoja } from "@/lib/whatsapp";

const CABECALHO = [
  "Construtora",
  "Nome",
  "Endereço",
  "Bairro",
  "Zona",
  "Latitude",
  "Longitude",
  "Foto",
  "Ativo",
  "Obs",
];

const loja = (over: Partial<Loja> = {}): Loja => ({
  id: "x",
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

describe("base de segurança", () => {
  it("traz os 45 stands do mapa standalone, todos com posição estimada e id único", () => {
    expect(LOJAS_BASE).toHaveLength(45);
    expect(new Set(LOJAS_BASE.map((l) => l.id)).size).toBe(45);
    expect(LOJAS_BASE.every((l) => l.lat != null && l.lng != null)).toBe(true);
    // Estimada até o navegador achar o endereço — nunca "exata" de nascença.
    expect(LOJAS_BASE.some((l) => l.exata)).toBe(false);
  });

  it("preserva a observação dos stands da Longitude (decorado ou só atendimento)", () => {
    const perus = LOJAS_BASE.find(
      (l) => l.construtora.startsWith("Longitude") && l.nome === "Perus",
    );
    expect(perus?.obs).toBe("Sem decorado, somente atendimento");
  });
});

describe("rowsToLojas (planilha)", () => {
  it("pula o cabeçalho, linhas sem construtora/endereço e stands inativos", () => {
    const lojas = rowsToLojas([
      CABECALHO,
      ["Cury", "Cambuci", "Rua Clímaco Barbosa, 750", "Cambuci", "Centro", "", "", "", "", ""],
      ["", "Sem construtora", "Rua X, 1", "Bairro", "Zona Sul"],
      ["Econ", "Sem endereço", "", "Bairro", "Zona Sul"],
      ["Riva", "Fechou", "Rua Y, 2", "Bairro", "Zona Sul", "", "", "", "Não", ""],
      ["Riva", "Fechou 2", "Rua Z, 3", "Bairro", "Zona Sul", "", "", "", "nao", ""],
    ]);
    expect(lojas.map((l) => l.nome)).toEqual(["Cambuci"]);
  });

  it("aceita coordenada com vírgula decimal e marca a posição como exata", () => {
    const [l] = rowsToLojas([
      [
        "Trisul",
        "Elev Saúde",
        "Av. Miguel Estefano, 72",
        "Saúde",
        "Zona Sul",
        "-23,6131",
        "-46,6372",
      ],
    ]);
    expect(l.lat).toBeCloseTo(-23.6131);
    expect(l.lng).toBeCloseTo(-46.6372);
    expect(l.exata).toBe(true);
  });

  it("sem coordenada, herda a ESTIMATIVA do mesmo endereço na base (tolerando Av./Avenida e complemento)", () => {
    const [l] = rowsToLojas([
      ["Cavazani", "Urbano First", "Avenida Aricanduva, 5555", "Aricanduva", "Zona Leste"],
    ]);
    const daBase = LOJAS_BASE.find((b) => b.endereco.startsWith("Av. Aricanduva, 5555"))!;
    expect([l.lat, l.lng]).toEqual([daBase.lat, daBase.lng]);
    expect(l.exata).toBe(false);
  });

  it("sem coordenada e sem par na base, entra só na lista (lat/lng nulos)", () => {
    const [l] = rowsToLojas([["Vibra", "Novo stand", "Rua Inédita, 10", "Mooca", "Zona Leste"]]);
    expect(l.lat).toBeNull();
    expect(l.lng).toBeNull();
  });

  it("completa nome e zona vazios e só aceita foto http(s)", () => {
    const [a, b] = rowsToLojas([
      ["Cury", "", "Rua A, 1", "Mooca", "", "", "", "javascript:alert(1)"],
      ["Cury", "B", "Rua B, 2", "Brás", "Centro", "", "", "https://exemplo.com/foto.jpg"],
    ]);
    expect(a.nome).toBe("Mooca");
    expect(a.zona).toBe("Outras");
    expect(a.fotoUrl).toBeNull();
    expect(b.fotoUrl).toBe("https://exemplo.com/foto.jpg");
  });

  it("dá id estável por construtora + endereço e desempata repetidos", () => {
    const lojas = rowsToLojas([
      ["Cury", "A", "Rua Clímaco Barbosa, 750", "Cambuci", "Centro"],
      ["Cury", "B", "Rua Clímaco Barbosa, 750", "Cambuci", "Centro"],
    ]);
    expect(lojas.map((l) => l.id)).toEqual([
      "cury-rua-climaco-barbosa-750",
      "cury-rua-climaco-barbosa-750-2",
    ]);
  });
});

describe("filtros e ordem", () => {
  const lojas = [
    loja({ id: "1", construtora: "Cury", nome: "Água Branca", bairro: "Lapa", zona: "Zona Oeste" }),
    loja({ id: "2", construtora: "Econ", nome: "Interlagos", zona: "Zona Sul" }),
    loja({ id: "3", construtora: "Cury", nome: "Santo Amaro", zona: "Zona Sul" }),
    loja({ id: "4", construtora: "Cavazani", nome: "Guarulhos", zona: "Grande SP" }),
  ];

  it("busca ignorando acento e caixa", () => {
    const r = filtrarLojas(lojas, { ...filtrosLojasVazios, q: "AGUA branca" });
    expect(r.map((l) => l.id)).toEqual(["1"]);
  });

  it("combina construtora e zona", () => {
    const r = filtrarLojas(lojas, { q: "", construtora: "Cury", zona: "Zona Sul" });
    expect(r.map((l) => l.id)).toEqual(["3"]);
  });

  it("lista construtoras com contagem, em ordem alfabética", () => {
    expect(construtorasDasLojas(lojas)).toEqual([
      { construtora: "Cavazani", total: 1 },
      { construtora: "Cury", total: 2 },
      { construtora: "Econ", total: 1 },
    ]);
  });

  it("ordena as zonas como o standalone, com as desconhecidas no fim", () => {
    const comOutra = [...lojas, loja({ id: "5", zona: "Litoral" })];
    expect(zonasDasLojas(comOutra)).toEqual(["Zona Sul", "Zona Oeste", "Grande SP", "Litoral"]);
  });
});

describe("distância", () => {
  // Praça da Sé → Av. Paulista (MASP): ~2,7 km em linha reta.
  const se = { lat: -23.5503, lng: -46.6339 };
  const masp = { lat: -23.5614, lng: -46.6559 };

  it("calcula a distância em linha reta", () => {
    expect(distanciaKm(se, masp)).toBeGreaterThan(2.4);
    expect(distanciaKm(se, masp)).toBeLessThan(2.8);
  });

  it("ordena do mais perto ao mais longe, com quem não tem posição no fim", () => {
    const perto = loja({ id: "perto", lat: masp.lat, lng: masp.lng });
    const longe = loja({ id: "longe", lat: -23.7, lng: -46.7 });
    const semPos = loja({ id: "sem", lat: null, lng: null });
    expect(ordenarPorDistancia([semPos, longe, perto], se).map((l) => l.id)).toEqual([
      "perto",
      "longe",
      "sem",
    ]);
    // Sem origem, a ordem é a da planilha.
    expect(ordenarPorDistancia([semPos, longe, perto], null).map((l) => l.id)).toEqual([
      "sem",
      "longe",
      "perto",
    ]);
    expect(distanciaDaLoja(semPos, se)).toBeNull();
  });

  it("formata metros, km com uma casa e km inteiros", () => {
    expect(formatarDistancia(0.234)).toBe("230 m");
    expect(formatarDistancia(2.345)).toBe("2,3 km");
    expect(formatarDistancia(14.6)).toBe("15 km");
  });
});

describe("cor e sigla do pino", () => {
  it("mantém as cores do standalone, casando o nome da marca sem sufixo", () => {
    expect(corDaConstrutora("Cury")).toBe("#e67e22");
    expect(corDaConstrutora("Direcional Engenharia")).toBe("#2c3e50");
    expect(corDaConstrutora("Vitta Residencial")).toBe("#8e44ad");
    expect(corDaConstrutora("Longitude Incorporadora")).toBe("#6d4c41");
  });

  it("dá cor determinística a construtora nova", () => {
    const a = corDaConstrutora("Construtora Nova");
    expect(corDaConstrutora("Construtora Nova")).toBe(a);
    expect(a).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("monta as iniciais", () => {
    expect(iniciaisDaConstrutora("Longitude Incorporadora")).toBe("LI");
    expect(iniciaisDaConstrutora("Cury")).toBe("CU");
    expect(iniciaisDaConstrutora("  ")).toBe("?");
  });
});

describe("links para o cliente", () => {
  it("rota pelo ENDEREÇO (o pino pode ser estimado)", () => {
    const url = new URL(linkComoChegar(loja()));
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("destination")).toBe(
      "Rua Clímaco Barbosa, 750, Cambuci, São Paulo, SP",
    );
  });

  it("na Grande SP não força a capital no endereço", () => {
    expect(
      enderecoCompleto(loja({ bairro: "Jd. Vila Galvão, Guarulhos", zona: "Grande SP" })),
    ).toBe("Rua Clímaco Barbosa, 750, Jd. Vila Galvão, Guarulhos, SP");
  });

  it("busca o stand no Google Maps e só oferece Street View com coordenada", () => {
    expect(new URL(linkFotosGoogle(loja())).searchParams.get("query")).toContain(
      "Cury stand de vendas",
    );
    expect(linkStreetView(loja())).toContain("viewpoint=-23.57,-46.624");
    expect(linkStreetView(loja({ lat: null, lng: null }))).toBeNull();
  });

  it("monta a mensagem de WhatsApp com endereço, rota e a observação do stand", () => {
    const l = loja({
      construtora: "Longitude",
      nome: "Perus",
      obs: "Sem decorado, somente atendimento",
    });
    const msg = mensagemLoja({ ...l, rotaUrl: "https://rota" });
    expect(msg).toContain("stand de vendas da Longitude (Perus)");
    expect(msg).toContain("Rua Clímaco Barbosa, 750 — Cambuci");
    expect(msg).toContain("Como chegar: https://rota");
    expect(msg).toContain("Bom saber: Sem decorado, somente atendimento.");
    expect(mensagemLoja({ ...loja(), rotaUrl: "https://rota" })).not.toContain("Bom saber");
  });
});

describe("refinamento de posição", () => {
  it("normaliza abreviação e corta o complemento do endereço", () => {
    expect(
      normalizarEndereco("Av. Aricanduva, 5555 – Shopping Aricanduva, ao lado da loja TIM"),
    ).toBe("Avenida Aricanduva, 5555");
    expect(normalizarEndereco("R. João Alfredo, 593")).toBe("Rua João Alfredo, 593");
    expect(normalizarEndereco("Estr. do Pêssego, 157")).toBe("Estrada do Pêssego, 157");
    expect(normalizarEndereco("Avenida Jaguaré, 1487")).toBe("Avenida Jaguaré, 1487");
  });

  it("consulta o Nominatim com o endereço normalizado, restrito ao Brasil", () => {
    const url = new URL(urlGeocodificacao(loja({ endereco: "Av. Cursino, 5000" })));
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("countrycodes")).toBe("br");
    expect(url.searchParams.get("q")).toBe("Avenida Cursino, 5000, Cambuci, São Paulo");
  });

  it("aceita resultado a menos de 5 km da estimativa e recusa homônimo distante", () => {
    const l = loja();
    expect(aceitarGeocodificacao(l, { lat: -23.571, lng: -46.626 })).toBe(true);
    // "Rua Clímaco Barbosa" de outra cidade: recusado.
    expect(aceitarGeocodificacao(l, { lat: -22.9, lng: -47.06 })).toBe(false);
  });

  it("sem estimativa, aceita qualquer ponto dentro da Grande SP", () => {
    const sem = loja({ lat: null, lng: null });
    expect(aceitarGeocodificacao(sem, { lat: -23.6, lng: -46.7 })).toBe(true);
    expect(aceitarGeocodificacao(sem, { lat: -22.9, lng: -43.2 })).toBe(false);
  });

  it("aplica o cache só em posição estimada — coordenada da planilha manda", () => {
    const estimada = loja({ id: "a" });
    const daPlanilha = loja({ id: "b", endereco: "Rua B, 1", lat: -23.5, lng: -46.6, exata: true });
    const cache = {
      [chaveGeo(estimada)]: [-23.5701, -46.6249] as [number, number],
      [chaveGeo(daPlanilha)]: [-10, -10] as [number, number],
    };
    const [a, b] = aplicarCacheGeo([estimada, daPlanilha], cache);
    expect([a.lat, a.lng, a.exata]).toEqual([-23.5701, -46.6249, true]);
    expect([b.lat, b.lng]).toEqual([-23.5, -46.6]);
  });

  it("lê o cache tolerando lixo no localStorage", () => {
    expect(lerCacheGeo(null)).toEqual({});
    expect(lerCacheGeo("{quebrado")).toEqual({});
    expect(lerCacheGeo(JSON.stringify({ ok: [-23.5, -46.6], ruim: "x", curto: [1] }))).toEqual({
      ok: [-23.5, -46.6],
    });
  });
});
