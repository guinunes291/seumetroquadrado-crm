// Quadro "Quem está em qual roleta" (decisão do dono, 13/10/2026: "precisamos
// deixar as roletas mais simples de entender quem está em qual roleta.
// Precisamos apenas dessas roletas: campanha Facebook Ads, por filial, SDR e
// Marquinhos"). Uma linha por corretor, uma coluna por roleta. Aqui se trava:
//   - a régua pura (lib/quadro-roletas): só participação ATIVA em roleta
//     ATIVA conta; pausa aparece mas não tira da coluna; Plantão/Landing/Base
//     e as zona-* antigas não são coluna nenhuma; "sem roleta" é sem as quatro;
//   - os filtros (filial, campanha, só sem roleta, busca sem acento);
//   - o texto da Marquinhos (posição no ranking quando a regra está ligada);
//   - a tela: admin edita campanhas e SDR pela RPC auditada; gestor só o time
//     dele; superintendente só lê; a Marquinhos é sempre só leitura; o SDR com
//     a regra semanal ligada também.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { agruparFiliais, type ZonaRoletaLinha } from "@/lib/distribuicao";
import {
  FILTRO_QUADRO_PADRAO,
  filtrarQuadro,
  montarQuadro,
  rotuloMarquinhos,
  totaisDoQuadro,
  type CorretorQuadro,
  type MarquinhosLinha,
  type MarquinhosRanking,
  type ParticipacaoQuadro,
} from "@/lib/quadro-roletas";

const linhaMapa = (
  zona: string,
  roleta: string,
  nome: string,
  filial: { slug: string; nome: string; ordem: number },
): ZonaRoletaLinha => ({
  zona,
  roleta_slug: roleta,
  roleta_nome: nome,
  roleta_ativa: true,
  filial_slug: filial.slug,
  filial_nome: filial.nome,
  filial_ordem: filial.ordem,
});
const BF = { slug: "barra-funda", nome: "Barra Funda", ordem: 1 };
const LIB = { slug: "liberdade", nome: "Liberdade", ordem: 2 };
const BEL = { slug: "belem", nome: "Belém", ordem: 3 };
// O mapa de produção (0079): Barra Funda = Norte/Sul/Oeste; Liberdade =
// Leste/Centro; Belém = Leste/Grande SP.
const MAPA: ZonaRoletaLinha[] = [
  linhaMapa("Norte", "filial-barra-funda", "Roleta Barra Funda", BF),
  linhaMapa("Sul", "filial-barra-funda", "Roleta Barra Funda", BF),
  linhaMapa("Oeste", "filial-barra-funda", "Roleta Barra Funda", BF),
  linhaMapa("Leste", "filial-liberdade", "Roleta Liberdade", LIB),
  linhaMapa("Centro", "filial-liberdade", "Roleta Liberdade", LIB),
  linhaMapa("Leste", "filial-belem", "Roleta Belém", BEL),
  linhaMapa("Grande SP", "filial-belem", "Roleta Belém", BEL),
];
const FILIAIS = agruparFiliais(MAPA);

const AGORA = Date.parse("2026-10-13T15:00:00Z");
const AMANHA = "2026-10-14T15:00:00Z";
const ONTEM = "2026-10-12T15:00:00Z";

const corretor = (id: string, nome: string, zonas: string[], extra: Partial<CorretorQuadro> = {}) =>
  ({ id, nome, ativo: true, presente: true, telefone: "11999990000", zonas, ...extra }) as const;

