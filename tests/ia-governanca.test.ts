// Contrato das superfícies de IA unificadas sob a governança do SamiQ
// (item 0.6 da estrategia-2026-08, métrica C3). Espelha o bloco de contrato de
// samiq-governance.test.ts: os 3 handlers precisam reservar/finalizar pela
// governança, minimizar PII e nunca carregar modelo hardcoded.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const HANDLERS = {
  "match-ia": read("src/lib/match-ia.functions.ts"),
  "resumo-ia": read("src/lib/lead-resumo-ia.functions.ts"),
  "mensagem-ia": read("src/lib/lead-mensagem-ia.functions.ts"),
} as const;

const governance = read("src/lib/samiq-governance.server.ts");

describe("IA unificada sob governança (C3)", () => {
  for (const [nome, source] of Object.entries(HANDLERS)) {
    describe(nome, () => {
      it("reserva e finaliza pela governança", () => {
        expect(source).toContain("reserveGovernedAIExecution");
        expect(source).toContain("finishSamiQExecution");
      });

      it("não carrega modelo hardcoded — o id vem da reserva", () => {
        expect(source).not.toContain('gateway("google/gemini');
        expect(source).toContain("gateway(reservation.modelId)");
      });

      it("minimiza PII antes de falar com o modelo", () => {
        expect(source).toContain("redactSamiQFreeText");
        expect(source).toContain("minimizeSamiQContext");
      });

      it("limita o tamanho da saída pela reserva", () => {
        expect(source).toContain("maxOutputTokens: reservation.maxOutputTokens");
      });
    });
  }

  it("resumo e mensagem não enviam nome completo nem texto cru de conversa", () => {
    for (const nome of ["resumo-ia", "mensagem-ia"] as const) {
      const source = HANDLERS[nome];
      expect(source).toContain("firstNameForSamiQ");
      expect(source).not.toMatch(/nome:\s*lead\.nome/);
      expect(source).not.toMatch(/conteudo:\s*i\.conteudo\?\.slice/);
    }
  });

  it("mensagem-ia impõe teto na biblioteca de objeções", () => {
    expect(HANDLERS["mensagem-ia"]).toMatch(/from\("objecoes"\)[\s\S]{0,200}\.limit\(30\)/);
  });

  it("quota negada nunca degrada para o fallback — só governança indisponível", () => {
    expect(governance).toContain("SamiQGovernanceUnavailableError");
    expect(governance).toMatch(
      /if \(!\(error instanceof SamiQGovernanceUnavailableError\)\) throw error/,
    );
  });

  it("o fallback preserva o teto de custo local (rate limit por usuário)", () => {
    expect(governance).toMatch(/rateLimit\(\s*`\$\{args\.fallback\.rateLimitKey\}/);
  });
});
