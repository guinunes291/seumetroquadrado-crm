import { describe, expect, it } from "vitest";
import { mesesPrevisaoRecebimento } from "@/lib/periodo";

describe("previsão de recebimento", () => {
  it("oferece somente os 12 meses seguintes, inclusive na virada do ano", () => {
    const meses = mesesPrevisaoRecebimento(new Date("2026-10-19T16:59:00Z"));
    expect(meses.map((mes) => mes.value)).toEqual([
      "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04",
      "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10",
    ]);
  });

  it("usa o mês de Brasília mesmo quando UTC já virou o mês", () => {
    const meses = mesesPrevisaoRecebimento(new Date("2026-11-01T01:00:00Z"));
    expect(meses[0]?.value).toBe("2026-11");
    expect(meses[11]?.value).toBe("2027-10");
  });
});