type RoletaEmbutida = {
  slug: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  filial_id?: string | null;
};
const CURY: RoletaEmbutida = {
  slug: "cury",
  nome: "Cury Leopoldina",
  tipo: "campanha",
  ativo: true,
  filial_id: null,
};
const VIBRA: RoletaEmbutida = {
  slug: "vibra-sabara",
  nome: "Vibra Sabará",
  tipo: "campanha",
  ativo: true,
  filial_id: null,
};
const ANTIGA: RoletaEmbutida = {
  slug: "campanha-velha",
  nome: "Campanha Velha",
  tipo: "campanha",
  ativo: false,
  filial_id: null,
};
const SDR: RoletaEmbutida = {
  slug: "agendados-sdr",
  nome: "Agendados do SDR",
  tipo: "sdr",
  ativo: true,
  filial_id: null,
};
const MARQ: RoletaEmbutida = {
  slug: "marquinhos",
  nome: "Roleta Marquinhos",
  tipo: "sistema",
  ativo: true,
  filial_id: null,
};
const PLANTAO: RoletaEmbutida = {
  slug: "plantao",
  nome: "Roleta Plantão",
  tipo: "sistema",
  ativo: false,
  filial_id: null,
};
const ZONA_NORTE: RoletaEmbutida = {
  slug: "zona-norte",
  nome: "Roleta Zona Norte",
  tipo: "zona",
  ativo: false,
  filial_id: null,
};
const FILIAL_BF: RoletaEmbutida = {
  slug: "filial-barra-funda",
  nome: "Roleta Barra Funda",
  tipo: "zona",
  ativo: true,
  filial_id: "f-bf",
};

const part = (
  corretorId: string,
  roleta: RoletaEmbutida,
  extra: Partial<Omit<ParticipacaoQuadro, "roleta">> = {},
): ParticipacaoQuadro => ({
  corretor_id: corretorId,
  ativo: true,
  pausado_ate: null,
  roleta,
  ...extra,
});

const marq = (
  corretorId: string,
  nome: string,
  resultado: MarquinhosLinha["resultado"],
  posicao: number | null,
  vendas: number,
): MarquinhosLinha => ({
  corretor_id: corretorId,
  nome,
  vendas,
  valor: vendas * 400_000,
  ultima_venda: vendas > 0 ? "2026-10-10" : null,
  bloqueado: resultado === "bloqueado_admin",
  posicao,
  resultado,
});

const RANKING: MarquinhosRanking = {
  regra_ativa: true,
  top_n: 6,
  janela_dias: 30,
  apurado_em: "2026-10-13T09:50:00Z",
  corretores: [
    marq("ana", "Ana Lima", "dentro", 2, 5),
    marq("bia", "Bia Reis", "fora", 9, 1),
    marq("caio", "Caio Prado", "bloqueado_admin", 1, 7),
    marq("dani", "Dani Souza", "sem_venda", null, 0),
  ],
};

