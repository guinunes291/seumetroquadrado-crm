// Central de Comando na identidade Lançamento (2026-10): o topo da Fila Única
// como no vídeo de lançamento — o card "Fila Única" (anel X de 65, os três
// números, "Atender agora") e o resumo "Onde os clientes somem" (uma barra
// por etapa, a queda na chegada a cada uma e a maior perda pela meta).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { montarFunil, resumoDoFunil, type FunilRow } from "@/features/fila-unica/funil-derive";
import type { FilaUnica } from "@/features/fila-unica/derive";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
  useUserRoles: () => ({
    isAdmin: false,
    isGestor: false,
    isSuperintendente: false,
    isCorretor: true,
    roles: ["corretor"],
    loading: false,
  }),
}));

const estado = vi.hoisted(() => ({
  data: undefined as FunilRow[] | null | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock("@/features/fila-unica/use-fila-funil", () => ({
  useFilaFunil: () => estado,
  FILA_UNICA_FUNIL_KEY: "fila-unica:funil",
}));

import { FunilResumo } from "@/features/fila-unica/fila-funil-resumo";
import { FilaCartao } from "@/features/fila-unica/fila-cockpit";

const row = (recorte: string, etapa: string, ordem: number, quantidade: number): FunilRow => ({
  recorte,
  etapa,
  ordem,
  quantidade,
  parados: 0,
});

// Base: 20 aguardando, 40 em atendimento, 4 agendados, 8 em análise, 5 vendas.
// "Chegou aqui ou além": 77 → 57 → 57 → 57 → 17 → 13 → 13 → 5.
const ROWS: FunilRow[] = [
  row("base", "aguardando_atendimento", 1, 20),
  row("base", "em_atendimento", 4, 40),
  row("base", "agendado", 5, 4),
  row("base", "analise_credito", 7, 8),
  row("base", "venda", 8, 5),
  row("safra", "em_atendimento", 4, 9),
  row("safra", "venda", 8, 1),
];

afterEach(() => cleanup());

describe("resumoDoFunil", () => {
  it("a queda na chegada a cada etapa é 100 − a conversão da passagem que entra nela", () => {
    const linhas = resumoDoFunil(montarFunil(ROWS, "base"));
    const queda = Object.fromEntries(linhas.map((l) => [l.key, l.queda]));
    expect(queda).toEqual({
      aguardando_atendimento: null, // a primeira etapa não tem passagem de entrada
      aguardando_retorno: 26, // 57/77 = 74% chegam
      qualificacao_corretor: 0,
      em_atendimento: 0,
      agendado: 70, // 17/57 = 30% chegam
      visita_realizada: 24, // 13/17 = 76%
      analise_credito: 0,
      venda: 62, // 5/13 = 38%
    });
  });

  it("a maior perda é a passagem mais longe da META, não a maior queda bruta", () => {
    // Agendamento: 30% contra meta de 70% (0,43 da meta). O fechamento cai 62%,
    // mas 38% está ACIMA da meta de 30% — não é perda, é o normal do fundo.
    const linhas = resumoDoFunil(montarFunil(ROWS, "base"));
    expect(linhas.filter((l) => l.maiorPerda).map((l) => l.key)).toEqual(["agendado"]);
  });

  it("com todas as passagens na meta, nenhuma linha é acusada", () => {
    const linhas = resumoDoFunil(montarFunil([row("base", "venda", 8, 5)], "base"));
    expect(linhas.some((l) => l.maiorPerda)).toBe(false);
  });

  it("na safra a venda não é medida (ciclo maior que o recorte): queda nula, passagem presente", () => {
    const venda = resumoDoFunil(montarFunil(ROWS, "safra")).find((l) => l.key === "venda");
    expect(venda?.queda).toBeNull();
    expect(venda?.passagem?.nota).toMatch(/ciclo maior que 30 dias/);
  });
});

describe("<FunilResumo />", () => {
  it("desenha uma linha por etapa, destaca a maior perda e leva ao funil completo", () => {
    estado.data = ROWS;
    render(<FunilResumo />);
    expect(
      screen.getByRole("heading", { name: "Onde os seus clientes somem" }),
    ).toBeInTheDocument();
    const linhas = screen.getAllByTestId("funil-resumo-linha");
    expect(linhas).toHaveLength(8);
    const perda = linhas.find((l) => l.dataset.maiorPerda === "true");
    expect(perda).toBeDefined();
    expect(within(perda!).getByText("Agendado")).toBeInTheDocument();
    expect(within(perda!).getByText("maior perda")).toBeInTheDocument();
    expect(within(perda!).getByText("−70%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver funil" })).toHaveAttribute("href", "#funil");
  });

  it("sem a RPC no banco, diz que não há dado em vez de desenhar um funil vazio", () => {
    estado.data = null;
    render(<FunilResumo />);
    expect(screen.getByText(/Sem dado: o funil ainda não está disponível/)).toBeInTheDocument();
    expect(screen.queryAllByTestId("funil-resumo-linha")).toHaveLength(0);
  });
});

describe("<FilaCartao />", () => {
  const fila: FilaUnica = {
    itens: [],
    total: 14,
    porBucket: { sla: 0, fundo: 0, responder: 0, followup: 0, sem_acao: 0, esfriando: 0, docs: 0 },
    resumo: {
      vencidos: 4,
      hoje: 7,
      semProximoPasso: 2,
      slaCorrendo: 0,
      fundoParado: 0,
      ocultosInbox: 0,
      emJogo: 0,
    },
  };

  it("o card do vídeo: dia e carteira no subtítulo, anel X de 65, três números e a ação", () => {
    render(
      <FilaCartao
        fila={fila}
        carteira={{
          ocupadas: 37,
          teto: 65,
          estourou: false,
          rotulo: "em atendimento",
          fonte: "em_atendimento",
        }}
        dia="Sexta-feira"
        acao={<button type="button">Atender agora</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Fila Única" })).toBeInTheDocument();
    expect(screen.getByText("Sexta-feira · em atendimento")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "37 de 65 leads no dia" })).toBeInTheDocument();
    expect(screen.getByText("vencidos").previousSibling).toHaveTextContent("4");
    expect(screen.getByText("vencem hoje").previousSibling).toHaveTextContent("7");
    expect(screen.getByText("sem próximo passo").previousSibling).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Atender agora" })).toBeInTheDocument();
  });
});
