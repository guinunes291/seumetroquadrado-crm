import { describe, it, expect } from "vitest";
import {
  PERIODO_LABELS,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  mesRange,
  diasNoMes,
  getDateRange,
  dateKey,
  type PeriodoOption,
} from "@/lib/periodo";

// Quarta-feira, 15/07/2026 14:32:05.123 no fuso local — todas as asserções
// usam getters locais/dateKey, então o teste passa em qualquer timezone.
const QUARTA = new Date(2026, 6, 15, 14, 32, 5, 123);

describe("periodo — limites de dia", () => {
  it("startOfDay zera o horário no fuso local", () => {
    const inicio = startOfDay(QUARTA);
    expect(dateKey(inicio)).toBe("2026-07-15");
    expect([
      inicio.getHours(),
      inicio.getMinutes(),
      inicio.getSeconds(),
      inicio.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });

  it("endOfDay termina em 23:59:59.999 do MESMO dia local", () => {
    const fim = endOfDay(QUARTA);
    expect(dateKey(fim)).toBe("2026-07-15");
    expect([fim.getHours(), fim.getMinutes(), fim.getSeconds(), fim.getMilliseconds()]).toEqual([
      23, 59, 59, 999,
    ]);
  });

  it("não muta o Date recebido", () => {
    const original = new Date(2026, 6, 15, 14, 32, 5, 123);
    startOfDay(original);
    endOfDay(original);
    startOfWeek(original);
    endOfWeek(original);
    expect(original.getTime()).toBe(new Date(2026, 6, 15, 14, 32, 5, 123).getTime());
  });
});

describe("periodo — semana começa na segunda-feira", () => {
  it("quarta 15/07 volta para segunda 13/07 00:00", () => {
    const s = startOfWeek(QUARTA);
    expect(dateKey(s)).toBe("2026-07-13");
    expect(s.getDay()).toBe(1); // segunda
    expect(s.getHours()).toBe(0);
  });

  it("domingo pertence à semana iniciada na segunda ANTERIOR", () => {
    const domingo = new Date(2026, 6, 19, 10, 0); // 19/07/2026
    expect(dateKey(startOfWeek(domingo))).toBe("2026-07-13");
  });

  it("segunda-feira é o próprio início da semana", () => {
    const segunda = new Date(2026, 6, 13, 9, 0);
    expect(dateKey(startOfWeek(segunda))).toBe("2026-07-13");
  });

  it("endOfWeek = domingo 23:59:59.999", () => {
    const f = endOfWeek(QUARTA);
    expect(dateKey(f)).toBe("2026-07-19");
    expect(f.getDay()).toBe(0); // domingo
    expect(f.getHours()).toBe(23);
    expect(f.getMilliseconds()).toBe(999);
  });

  it("semana atravessa virada de mês e de ano", () => {
    const sexta = new Date(2027, 0, 1, 8, 0); // 01/01/2027 é sexta-feira
    expect(dateKey(startOfWeek(sexta))).toBe("2026-12-28");
    expect(dateKey(endOfWeek(sexta))).toBe("2027-01-03");
  });
});

describe("periodo — mês e ano", () => {
  it("startOfMonth/endOfMonth do mês corrente", () => {
    expect(dateKey(startOfMonth(QUARTA))).toBe("2026-07-01");
    expect(dateKey(endOfMonth(QUARTA))).toBe("2026-07-31");
    expect(endOfMonth(QUARTA).getHours()).toBe(23);
    expect(endOfMonth(QUARTA).getMilliseconds()).toBe(999);
  });

  it("fevereiro respeita ano bissexto", () => {
    expect(dateKey(endOfMonth(new Date(2028, 1, 10)))).toBe("2028-02-29");
    expect(dateKey(endOfMonth(new Date(2026, 1, 10)))).toBe("2026-02-28");
    expect(diasNoMes(2028, 2)).toBe(29);
    expect(diasNoMes(2026, 2)).toBe(28);
  });

  it("dezembro não vaza para o ano seguinte", () => {
    expect(dateKey(endOfMonth(new Date(2026, 11, 5)))).toBe("2026-12-31");
  });

  it("mesRange (mes 1–12) espelha start/endOfMonth", () => {
    const r = mesRange(2026, 7);
    expect(dateKey(r.from)).toBe("2026-07-01");
    expect(r.from.getHours()).toBe(0);
    expect(dateKey(r.to)).toBe("2026-07-31");
    expect(r.to.getMilliseconds()).toBe(999);
    // Janeiro e dezembro (extremos do ano).
    expect(dateKey(mesRange(2026, 1).from)).toBe("2026-01-01");
    expect(dateKey(mesRange(2026, 12).to)).toBe("2026-12-31");
  });

  it("startOfYear/endOfYear", () => {
    expect(dateKey(startOfYear(QUARTA))).toBe("2026-01-01");
    expect(dateKey(endOfYear(QUARTA))).toBe("2026-12-31");
    expect(endOfYear(QUARTA).getHours()).toBe(23);
  });
});

describe("periodo — getDateRange", () => {
  it("presets calculados a partir do `now` injetado", () => {
    expect(dateKey(getDateRange("today", QUARTA).from)).toBe("2026-07-15");
    expect(dateKey(getDateRange("today", QUARTA).to)).toBe("2026-07-15");
    expect(dateKey(getDateRange("this_week", QUARTA).from)).toBe("2026-07-13");
    expect(dateKey(getDateRange("this_week", QUARTA).to)).toBe("2026-07-19");
    expect(dateKey(getDateRange("this_month", QUARTA).from)).toBe("2026-07-01");
    expect(dateKey(getDateRange("this_month", QUARTA).to)).toBe("2026-07-31");
    expect(dateKey(getDateRange("this_year", QUARTA).from)).toBe("2026-01-01");
    expect(dateKey(getDateRange("this_year", QUARTA).to)).toBe("2026-12-31");
  });

  it("'all' = 2 anos para trás (00:00) até o instante atual", () => {
    const r = getDateRange("all", QUARTA);
    expect(dateKey(r.from)).toBe("2024-07-15");
    expect(r.from.getHours()).toBe(0);
    expect(r.to.getTime()).toBe(QUARTA.getTime());
  });

  it("labels cobrem todos os presets", () => {
    const presets: PeriodoOption[] = ["today", "this_week", "this_month", "this_year", "all"];
    for (const p of presets) expect(PERIODO_LABELS[p]).toBeTruthy();
    expect(Object.keys(PERIODO_LABELS)).toHaveLength(presets.length);
  });
});

describe("periodo — dateKey (timezone-safe)", () => {
  it("usa o dia LOCAL com zero à esquerda em mês e dia", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dateKey(new Date(2026, 8, 3, 0, 0, 0))).toBe("2026-09-03");
  });

  it("23:59 local continua no mesmo dia (sem virada UTC)", () => {
    expect(dateKey(new Date(2026, 6, 15, 23, 59, 59, 999))).toBe("2026-07-15");
    expect(dateKey(new Date(2026, 6, 15, 0, 0, 0, 0))).toBe("2026-07-15");
  });
});