describe("a régua do quadro (puro)", () => {
  // Ana: Barra Funda; Cury (ativa), Vibra (pausada até amanhã), uma campanha
  //      desligada; SDR; Marquinhos.
  // Bia: Liberdade e Belém (Leste/Centro/Grande SP); pausa vencida no SDR.
  // Caio: só no Plantão (desligado) e na zona-norte antiga → sem roleta.
  // Dani: participação INATIVA na Cury → sem roleta.
  const CORRETORES = [
    corretor("ana", "Ana Lima", ["Norte", "Sul", "Oeste"]),
    corretor("bia", "Bia Reis", ["Leste", "Centro", "Grande SP"]),
    corretor("caio", "Caio Prado", []),
    corretor("dani", "João Dani", []),
  ];
  const PARTS = [
    part("ana", CURY),
    part("ana", VIBRA, { pausado_ate: AMANHA }),
    part("ana", ANTIGA),
    part("ana", SDR),
    part("ana", MARQ),
    part("ana", FILIAL_BF),
    part("bia", SDR, { pausado_ate: ONTEM }),
    part("caio", PLANTAO),
    part("caio", ZONA_NORTE),
    part("dani", CURY, { ativo: false }),
  ];
  const linhas = montarQuadro(CORRETORES, PARTS, FILIAIS, RANKING, AGORA);
  const porId = new Map(linhas.map((l) => [l.corretor.id, l]));

  it("cada coluna é uma família; só participação ativa em roleta ativa conta", () => {
    const ana = porId.get("ana")!;
    expect(ana.filiais.map((f) => f.nome)).toEqual(["Barra Funda"]);
    // Ordenadas pelo nome; a desligada some; a pausada fica, marcada.
    expect(ana.campanhas).toEqual([
      { slug: "cury", nome: "Cury Leopoldina", pausado: false },
      { slug: "vibra-sabara", nome: "Vibra Sabará", pausado: true },
    ]);
    expect(ana.sdr).toEqual({ slug: "agendados-sdr", nome: "Agendados do SDR", pausado: false });
    expect(ana.marquinhos.participa?.slug).toBe("marquinhos");
    expect(ana.marquinhos.ranking?.posicao).toBe(2);
    expect(ana.semRoleta).toBe(false);
  });

  it("quem atende a Leste pode estar nas duas filiais; pausa vencida não é pausa", () => {
    const bia = porId.get("bia")!;
    expect(bia.filiais.map((f) => f.nome)).toEqual(["Liberdade", "Belém"]);
    expect(bia.sdr?.pausado).toBe(false);
    expect(bia.campanhas).toEqual([]);
  });

  it("Plantão, zona-* antiga e participação inativa não contam: é 'sem roleta'", () => {
    expect(porId.get("caio")!.semRoleta).toBe(true);
    expect(porId.get("caio")!.campanhas).toEqual([]);
    expect(porId.get("dani")!.semRoleta).toBe(true);
    expect(porId.get("dani")!.campanhas).toEqual([]);
  });

  it("os filtros: filial (pelo slug da filial), sem filial, campanha, sem roleta e busca sem acento", () => {
    const nomes = (f: Partial<typeof FILTRO_QUADRO_PADRAO>) =>
      filtrarQuadro(linhas, { ...FILTRO_QUADRO_PADRAO, ...f }).map((l) => l.corretor.id);
    expect(nomes({})).toEqual(["ana", "bia", "caio", "dani"]);
    expect(nomes({ filial: "belem" })).toEqual(["bia"]);
    expect(nomes({ filial: "liberdade" })).toEqual(["bia"]);
    expect(nomes({ filial: "sem" })).toEqual(["caio", "dani"]);
    expect(nomes({ campanha: "vibra-sabara" })).toEqual(["ana"]);
    expect(nomes({ campanha: "sem" })).toEqual(["bia", "caio", "dani"]);
    expect(nomes({ soSemRoleta: true })).toEqual(["caio", "dani"]);
    expect(nomes({ busca: "  JOAO " })).toEqual(["dani"]);
    expect(nomes({ filial: "barra-funda", campanha: "sem" })).toEqual([]);
  });

  it("os totais: pessoas por filial (quem está em duas conta nas duas), campanha, SDR, Marquinhos, sem roleta", () => {
    const t = totaisDoQuadro(linhas);
    expect(Object.fromEntries(t.porFilial)).toEqual({ "barra-funda": 1, liberdade: 1, belem: 1 });
    expect(Object.fromEntries(t.porCampanha)).toEqual({ cury: 1, "vibra-sabara": 1 });
    expect(t.sdr).toBe(2);
    expect(t.marquinhos).toBe(1);
    expect(t.semRoleta).toBe(2);
  });

  it("a célula da Marquinhos diz o porquê (regra ligada) ou só a participação (desligada)", () => {
    const rot = (id: string, r: MarquinhosRanking | null = RANKING) =>
      rotuloMarquinhos(porId.get(id)!.marquinhos, r);
    expect(rot("ana")).toEqual({ texto: "2º em vendas", dentro: true });
    expect(rot("bia")).toEqual({ texto: "Fora — 9º (top 6)", dentro: false });
    expect(rot("caio")).toEqual({ texto: "Bloqueado pela gestão", dentro: false });
    expect(rot("dani")).toEqual({ texto: "Sem venda em 30 dias", dentro: false });
    // Regra desligada (ou banco sem a 0088: ranking null) → só a participação.
    expect(rot("ana", null)).toEqual({ texto: "Na roleta", dentro: true });
    expect(rot("bia", { ...RANKING, regra_ativa: false })).toEqual({ texto: "—", dentro: false });
    // Pausado dentro do time aparece.
    const pausada = montarQuadro(
      [corretor("ana", "Ana Lima", [])],
      [part("ana", MARQ, { pausado_ate: AMANHA })],
      FILIAIS,
      RANKING,
      AGORA,
    )[0];
    expect(rotuloMarquinhos(pausada.marquinhos, RANKING).texto).toBe("2º em vendas · pausado");
  });
});

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

