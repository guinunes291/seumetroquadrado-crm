/**
 * FILA OFFLINE DO MODO VISITA
 *
 * A visita acontece em estande, decorado e subsolo. Concluir sem sinal
 * devolvia erro e, na prática, a visita não era registrada — e visita não
 * registrada não entra no relatório.
 *
 * A regra que importa aqui é a separação: falha de REDE entra na fila e é
 * retentada; falha de REGRA (follow-up faltando, fora da carteira) NÃO entra —
 * repetir não resolve, e enfileirar esconderia do corretor um problema que ele
 * precisa corrigir agora.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ehFalhaDeRede,
  enfileirar,
  listarFila,
  removerDaFila,
  sincronizarFila,
} from "@/features/visitas/fila-offline";

const item = (agendamentoId: string) => ({
  agendamentoId,
  leadNome: "Vantuylton",
  payload: { p_agendamento_id: agendamentoId, p_concluir: true },
});

beforeEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("classificação da falha", () => {
  it("erro de rede é retentável", () => {
    expect(ehFalhaDeRede(new TypeError("Failed to fetch"))).toBe(true);
    expect(ehFalhaDeRede({ message: "NetworkError when attempting to fetch resource" })).toBe(true);
    expect(ehFalhaDeRede({ status: 503, message: "Service Unavailable" })).toBe(true);
  });

  it("erro de regra do banco NÃO é retentável", () => {
    // 22023 = follow-up futuro obrigatório; 42501 = fora da carteira.
    expect(ehFalhaDeRede({ code: "22023", message: "aguardando retorno exige follow-up" })).toBe(
      false,
    );
    expect(ehFalhaDeRede({ code: "42501", message: "visita fora da carteira autorizada" })).toBe(
      false,
    );
  });

  it("aparelho offline torna qualquer falha retentável", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(ehFalhaDeRede({ message: "qualquer coisa" })).toBe(true);
  });
});

describe("fila", () => {
  it("guarda por agendamento e substitui em vez de duplicar", () => {
    enfileirar(item("ag-1"));
    enfileirar(item("ag-1"));
    enfileirar(item("ag-2"));
    expect(listarFila().map((i) => i.agendamentoId)).toEqual(["ag-1", "ag-2"]);
  });

  it("remove item enviado", () => {
    enfileirar(item("ag-1"));
    removerDaFila("ag-1");
    expect(listarFila()).toHaveLength(0);
  });

  it("descarta item mais velho que 7 dias", () => {
    enfileirar(item("ag-antigo"));
    const bruto = JSON.parse(window.localStorage.getItem("modo-visita:fila")!);
    bruto[0].enfileiradoEm = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem("modo-visita:fila", JSON.stringify(bruto));
    expect(listarFila()).toHaveLength(0);
  });
});

describe("sincronização", () => {
  it("envia o que estava pendente e esvazia a fila", async () => {
    enfileirar(item("ag-1"));
    enfileirar(item("ag-2"));
    const enviar = vi.fn().mockResolvedValue(undefined);

    const r = await sincronizarFila(enviar);

    expect(enviar).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ enviados: 2, pendentes: 0 });
    expect(listarFila()).toHaveLength(0);
  });

  it("falha de rede mantém o item para a próxima tentativa", async () => {
    enfileirar(item("ag-1"));
    const enviar = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const r = await sincronizarFila(enviar);

    expect(r).toEqual({ enviados: 0, pendentes: 1 });
    expect(listarFila()[0].tentativas).toBe(1);
  });

  it("falha de regra sai da fila e é reportada — não fica tentando para sempre", async () => {
    enfileirar(item("ag-1"));
    const erro = { code: "22023", message: "aguardando retorno exige follow-up futuro" };
    const enviar = vi.fn().mockRejectedValue(erro);
    const aoDescartar = vi.fn();

    const r = await sincronizarFila(enviar, aoDescartar);

    expect(r).toEqual({ enviados: 0, pendentes: 0 });
    expect(listarFila()).toHaveLength(0);
    expect(aoDescartar).toHaveBeenCalledWith(
      expect.objectContaining({ agendamentoId: "ag-1", leadNome: "Vantuylton" }),
      erro,
    );
  });

  it("uma visita presa por regra não impede as outras de subirem", async () => {
    enfileirar(item("ag-ruim"));
    enfileirar(item("ag-bom"));
    const enviar = vi.fn(async (payload: Record<string, unknown>) => {
      if (payload.p_agendamento_id === "ag-ruim") throw { code: "22023", message: "regra" };
    });

    const r = await sincronizarFila(enviar, () => {});

    expect(r).toEqual({ enviados: 1, pendentes: 0 });
  });
});
