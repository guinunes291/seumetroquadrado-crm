// Token NEUTRO do webhook de lead — fim do "lead Sabara" (2026-09-28).
// Lead de bot sem empreendimento nascia com o projeto dono do "token geral"
// (Sabara). O token neutro autentica sem amarrar projeto; o banco guarda só o
// hash dele.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAVE_TOKEN_NEUTRO,
  nomeProjetoDoLead,
  sha256Hex,
  tokenBateComHash,
} from "@/lib/webhook-token-neutro";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("tokenBateComHash", () => {
  const token = "a".repeat(64);
  const hash = sha256Hex(token);

  it("aceita o token cujo SHA-256 está guardado (hex em qualquer caixa)", () => {
    expect(tokenBateComHash(token, hash)).toBe(true);
    expect(tokenBateComHash(token, hash.toUpperCase())).toBe(true);
  });

  it("recusa token diferente", () => {
    expect(tokenBateComHash("b".repeat(64), hash)).toBe(false);
  });

  it("hash ausente ou malformado nunca autentica", () => {
    for (const v of [null, undefined, "", 42, "xyz", hash.slice(1), { hash }]) {
      expect(tokenBateComHash(token, v)).toBe(false);
    }
  });
});

describe("nomeProjetoDoLead", () => {
  it("payload manda: empreendimento > empreendimentoInteresse > nome do token", () => {
    expect(nomeProjetoDoLead({ empreendimento: "Elev Saúde" }, "Sabara")).toBe("Elev Saúde");
    expect(nomeProjetoDoLead({ empreendimentoInteresse: "Well Perdizes" }, "Sabara")).toBe(
      "Well Perdizes",
    );
    expect(nomeProjetoDoLead({}, "Sabara")).toBe("Sabara");
  });

  it('campo vazio do n8n ("") não vira nome — cai para o próximo', () => {
    expect(
      nomeProjetoDoLead({ empreendimento: "  ", empreendimentoInteresse: "" }, "Motoboy"),
    ).toBe("Motoboy");
  });

  it("token neutro sem empreendimento → sem projeto (o caso Jaqueline)", () => {
    expect(nomeProjetoDoLead({ empreendimentoInteresse: "" }, null)).toBeNull();
    expect(nomeProjetoDoLead({ empreendimentoInteresse: "Elev Saúde" }, null)).toBe("Elev Saúde");
  });
});

describe("fiação da rota do webhook", () => {
  const rota = read("src/routes/api/public/webhooks/lead/$token.ts");

  it("consulta o token neutro só quando o token não é de roleta nem de projeto", () => {
    expect(rota).toContain("} else if (!campanha && !projetoDoToken) {");
    expect(rota).toContain('.eq("chave", CHAVE_TOKEN_NEUTRO)');
    expect(rota).toContain("tokenBateComHash(token, cfg?.valor)");
    expect(rota).toContain("projeto = { id: null, nome: null, ativo: true };");
  });

  it("o nome do projeto sai da regra única (nunca herda projeto no token neutro)", () => {
    expect(rota).toContain("nomeProjetoDoLead(data, projeto.nome)");
  });

  it("dedup: token neutro nunca é 'mesmo projeto' por null === null", () => {
    expect(rota).toContain("projeto.id !== null && leadExistente?.projeto_id === projeto.id");
  });
});

describe("migration do token neutro", () => {
  const MIG = "supabase/migrations/20261002120000_webhook_token_neutro.sql";
  const mig = read(MIG);

  it("grava só o hash, na chave que a rota lê, sem desfazer rotação no replay", () => {
    expect(mig).toContain(`'${CHAVE_TOKEN_NEUTRO}'`);
    expect(mig).toMatch(/to_jsonb\('[0-9a-f]{64}'::text\)/);
    expect(mig).toContain("ON CONFLICT (chave) DO NOTHING");
  });
});
