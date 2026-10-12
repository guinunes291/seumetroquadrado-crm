// Roletas por zona (decisão do dono, 11/10/2026): "a roleta será apenas para
// o SDR e os corretores vendo em qual posição da fila estão. Por fila de
// zona." A ordem mora no banco (tests/db/roletas-fila-zona.test.ts prova que
// a fila prevista é a escolha do motor); aqui se trava o que a tela diz:
//   - o SDR escolhe a zona e vê a fila de cada roleta, com nomes;
//   - zona sem ninguém do time do SDR mostra para onde a visita vai;
//   - o corretor vê só a própria posição, e o atalho do check-in quando é ele
//     que falta.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { FilaRoleta, FilasZona, MinhaPosicao } from "@/features/roletas/fila-client";
import {
  comoAndaAVez,
  emZona,
  filaEmLinha,
  foraEmLinha,
  nomesCurtos,
  ordenarFilas,
  agruparFora,
  filasEmLinha,
  ordenarMinhas,
  textoMinhaPosicao,
  zonaInicial,
} from "@/features/roletas/fila-derive";

const estado = vi.hoisted(() => ({ filas: vi.fn(), minhas: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...p }: { children: React.ReactNode; to: string }) => (
    <a href={p.to}>{children}</a>
  ),
}));
vi.mock("@/features/roletas/fila-client", () => ({
  useFilasZona: (zona: string | null) =>
    useQuery({ queryKey: ["filas", zona], queryFn: () => estado.filas(zona) }),
  useMinhasPosicoes: () => useQuery({ queryKey: ["minhas"], queryFn: () => estado.minhas() }),
}));

import { FilaZonaCard } from "@/features/roletas/fila-zona-card";
import { MinhasPosicoesRoletas } from "@/features/roletas/minhas-posicoes-card";

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function roleta(extra: Partial<FilaRoleta> & Pick<FilaRoleta, "slug" | "papel">): FilaRoleta {
  return {
    nome: extra.slug,
    mecanica: "rodizio",
    equipe_fixa: false,
    exige_presenca: true,
    fora_do_horario: false,
    segue_zona: false,
    vez_unica: false,
    fila: [],
    fora: [],
    ...extra,
  };
}

const p = (posicao: number, nome: string) => ({ posicao, corretor_id: `id-${nome}`, nome });

const LESTE: FilasZona = {
  zona: "Leste",
  zona_estrita: true,
  zonas: ["Centro", "Leste"],
  roletas: [
    roleta({
      slug: "zona-leste",
      nome: "Roleta Zona Leste",
      papel: "zona",
      fila: [p(1, "Lara Lima"), p(2, "Leo Reis")],
      fora: [{ corretor_id: "id-luca", nome: "Luca Dias", motivos: ["ausente_hoje"] }],
    }),
    roleta({
      slug: "agendados-sdr",
      nome: "Agendados do SDR",
      papel: "sdr",
      mecanica: "ponderado_semana",
      exige_presenca: false,
      fila: [p(1, "Kamilla Lima"), p(2, "Maria Souza"), p(3, "Graziele Gomes")],
    }),
    roleta({
      slug: "cury",
      nome: "Cury Leopoldina",
      papel: "campanha",
      mecanica: "ponderado_faixa",
      equipe_fixa: true,
      fila: [p(1, "Pitter Reis")],
    }),
  ],
};

