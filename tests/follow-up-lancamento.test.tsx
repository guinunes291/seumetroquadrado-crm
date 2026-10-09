// Follow-Up na identidade Lançamento (2026-10): o topo do módulo como no vídeo
// de lançamento — a cadência por etapa, cada uma com o checklist do que a
// fecha, e a régua de toques como linha de passos. Com os números reais: o
// checklist é o espelho de cadencia_etapa_completa (2 ligações válidas + 1
// WhatsApp; no encerramento, só a mensagem) e a régua marca em que toque está
// cada cliente da fila de hoje.
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CadenciaItem } from "@/features/cadencia/client";
import type { FilaItem } from "@/features/followup/fila-client";
import {
  legendaLigacoes,
  PASSOS_DA_ETAPA,
  resumoDaCadencia,
  toquesDeHoje,
} from "@/features/followup/topo-derive";
import { REGUA_PADRAO } from "@/lib/regua-followup";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
}));

const dados = vi.hoisted(() => ({
  cadencia: [] as unknown[],
  total: 0,
  fila: [] as unknown[],
}));
vi.mock("@/features/cadencia/client", () => ({
  fetchKanbanCadencia: async () => ({
    gerado_em: "2026-10-09T12:00:00Z",
    corretor_id: "c1",
    total: dados.total,
    itens: dados.cadencia,
  }),
}));
vi.mock("@/features/followup/fila-client", () => ({
  fetchFilaFollowUp: async () => ({
    gerado_em: "2026-10-09T12:00:00Z",
    corretor_id: "c1",
    itens: dados.fila,
  }),
  carregarRegua: async () => REGUA_PADRAO,
}));

import { CadenciaEtapas, ReguaDeToques } from "@/features/followup/followup-topo";

// 9/10/2026, 12h em São Paulo. O prazo da etapa é o fim do dia.
const AGORA = new Date("2026-10-09T15:00:00Z");
const HOJE = "2026-10-10T02:59:00Z"; // 23h59 de 9/10 em São Paulo
const AMANHA = "2026-10-11T02:59:00Z";
const ONTEM = "2026-10-09T02:59:00Z";

