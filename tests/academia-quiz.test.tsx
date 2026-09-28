import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  AcademiaQuizEnviarRetorno,
  AcademiaQuizIniciarRetorno,
} from "@/integrations/supabase/academia-pendente";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => vi.fn(),
}));

const estado = vi.hoisted(() => ({
  sessao: null as AcademiaQuizIniciarRetorno | null,
  resultado: null as AcademiaQuizEnviarRetorno | null,
  erroIniciar: null as unknown,
  erroEnviar: null as unknown,
}));

vi.mock("@/features/academia/academia-client", () => ({
  useModulo: () => ({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: { modulo: { id: "m1", titulo: "Método de ligação", codigo: "O01" }, aulas: [] },
  }),
  useIniciarQuiz: () => ({
    isPending: false,
    isError: estado.erroIniciar !== null,
    error: estado.erroIniciar,
    mutate: (_id: string, opts?: { onSuccess?: (s: AcademiaQuizIniciarRetorno) => void }) => {
      if (estado.sessao) opts?.onSuccess?.(estado.sessao);
    },
  }),
  useEnviarQuiz: () => ({
    isPending: false,
    isError: estado.erroEnviar !== null,
    error: estado.erroEnviar,
    mutate: (_args: unknown, opts?: { onSuccess?: (r: AcademiaQuizEnviarRetorno) => void }) => {
      if (estado.resultado) opts?.onSuccess?.(estado.resultado);
    },
  }),
}));

import { QuizPage } from "@/features/academia/quiz-page";

const SESSAO: AcademiaQuizIniciarRetorno = {
  tentativa_id: "t1",
  tempo_limite_min: 30,
  nota_minima: 80,
  questoes: [
    {
      id: "q1",
      enunciado: "Qual é a primeira pergunta?",
      alternativas: ["Renda", "Primeiro imóvel"],
    },
    { id: "q2", enunciado: "Quando falar de preço?", alternativas: ["Logo", "Depois da renda"] },
  ],
};

const RESULTADO: AcademiaQuizEnviarRetorno = {
  nota: 100,
  nota_minima: 80,
  aprovado: true,
  acertos: 2,
  total: 2,
  gabarito: [
    {
      id: "q1",
      enunciado: "Qual é a primeira pergunta?",
      alternativas: ["Renda", "Primeiro imóvel"],
      correta: 1,
      marcada: 1,
      explicacao: "A pergunta 1 revela a elegibilidade ao MCMV.",
    },
  ],
};

beforeEach(() => {
  Object.assign(estado, { sessao: null, resultado: null, erroIniciar: null, erroEnviar: null });
});
afterEach(cleanup);

describe("quiz", () => {
  it("não começa sozinho: a tentativa só abre quando o corretor manda", () => {
    render(<QuizPage codigo="O01" />);
    expect(screen.getByRole("button", { name: "Começar o quiz" })).toBeTruthy();
    expect(screen.queryByText("Qual é a primeira pergunta?")).toBeNull();
  });

  it("mostra UMA questão por tela, com o contador de tempo em hh:mm", () => {
    estado.sessao = SESSAO;
    render(<QuizPage codigo="O01" />);
    fireEvent.click(screen.getByRole("button", { name: "Começar o quiz" }));

    expect(screen.getByText("Qual é a primeira pergunta?")).toBeTruthy();
    expect(screen.queryByText("Quando falar de preço?")).toBeNull();
    expect(screen.getByText("Questão 1 de 2")).toBeTruthy();
    expect(screen.getByText("00:30")).toBeTruthy();
  });

  it("o gabarito não existe na tela antes do envio", () => {
    estado.sessao = SESSAO;
    const { container } = render(<QuizPage codigo="O01" />);
    fireEvent.click(screen.getByRole("button", { name: "Começar o quiz" }));
    // nenhuma alternativa marcada como certa, nenhuma explicação
    expect(container.textContent).not.toContain("A pergunta 1 revela");
    expect(screen.queryByText("Correção")).toBeNull();
  });

  it("pede confirmação antes de enviar, e dá para voltar a revisar", () => {
    estado.sessao = SESSAO;
    render(<QuizPage codigo="O01" />);
    fireEvent.click(screen.getByRole("button", { name: "Começar o quiz" }));
    fireEvent.click(screen.getByText("Primeiro imóvel"));
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar e enviar" }));

    expect(screen.getByText("Enviar o quiz?")).toBeTruthy();
    expect(screen.getByText(/1 questão\(ões\) sem resposta/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Revisar antes" }));
    expect(screen.getByText("Quando falar de preço?")).toBeTruthy();
  });

  it("avisa quando TODAS foram respondidas", () => {
    estado.sessao = SESSAO;
    render(<QuizPage codigo="O01" />);
    fireEvent.click(screen.getByRole("button", { name: "Começar o quiz" }));
    fireEvent.click(screen.getByText("Primeiro imóvel"));
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    fireEvent.click(screen.getByText("Depois da renda"));
    fireEvent.click(screen.getByRole("button", { name: "Revisar e enviar" }));
    expect(screen.getByText(/Todas as questões respondidas/)).toBeTruthy();
  });

  it("o resultado mostra nota, correção e explicação, que só chegam no envio", () => {
    estado.sessao = SESSAO;
    estado.resultado = RESULTADO;
    render(<QuizPage codigo="O01" />);
    fireEvent.click(screen.getByRole("button", { name: "Começar o quiz" }));
    fireEvent.click(screen.getByText("Primeiro imóvel"));
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar e enviar" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar agora" }));

    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("Aprovado. O módulo avança.")).toBeTruthy();
    expect(screen.getByText("Correção")).toBeTruthy();
    expect(screen.getByText("A pergunta 1 revela a elegibilidade ao MCMV.")).toBeTruthy();
  });

  it("erro de intervalo vira texto na tela, não some nem vira toast", () => {
    estado.erroIniciar = { message: "aguarde 60 minutos entre tentativas: revise as aulas antes" };
    render(<QuizPage codigo="O01" />);
    expect(screen.getByText("Ainda não dá para tentar de novo.")).toBeTruthy();
    expect(screen.getByText(/Espere 60 minutos/)).toBeTruthy();
    // e o botão continua ali, sem prometer que vai funcionar
    expect(screen.getByRole("button", { name: "Começar o quiz" })).toBeTruthy();
  });

  it("erro no envio aparece na tela de confirmação, sem perder as respostas", () => {
    estado.sessao = SESSAO;
    estado.erroEnviar = { message: "tempo esgotado: inicie uma nova tentativa" };
    render(<QuizPage codigo="O01" />);
    fireEvent.click(screen.getByRole("button", { name: "Começar o quiz" }));
    fireEvent.click(screen.getByText("Primeiro imóvel"));
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar e enviar" }));
    expect(screen.getByText("O tempo desta tentativa acabou.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revisar antes" }));
    expect(screen.getByText("Quando falar de preço?")).toBeTruthy();
  });
});