describe("o que a fila diz (puro)", () => {
  it("a fila em uma linha, com o resto contado", () => {
    const r = roleta({
      slug: "x",
      papel: "zona",
      fila: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => p(n, `Pessoa${n} Sobrenome`)),
    });
    expect(filaEmLinha(r, 3)).toBe("1º Pessoa1 · 2º Pessoa2 · 3º Pessoa3 · +5");
  });

  it("quem está fora diz por quê", () => {
    expect(foraEmLinha(LESTE.roletas[0])).toBe("Luca (sem check-in que libere a roleta hoje)");
  });

  it("a vez é uma só: quem é o 1º de outra zona aparece com a zona da vez", () => {
    // Visto em produção (11/10): Igor Nigro 1º no Sul e no Leste.
    const r = roleta({
      slug: "agendados-sdr",
      papel: "sdr",
      vez_unica: true,
      fila: [p(1, "Graziele Gomes")],
      fora: [
        {
          corretor_id: "id-igor",
          nome: "Igor Nigro",
          motivos: ["vez_em_outra_zona"],
          vez_em: "Sul",
        },
        {
          corretor_id: "id-gil",
          nome: "Gil Prado",
          motivos: ["vez_em_outra_zona"],
          vez_em: "Grande SP",
        },
      ],
    });
    expect(foraEmLinha(r)).toBe("Igor (vez no Sul), Gil (vez na Grande SP)");
    expect(emZona("Centro")).toBe("no Centro");
  });

  it("nome repetido na fila ganha a inicial do sobrenome", () => {
    // Visto no Centro (11/10): "1º Ana · 2º Andrew · 3º Ana".
    expect(nomesCurtos(["Ana Caroline Silva", "Andrew Lima", "Ana Rita Souza", "Bruno"])).toEqual([
      "Ana C.",
      "Andrew",
      "Ana R.",
      "Bruno",
    ]);
    const r = roleta({
      slug: "zona-centro",
      papel: "zona",
      fila: [p(1, "Ana Caroline Silva"), p(2, "Andrew Lima"), p(3, "Ana Rita Souza")],
    });
    expect(filaEmLinha(r)).toBe("1º Ana C. · 2º Andrew · 3º Ana R.");
  });

  it("nome repetido: a partícula não é sobrenome, e inicial repetida vira o sobrenome inteiro", () => {
    // "Ana de Souza" desempata por S., não por D.
    expect(nomesCurtos(["Ana de Souza", "Ana Caroline Lima"])).toEqual(["Ana S.", "Ana C."]);
    expect(nomesCurtos(["João dos Santos", "João Pedro"])).toEqual(["João S.", "João P."]);
    // A inicial também coincide: o sobrenome inteiro, só entre esses.
    expect(nomesCurtos(["Maria da Silva", "Maria Souza", "Maria Costa"])).toEqual([
      "Maria Silva",
      "Maria Souza",
      "Maria C.",
    ]);
    // Nome de um token só fica como está; sem repetição, nada muda.
    expect(nomesCurtos(["Ana", "Ana Silva", "Bruno de Paula"])).toEqual(["Ana", "Ana S.", "Bruno"]);
  });

  it("a ordem do painel: a fila do SDR primeiro", () => {
    expect(ordenarFilas(LESTE.roletas).map((r) => r.papel)).toEqual(["sdr", "zona", "campanha"]);
  });

  it("como a vez anda em cada mecânica", () => {
    expect(comoAndaAVez("rodizio")).toContain("há mais tempo sem receber");
    expect(comoAndaAVez("ponderado_semana")).toContain("meta");
    expect(comoAndaAVez("ponderado_faixa")).toContain("faixa A");
  });

  it("a zona que abre: a última olhada, se ainda existe", () => {
    expect(zonaInicial(["Centro", "Leste"], "Leste")).toBe("Leste");
    expect(zonaInicial(["Centro", "Leste"], "Marte")).toBe("Centro");
    expect(zonaInicial([], null)).toBeNull();
  });

  it("a posição do corretor: na fila, fora dela e sem zona", () => {
    const base: MinhaPosicao = {
      slug: "agendados-sdr",
      nome: "Agendados do SDR",
      papel: "sdr",
      zona: "Leste",
      mecanica: "rodizio",
      posicao: 1,
      total: 6,
      apto: true,
      motivos: [],
    };
    expect(textoMinhaPosicao(base)).toMatchObject({
      fila: "Agendados do SDR · Leste",
      valor: "1º de 6",
      detalhe: "Você é o próximo.",
    });
    expect(
      textoMinhaPosicao({ ...base, slug: "zona-leste", nome: "Roleta Zona Leste", papel: "zona" })
        .fila,
    ).toBe("Roleta Zona Leste");
    expect(
      textoMinhaPosicao({ ...base, papel: "campanha", nome: "Cury", zona: null, posicao: 3 }),
    ).toMatchObject({ fila: "Cury · lead sem zona", valor: "3º de 6", detalhe: null });
    const fora = textoMinhaPosicao({
      ...base,
      apto: false,
      posicao: null,
      motivos: ["ausente_hoje"],
    });
    expect(fora).toMatchObject({ valor: "fora da fila agora", checkin: true, apto: false });
    const semZona = textoMinhaPosicao({
      ...base,
      zona: null,
      apto: false,
      posicao: null,
      motivos: ["sem_zona_no_perfil"],
    });
    expect(semZona.fila).toBe("Agendados do SDR");
    expect(semZona.detalhe).toContain("Sem zona no perfil");
    expect(semZona.checkin).toBe(false);
    // A vez é uma só: ele é o 1º no Sul, então aqui (Leste) a vez passa.
    const vez = textoMinhaPosicao({
      ...base,
      apto: false,
      posicao: null,
      motivos: ["vez_em_outra_zona"],
      vez_em: "Sul",
    });
    expect(vez).toMatchObject({
      fila: "Agendados do SDR · Leste",
      valor: "vez no Sul",
      checkin: false,
      apto: false,
    });
    expect(vez.detalhe).toContain("Você é o próximo no Sul");
  });

  it("fora pela vez única: um grupo por zona da vez, com a fila e a zona de onde saiu", () => {
    const linha = (slug: string, nome: string, papel: MinhaPosicao["papel"], zona: string) =>
      ({
        slug,
        nome,
        papel,
        zona,
        mecanica: "rodizio",
        posicao: null,
        total: 2,
        apto: false,
        motivos: ["vez_em_outra_zona"],
        vez_em: "Sul",
      }) satisfies MinhaPosicao;
    const g = agruparFora([
      linha("agendados-sdr", "Agendados do SDR", "sdr", "Leste"),
      linha("zona-leste", "Roleta Zona Leste", "zona", "Leste"),
    ]);
    expect(g).toEqual([
      {
        chave: "vez_em_outra_zona:Sul",
        motivo: "vez_em_outra_zona",
        rotulo: "Sua vez agora é no Sul",
        filas: ["Agendados do SDR · Leste", "Roleta Zona Leste"],
        checkin: false,
      },
    ]);
  });

  it("fora da fila: uma linha por motivo, sem repetir a roleta de cada zona", () => {
    // Visto em produção (11/10): quem atende 3 zonas e não fez check-in tinha
    // 30+ linhas "fora da fila" — a mesma roleta, uma vez por zona.
    const linha = (
      slug: string,
      nome: string,
      papel: MinhaPosicao["papel"],
      zona: string,
      motivo: string,
    ): MinhaPosicao => ({
      slug,
      nome,
      papel,
      zona,
      mecanica: "rodizio",
      posicao: null,
      total: 0,
      apto: false,
      motivos: [motivo],
    });
    const xs: MinhaPosicao[] = [
      ...["Leste", "Oeste", "Sul"].flatMap((z) => [
        linha("marquinhos", "Roleta Marquinhos", "marquinhos", z, "ausente_hoje"),
        linha("cury", "Cury Leopoldina", "campanha", z, "ausente_hoje"),
        linha("jardim", "Jardim BF", "campanha", z, "ausente_hoje"),
      ]),
      linha("zona-leste", "Roleta Zona Leste", "zona", "Leste", "ausente_hoje"),
      linha("zona-norte", "Roleta Zona Norte", "zona", "Norte", "fora_da_regiao"),
      {
        ...linha("agendados-sdr", "Agendados do SDR", "sdr", "Leste", "x"),
        apto: true,
        posicao: 2,
        total: 3,
        motivos: [],
      },
    ];
    const g = agruparFora(xs);
    expect(g.map((x) => x.motivo)).toEqual(["ausente_hoje", "fora_da_regiao"]);
    expect(g[0].filas).toEqual(["Marquinhos", "Cury Leopoldina", "Jardim BF", "Roleta Zona Leste"]);
    expect(g[0].checkin).toBe(true);
    expect(g[1]).toMatchObject({
      rotulo: "Não atende esta zona",
      filas: ["Roleta Zona Norte"],
      checkin: false,
    });
    expect(filasEmLinha(g[0].filas)).toBe("Marquinhos, Cury Leopoldina, Jardim BF e mais 1");
    expect(filasEmLinha(["A", "B"])).toBe("A, B");
  });

  it("na Central, primeiro onde ele está na fila, pela posição", () => {
    const xs: MinhaPosicao[] = [
      {
        slug: "a",
        nome: "A",
        papel: "zona",
        zona: "Leste",
        mecanica: "rodizio",
        posicao: null,
        total: 3,
        apto: false,
        motivos: ["ausente_hoje"],
      },
      {
        slug: "b",
        nome: "B",
        papel: "campanha",
        zona: "Leste",
        mecanica: "rodizio",
        posicao: 4,
        total: 9,
        apto: true,
        motivos: [],
      },
      {
        slug: "c",
        nome: "C",
        papel: "sdr",
        zona: "Leste",
        mecanica: "rodizio",
        posicao: 2,
        total: 6,
        apto: true,
        motivos: [],
      },
    ];
    expect(ordenarMinhas(xs).map((x) => x.slug)).toEqual(["c", "b", "a"]);
  });
});