let n = 0;
function item(
  etapa: CadenciaItem["etapa"],
  ligacoes: number,
  whatsapp: boolean,
  prazo: string,
  atrasado = false,
): CadenciaItem {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-0000000004${String(n).padStart(2, "0")}`,
    nome: `Cliente ${n}`,
    telefone: "(11) 90000-0000",
    email: null,
    status: "aguardando_atendimento",
    etapa,
    ciclo: 1,
    reativado: false,
    projeto_nome: null,
    faixa_mcmv: null,
    renda_estimada: null,
    prazo,
    atrasado,
    proxima_acao: null,
    telefone_suspeito: false,
    ligacoes_validas: ligacoes,
    whatsapp_enviado: whatsapp,
    etapa_completa: false,
  };
}

// Lead chegou: 3 (2 lig, 1 lig, 0 lig vencido). 1º follow-up: 2, as duas
// ligações feitas nos dois. 2º follow-up: 1. Encerramento: ninguém.
const CADENCIA = [
  item("D0", 2, false, HOJE),
  item("D0", 1, false, HOJE),
  item("D0", 0, false, ONTEM, true),
  item("D1", 2, false, HOJE),
  item("D1", 2, false, AMANHA),
  item("D2", 1, false, AMANHA),
];

function filaItem(tentativas: number): FilaItem {
  return { tentativas } as FilaItem;
}

function renderComQuery(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => cleanup());

describe("resumoDaCadencia", () => {
  it("mostra as quatro etapas, na ordem, mesmo as vazias", () => {
    const r = resumoDaCadencia(CADENCIA, AGORA);
    expect(r.map((e) => [e.etapa, e.total])).toEqual([
      ["D0", 3],
      ["D1", 2],
      ["D2", 1],
      ["D3", 0],
    ]);
  });

  it("o checklist é o que o motor cobra: 2 ligações + WhatsApp; no encerramento, a mensagem", () => {
    expect(PASSOS_DA_ETAPA.D0.map((p) => p.rotulo)).toEqual([
      "1ª ligação",
      "2ª ligação",
      "WhatsApp de abertura",
    ]);
    expect(PASSOS_DA_ETAPA.D1.map((p) => p.rotulo)).toEqual([
      "1ª ligação",
      "2ª ligação",
      "WhatsApp",
    ]);
    expect(PASSOS_DA_ETAPA.D2.map((p) => p.rotulo)).toEqual([
      "1ª ligação",
      "2ª ligação",
      "WhatsApp",
    ]);
    expect(PASSOS_DA_ETAPA.D3.map((p) => p.rotulo)).toEqual(["Mensagem de encerramento"]);
  });

  it("conta quantos clientes da etapa já cumpriram cada passo", () => {
    const [d0, d1] = resumoDaCadencia(CADENCIA, AGORA);
    expect(d0.passos.map((p) => p.feitos)).toEqual([2, 1, 0]);
    expect(d1.passos.map((p) => p.feitos)).toEqual([2, 2, 0]);
  });

  it("separa quem venceu de quem vence hoje, no dia de São Paulo", () => {
    const [d0, d1, d2] = resumoDaCadencia(CADENCIA, AGORA);
    expect([d0.venceram, d0.venceHoje]).toEqual([1, 2]);
    expect([d1.venceram, d1.venceHoje]).toEqual([0, 1]);
    expect([d2.venceram, d2.venceHoje]).toEqual([0, 0]);
  });
});

describe("toquesDeHoje", () => {
  it("põe cada cliente no toque tentativas + 1, preso ao teto da régua", () => {
    const c = toquesDeHoje([0, 2, 2, 6, 12, 20].map(filaItem), 13);
    expect(c).toHaveLength(13);
    expect(c[0]).toBe(1); // toque 1
    expect(c[2]).toBe(2); // toque 3
    expect(c[6]).toBe(1); // toque 7
    expect(c[12]).toBe(2); // 13 e quem passou do teto
    expect(c.reduce((a, b) => a + b, 0)).toBe(6);
  });
});

describe("legendaLigacoes", () => {
  it("lê os toques por ligação da régua vigente", () => {
    expect(legendaLigacoes([3, 7, 11])).toBe("toques 3, 7 e 11 por ligação");
    expect(legendaLigacoes([11, 3, 3])).toBe("toques 3 e 11 por ligação");
    expect(legendaLigacoes([5])).toBe("toque 5 por ligação");
    expect(legendaLigacoes([])).toBeNull();
  });
});

describe("CadenciaEtapas", () => {
  it("um cartão por etapa, com o checklist e o 'x de N' do que falta", async () => {
    dados.cadencia = CADENCIA;
    dados.total = CADENCIA.length;
    renderComQuery(<CadenciaEtapas />);

    const cartoes = await screen.findAllByTestId("cadencia-etapa");
    expect(cartoes).toHaveLength(4);
    const [d0, d1, , d3] = cartoes;

    expect(within(d0).getByText("Lead chegou")).toBeTruthy();
    expect(within(d0).getByText("3 clientes")).toBeTruthy();
    expect(within(d0).getByText("WhatsApp de abertura")).toBeTruthy();
    expect(within(d0).getByText("2 de 3")).toBeTruthy();

    // No 1º follow-up as duas ligações estão feitas nos dois: sem contador.
    expect(within(d1).getByText("1º follow-up")).toBeTruthy();
    expect(within(d1).getAllByText("0 de 2")).toHaveLength(1);

    expect(within(d3).getByText("Encerramento")).toBeTruthy();
    expect(within(d3).getByText("Nenhum cliente agora")).toBeTruthy();
    expect(within(d3).getByText("Mensagem de encerramento")).toBeTruthy();

    // As portas para trabalhar a cadência.
    expect(screen.getByText("Fila do Dia")).toBeTruthy();
    expect(screen.getByText("Kanban")).toBeTruthy();
  });

  it("avisa quando a leitura foi cortada pelo teto", async () => {
    dados.cadencia = CADENCIA;
    dados.total = 450;
    renderComQuery(<CadenciaEtapas />);
    expect(await screen.findByText(/Contando os primeiros 6 clientes/)).toBeTruthy();
  });
});

describe("ReguaDeToques", () => {
  it("desenha os 13 toques, marca os de ligação e os que têm cliente hoje", async () => {
    dados.fila = [0, 2, 2, 6].map(filaItem);
    renderComQuery(<ReguaDeToques />);

    expect(screen.getByText("Depois da resposta: a régua dos 13 toques")).toBeTruthy();
    const toques = await screen.findAllByTestId("regua-toque");
    expect(toques).toHaveLength(13);
    await screen.findByText(/Hoje: 4 clientes na fila/);

    const comCliente = toques.filter((t) => t.dataset.hoje).map((t) => t.textContent);
    expect(comCliente).toEqual(["11", "32", "71"]); // número do toque + quantos hoje
    expect(toques[2].getAttribute("aria-label")).toBe("Toque 3, por ligação, 2 clientes hoje");
    expect(toques[1].getAttribute("aria-label")).toBe("Toque 2");
    expect(screen.getByText(/toques 3, 7 e 11 por ligação/)).toBeTruthy();
  });

  it("fila vazia: a régua aparece inteira e diz que zerou", async () => {
    dados.fila = [];
    renderComQuery(<ReguaDeToques />);
    expect(await screen.findByText(/Hoje: fila da régua zerada/)).toBeTruthy();
    expect(screen.getAllByTestId("regua-toque").filter((t) => t.dataset.hoje)).toHaveLength(0);
  });
});
