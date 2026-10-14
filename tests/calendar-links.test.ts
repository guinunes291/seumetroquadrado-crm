import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl, buildIcsContent, icsTriggerAntes } from "@/lib/calendar-links";

const evento = {
  titulo: "Visita com Ana — Seu Metro Quadrado",
  inicio: "2026-11-20T13:00:00.000Z",
  fim: "2026-11-20T14:00:00.000Z",
  local: "Av. Paulista, 1000 - Bela Vista, São Paulo",
  descricao: "Corretora responsável: Ana",
};

describe("icsTriggerAntes", () => {
  it("converte minutos em duração ICS negativa", () => {
    expect(icsTriggerAntes(1440)).toBe("-P1D");
    expect(icsTriggerAntes(300)).toBe("-PT5H");
    expect(icsTriggerAntes(90)).toBe("-PT1H30M");
    expect(icsTriggerAntes(30)).toBe("-PT30M");
    expect(icsTriggerAntes(1500)).toBe("-P1DT1H");
    expect(icsTriggerAntes(0)).toBe("-PT0M");
  });
});

describe("buildIcsContent", () => {
  it("sem lembretes mantém o evento sem VALARM (comportamento anterior)", () => {
    const ics = buildIcsContent(evento, "uid-1");
    expect(ics).not.toContain("BEGIN:VALARM");
    expect(ics).toContain("DTSTART:20261120T130000Z");
    expect(ics).toContain("DTEND:20261120T140000Z");
  });

  it("gera um VALARM por lembrete: 1 dia antes e 5 horas antes", () => {
    const ics = buildIcsContent({ ...evento, lembretesMinutos: [300, 1440, 300] }, "uid-1");
    const alarmes = ics.split("BEGIN:VALARM").length - 1;
    expect(alarmes).toBe(2);
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT5H");
    // Dentro do VEVENT (antes do END:VEVENT), senão o leitor ignora.
    expect(ics.indexOf("TRIGGER:-PT5H")).toBeLessThan(ics.indexOf("END:VEVENT"));
  });

  it("dobra linhas longas em 75 octetos com CRLF + espaço (RFC 5545)", () => {
    const ics = buildIcsContent({ ...evento, descricao: "á".repeat(200) }, "uid-1");
    for (const linha of ics.split("\r\n")) {
      expect(new TextEncoder().encode(linha).length).toBeLessThanOrEqual(75);
    }
    const desdobrado = ics.replace(/\r\n /g, "");
    expect(desdobrado).toContain(`DESCRIPTION:${"á".repeat(200)}`);
  });

  it("escapa vírgula, ponto e vírgula e quebra de linha", () => {
    const ics = buildIcsContent({ ...evento, local: "Rua A, 10; fundos\nportão 2" }, "uid-1");
    expect(ics).toContain("LOCATION:Rua A\\, 10\\; fundos\\nportão 2");
  });
});

describe("buildGoogleCalendarUrl", () => {
  it("pré-preenche título, datas em UTC e local", () => {
    const url = new URL(buildGoogleCalendarUrl(evento));
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261120T130000Z/20261120T140000Z");
    expect(url.searchParams.get("location")).toBe(evento.local);
  });
});