describe("FilaZonaCard (SDR e gestão)", () => {
  it("a fila do SDR em destaque, com nomes, e as outras roletas da zona", async () => {
    window.localStorage.setItem("smq:roleta-zona", "Leste");
    estado.filas.mockResolvedValue(LESTE);
    montar(<FilaZonaCard />);

    const card = screen.getByRole("region", { name: "Roleta" });
    await waitFor(() => expect(within(card).getAllByTestId("fila-pessoa")).toHaveLength(3));
    expect(estado.filas).toHaveBeenCalledWith("Leste");
    const fila = within(card).getAllByTestId("fila-pessoa");
    expect(fila.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Kamilla Lima"),
      expect.stringContaining("Maria Souza"),
      expect.stringContaining("Graziele Gomes"),
    ]);
    expect(fila[0].textContent).toContain("próximo");
    expect(card.textContent).toContain("fura a fila");
    expect(within(card).getByTestId("fila-zona-leste").textContent).toContain("1º Lara · 2º Leo");
    expect(within(card).getByTestId("fila-zona-leste").textContent).toContain("Luca");
    expect(within(card).getByTestId("fila-cury").textContent).toContain("equipe fixa");
  });

  it("trocar de zona lê a fila da outra e lembra a escolha", async () => {
    estado.filas.mockResolvedValue({ ...LESTE, roletas: [] });
    montar(<FilaZonaCard />);
    await waitFor(() => expect(estado.filas).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("radio", { name: "Sem zona" }));
    await waitFor(() => expect(estado.filas).toHaveBeenLastCalledWith(null));
    fireEvent.click(screen.getByRole("radio", { name: "Grande SP" }));
    await waitFor(() => expect(estado.filas).toHaveBeenLastCalledWith("Grande SP"));
    expect(window.localStorage.getItem("smq:roleta-zona")).toBe("Grande SP");
  });

  it("a fila do SDR com a vez única diz que a vez é uma só", async () => {
    window.localStorage.setItem("smq:roleta-zona", "Leste");
    estado.filas.mockResolvedValue({
      ...LESTE,
      roletas: [
        roleta({
          slug: "agendados-sdr",
          nome: "Agendados do SDR",
          papel: "sdr",
          exige_presenca: false,
          vez_unica: true,
          fila: [p(1, "Graziele Gomes")],
          fora: [
            {
              corretor_id: "id-igor",
              nome: "Igor Nigro",
              motivos: ["vez_em_outra_zona"],
              vez_em: "Sul",
            },
          ],
        }),
      ],
    });
    montar(<FilaZonaCard />);
    const card = screen.getByRole("region", { name: "Roleta" });
    await waitFor(() => expect(within(card).getAllByTestId("fila-pessoa")).toHaveLength(1));
    expect(card.textContent).toContain("A vez é uma só");
    expect(card.textContent).toContain("Fora agora: Igor (vez no Sul).");
  });

  it("zona sem ninguém do time do SDR: diz que a visita vai para o time da zona", async () => {
    window.localStorage.setItem("smq:roleta-zona", "Grande SP");
    estado.filas.mockResolvedValue({
      ...LESTE,
      zona: "Grande SP",
      roletas: [
        roleta({
          slug: "agendados-sdr",
          nome: "Agendados do SDR",
          papel: "sdr",
          fila: [],
          reserva: { slug: "zona-grande-sp", fila: [p(1, "Gil Prado")] },
        }),
      ],
    });
    montar(<FilaZonaCard />);
    const card = screen.getByRole("region", { name: "Roleta" });
    await waitFor(() =>
      expect(card.textContent).toContain("Ninguém do time do SDR atende a Grande SP"),
    );
    expect(within(card).getAllByTestId("fila-pessoa")[0].textContent).toContain("Gil Prado");
  });
});

