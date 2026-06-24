import { describe, it, expect } from "vitest";
import { onlyDigits } from "@/lib/validators";

// Contrato de deduplicação do intake de leads.
//
// Tanto a RPC `buscar_lead_duplicado` (regexp_replace(telefone,'\D','','g'))
// quanto o edge function `lead-intake` normalizam o telefone para SÓ DÍGITOS
// antes de comparar. Estes testes travam esse invariante: variações de
// formatação do mesmo número devem colapsar para a mesma chave de dedup, e
// telefones curtos demais (<8 dígitos) não devem ser considerados.

function dedupKey(raw: string): string | null {
  const d = onlyDigits(raw);
  return d.length >= 8 ? d : null;
}

describe("lead-intake — normalização de telefone para dedup", () => {
  it("colapsa formatos diferentes do mesmo número para a mesma chave", () => {
    const variantes = [
      "(11) 91234-5678",
      "11 91234 5678",
      "11912345678",
      "+55 11 91234-5678".replace("55", ""), // mesmo número sem DDI
    ];
    const chaves = variantes.map(dedupKey);
    expect(chaves.every((c) => c === "11912345678")).toBe(true);
  });

  it("trata DDI como parte da chave (número com e sem 55 são distintos)", () => {
    expect(dedupKey("5511912345678")).toBe("5511912345678");
    expect(dedupKey("11912345678")).toBe("11912345678");
    expect(dedupKey("5511912345678")).not.toBe(dedupKey("11912345678"));
  });

  it("ignora telefones curtos demais (<8 dígitos)", () => {
    expect(dedupKey("1234")).toBeNull();
    expect(dedupKey("(11) 9")).toBeNull();
  });

  it("aceita o piso de 8 dígitos", () => {
    expect(dedupKey("3322-4455")).toBe("33224455");
  });
});
