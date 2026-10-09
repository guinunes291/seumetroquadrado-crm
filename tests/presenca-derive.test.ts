// Presença por filial — a parte de TELA (a regra em si é testada no banco,
// tests/db/presenca-filial.test.ts). Aqui: o que o corretor lê no card, a
// faixa do topo, as colunas do quadro da gestão, a busca de coordenadas da
// filial e o interruptor de presença travado nas filas.
import { describe, expect, it } from "vitest";
import {
  lerGeocodificacao,
  linkMapa,
  urlGeocodificacaoFilial,
} from "@/features/presenca/filiais-geo";
import { presencaObrigatoria } from "@/lib/distribuicao";
import {
  agruparQuadro,
  coordenadasTexto,
  distanciaLabel,
  enderecoCurto,
  localizacaoLabel,
  motivoPresencaLabel,
  nomeDoMes,
  parseCoordenadas,
  parseMinhaPresenca,
  precisaCheckin,
  resumoQuadro,
  rotuloLocal,
  situacaoHoje,
  type MinhaPresenca,
  type PresencaHojeRow,
} from "@/features/presenca/presenca-derive";

const FILIAIS = [
  { slug: "barra-funda", nome: "Barra Funda" },
  { slug: "liberdade", nome: "Liberdade" },
  { slug: "belem", nome: "Belém" },
];

function presenca(over: Partial<MinhaPresenca> = {}): MinhaPresenca {
  return {
    dia: "2026-10-13",
    presente: false,
    mes_referencia: "2026-09-01",
    vendas_mes_anterior: 2,
    vendas_minimas: 3,
    casa_liberada: false,
    exige_localizacao: false,
    checkin: null,
    filiais: [],
    ...over,
  };
}

function checkin(over: Partial<NonNullable<MinhaPresenca["checkin"]>> = {}) {
  return {
    id: "c1",
    modo: "loja" as const,
    filial_slug: "barra-funda",
    filial_nome: "Barra Funda",
    apto_roleta: true,
    motivo: null,
    localizacao: null,
    distancia_m: null,
    precisao_m: null,
    origem: "corretor" as const,
    criado_em: "2026-10-13T11:02:00Z",
    encerrado_em: null,
    ...over,
  };
}

function linha(over: Partial<PresencaHojeRow>): PresencaHojeRow {
  return {
    corretor_id: over.nome ?? "x",
    nome: "Fulano",
    avatar_url: null,
    presente: false,
    modo: null,
    filial_slug: null,
    filial_nome: null,
    apto_roleta: null,
    motivo: null,
    localizacao: null,
    distancia_m: null,
    origem: null,
    checkin_em: null,
    encerrado_em: null,
    vendas_mes_anterior: 0,
    vendas_minimas: 3,
    ...over,
  };
}

describe("parseMinhaPresenca", () => {
  it("lê o JSON da RPC e tolera campos ausentes", () => {
    const p = parseMinhaPresenca({
      dia: "2026-10-13",
      presente: true,
      mes_referencia: "2026-09-01",
      vendas_mes_anterior: "3",
      vendas_minimas: 3,
      casa_liberada: true,
      checkin: { id: "c", modo: "casa", apto_roleta: true, origem: "corretor", criado_em: "x" },
    });
    expect(p.vendas_mes_anterior).toBe(3);
    expect(p.mes_referencia).toBe("2026-09-01");
    expect(p.checkin).toMatchObject({ modo: "casa", filial_slug: null, encerrado_em: null });
    expect(p.filiais).toEqual([]);
    expect(parseMinhaPresenca(null)).toMatchObject({
      presente: false,
      checkin: null,
      vendas_minimas: 3,
    });
  });
});

