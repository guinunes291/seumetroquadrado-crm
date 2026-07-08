import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkSimuladorApiKey,
  montarResumoSimulacao,
  normalizarTelefoneCliente,
  validarPayloadSimulacao,
} from "@/lib/simulacao-webhook";
import { __resetRateLimit } from "@/lib/public-api-auth";

// Payload de referência do contrato (DESIGN §2.4 do simulador).
function payloadContrato(): Record<string, unknown> {
  return {
    origem: "simulador-aluguel-parcela",
    versao_calculo: "2026-07-portaria-333",
    corretor_id: "COR001",
    cliente_telefone: "5511999998888",
    empreendimento: null,
    inputs: { aluguel: 1800, renda: 4200, entrada: 20000 },
    resultado: {
      faixa: "F2",
      taxa_aa: 7.22,
      parcela_estimada: 1650.0,
      valor_imovel_max: 264000,
      aluguel_10anos: 259000,
      patrimonio_10anos: 310000,
      mes_cruzamento: 38,
    },
    ts: "2026-07-03T14:22:00-03:00",
  };
}

describe("webhook simulação — normalização de telefone", () => {
  it("ausente/vazio é válido e vira null (simulação anônima)", () => {
    expect(normalizarTelefoneCliente(null)).toEqual({ ok: true, valor: null });
    expect(normalizarTelefoneCliente(undefined)).toEqual({ ok: true, valor: null });
    expect(normalizarTelefoneCliente("  ")).toEqual({ ok: true, valor: null });
  });

  it("aceita 55+DDD+número (12–13 dígitos) como veio", () => {
    expect(normalizarTelefoneCliente("5511999998888")).toEqual({
      ok: true,
      valor: "5511999998888",
    });
    expect(normalizarTelefoneCliente("551133334444")).toEqual({ ok: true, valor: "551133334444" });
  });

  it("prefixa o DDI em números nacionais de 10–11 dígitos", () => {
    expect(normalizarTelefoneCliente("11999998888")).toEqual({ ok: true, valor: "5511999998888" });
    expect(normalizarTelefoneCliente("1133334444")).toEqual({ ok: true, valor: "551133334444" });
  });

  it("tolera máscara/formatação", () => {
    expect(normalizarTelefoneCliente("+55 (11) 99999-8888")).toEqual({
      ok: true,
      valor: "5511999998888",
    });
  });

  it("DDD 55 (Santa Maria) sem DDI não é confundido com DDI", () => {
    expect(normalizarTelefoneCliente("55999998888")).toEqual({ ok: true, valor: "5555999998888" });
  });

  it("rejeita comprimentos impossíveis", () => {
    expect(normalizarTelefoneCliente("123")).toEqual({ ok: false });
    expect(normalizarTelefoneCliente("999998888")).toEqual({ ok: false }); // 9 dígitos
    expect(normalizarTelefoneCliente("55119999988881")).toEqual({ ok: false }); // 14 dígitos
    expect(normalizarTelefoneCliente("511199999888")).toEqual({ ok: false }); // 12 sem DDI 55
  });
});

