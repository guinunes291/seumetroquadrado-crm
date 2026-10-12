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
  AVISO_FORA_DO_REFORCO,
  avisoLocalizacao,
  barradoPelaLocalizacao,
  barradosSemDestrave,
  checkinAptoAberto,
  coordenadasTexto,
  distanciaLabel,
  enderecoCurto,
  localizacaoLabel,
  mensagemSemLocalizacao,
  motivoPresencaLabel,
  nomeDoMes,
  parseCoordenadas,
  parseFalhaLocalizacao,
  parseMinhaPresenca,
  perguntaConfirmarFilial,
  precisaCheckin,
  precisaRefazerCheckin,
  resumoQuadro,
  rotuloLocal,
  situacaoHoje,
  statusRoletaLinha,
  type CheckinDoDia,
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
    falha_localizacao: null,
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

  it("exigência de localização: usa a que veio; sem a chave, assume ligada", () => {
    expect(parseMinhaPresenca({ exige_localizacao: false }).exige_localizacao).toBe(false);
    expect(parseMinhaPresenca({ exige_localizacao: true }).exige_localizacao).toBe(true);
    expect(parseMinhaPresenca({}).exige_localizacao).toBe(true);
  });

  it("falha_localizacao (desde a 0080): lida do check-in; ausente ou desconhecida = null", () => {
    const com = parseMinhaPresenca({
      checkin: { id: "c", modo: "loja", falha_localizacao: "negada", criado_em: "x" },
    });
    expect(com.checkin?.falha_localizacao).toBe("negada");
    const sem = parseMinhaPresenca({ checkin: { id: "c", modo: "loja", criado_em: "x" } });
    expect(sem.checkin?.falha_localizacao).toBeNull();
    expect(parseFalhaLocalizacao("qualquer")).toBeNull();
    expect(parseFalhaLocalizacao(null)).toBeNull();
    for (const f of ["negada", "indisponivel", "tempo", "sem_suporte"]) {
      expect(parseFalhaLocalizacao(f)).toBe(f);
    }
  });
});