describe("MinhasPosicoesRoletas (Central de Comando do corretor)", () => {
  it("a posição em cada fila e o atalho do check-in quando é ele que falta", async () => {
    estado.minhas.mockResolvedValue([
      {
        slug: "zona-leste",
        nome: "Roleta Zona Leste",
        papel: "zona",
        zona: "Leste",
        mecanica: "rodizio",
        posicao: null,
        total: 4,
        apto: false,
        motivos: ["ausente_hoje"],
      },
      {
        slug: "agendados-sdr",
        nome: "Agendados do SDR",
        papel: "sdr",
        zona: "Leste",
        mecanica: "ponderado_semana",
        posicao: 2,
        total: 6,
        apto: true,
        motivos: [],
      },
    ] satisfies MinhaPosicao[]);
    montar(<MinhasPosicoesRoletas />);
    const card = screen.getByRole("region", { name: "Sua vez nas roletas" });
    await waitFor(() => expect(within(card).getAllByTestId("minha-posicao")).toHaveLength(1));
    const linha = within(card).getByTestId("minha-posicao");
    expect(linha.textContent).toContain("Agendados do SDR · Leste");
    expect(linha.textContent).toContain("2º de 6");
    const fora = within(card).getByTestId("fora-grupo");
    expect(fora.textContent).toContain("Sem check-in");
    expect(fora.textContent).toContain("Roleta Zona Leste");
    expect(within(card).getByText("Fazer o check-in de hoje").getAttribute("href")).toBe(
      "/presenca",
    );
  });

  it("quem é o 1º no Sul vê, no Leste, que a vez está no Sul", async () => {
    const base = {
      slug: "agendados-sdr",
      nome: "Agendados do SDR",
      papel: "sdr",
      mecanica: "rodizio",
    } as const;
    estado.minhas.mockResolvedValue([
      { ...base, zona: "Sul", posicao: 1, total: 2, apto: true, motivos: [], vez_em: null },
      {
        ...base,
        zona: "Leste",
        posicao: null,
        total: 1,
        apto: false,
        motivos: ["vez_em_outra_zona"],
        vez_em: "Sul",
      },
    ] satisfies MinhaPosicao[]);
    montar(<MinhasPosicoesRoletas />);
    const card = screen.getByRole("region", { name: "Sua vez nas roletas" });
    await waitFor(() => expect(within(card).getAllByTestId("minha-posicao")).toHaveLength(1));
    expect(within(card).getByTestId("minha-posicao").textContent).toContain("Você é o próximo.");
    const fora = within(card).getByTestId("fora-grupo");
    expect(fora.textContent).toContain("Sua vez agora é no Sul");
    expect(fora.textContent).toContain("Agendados do SDR · Leste");
    expect(within(card).queryByText("Fazer o check-in de hoje")).toBeNull();
  });

  it("a vez em duas zonas diferentes: dois grupos, cada um com a própria chave", async () => {
    // key={g.motivo} repetia "vez_em_outra_zona" nos dois grupos (aviso do
    // React e risco de misturar as linhas): a chave é motivo + zona da vez.
    estado.minhas.mockResolvedValue([
      {
        slug: "agendados-sdr",
        nome: "Agendados do SDR",
        papel: "sdr",
        zona: "Leste",
        mecanica: "rodizio",
        posicao: null,
        total: 1,
        apto: false,
        motivos: ["vez_em_outra_zona"],
        vez_em: "Sul",
      },
      {
        slug: "zona-oeste",
        nome: "Roleta Zona Oeste",
        papel: "zona",
        zona: "Oeste",
        mecanica: "rodizio",
        posicao: null,
        total: 2,
        apto: false,
        motivos: ["vez_em_outra_zona"],
        vez_em: "Leste",
      },
    ] satisfies MinhaPosicao[]);
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      montar(<MinhasPosicoesRoletas />);
      const card = screen.getByRole("region", { name: "Sua vez nas roletas" });
      await waitFor(() => expect(within(card).getAllByTestId("fora-grupo")).toHaveLength(2));
      const grupos = within(card)
        .getAllByTestId("fora-grupo")
        .map((g) => g.textContent);
      expect(grupos[0]).toContain("Sua vez agora é no Sul");
      expect(grupos[0]).toContain("Agendados do SDR · Leste");
      expect(grupos[1]).toContain("Sua vez agora é no Leste");
      expect(grupos[1]).toContain("Roleta Zona Oeste");
      expect(erro.mock.calls.flat().map(String).join(" ")).not.toMatch(/same key/);
    } finally {
      erro.mockRestore();
    }
  });

  it("sem roleta nenhuma, diz quem monta as filas", async () => {
    estado.minhas.mockResolvedValue([]);
    montar(<MinhasPosicoesRoletas />);
    await waitFor(() => expect(screen.getByText(/Você não está em nenhuma roleta/)).toBeTruthy());
  });
});