describe("o que o corretor lê no card", () => {
  it("sem check-in: avisa que não recebe leads", () => {
    const s = situacaoHoje(presenca());
    expect(s.estado).toBe("sem_checkin");
    expect(s.intent).toBe("warning");
  });

  it("na filial: na roleta", () => {
    const s = situacaoHoje(presenca({ presente: true, checkin: checkin() }));
    expect(s).toMatchObject({
      estado: "na_roleta",
      titulo: "Barra Funda — na roleta",
      intent: "success",
    });
  });

  it("em outubro, em casa com 2 de 3 vendas em setembro: fora da roleta, com a conta e o caminho (filial)", () => {
    const s = situacaoHoje(
      presenca({
        checkin: checkin({
          modo: "casa",
          filial_slug: null,
          filial_nome: null,
          apto_roleta: false,
          motivo: "casa_abaixo_minimo_vendas",
        }),
      }),
    );
    expect(s.estado).toBe("fora_da_roleta");
    expect(s.titulo).toBe("Em casa — fora da roleta");
    expect(s.detalhe).toBe(
      "Em casa, a roleta só libera com 3 vendas aprovadas em setembro — você teve 2. " +
        "Para receber leads hoje, faça o check-in numa filial.",
    );
  });

  it("em casa com a meta batida: na roleta, dizendo por quê", () => {
    const s = situacaoHoje(
      presenca({
        presente: true,
        vendas_mes_anterior: 4,
        casa_liberada: true,
        checkin: checkin({ modo: "casa", filial_slug: null, filial_nome: null }),
      }),
    );
    expect(s.estado).toBe("na_roleta");
    expect(s.detalhe).toBe(
      "Você teve 4 vendas aprovadas em setembro: pode receber leads trabalhando de casa.",
    );
  });

  it("presença encerrada: chama de volta para o check-in", () => {
    const s = situacaoHoje(
      presenca({ checkin: checkin({ encerrado_em: "2026-10-13T20:00:00Z" }) }),
    );
    expect(s.estado).toBe("encerrado");
  });

  it("mês por extenso (janeiro olha dezembro), local, motivo singular e endereço curto", () => {
    expect(nomeDoMes("2025-12-01")).toBe("dezembro");
    expect(nomeDoMes("")).toBe("o mês anterior");
    expect(rotuloLocal("liberado_gestao", null)).toBe("Liberado pela gestão");
    expect(rotuloLocal(null, null)).toBe("Sem check-in");
    expect(
      motivoPresencaLabel("casa_abaixo_minimo_vendas", {
        vendas_mes_anterior: 0,
        vendas_minimas: 1,
      }),
    ).toContain("com 1 venda aprovada no mês anterior — você teve 0");
    expect(
      enderecoCurto("Av. Marquês de São Vicente, 1619 - Barra Funda, São Paulo - SP, 01139-003"),
    ).toBe("Av. Marquês de São Vicente, 1619");
    expect(enderecoCurto(null)).toBeNull();
  });
});

describe("faixa do topo", () => {
  it("aparece sem check-in ou com presença encerrada; some com check-in aberto (mesmo fora da roleta)", () => {
    expect(precisaCheckin(undefined)).toBe(false);
    expect(precisaCheckin(presenca())).toBe(true);
    expect(precisaCheckin(presenca({ checkin: checkin({ encerrado_em: "x" }) }))).toBe(true);
    expect(
      precisaCheckin(presenca({ checkin: checkin({ modo: "casa", apto_roleta: false }) })),
    ).toBe(false);
  });
});

describe("evidência de localização", () => {
  it("distância legível e tom por situação", () => {
    expect(distanciaLabel(84)).toBe("80 m");
    expect(distanciaLabel(4230)).toBe("4,2 km");
    expect(distanciaLabel(12600)).toBe("13 km");
    expect(localizacaoLabel("confirmada", 120)).toEqual({
      texto: "Na filial (120 m)",
      intent: "success",
    });
    expect(localizacaoLabel("fora_do_raio", 4230)).toEqual({
      texto: "A 4,2 km da filial",
      intent: "danger",
    });
    expect(localizacaoLabel(null, null)).toBeNull();
  });
});

