// Briefing ao abrir a Sami (Onda S3, D13) — regra pura: linhas, ordem, tom,
// pergunta pronta por linha, saudação no fuso de SP e o evento "open-samiq"
// com contexto (chips contextuais, D19).
import { describe, expect, it } from "vitest";
import {
  montarBriefingSamiQ,
  resumirBriefingSamiQ,
  saudacaoSamiQ,
  type BriefingDados,
} from "@/lib/samiq-briefing";
import {
  SAMIQ_ABRIR_EVENTO,
  lerDetalheAbrirSamiQ,
  textoRegistrarComSami,
} from "@/components/samiq/abrir-samiq";

const LEAD = "123e4567-e89b-12d3-a456-426614174000";
const agora = new Date("2026-09-10T12:30:00Z"); // 09:30 em São Paulo

function dados(over: Partial<BriefingDados> = {}): BriefingDados {
  return {
    agora,
    hoje: "2026-09-10",
    agenda: [],
    tarefasVencidas: [],
    totalTarefasVencidas: 0,
    contagens: {},
    ...over,
  };
}

describe("saudação", () => {
  it("segue a hora de São Paulo, não a de UTC", () => {
    expect(saudacaoSamiQ(new Date("2026-09-10T12:30:00Z"))).toBe("Bom dia"); // 09:30 SP
    expect(saudacaoSamiQ(new Date("2026-09-10T16:00:00Z"))).toBe("Boa tarde"); // 13:00 SP
    expect(saudacaoSamiQ(new Date("2026-09-10T22:00:00Z"))).toBe("Boa noite"); // 19:00 SP
    expect(saudacaoSamiQ(new Date("2026-09-11T02:00:00Z"))).toBe("Boa noite"); // 23:00 SP
  });
});

describe("montarBriefingSamiQ", () => {
  it("dia vazio: nenhuma linha e resumo 'tudo em dia'", () => {
    const b = montarBriefingSamiQ(dados());
    expect(b.vazio).toBe(true);
    expect(b.linhas).toEqual([]);
    expect(resumirBriefingSamiQ(b)).toBe("Tudo em dia por aqui.");
  });

  it("visitas de hoje com nome e hora; visita de amanhã sem confirmar vira cobrança", () => {
    const b = montarBriefingSamiQ(
      dados({
        agenda: [
          {
            id: "a",
            tipo: "visita",
            status: "confirmado",
            titulo: "Visita",
            inicio: "2026-09-10T13:00:00Z", // 10h SP hoje
            leadId: LEAD,
            leadNome: "Ana Costa",
          },
          {
            id: "b",
            tipo: "visita",
            status: "agendado",
            titulo: "Visita",
            inicio: "2026-09-11T17:00:00Z", // 14h SP amanhã
            leadId: LEAD,
            leadNome: "Bruno Lima",
          },
          {
            id: "c",
            tipo: "ligacao",
            status: "agendado",
            titulo: "Retorno",
            inicio: "2026-09-10T15:00:00Z",
            leadId: null,
            leadNome: null,
          },
        ],
      }),
    );
    expect(b.linhas.map((l) => l.chave)).toEqual([
      "visitas_hoje",
      "visitas_amanha",
      "sem_confirmar",
    ]);
    expect(b.linhas[0].texto).toBe("1 visita hoje: Ana 10h00");
    expect(b.linhas[0].to).toBe("/agendamentos");
    // Onda S5: a véspera já traz o preparador de visita como pergunta pronta.
    expect(b.linhas[1].texto).toBe("1 visita amanhã: Bruno 14h00");
    expect(b.linhas[1].pergunta).toBe("Me prepara para a visita de amanhã com Bruno.");
    expect(b.linhas[2].texto).toBe("1 visita sem confirmar: Bruno amanhã 14h00");
    expect(b.linhas[2].tom).toBe("warning");
    expect(b.linhas[2].pergunta).toMatch(/confirmei/);
  });

  it("follow-ups vencidos usam o total (não só os listados) e as filas viram linhas na ordem", () => {
    const b = montarBriefingSamiQ(
      dados({
        tarefasVencidas: [
          {
            id: "t1",
            titulo: "Follow-up",
            venceEm: "2026-09-08",
            leadId: LEAD,
            leadNome: "Carla Dias",
          },
          {
            id: "t2",
            titulo: "Follow-up",
            venceEm: "2026-09-09",
            leadId: LEAD,
            leadNome: "Diego Souza",
          },
        ],
        totalTarefasVencidas: 7,
        contagens: { responder: 4, novos: 1, esfriando: 5, docs: 2, followups: 9 },
      }),
    );
    expect(b.linhas.map((l) => l.chave)).toEqual([
      "followups_vencidos",
      "responder",
      "novos",
      "esfriando",
      "docs",
    ]);
    expect(b.linhas[0].texto).toBe("7 follow-ups vencidos: Carla, Diego");
    expect(b.linhas[1].texto).toBe("4 conversas aguardando resposta");
    expect(b.linhas[2].texto).toBe("1 cliente novo sem primeiro contato");
    expect(b.linhas[3].texto).toBe("5 clientes esfriando");
    expect(b.linhas[4].texto).toBe("2 pastas travadas por documento");
    expect(resumirBriefingSamiQ(b)).toContain(" · ");
    for (const l of b.linhas) expect(l.pergunta?.length ?? 0).toBeGreaterThan(10);
  });

  it("lista no máximo 3 nomes e conta o resto", () => {
    const b = montarBriefingSamiQ(
      dados({
        tarefasVencidas: ["Ana", "Bia", "Caio", "Dora", "Eli"].map((n, i) => ({
          id: String(i),
          titulo: "x",
          venceEm: null,
          leadId: LEAD,
          leadNome: n,
        })),
        totalTarefasVencidas: 5,
      }),
    );
    expect(b.linhas[0].texto).toBe("5 follow-ups vencidos: Ana, Bia, Caio e mais 2");
  });
});

describe("abrir a Sami com contexto (open-samiq)", () => {
  it("lê o detalhe com tolerância: evento legado sem detalhe, campos inválidos ignorados", () => {
    expect(lerDetalheAbrirSamiQ(new Event(SAMIQ_ABRIR_EVENTO))).toEqual({});
    const ev = new CustomEvent(SAMIQ_ABRIR_EVENTO, {
      detail: {
        leadId: LEAD,
        leadNome: "  Maria da Silva ",
        texto: "Liguei para Maria agora: ",
        autoEnviar: "sim",
        origem: "atender",
        extra: 1,
      },
    });
    expect(lerDetalheAbrirSamiQ(ev)).toEqual({
      leadId: LEAD,
      leadNome: "Maria da Silva",
      texto: "Liguei para Maria agora: ",
      origem: "atender",
    });
    expect(
      lerDetalheAbrirSamiQ(new CustomEvent(SAMIQ_ABRIR_EVENTO, { detail: { leadId: "nao-uuid" } })),
    ).toEqual({});
  });

  it("texto do chip usa o primeiro nome e o canal", () => {
    expect(textoRegistrarComSami("Maria da Silva")).toBe("Falei com Maria: ");
    expect(textoRegistrarComSami("Maria da Silva", "ligacao")).toBe("Liguei para Maria agora: ");
    expect(textoRegistrarComSami(null)).toBe("Falei com o cliente: ");
  });
});
