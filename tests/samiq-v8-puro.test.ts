// Sami v8 ("CRM no WhatsApp") — os módulos puros novos: datas de São Paulo,
// ferramentas por intenção, memória de trabalho da conversa, marcadores de
// PII restauráveis e o nível de risco de cada ação.
import { describe, expect, it } from "vitest";
import {
  agoraParaModelo,
  calendarioParaModelo,
  diaSP,
  fmtDataHoraSP,
  isoComFusoSP,
  isoComFusoSPOpcional,
  jaPassou,
  mesesPrevisaoSP,
} from "@/lib/samiq-datas";
import {
  FERRAMENTAS_BASE,
  FERRAMENTAS_POR_GRUPO,
  ferramentasAtivas,
  gruposPelaMensagem,
} from "@/lib/samiq-grupos";
import {
  SAMIQ_MAX_CLIENTES_CITADOS,
  escolherPorNumero,
  lerContexto,
  localizacaoValida,
  mesclarClientes,
  textoClientesCitados,
} from "@/lib/samiq-contexto";
import {
  redigirTextoDoCorretor,
  restaurarPiiDoCorretor,
  temMarcadorPii,
} from "@/lib/samiq-governance";
import {
  SAMIQ_NIVEL_ACAO,
  SAMIQ_PROPOSTA_TIPOS,
  datasQueDevemSerFuturas,
  leadIdDaProposta,
  nivelDaAcao,
  normalizarDatasDoPayload,
} from "@/lib/samiq-propostas";
import { GRUPOS_FERRAMENTAS, SAMIQ_TOOL_NAMES } from "@/lib/samiq-tools";

const SABADO_10H = new Date("2026-10-24T13:00:00.000Z"); // sáb 24/10/2026 10:00 em SP

describe("datas no fuso de São Paulo", () => {
  it("o modelo lê o dia da semana, a data e a hora de SP", () => {
    expect(agoraParaModelo(SABADO_10H)).toBe("sábado, 24/10/2026, 10:00");
    expect(diaSP(new Date("2026-10-25T02:30:00.000Z"))).toBe("2026-10-24"); // 23:30 de sábado em SP
    const cal = calendarioParaModelo(SABADO_10H, 3);
    expect(cal).toBe(
      "hoje sáb 24/10 (2026-10-24) · amanhã dom 25/10 (2026-10-25) · seg 26/10 (2026-10-26)",
    );
  });

  it("data sem fuso vira horário de SP; com fuso fica como veio", () => {
    expect(isoComFusoSP("2026-10-25T10:00")).toBe("2026-10-25T10:00:00-03:00");
    expect(isoComFusoSP("2026-10-25 10:00:00")).toBe("2026-10-25T10:00:00-03:00");
    expect(isoComFusoSP("2026-10-25")).toBe("2026-10-25T09:00:00-03:00");
    expect(isoComFusoSP("2026-10-25", "14:00")).toBe("2026-10-25T14:00:00-03:00");
    expect(isoComFusoSP("2026-10-25T13:00:00Z")).toBe("2026-10-25T13:00:00Z");
    expect(isoComFusoSP("2026-10-25T10:00:00-03:00")).toBe("2026-10-25T10:00:00-03:00");
    expect(isoComFusoSPOpcional(null)).toBeNull();
    expect(isoComFusoSPOpcional("")).toBe("");
  });

  it("formatos curtos e janelas", () => {
    expect(fmtDataHoraSP("2026-10-25T13:00:00.000Z")).toBe("dom 25/10 10:00");
    expect(fmtDataHoraSP("lixo")).toBeNull();
    expect(jaPassou("2026-10-24T12:58:00.000Z", SABADO_10H)).toBe(false); // 2 min: tolerância
    expect(jaPassou("2026-10-24T12:00:00.000Z", SABADO_10H)).toBe(true);
    const meses = mesesPrevisaoSP(SABADO_10H);
    expect(meses[0]).toBe("2026-11");
    expect(meses).toHaveLength(12);
    expect(meses[11]).toBe("2027-10");
  });

  it("o payload tem as datas normalizadas e as que precisam ser futuras", () => {
    const p = normalizarDatasDoPayload(
      { tipo: "agendar_visita", leadId: "x", inicioEm: "2026-10-25T10:00" },
      (v) => isoComFusoSP(v),
    );
    expect(p.inicioEm).toBe("2026-10-25T10:00:00-03:00");
    expect(
      datasQueDevemSerFuturas({
        tipo: "agendar_visita",
        leadId: "123e4567-e89b-12d3-a456-426614174000",
        inicioEm: "2026-10-25T10:00:00-03:00",
      }),
    ).toEqual([{ campo: "inicioEm", iso: "2026-10-25T10:00:00-03:00" }]);
  });
});