describe("quadro da gestão", () => {
  const rows = [
    linha({
      nome: "Ana",
      modo: "loja",
      filial_slug: "barra-funda",
      filial_nome: "Barra Funda",
      presente: true,
      apto_roleta: true,
    }),
    linha({
      nome: "Bia",
      modo: "loja",
      filial_slug: "barra-funda",
      filial_nome: "Barra Funda",
      presente: false,
      apto_roleta: false,
      motivo: "fora_da_filial",
    }),
    linha({
      nome: "Caio",
      modo: "casa",
      presente: false,
      apto_roleta: false,
      motivo: "casa_abaixo_minimo_vendas",
    }),
    linha({
      nome: "Duda",
      modo: "casa",
      presente: true,
      apto_roleta: true,
      vendas_mes_anterior: 3,
    }),
    linha({ nome: "Edu", modo: "liberado_gestao", presente: true, apto_roleta: true }),
    linha({ nome: "Fábio" }),
    linha({
      nome: "Gil",
      modo: "loja",
      filial_slug: "belem",
      filial_nome: "Belém",
      encerrado_em: "2026-10-13T20:00:00Z",
    }),
    linha({
      nome: "Hugo",
      modo: "loja",
      filial_slug: "paulista",
      filial_nome: "Paulista",
      presente: true,
      apto_roleta: true,
    }),
  ];

  it("uma coluna por filial (mesmo vazia, na ordem), filial desativada não some, depois casa/gestão/sem check-in", () => {
    const cols = agruparQuadro(rows, FILIAIS);
    expect(cols.map((c) => [c.titulo, c.corretores.map((r) => r.nome)])).toEqual([
      ["Barra Funda", ["Ana", "Bia"]],
      ["Liberdade", []],
      ["Belém", []],
      ["Paulista", ["Hugo"]],
      ["Em casa", ["Duda", "Caio"]],
      ["Liberados pela gestão", ["Edu"]],
      ["Sem check-in", ["Fábio", "Gil"]],
    ]);
  });

  it("resumo: na roleta, no plantão, em casa fora da roleta, sem check-in", () => {
    expect(resumoQuadro(rows)).toEqual({
      naRoleta: 4,
      naFilial: 3,
      emCasaForaDaRoleta: 1,
      semCheckin: 2,
    });
  });
});

describe("coordenadas coladas do Google Maps", () => {
  it("aceita ponto ou vírgula decimal e recusa o resto", () => {
    expect(parseCoordenadas("-23.5260, -46.6660")).toEqual({ lat: -23.526, lng: -46.666 });
    expect(parseCoordenadas("-23,5260 -46,6660")).toEqual({ lat: -23.526, lng: -46.666 });
    expect(parseCoordenadas("-23.5260,-46.6660")).toEqual({ lat: -23.526, lng: -46.666 });
    expect(parseCoordenadas("")).toBeNull();
    expect(parseCoordenadas("Rua X, 100")).toBeNull();
    expect(parseCoordenadas("-123.5, -46.6")).toBeNull();
    expect(coordenadasTexto(-23.526, -46.666)).toBe("-23.526, -46.666");
    expect(coordenadasTexto(null, null)).toBe("");
  });
});

describe("coordenadas da filial pelo endereço (no navegador da gestão)", () => {
  it("busca só rua, número e cidade, com 'Av.' por extenso", () => {
    const url = new URL(
      urlGeocodificacaoFilial(
        "Av. Marquês de São Vicente, 1619 - Barra Funda, São Paulo - SP, 01139-003",
      ),
    );
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("q")).toBe("Avenida Marquês de São Vicente, 1619, São Paulo");
    expect(url.searchParams.get("countrycodes")).toBe("br");
  });

  it("achou o número = exato; achou só a avenida = pede conferência; fora de SP = descarta", () => {
    expect(
      lerGeocodificacao([
        { lat: "-23.5193", lon: "-46.6731", addresstype: "building", category: "building" },
      ]),
    ).toEqual({ lat: -23.5193, lng: -46.6731, exato: true });
    expect(
      lerGeocodificacao([
        { lat: "-23.5191", lon: "-46.6751", addresstype: "road", category: "highway" },
      ]),
    ).toMatchObject({ exato: false });
    // homônimo em outra cidade (Av. da Liberdade em Lisboa)
    expect(lerGeocodificacao([{ lat: "38.7203", lon: "-9.1453", addresstype: "road" }])).toBeNull();
    expect(lerGeocodificacao([])).toBeNull();
    expect(lerGeocodificacao(null)).toBeNull();
    expect(linkMapa(-23.5193, -46.6731)).toBe(
      "https://www.google.com/maps/search/?api=1&query=-23.5193,-46.6731",
    );
  });
});

describe("presença obrigatória nas filas", () => {
  it("toda fila tem o interruptor travado — menos a do SDR", () => {
    expect(presencaObrigatoria({ tipo: "zona" })).toBe(true);
    expect(presencaObrigatoria({ tipo: "campanha" })).toBe(true);
    expect(presencaObrigatoria({ tipo: null })).toBe(true);
    expect(presencaObrigatoria({ tipo: "sdr" })).toBe(false);
  });
});