describe("o que o corretor lê no card", () => {
  it("sem check-in: avisa que não recebe das roletas nem do reforço (as visitas do SDR seguem)", () => {
    const s = situacaoHoje(presenca());
    expect(s.estado).toBe("sem_checkin");
    expect(s.intent).toBe("warning");
    expect(s.detalhe).toBe(
      "Sem check-in, você não recebe leads das roletas nem do reforço (as visitas marcadas pelo SDR continuam chegando). Escolha onde está trabalhando.",
    );
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

  it("presença encerrada: fora das roletas e do reforço, chama de volta para o check-in", () => {
    const s = situacaoHoje(
      presenca({ checkin: checkin({ encerrado_em: "2026-10-13T20:00:00Z" }) }),
    );
    expect(s.estado).toBe("encerrado");
    expect(s.detalhe).toBe(
      "Você saiu das roletas e do reforço. Faça o check-in de novo para voltar a receber.",
    );
  });

  it("barrado na filial hoje e depois 'Em casa': avisa que o reforço não volta (com ou sem a meta)", () => {
    const casaRecusada = presenca({
      checkin: checkin({
        modo: "casa",
        filial_slug: null,
        filial_nome: null,
        apto_roleta: false,
        motivo: "casa_abaixo_minimo_vendas",
      }),
    });
    expect(situacaoHoje(casaRecusada, { barradoHoje: true }).detalhe).toBe(
      `${situacaoHoje(casaRecusada).detalhe} ${AVISO_FORA_DO_REFORCO}`,
    );
    expect(situacaoHoje(casaRecusada).detalhe).not.toContain("reforço");
    const casaApta = presenca({
      presente: true,
      vendas_mes_anterior: 4,
      checkin: checkin({ modo: "casa", filial_slug: null, filial_nome: null }),
    });
    expect(situacaoHoje(casaApta, { barradoHoje: true }).detalhe).toContain(AVISO_FORA_DO_REFORCO);
    // Na filial (o próprio barrado), o motivo já diz tudo: nada de aviso repetido.
    const barrado = presenca({
      checkin: checkin({ apto_roleta: false, motivo: "fora_da_filial", distancia_m: 900 }),
    });
    expect(situacaoHoje(barrado, { barradoHoje: true }).detalhe).not.toContain("reforço até");
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

  it("variante do barrado: check-in aberto numa filial que a localização barrou", () => {
    const barrado = (over: Partial<NonNullable<MinhaPresenca["checkin"]>>) =>
      presenca({ checkin: checkin({ apto_roleta: false, ...over }) });
    expect(precisaRefazerCheckin(barrado({ motivo: "fora_da_filial" }))).toBe(true);
    expect(precisaRefazerCheckin(barrado({ motivo: "sem_localizacao" }))).toBe(true);
    // Encerrado: a faixa normal ("presença encerrada") cuida.
    expect(precisaRefazerCheckin(barrado({ motivo: "sem_localizacao", encerrado_em: "x" }))).toBe(
      false,
    );
    // Em casa abaixo do mínimo não é barrado (disse a verdade).
    expect(
      precisaRefazerCheckin(
        barrado({ modo: "casa", motivo: "casa_abaixo_minimo_vendas", filial_slug: null }),
      ),
    ).toBe(false);
    expect(precisaRefazerCheckin(presenca({ checkin: checkin() }))).toBe(false);
    expect(precisaRefazerCheckin(presenca())).toBe(false);
    expect(precisaRefazerCheckin(undefined)).toBe(false);
  });

  it("check-in que liberou a roleta e está aberto: nada a refazer", () => {
    expect(checkinAptoAberto(presenca({ checkin: checkin() }))).toBe(true);
    expect(checkinAptoAberto(presenca({ checkin: checkin({ encerrado_em: "x" }) }))).toBe(false);
    expect(
      checkinAptoAberto(
        presenca({ checkin: checkin({ apto_roleta: false, motivo: "fora_da_filial" }) }),
      ),
    ).toBe(false);
    expect(checkinAptoAberto(presenca())).toBe(false);
  });
});

describe("evidência de localização", () => {
  it("distância legível e tom por situação", () => {
    expect(distanciaLabel(84)).toBe("80 m");
    expect(distanciaLabel(4230)).toBe("4,2 km");
    expect(distanciaLabel(12600)).toBe("13 km");
    expect(distanciaLabel(5000)).toBe("5 km");
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
  it("fora da filial: onde o APARELHO ficou (não 'você está'), que só vale de dentro da loja e o caminho do gestor", () => {
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
      "A localização deste aparelho ficou a 5,8 km da filial Barra Funda. O check-in na filial só vale de dentro da loja. " +
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
      /^A localização deste aparelho ficou longe da filial Liberdade\. O check-in na filial só vale de dentro da loja\./,
    );
  });

  it("localização aproximada (precisão acima de 1 km): não afirma a distância, manda usar o celular ou a gestão", () => {
    const texto = motivoPresencaLabel("fora_da_filial", {
      vendas_mes_anterior: 0,
      vendas_minimas: 3,
      filial_nome: "Barra Funda",
      distancia_m: 8363,
      precisao_m: 5000,
    });
    expect(texto).toBe(
      "A localização deste aparelho é aproximada (±5 km): faça o check-in pelo celular, de dentro da loja, " +
        "ou peça ao gestor para confirmar no plantão.",
    );
    // Até 1 km, a distância vale.
    expect(
      motivoPresencaLabel("fora_da_filial", {
        vendas_mes_anterior: 0,
        vendas_minimas: 3,
        filial_nome: "Barra Funda",
        distancia_m: 2100,
        precisao_m: 900,
      }),
    ).toContain("ficou a 2,1 km da filial Barra Funda");
    // O card relido usa a precisão do check-in.
    const s = situacaoHoje(
      presenca({
        checkin: checkin({
          apto_roleta: false,
          motivo: "fora_da_filial",
          distancia_m: 8363,
          precisao_m: 4200,
        }),
      }),
    );
    expect(s.detalhe).toContain("é aproximada (±4,2 km)");
  });

  it("sem localização: o que fazer depende de por que o celular não deu a posição", () => {
    const sem = (falha?: Parameters<typeof mensagemSemLocalizacao>[0]) =>
      motivoPresencaLabel("sem_localizacao", {
        vendas_mes_anterior: 0,
        vendas_minimas: 3,
        falha_localizacao: falha,
      });
    // Permissão negada: como liberar no Chrome (Android) E no Safari (iPhone).
    expect(sem("negada")).toContain("cadeado");
    expect(sem("negada")).toContain("Localização → Permitir");
    expect(sem("negada")).toContain("aA ao lado do endereço → Ajustes do Site → Localização");
    expect(sem("negada")).toContain(
      "Ajustes → Privacidade e Segurança → Serviços de Localização → Sites do Safari",
    );
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
    // Recarregou: o porquê gravado pelo banco (0080) no lugar da orientação geral.
    const relido = situacaoHoje(
      presenca({
        checkin: checkin({
          apto_roleta: false,
          motivo: "sem_localizacao",
          localizacao: "sem_localizacao",
          falha_localizacao: "tempo",
        }),
      }),
    );
    expect(relido.detalhe).toBe(mensagemSemLocalizacao("tempo"));
  });

  it("no computador, com a localização falhando: orienta usar o celular (ou a gestão)", () => {
    for (const falha of ["negada", "indisponivel", "tempo", "sem_suporte", null] as const) {
      expect(
        motivoPresencaLabel("sem_localizacao", {
          vendas_mes_anterior: 0,
          vendas_minimas: 3,
          falha_localizacao: falha,
          computador: true,
        }),
      ).toBe(
        "No computador a localização costuma falhar: faça o check-in pelo celular, de dentro da loja, " +
          "ou peça ao gestor para confirmar no plantão.",
      );
    }
  });

  it("confirmação antes da filial e a dica para quem está fora de uma", () => {
    expect(perguntaConfirmarFilial("Belém")).toEqual({
      titulo: "Você está dentro da loja Belém agora?",
      detalhe:
        "O celular vai conferir. Se não confirmar, o check-in fica barrado e você fica fora das roletas e do reforço hoje.",
    });
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

  it("cabeçalho da filial: só os válidos no número, os barrados no selo — a soma bate com os tiles", () => {
    const cols = agruparQuadro(rows, FILIAIS);
    const barra = cols.find((c) => c.titulo === "Barra Funda")!;
    expect(barra).toMatchObject({ validos: 1, barrados: 1 });
    const filiais = cols.filter((c) => c.chave.startsWith("filial:"));
    const resumo = resumoQuadro(rows);
    expect(filiais.reduce((n, c) => n + c.validos, 0)).toBe(resumo.naFilial);
    expect(filiais.reduce((n, c) => n + c.barrados, 0)).toBe(resumo.barradosLocalizacao);
    expect(cols.find((c) => c.chave === "casa")).toMatchObject({ validos: 2, barrados: 0 });
  });

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
    // Desde a 0080, o porquê da falha aparece para a gestão.
    expect(statusRoletaLinha({ ...semGps, falha_localizacao: "negada" })?.texto).toBe(
      "Barrado: sem localização (permissão negada)",
    );
    expect(statusRoletaLinha({ ...semGps, falha_localizacao: "tempo" })?.texto).toBe(
      "Barrado: sem localização (o aparelho não respondeu)",
    );
    expect(statusRoletaLinha({ ...semGps, falha_localizacao: "xyz" })?.texto).toBe(
      "Barrado: sem localização",
    );
    // Precisão de km (computador): não acusa a distância.
    expect(statusRoletaLinha({ ...bia, distancia_m: 8363, precisao_m: 5000 })?.texto).toBe(
      "Barrado: localização imprecisa (±5 km)",
    );
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

describe("fora do reforço hoje: barrado pela localização sem destrave depois", () => {
  const c = (corretor_id: string, hora: string, over: Partial<CheckinDoDia>): CheckinDoDia => ({
    corretor_id,
    modo: "loja",
    apto_roleta: true,
    motivo: null,
    created_at: `2026-10-13T${hora}:00Z`,
    ...over,
  });
  const barrado = { apto_roleta: false, motivo: "fora_da_filial" };

  it("barrado → Em casa (apto ou não): fora; o 'Em casa' não destrava", () => {
    const fora = barradosSemDestrave([
      c("ana", "12:00", barrado),
      c("ana", "12:05", { modo: "casa" }),
      c("bia", "12:00", { apto_roleta: false, motivo: "sem_localizacao" }),
      c("bia", "12:05", { modo: "casa", apto_roleta: false, motivo: "casa_abaixo_minimo_vendas" }),
    ]);
    expect([...fora].sort()).toEqual(["ana", "bia"]);
  });

  it("destrava: check-in POSTERIOR que liberou na filial (GPS ou gestão) ou o interruptor da gestão", () => {
    const fora = barradosSemDestrave([
      c("caio", "12:00", barrado),
      c("caio", "12:10", { localizacao: "confirmada" } as Partial<CheckinDoDia>),
      c("duda", "12:00", barrado),
      c("duda", "12:05", { modo: "casa" }),
      c("duda", "12:20", {}), // gestão confirmou no plantão
      c("edu", "12:00", barrado),
      c("edu", "12:30", { modo: "liberado_gestao" }),
    ]);
    expect(fora.size).toBe(0);
  });

  it("um apto ANTES do barrado não conta; barrado de novo depois da confirmação volta a ficar fora", () => {
    const fora = barradosSemDestrave([
      c("fabio", "11:00", {}),
      c("fabio", "12:00", barrado),
      c("gil", "11:00", barrado),
      c("gil", "11:30", {}),
      c("gil", "12:00", barrado),
      c("hugo", "12:00", { modo: "casa", apto_roleta: false, motivo: "casa_abaixo_minimo_vendas" }),
    ]);
    expect([...fora].sort()).toEqual(["fabio", "gil"]);
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