const estado = vi.hoisted(() => ({
  corretores: vi.fn(),
  participacoes: vi.fn(),
  roletas: vi.fn(),
  ranking: vi.fn(),
  minhaEquipe: vi.fn(),
  sdrCfg: { regra_ativa: false, modo_sombra: false },
  gerenciar: vi.fn(),
  gerenciarAsync: vi.fn(),
  atualizar: vi.fn(),
  presenca: vi.fn(),
}));

vi.mock("@/features/distribuicao/queries", () => ({
  useCorretoresDistribuicao: () =>
    useQuery({ queryKey: ["corretores"], queryFn: () => estado.corretores() }),
  useParticipacoesQuadro: () =>
    useQuery({ queryKey: ["part"], queryFn: () => estado.participacoes() }),
  useRoletas: () => useQuery({ queryKey: ["roletas"], queryFn: () => estado.roletas() }),
  useMarquinhosRanking: () => useQuery({ queryKey: ["ranking"], queryFn: () => estado.ranking() }),
  useCorretoresDaMinhaEquipe: (enabled: boolean) =>
    useQuery({ queryKey: ["equipe"], enabled, queryFn: () => estado.minhaEquipe() }),
  useZonasRoletas: () => useQuery({ queryKey: ["mapa"], queryFn: async () => MAPA }),
  useWipCorretores: () => useQuery({ queryKey: ["wip"], queryFn: async () => null }),
  useMarcarPresencaAdmin: () => ({ mutate: estado.presenca, isPending: false }),
  useAtualizarCorretorDistribuicao: () => ({ mutate: estado.atualizar, isPending: false }),
  useGerenciarParticipante: () => ({
    mutate: estado.gerenciar,
    mutateAsync: estado.gerenciarAsync,
    isPending: false,
  }),
}));

// Quem olha é uma gestora que não está na lista (a própria linha tem a regra
// da presença, coberta em roletas-por-filial-telas).
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "gestora" }, session: null, loading: false }),
}));

vi.mock("@/features/distribuicao/roleta-sdr-semanal-queries", () => ({
  useRoletaSdrConfig: () => ({ data: estado.sdrCfg }),
}));

import { QuadroRoletas } from "@/features/distribuicao/quadro-roletas";

const ROLETAS_DB = [
  { slug: "vibra-sabara", nome: "Vibra Sabará", tipo: "campanha", ativo: true },
  { slug: "cury", nome: "Cury Leopoldina", tipo: "campanha", ativo: true },
  { slug: "campanha-velha", nome: "Campanha Velha", tipo: "campanha", ativo: false },
  { slug: "agendados-sdr", nome: "Agendados do SDR", tipo: "sdr", ativo: true },
];

function preparar() {
  estado.corretores.mockResolvedValue([
    { ...corretor("ana", "Ana Lima", ["Norte", "Sul", "Oeste"]), v2: null },
    { ...corretor("bia", "Bia Reis", ["Leste", "Centro"]), v2: null },
    { ...corretor("caio", "Caio Prado", [], { telefone: null }), v2: null },
  ]);
  estado.participacoes.mockResolvedValue([
    part("ana", CURY),
    part("ana", MARQ),
    part("bia", SDR),
    part("caio", PLANTAO),
  ]);
  estado.roletas.mockResolvedValue(ROLETAS_DB);
  estado.ranking.mockResolvedValue({
    ...RANKING,
    corretores: [marq("ana", "Ana Lima", "dentro", 2, 5), marq("bia", "Bia Reis", "fora", 9, 1)],
  });
  estado.minhaEquipe.mockResolvedValue(new Set(["bia"]));
  estado.gerenciarAsync.mockResolvedValue({ ok: true });
}

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const linhaDe = async (nome: string) => {
  const linhas = await screen.findAllByTestId("quadro-linha");
  const l = linhas.find((tr) => tr.textContent?.includes(nome));
  if (!l) throw new Error(`linha de ${nome} não encontrada`);
  return l;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  estado.sdrCfg = { regra_ativa: false, modo_sombra: false };
});