describe("ferramentas por intenção (economia de tokens)", () => {
  it("todo nome de grupo e de base existe no catálogo ou nas ações", () => {
    const conhecidas = new Set<string>([...SAMIQ_TOOL_NAMES, ...SAMIQ_PROPOSTA_TIPOS]);
    for (const n of FERRAMENTAS_BASE) expect(conhecidas.has(n), n).toBe(true);
    for (const g of GRUPOS_FERRAMENTAS) {
      for (const n of FERRAMENTAS_POR_GRUPO[g]) expect(conhecidas.has(n), `${g}: ${n}`).toBe(true);
    }
  });

  it("toda ação e toda leitura aparece em pelo menos um grupo ou na base", () => {
    const cobertas = new Set<string>([
      ...FERRAMENTAS_BASE,
      ...Object.values(FERRAMENTAS_POR_GRUPO).flat(),
    ]);
    for (const n of [...SAMIQ_TOOL_NAMES, ...SAMIQ_PROPOSTA_TIPOS])
      expect(cobertas.has(n), n).toBe(true);
  });

  it("a mensagem escolhe os grupos (sem acento, com várias pistas)", () => {
    expect(gruposPelaMensagem({ texto: "Remarca a visita da Ana para terça 15h" })).toContain(
      "agenda",
    );
    expect(gruposPelaMensagem({ texto: "a Maria desistiu, não quer mais" })).toContain("funil");
    const doc = gruposPelaMensagem({ texto: "chegou o holerite e o RG do João" });
    expect(doc).toContain("documentos");
    expect(gruposPelaMensagem({ texto: "aprovou na Caixa! parcela 1.200" })).toContain("credito");
    expect(gruposPelaMensagem({ texto: "vendi! assinou contrato hoje" })).toContain("venda");
    expect(gruposPelaMensagem({ texto: "cheguei na Barra Funda, faz meu check-in" })).toContain(
      "presenca",
    );
    expect(gruposPelaMensagem({ texto: "cadastra uma indicação: Paula" })).toContain("prospeccao");
    expect(gruposPelaMensagem({ texto: "renda dela é 3500 CLT e tem FGTS" })).toContain(
      "qualificacao",
    );
  });

  it("sem pista nenhuma: os grupos do dia a dia; arquivo e localização abrem os seus", () => {
    expect(gruposPelaMensagem({ texto: "oi" })).toEqual([
      "carteira",
      "agenda",
      "tarefas",
      "qualificacao",
    ]);
    expect(gruposPelaMensagem({ texto: "[arquivo]", temAnexo: true })).toEqual(["documentos"]);
    expect(gruposPelaMensagem({ texto: "[localização]", temLocalizacao: true })).toEqual([
      "presenca",
    ]);
    // "sim, pode" continua no assunto da última pergunta da Sami
    expect(
      gruposPelaMensagem({ texto: "sim, pode", contextoRecente: "Quer que eu remarque a visita?" }),
    ).toContain("agenda");
  });

  it("ativas = base + grupos, só o que foi montado", () => {
    const disponiveis = new Set([
      "buscar_clientes",
      "detalhe_cliente",
      "abrir_ferramentas",
      "registrar_contato",
      "minha_agenda",
    ]);
    expect(ferramentasAtivas(["agenda"], disponiveis).sort()).toEqual(
      [
        "abrir_ferramentas",
        "buscar_clientes",
        "detalhe_cliente",
        "minha_agenda",
        "registrar_contato",
      ].sort(),
    );
  });
});

