// Roletas por FILIAL — as telas (decisão do dono, 12/10/2026: "vamos montar
// roletas por filial, fica mais simples de distribuir em apenas 3 roletas";
// e "dentro de cada filial teremos algumas campanhas específicas para
// adicionar os corretores a receberem leads de outras zonas"). A regra mora
// no banco (tests/db/roletas-por-filial.test.ts); aqui se trava o que a tela
// diz e faz:
//   - a lista das filiais vem do banco (zonas_roletas + roletas + filiais),
//     nunca de uma constante; as seis zona-* antigas são só histórico;
//   - a região do corretor é escolhida por filial e salva como a UNIÃO das
//     zonas das filiais marcadas (a mesma RPC de sempre);
//   - as campanhas se agrupam pela filial dona; a de equipe fixa manda;
//   - os links antigos (?tab=zona-leste) caem na roleta da filial.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  ROLETA_LABEL,
  agruparFiliais,
  descricaoRoletaFilial,
  femininoNaFrase,
  filiaisDaRegiao,
  frasesAlternancia,
  listarNomes,
  ordenarZonas,
  roletaLabel,
  rotuloFilial,
  secoesDeCampanhas,
  uniaoDasZonas,
  zonasSoltas,
  type ZonaRoletaLinha,
} from "@/lib/distribuicao";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const linha = (
  zona: string,
  roleta: string,
  nome: string,
  filial: { slug: string; nome: string; ordem: number } | null,
  ativa = true,
): ZonaRoletaLinha => ({
  zona,
  roleta_slug: roleta,
  roleta_nome: nome,
  roleta_ativa: ativa,
  filial_slug: filial?.slug ?? null,
  filial_nome: filial?.nome ?? null,
  filial_ordem: filial?.ordem ?? null,
});

const BF = { slug: "barra-funda", nome: "Barra Funda", ordem: 1 };
const LIB = { slug: "liberdade", nome: "Liberdade", ordem: 2 };
const BEL = { slug: "belem", nome: "Belém", ordem: 3 };

// O mapa da 0079, embaralhado de propósito (a ordem vem de filiais.ordem) e
// com uma linha da roleta antiga inativa, que não pode aparecer.
const MAPA: ZonaRoletaLinha[] = [
  linha("Grande SP", "filial-belem", "Roleta Belém", BEL),
  linha("Leste", "filial-liberdade", "Roleta Liberdade", LIB),
  linha("Sul", "filial-barra-funda", "Roleta Barra Funda", BF),
  linha("Leste", "filial-belem", "Roleta Belém", BEL),
  linha("Centro", "filial-liberdade", "Roleta Liberdade", LIB),
  linha("Oeste", "filial-barra-funda", "Roleta Barra Funda", BF),
  linha("Norte", "filial-barra-funda", "Roleta Barra Funda", BF),
  linha("Norte", "zona-norte", "Roleta Zona Norte", null, false),
];

const estado = vi.hoisted(() => ({
  corretores: vi.fn(),
  mapa: vi.fn(),
  atualizar: vi.fn(),
  presenca: vi.fn(),
}));

// O usuário logado é "eu" (a própria linha do interruptor de presença).
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "eu" }, session: null, loading: false }),
}));

vi.mock("@/features/distribuicao/queries", () => ({
  useCorretoresDistribuicao: () =>
    useQuery({ queryKey: ["corretores"], queryFn: () => estado.corretores() }),
  useRoletasPorCorretor: () =>
    useQuery({ queryKey: ["roletas-por-corretor"], queryFn: async () => new Map() }),
  useWipCorretores: () => useQuery({ queryKey: ["wip"], queryFn: async () => null }),
  useZonasRoletas: () => useQuery({ queryKey: ["mapa"], queryFn: () => estado.mapa() }),
  useMarcarPresencaAdmin: () => ({ mutate: estado.presenca, isPending: false }),
  useAtualizarCorretorDistribuicao: () => ({ mutate: estado.atualizar, isPending: false }),
}));

