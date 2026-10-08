// Fila do Dia da cadência — o botão "Mandar WhatsApp" e o "Cliente respondeu".
//
// O defeito que isto trava: o botão abria o wa.me com "noopener", e com ele o
// spec do HTML manda window.open devolver null MESMO quando a aba abre. A tela
// lia null como pop-up bloqueado, mostrava o erro e nunca gravava a tentativa —
// nenhuma etapa da cadência fechava pela tela. O window.open falso daqui segue
// o spec (noopener/noreferrer → null), então o código antigo reprova.
//
// E o texto do "Cliente respondeu": o banco põe o lead em Em atendimento (não
// na qualificação) quando ele ainda está antes dela; nos outros status, só tira
// da cadência.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { CadenciaItem, RegistroTentativa } from "@/features/cadencia/client";
import { RESPONDEU_ENTRA_EM_ATENDIMENTO, textosRespondeu } from "@/features/cadencia/respondeu";

const estado = vi.hoisted(() => ({
  itens: [] as unknown[],
  templates: {} as Record<string, { id: string; conteudo: string; contexto: string }>,
  registrarWhatsApp: vi.fn(),
  registrarLigacao: vi.fn(),
  marcarRespondeu: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
}));
vi.mock("@/features/cadencia/client", () => ({
  fetchFilaCadencia: async () => ({
    gerado_em: "2026-10-08T12:00:00Z",
    corretor_id: "c1",
    itens: estado.itens,
  }),
  carregarTemplates: async () => estado.templates,
  registrarWhatsApp: (...args: unknown[]) => estado.registrarWhatsApp(...args),
  registrarLigacao: (...args: unknown[]) => estado.registrarLigacao(...args),
  marcarRespondeu: (...args: unknown[]) => estado.marcarRespondeu(...args),
}));
vi.mock("@/features/em-atendimento/janela-troca-context", () => ({
  useJanelaTroca: () => null,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock("sonner", () => ({ toast: estado.toast }));

import { FilaCadenciaView } from "@/features/cadencia/fila-view";

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_ID = "22222222-2222-4222-8222-222222222222";
const BLOQUEOU = "O navegador bloqueou a janela do WhatsApp. Libere os pop-ups e tente de novo.";

function item(p: Partial<CadenciaItem> = {}): CadenciaItem {
  return {
    id: LEAD_ID,
    nome: "Maria das Graças",
    telefone: "(11) 99999-0000",
    email: null,
    status: "aguardando_atendimento",
    etapa: "D0",
    ciclo: 1,
    reativado: false,
    projeto_nome: "Vibra Vila Maria",
    faixa_mcmv: null,
    renda_estimada: null,
    prazo: "2026-10-08T23:59:00Z",
    atrasado: false,
    proxima_acao: null,
    telefone_suspeito: false,
    ligacoes_validas: 2,
    whatsapp_enviado: false,
    etapa_completa: false,
    ...p,
  };
}

const registro: RegistroTentativa = {
  tentativa_id: "33333333-3333-4333-8333-333333333333",
  etapa: "D0",
  etapa_completa: true,
  etapa_nova: "D1",
  encerrado: false,
};

function abaFalsa() {
  return {
    opener: window as Window | null,
    location: { href: "about:blank" },
    close: vi.fn(),
  };
}

/** window.open como o spec manda: com noopener/noreferrer devolve null mesmo
 *  abrindo; `bloqueado` simula o bloqueador de pop-up de verdade. */
function espiarOpen(aba: ReturnType<typeof abaFalsa>, bloqueado = false) {
  return vi
    .spyOn(window, "open")
    .mockImplementation((_url, _target, features) =>
      bloqueado || /noopener|noreferrer/i.test(features ?? "") ? null : (aba as unknown as Window),
    );
}

function montar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <FilaCadenciaView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  estado.itens = [item()];
  estado.templates = {
    D0: {
      id: TEMPLATE_ID,
      conteudo: "Oi, {nome}! Sobre o {empreendimento}: acabei de tentar te ligar.",
      contexto: "cadencia_D0",
    },
  };
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  estado.registrarWhatsApp.mockReset();
  estado.registrarLigacao.mockReset();
  estado.marcarRespondeu.mockReset();
  estado.toast.success.mockReset();
  estado.toast.error.mockReset();
});

async function botaoWhatsApp() {
  const botao = await screen.findByRole("button", { name: /Mandar WhatsApp/ });
  // O template chega por outra query: o botão nasce desabilitado sem link.
  await waitFor(() => expect(botao).toBeEnabled());
  return botao;
}

describe("Fila do Dia: Mandar WhatsApp", () => {
  it("grava a tentativa com o template e só então leva a aba reservada ao wa.me", async () => {
    const aba = abaFalsa();
    const open = espiarOpen(aba);
    let hrefNaGravacao: string | null = null;
    estado.registrarWhatsApp.mockImplementation(async () => {
      hrefNaGravacao = aba.location.href;
      return registro;
    });

    montar();
    fireEvent.click(await botaoWhatsApp());

    await waitFor(() => expect(aba.location.href).toMatch(/^https:\/\/wa\.me\/5511999990000\?/));
    expect(estado.registrarWhatsApp).toHaveBeenCalledTimes(1);
    expect(estado.registrarWhatsApp).toHaveBeenCalledWith(LEAD_ID, TEMPLATE_ID);

    // A aba ainda estava em branco quando a gravação rodou.
    expect(hrefNaGravacao).toBe("about:blank");
    const texto = decodeURIComponent(aba.location.href.split("text=")[1]);
    expect(texto).toBe("Oi, Maria! Sobre o Vibra Vila Maria: acabei de tentar te ligar.");

    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0][2] ?? "")).not.toMatch(/noopener|noreferrer/i);
    expect(aba.opener).toBeNull();
    expect(aba.close).not.toHaveBeenCalled();
    expect(estado.toast.error).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(estado.toast.success).toHaveBeenCalledWith(
        "Lead chegou completo — o lead já está em 1º follow-up.",
      ),
    );
  });

  it("pop-up bloqueado de verdade: avisa e NÃO grava", async () => {
    const aba = abaFalsa();
    espiarOpen(aba, true);
    // Se a tela gravasse mesmo assim, a gravação daria certo — nada de erro
    // acidental mascarando o que se verifica aqui.
    estado.registrarWhatsApp.mockResolvedValue(registro);

    montar();
    fireEvent.click(await botaoWhatsApp());

    expect(estado.toast.error).toHaveBeenCalledWith(BLOQUEOU);
    // A mutação só chega no registrarWhatsApp alguns microtasks depois do
    // clique: checar na hora passaria mesmo com a tela gravando.
    await new Promise((r) => setTimeout(r, 0));
    expect(estado.registrarWhatsApp).not.toHaveBeenCalled();
    expect(aba.location.href).toBe("about:blank");
  });

  it("gravação que falha fecha a aba reservada e mostra o erro da mutação", async () => {
    const aba = abaFalsa();
    espiarOpen(aba);
    estado.registrarWhatsApp.mockRejectedValue(new Error("lead não está em cadência ativa"));

    montar();
    fireEvent.click(await botaoWhatsApp());

    await waitFor(() => expect(aba.close).toHaveBeenCalledTimes(1));
    expect(aba.location.href).toBe("about:blank");
    await waitFor(() =>
      expect(estado.toast.error).toHaveBeenCalledWith("lead não está em cadência ativa"),
    );
    expect(estado.toast.error).not.toHaveBeenCalledWith(BLOQUEOU);
  });

  it("sem rede: a gravação falha na hora, a aba fecha e nada sai quando a rede volta", async () => {
    const aba = abaFalsa();
    espiarOpen(aba);
    // Como o fetch de verdade: sem rede falha, com rede grava.
    estado.registrarWhatsApp.mockImplementation(async () => {
      if (!onlineManager.isOnline()) throw new Error("TypeError: Failed to fetch");
      return registro;
    });

    montar();
    const botao = await botaoWhatsApp();
    onlineManager.setOnline(false);
    fireEvent.click(botao);

    // Com o networkMode padrão a mutação ficaria pausada: aba em branco, sem aviso.
    await waitFor(() => expect(aba.close).toHaveBeenCalledTimes(1));
    expect(estado.toast.error).toHaveBeenCalledWith("TypeError: Failed to fetch");

    // A rede volta: nenhuma mutação pausada é retomada para gravar depois.
    onlineManager.setOnline(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(estado.registrarWhatsApp).toHaveBeenCalledTimes(1);
    await expect(estado.registrarWhatsApp.mock.results[0].value).rejects.toThrow();
    expect(aba.location.href).toBe("about:blank");
    expect(estado.toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(botao).toBeEnabled());
  });

  it("Encerramento completo não fala em modo sombra (D3 nunca avança na escrita)", async () => {
    estado.itens = [item({ etapa: "D3", ligacoes_validas: 0 })];
    estado.templates = {
      D3: {
        id: TEMPLATE_ID,
        conteudo: "Oi, {nome}! Vou encerrar por aqui.",
        contexto: "cadencia_D3",
      },
    };
    const aba = abaFalsa();
    espiarOpen(aba);
    estado.registrarWhatsApp.mockResolvedValue({
      ...registro,
      etapa: "D3",
      etapa_completa: true,
      etapa_nova: null,
    } satisfies RegistroTentativa);

    montar();
    fireEvent.click(await botaoWhatsApp());

    await waitFor(() =>
      expect(estado.toast.success).toHaveBeenCalledWith("Encerramento completo."),
    );
    expect(String(estado.toast.success.mock.calls[0][0])).not.toMatch(/sombra/i);
    expect(aba.location.href).toMatch(/^https:\/\/wa\.me\//);
  });

  it("clique duplo com a gravação em voo grava uma vez só", async () => {
    const aba = abaFalsa();
    const open = espiarOpen(aba);
    let confirmar!: (r: RegistroTentativa) => void;
    estado.registrarWhatsApp.mockImplementation(
      () => new Promise<RegistroTentativa>((res) => (confirmar = res)),
    );

    montar();
    const botao = await botaoWhatsApp();
    fireEvent.click(botao);
    fireEvent.click(botao);

    // O segundo clique chega antes de o botão desabilitar (o isPending só
    // aparece no render seguinte): quem segura é a linha.
    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(botao).toBeDisabled());
    expect(estado.registrarWhatsApp).toHaveBeenCalledTimes(1);

    confirmar(registro);
    await waitFor(() => expect(aba.location.href).toMatch(/^https:\/\/wa\.me\//));
  });
});

describe("Cliente respondeu: para onde o lead vai", () => {
  it("os quatro status antes de Em atendimento entram; o resto só sai da cadência", () => {
    for (const status of [
      "novo",
      "aguardando_atendimento",
      "aguardando_corretor",
      "aguardando_retorno",
    ]) {
      expect(textosRespondeu(status)).toEqual({
        destino: "O lead sai da cadência e entra em atendimento.",
        botao: "Salvar e pôr em atendimento",
        sucesso: "Lead entrou em atendimento, com o próximo passo agendado.",
      });
    }
    for (const status of ["qualificacao_corretor", "em_atendimento", "", null, undefined]) {
      expect(textosRespondeu(status)).toEqual({
        destino: "O lead sai da cadência e continua na etapa em que está.",
        botao: "Salvar próximo passo",
        sucesso: "Lead fora da cadência, com o próximo passo agendado.",
      });
    }
  });

  it("nenhum texto promete qualificação", () => {
    for (const status of ["novo", "qualificacao_corretor"]) {
      expect(Object.values(textosRespondeu(status)).join(" ")).not.toMatch(/qualifica/i);
    }
  });

  it("o recorte é o mesmo da RPC cadencia_marcar_respondeu", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261011120500_em_atendimento_fatia6_tentativa.sql"),
      "utf8",
    );
    const corpo = sql.slice(sql.indexOf("FUNCTION public.cadencia_marcar_respondeu"));
    const caso = /WHEN status IN \(([^)]*)\)\s*THEN 'em_atendimento'/.exec(corpo);
    expect(caso).not.toBeNull();
    const doBanco = [...caso![1].matchAll(/'([a-z_]+)'::public\.lead_status/g)].map((m) => m[1]);
    expect(doBanco.sort()).toEqual([...RESPONDEU_ENTRA_EM_ATENDIMENTO].sort());
  });

  it("no diálogo: lead em Aguardando atendimento vai para atendimento", async () => {
    estado.marcarRespondeu.mockResolvedValue(undefined);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Cliente respondeu/ }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo.textContent).toContain("O lead sai da cadência e entra em atendimento.");
    expect(dialogo.textContent).not.toMatch(/qualifica/i);

    fireEvent.change(screen.getByLabelText("Próximo passo combinado"), {
      target: { value: "visita sábado 10h" },
    });
    fireEvent.change(screen.getByLabelText("Quando"), { target: { value: "2099-01-10T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar e pôr em atendimento" }));

    await waitFor(() =>
      expect(estado.toast.success).toHaveBeenCalledWith(
        "Lead entrou em atendimento, com o próximo passo agendado.",
      ),
    );
    expect(estado.marcarRespondeu).toHaveBeenCalledWith(
      LEAD_ID,
      "visita sábado 10h",
      new Date("2099-01-10T10:00"),
    );
  });

  it("no diálogo: lead fora desses status só sai da cadência", async () => {
    estado.itens = [item({ status: "qualificacao_corretor" })];
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Cliente respondeu/ }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo.textContent).toContain(
      "O lead sai da cadência e continua na etapa em que está.",
    );
    expect(screen.getByRole("button", { name: "Salvar próximo passo" })).toBeTruthy();
    expect(dialogo.textContent).not.toMatch(/qualifica/i);
  });
});
