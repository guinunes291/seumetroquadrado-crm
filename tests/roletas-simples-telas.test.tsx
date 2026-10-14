// Roletas simples — as telas (decisão do dono, 13/10/2026: "precisamos apenas
// dessas roletas no sistema: campanha Facebook Ads (independe a filial),
// por filial, SDR e Marquinhos"). A regra mora no banco
// (tests/db/roletas-simples.test.ts, estoque-filiais, marquinhos-automatica);
// aqui se trava o que a Central diz e faz:
//   - quatro famílias, nesta ordem, e nenhum grupo "Sistema" (Plantão,
//     Landing e Base ficam só no histórico, como "(antiga)");
//   - campanha sem filial dona e sem interruptor de equipe fixa;
//   - Origens → roleta com só dois destinos (o banco recusa o resto);
//   - o estoque escoa pelas filiais; os indicadores falam de filial/SDR;
//   - a Marquinhos automática: ranking, Bloquear (com confirmação),
//     Devolver à regra e Apurar agora — e só o admin mexe.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  FAMILIAS_ROLETA,
  FAMILIA_ROLETA_LABEL,
  GATILHO_LABEL,
  familiaDaRoleta,
  roletaLabel,
} from "@/lib/distribuicao";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("o vocabulário das quatro roletas (puro)", () => {
  it("quatro famílias, na ordem do dono", () => {
    expect(FAMILIAS_ROLETA.map((f) => FAMILIA_ROLETA_LABEL[f])).toEqual([
      "Campanhas Facebook Ads",
      "Filiais",
      "SDR",
      "Marquinhos",
    ]);
  });

  it("cada roleta do banco cai numa família — ou em nenhuma (as desligadas de sistema e as zona-*)", () => {
    // Os slugs e tipos reais de produção (roletas, 13/10/2026).
    const casos: Array<[string, string, string | null, string | null]> = [
      ["vibra-sabara", "campanha", null, "campanha"],
      ["filial-belem", "zona", "f-bel", "filial"],
      ["agendados-sdr", "sdr", null, "sdr"],
      ["marquinhos", "sistema", null, "marquinhos"],
      ["plantao", "sistema", null, null],
      ["landing", "sistema", null, null],
      ["base", "sistema", null, null],
      ["zona-leste", "zona", null, null],
    ];
    for (const [slug, tipo, filial_id, familia] of casos) {
      expect(familiaDaRoleta({ slug, tipo, filial_id }), slug).toBe(familia);
    }
  });

  it("Plantão, Landing e Base ficam só como '(antiga)' no histórico", () => {
    expect(roletaLabel("plantao")).toBe("Roleta Plantão (antiga)");
    expect(roletaLabel("landing")).toBe("Roleta Landing Page (antiga)");
    expect(roletaLabel("base")).toBe("Roleta Base (antiga)");
    expect(roletaLabel("marquinhos")).toBe("Roleta Marquinhos");
  });

  it("o histórico lê os gatilhos novos do banco (estoque e campanha sem apto)", () => {
    for (const g of [
      "estoque",
      "campanha_equipe_sem_apto",
      "campanha_equipe_fixa_sem_zona",
      "fallback_velocidade",
    ]) {
      expect(GATILHO_LABEL[g], g).toBeTruthy();
    }
  });
});

