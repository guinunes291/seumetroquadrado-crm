// Devolver ao Marquinhos (migration 20261106120000) — lógica pura, contrato
// do webhook, regra da lista e a faixa/janela na conversa. O banco (RLS, fila,
// retomar, encerrar, fila Responder) é travado em tests/db/marquinhos-devolucao.
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  definicaoObjetivo,
  mensagemErroDevolucao,
  montarPedidoN8n,
  OBJETIVOS_DEVOLUCAO,
  resumoEstado,
  type Devolucao,
} from "@/features/mensagens/devolucao-marquinhos";
import { agruparConversas, previewConversa, type Mensagem } from "@/features/mensagens/derive";
import { parseWebhookWhatsApp } from "@/features/mensagens/webhook-contract";
import { lerRespostaN8n } from "@/lib/marquinhos-devolucao.server";

const estado = vi.hoisted(() => ({
  devolucao: null as unknown,
  devolver: vi.fn(),
  retomar: vi.fn(),
}));

vi.mock("@/features/mensagens/mensagens-client", () => ({
  ultimaDevolucaoDoLead: async () => ({ disponivel: true, devolucao: estado.devolucao }),
}));
vi.mock("@/lib/marquinhos-devolucao.functions", () => ({
  devolverAoMarquinhos: "devolver",
  retomarAtendimentoMarquinhos: "retomar",
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (nome: string) => (nome === "devolver" ? estado.devolver : estado.retomar),
}));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DevolucaoMarquinhosFaixa } from "@/features/mensagens/devolucao-marquinhos-card";

afterEach(() => {
  cleanup();
  estado.devolucao = null;
  estado.devolver.mockReset();
  estado.retomar.mockReset();
});

describe("catálogo dos objetivos", () => {
  it("os três objetivos pedidos pelo dono, cada um com rótulo, missão e abertura", () => {
    expect(OBJETIVOS_DEVOLUCAO).toEqual([
      "remarcar_visita",
      "recolher_documentos",
      "tirar_duvidas",
    ]);
    expect(definicaoObjetivo("remarcar_visita").rotulo).toBe("Cliente pediu para remarcar");
    expect(definicaoObjetivo("recolher_documentos").rotulo).toBe("Tentar recolher a documentação");
    expect(definicaoObjetivo("tirar_duvidas").rotulo).toBe("Tirar dúvidas do cliente");
  });

  it("tirar dúvidas nunca negocia: preço e desconto voltam para o corretor", () => {
    expect(definicaoObjetivo("tirar_duvidas").missao).toMatch(/desconto[\s\S]*precisa_corretor/);
  });
});

describe("pedido ao n8n", () => {
  const item = {
    id: "d1",
    acao: "devolver",
    lead_id: "l1",
    telefone: "5511987654321",
    objetivo: "remarcar_visita",
    observacao: "  só consegue sábado  ",
    cliente_nome: "Regina Alves",
    corretor_nome: "Ana Souza",
    tentativa: 1,
  };

  it("devolver: primeiro nome, recado, missão com as regras comuns e abertura preenchida", () => {
    const p = montarPedidoN8n(item);
    expect(p).toMatchObject({
      acao: "devolver",
      devolucao_id: "d1",
      telefone: "5511987654321",
      cliente_nome: "Regina",
      corretor_nome: "Ana",
      recado_do_corretor: "só consegue sábado",
    });
    if (p?.acao !== "devolver") throw new Error("esperava devolver");
    expect(p.missao).toContain("REMARCAR");
    expect(p.missao).toContain("a pedido do consultor Ana");
    expect(p.missao).toContain("Recado do consultor: só consegue sábado");
    expect(p.abertura_sugerida).toBe(
      "Oi, Regina! Aqui é o Marquinhos, assistente da Seu Metro Quadrado. Ana me pediu pra te ajudar a remarcar a visita 😊 Qual dia e horário ficam bons pra você?",
    );
    expect(p.abertura_sugerida).not.toMatch(/[{}]/);
  });

  it("retomar leva só o necessário para pausar; objetivo desconhecido não vira pedido", () => {
    expect(montarPedidoN8n({ ...item, acao: "retomar" })).toEqual({
      acao: "retomar",
      devolucao_id: "d1",
      lead_id: "l1",
      telefone: "5511987654321",
      corretor_nome: "Ana",
      tentativa: 1,
    });
    expect(montarPedidoN8n({ ...item, objetivo: "fechar_venda" })).toBeNull();
    expect(montarPedidoN8n({ ...item, acao: "outra" })).toBeNull();
  });

  it("resposta do n8n: só HTTP 2xx com ok=true é sucesso", () => {
    expect(lerRespostaN8n(200, '{"ok":true}')).toEqual({ ok: true, erro: null });
    expect(lerRespostaN8n(200, '{"ok":false,"erro":"fora da janela"}')).toEqual({
      ok: false,
      erro: "fora da janela",
    });
    expect(lerRespostaN8n(200, "ok").ok).toBe(false);
    expect(lerRespostaN8n(500, "boom")).toEqual({ ok: false, erro: "HTTP 500: boom" });
  });
});

