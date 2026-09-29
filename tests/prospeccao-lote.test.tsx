/**
 * Lote de prospecção — a parte da tela (migration 20261005120000).
 *
 * As regras moram no banco (tests/db/prospeccao-lote.test.ts). Aqui:
 *  - o que o banco devolve é validado fail-closed, mas a tela aguenta o banco
 *    ainda na versão de 28/09 (sem as chaves novas);
 *  - os textos das travas e do resultado dizem ao corretor o que fazer;
 *  - o Modo Foco tira das três bases quem está trabalhando o lote — os dois
 *    números (cartão e lista do foco) usam o mesmo filtro;
 *  - o cartão só aparece para corretor e aponta para a Fila do Dia.
 */
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  mensagemDoPedido,
  motivoBloqueio,
  parseResultadoPedido,
  parseStatusLote,
  resumoDoLote,
  type StatusLote,
} from "@/features/prospeccao/lote-client";
import { parseFilaCadencia } from "@/features/cadencia/client";

const estado = vi.hoisted(() => ({
  isCorretor: true,
  status: null as unknown,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-00000000000a" } }),
  useUserRoles: () => ({ isCorretor: estado.isCorretor, loading: false }),
}));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => undefined }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/features/prospeccao/lote-client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/prospeccao/lote-client")>();
  return {
    ...real,
    fetchStatusLote: async () => real.parseStatusLote(estado.status),
    pedirLote: vi.fn(),
  };
});

import { LoteProspeccaoCard } from "@/features/prospeccao/lote-card";

/** O status como a versão de 28/09 do banco devolve (sem as chaves novas). */
const statusAntigo = {
  lote_id: null,
  zona: null,
  criado_em: null,
  entregues: 0,
  em_cadencia: 0,
  ficaram: 0,
  sairam: 0,
  vagas: 65,
  teto: 65,
  pode_pedir: true,
  motivo: null,
};

function status(p: Partial<StatusLote> = {}): StatusLote {
  return parseStatusLote({
    ...statusAntigo,
    em_cadencia_total: 0,
    tamanho: 30,
    portas_legadas: false,
    ...p,
  });
}

afterEach(() => cleanup());

describe("o que o banco devolve", () => {
  it("aceita o status da versão de 28/09 (sem as chaves novas)", () => {
    expect(parseStatusLote(statusAntigo).em_cadencia_total).toBeUndefined();
  });

  it("recusa placar malformado em vez de mostrar número errado", () => {
    expect(() => parseStatusLote({ ...statusAntigo, em_cadencia: -1 })).toThrow();
    expect(() => parseStatusLote({ ...statusAntigo, pode_pedir: "sim" })).toThrow();
  });

  it("o card da Fila do Dia aceita item com e sem a marca de lote", () => {
    const item = {
      id: "00000000-0000-4000-8000-000000000001",
      nome: "Cliente",
      telefone: "11999990001",
      email: null,
      status: "aguardando_atendimento",
      etapa: "D0",
      ciclo: 1,
      reativado: false,
      projeto_nome: null,
      faixa_mcmv: null,
      renda_estimada: null,
      prazo: "2026-10-05T23:59:59Z",
      atrasado: false,
      proxima_acao: null,
      telefone_suspeito: false,
      ligacoes_validas: 0,
      whatsapp_enviado: false,
      etapa_completa: false,
    };
    const fila = parseFilaCadencia({
      gerado_em: "2026-10-05T12:00:00Z",
      corretor_id: "00000000-0000-4000-8000-00000000000a",
      itens: [item, { ...item, id: "00000000-0000-4000-8000-000000000002", lote: true }],
    });
    expect(fila.itens.map((i) => i.lote)).toEqual([undefined, true]);
  });
});

