// Desfecho de um toque — a matriz pura: 3 a 5 respostas por situação, cada
// uma com o próximo passo e, só quando o funil aceita, a etapa.
import { describe, expect, it } from "vitest";
import {
  descreverProximo,
  descreverQuando,
  desfechoPara,
  rotuloDaEtapa,
  tituloDaInteracao,
  vencimentoDe,
} from "@/features/fila-unica/desfecho";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";

function item(partial: Partial<FilaUnicaItem> & { status?: string } = {}): FilaUnicaItem {
  const { status, ...rest } = partial;
  return {
    lead: {
      id: "11111111-1111-4111-8111-111111111111",
      nome: "Josivana Batista",
      telefone: "11999990000",
      email: null,
      status: status ?? "analise_credito",
      temperatura: "quente",
      ultima_interacao: null,
      proximo_followup: null,
      projeto_nome: "Liber Jaçanã",
      created_at: "2026-06-01T12:00:00Z",
      corretor_id: "c1",
      origem: "facebook",
      renda_informada: null,
      entrada_disponivel: null,
      usa_fgts: null,
    },
    bucket: "fundo",
    fonte: "inbox",
    filaInbox: "esfriando",
    motivo: "parado",
    score: 80,
    tier: "alta",
    diasParado: 79,
    proximoPasso: null,
    prazo: null,
    vencidoMin: 0,
    venceHoje: false,
    docsPendentes: 0,
    agendamentoId: null,
    visitaEm: null,
    valorEmJogo: null,
    ...rest,
  };
}

const ids = (d: ReturnType<typeof desfechoPara>) => d.opcoes.map((o) => o.id);

describe("desfechoPara — a matriz do mockup", () => {
  it("análise de crédito: aprovado, aguardando Caixa, reprovado, não atendeu, perdeu", () => {
    const d = desfechoPara(item({ status: "analise_credito" }));
    expect(d.pergunta).toBe("O que aconteceu com Josivana?");
    expect(ids(d)).toEqual([
      "credito_aprovado",
      "aguardando_caixa",
      "credito_reprovado",
      "nao_atendeu",
      "perdeu",
    ]);
    expect(d.opcoes[0].proximo?.titulo).toBe("Agendar assinatura");
    expect(d.opcoes[4].etapa).toEqual({ kind: "perdido" });
    expect(d.opcoes[4].largo).toBe(true);
  });

  it("agendado: 'foi à visita' abre o modal de visita realizada; a pergunta é sobre a visita", () => {
    const d = desfechoPara(item({ status: "agendado" }));
    expect(d.pergunta).toBe("A visita de Josivana aconteceu?");
    expect(d.opcoes[0].etapa).toEqual({
      kind: "modal",
      modal: "visita_realizada",
      status: "visita_realizada",
    });
    expect(ids(d)).toEqual(["visita_feita", "no_show", "remarcou", "perdeu"]);
  });

  it("chegou agora: 'qualificar' move para em atendimento (direto) — de novo e de aguardando", () => {
    for (const status of ["novo", "aguardando_atendimento"]) {
      const d = desfechoPara(item({ status, bucket: "sla" }));
      expect(d.pergunta).toBe("Primeiro contato com Josivana");
      expect(d.opcoes[0].etapa).toEqual({ kind: "direct", status: "em_atendimento" });
      expect(ids(d)).toEqual(["qualificar", "nao_atendeu", "whatsapp_enviado", "perdeu"]);
    }
    const zap = desfechoPara(item({ status: "novo", bucket: "sla" })).opcoes[2];
    expect(tituloDaInteracao(zap)).toBe("WhatsApp — enviado, aguardando resposta");
  });

  it("cliente respondeu: 'agendei visita' só aparece quando o funil aceita agendado", () => {
    const de = desfechoPara(item({ status: "em_atendimento", bucket: "responder" }));
    expect(ids(de)).toEqual(["enviei_simulacao", "agendei_visita", "objecao"]);
    expect(de.opcoes[1].etapa).toEqual({ kind: "modal", modal: "agendado", status: "agendado" });
    // aguardando_atendimento → agendado é bloqueado: a resposta some, não engana.
    const bloqueado = desfechoPara(item({ status: "aguardando_atendimento", bucket: "responder" }));
    expect(ids(bloqueado)).toEqual(["enviei_simulacao", "objecao"]);
  });

  it("follow-up genérico: avançar usa a ação sugerida da etapa; 'pediu retorno' muda a etapa", () => {
    const d = desfechoPara(item({ status: "em_atendimento", bucket: "followup" }));
    expect(ids(d)).toEqual(["avancar", "pediu_retorno", "objecao", "nao_atendeu", "perdeu"]);
    expect(d.opcoes[0].proximo?.titulo).toBe("Agendar visita");
    expect(d.opcoes[1].etapa).toEqual({ kind: "direct", status: "aguardando_retorno" });
    expect(d.opcoes[2].pedeTexto).toBe("objecao");
  });

  it("pasta travada: quatro respostas, sem mudança de etapa fora da perda", () => {
    const d = desfechoPara(item({ status: "analise_credito", bucket: "docs" }));
    // análise de crédito tem matriz própria mesmo vindo da pasta.
    expect(ids(d)[0]).toBe("credito_aprovado");
    const docs = desfechoPara(item({ status: "em_atendimento", bucket: "docs" }));
    expect(ids(docs)).toEqual(["cliente_envia", "recebi", "nao_atendeu", "perdeu"]);
    expect(docs.opcoes.filter((o) => o.etapa && o.etapa.kind !== "perdido")).toHaveLength(0);
  });

  it("toda resposta que grava tem título no vocabulário da timeline", () => {
    const d = desfechoPara(item({ status: "visita_realizada" }));
    expect(tituloDaInteracao(d.opcoes[0])).toBe("Contato — interessado");
    expect(tituloDaInteracao(d.opcoes[2])).toBe("Contato — não atendeu");
    expect(rotuloDaEtapa(d.opcoes[3])).toBe("etapa → Perdido");
    expect(rotuloDaEtapa(d.opcoes[0])).toBeNull();
  });
});

