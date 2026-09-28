import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AcademiaModuloStatusRow } from "@/integrations/supabase/academia-pendente";

class RedirecionouError extends Error {
  constructor(public destino: string) {
    super(`redirect ${destino}`);
  }
}

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => vi.fn(),
  redirect: (o: { to: string }) => new RedirecionouError(o.to),
}));

const estado = vi.hoisted(() => ({
  flagMenu: true,
  flagCard: true,
  flagCarregando: false,
  flagErro: null as unknown,
  participa: true as boolean | null,
  participacaoPendente: false,
  participacaoErro: false,
  isAdmin: false,
  rolesCarregando: false,
  modulo: null as unknown,
  trilhaModulos: [] as AcademiaModuloStatusRow[],
}));

vi.mock("@/hooks/use-app-flags", () => ({
  useAppFlag: (chave: string) => ({
    ligada: chave === "academia_menu" ? estado.flagMenu : estado.flagCard,
    carregando: estado.flagCarregando,
    erro: estado.flagErro,
    recarregar: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-auth", () => ({
  useUserRoles: () => ({ isAdmin: estado.isAdmin, roles: [], loading: estado.rolesCarregando }),
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
}));
vi.mock("@/features/academia/academia-client", () => ({
  useParticipacaoAcademia: () => ({
    data: estado.participa === null ? null : { participa: estado.participa },
    isPending: estado.participacaoPendente,
    isError: estado.participacaoErro,
    error: estado.participacaoErro ? new Error("falhou") : null,
    refetch: vi.fn(),
  }),
  useEhParticipante: () => ({ participa: estado.participa === true, carregando: false }),
  useModulo: () => ({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: estado.modulo,
  }),
  useEnviarPratica: () => ({ isPending: false, isError: false, error: null, mutate: vi.fn() }),
  useTrilha: () => ({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      resumo: null,
      fases: [],
      faseStatus: [],
      modulos: estado.trilhaModulos,
      atribuicoes: [],
    },
  }),
}));

import { AcademiaGuard } from "@/features/academia/guard";
import { ModuloPage } from "@/features/academia/modulo-page";
import { CardProximaAula } from "@/features/academia/card-proxima-aula";

function moduloStatus(p: Partial<AcademiaModuloStatusRow> = {}): AcademiaModuloStatusRow {
  return {
    corretor_id: "c1",
    modulo_id: "m1",
    codigo: "O01",
    fase: 0,
    numero: 1,
    titulo: "Integração: pronto para atender",
    obrigatorio: true,
    exige_pratica: true,
    aulas_total: 2,
    aulas_feitas: 1,
    melhor_nota: null,
    quiz_aprovado: false,
    tentativas: 0,
    pratica_status: "nao_enviada",
    concluido: false,
    concluido_em: null,
    prazo_em: null,
    ultima_atividade: "2026-10-01T12:00:00Z",
    ...p,
  };
}

const MODULO_COMPLETO = {
  modulo: {
    id: "m1",
    codigo: "O01",
    titulo: "Integração: pronto para atender",
    fase: 0,
    objetivo_principal: "Atender um lead real no padrão SMQ.",
    objetivos: ["Conduzir a ligação"],
    exige_pratica: true,
    pratica_descricao: "Roleplay com o gestor.",
    pratica_rubrica: [{ criterio: "Perguntou a renda", peso: 1 }],
    url_gamma: null,
  },
  status: moduloStatus(),
  aulas: [
    { id: "a1", ordem: 1, titulo: "A SMQ e a regra de ouro", duracao_min: 10, tipo: "texto" },
    { id: "a2", ordem: 2, titulo: "As 6 perguntas", duracao_min: 10, tipo: "texto" },
  ],
  aulasFeitas: new Set(["a1"]),
  praticas: [],
};

beforeEach(() => {
  Object.assign(estado, {
    flagMenu: true,
    flagCard: true,
    flagCarregando: false,
    flagErro: null,
    participa: true,
    participacaoPendente: false,
    participacaoErro: false,
    isAdmin: false,
    rolesCarregando: false,
    modulo: MODULO_COMPLETO,
    trilhaModulos: [moduloStatus()],
  });
});
afterEach(cleanup);

describe("guard da Academia", () => {
  it("flag desligada manda de volta para o início", () => {
    estado.flagMenu = false;
    expect(() => render(<AcademiaGuard>conteúdo</AcademiaGuard>)).toThrow(RedirecionouError);
  });

  it("quem não participa vê recado amigável, não erro nem redirect", () => {
    estado.participa = false;
    render(<AcademiaGuard>conteúdo</AcademiaGuard>);
    expect(screen.getByText("Você ainda não está na Academia.")).toBeTruthy();
    expect(screen.getByText("Fale com seu gestor para entrar na trilha.")).toBeTruthy();
    expect(screen.queryByText("conteúdo")).toBeNull();
  });

  it("admin que não participa recebe a instrução de admin", () => {
    estado.participa = false;
    estado.isAdmin = true;
    render(<AcademiaGuard>conteúdo</AcademiaGuard>);
    expect(screen.getByText(/academia_definir_participacao/)).toBeTruthy();
  });

  it("carregando não é desligada: mostra esqueleto, não redireciona", () => {
    estado.flagCarregando = true;
    estado.flagMenu = false;
    const { container } = render(<AcademiaGuard>conteúdo</AcademiaGuard>);
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it("erro de leitura vira QueryErrorState, nunca tela em branco", () => {
    estado.flagErro = new Error("rede caiu");
    render(<AcademiaGuard>conteúdo</AcademiaGuard>);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/não foi possível verificar/i)).toBeTruthy();
  });

  it("participante ativo com a flag ligada vê o conteúdo", () => {
    render(<AcademiaGuard>conteúdo</AcademiaGuard>);
    expect(screen.getByText("conteúdo")).toBeTruthy();
  });
});

describe("tela do módulo", () => {
  it("mostra o quiz DESABILITADO com o motivo à vista", () => {
    render(<ModuloPage codigo="O01" />);
    expect(screen.getByText("Falta 1 aula para liberar o quiz.")).toBeTruthy();
    const botao = screen.getByRole("button", { name: "Fazer o quiz" });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
  });

  it("com todas as aulas feitas, o quiz vira link e o motivo some", () => {
    estado.modulo = { ...MODULO_COMPLETO, aulasFeitas: new Set(["a1", "a2"]) };
    render(<ModuloPage codigo="O01" />);
    expect(screen.queryByText(/Falta 1 aula/)).toBeNull();
    expect(screen.getByText("Fazer o quiz")).toBeTruthy();
  });

  it("lista as aulas com a contagem do que já foi feito", () => {
    render(<ModuloPage codigo="O01" />);
    expect(screen.getByText("Aulas (1 de 2)")).toBeTruthy();
    expect(screen.getByText("As 6 perguntas")).toBeTruthy();
  });

  it("mostra o feedback do gestor quando a prática foi avaliada", () => {
    estado.modulo = {
      ...MODULO_COMPLETO,
      praticas: [{ id: "p1", status: "refazer", feedback: "Faltou perguntar a renda." }],
    };
    render(<ModuloPage codigo="O01" />);
    expect(screen.getByText("Refazer")).toBeTruthy();
    expect(screen.getByText(/Faltou perguntar a renda/)).toBeTruthy();
  });
});

describe("card Sua próxima aula no /inicio", () => {
  it("aparece para participante com a flag ligada, apontando para a aula pendente", () => {
    render(<CardProximaAula />);
    expect(screen.getByText("Sua próxima aula")).toBeTruthy();
    expect(screen.getByText("As 6 perguntas")).toBeTruthy();
  });

  it("some com a flag desligada: o /inicio fica igual ao de hoje", () => {
    estado.flagCard = false;
    const { container } = render(<CardProximaAula />);
    expect(container.innerHTML).toBe("");
  });

  it("some para quem não participa, mesmo com a flag ligada", () => {
    estado.participa = false;
    const { container } = render(<CardProximaAula />);
    expect(container.innerHTML).toBe("");
  });

  it("some quando não há módulo pendente", () => {
    estado.trilhaModulos = [moduloStatus({ concluido: true })];
    const { container } = render(<CardProximaAula />);
    expect(container.innerHTML).toBe("");
  });
});
