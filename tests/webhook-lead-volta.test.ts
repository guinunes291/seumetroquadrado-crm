// Volta do cliente pelo anúncio (registro mãe, Fatia B). A decisão mora no
// banco (tests/db/registro-mae-campanha.test.ts); aqui se trava o contrato que
// o webhook lê e o que ele escreve para o corretor e para o n8n.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOTIVO_VOLTA,
  lerVolta,
  semRegistroNovo,
  textoRegistroFilho,
  textoVoltaSemRegistroNovo,
} from "@/lib/webhook-lead-volta";

const LEAD = "11111111-1111-4111-8111-111111111111";
const CLIENTE = "22222222-2222-4222-8222-222222222222";
const CORRETOR = "33333333-3333-4333-8333-333333333333";
const DISPARO = "44444444-4444-4444-8444-444444444444";

describe("lerVolta — contrato de registrar_volta_campanha", () => {
  it("lê a base do corretor (disparo da base, 20261102120000)", () => {
    const v = lerVolta({
      acao: "base_do_corretor",
      lead_id: LEAD,
      cliente_id: CLIENTE,
      disparo_id: DISPARO,
      corretor_id: CORRETOR,
    });
    expect(v).toMatchObject({
      acao: "base_do_corretor",
      corretor_id: CORRETOR,
      disparo_id: DISPARO,
    });
    expect(semRegistroNovo(v)).toBe(true);
    // Sem o disparo no contrato, fail-closed.
    expect(
      lerVolta({ acao: "base_do_corretor", lead_id: LEAD, cliente_id: CLIENTE, corretor_id: null }),
    ).toBeNull();
  });

  it("só o registro filho e o cliente novo seguem para o INSERT/distribuição", () => {
    expect(semRegistroNovo({ acao: "cliente_novo" })).toBe(false);
    expect(semRegistroNovo(null)).toBe(false);
    expect(
      semRegistroNovo({
        acao: "registro_filho",
        lead_id: LEAD,
        cliente_id: CLIENTE,
        campos_herdados: [],
        corretores_excluidos: 0,
      }),
    ).toBe(false);
  });

  it("lê as quatro decisões", () => {
    expect(lerVolta({ acao: "cliente_novo" })).toEqual({ acao: "cliente_novo" });
    expect(
      lerVolta({ acao: "reenvio", lead_id: LEAD, cliente_id: CLIENTE, corretor_id: null }),
    ).toMatchObject({ acao: "reenvio", corretor_id: null });
    expect(
      lerVolta({
        acao: "negociacao_avancada",
        lead_id: LEAD,
        cliente_id: CLIENTE,
        corretor_id: CORRETOR,
      }),
    ).toMatchObject({ acao: "negociacao_avancada", corretor_id: CORRETOR });
    expect(
      lerVolta({
        acao: "registro_filho",
        lead_id: LEAD,
        cliente_id: CLIENTE,
        campos_herdados: ["usa_fgts"],
        corretores_excluidos: 1,
      }),
    ).toMatchObject({ acao: "registro_filho", campos_herdados: ["usa_fgts"] });
  });

  it("fail-closed: fora do contrato vira null (o webhook segue o INSERT de sempre)", () => {
    expect(lerVolta(null)).toBeNull();
    expect(lerVolta({ acao: "redistribuido_pela_roleta", lead_id: LEAD })).toBeNull();
    expect(lerVolta({ acao: "registro_filho", cliente_id: CLIENTE })).toBeNull();
    expect(lerVolta({ acao: "reenvio", lead_id: "x", cliente_id: CLIENTE })).toBeNull();
  });
});

describe("o que o webhook escreve", () => {
  it("motivo da resposta quando não nasce registro novo", () => {
    expect(MOTIVO_VOLTA).toEqual({
      reenvio: "reenvio_recente",
      negociacao_avancada: "mantido_negociacao_avancada",
      base_do_corretor: "mantido_base_do_corretor",
    });
  });

  it("nota do filho: de onde veio, o que veio pronto, sem o histórico dos outros", () => {
    const t = textoRegistroFilho(["renda_informada", "usa_fgts", "tem_fgts", "decisor"], {
      campanha: "Jardim BF",
    });
    expect(t).toContain("voltou pela campanha Jardim BF");
    expect(t).toContain("histórico de outros atendimentos não vem junto");
    expect(t).toContain("Vieram preenchidos: renda, FGTS, decisor.");
    expect(textoRegistroFilho([], { campanha: "Jardim BF" })).not.toContain("Vieram preenchidos");
  });

  it("nota do reenvio e da negociação avançada", () => {
    const ctx = { campanha: "Jardim BF", quando: "03/10/2026 18:00:00" };
    expect(textoVoltaSemRegistroNovo("reenvio", ctx)).toContain("nenhum registro novo");
    expect(textoVoltaSemRegistroNovo("negociacao_avancada", ctx)).toContain(
      "nenhum outro corretor recebe este cliente",
    );
    const base = textoVoltaSemRegistroNovo("base_do_corretor", ctx);
    expect(base).toContain("respondeu ao disparo da sua base");
    expect(base).toContain("nenhum outro corretor recebe este cliente");
  });
});

describe("rota do webhook", () => {
  const rota = readFileSync(
    join(process.cwd(), "src/routes/api/public/webhooks/lead/$token.ts"),
    "utf8",
  );

  it("não chama mais as RPCs que nunca existiram (a volta virava erro 500)", () => {
    expect(rota).not.toContain("buscar_lead_por_telefone_global_incl_perdido");
    expect(rota).not.toContain("redistribuir_duplicado_campanha");
  });

  it("volta sem registro novo diz se a pessoa está com um corretor (o Marquinhos lê distributed)", () => {
    expect(rota).toContain("distributed: Boolean(v.corretor_id && telDono),");
    expect(rota).toContain("duplicate: true,");
  });

  it("o filho segue o caminho do lead novo: mesma distribuição, mesma notificação", () => {
    const filho = rota.indexOf('volta?.acao === "registro_filho" ? { id: volta.lead_id } : null');
    const distribui = rota.indexOf("if (data.distribuir) {");
    expect(filho).toBeGreaterThan(0);
    expect(distribui).toBeGreaterThan(filho);
  });

  it("corrida no INSERT (23505) pergunta ao banco de novo antes do caminho antigo", () => {
    const corrida = rota.indexOf('.code === "23505"');
    const deNovo = rota.indexOf("volta = await decidirVolta();", corrida);
    const antigo = rota.indexOf('"buscar_lead_duplicado"', corrida);
    expect(corrida).toBeGreaterThan(0);
    expect(deNovo).toBeGreaterThan(corrida);
    expect(antigo).toBeGreaterThan(deNovo);
  });
});