describe("estado legível e erros", () => {
  const base: Devolucao = {
    id: "d1",
    lead_id: "l1",
    objetivo: "recolher_documentos",
    observacao: null,
    status: "com_marquinhos",
    envio_pendente: null,
    ultimo_erro: null,
    enviado_em: null,
    encerrado_em: null,
    desfecho: null,
    resultado: null,
    criado_em: new Date().toISOString(),
  };
  it("cada status vira uma frase honesta", () => {
    expect(resumoEstado(base)).toBe("Com o Marquinhos · Tentar recolher a documentação");
    expect(resumoEstado({ ...base, envio_pendente: "retomar" })).toMatch(/^Retomando/);
    expect(resumoEstado({ ...base, status: "concluida", desfecho: "precisa_corretor" })).toBe(
      "Marquinhos precisa de você · Tentar recolher a documentação",
    );
    expect(resumoEstado({ ...base, status: "falhou" })).toMatch(/continua com você/);
  });
  it("RPC ausente vira aviso de migração; erro do banco passa como está", () => {
    expect(
      mensagemErroDevolucao(new Error("Could not find the function public.marquinhos_devolver")),
    ).toMatch(/migração pendente/);
    expect(mensagemErroDevolucao(new Error("Este cliente já está com o Marquinhos."))).toBe(
      "Este cliente já está com o Marquinhos.",
    );
  });
});

describe("webhook: mensagens do robô", () => {
  const base = {
    tipo: "mensagem",
    provider: "meta_4099",
    provider_message_id: "wamid.ABC",
    telefone: "5511987654321",
    conteudo: "Oi, Regina!",
  };
  it("sem direção continua sendo entrada (contrato original intacto)", () => {
    const r = parseWebhookWhatsApp(base);
    expect(r.ok && r.evento.tipo === "mensagem" && r.evento.direcao).toBe("entrada");
  });
  it("saída exige o agente; agente em entrada é descartado", () => {
    expect(parseWebhookWhatsApp({ ...base, direcao: "saida" })).toEqual({
      ok: false,
      error: "saida_sem_agente",
    });
    const s = parseWebhookWhatsApp({ ...base, direcao: "saida", agente: "marquinhos" });
    expect(s.ok && s.evento.tipo === "mensagem" && s.evento.agente).toBe("marquinhos");
    const e = parseWebhookWhatsApp({ ...base, agente: "marquinhos" });
    expect(e.ok && e.evento.tipo === "mensagem" && e.evento.agente).toBeNull();
    expect(parseWebhookWhatsApp({ ...base, direcao: "saida", agente: "Marquinhos!" }).ok).toBe(
      false,
    );
  });
});

