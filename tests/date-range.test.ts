import { describe, it, expect } from "vitest";
import { spDateString, spOffset, rangeForPeriodo } from "@/lib/date-range";

// Instante que já virou o dia em UTC (00:30 do dia 30) mas ainda é dia 29 em SP
// (21:30 BRT). É o caso que o bug original (toISOString) errava.
const NOITE_BRT = new Date("2026-06-30T02:30:00.000Z"); // 23:30 de 29/06 em SP

describe("date-range — fuso de negócio (America/Sao_Paulo)", () => {
  it("spDateString usa a data civil de SP, não a de UTC (regressão de timezone)", () => {
    expect(spDateString(NOITE_BRT)).toBe("2026-06-29");
    // Meio-dia UTC é o mesmo dia em SP.
    expect(spDateString(new Date("2026-06-29T12:00:00.000Z"))).toBe("2026-06-29");
  });

  it("spOffset retorna -03:00 para SP", () => {
    expect(spOffset(NOITE_BRT)).toBe("-03:00");
  });

  it("hoje: di = df = data civil de SP, com limites ISO no offset correto", () => {
    const r = rangeForPeriodo("hoje", NOITE_BRT);
    expect(r.diDate).toBe("2026-06-29");
    expect(r.dfDate).toBe("2026-06-29");
    // 00:00 -03:00 do dia 29 = 03:00Z; 23:59:59.999 -03:00 = 02:59:59.999Z do dia 30.
    expect(r.iniIso).toBe("2026-06-29T03:00:00.000Z");
    expect(r.fimIso).toBe("2026-06-30T02:59:59.999Z");
  });

  it("semana: segunda a domingo, 7 dias, contendo o dia atual", () => {
    const r = rangeForPeriodo("semana", NOITE_BRT);
    const di = new Date(`${r.diDate}T12:00:00Z`);
    const df = new Date(`${r.dfDate}T12:00:00Z`);
    expect(di.getUTCDay()).toBe(1); // segunda
    expect(df.getUTCDay()).toBe(0); // domingo
    const dias = Math.round((df.getTime() - di.getTime()) / 86_400_000);
    expect(dias).toBe(6);
    expect(r.diDate <= "2026-06-29").toBe(true);
    expect("2026-06-29" <= r.dfDate).toBe(true);
  });

  it("mes: do dia 1 ao último dia do mês atual", () => {
    const r = rangeForPeriodo("mes", NOITE_BRT);
    expect(r.diDate).toBe("2026-06-01");
    expect(r.dfDate).toBe("2026-06-30"); // junho tem 30 dias
  });

  it("mes em fevereiro respeita o último dia (28/29)", () => {
    const fev = new Date("2026-02-15T12:00:00.000Z");
    const r = rangeForPeriodo("mes", fev);
    expect(r.diDate).toBe("2026-02-01");
    expect(r.dfDate).toBe("2026-02-28"); // 2026 não é bissexto
  });
});