describe("as telas (contratos no fonte)", () => {
  it("a aba Roletas: as quatro famílias, sem Sistema; escoar estoque pelas filiais", () => {
    const filas = read("src/features/distribuicao/tab-filas.tsx");
    expect(filas).toContain("FAMILIAS_ROLETA.map");
    expect(filas).not.toContain('"sistema"');
    expect(filas).not.toContain("ORDEM_SISTEMA");
    expect(filas).toContain("useEscoarEstoqueFiliais");
    expect(filas).toContain("Escoar estoque (todas as filiais)");
    // A nova campanha pede só o nome (sem filial, sem equipe fixa).
    const dialog = filas.slice(filas.indexOf("function NovaCampanhaDialog"));
    expect(dialog).not.toContain("Switch");
    expect(dialog).not.toContain("<Select");
    expect(dialog).not.toContain("filialSlug");
    expect(dialog).toContain("corretores de qualquer filial");
  });

  it("as propriedades da campanha: sem interruptor de equipe fixa e sem filial", () => {
    const props = read("src/features/distribuicao/fila-propriedades.tsx");
    expect(props).not.toContain("equipeFixa");
    expect(props).not.toContain("useFiliais");
    expect(props).toContain("de qualquer zona e de qualquer filial");
  });

  it("Origens → roleta: só 'Filiais' (NULL) e 'Roleta Marquinhos'", () => {
    const cfg = read("src/features/distribuicao/tab-configuracoes.tsx");
    const select = cfg.slice(cfg.indexOf("<SelectContent>", cfg.indexOf("SEM_ROLETA}>") - 400));
    const itens = select.slice(0, select.indexOf("</SelectContent>"));
    expect(itens).toContain("Filiais (zona do lead; sem zona, rodízio)");
    expect(itens).toContain('<SelectItem value="marquinhos">Roleta Marquinhos</SelectItem>');
    // Um valor antigo ainda gravado aparece, mas desabilitado (não se escolhe).
    expect(itens).toMatch(/<SelectItem value=\{c\.roleta_slug\} disabled>/);
    expect(itens).not.toContain("roletasAtivas.map");
  });

  it("a Central: abas e indicadores falam de filial, Marquinhos e SDR (sem Landing)", () => {
    const cc = read("src/features/distribuicao/command-center.tsx");
    expect(cc).toContain('<TabsTrigger value="filas">Roletas</TabsTrigger>');
    expect(cc).toContain('<TabsTrigger value="corretores">Quem está em qual roleta</TabsTrigger>');
    expect(cc).toContain('title="Aptos · Filiais"');
    expect(cc).toContain('title="Aptos · Marquinhos"');
    expect(cc).toContain('title="Time do SDR"');
    expect(cc).not.toContain("Aptos · Landing");
    expect(cc).not.toContain("Aptos · Plantão");
    // Banco antigo sem a chave nova: cai na antiga.
    expect(cc).toContain("aptos_filiais ?? ");
  });

  it("a Visão geral diz de quem é a vez do lead sem zona", () => {
    const visao = read("src/features/distribuicao/tab-visao-geral.tsx");
    expect(visao).toContain('data-testid="sem-zona-da-vez"');
    expect(visao).toContain("rodízio entre as filiais");
  });

  it("as exceções reenviam só para roleta ativa de família (nada de Plantão/Landing)", () => {
    const exc = read("src/features/distribuicao/tab-excecoes.tsx");
    expect(exc).toContain("useRoletas");
    expect(exc).toContain("familiaDaRoleta");
    expect(exc).not.toContain("ROLETA_LABEL");
  });

  it("a Política tem o cartão da Marquinhos automática (as chaves nunca ficam órfãs)", () => {
    const pol = read("src/features/distribuicao/tab-politica.tsx");
    for (const chave of ["marquinhos_regra_ativa", "marquinhos_top_n", "marquinhos_janela_dias"]) {
      expect(pol).toContain(`chave="${chave}"`);
    }
  });

  it("as RPCs novas pela fronteira de compatibilidade (banco sem a 0084/0085 não quebra a tela)", () => {
    const q = read("src/features/distribuicao/queries.ts");
    expect(q).toContain('rpc("distribuir_estoque_filiais"');
    expect(q).toContain('rpc("marquinhos_ranking_v1"');
    expect(q).toContain('rpc("marquinhos_apurar"');
    expect(q).not.toMatch(/export function useEscoarEstoque\(/);
    // O ranking cai em null (a tela volta à Marquinhos manual) se a RPC não existir.
    const ranking = q.slice(q.indexOf("export function useMarquinhosRanking"));
    expect(ranking.slice(0, 1200)).toContain("rpcWithFallback");
  });

  it("o manual e a rota antiga contam a mesma história", () => {
    const manual = read("src/features/manual/conteudo-operacao.tsx");
    expect(manual).toContain("Marquinhos");
    expect(manual).toContain("rodízio");
    expect(manual).toContain("quem está em qual roleta");
    expect(manual).toContain("Campanhas Facebook Ads, Filiais, SDR e Marquinhos");
    const rota = read("src/routes/_authenticated/distribuicao.tsx");
    expect(rota).toMatch(/^\s+plantao: undefined,/m);
  });
});

// ---------------------------------------------------------------------------
// A Marquinhos automática (aba Roletas → Marquinhos)
// ---------------------------------------------------------------------------

const estado = vi.hoisted(() => ({
  ranking: vi.fn(),
  elig: vi.fn(),
  gerenciar: vi.fn(),
  apurar: vi.fn(),
}));

vi.mock("@/features/distribuicao/queries", () => {
  const vazio = (chave: string) => () =>
    useQuery({ queryKey: [chave], queryFn: async () => [] as unknown[] });
  return {
    useMarquinhosRanking: () =>
      useQuery({ queryKey: ["ranking"], queryFn: () => estado.ranking() }),
    useElegibilidadeRoleta: () => useQuery({ queryKey: ["elig"], queryFn: () => estado.elig() }),
    useGerenciarParticipante: () => ({ mutate: estado.gerenciar, isPending: false }),
    useApurarMarquinhos: () => ({ mutate: estado.apurar, isPending: false }),
    useVendasMesAnterior: vazio("vendas"),
    useRoletasPorCorretor: () =>
      useQuery({ queryKey: ["rpc"], queryFn: async () => new Map<string, unknown>() }),
    useCorretoresDisponiveis: vazio("disp"),
    useCorretoresDaMinhaEquipe: () =>
      useQuery({ queryKey: ["eq"], queryFn: async () => new Set<string>() }),
    useCorretoresDaMinhaEquipeLista: vazio("eql"),
    useRoletas: vazio("roletas"),
    useZonasRoletas: vazio("mapa"),
  };
});

vi.mock("@/features/academia/selo-habilitado", () => ({ SeloHabilitadoAcademia: () => null }));

import { RoletaTab } from "@/features/distribuicao/roleta-tab";

const linhaRanking = (
  id: string,
  nome: string,
  resultado: "dentro" | "fora" | "sem_venda" | "bloqueado_admin",
  posicao: number | null,
  vendas: number,
) => ({
  corretor_id: id,
  nome,
  vendas,
  valor: vendas * 350_000,
  ultima_venda: vendas ? "2026-10-10" : null,
  bloqueado: resultado === "bloqueado_admin",
  posicao,
  resultado,
});

const elig = (id: string, apto: boolean, motivos: string[] = []) => ({
  corretor_id: id,
  nome: id,
  participante_ativo: true,
  apto,
  motivos,
});

function preparar(regraAtiva = true) {
  estado.ranking.mockResolvedValue({
    regra_ativa: regraAtiva,
    top_n: 6,
    janela_dias: 30,
    status_venda: ["pendente", "aprovada"],
    apurado_em: "2026-10-13T09:50:00Z",
    corretores: [
      linhaRanking("ana", "Ana Lima", "dentro", 1, 5),
      linhaRanking("caio", "Caio Prado", "bloqueado_admin", 2, 4),
      linhaRanking("bia", "Bia Reis", "fora", 7, 1),
      linhaRanking("dani", "Dani Souza", "sem_venda", null, 0),
    ],
  });
  estado.elig.mockResolvedValue([elig("ana", false, ["sem_checkin_hoje"])]);
}

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Marquinhos automática", () => {
  it("o ranking: posição, vendas, quem está no time; sem venda vira só um número", async () => {
    preparar();
    montar(<RoletaTab slug="marquinhos" somenteLeitura={false} />);
    const linhas = await screen.findAllByTestId("marquinhos-linha");
    expect(linhas.map((l) => within(l).getAllByRole("cell")[1].textContent)).toEqual([
      "Ana Lima",
      "Caio Prado",
      "Bia Reis",
    ]);
    expect(linhas[0].textContent).toContain("No time");
    expect(linhas[1].textContent).toContain("Bloqueado pela gestão");
    expect(linhas[2].textContent).toContain("Fora do top");
    expect(screen.getByText(/\+ 1 corretor\(es\) sem venda nos últimos 30 dias/)).toBeTruthy();
    expect(screen.getByText(/Automática: entram os/).textContent).toContain(
      "6 corretores com mais vendas assinadas nos últimos 30 dias",
    );
  });

  it("Bloquear pede confirmação e vai pela RPC (remover); Devolver à regra inclui de volta", async () => {
    preparar();
    montar(<RoletaTab slug="marquinhos" somenteLeitura={false} />);
    const [ana, caio] = await screen.findAllByTestId("marquinhos-linha");

    fireEvent.click(within(ana).getByRole("button", { name: "Bloquear" }));
    expect(estado.gerenciar).not.toHaveBeenCalled();
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo.textContent).toContain("Bloquear Ana Lima na Roleta Marquinhos?");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Bloquear" }));
    expect(estado.gerenciar).toHaveBeenCalledWith({
      slug: "marquinhos",
      corretorId: "ana",
      acao: "remover",
      motivo: "Bloqueado na Roleta Marquinhos pela gestão",
    });

    fireEvent.click(within(caio).getByRole("button", { name: "Devolver à regra" }));
    expect(estado.gerenciar).toHaveBeenLastCalledWith({
      slug: "marquinhos",
      corretorId: "caio",
      acao: "incluir",
      motivo: "Devolvido à regra (top em vendas) pela gestão",
    });
  });

  it("Apurar agora roda a apuração na hora", async () => {
    preparar();
    montar(<RoletaTab slug="marquinhos" somenteLeitura={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Apurar agora/ }));
    expect(estado.apurar).toHaveBeenCalledTimes(1);
  });

  it("gestor e superintendente: só leitura (sem Bloquear, Devolver nem Apurar)", async () => {
    preparar();
    montar(<RoletaTab slug="marquinhos" somenteLeitura escopoEquipe />);
    await screen.findAllByTestId("marquinhos-linha");
    expect(screen.queryByRole("button", { name: "Bloquear" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Devolver à regra" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apurar agora/ })).toBeNull();
  });

  it("regra desligada: volta a Marquinhos manual (sem ranking automático)", async () => {
    preparar(false);
    montar(<RoletaTab slug="marquinhos" somenteLeitura={false} />);
    await waitFor(() => expect(estado.elig).toHaveBeenCalled());
    expect(screen.queryAllByTestId("marquinhos-linha")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Apurar agora/ })).toBeNull();
  });
});