describe("webhook simulação — validação do contrato", () => {
  it("aceita o payload de referência do contrato", () => {
    const r = validarPayloadSimulacao(payloadContrato());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.origem).toBe("simulador-aluguel-parcela");
    expect(r.data.corretor_ref).toBe("COR001");
    expect(r.data.cliente_telefone).toBe("5511999998888");
    expect(r.data.inputs).toEqual({ aluguel: 1800, renda: 4200, entrada: 20000 });
    expect(r.data.resultado?.faixa).toBe("F2");
    expect(r.data.resultado?.mes_cruzamento).toBe(38);
    // ts com offset -03:00 vira ISO UTC
    expect(r.data.ts_origem).toBe("2026-07-03T17:22:00.000Z");
  });

  it("payload mínimo: só inputs (sem telefone, corretor e resultado)", () => {
    const r = validarPayloadSimulacao({ inputs: { aluguel: 800, renda: 2000, entrada: 0 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.origem).toBe("simulador-aluguel-parcela"); // default
    expect(r.data.cliente_telefone).toBeNull();
    expect(r.data.corretor_ref).toBeNull();
    expect(r.data.resultado).toBeNull();
    expect(r.data.flags).toEqual([]);
    expect(r.data.ts_origem).toBeNull();
  });

  it("corpo não-objeto é 422", () => {
    for (const body of [null, "texto", 42, [1, 2]]) {
      const r = validarPayloadSimulacao(body);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(422);
    }
  });

  it("aplica as faixas do contrato: aluguel 200–20000, renda 500–50000, entrada 0–1000000", () => {
    const casos = [
      { aluguel: 100, renda: 4200, entrada: 0 },
      { aluguel: 20001, renda: 4200, entrada: 0 },
      { aluguel: 1800, renda: 400, entrada: 0 },
      { aluguel: 1800, renda: 50001, entrada: 0 },
      { aluguel: 1800, renda: 4200, entrada: -1 },
      { aluguel: 1800, renda: 4200, entrada: 1_000_001 },
    ];
    for (const inputs of casos) {
      const r = validarPayloadSimulacao({ inputs });
      expect(r.ok, JSON.stringify(inputs)).toBe(false);
    }
    // Bordas inclusivas passam
    const ok = validarPayloadSimulacao({
      inputs: { aluguel: 200, renda: 500, entrada: 1_000_000 },
    });
    expect(ok.ok).toBe(true);
  });

  it("inputs como string são 422 — coerção mutilaria máscara BR ('20.000' viraria 20)", () => {
    const r = validarPayloadSimulacao({
      inputs: { aluguel: 1800, renda: 4200, entrada: "20.000" },
    });
    expect(r.ok).toBe(false);
  });

  it("corretor_id: COR<n> ou null; vazio vira null; outros formatos são 422", () => {
    const base = payloadContrato();
    for (const v of ["COR001", "COR42", null, ""]) {
      const r = validarPayloadSimulacao({ ...base, corretor_id: v });
      expect(r.ok, String(v)).toBe(true);
      if (r.ok) expect(r.data.corretor_ref).toBe(v === "COR001" || v === "COR42" ? v : null);
    }
    for (const v of ["cor001", "XYZ001", "COR", "001"]) {
      const r = validarPayloadSimulacao({ ...base, corretor_id: v });
      expect(r.ok, String(v)).toBe(false);
    }
  });

  it("telefone inválido é 422; ausente é ok", () => {
    const base = payloadContrato();
    const invalido = validarPayloadSimulacao({ ...base, cliente_telefone: "12345" });
    expect(invalido.ok).toBe(false);
    const sem = validarPayloadSimulacao({ ...base, cliente_telefone: null });
    expect(sem.ok).toBe(true);
    if (sem.ok) expect(sem.data.cliente_telefone).toBeNull();
  });

  it("mes_cruzamento: 1–120 ou null (definição §1.2)", () => {
    const base = payloadContrato();
    for (const v of [1, 120, null]) {
      const r = validarPayloadSimulacao({
        ...base,
        resultado: { ...(payloadContrato().resultado as object), mes_cruzamento: v },
      });
      expect(r.ok, String(v)).toBe(true);
    }
    for (const v of [0, 121, 3.5]) {
      const r = validarPayloadSimulacao({
        ...base,
        resultado: { ...(payloadContrato().resultado as object), mes_cruzamento: v },
      });
      expect(r.ok, String(v)).toBe(false);
    }
  });

  it("ts ilegível não derruba o payload — vira null", () => {
    const r = validarPayloadSimulacao({ ...payloadContrato(), ts: "ontem de tarde" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.ts_origem).toBeNull();
  });
});

describe("webhook simulação — resumo para a timeline", () => {
  function dados() {
    const r = validarPayloadSimulacao(payloadContrato());
    if (!r.ok) throw new Error("payload de referência deveria validar");
    return r.data;
  }

  it("traz os números da simulação em formato brasileiro", () => {
    const resumo = montarResumoSimulacao(dados());
    expect(resumo).toContain("1.800"); // aluguel
    expect(resumo).toContain("4.200"); // renda
    expect(resumo).toContain("F2");
    expect(resumo).toContain("7,22% a.a.");
    expect(resumo).toContain("≈"); // parcela sempre aproximada
    expect(resumo).toContain("1.650");
    expect(resumo).toContain("COR001");
  });

  it("linguagem de estimativa: cita a Caixa e nunca diz aprovado/garantido", () => {
    const resumo = montarResumoSimulacao(dados());
    expect(resumo).toContain("Caixa");
    expect(resumo.toLowerCase()).not.toContain("aprovado");
    expect(resumo.toLowerCase()).not.toContain("garantido");
  });

  it("sem resultado, ainda registra aluguel/renda/entrada e o disclaimer", () => {
    const r = validarPayloadSimulacao({
      inputs: { aluguel: 800, renda: 2000, entrada: 0 },
      flags: ["CAPACIDADE_INSUFICIENTE"],
    });
    if (!r.ok) throw new Error("deveria validar");
    const resumo = montarResumoSimulacao(r.data);
    expect(resumo).toContain("800");
    expect(resumo).toContain("2.000");
    expect(resumo).toContain("CAPACIDADE_INSUFICIENTE");
    expect(resumo).toContain("Caixa");
  });
});

describe("webhook simulação — autenticação por X-API-Key", () => {
  beforeEach(() => __resetRateLimit());
  afterEach(() => vi.unstubAllEnvs());

  function req(key?: string) {
    return new Request("https://app/api/public/webhooks/simulacao", {
      method: "POST",
      headers: key ? { "x-api-key": key } : {},
    });
  }

  it("sem SIMULADOR_API_KEY configurada devolve 500 (nunca abre sem auth)", () => {
    vi.stubEnv("SIMULADOR_API_KEY", "");
    const resp = checkSimuladorApiKey(req("qualquer"));
    expect(resp).not.toBeNull();
    expect(resp!.status).toBe(500);
  });

  it("chave errada ou ausente devolve 401", () => {
    vi.stubEnv("SIMULADOR_API_KEY", "segredo-correto");
    expect(checkSimuladorApiKey(req("segredo-errado"))!.status).toBe(401);
    expect(checkSimuladorApiKey(req())!.status).toBe(401);
  });

  it("chave correta passa (null) e consome o rate limit", () => {
    vi.stubEnv("SIMULADOR_API_KEY", "segredo-correto");
    expect(checkSimuladorApiKey(req("segredo-correto"))).toBeNull();
  });
});
