// Sami — checagens do alvo da ação antes de gravar: a tarefa, a visita e o
// anexo existem e estão abertos, a filial do check-in é conhecida e o
// telefone do cadastro não é de corretor nem de cliente que já existe.
// Recortado de samiq-propostas.server.ts sem mudança de comportamento.

import { displayNameForSamiQ } from "@/lib/samiq-governance";
import { filtroOrTelefone, sufixosTelefone } from "@/lib/lead-busca-telefone";
import type { CitarClienteSamiQ } from "@/lib/samiq-tools.server";
import { tabelaAnexosSamiQ } from "@/lib/samiq-anexos-tabela";
import { telefoneEhDeCorretor } from "@/lib/telefone-corretor.server";
import type { PropostaPayload } from "@/lib/samiq-propostas";
import type { Db } from "./samiq-propostas-leitura.server";
import type { Bloqueio } from "./samiq-propostas-regras.server";

const FILIAIS_CONHECIDAS = ["barra-funda", "liberdade", "belem"];

export async function checarAlvoDaProposta(
  supabase: Db,
  citar: CitarClienteSamiQ,
  payload: PropostaPayload,
): Promise<{ payload: PropostaPayload; bloqueio?: Bloqueio; nomeAlvo?: string | null }> {
  switch (payload.tipo) {
    case "concluir_tarefa":
    case "reagendar_tarefa":
    case "cancelar_tarefa": {
      const { data: t } = await supabase
        .from("tarefas")
        .select("id, titulo, status, lead_id, lead:leads(id, nome)")
        .eq("id", payload.tarefaId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!t)
        return {
          payload,
          bloqueio: {
            erro: "tarefa_nao_encontrada",
            detalhe: "use minhas_tarefas para achar o id",
          },
        };
      if (t.status === "concluida" || t.status === "cancelada") {
        return {
          payload,
          bloqueio: { erro: "tarefa_fechada", detalhe: `a tarefa já está ${t.status}` },
        };
      }
      const l = t.lead as { id: string; nome: string | null } | null;
      if (l) citar({ id: l.id, nome: l.nome });
      return { payload, nomeAlvo: l ? displayNameForSamiQ(l.nome) : null };
    }
    case "confirmar_visita":
    case "remarcar_visita":
    case "cancelar_visita": {
      const { data: a } = await supabase
        .from("agendamentos")
        .select("id, status, tipo, lead_id, lead:leads(id, nome, status)")
        .eq("id", payload.agendamentoId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!a)
        return {
          payload,
          bloqueio: {
            erro: "visita_nao_encontrada",
            detalhe: "use minha_agenda para achar o id",
          },
        };
      if (!["agendado", "confirmado"].includes(a.status)) {
        return {
          payload,
          bloqueio: { erro: "visita_fechada", detalhe: `a visita está ${a.status}` },
        };
      }
      if (payload.tipo === "confirmar_visita" && a.status === "confirmado") {
        return {
          payload,
          bloqueio: { erro: "ja_confirmada", detalhe: "a visita já está confirmada" },
        };
      }
      const l = a.lead as { id: string; nome: string | null; status: string } | null;
      if (l) citar({ id: l.id, nome: l.nome, etapa: l.status });
      return { payload, nomeAlvo: l ? displayNameForSamiQ(l.nome) : null };
    }
    case "anexar_documento": {
      // RLS de samiq_anexos: o corretor só enxerga os próprios arquivos.
      const { data: row } = await tabelaAnexosSamiQ(supabase)
        .select("id, usado_em")
        .eq("id", payload.anexoId)
        .maybeSingle();
      if (!row)
        return {
          payload,
          bloqueio: {
            erro: "anexo_nao_encontrado",
            detalhe: "o arquivo não está mais disponível; peça para reenviar",
          },
        };
      if (row.usado_em)
        return {
          payload,
          bloqueio: { erro: "anexo_ja_usado", detalhe: "esse arquivo já foi anexado" },
        };
      return { payload };
    }
    case "fazer_checkin": {
      if (
        payload.modo === "loja" &&
        payload.filial &&
        !FILIAIS_CONHECIDAS.includes(payload.filial)
      ) {
        return {
          payload,
          bloqueio: {
            erro: "filial_invalida",
            detalhe: `use uma destas: ${FILIAIS_CONHECIDAS.join(", ")}`,
          },
        };
      }
      return { payload };
    }
    case "criar_lead": {
      // O telefone já chegou em dígitos (restaurado e normalizado em executar).
      if (await telefoneEhDeCorretor(payload.telefone)) {
        return {
          payload,
          bloqueio: {
            erro: "telefone_de_corretor",
            detalhe: "esse telefone é de um corretor da SMQ e não pode ser cadastrado como cliente",
          },
        };
      }
      const sufixos = sufixosTelefone(payload.telefone);
      const { data: dup } = sufixos.length
        ? await supabase
            .from("leads")
            .select("id, nome, status")
            .is("deleted_at", null)
            .or(filtroOrTelefone(sufixos[0]))
            .limit(1)
        : { data: [] };
      if (dup && dup.length > 0) {
        citar({ id: dup[0].id, nome: dup[0].nome, etapa: dup[0].status });
        return {
          payload,
          bloqueio: {
            erro: "cliente_ja_existe",
            detalhe:
              "Esse telefone já é de um cliente da carteira: registre o contato nele em vez de cadastrar.",
            cliente: {
              id: dup[0].id,
              nome: displayNameForSamiQ(dup[0].nome),
              etapa: dup[0].status,
            },
          },
        };
      }
      return { payload, nomeAlvo: displayNameForSamiQ(payload.nome) };
    }
    case "pedir_lote":
      return { payload, nomeAlvo: null };
    default:
      return { payload };
  }
}