describe("memória de trabalho da conversa", () => {
  it("lê o jsonb com tolerância (lixo vira vazio, nada quebra)", () => {
    expect(lerContexto(null)).toEqual({});
    expect(lerContexto("x")).toEqual({});
    const c = lerContexto({
      clientes: [{ id: "a", nome: "Ana", em: "2026-10-24T13:00:00Z" }, { nome: "sem id" }],
      pendentes: ["p1", 2, "p2"],
      pediu_decisao: true,
      localizacao: { latitude: -23.5, longitude: -46.6, em: "2026-10-24T13:00:00Z" },
      ambiguos: ["a", "b"],
      ultima_mensagem_id: "wamid.1",
    });
    expect(c.clientes).toHaveLength(1);
    expect(c.pendentes).toEqual(["p1", "p2"]);
    expect(c.pediu_decisao).toBe(true);
    expect(c.ambiguos).toEqual(["a", "b"]);
    expect(c.ultima_mensagem_id).toBe("wamid.1");
  });

  it("clientes citados: o mais recente na frente, sem repetir, no máximo 8", () => {
    const antes = [
      { id: "a", nome: "Ana", em: "t0" },
      { id: "b", nome: "Bia", em: "t0" },
    ];
    const m = mesclarClientes(antes, [{ id: "b", nome: "Bia", etapa: "agendado" }], SABADO_10H);
    expect(m.map((c) => c.id)).toEqual(["b", "a"]);
    expect(m[0].etapa).toBe("agendado");
    const muitos = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, nome: `C${i}` }));
    expect(mesclarClientes([], muitos)).toHaveLength(SAMIQ_MAX_CLIENTES_CITADOS);
    expect(textoClientesCitados(m, (s) => (s === "agendado" ? "Agendado" : s))).toBe(
      "Bia (id b, Agendado) · Ana (id a)",
    );
  });

  it("CONFIRMAR 1 e 3 escolhe pela numeração que o corretor viu", () => {
    expect(escolherPorNumero(["x", "y", "z"], [])).toEqual(["x", "y", "z"]);
    expect(escolherPorNumero(["x", "y", "z"], [3, 1])).toEqual(["z", "x"]);
    expect(escolherPorNumero(["x", "y"], [3])).toBeNull();
  });

  it("localização vale 15 minutos para o check-in", () => {
    const loc = { latitude: -23.5, longitude: -46.6, em: "2026-10-24T12:50:00.000Z" };
    expect(localizacaoValida({ localizacao: loc }, SABADO_10H)).toEqual(loc);
    expect(
      localizacaoValida({ localizacao: { ...loc, em: "2026-10-24T12:30:00.000Z" } }, SABADO_10H),
    ).toBeNull();
    expect(localizacaoValida({}, SABADO_10H)).toBeNull();
  });
});

describe("marcadores de PII do corretor (o modelo nunca vê o contato do cliente)", () => {
  it("telefone, e-mail e CPF viram marcadores numerados; nomes passam", () => {
    const { texto, mapa } = redigirTextoDoCorretor(
      "Cadastra a Maria Souza, (11) 99999-8888, maria@exemplo.com, CPF 123.456.789-00. O João Lima também: 11 98888-7777",
    );
    expect(texto).toContain("Maria Souza");
    expect(texto).toContain("João Lima");
    expect(texto).toContain("[TELEFONE_1]");
    expect(texto).toContain("[TELEFONE_2]");
    expect(texto).toContain("[EMAIL_1]");
    expect(texto).toContain("[CPF_1]");
    expect(texto).not.toMatch(/99999|maria@|123\.456/);
    expect(restaurarPiiDoCorretor("[TELEFONE_2]", mapa)).toBe("11 98888-7777");
    expect(restaurarPiiDoCorretor("[EMAIL_1]", mapa)).toBe("maria@exemplo.com");
    expect(restaurarPiiDoCorretor("[TELEFONE_9]", mapa)).toBe("[TELEFONE_9]");
  });

  it("o mesmo número repetido usa o mesmo marcador; RG, CEP e endereço não voltam", () => {
    const { texto, mapa } = redigirTextoDoCorretor(
      "liga no 11 99999-8888 (é o 11 99999-8888 mesmo). RG 12.345.678-9, CEP 01234-567, Rua das Flores 10",
    );
    expect(texto.match(/\[TELEFONE_1\]/g)).toHaveLength(2);
    expect(Object.keys(mapa)).toEqual(["[TELEFONE_1]"]);
    expect(texto).toContain("[RG]");
    expect(texto).toContain("[CEP]");
    expect(texto).toContain("[ENDERECO]");
    expect(temMarcadorPii(texto)).toBe(true);
    expect(temMarcadorPii("Maria quer 2 dorms")).toBe(false);
  });
});

describe("nível de risco de cada ação", () => {
  it("todo tipo tem nível; no painel tudo pede confirmação", () => {
    for (const tipo of SAMIQ_PROPOSTA_TIPOS) {
      expect(["direto", "confirmar"]).toContain(SAMIQ_NIVEL_ACAO[tipo]);
      expect(nivelDaAcao(tipo, "confirmar_tudo")).toBe("confirmar");
    }
    expect(nivelDaAcao("registrar_contato", "por_risco")).toBe("direto");
    expect(nivelDaAcao("anexar_documento", "por_risco")).toBe("direto");
    expect(nivelDaAcao("marcar_perdido", "por_risco")).toBe("confirmar");
  });

  it("troca de vaga resolve pelo cliente que ENTRA", () => {
    expect(
      leadIdDaProposta({
        tipo: "trocar_vaga",
        entraLeadId: "123e4567-e89b-12d3-a456-426614174000",
        saiLeadId: "223e4567-e89b-12d3-a456-426614174000",
        desfecho: "perdido",
        categoria: "sem_interesse",
      }),
    ).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(leadIdDaProposta({ tipo: "pedir_lote", zona: "Leste" })).toBeNull();
  });
});