describe("lista de conversas com o robô", () => {
  const m = (p: Partial<Mensagem> & { id: string; criado_em: string }): Mensagem => ({
    lead_id: "A",
    corretor_id: null,
    direcao: "entrada",
    canal: "whatsapp",
    provider: "meta_4099",
    provider_message_id: null,
    status: "recebida",
    conteudo: "oi",
    midia_url: null,
    ...p,
  });
  it("resposta automática pós-handoff não apaga o aguardando do corretor", () => {
    const [c] = agruparConversas([
      m({ id: "1", criado_em: "2026-11-06T10:00:00Z" }),
      m({
        id: "2",
        criado_em: "2026-11-06T10:01:00Z",
        direcao: "saida",
        agente: "marquinhos",
        conteudo: "A Ana te responde",
      }),
    ]);
    expect(c.aguardandoResposta).toBe(1);
    expect(previewConversa(c.ultima)).toBe("Marquinhos: A Ana te responde");
  });
  it("resposta do robô durante a devolução conta", () => {
    const [c] = agruparConversas([
      m({ id: "1", criado_em: "2026-11-06T10:00:00Z" }),
      m({
        id: "2",
        criado_em: "2026-11-06T10:01:00Z",
        direcao: "saida",
        agente: "marquinhos",
        devolucao_id: "d1",
      }),
    ]);
    expect(c.aguardandoResposta).toBe(0);
  });
});

describe("faixa e janela na conversa", () => {
  function renderFaixa() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    return render(
      <DevolucaoMarquinhosFaixa
        leadId="11111111-1111-4111-8111-111111111111"
        clienteNome="Regina Alves"
      />,
      {
        wrapper: wrap,
      },
    );
  }

  it("escolhe o objetivo, deixa recado e devolve com os dados certos", async () => {
    estado.devolver.mockResolvedValue({ id: "d1", enviadoAgora: true });
    renderFaixa();
    fireEvent.click(await screen.findByRole("button", { name: /Devolver ao Marquinhos/ }));
    expect(screen.getByRole("heading", { name: "Devolver Regina ao Marquinhos" })).toBeTruthy();

    const confirmar = screen.getAllByRole("button", { name: /Devolver ao Marquinhos/ }).at(-1)!;
    expect((confirmar as HTMLButtonElement).disabled).toBe(true); // sem objetivo não vai

    fireEvent.click(screen.getByRole("radio", { name: /Cliente pediu para remarcar/ }));
    fireEvent.change(screen.getByLabelText(/Recado para o Marquinhos/), {
      target: { value: "Só sábado" },
    });
    fireEvent.click(confirmar);
    await waitFor(() => expect(estado.devolver).toHaveBeenCalledTimes(1));
    expect(estado.devolver).toHaveBeenCalledWith({
      data: {
        leadId: "11111111-1111-4111-8111-111111111111",
        objetivo: "remarcar_visita",
        observacao: "Só sábado",
      },
    });
  });

  it("com o Marquinhos: mostra o objetivo e o botão de retomar", async () => {
    estado.devolucao = {
      id: "d9",
      lead_id: "l1",
      objetivo: "tirar_duvidas",
      observacao: null,
      status: "com_marquinhos",
      envio_pendente: null,
      ultimo_erro: null,
      enviado_em: new Date().toISOString(),
      encerrado_em: null,
      desfecho: null,
      resultado: null,
      criado_em: new Date().toISOString(),
    } satisfies Devolucao;
    estado.retomar.mockResolvedValue({ status: "retomando" });
    renderFaixa();
    expect(await screen.findByText("Com o Marquinhos · Tirar dúvidas do cliente")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Devolver ao Marquinhos/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Retomar atendimento/ }));
    await waitFor(() =>
      expect(estado.retomar).toHaveBeenCalledWith({ data: { devolucaoId: "d9" } }),
    );
  });
});