describe("o próximo passo com data", () => {
  const agora = new Date("2026-09-12T10:00:00-03:00");

  it("horas a partir de agora ficam no mesmo dia; 'em dias' cai no dia certo às 9h", () => {
    expect(vencimentoDe({ emHoras: 3 }, agora).toISOString()).toBe(
      new Date("2026-09-12T13:00:00-03:00").toISOString(),
    );
    const amanha = vencimentoDe({ emDias: 1, as: 9 }, agora);
    expect(amanha.getDate()).toBe(13);
    expect(amanha.getHours()).toBe(9);
    expect(amanha.getMinutes()).toBe(0);
    expect(vencimentoDe({ emDias: 3, as: 9 }, agora).getDate()).toBe(15);
  });

  it("descreve como no mockup: hoje HH:mm, amanhã, ou dia da semana", () => {
    expect(descreverQuando({ emHoras: 3 }, agora)).toMatch(/^hoje \d{2}:\d{2}$/);
    expect(descreverQuando({ emDias: 1, as: 9 }, agora)).toBe("amanhã");
    expect(descreverQuando({ emDias: 3, as: 9 }, agora)).toMatch(/^ter\.?,? 15 (de )?set/);
  });

  it("a linha do próximo passo junta título e prazo; modal e perda dizem o que abrem", () => {
    const d = desfechoPara(item({ status: "analise_credito" }));
    expect(descreverProximo(d.opcoes[1], agora)).toMatch(/^cobrar o correspondente · /);
    expect(descreverProximo(d.opcoes[4], agora)).toBe("perda com motivo");
    const ag = desfechoPara(item({ status: "agendado" }));
    expect(descreverProximo(ag.opcoes[0], agora)).toBe("abrir visita realizada");
  });
});
