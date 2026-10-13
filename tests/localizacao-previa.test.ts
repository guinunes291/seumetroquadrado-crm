// "Incluir minha localização" (pedido do dono, 13/10/2026) — a prévia das
// distâncias, pura. A regra de verdade é do banco (presenca_checkin, 0082, e
// public._distancia_metros); aqui se trava que o espelho bate com ela termo a
// termo — inclusive o arredondamento rint do Postgres, que Math.round não
// reproduz — e o que a tela decide e diz com a prévia. A paridade contra o
// banco de verdade fica em tests/db/presenca-previa-paridade.test.ts.
import { describe, expect, it } from "vitest";
import {
  anuncioDaLeitura,
  arredondarComoBanco,
  avisoAntesDoCheckin,
  conferirFilial,
  decidirToqueFilial,
  dentroDoRaio,
  distanciaMetros,
  encerraDoVisto,
  fraseEncerra,
  precisaoComoBanco,
  previaDasFiliais,
  rotuloDaFilialNaPrevia,
  TEXTO_LENDO,
  textoDaLeitura,
  textoNovaTentativa,
  tituloFalhaLeitura,
  type CoordenadasFilial,
  type Previa,
} from "@/features/presenca/localizacao-previa";
import type { LeituraIncluida } from "@/features/presenca/presenca-client";
import type { CheckinAtual } from "@/features/presenca/presenca-derive";

/** As filiais de produção (pinos de 13/10/2026). */
const TABELA: CoordenadasFilial[] = [
  {
    slug: "barra-funda",
    latitude: -23.520116,
    longitude: -46.676975,
    raio_metros: 300,
    ativa: true,
  },
  { slug: "liberdade", latitude: -23.56125, longitude: -46.638897, raio_metros: 300, ativa: true },
  { slug: "belem", latitude: -23.544943, longitude: -46.585915, raio_metros: 300, ativa: true },
];
const OPCOES = [
  { slug: "barra-funda", tem_coordenadas: true },
  { slug: "liberdade", tem_coordenadas: true },
  { slug: "belem", tem_coordenadas: true },
];
const NOMES = { "barra-funda": "Barra Funda", liberdade: "Liberdade", belem: "Belém" };

/** O "Corretor Teste" na Barra Funda (a leitura do dono). */
const CORRETOR_TESTE = { lat: -23.518983, lng: -46.676975 };
const leitura = (precisao: number | null, lidaEm = 0): LeituraIncluida => ({
  ...CORRETOR_TESTE,
  precisao,
  lidaEm,
});

const m = (lat: number, lng: number, f: CoordenadasFilial) =>
  arredondarComoBanco(distanciaMetros(lat, lng, f.latitude ?? 0, f.longitude ?? 0));