import { TabCorretores } from "@/features/distribuicao/tab-corretores";

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("o mapa das filiais (puro)", () => {
  const filiais = agruparFiliais(MAPA);

  it("agrupa por roleta ativa com filial, na ordem das filiais, zonas na ordem dos chips", () => {
    expect(filiais.map((f) => f.nome)).toEqual(["Barra Funda", "Liberdade", "Belém"]);
    expect(filiais.map((f) => f.roletaSlug)).toEqual([
      "filial-barra-funda",
      "filial-liberdade",
      "filial-belem",
    ]);
    expect(filiais.map((f) => f.zonas)).toEqual([
      ["Norte", "Sul", "Oeste"],
      ["Leste", "Centro"],
      ["Leste", "Grande SP"],
    ]);
    expect(ordenarZonas(["Grande SP", "Leste", "Marte", "Leste"])).toEqual([
      "Leste",
      "Grande SP",
      "Marte",
    ]);
  });

  it("a região do corretor é por filial inteira; a Leste sozinha não é a Liberdade nem a Belém", () => {
    expect(filiaisDaRegiao(filiais, ["Leste", "Grande SP"]).map((f) => f.nome)).toEqual(["Belém"]);
    expect(filiaisDaRegiao(filiais, ["Centro", "Leste", "Grande SP"]).map((f) => f.nome)).toEqual([
      "Liberdade",
      "Belém",
    ]);
    expect(filiaisDaRegiao(filiais, ["Leste"])).toEqual([]);
    expect(zonasSoltas(filiais, ["Leste"])).toEqual(["Leste"]);
    expect(zonasSoltas(filiais, ["Leste", "Grande SP", "Sul"])).toEqual(["Sul"]);
    expect(zonasSoltas(filiais, ["Leste", "Grande SP"])).toEqual([]);
  });

  it("salvar manda a UNIÃO das zonas das filiais marcadas — o que a RPC exige", () => {
    expect(uniaoDasZonas(filiais, new Set(["belem"]))).toEqual(["Leste", "Grande SP"]);
    expect(uniaoDasZonas(filiais, new Set(["liberdade", "belem"]))).toEqual([
      "Leste",
      "Centro",
      "Grande SP",
    ]);
    expect(uniaoDasZonas(filiais, new Set())).toEqual([]);
  });

  it("os textos: rótulo, gênero, lista e quem alterna", () => {
    expect(rotuloFilial(filiais[2])).toBe("Belém — Leste, Grande SP");
    expect(rotuloFilial(filiais[2], " · ")).toBe("Belém · Leste, Grande SP");
    expect(listarNomes(["Norte", "Sul", "Oeste"])).toBe("Norte, Sul e Oeste");
    expect(listarNomes(["Belém"])).toBe("Belém");
    for (const n of ["Belém", "Liberdade", "Barra Funda", "Grande SP"]) {
      expect(femininoNaFrase(n), n).toBe(true);
    }
    for (const n of ["Sul", "Centro", "Leste"]) expect(femininoNaFrase(n), n).toBe(false);
    expect(frasesAlternancia(filiais)).toEqual(["A Leste alterna entre Liberdade e Belém."]);
    expect(descricaoRoletaFilial(filiais[2], filiais)).toBe(
      "Time fixo da Belém: recebe os leads das zonas Leste e Grande SP. A Leste alterna com a Liberdade.",
    );
    expect(descricaoRoletaFilial(filiais[0], filiais)).toBe(
      "Time fixo da Barra Funda: recebe os leads das zonas Norte, Sul e Oeste.",
    );
  });

  it("as campanhas se agrupam pela filial dona; as sem filial (ou de filial sumida) no fim", () => {
    const filiaisDb = [
      { id: "f-bel", nome: "Belém", ordem: 3 },
      { id: "f-bf", nome: "Barra Funda", ordem: 1 },
    ];
    const campanhas = [
      { slug: "well", filial_id: "f-bf" },
      { slug: "cury", filial_id: null },
      { slug: "jardim", filial_id: "f-bel" },
      { slug: "orfa", filial_id: "f-apagada" },
    ];
    expect(
      secoesDeCampanhas(campanhas, filiaisDb).map((s) => [s.titulo, s.filas.map((c) => c.slug)]),
    ).toEqual([
      ["Campanhas · Barra Funda", ["well"]],
      ["Campanhas · Belém", ["jardim"]],
      ["Campanhas · sem filial", ["cury", "orfa"]],
    ]);
    expect(secoesDeCampanhas([], filiaisDb)).toEqual([]);
  });

  it("o vocabulário: as três de filial têm rótulo, as seis antigas são '(antiga)'", () => {
    expect(roletaLabel("filial-belem")).toBe("Roleta Belém");
    expect(roletaLabel("filial-barra-funda", "Roleta Barra Funda")).toBe("Roleta Barra Funda");
    expect(roletaLabel("zona-leste")).toBe("Roleta Zona Leste (antiga)");
    expect(Object.keys(ROLETA_LABEL).filter((s) => s.startsWith("zona-"))).toHaveLength(6);
    expect(read("src/lib/distribuicao.ts")).not.toContain("ZONA_ROLETAS");
  });
});

