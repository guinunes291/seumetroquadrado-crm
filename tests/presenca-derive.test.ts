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
  avisoLocalizacao,
  barradoPelaLocalizacao,
  coordenadasTexto,
  distanciaLabel,
  enderecoCurto,
  localizacaoLabel,
  mensagemSemLocalizacao,
  motivoPresencaLabel,
  nomeDoMes,
  parseCoordenadas,
  parseMinhaPresenca,
  precisaCheckin,
  resumoQuadro,
  rotuloLocal,
  situacaoHoje,
  statusRoletaLinha,
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

  it("em outubro, em casa com 2 de 3 vendas em setembro: fora da roleta, com a conta e o caminho (estar na filial)", () => {
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
        "Para receber leads da roleta hoje, é preciso estar numa filial: vá até a loja e faça o check-in de lá.",
    );
    // Não empurra quem está em casa a "escolher" uma filial: tem de ESTAR nela.
    expect(s.detalhe).not.toContain("faça o check-in numa filial");
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

describe("check-in na filial barrado pela localização: o que o corretor lê", () => {
  it("fora da filial: a distância que o banco calculou, que só vale de dentro da loja e o caminho do gestor", () => {
    const s = situacaoHoje(
      presenca({
        exige_localizacao: true,
        checkin: checkin({
          apto_roleta: false,
          motivo: "fora_da_filial",
          localizacao: "fora_do_raio",
          distancia_m: 5830,
        }),
      }),
    );
    expect(s.estado).toBe("fora_da_roleta");
    expect(s.titulo).toBe("Barra Funda — fora da roleta");
    expect(s.detalhe).toBe(
      "Você está a 5,8 km da filial Barra Funda. O check-in na filial só vale de dentro da loja. " +
        "Se você está na loja, peça ao gestor para confirmar no plantão.",
    );
    // Sem a distância (dado antigo), não inventa número.
    expect(
      motivoPresencaLabel("fora_da_filial", {
        vendas_mes_anterior: 0,
        vendas_minimas: 3,
        filial_nome: "Liberdade",
      }),
    ).toMatch(
      /^Você está longe da filial Liberdade\. O check-in na filial só vale de dentro da loja\./,
    );
  });

  it("sem localização: o que fazer depende de por que o celular não deu a posição", () => {
    const sem = (falha?: Parameters<typeof mensagemSemLocalizacao>[0]) =>
      motivoPresencaLabel("sem_localizacao", {
        vendas_mes_anterior: 0,
        vendas_minimas: 3,
        falha_localizacao: falha,
      });
    // Permissão negada: como liberar no navegador do celular.
    expect(sem("negada")).toContain("cadeado");
    expect(sem("negada")).toContain("Localização → Permitir");
    expect(sem("negada")).toContain("tente de novo");
    // GPS indisponível ou demorou: ligar a localização, perto de uma janela.
    for (const f of ["indisponivel", "tempo"] as const) {
      expect(sem(f)).toBe(
        "O celular não conseguiu informar a localização. Ligue a localização do celular e " +
          "tente de novo, de preferência perto de uma janela.",
      );
    }
    expect(sem("sem_suporte")).toContain("Este navegador não informa a localização");
    // Sem saber o porquê (o card relido depois): a orientação geral.
    expect(sem()).toContain("Ligue a localização");
    expect(sem()).toContain("de dentro da loja");
    // O card de /presenca usa o porquê do último check-in feito nele.
    const s = situacaoHoje(
      presenca({
        checkin: checkin({
          apto_roleta: false,
          motivo: "sem_localizacao",
          localizacao: "sem_localizacao",
        }),
      }),
      { falhaLocalizacao: "negada" },
    );
    expect(s.detalhe).toBe(mensagemSemLocalizacao("negada"));
  });

  it("aviso sob as opções: com a exigência ligada, diz que a localização é conferida", () => {
    expect(avisoLocalizacao(true)).toContain("a localização do celular é conferida");
    expect(avisoLocalizacao(true)).toContain("só vale de dentro da loja");
    expect(avisoLocalizacao(false)).not.toContain("conferida");
    expect(avisoLocalizacao(false)).toContain("Em casa, a localização nunca é pedida.");
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

  it("resumo: na roleta, no plantão (sem os barrados pela localização), em casa fora da roleta, sem check-in", () => {
    expect(resumoQuadro(rows)).toEqual({
      naRoleta: 4,
      // Ana (Barra Funda) e Hugo (filial desativada); Bia foi barrada pela localização.
      naFilial: 2,
      barradosLocalizacao: 1,
      emCasaForaDaRoleta: 1,
      semCheckin: 2,
    });
  });

  it("selo da linha: barrado pela localização aparece como barrado (com a distância), nunca como 'Na roleta'", () => {
    const bia = rows.find((r) => r.nome === "Bia")!;
    expect(barradoPelaLocalizacao(bia)).toBe(true);
    expect(statusRoletaLinha({ ...bia, distancia_m: 5830 })).toEqual({
      texto: "Barrado: a 5,8 km da filial",
      intent: "danger",
    });
    expect(statusRoletaLinha(bia)).toEqual({ texto: "Barrado: longe da filial", intent: "danger" });
    // Mesmo que o perfil ainda diga "presente" (dado atrasado), o barrado não vira "Na roleta".
    expect(statusRoletaLinha({ ...bia, presente: true })?.texto).toMatch(/^Barrado/);
    const semGps = linha({
      nome: "Iara",
      modo: "loja",
      filial_slug: "liberdade",
      filial_nome: "Liberdade",
      apto_roleta: false,
      motivo: "sem_localizacao",
      localizacao: "sem_localizacao",
    });
    expect(statusRoletaLinha(semGps)).toEqual({
      texto: "Barrado: sem localização",
      intent: "danger",
    });
    expect(resumoQuadro([semGps])).toMatchObject({ naFilial: 0, barradosLocalizacao: 1 });

    const ana = rows.find((r) => r.nome === "Ana")!;
    expect(statusRoletaLinha(ana)).toEqual({ texto: "Na roleta", intent: "success" });
    const caio = rows.find((r) => r.nome === "Caio")!;
    // Em casa abaixo do mínimo: fora da roleta, mas não "barrado" (disse a verdade).
    expect(barradoPelaLocalizacao(caio)).toBe(false);
    expect(statusRoletaLinha(caio)).toEqual({ texto: "Fora da roleta", intent: "warning" });
    // Barrado que encerrou a presença: sem selo (a linha diz a hora da saída).
    expect(statusRoletaLinha({ ...bia, encerrado_em: "2026-10-13T20:00:00Z" })).toBeNull();
    expect(barradoPelaLocalizacao({ ...bia, encerrado_em: "2026-10-13T20:00:00Z" })).toBe(false);
    expect(statusRoletaLinha(rows.find((r) => r.nome === "Fábio")!)).toBeNull();
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
