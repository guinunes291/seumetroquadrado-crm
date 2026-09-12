import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FilaCockpit } from "@/features/fila-unica/fila-cockpit";
import { LIMITE_FILA, type FilaUnica } from "@/features/fila-unica/derive";

function fila(partial: Partial<FilaUnica["resumo"]> = {}, total = 37): FilaUnica {
  return {
    itens: [],
    total,
    porBucket: { sla: 0, fundo: 0, responder: 0, followup: 0, sem_acao: 0, esfriando: 0, docs: 0 },
    resumo: {
      vencidos: 9,
      hoje: 6,
      semProximoPasso: 3,
      slaCorrendo: 0,
      fundoParado: 4,
      ocultosInbox: 0,
      ...partial,
    },
  };
}

afterEach(() => cleanup());

describe("FilaCockpit — o placar do celular", () => {
  it("mostra o anel 'N de 40' e os três números do dia", () => {
    render(<FilaCockpit fila={fila()} />);
    expect(
      screen.getByRole("img", { name: `37 de ${LIMITE_FILA} leads no dia` }),
    ).toBeInTheDocument();
    expect(screen.getByText("vencidos").previousSibling).toHaveTextContent("9");
    expect(screen.getByText("vencem hoje").previousSibling).toHaveTextContent("6");
    expect(screen.getByText("sem próximo passo").previousSibling).toHaveTextContent("3");
    expect(screen.queryByText(/no SLA/)).toBeNull();
  });

  it("acima do teto, o anel enche em 40 e o excedente vira uma linha; SLA e ocultos também", () => {
    render(<FilaCockpit fila={fila({ slaCorrendo: 2, ocultosInbox: 12 }, 57)} />);
    expect(
      screen.getByRole("img", { name: `40 de ${LIMITE_FILA} leads no dia` }),
    ).toBeInTheDocument();
    expect(screen.getByText(/\+17 entram conforme estes saem/)).toBeInTheDocument();
    expect(screen.getByText(/2 no SLA do 1º contato/)).toBeInTheDocument();
    expect(screen.getByText(/\+12 nas filas de Atender/)).toBeInTheDocument();
  });
});
