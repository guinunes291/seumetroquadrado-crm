// Caracterização de src/lib/samiq-propostas.ts escrita ANTES da quebra do
// arquivo em módulos: um payload válido por tipo de ação, a descrição humana
// de cada um, o nível (direto/confirmar) por modo, o desfazer de 24 h, a
// janela de 2 h da "mesma tarefa", as datas que precisam ser futuras, o lead
// de cada ação, as mensagens dos refine e os auxiliares de texto. Os valores
// esperados foram capturados do código original e revisados à mão.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as P from "@/lib/samiq-propostas";
import { EXEMPLOS, IDS } from "./helpers/samiq-exemplos";

const exemplos = () =>
  P.SAMIQ_PROPOSTA_TIPOS.map((tipo) => P.PropostaPayloadSchema.parse(EXEMPLOS[tipo]));
// O formato de moeda usa espaço inseparável ("R$\u00a04.500"); vira espaço comum no snapshot.
const linha = (d: P.DescricaoProposta) =>
  `${d.titulo} — ${d.detalhes.join(" | ")}`.replace(/\u00a0/g, " ");
const msgs = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? "ok" : r.error!.issues.map((i) => i.message).join("; ");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T12:00:00-03:00"));
});
afterAll(() => vi.useRealTimers());

describe("samiq-propostas — caracterização", () => {
  it("um exemplo por tipo: todos válidos, e a descrição de cada um", () => {
    expect(P.SAMIQ_PROPOSTA_TIPOS.length).toBe(Object.keys(EXEMPLOS).length);
    expect(exemplos().map((e) => linha(P.descreverProposta(e, "Maria Souza"))))
      .toMatchInlineSnapshot(`
      [
        "Contato com Maria Souza — WhatsApp, interessado | Gostou do Vibra, quer simular | Objeções: parcela alta, distância | Follow-up ter 27/10 14:00",
        "Nota sobre Maria Souza — Prefere ser chamado à noite",
        "Tarefa de Maria Souza: Ligar para confirmar renda — Vence seg 26/10 10:00 | Prioridade alta",
        "Qualificação de Maria Souza — Renda: R$ 4.500 | Usa FGTS: sim | FGTS: R$ 12.000 | Renda CLT | Faixa F2 | Temperatura quente | 2 dorm. | Prioridades: seguranca | Objeções: entrada",
        "Visita de Maria Souza — qua 28/10 15:00 | Estande Vibra Lapa | Move para Agendado",
        "Mover Maria Souza para Qualificação Corretor — Próxima ação: Pedir documentos",
        "Maria Souza para Aguardando retorno — Pediu retorno | Retornar ter 03/11 09:00 | Vai falar com a esposa",
        "Perder Maria Souza — Outro (descrever) | Mudou de cidade | Sai da sua carteira (vai para outro corretor ou para a base)",
        "Troca de vaga: entra Maria Souza — sai para retorno ter 10/11 10:00",
        "Concluir tarefa — Cliente confirmou",
        "Reagendar tarefa — Para qui 29/10 11:00",
        "Cancelar tarefa — Duplicada",
        "Visita de Maria Souza confirmada — ",
        "Remarcar visita de Maria Souza — Para sex 30/10 16:00",
        "Cancelar visita de Maria Souza — Cliente viajou",
        "Resultado da visita de Maria Souza — Foi à visita | Interesse alto | Vai para Visita realizada",
        "Checklist de documentos de Maria Souza — Perfil clt | casado, usa FGTS",
        "CPF de Maria Souza — Status recebido | Foto legível",
        "Anexar RG ou CNH de Maria Souza — Arquivo recebido no WhatsApp",
        "Enviar Maria Souza para análise de crédito — Enviada ao banco | Caixa",
        "Crédito de Maria Souza — Aprovada com condição | Comprovar renda extra | financiamento R$ 200.000, parcela R$ 1.500",
        "Venda de Maria Souza — Vibra Lapa T2 ap 104 | R$ 289.000, assinatura 20/10/2026 | Vai para aprovação da gestão",
        "Check-in na filial Barra Funda — ",
        "Cadastrar cliente João Pereira — Telefone final 4321 | Origem: captação do corretor | Região: Lapa | Entra na sua carteira em Aguardando atendimento",
        "Pedir lote de 30 leads, zona Leste — ",
      ]
    `);
  });

  it("descrição sem nome do cliente e variações que mudam o texto", () => {
    const e = EXEMPLOS;
    const d = (p: unknown, nome: string | null = null) =>
      linha(P.descreverProposta(P.PropostaPayloadSchema.parse(p), nome));
    expect([
      d(e.registrar_contato),
      d({ ...e.registrar_contato, resumo: undefined, objecoes: undefined, followupEm: null }),
      d({ ...e.criar_tarefa, leadId: null, prioridade: undefined }),
      d({ ...e.agendar_visita, moverParaAgendado: false, local: undefined }),
      d({ ...e.registrar_visita, compareceu: false, interesse: undefined }),
      d({ ...e.registrar_resultado_credito, resultado: "reprovada" }),
      d({ ...e.fazer_checkin, modo: "casa", filial: undefined }),
      d({
        ...e.trocar_vaga,
        desfecho: "perdido",
        categoria: "credito_renda",
        retornoEm: undefined,
      }),
      d({ ...e.atualizar_qualificacao, tipoRenda: "Autônomo" }),
    ]).toMatchInlineSnapshot(`
      [
        "Contato com cliente — WhatsApp, interessado | Gostou do Vibra, quer simular | Objeções: parcela alta, distância | Follow-up ter 27/10 14:00",
        "Contato com cliente — WhatsApp, interessado | Sem follow-up",
        "Tarefa: Ligar para confirmar renda — Vence seg 26/10 10:00 | Prioridade média",
        "Visita de cliente — qua 28/10 15:00 | Mantém a etapa",
        "Resultado da visita de cliente — Não compareceu | Vai para Aguardando retorno",
        "Crédito de cliente — Reprovada | Comprovar renda extra | financiamento R$ 200.000, parcela R$ 1.500",
        "Check-in em casa — ",
        "Troca de vaga: entra cliente — sai como perdido (Crédito: renda (insuficiente/informal))",
        "Qualificação de cliente — Renda: R$ 4.500 | Usa FGTS: sim | FGTS: R$ 12.000 | Renda autônoma | Faixa F2 | Temperatura quente | 2 dorm. | Prioridades: seguranca | Objeções: entrada",
      ]
    `);
  });

  it("nível por modo, desfazível e só-com-confirmar, por tipo", () => {
    expect(
      P.SAMIQ_PROPOSTA_TIPOS.map(
        (t) =>
          `${t}: ${P.nivelDaAcao(t, "por_risco")}/${P.nivelDaAcao(t, "confirmar_tudo")}` +
          `${P.podeDesfazerProposta(t) ? " desfaz" : ""}${P.SAMIQ_TIPOS_SO_COM_CONFIRMAR.has(t) ? " só-confirmar" : ""}` +
          ` · ${P.SAMIQ_PROPOSTA_LABEL[t]}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "registrar_contato: direto/confirmar desfaz · Registrar contato",
        "anotar: direto/confirmar desfaz · Anotar",
        "criar_tarefa: direto/confirmar desfaz · Criar tarefa",
        "atualizar_qualificacao: direto/confirmar desfaz · Atualizar qualificação",
        "agendar_visita: confirmar/confirmar desfaz · Agendar visita",
        "mudar_etapa: confirmar/confirmar · Mudar etapa",
        "registrar_retorno: confirmar/confirmar · Retorno combinado",
        "marcar_perdido: confirmar/confirmar só-confirmar · Marcar como perdido",
        "trocar_vaga: confirmar/confirmar só-confirmar · Trocar vaga em atendimento",
        "concluir_tarefa: direto/confirmar desfaz · Concluir tarefa",
        "reagendar_tarefa: direto/confirmar desfaz · Reagendar tarefa",
        "cancelar_tarefa: direto/confirmar desfaz · Cancelar tarefa",
        "confirmar_visita: direto/confirmar desfaz · Confirmar visita",
        "remarcar_visita: direto/confirmar desfaz · Remarcar visita",
        "cancelar_visita: confirmar/confirmar desfaz · Cancelar visita",
        "registrar_visita: confirmar/confirmar · Resultado da visita",
        "documentos_checklist: direto/confirmar · Checklist de documentos",
        "atualizar_documento: direto/confirmar desfaz · Atualizar documento",
        "anexar_documento: direto/confirmar · Anexar documento",
        "enviar_analise_credito: confirmar/confirmar só-confirmar · Enviar para análise de crédito",
        "registrar_resultado_credito: confirmar/confirmar só-confirmar · Resultado do crédito",
        "registrar_venda: confirmar/confirmar só-confirmar · Registrar venda",
        "fazer_checkin: direto/confirmar · Check-in",
        "criar_lead: confirmar/confirmar desfaz · Cadastrar cliente",
        "pedir_lote: confirmar/confirmar · Pedir lote de prospecção",
      ]
    `);
  });

  it("desfazer: já desfeita, não desfazível, prazo (a borda conta como vencida)", () => {
    const agora = new Date("2026-10-24T12:00:00Z");
    const caso = (tipo: P.SamiQPropostaTipo, status: string, desfazerAte?: string | null) =>
      P.motivoSemDesfazer({ tipo, status, desfazerAte }, agora);
    expect([
      caso("anotar", "desfeita", "2026-10-25T00:00:00Z"),
      caso("anotar", "pendente", "2026-10-25T00:00:00Z"),
      caso("marcar_perdido", "aceita", "2026-10-25T00:00:00Z"),
      caso("anotar", "aceita", null),
      caso("anotar", "aceita", "2026-10-24T12:00:00Z"),
      caso("anotar", "editada", "2026-10-24T12:00:00.001Z"),
    ]).toEqual([
      "ja_desfeito",
      "nao_desfazivel",
      "nao_desfazivel",
      "fora_do_prazo",
      "fora_do_prazo",
      null,
    ]);
    expect(P.SAMIQ_DESFAZER_JANELA_HORAS).toBe(24);
    expect(P.MOTIVO_SEM_DESFAZER_LABEL).toMatchInlineSnapshot(`
      {
        "fora_do_prazo": "passou o prazo de 24 h",
        "ja_desfeito": "já foi desfeito",
        "nao_desfazivel": "esse registro não volta pelo DESFAZER; me diga o que corrigir",
      }
    `);
  });

  it("mesma tarefa: até 2 h (inclusive) e a mais próxima", () => {
    const alvo = "2026-10-24T15:00:00Z";
    const t = (id: string, data_vencimento: string | null) => ({ id, data_vencimento });
    const abertas = [
      t("longe", "2026-10-24T17:00:00.001Z"),
      t("borda", "2026-10-24T13:00:00Z"),
      t("perto", "2026-10-24T15:30:00Z"),
      t("sem", null),
    ];
    expect(P.SAMIQ_JANELA_MESMA_TAREFA_MS).toBe(7_200_000);
    expect(P.tarefaNoMesmoHorario(abertas, alvo)?.id).toBe("perto");
    expect(P.tarefaNoMesmoHorario(abertas.slice(0, 2), alvo)?.id).toBe("borda");
    expect(P.tarefaNoMesmoHorario([abertas[0]], alvo)).toBeNull();
    expect(P.tarefaNoMesmoHorario(abertas, "não é data")).toBeNull();
  });

  it("datas que devem ser futuras e o cliente de cada ação", () => {
    expect(
      exemplos().map(
        (e) =>
          `${e.tipo}: ${
            P.datasQueDevemSerFuturas(e)
              .map((d) => d.campo)
              .join(",") || "-"
          } · ${P.leadIdDaProposta(e) === IDS.L2 ? "L2" : P.leadIdDaProposta(e) === IDS.L1 ? "L1" : P.leadIdDaProposta(e)}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "registrar_contato: followupEm · L1",
        "anotar: - · L1",
        "criar_tarefa: vencimentoEm · L1",
        "atualizar_qualificacao: - · L1",
        "agendar_visita: inicioEm · L1",
        "mudar_etapa: - · L1",
        "registrar_retorno: retornoEm · L1",
        "marcar_perdido: - · L1",
        "trocar_vaga: retornoEm · L2",
        "concluir_tarefa: - · null",
        "reagendar_tarefa: novoVencimentoEm · null",
        "cancelar_tarefa: - · null",
        "confirmar_visita: - · null",
        "remarcar_visita: novoInicioEm · null",
        "cancelar_visita: - · null",
        "registrar_visita: proximoFollowupEm · L1",
        "documentos_checklist: - · L1",
        "atualizar_documento: - · L1",
        "anexar_documento: - · L1",
        "enviar_analise_credito: - · L1",
        "registrar_resultado_credito: - · L1",
        "registrar_venda: - · L1",
        "fazer_checkin: - · null",
        "criar_lead: - · null",
        "pedir_lote: - · null",
      ]
    `);
    const visita = P.PropostaPayloadSchema.parse({
      ...EXEMPLOS.registrar_visita,
      reagendarPara: "2026-11-02T10:00:00-03:00",
    });
    expect(P.datasQueDevemSerFuturas(visita).map((d) => d.campo)).toEqual([
      "proximoFollowupEm",
      "reagendarPara",
    ]);
  });

  it("refine: cada regra recusa com a mensagem dela", () => {
    const e = EXEMPLOS;
    const s = P.PropostaPayloadSchema;
    expect([
      msgs(s.safeParse({ tipo: "atualizar_qualificacao", leadId: IDS.L1 })),
      msgs(s.safeParse({ tipo: "mudar_etapa", leadId: IDS.L1, novoStatus: "perdido" })),
      msgs(s.safeParse({ tipo: "mudar_etapa", leadId: IDS.L1, novoStatus: "aguardando_retorno" })),
      msgs(s.safeParse({ ...e.marcar_perdido, detalhe: " " })),
      msgs(s.safeParse({ ...e.trocar_vaga, entraLeadId: IDS.L1 })),
      msgs(s.safeParse({ ...e.registrar_visita, compareceu: false })),
      msgs(s.safeParse({ ...e.registrar_resultado_credito, valorParcela: 300000 })),
      msgs(s.safeParse({ ...e.registrar_venda, projetoNome: undefined })),
      msgs(s.safeParse({ ...e.fazer_checkin, filial: undefined })),
      msgs(s.safeParse({ ...e.criar_lead, telefone: "(11) 98765-4321" })),
      msgs(P.MudarEtapaFerramentaBase.safeParse({ ...e.mudar_etapa, novoStatus: "perdido" })),
    ]).toMatchInlineSnapshot(`
      [
        "informe pelo menos um campo para atualizar",
        "motivo é obrigatório ao perder",
        "aguardando retorno exige follow-up",
        "descreva o motivo quando a categoria é 'outro'",
        "troca precisa de dois clientes diferentes; retorno exige data e perda exige categoria",
        "sem comparecimento não há leitura de interesse nem visita realizada",
        "reprovada/condicionada exigem motivo; a parcela tem de ser menor que o financiamento",
        "informe o empreendimento (id ou nome)",
        "check-in na loja precisa da filial",
        "telefone só com dígitos, DDD + número",
        "Invalid input: expected "qualificacao_corretor"",
      ]
    `);
  });
});