describe("o espelho da regra do banco", () => {
  it("distanciaMetros + arredondarComoBanco = _distancia_metros + round do banco", () => {
    const [barra, liberdade, belem] = TABELA;
    // Os pontos de tests/db/presenca-filial.test.ts.
    expect(m(-23.56053, -46.63889, liberdade)).toBe(80);
    expect(m(-23.55737, -46.63659, liberdade)).toBe(491);
    // O Corretor Teste.
    expect([barra, liberdade, belem].map((f) => m(-23.518983, -46.676975, f))).toEqual([
      126, 6096, 9722,
    ]);
    // A fixture `naLoja` dos testes de tela.
    expect([barra, liberdade, belem].map((f) => m(-23.52, -46.677, f))).toEqual([13, 6010, 9691]);
    // Barra Funda ↔ Liberdade.
    expect(m(barra.latitude ?? 0, barra.longitude ?? 0, liberdade)).toBe(5999);
  });

  it("arredondarComoBanco é rint (o empate vai para o par); precisaoComoBanco descarta o inválido", () => {
    const casos: [number, number][] = [
      [0.5, 0],
      [1.5, 2],
      [2.5, 2],
      [12.5, 12],
      [13.5, 14],
      [300.5, 300],
      [301.5, 302],
      [125.984, 126],
      [312.6, 313],
    ];
    for (const [x, esperado] of casos) expect(arredondarComoBanco(x)).toBe(esperado);
    for (const p of [null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(precisaoComoBanco(p)).toBeNull();
    }
    expect(precisaoComoBanco(0)).toBe(0);
    expect(precisaoComoBanco(40.5)).toBe(40);
  });

  it("dentroDoRaio (raio 300): a precisão alarga até 150 m, com os arredondamentos do banco", () => {
    const dentro = (d: number, p: number | null) => dentroDoRaio(d, p, 300).dentro;
    expect(dentro(390, 90)).toBe(true);
    expect(dentro(391, 90)).toBe(false);
    // Teto de 150 m de tolerância.
    expect(dentro(450, 200)).toBe(true);
    expect(dentro(451, 200)).toBe(false);
    expect(dentro(300, null)).toBe(true);
    expect(dentro(301, null)).toBe(false);
    // Precisão negativa = sem precisão.
    expect(dentroDoRaio(301, -5, 300)).toMatchObject({ precisao_m: null, dentro: false });
    // 12,5 → 12 no banco (rint): 312 dentro, 313 fora — com Math.round daria dentro.
    expect(dentro(312, 12.5)).toBe(true);
    expect(dentro(313, 12.5)).toBe(false);
    expect(313 <= 300 + Math.round(12.5)).toBe(true);
    // As duas brutas arredondadas antes de comparar.
    expect(dentroDoRaio(390.4, 89.6, 300)).toEqual({
      distancia_m: 390,
      precisao_m: 90,
      limite_m: 390,
      dentro: true,
    });
  });

  it("conferirFilial: filial sem pino → sem_coordenadas", () => {
    expect(conferirFilial(leitura(90), { ...TABELA[0], latitude: null, longitude: null })).toEqual({
      tipo: "sem_coordenadas",
    });
    expect(conferirFilial(leitura(90), TABELA[0])).toEqual({
      tipo: "dentro",
      distancia_m: 126,
      limite_m: 390,
    });
  });
});

describe("a prévia das filiais", () => {
  it("Corretor Teste ±90: você está na Barra Funda; as outras com a distância", () => {
    const previa = previaDasFiliais(leitura(90), OPCOES, TABELA);
    expect(previa.aqui).toBe("barra-funda");
    expect(previa.aproximada).toBe(false);
    expect(previa.maisPerto).toEqual({ slug: "barra-funda", distancia_m: 126 });
    expect(rotuloDaFilialNaPrevia(previa, "barra-funda")).toEqual({
      texto: "Você está aqui",
      intent: "success",
      aqui: true,
    });
    expect(rotuloDaFilialNaPrevia(previa, "liberdade")).toEqual({
      texto: "a 6,1 km",
      intent: "neutral",
      aqui: false,
    });
    expect(rotuloDaFilialNaPrevia(previa, "belem")?.texto).toBe("a 9,7 km");
  });

  it("±5000 (Wi-Fi ou IP): aproximada, ninguém é 'aqui', as distâncias com ≈", () => {
    const previa = previaDasFiliais(leitura(5000), OPCOES, TABELA);
    expect(previa.aproximada).toBe(true);
    expect(previa.aqui).toBeNull();
    const rotulos = OPCOES.map((o) => rotuloDaFilialNaPrevia(previa, o.slug));
    expect(rotulos.map((r) => r?.texto)).toEqual(["≈ 130 m", "≈ 6,1 km", "≈ 9,7 km"]);
    expect(rotulos.some((r) => r?.aqui)).toBe(false);
  });

  it("duas filiais dentro: 'Você está aqui' na mais perto; a outra 'Dentro do raio'", () => {
    const vizinha: CoordenadasFilial = {
      slug: "vizinha",
      latitude: CORRETOR_TESTE.lat - 250 / 111195,
      longitude: CORRETOR_TESTE.lng,
      raio_metros: 300,
      ativa: true,
    };
    // A vizinha vem antes nas opções: o "aqui" é pela distância, não pela ordem.
    const previa = previaDasFiliais(
      leitura(20),
      [{ slug: "vizinha" }, { slug: "barra-funda" }],
      [...TABELA, vizinha],
    );
    expect(previa.aqui).toBe("barra-funda");
    expect(rotuloDaFilialNaPrevia(previa, "vizinha")).toEqual({
      texto: "Dentro do raio (a 250 m)",
      intent: "success",
      aqui: false,
    });
  });

  it("linha inativa e slug sem linha na tabela: fora da prévia (a opção mantém o endereço)", () => {
    const previa = previaDasFiliais(
      leitura(90),
      [...OPCOES, { slug: "nova" }],
      TABELA.map((f) => (f.slug === "belem" ? { ...f, ativa: false } : f)),
    );
    expect(Object.keys(previa.porFilial)).toEqual(["barra-funda", "liberdade"]);
    expect(rotuloDaFilialNaPrevia(previa, "belem")).toBeNull();
    expect(rotuloDaFilialNaPrevia(previa, "nova")).toBeNull();
    expect(rotuloDaFilialNaPrevia(null, "barra-funda")).toBeNull();
  });
});

describe("o toque numa filial com a prévia", () => {
  const filial = (slug: string, tem_coordenadas = true) => ({ slug, tem_coordenadas });
  const comLeitura = (precisao: number) => {
    const l = leitura(precisao);
    return { leitura: l, previa: previaDasFiliais(l, OPCOES, TABELA) };
  };
  const base = { exige: true, falhaRecente: null };

  it("a matriz das 9 regras, na ordem", () => {
    const ok = comLeitura(90);
    // 1. Exigência desligada: direto (mesmo fora, mesmo sem leitura).
    expect(decidirToqueFilial({ ...base, exige: false, filial: filial("liberdade"), ...ok })).toBe(
      "direto",
    );
    expect(
      decidirToqueFilial({
        ...base,
        exige: false,
        filial: filial("liberdade"),
        leitura: null,
        previa: null,
      }),
    ).toBe("direto");
    // 2. Filial sem coordenadas, mesmo com falha recente: a pergunta.
    expect(
      decidirToqueFilial({
        exige: true,
        filial: filial("belem", false),
        leitura: null,
        falhaRecente: "negada",
        previa: null,
      }),
    ).toBe("confirmar");
    // 3. Falha recente sem leitura: o aviso de "sem localização".
    expect(
      decidirToqueFilial({
        exige: true,
        filial: filial("belem"),
        leitura: null,
        falhaRecente: "negada",
        previa: null,
      }),
    ).toBe("aviso_sem_localizacao");
    // 4. Sem leitura, ou sem prévia (distâncias não carregaram): a pergunta.
    expect(
      decidirToqueFilial({ ...base, filial: filial("barra-funda"), leitura: null, previa: null }),
    ).toBe("confirmar");
    expect(
      decidirToqueFilial({
        ...base,
        filial: filial("barra-funda"),
        leitura: ok.leitura,
        previa: null,
      }),
    ).toBe("confirmar");
    // 5. A filial não está na prévia (linha inativa, tabela velha).
    expect(decidirToqueFilial({ ...base, filial: filial("nova"), ...ok })).toBe("confirmar");
    // 6. Fora → o aviso, também com a leitura aproximada.
    expect(decidirToqueFilial({ ...base, filial: filial("liberdade"), ...ok })).toBe("aviso_fora");
    expect(decidirToqueFilial({ ...base, filial: filial("liberdade"), ...comLeitura(5000) })).toBe(
      "aviso_fora",
    );
    // 7. Dentro, mas aproximada: a pergunta.
    expect(
      decidirToqueFilial({ ...base, filial: filial("barra-funda"), ...comLeitura(5000) }),
    ).toBe("confirmar");
    // 8 e 9. A margem de 1 m: limite − 1 → direto; no limite → a pergunta.
    const borda = (distancia_m: number): Previa => ({
      precisao_m: 90,
      aproximada: false,
      porFilial: { "barra-funda": { tipo: "dentro", distancia_m, limite_m: 390 } },
      aqui: "barra-funda",
      maisPerto: { slug: "barra-funda", distancia_m },
    });
    expect(
      decidirToqueFilial({
        ...base,
        filial: filial("barra-funda"),
        leitura: ok.leitura,
        previa: borda(389),
      }),
    ).toBe("direto");
    expect(
      decidirToqueFilial({
        ...base,
        filial: filial("barra-funda"),
        leitura: ok.leitura,
        previa: borda(390),
      }),
    ).toBe("confirmar");
    expect(decidirToqueFilial({ ...base, filial: filial("barra-funda"), ...ok })).toBe("direto");
  });
});

describe("o aviso antes do check-in", () => {
  const previa = previaDasFiliais(leitura(90), OPCOES, TABELA);
  const aproximada = previaDasFiliais(leitura(5000), OPCOES, TABELA);
  const base = {
    filial: "Liberdade",
    falha: null,
    computador: false,
    jaBarrado: false,
    encerra: null,
    aqui: null,
  };

  it("fora: a distância, a consequência (o reforço não volta com Em casa) e a dica", () => {
    const t = avisoAntesDoCheckin({
      ...base,
      variante: "fora",
      conferencia: previa.porFilial.liberdade,
      previa,
    });
    expect(t.titulo).toBe("Você está a 6,1 km da filial Liberdade");
    expect(t.orientacao).toBeNull();
    expect(t.consequencia).toBe(
      "Se fizer o check-in na filial Liberdade agora, ele fica barrado: você fica fora das roletas e do reforço hoje. " +
        "O reforço só volta com um check-in na loja que valha (ou se a gestão liberar você); escolher Em casa depois não devolve. " +
        "As visitas marcadas pelo SDR continuam chegando.",
    );
    expect(t.dica).toBe(
      "Está dentro da loja e o celular não confirma? Peça ao gestor para confirmar no plantão.",
    );
    expect(t.encerra).toBeNull();
    expect(t.resgate).toBeNull();
  });

  it("fora com a leitura aproximada: o título da precisão, a orientação (celular e computador), sem dica", () => {
    const fora = {
      ...base,
      variante: "fora" as const,
      conferencia: aproximada.porFilial.liberdade,
      previa: aproximada,
    };
    const celular = avisoAntesDoCheckin(fora);
    expect(celular.titulo).toBe("A localização deste aparelho é aproximada (±5 km)");
    expect(celular.orientacao).toBe("Ligue a localização precisa do celular e inclua de novo.");
    expect(celular.dica).toBeNull();
    expect(avisoAntesDoCheckin({ ...fora, computador: true }).orientacao).toBe(
      "No computador a localização costuma falhar: se puder, faça o check-in pelo celular.",
    );
  });

  it("sem localização (negada): o título e o passo a passo para liberar", () => {
    const t = avisoAntesDoCheckin({
      ...base,
      filial: "Belém",
      variante: "sem_localizacao",
      conferencia: null,
      previa: null,
      falha: "negada",
    });
    expect(t.titulo).toBe("Sem a localização, o check-in na filial Belém fica barrado");
    expect(t.orientacao).toContain("O navegador está bloqueando a localização para o CRM.");
    expect(t.orientacao).toContain("Ajustes do Site → Localização");
    expect(t.dica).toBeNull();
  });

  it("já barrado hoje: a consequência curta", () => {
    const t = avisoAntesDoCheckin({
      ...base,
      variante: "fora",
      conferencia: previa.porFilial.liberdade,
      previa,
      jaBarrado: true,
    });
    expect(t.consequencia).toBe(
      "Se fizer o check-in na filial Liberdade agora, ele também fica barrado: você continua fora das roletas e do reforço hoje.",
    );
  });

  it("o que um check-in novo encerra (confirmado pela gestão, liberado, valendo) e o resgate", () => {
    const c = (over: Partial<CheckinAtual>): CheckinAtual => ({
      id: "k1",
      modo: "loja",
      filial_slug: "barra-funda",
      filial_nome: "Barra Funda",
      apto_roleta: true,
      motivo: null,
      localizacao: "confirmada",
      distancia_m: 80,
      precisao_m: 20,
      falha_localizacao: null,
      origem: "corretor",
      criado_em: "2026-10-13T12:00:00Z",
      encerrado_em: null,
      ...over,
    });
    const encerra = (checkin: CheckinAtual) =>
      avisoAntesDoCheckin({
        ...base,
        variante: "fora",
        conferencia: previa.porFilial.liberdade,
        previa,
        encerra: encerraDoVisto(checkin),
      }).encerra;
    expect(encerra(c({ origem: "gestao", localizacao: "confirmada_gestao" }))).toBe(
      "Isso também encerra o plantão na Barra Funda confirmado pela gestão.",
    );
    expect(encerra(c({ modo: "liberado_gestao", filial_slug: null, filial_nome: null }))).toBe(
      "Isso também encerra a liberação da gestão de hoje.",
    );
    expect(encerra(c({}))).toBe(
      "Isso também encerra o seu check-in de agora (Barra Funda), que está valendo.",
    );
    // Barrado ou encerrado: nada que valha para encerrar.
    expect(encerraDoVisto(c({ apto_roleta: false }))).toBeNull();
    expect(encerraDoVisto(c({ encerrado_em: "2026-10-13T18:00:00Z" }))).toBeNull();
    expect(encerraDoVisto(null)).toBeNull();
    // A pergunta "Estou na loja" diz a mesma frase do aviso (fraseEncerra).
    expect(fraseEncerra(encerraDoVisto(c({ origem: "gestao" })))).toBe(
      "Isso também encerra o plantão na Barra Funda confirmado pela gestão.",
    );
    expect(fraseEncerra(null)).toBeNull();

    expect(
      avisoAntesDoCheckin({
        ...base,
        variante: "fora",
        conferencia: previa.porFilial.liberdade,
        previa,
        aqui: { slug: "barra-funda", nome: "Barra Funda" },
      }).resgate,
    ).toBe("Pela localização, você está na filial Barra Funda.");
  });
});

describe("a linha sob o botão e o que a região viva anuncia", () => {
  const nao = { computador: false };
  const sim = { computador: true };

  it("tituloFalhaLeitura: as quatro falhas e o computador", () => {
    expect(tituloFalhaLeitura("negada", false)).toBe("O navegador bloqueou a localização");
    expect(tituloFalhaLeitura("indisponivel", false)).toBe("O celular não informou a localização");
    expect(tituloFalhaLeitura("tempo", false)).toBe("O celular não informou a localização");
    expect(tituloFalhaLeitura("sem_suporte", false)).toBe(
      "Este navegador não informa a localização",
    );
    for (const f of ["negada", "indisponivel", "tempo", "sem_suporte"] as const) {
      expect(tituloFalhaLeitura(f, true)).toBe("Este computador não informou a localização");
    }
  });

  it("textoDaLeitura e anuncioDaLeitura em cada estado", () => {
    // Vazia: o que o botão faz; nada a anunciar.
    expect(textoDaLeitura({ fase: "vazia" }, null, nao)).toEqual({
      titulo:
        "Mostra a que distância você está de cada filial antes de escolher. Nada é registrado.",
      detalhe: null,
      intent: "neutral",
    });
    expect(anuncioDaLeitura({ fase: "vazia" }, null, NOMES, nao)).toBe("");
    // Lendo: uma linha neutra no lugar (as opções não sobem e descem no
    // instante em que destravam); o botão diz "Lendo a localização…".
    expect(textoDaLeitura({ fase: "lendo" }, null, nao)).toEqual({
      titulo: "Esperando o aparelho informar a localização…",
      detalhe: null,
      intent: "neutral",
    });
    expect(TEXTO_LENDO).toBe("Esperando o aparelho informar a localização…");
    expect(anuncioDaLeitura({ fase: "lendo" }, null, NOMES, nao)).toBe("Lendo a localização…");

    // Incluída ±40 m, com a Barra Funda "aqui".
    const l40 = leitura(40);
    const incluida = { fase: "incluida" as const, leitura: l40, coordenadas: TABELA };
    const p40 = previaDasFiliais(l40, OPCOES, TABELA);
    expect(textoDaLeitura(incluida, p40, nao)).toEqual({
      titulo: "Localização incluída (±40 m)",
      detalhe: null,
      intent: "success",
    });
    expect(anuncioDaLeitura(incluida, p40, NOMES, nao)).toBe(
      "Localização incluída: você está na filial Barra Funda.",
    );
    // Sem precisão: sem o parêntese.
    const semPrecisao = { fase: "incluida" as const, leitura: leitura(null), coordenadas: TABELA };
    expect(textoDaLeitura(semPrecisao, null, nao)?.titulo).toBe("Localização incluída");
    // Longe de todas: a mais perto.
    const longe: LeituraIncluida = { lat: -23.6, lng: -46.7, precisao: 15, lidaEm: 0 };
    const pLonge = previaDasFiliais(longe, OPCOES, TABELA);
    expect(
      anuncioDaLeitura(
        { fase: "incluida", leitura: longe, coordenadas: TABELA },
        pLonge,
        NOMES,
        nao,
      ),
    ).toMatch(/^Localização incluída: a filial mais perto é Liberdade, a \d+(,\d)? km\.$/);
    // Sem nenhuma filial conferida.
    expect(
      anuncioDaLeitura(
        { fase: "incluida", leitura: longe, coordenadas: [] },
        previaDasFiliais(longe, OPCOES, []),
        NOMES,
        nao,
      ),
    ).toBe("Localização incluída.");

    // Aproximada, no celular e no computador.
    const l5k = leitura(5000);
    const aproximada = { fase: "incluida" as const, leitura: l5k, coordenadas: TABELA };
    expect(textoDaLeitura(aproximada, null, nao)).toEqual({
      titulo: "Localização aproximada (±5 km): não dá para saber em que filial você está.",
      detalhe: "Ligue a localização precisa do celular e inclua de novo.",
      intent: "warning",
    });
    expect(textoDaLeitura(aproximada, null, sim)?.detalhe).toBe(
      "No computador a localização costuma falhar: se puder, faça o check-in pelo celular.",
    );
    expect(anuncioDaLeitura(aproximada, null, NOMES, nao)).toBe(
      "Localização aproximada (±5 km): não dá para saber em que filial você está.",
    );

    // As distâncias não carregaram.
    const semCoordenadas = { fase: "incluida" as const, leitura: l40, coordenadas: null };
    expect(textoDaLeitura(semCoordenadas, null, nao)).toEqual({
      titulo:
        "Localização incluída (±40 m), mas as distâncias não carregaram agora: escolha normalmente.",
      detalhe: null,
      intent: "warning",
    });
    expect(textoDaLeitura({ ...semCoordenadas, leitura: leitura(null) }, null, nao)?.titulo).toBe(
      "Localização incluída, mas as distâncias não carregaram agora: escolha normalmente.",
    );
    expect(anuncioDaLeitura(semCoordenadas, null, NOMES, nao)).toBe(
      "Localização incluída, mas as distâncias não carregaram agora: escolha normalmente.",
    );

    // Vencida, com a hora de São Paulo.
    const vencida = { fase: "vencida" as const, lidaEm: Date.parse("2026-10-13T12:31:00Z") };
    expect(textoDaLeitura(vencida, null, nao)).toEqual({
      titulo: "A localização das 09:31 venceu: inclua de novo para ver as distâncias.",
      detalhe: null,
      intent: "neutral",
    });
    expect(anuncioDaLeitura(vencida, null, NOMES, nao)).toBe("");

    // Falhou: o título e o passo a passo.
    const falhou = { fase: "falhou" as const, falha: "negada" as const, em: 0 };
    const t = textoDaLeitura(falhou, null, nao);
    expect(t?.titulo).toBe("O navegador bloqueou a localização");
    expect(t?.detalhe).toContain("toque no cadeado");
    expect(t?.intent).toBe("warning");
    expect(anuncioDaLeitura(falhou, null, NOMES, nao)).toBe("O navegador bloqueou a localização");
    expect(anuncioDaLeitura(falhou, null, NOMES, sim)).toBe(
      "Este computador não informou a localização",
    );
  });
});

describe("a nova tentativa do 'Incluir localização' do barrado", () => {
  it("textoNovaTentativa: a contagem (o barrado é a 1ª), a hora de São Paulo e o motivo em minúscula", () => {
    const em = Date.parse("2026-10-13T12:42:00Z");
    expect(textoNovaTentativa(2, em, "negada", false)).toBe(
      "2ª tentativa às 09:42: o navegador bloqueou a localização.",
    );
    expect(textoNovaTentativa(3, em, "tempo", false)).toBe(
      "3ª tentativa às 09:42: o celular não informou a localização.",
    );
    expect(textoNovaTentativa(2, em, "indisponivel", true)).toBe(
      "2ª tentativa às 09:42: este computador não informou a localização.",
    );
    // Duas tentativas no mesmo minuto: o texto muda mesmo assim (a contagem).
    expect(textoNovaTentativa(2, em, "negada", false)).not.toBe(
      textoNovaTentativa(3, em, "negada", false),
    );
  });
});