describe("QuadroRoletas — admin", () => {
  it("uma linha por corretor, as quatro colunas, e quem está sem roleta em destaque", async () => {
    preparar();
    montar(<QuadroRoletas somenteLeitura={false} />);
    const ana = await linhaDe("Ana Lima");
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Corretor",
      "Presença hoje",
      "Filial",
      "Campanhas",
      "SDR",
      "Marquinhos",
    ]);
    expect(within(ana).getByRole("button", { name: "Filial de Ana Lima" }).textContent).toBe(
      "Barra Funda",
    );
    expect(within(ana).getByRole("button", { name: "Campanhas de Ana Lima" }).textContent).toBe(
      "Cury Leopoldina",
    );
    expect(within(ana).getByTestId("celula-marquinhos").textContent).toBe("2º em vendas");

    const bia = await linhaDe("Bia Reis");
    expect(within(bia).getByTestId("celula-marquinhos").textContent).toBe("Fora — 9º (top 6)");
    expect(
      within(bia).getByRole("checkbox", { name: "SDR: Bia Reis" }).getAttribute("aria-checked"),
    ).toBe("true");

    // O Plantão (desligado) não conta: Caio aparece sem roleta e sem telefone.
    const caio = await linhaDe("Caio Prado");
    expect(caio.textContent).toContain("Sem roleta");
    expect(caio.textContent).toContain("Sem telefone");
    expect(within(caio).getByRole("button", { name: "Filial de Caio Prado" }).textContent).toBe(
      "Sem filial",
    );

    const resumo = screen.getByTestId("quadro-resumo");
    expect(resumo.textContent).toContain("Barra Funda 1");
    expect(resumo.textContent).toContain("Liberdade 1");
    expect(resumo.textContent).toContain("Campanhas 2 · 1 vaga(s)");
    expect(resumo.textContent).toContain("Sem roleta 1");
  });

  it("campanhas: o popover lista só as ativas e salva cada mudança pela RPC auditada", async () => {
    preparar();
    montar(<QuadroRoletas somenteLeitura={false} />);
    const ana = await linhaDe("Ana Lima");
    fireEvent.click(within(ana).getByRole("button", { name: "Campanhas de Ana Lima" }));

    const cury = await screen.findByRole("checkbox", { name: "Cury Leopoldina" });
    const vibra = screen.getByRole("checkbox", { name: "Vibra Sabará" });
    expect(screen.queryByRole("checkbox", { name: "Campanha Velha" })).toBeNull();
    expect(cury.getAttribute("aria-checked")).toBe("true");
    expect(vibra.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("button", { name: /Salvar/ })).toBeNull();

    // Troca a Cury pela Vibra: entra uma, sai a outra, as duas pela RPC.
    fireEvent.click(vibra);
    fireEvent.click(cury);
    fireEvent.click(await screen.findByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(estado.gerenciarAsync).toHaveBeenCalledTimes(2));
    expect(estado.gerenciarAsync).toHaveBeenNthCalledWith(1, {
      slug: "vibra-sabara",
      corretorId: "ana",
      acao: "incluir",
      motivo: "Quadro de roletas",
    });
    expect(estado.gerenciarAsync).toHaveBeenNthCalledWith(2, {
      slug: "cury",
      corretorId: "ana",
      acao: "remover",
      motivo: "Quadro de roletas",
    });
  });

  it("SDR com a regra semanal desligada: a caixa inclui/remove pela RPC", async () => {
    preparar();
    montar(<QuadroRoletas somenteLeitura={false} />);
    const ana = await linhaDe("Ana Lima");
    fireEvent.click(within(ana).getByRole("checkbox", { name: "SDR: Ana Lima" }));
    expect(estado.gerenciar).toHaveBeenCalledWith({
      slug: "agendados-sdr",
      corretorId: "ana",
      acao: "incluir",
      motivo: "Quadro de roletas",
    });
  });

  it("SDR com a regra semanal ligada é só leitura (o time é da apuração); em sombra volta a editar", async () => {
    preparar();
    estado.sdrCfg = { regra_ativa: true, modo_sombra: false };
    const { unmount } = montar(<QuadroRoletas somenteLeitura={false} />);
    const bia = await linhaDe("Bia Reis");
    expect(within(bia).queryByRole("checkbox", { name: "SDR: Bia Reis" })).toBeNull();
    expect(bia.textContent).toContain("automático (regra semanal)");
    expect(bia.textContent).toContain("No time");
    unmount();

    estado.sdrCfg = { regra_ativa: true, modo_sombra: true };
    montar(<QuadroRoletas somenteLeitura={false} />);
    const bia2 = await linhaDe("Bia Reis");
    expect(within(bia2).getByRole("checkbox", { name: "SDR: Bia Reis" })).toBeTruthy();
  });

  it("a Marquinhos nunca tem controle no quadro (automática: mexe-se na aba Roletas)", async () => {
    preparar();
    montar(<QuadroRoletas somenteLeitura={false} />);
    const ana = await linhaDe("Ana Lima");
    const cel = within(ana).getByTestId("celula-marquinhos");
    expect(within(cel).queryByRole("checkbox")).toBeNull();
    expect(within(cel).queryByRole("button")).toBeNull();
  });

  it("o chip da filial e o 'Só quem está sem roleta' filtram as linhas", async () => {
    preparar();
    montar(<QuadroRoletas somenteLeitura={false} />);
    await linhaDe("Ana Lima");
    const resumo = screen.getByTestId("quadro-resumo");
    fireEvent.click(within(resumo).getByRole("button", { name: /^Liberdade/ }));
    expect(screen.getAllByTestId("quadro-linha").map((l) => l.textContent)).toEqual([
      expect.stringContaining("Bia Reis"),
    ]);
    fireEvent.click(within(resumo).getByRole("button", { name: /^Liberdade/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Só quem está sem roleta" }));
    expect(screen.getAllByTestId("quadro-linha").map((l) => l.textContent)).toEqual([
      expect.stringContaining("Caio Prado"),
    ]);
  });

  it("banco sem a 0088 (ranking null): a Marquinhos mostra só a participação", async () => {
    preparar();
    estado.ranking.mockResolvedValue(null);
    montar(<QuadroRoletas somenteLeitura={false} />);
    const ana = await linhaDe("Ana Lima");
    expect(within(ana).getByTestId("celula-marquinhos").textContent).toBe("Na roleta");
    const bia = await linhaDe("Bia Reis");
    expect(within(bia).getByTestId("celula-marquinhos").textContent).toBe("—");
  });
});

describe("QuadroRoletas — gestão sem ser admin", () => {
  it("gestor: campanhas e SDR só do time dele; filial e presença só leitura", async () => {
    preparar();
    montar(<QuadroRoletas somenteLeitura escopoEquipe />);
    const bia = await linhaDe("Bia Reis");
    await waitFor(() =>
      expect(within(bia).getByRole("button", { name: "Campanhas de Bia Reis" })).toBeTruthy(),
    );
    expect(within(bia).getByRole("checkbox", { name: "SDR: Bia Reis" })).toBeTruthy();

    const ana = await linhaDe("Ana Lima");
    expect(within(ana).queryByRole("button", { name: "Campanhas de Ana Lima" })).toBeNull();
    expect(within(ana).queryByRole("checkbox", { name: "SDR: Ana Lima" })).toBeNull();
    expect(ana.textContent).toContain("Cury Leopoldina");

    expect(screen.queryByRole("button", { name: /^Filial de/ })).toBeNull();
    // A presença aparece, mas travada (só o admin liga/desliga a dos outros).
    const presencas = screen.getAllByRole("switch", { name: /^Presença de/ });
    expect(presencas).toHaveLength(3);
    for (const s of presencas) expect(s).toBeDisabled();
    expect(within(ana).getByText("Barra Funda · Norte, Sul, Oeste")).toBeTruthy();
  });

  it("superintendente: tudo só leitura", async () => {
    preparar();
    montar(<QuadroRoletas somenteLeitura />);
    await linhaDe("Bia Reis");
    expect(screen.queryByRole("button", { name: /^Campanhas de/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /^SDR:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Filial de/ })).toBeNull();
    expect(estado.minhaEquipe).not.toHaveBeenCalled();
  });
});