describe("as telas (contratos no fonte)", () => {
  it("a aba Filas lista as roletas de filial pelo tipo e ordena por filiais.ordem — sem constante", () => {
    const filas = read("src/features/distribuicao/tab-filas.tsx");
    expect(filas).not.toContain("ZONA_ROLETAS");
    expect(filas).toContain('r.tipo === "zona"');
    expect(filas).toContain("useFiliais");
    expect(filas).toContain("Roletas por filial");
    expect(filas).toContain("secoesDeCampanhas");
    expect(filas).toContain("A campanha manda: quem está na equipe recebe, de qualquer zona");
    expect(filas).toContain("filialSlug");
    expect(filas).not.toContain("atende a zona");
  });

  it("a Visão geral tira os cartões de useRoletas (tipo zona), com Storefront e a frase da filial", () => {
    const visao = read("src/features/distribuicao/tab-visao-geral.tsx");
    expect(visao).not.toContain("ZONA_ROLETAS");
    expect(visao).toContain("Storefront");
    expect(visao).toContain('r.tipo === "zona" && r.ativo');
    expect(visao).toContain("das outras zonas, espera aqui");
  });

  it("os links antigos de zona caem na roleta da filial que herdou a zona", () => {
    const rota = read("src/routes/_authenticated/distribuicao.tsx");
    for (const [antigo, novo] of [
      ["zona-oeste", "filial-barra-funda"],
      ["zona-norte", "filial-barra-funda"],
      ["zona-sul", "filial-barra-funda"],
      ["zona-centro", "filial-liberdade"],
      ["zona-leste", "filial-liberdade"],
      ["zona-grande-sp", "filial-belem"],
    ]) {
      expect(rota).toContain(`"${antigo}": "${novo}"`);
    }
    for (const f of ["filial-barra-funda", "filial-liberdade", "filial-belem"]) {
      expect(rota).toContain(`"${f}": "${f}"`);
    }
  });

  it("a campanha ganha filial nas propriedades e na criação, pela fronteira pendentes.ts", () => {
    const props = read("src/features/distribuicao/fila-propriedades.tsx");
    expect(props).toContain("filialSlug: v === SEM_FILIAL ? null : v");
    expect(props).toContain("Filial da campanha");
    expect(props).not.toContain("(respeita zonas)");
    const queries = read("src/features/distribuicao/queries.ts");
    expect(queries).toContain("_filial_slug: args.filialSlug ?? undefined");
    expect(queries).toContain("_limpar_filial: args.filialSlug === null");
    expect(queries).toContain('supabasePendente.rpc("criar_roleta_campanha"');
    expect(queries).toContain('supabasePendente.rpc("atualizar_roleta"');
    expect(queries).toContain("useZonasRoletas");
    const pendentes = read("src/integrations/supabase/pendentes.ts");
    expect(pendentes).toContain("filial_id: string | null");
    expect(pendentes).toContain("_filial_slug?: string");
    expect(pendentes).toContain("_limpar_filial?: boolean");
  });

  it("a chave da vez única, o manual e a aba Corretores falam de filial", () => {
    expect(read("src/features/distribuicao/tab-configuracoes.tsx")).toContain(
      "Por zona nos Agendados do SDR e por filial nas roletas de filial",
    );
    const manual = read("src/features/manual/conteudo-operacao.tsx");
    expect(manual).toContain("Roletas por filial.");
    expect(manual).toContain("alterna entre Liberdade e Belém");
    const corretores = read("src/features/distribuicao/tab-corretores.tsx");
    expect(corretores).toContain("FiliaisEditor");
    expect(corretores).toContain("uniaoDasZonas");
    expect(corretores).not.toContain("ZonasEditor");
    expect(corretores).not.toContain("ZONAS_REGIAO");
  });
});

