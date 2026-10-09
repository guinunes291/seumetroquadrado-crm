// Modo Visita na identidade Lançamento (2026-10): a visita em navy com o
// briefing de 30 segundos, o potencial de crédito em destaque e o checklist,
// como no vídeo de lançamento. As datas são do calendário de São Paulo (o dia
// do corretor) e o potencial segue estimativa conservadora, sem centavos e
// sem prometer aprovação.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PotencialDeCreditoCard, type LeadBriefing } from "@/features/visitas/briefing-visita";
import { briefingCurto, estadoDaVisita, quandoDaVisita } from "@/features/visitas/visita-derive";

// 9/10/2026 (sexta), 12h em São Paulo.
const AGORA = new Date("2026-10-09T15:00:00Z");

const lead = (p: Partial<LeadBriefing>): LeadBriefing => ({
  id: "l1",
  nome: "Cliente",
  status: "agendado",
  projeto_nome: null,
  renda_informada: null,
  proxima_acao: null,
  proximo_followup: null,
  temperatura: null,
  tipo_renda: null,
  faixa_mcmv: null,
  objecoes: null,
  entrada_disponivel: null,
  fgts_valor: null,
  usa_fgts: null,
  observacoes: null,
  ultima_interacao: null,
  created_at: null,
  ...p,
});

afterEach(() => cleanup());

describe("quandoDaVisita", () => {
  it("hoje, amanhã e ontem pelo dia de São Paulo", () => {
    expect(quandoDaVisita("2026-10-09T17:00:00Z", AGORA)).toBe("HOJE 14:00");
    expect(quandoDaVisita("2026-10-10T13:00:00Z", AGORA)).toBe("AMANHÃ 10:00");
    expect(quandoDaVisita("2026-10-08T21:30:00Z", AGORA)).toBe("ONTEM 18:30");
  });

  it("22h30 de hoje em São Paulo continua hoje, mesmo já sendo amanhã em UTC", () => {
    expect(quandoDaVisita("2026-10-10T01:30:00Z", AGORA)).toBe("HOJE 22:30");
  });

  it("mais longe, o dia da semana e a data", () => {
    expect(quandoDaVisita("2026-10-13T21:00:00Z", AGORA)).toBe("TER 13/10 · 18:00");
  });
});

describe("estadoDaVisita", () => {
  it("concluída, a validar (horário passou) ou em campo", () => {
    expect(estadoDaVisita({ data_fim: "2026-10-09T14:00:00Z" }, true, AGORA)).toBe(
      "VISITA CONCLUÍDA",
    );
    expect(estadoDaVisita({ data_fim: "2026-10-09T14:00:00Z" }, false, AGORA)).toBe(
      "VISITA A VALIDAR",
    );
    expect(estadoDaVisita({ data_fim: "2026-10-09T18:00:00Z" }, false, AGORA)).toBe(
      "VISITA EM CAMPO",
    );
  });
});

describe("briefingCurto", () => {
  it("como o cliente está e o que ficou combinado, em duas frases", () => {
    expect(
      briefingCurto(
        {
          temperatura: "morno",
          ultima_interacao: "2026-10-07T15:00:00Z",
          proxima_acao: "Apresentar a planta de 2 dorms e simular com FGTS",
        },
        AGORA,
      ),
    ).toBe(
      "Morno, último contato há 2 dias. Combinado: apresentar a planta de 2 dorms e simular com FGTS.",
    );
  });

  it("não inventa: sem contato e sem combinado, diz isso", () => {
    expect(
      briefingCurto({ temperatura: null, ultima_interacao: null, proxima_acao: null }, AGORA),
    ).toBe("Sem contato registrado. Nada combinado no último contato.");
  });

  it("não dobra a pontuação do que o corretor escreveu", () => {
    expect(
      briefingCurto(
        { temperatura: "quente", ultima_interacao: null, proxima_acao: "Levar a tabela." },
        AGORA,
      ),
    ).toBe("Quente, sem contato registrado. Combinado: levar a tabela.");
  });
});

describe("PotencialDeCreditoCard", () => {
  it("faixa, compra até, parcela e financiamento — sem centavos e sem prometer aprovação", () => {
    render(<PotencialDeCreditoCard lead={lead({ renda_informada: "3.530,00" })} />);
    expect(screen.getByText(/^Faixa \d$/)).toBeTruthy();
    expect(screen.getByText("Compra até")).toBeTruthy();
    for (const rotulo of ["Parcela", "Financia"]) {
      const valor = screen.getByText(rotulo).nextElementSibling?.textContent ?? "";
      expect(valor).toMatch(/^R\$\s[\d.]+$/);
    }
    expect(screen.getByText(/quem aprova é a Caixa/)).toBeTruthy();
  });

  it("sem renda, nenhum número: pede a renda", () => {
    render(<PotencialDeCreditoCard lead={lead({})} />);
    expect(
      screen.getByText("Informe a renda do cliente para estimar o poder de compra."),
    ).toBeTruthy();
    expect(screen.queryByText("Compra até")).toBeNull();
  });
});

describe("tela do Modo Visita", () => {
  const page = readFileSync(
    resolve(process.cwd(), "src/features/visitas/modo-visita-page.tsx"),
    "utf8",
  );

  it("'Marcar como realizada' não conclui sozinho: leva às perguntas da conclusão", () => {
    expect(page).toContain("Marcar como realizada");
    expect(page).toContain('id="resultado-visita"');
    expect(page).toContain('getElementById("interesse-visita")');
  });

  it("'Ditar nota da conversa' nunca começa o ditado sem o consentimento", () => {
    expect(page).toContain("Ditar nota da conversa");
    const ditar = page.slice(
      page.indexOf("const ditarNota"),
      page.indexOf("return (", page.indexOf("const ditarNota")),
    );
    expect(ditar.indexOf("!speechConsent")).toBeGreaterThan(-1);
    expect(ditar.indexOf("!speechConsent")).toBeLessThan(ditar.indexOf("startDictation()"));
  });
});