describe("os textos das travas e do resultado", () => {
  it("lote em andamento conta TODOS os lotes quando o banco manda o total", () => {
    expect(
      motivoBloqueio({
        motivo: "lote_em_andamento",
        em_cadencia: 2,
        em_cadencia_total: 5,
        teto: 65,
      }),
    ).toMatch(/5 clientes na cadência/);
    // Banco antigo: cai no do último lote.
    expect(motivoBloqueio({ motivo: "lote_em_andamento", em_cadencia: 1, teto: 65 })).toMatch(
      /1 cliente na cadência/,
    );
  });

  it("carteira cheia cita o teto e o porquê; sem motivo não há bloqueio", () => {
    expect(motivoBloqueio({ motivo: "carteira_cheia", em_cadencia: 0, teto: 65 })).toMatch(
      /teto \(65\).*sobe para a carteira/,
    );
    expect(motivoBloqueio({ motivo: null, em_cadencia: 0, teto: 65 })).toBeNull();
    expect(motivoBloqueio({ motivo: "algo_novo", em_cadencia: 0, teto: 65 })).toBeTruthy();
  });

  it("resultado do pedido: sucesso diz quantos vieram e onde trabalhar", () => {
    const cheio = mensagemDoPedido(
      parseResultadoPedido({ ok: true, entregues: 30, zona: "Leste" }),
    );
    expect(cheio).toMatchObject({ tipo: "sucesso", titulo: "30 clientes chegaram da Zona Leste" });
    expect(cheio.descricao).toMatch(/Fila do Dia/);

    const parcial = mensagemDoPedido(parseResultadoPedido({ ok: true, entregues: 7, zona: "Sul" }));
    expect(parcial.descricao).toMatch(/só 7 disponíveis/);

    expect(
      mensagemDoPedido(parseResultadoPedido({ ok: false, motivo: "zona_vazia" })),
    ).toMatchObject({ tipo: "info" });
    expect(
      mensagemDoPedido(parseResultadoPedido({ ok: false, motivo: "carteira_cheia" }), { teto: 65 }),
    ).toMatchObject({ tipo: "erro", titulo: expect.stringMatching(/teto \(65\)/) });
  });

  it("o resumo do lote soma o que veio, o que ficou e o que saiu", () => {
    expect(resumoDoLote(status())).toBeNull();
    expect(
      resumoDoLote(
        status({
          lote_id: "00000000-0000-4000-8000-0000000000aa",
          zona: "Leste",
          criado_em: "2026-09-30T15:00:00Z",
          entregues: 30,
          em_cadencia: 18,
          ficaram: 7,
          sairam: 5,
        }),
      ),
    ).toBe(
      "Lote de 30/09 (Zona Leste): 30 clientes — 18 na cadência, 7 ficaram com você, 5 saíram",
    );
  });
});

describe("o Modo Foco tira o lote das três bases", () => {
  it("a contagem e a lista do foco usam o mesmo filtro", () => {
    const fonte = readFileSync("src/features/prospeccao/modo-foco-page.tsx", "utf8");
    expect(fonte).toContain(
      '"prospeccao_lote_id.is.null,cadencia_etapa.is.null,cadencia_etapa.not.in.(D0,D1,D2,D3)"',
    );
    // Definição + contagem das bases + lista do foco.
    expect(fonte.match(/FORA_DO_LOTE_ATIVO/g)?.length).toBe(3);
    expect(fonte).toContain("<LoteProspeccaoCard />");
  });
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LoteProspeccaoCard />
    </QueryClientProvider>,
  );
}

describe("o cartão do lote", () => {
  it("não aparece para quem não é corretor", () => {
    estado.isCorretor = false;
    estado.status = status();
    const { container } = renderCard();
    expect(container.textContent).toBe("");
    estado.isCorretor = true;
  });

  it("lote em andamento: botão travado, motivo escrito e atalho para a Fila do Dia", async () => {
    estado.status = status({
      lote_id: "00000000-0000-4000-8000-0000000000aa",
      zona: "Leste",
      criado_em: "2026-09-30T15:00:00Z",
      entregues: 30,
      em_cadencia: 12,
      em_cadencia_total: 12,
      ficaram: 10,
      sairam: 8,
      pode_pedir: false,
      motivo: "lote_em_andamento",
    });
    renderCard();
    await waitFor(() => expect(screen.getByText(/12 clientes na cadência/)).toBeTruthy());
    expect(screen.getByText(/Lote de 30\/09 \(Zona Leste\)/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pedir lote" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      screen.getByRole("link", { name: /Trabalhar na Fila do Dia/ }).getAttribute("href"),
    ).toBe("/cadencia");
  });

  it("banco ainda na versão de 28/09: o botão fica travado e a tela diz por quê", async () => {
    // A versão velha entrega o lote com os defeitos que a migration corrige;
    // app publicado antes da migration não pode usá-la.
    estado.status = statusAntigo;
    renderCard();
    await waitFor(() => expect(screen.getByText(/sendo atualizado no banco/)).toBeTruthy());
    expect((screen.getByRole("button", { name: "Pedir lote" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("pode pedir: o botão só libera depois de escolher a zona", async () => {
    estado.status = status();
    renderCard();
    await waitFor(() => expect(screen.getByText("Escolha a zona")).toBeTruthy());
    expect((screen.getByRole("button", { name: "Pedir lote" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole("link", { name: /Fila do Dia/ })).toBeNull();
    expect(screen.queryByText(/sendo atualizado no banco/)).toBeNull();
  });
});
