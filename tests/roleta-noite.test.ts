// Roleta fechada à noite (20261014120000): leitura do que o motor devolve e os
// textos das telas/webhook. A regra (que horas fecha) é do banco — testada em
// tests/db/roleta-fechada-noite.test.ts.
import { describe, expect, it } from "vitest";
import {
  horaCurta,
  lerAdiadoNoite,
  lerJanela,
  notaLeadNoite,
  quandoReabre,
  textoJanela,
} from "@/lib/roleta-noite";

describe("lerAdiadoNoite", () => {
  it("reconhece o 'adiado' da roleta fechada e lê a hora da reabertura", () => {
    expect(
      lerAdiadoNoite({
        ok: false,
        adiado: true,
        motivo: "roleta_fechada_noite",
        reabre_as: "09:00",
      }),
    ).toEqual({ reabreAs: "09:00" });
  });

  it("outros 'sem corretor' não são a roleta fechada", () => {
    expect(lerAdiadoNoite({ ok: false, motivo: "sem_corretor_na_zona" })).toBeNull();
    expect(lerAdiadoNoite({ ok: false, adiado: true, motivo: "fora_do_horario" })).toBeNull();
    expect(lerAdiadoNoite(null)).toBeNull();
    expect(lerAdiadoNoite("roleta_fechada_noite")).toBeNull();
  });

  it("sem a hora no retorno, ainda é roleta fechada (hora desconhecida)", () => {
    expect(lerAdiadoNoite({ motivo: "roleta_fechada_noite" })).toEqual({ reabreAs: null });
  });
});

describe("lerJanela", () => {
  it("lê o retorno de roleta_janela_v1", () => {
    expect(
      lerJanela({
        ativa: true,
        inicio: "22:00",
        fim: "09:00",
        fechada: true,
        reabre_em: "2026-10-13T12:00:00+00:00",
        fecha_em: null,
        agora: "2026-10-13T02:00:00+00:00",
      }),
    ).toEqual({
      ativa: true,
      inicio: "22:00",
      fim: "09:00",
      fechada: true,
      reabre_em: "2026-10-13T12:00:00+00:00",
      fecha_em: null,
    });
  });

  it("formato estranho nunca liga o aviso", () => {
    expect(lerJanela(null)).toBeNull();
    expect(lerJanela([1, 2])).toBeNull();
    expect(lerJanela({ fechada: "sim" })).toMatchObject({ fechada: false, ativa: false });
  });
});

describe("textos", () => {
  it("hora curta como se fala", () => {
    expect(horaCurta("09:00")).toBe("9h");
    expect(horaCurta("22:00")).toBe("22h");
    expect(horaCurta("08:30")).toBe("8h30");
    expect(horaCurta(null)).toBe("9h");
  });

  it("a janela numa linha", () => {
    expect(textoJanela({ inicio: "22:00", fim: "09:00" })).toBe(
      "A roleta fecha às 22h e reabre às 9h.",
    );
  });

  it("'hoje' de madrugada, 'amanhã' antes da meia-noite (relógio de Brasília)", () => {
    // 9h BRT de 13/10 = 12:00Z.
    const reabre = "2026-10-13T12:00:00Z";
    expect(quandoReabre(reabre, new Date("2026-10-13T02:30:00Z"))).toBe("amanhã às 9h"); // 23h30 do dia 12
    expect(quandoReabre(reabre, new Date("2026-10-13T06:00:00Z"))).toBe("hoje às 9h"); // 3h do dia 13
    expect(quandoReabre(null)).toBe("às 9h");
  });

  it("nota do lead: hora de chegada em Brasília e, se veio do robô, o que o cliente ouviu", () => {
    const viaRobo = notaLeadNoite({
      reabreAs: "09:00",
      chegouEm: new Date("2026-10-13T02:14:00Z"), // 23:14 BRT
      viaMarquinhos: true,
    });
    expect(viaRobo).toContain("Chegou às 23:14, com a roleta fechada");
    expect(viaRobo).toContain("Entra na roleta às 9h");
    expect(viaRobo).toContain("O Marquinhos avisou o cliente");

    const direto = notaLeadNoite({
      reabreAs: "09:00",
      chegouEm: new Date("2026-10-13T02:14:00Z"),
      viaMarquinhos: false,
    });
    expect(direto).not.toContain("Marquinhos");
  });
});
