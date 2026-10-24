// Banco falso das ferramentas de escrita da Sami (samiq-propostas.server.ts)
// para a caracterização: responde por tabela conforme o cenário e GRAVA cada
// consulta como uma linha legível ("o que a ferramenta leu, e em que ordem").

export const IDS = {
  L1: "11111111-1111-4111-8111-111111111111",
  L2: "22222222-2222-4222-8222-222222222222",
  T1: "33333333-3333-4333-8333-333333333333",
  A1: "44444444-4444-4444-8444-444444444444",
  P1: "55555555-5555-4555-8555-555555555555",
};

export type Cenario = {
  /** Etapa de cada cliente da carteira; ausente = fora da carteira. */
  leads?: Partial<Record<"L1" | "L2", string>>;
  semCorretor?: boolean;
  homonimos?: boolean;
  visitaNoHorario?: boolean;
  tarefa?: string | null;
  visita?: string | null;
  anexoUsado?: boolean | null;
  telefoneDuplicado?: boolean;
};

const NOMES = { L1: "Lucas Ferreira", L2: "Ana Ribeiro" } as const;

function linhaLead(c: Cenario, chave: "L1" | "L2") {
  const status = c.leads?.[chave];
  if (!status) return null;
  return {
    id: IDS[chave],
    nome: NOMES[chave],
    status,
    corretor_id: c.semCorretor ? null : "u1",
    projeto_nome: "Vibra Lapa",
    telefone: null,
    telefone_e164: "5511900000000",
  };
}

export function bancoGravado(c: Cenario) {
  const chamadas: string[] = [];
  const responder = (tabela: string, passos: string[], unica: boolean) => {
    const tem = (p: string) => passos.some((x) => x.startsWith(p));
    if (tabela === "leads") {
      if (unica) {
        const id = passos.find((x) => x.startsWith('.eq("id"'));
        const chave = id?.includes(IDS.L1) ? "L1" : id?.includes(IDS.L2) ? "L2" : null;
        return chave ? linhaLead(c, chave) : null;
      }
      if (tem(".ilike"))
        return c.homonimos
          ? [{ id: IDS.L2, nome: "Lucas Andrade", status: "novo", projeto_nome: null }]
          : [];
      if (tem(".or"))
        return c.telefoneDuplicado ? [{ id: IDS.L2, nome: NOMES.L2, status: "novo" }] : [];
    }
    if (tabela === "agendamentos") {
      if (unica)
        return c.visita
          ? {
              id: IDS.A1,
              status: c.visita,
              tipo: "visita",
              lead_id: IDS.L1,
              lead: { id: IDS.L1, nome: NOMES.L1, status: "agendado" },
            }
          : null;
      return c.visitaNoHorario ? [{ id: IDS.A1, data_inicio: "2026-10-28T18:00:00Z" }] : [];
    }
    if (tabela === "tarefas" && unica)
      return c.tarefa
        ? {
            id: IDS.T1,
            titulo: "Ligar",
            status: c.tarefa,
            lead_id: IDS.L1,
            lead: { id: IDS.L1, nome: NOMES.L1 },
          }
        : null;
    if (tabela === "samiq_anexos" && unica)
      return c.anexoUsado == null
        ? null
        : { id: IDS.A1, usado_em: c.anexoUsado ? "2026-10-24" : null };
    return unica ? null : [];
  };
  const cliente = {
    from(tabela: string) {
      const passos: string[] = [];
      const indice = chamadas.push(`from(${tabela})`) - 1;
      const resolver = (unica: boolean) => {
        chamadas[indice] = `from(${tabela})${passos.join("")}`;
        return Promise.resolve({ data: responder(tabela, passos, unica), error: null });
      };
      const q: Record<string, unknown> = new Proxy(
        {},
        {
          get(_alvo, prop: string) {
            if (prop === "then")
              return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
                resolver(false).then(ok, erro);
            return (...args: unknown[]) => {
              passos.push(`.${prop}(${args.map((a) => JSON.stringify(a)).join(",")})`);
              if (prop === "maybeSingle" || prop === "single") return resolver(true);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
  return { chamadas, cliente: cliente as never };
}

const { L1, L2, T1, A1, P1 } = IDS;

/** Uma entrada válida por ferramenta (o que o modelo manda, sem o "tipo"). */
export const ENTRADAS: Record<string, Record<string, unknown>> = {
  registrar_contato: {
    leadId: L1,
    canal: "whatsapp",
    resultado: "interessado",
    resumo: "Gostou do Vibra, quer simular",
    followupEm: "2026-10-27T14:00",
  },
  anotar: { leadId: L1, nota: "Prefere ser chamado à noite" },
  criar_tarefa: {
    leadId: L1,
    titulo: "Ligar para confirmar renda",
    tipoTarefa: "ligacao",
    vencimentoEm: "2026-10-26T10:00:00-03:00",
  },
  atualizar_qualificacao: { leadId: L1, rendaEstimada: 4500, temperatura: "quente" },
  agendar_visita: { leadId: L1, inicioEm: "2026-10-28T15:00", local: "Estande Vibra Lapa" },
  mudar_etapa: { leadId: L1, novoStatus: "qualificacao_corretor" },
  registrar_retorno: {
    leadId: L1,
    desfecho: "pediu_retorno",
    retornoEm: "2026-11-03T09:00:00-03:00",
    nota: "Vai falar com a esposa",
    canal: "ligacao",
  },
  marcar_perdido: { leadId: L1, categoria: "outro", detalhe: "Mudou de cidade" },
  trocar_vaga: {
    entraLeadId: L2,
    saiLeadId: L1,
    desfecho: "esfriou",
    retornoEm: "2026-11-10T10:00:00-03:00",
    contato: "whatsapp",
    proximoPasso: "Apresentar o Cury",
  },
  concluir_tarefa: { tarefaId: T1, resultado: "Cliente confirmou" },
  reagendar_tarefa: { tarefaId: T1, novoVencimentoEm: "2026-10-29T11:00:00-03:00" },
  cancelar_tarefa: { tarefaId: T1, motivo: "Duplicada" },
  confirmar_visita: { agendamentoId: A1 },
  remarcar_visita: { agendamentoId: A1, novoInicioEm: "2026-10-30T16:00:00-03:00" },
  cancelar_visita: { agendamentoId: A1, motivo: "Cliente viajou" },
  registrar_visita: {
    leadId: L1,
    agendamentoId: A1,
    compareceu: true,
    interesse: "alto",
    observacoes: "Gostou da planta de 2 dorms",
  },
  documentos_checklist: { leadId: L1, perfil: "clt", casado: true, usaFgts: true },
  atualizar_documento: { leadId: L1, documento: "cpf", status: "recebido" },
  anexar_documento: { leadId: L1, anexoId: A1, documento: "documento_identidade" },
  enviar_analise_credito: { leadId: L1, situacao: "enviada", observacoes: "Caixa" },
  registrar_resultado_credito: {
    leadId: L1,
    resultado: "aprovada_condicionada",
    motivo: "Comprovar renda extra",
    valorFinanciamento: 200000,
  },
  registrar_venda: {
    leadId: L1,
    projetoNome: "Vibra Lapa",
    unidade: "T2 ap 104",
    valorVenda: 289000,
    dataAssinatura: "2026-10-20",
    previsaoRecebimento: "2026-12",
  },
  fazer_checkin: { modo: "loja", filial: "liberdade" },
  criar_lead: { nome: "João Pereira", telefone: "11987654321", projetoId: P1 },
  pedir_lote: { zona: "Leste" },
};