describe("aba Corretores: a região por filial", () => {
  const corretor = (id: string, nome: string, zonas: string[]) => ({
    id,
    nome,
    ativo: true,
    presente: true,
    telefone: "11999990000",
    zonas,
    v2: null,
  });

  it("marca as filiais inteiras da região e salva a união das marcadas", async () => {
    estado.corretores.mockResolvedValue([corretor("lia", "Lia Souza", ["Leste", "Grande SP"])]);
    estado.mapa.mockResolvedValue(MAPA);
    montar(<TabCorretores somenteLeitura={false} />);

    const botao = await screen.findByRole("button", { name: "Região de Lia Souza" });
    expect(botao.textContent).toBe("Belém");
    fireEvent.click(botao);

    const belem = await screen.findByRole("checkbox", { name: "Belém — Leste, Grande SP" });
    const liberdade = screen.getByRole("checkbox", { name: "Liberdade — Leste, Centro" });
    const barraFunda = screen.getByRole("checkbox", { name: "Barra Funda — Norte, Sul, Oeste" });
    expect(belem.getAttribute("aria-checked")).toBe("true");
    expect(liberdade.getAttribute("aria-checked")).toBe("false");
    expect(barraFunda.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("button", { name: /Salvar/ })).toBeNull();

    // Quem atende a Leste pode estar nas duas lojas: marcar a Liberdade manda
    // a união (Leste, Centro, Grande SP), nunca só a zona nova.
    fireEvent.click(liberdade);
    fireEvent.click(await screen.findByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(estado.atualizar).toHaveBeenCalledTimes(1));
    expect(estado.atualizar).toHaveBeenCalledWith({
      corretorId: "lia",
      zonas: ["Leste", "Centro", "Grande SP"],
    });
  });

  it("desmarcar a Belém de quem está nas duas deixa só a Liberdade (Leste continua)", async () => {
    estado.corretores.mockResolvedValue([
      corretor("igor", "Igor Nigro", ["Centro", "Leste", "Grande SP"]),
    ]);
    estado.mapa.mockResolvedValue(MAPA);
    montar(<TabCorretores somenteLeitura={false} />);

    const botao = await screen.findByRole("button", { name: "Região de Igor Nigro" });
    expect(botao.textContent).toBe("Liberdade, Belém");
    fireEvent.click(botao);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Belém — Leste, Grande SP" }));
    fireEvent.click(await screen.findByRole("button", { name: /Salvar/ }));
    await waitFor(() =>
      expect(estado.atualizar).toHaveBeenCalledWith({
        corretorId: "igor",
        zonas: ["Leste", "Centro"],
      }),
    );
  });

  it("em leitura, mostra a filial com as zonas; zona solta sem filial completa aparece como zona", async () => {
    estado.corretores.mockResolvedValue([
      corretor("ana", "Ana Lima", ["Leste", "Grande SP", "Sul"]),
      corretor("bia", "Bia Reis", []),
    ]);
    estado.mapa.mockResolvedValue(MAPA);
    montar(<TabCorretores somenteLeitura />);

    const linhaAna = (await screen.findByText("Ana Lima")).closest("tr");
    expect(linhaAna).not.toBeNull();
    expect(within(linhaAna as HTMLElement).getByText("Belém · Leste, Grande SP")).toBeTruthy();
    expect(within(linhaAna as HTMLElement).getByText("Sul")).toBeTruthy();
    const linhaBia = screen.getByText("Bia Reis").closest("tr") as HTMLElement;
    expect(within(linhaBia).getByText("Sem região")).toBeTruthy();
  });
});

describe("aba Corretores: o interruptor de presença na própria linha", () => {
  const corretor = (id: string, nome: string, presente: boolean) => ({
    id,
    nome,
    ativo: true,
    presente,
    telefone: "11999990000",
    zonas: [],
    v2: null,
  });

  it("a gestão não se liga nas roletas (decisão do dono, 13/10/2026): a própria linha ausente fica travada, com o porquê; a dos outros, não", async () => {
    estado.corretores.mockResolvedValue([
      corretor("eu", "Ingrid Queiroz", false),
      corretor("rafa", "Rafa Lima", false),
    ]);
    estado.mapa.mockResolvedValue(MAPA);
    montar(<TabCorretores somenteLeitura={false} />);

    const propria = await screen.findByRole("switch", { name: "Presença de Ingrid Queiroz" });
    expect(propria).toBeDisabled();
    const porque = screen.getByText(
      "Você: o seu check-in é pelo Check-in da barra lateral, com a localização do celular.",
    );
    expect(propria).toHaveAttribute("aria-describedby", porque.id);
    fireEvent.click(propria);
    expect(estado.presenca).not.toHaveBeenCalled();

    const outro = screen.getByRole("switch", { name: "Presença de Rafa Lima" });
    expect(outro).toBeEnabled();
    fireEvent.click(outro);
    expect(estado.presenca).toHaveBeenCalledWith({ corretorId: "rafa", presente: true });
  });

  it("presente, a própria linha pode se DESLIGAR (encerrar o dia) — sem o aviso", async () => {
    estado.corretores.mockResolvedValue([corretor("eu", "Ingrid Queiroz", true)]);
    estado.mapa.mockResolvedValue(MAPA);
    montar(<TabCorretores somenteLeitura={false} />);

    const propria = await screen.findByRole("switch", { name: "Presença de Ingrid Queiroz" });
    expect(propria).toBeEnabled();
    expect(screen.queryByText(/Você: o seu check-in é pelo Check-in da barra lateral/)).toBeNull();
    fireEvent.click(propria);
    expect(estado.presenca).toHaveBeenCalledWith({ corretorId: "eu", presente: false });
  });
});
