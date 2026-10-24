// Caracterização de src/lib/samiq-propostas.ts (continuação): os auxiliares
// de texto — telefone do cadastro, telefone mascarado, título do pacote,
// marca "via Sami", mensagens de etapa, conteúdo do contato, fim e título da
// visita e a normalização de datas. Capturado do código original.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as P from "@/lib/samiq-propostas";
import { EXEMPLOS } from "./helpers/samiq-exemplos";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T12:00:00-03:00"));
});
afterAll(() => vi.useRealTimers());

describe("samiq-propostas — caracterização dos auxiliares", () => {
  it("auxiliares: telefone, pacote, origem Sami, etapa, contato e visita", () => {
    const e = EXEMPLOS;
    expect({
      telefones: [
        "11987654321",
        "5511987654321",
        "011987654321",
        "1130654321",
        "11887654321",
        "+1 555 1234",
        "1109876543",
      ].map(P.normalizarTelefoneCadastro),
      mascarado: [
        P.telefoneMascarado("(11) 98765-4321"),
        P.telefoneMascarado("123"),
        P.telefoneMascarado(null),
      ],
      pacote: [
        P.tituloDoPacote([{ leadNome: "Maria" }]),
        P.tituloDoPacote([{ leadNome: "Maria" }, { leadNome: "Maria" }]),
        P.tituloDoPacote([{ leadNome: "Maria" }, { leadNome: "João" }, { leadNome: null }]),
      ],
      metadata: P.metadataViaSami({ executionId: "ex-1", propostaId: "pr-1" }),
      viaSami: [
        P.foiViaSami({ origem: "samiq" }),
        P.foiViaSami({ via: "samiq" }),
        P.foiViaSami({}),
        P.foiViaSami(null),
      ],
      etapa: [
        P.mensagemEtapaNaoAplicada("em_atendimento", "aguardando_atendimento", null),
        P.mensagemEtapaNaoAplicada("agendado", "em_atendimento", "c1"),
        P.etapaBloqueadaSemDono("em_atendimento", null),
        P.etapaBloqueadaSemDono("em_atendimento", "c1"),
      ],
      contato: [
        P.conteudoContato(P.RegistrarContatoPayload.parse(e.registrar_contato)),
        P.conteudoContato(
          P.RegistrarContatoPayload.parse({ ...e.registrar_contato, resumo: "  " }),
        ),
      ],
      visita: [
        P.fimDaVisita(P.AgendarVisitaPayload.parse(e.agendar_visita)),
        P.fimDaVisita(P.AgendarVisitaPayload.parse({ ...e.agendar_visita, duracaoMin: undefined })),
        P.tituloVisita(P.AgendarVisitaPayload.parse(e.agendar_visita), "Maria"),
        P.tituloVisita(P.AgendarVisitaPayload.parse({ ...e.agendar_visita, local: " " }), null),
        P.tituloVisita(
          P.AgendarVisitaPayload.parse({ ...e.agendar_visita, titulo: " Plantão " }),
          "Maria",
        ),
      ],
      datas: P.normalizarDatasDoPayload(
        {
          followupEm: "2026-10-27T14:00",
          retornoEm: " ",
          nome: "x",
          realizadaEm: "2026-10-20T10:00",
        },
        (iso) => `${iso}-03:00`,
      ),
      ferramentas: Object.keys(P.SAMIQ_FERRAMENTAS_PROPOSTA).length,
    }).toMatchInlineSnapshot(`
      {
        "contato": [
          "Gostou do Vibra, quer simular",
          "Interessado",
        ],
        "datas": {
          "followupEm": "2026-10-27T14:00-03:00",
          "nome": "x",
          "realizadaEm": "2026-10-20T10:00-03:00",
          "retornoEm": " ",
        },
        "etapa": [
          "O funil não mudou a etapa: o cliente continua em Aguardando atendimento (pedido: Em atendimento). Ele está sem corretor responsável; atribua um corretor antes de colocá-lo em atendimento.",
          "O funil não mudou a etapa: o cliente continua em Em atendimento (pedido: Agendado).",
          "cliente sem corretor responsável: Em atendimento exige um corretor dono (atribuir o lead primeiro); registre o contato e a tarefa sem mudar a etapa",
          null,
        ],
        "ferramentas": 25,
        "mascarado": [
          "final 4321",
          "telefone informado",
          "telefone informado",
        ],
        "metadata": {
          "execution_id": "ex-1",
          "origem": "samiq",
          "proposta_id": "pr-1",
        },
        "pacote": [
          "Registrar 1 item para Maria?",
          "Registrar 2 itens para Maria?",
          "Registrar 3 itens?",
        ],
        "telefones": [
          "11987654321",
          "11987654321",
          "11987654321",
          "1130654321",
          null,
          null,
          "1109876543",
        ],
        "viaSami": [
          true,
          true,
          false,
          false,
        ],
        "visita": [
          "2026-10-28T19:30:00.000Z",
          "2026-10-28T19:00:00.000Z",
          "Visita - Estande Vibra Lapa",
          "Visita - cliente",
          "Plantão",
        ],
      }
    `);
  });
});
