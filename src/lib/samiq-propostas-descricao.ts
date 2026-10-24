// Sami — a ação como o painel e o WhatsApp recebem e o texto humano de cada uma
// (descreverProposta), com os auxiliares de contato, visita e telefone.
// Recortado de samiq-propostas.ts (que reexporta tudo) sem mudança de comportamento.

import { z } from "zod";
import { LEAD_STATUS_LABEL, type LeadStatus, MOTIVO_PERDA_LABEL } from "@/lib/leads";
import { DOC_LABEL } from "@/lib/documentacao-checklist";
import { fmtDataHoraSP, fmtDiaBr } from "@/lib/samiq-datas";
import { PRIORIDADE_LABEL } from "@/lib/tarefas";
import { type SamiQPropostaTipo } from "./samiq-propostas-tipos";
import {
  CANAL_LABEL,
  ORIGEM_CAPTACAO_LABEL,
  RESULTADO_CONTATO_LABEL,
} from "./samiq-propostas-catalogos";
import { AgendarVisitaPayload, RegistrarContatoPayload } from "./samiq-propostas-contratos";
import { type PropostaPayload } from "./samiq-propostas-contratos-v8";

/** Ação como o painel e o WhatsApp recebem (persistida em samiq_propostas). */
export type PropostaSamiQ = {
  id: string;
  tipo: SamiQPropostaTipo;
  payload: PropostaPayload;
  /** Nome do cliente resolvido no servidor (o modelo só manda o id). */
  leadNome: string | null;
  status: "pendente" | "aceita" | "editada" | "rejeitada" | "desfeita" | "falhou";
  /** Até quando dá para desfazer (24 h após gravar); null = não desfaz. */
  desfazerAte?: string | null;
  erro?: string | null;
  /** Texto curto do que aconteceu de fato ao gravar (v8, ex.: "entrou em Em atendimento"). */
  efeito?: string | null;
};

export const SAMIQ_DESFAZER_JANELA_HORAS = 24;

/** Conteúdo da interação = resumo do corretor; sem resumo, o próprio resultado. */
export function conteudoContato(p: z.infer<typeof RegistrarContatoPayload>): string {
  return p.resumo?.trim() || RESULTADO_CONTATO_LABEL[p.resultado];
}

/** Fim da visita = início + duração (padrão 60 min). */
export function fimDaVisita(p: z.infer<typeof AgendarVisitaPayload>): string {
  const inicio = new Date(p.inicioEm).getTime();
  return new Date(inicio + (p.duracaoMin ?? 60) * 60_000).toISOString();
}

export function tituloVisita(
  p: z.infer<typeof AgendarVisitaPayload>,
  leadNome: string | null,
): string {
  if (p.titulo?.trim()) return p.titulo.trim();
  return p.local?.trim() ? `Visita - ${p.local.trim()}` : `Visita - ${leadNome ?? "cliente"}`;
}

export function rotuloEtapa(s: string): string {
  return LEAD_STATUS_LABEL[s as LeadStatus] ?? s;
}

function brl(n: number | undefined | null): string | null {
  if (n === undefined || n === null || !Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** "(11) 9****-4321": o corretor reconhece o número sem o WhatsApp repetir o telefone inteiro. */
export function telefoneMascarado(tel: string | null | undefined): string {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 8) return "telefone informado";
  return `final ${d.slice(-4)}`;
}

export type DescricaoProposta = { titulo: string; detalhes: string[] };

const TIPO_RENDA_LABEL: Record<string, string> = {
  clt: "CLT",
  autonomo: "autônoma",
  servidor: "de servidor público",
  misto: "mista",
  outro: "de outro tipo",
};

const FILIAL_LABEL: Record<string, string> = {
  "barra-funda": "Barra Funda",
  liberdade: "Liberdade",
  belem: "Belém",
};

function rotuloFilial(slug: string | undefined): string {
  const chave = (slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/^filial-/, "");
  return FILIAL_LABEL[chave] ?? (slug ?? "").trim();
}

/** "clt" vira "CLT" no recibo; o que o modelo mandar fora da lista sai como veio. */
function rotuloTipoRenda(tipo: string): string {
  const chave = tipo
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return TIPO_RENDA_LABEL[chave] ?? tipo.trim();
}

/** Texto humano do card, da lista do WhatsApp e do retorno da ferramenta. */
export function descreverProposta(
  payload: PropostaPayload,
  leadNome: string | null,
): DescricaoProposta {
  const quem = leadNome ?? "cliente";
  switch (payload.tipo) {
    case "registrar_contato": {
      const detalhes = [
        `${CANAL_LABEL[payload.canal]}, ${RESULTADO_CONTATO_LABEL[payload.resultado].toLowerCase()}`,
      ];
      if (payload.resumo?.trim()) detalhes.push(payload.resumo.trim());
      if (payload.objecoes?.length) detalhes.push(`Objeções: ${payload.objecoes.join(", ")}`);
      const fu = fmtDataHoraSP(payload.followupEm);
      detalhes.push(fu ? `Follow-up ${fu}` : "Sem follow-up");
      return { titulo: `Contato com ${quem}`, detalhes };
    }
    case "anotar":
      return { titulo: `Nota sobre ${quem}`, detalhes: [payload.nota] };
    case "criar_tarefa": {
      const venc = fmtDataHoraSP(payload.vencimentoEm);
      return {
        titulo: payload.leadId
          ? `Tarefa de ${quem}: ${payload.titulo}`
          : `Tarefa: ${payload.titulo}`,
        detalhes: [
          venc ? `Vence ${venc}` : "Sem vencimento válido",
          `Prioridade ${PRIORIDADE_LABEL[payload.prioridade ?? "media"].toLowerCase()}`,
        ],
      };
    }
    case "atualizar_qualificacao": {
      const detalhes: string[] = [];
      if (payload.rendaInformada !== undefined) detalhes.push(`Renda: ${payload.rendaInformada}`);
      if (payload.rendaEstimada !== undefined)
        detalhes.push(`Renda: ${brl(payload.rendaEstimada)}`);
      if (payload.entradaDisponivel !== undefined)
        detalhes.push(`Entrada: ${payload.entradaDisponivel}`);
      if (payload.usaFgts !== undefined)
        detalhes.push(`Usa FGTS: ${payload.usaFgts ? "sim" : "não"}`);
      if (payload.temFgts !== undefined)
        detalhes.push(`Tem FGTS: ${payload.temFgts ? "sim" : "não"}`);
      if (payload.fgtsValor !== undefined) detalhes.push(`FGTS: ${brl(payload.fgtsValor)}`);
      if (payload.tipoRenda !== undefined)
        detalhes.push(`Renda ${rotuloTipoRenda(payload.tipoRenda)}`);
      if (payload.faixaMcmv !== undefined) detalhes.push(`Faixa ${payload.faixaMcmv}`);
      if (payload.temperatura !== undefined) detalhes.push(`Temperatura ${payload.temperatura}`);
      if (payload.decisor !== undefined) detalhes.push(`Decisor: ${payload.decisor}`);
      if (payload.zona !== undefined || payload.bairro !== undefined)
        detalhes.push(`Região: ${[payload.bairro, payload.zona].filter(Boolean).join(", ")}`);
      if (payload.dormsDesejados !== undefined) detalhes.push(`${payload.dormsDesejados} dorm.`);
      if (payload.precisaVaga !== undefined)
        detalhes.push(`Vaga: ${payload.precisaVaga ? "sim" : "não"}`);
      if (payload.prioridades?.length)
        detalhes.push(`Prioridades: ${payload.prioridades.join(", ")}`);
      if (payload.notaPerfil !== undefined) detalhes.push(`Perfil: ${payload.notaPerfil}`);
      if (payload.projetoInteresse !== undefined)
        detalhes.push(`Projeto: ${payload.projetoInteresse}`);
      else if (payload.projetoId) detalhes.push("Projeto de interesse atualizado");
      if (payload.objecoesAdicionar?.length)
        detalhes.push(`Objeções: ${payload.objecoesAdicionar.join(", ")}`);
      if (payload.resumoQualificacao !== undefined)
        detalhes.push(`Parecer: ${payload.resumoQualificacao}`);
      return { titulo: `Qualificação de ${quem}`, detalhes };
    }
    case "agendar_visita": {
      const quando = fmtDataHoraSP(payload.inicioEm);
      const detalhes = [quando ?? "Data inválida"];
      if (payload.local?.trim()) detalhes.push(payload.local.trim());
      detalhes.push(payload.moverParaAgendado === false ? "Mantém a etapa" : "Move para Agendado");
      return { titulo: `Visita de ${quem}`, detalhes };
    }
    case "mudar_etapa": {
      const detalhes: string[] = [];
      if (payload.motivo?.trim()) detalhes.push(`Motivo: ${payload.motivo.trim()}`);
      if (payload.motivoCategoria) detalhes.push(MOTIVO_PERDA_LABEL[payload.motivoCategoria]);
      if (payload.proximaAcao?.trim()) detalhes.push(`Próxima ação: ${payload.proximaAcao.trim()}`);
      const fu = fmtDataHoraSP(payload.proximoFollowupEm);
      if (fu) detalhes.push(`Follow-up ${fu}`);
      return { titulo: `Mover ${quem} para ${rotuloEtapa(payload.novoStatus)}`, detalhes };
    }
    case "registrar_retorno": {
      const quando = fmtDataHoraSP(payload.retornoEm);
      const detalhes = [
        payload.desfecho === "esfriou" ? "Esfriou (fica frio)" : "Pediu retorno",
        quando ? `Retornar ${quando}` : "Data inválida",
      ];
      if (payload.nota?.trim()) detalhes.push(payload.nota.trim());
      return { titulo: `${quem} para Aguardando retorno`, detalhes };
    }
    case "marcar_perdido": {
      const detalhes = [MOTIVO_PERDA_LABEL[payload.categoria]];
      if (payload.detalhe?.trim()) detalhes.push(payload.detalhe.trim());
      detalhes.push("Sai da sua carteira (vai para outro corretor ou para a base)");
      return { titulo: `Perder ${quem}`, detalhes };
    }
    case "trocar_vaga": {
      const sai =
        payload.desfecho === "perdido"
          ? `sai como perdido (${payload.categoria ? MOTIVO_PERDA_LABEL[payload.categoria] : "sem categoria"})`
          : `sai para retorno ${fmtDataHoraSP(payload.retornoEm) ?? ""}`.trim();
      return { titulo: `Troca de vaga: entra ${quem}`, detalhes: [sai] };
    }
    case "concluir_tarefa":
      return {
        titulo: "Concluir tarefa",
        detalhes: payload.resultado?.trim() ? [payload.resultado.trim()] : [],
      };
    case "reagendar_tarefa":
      return {
        titulo: "Reagendar tarefa",
        detalhes: [`Para ${fmtDataHoraSP(payload.novoVencimentoEm) ?? "data inválida"}`],
      };
    case "cancelar_tarefa":
      return {
        titulo: "Cancelar tarefa",
        detalhes: payload.motivo?.trim() ? [payload.motivo.trim()] : [],
      };
    case "confirmar_visita":
      return { titulo: `Visita de ${quem} confirmada`, detalhes: [] };
    case "remarcar_visita":
      return {
        titulo: `Remarcar visita de ${quem}`,
        detalhes: [`Para ${fmtDataHoraSP(payload.novoInicioEm) ?? "data inválida"}`],
      };
    case "cancelar_visita":
      return { titulo: `Cancelar visita de ${quem}`, detalhes: [payload.motivo] };
    case "registrar_visita": {
      const detalhes = [payload.compareceu ? "Foi à visita" : "Não compareceu"];
      if (payload.interesse) detalhes.push(`Interesse ${payload.interesse.replace("_", " ")}`);
      const etapa =
        payload.proximaEtapa ?? (payload.compareceu ? "visita_realizada" : "aguardando_retorno");
      if (payload.reagendarPara)
        detalhes.push(`Nova visita ${fmtDataHoraSP(payload.reagendarPara) ?? ""}`.trim());
      detalhes.push(`Vai para ${rotuloEtapa(etapa)}`);
      return { titulo: `Resultado da visita de ${quem}`, detalhes };
    }
    case "documentos_checklist":
      return {
        titulo: `Checklist de documentos de ${quem}`,
        detalhes: [
          `Perfil ${payload.perfil}`,
          [
            payload.casado ? "casado" : null,
            payload.usaFgts ? "usa FGTS" : null,
            payload.declaraIr ? "declara IR" : null,
          ]
            .filter(Boolean)
            .join(", ") || "sem extras",
        ],
      };
    case "atualizar_documento":
      return {
        titulo: `${DOC_LABEL[payload.documento] ?? payload.documento} de ${quem}`,
        detalhes: [
          `Status ${payload.status}`,
          ...(payload.observacao?.trim() ? [payload.observacao.trim()] : []),
        ],
      };
    case "anexar_documento":
      return {
        titulo: `Anexar ${DOC_LABEL[payload.documento] ?? payload.documento} de ${quem}`,
        detalhes: ["Arquivo recebido no WhatsApp"],
      };
    case "enviar_analise_credito":
      return {
        titulo: `Enviar ${quem} para análise de crédito`,
        detalhes: [
          payload.situacao === "pendente" ? "Pendente (faltam documentos)" : "Enviada ao banco",
          ...(payload.observacoes?.trim() ? [payload.observacoes.trim()] : []),
        ],
      };
    case "registrar_resultado_credito": {
      const rotulo =
        payload.resultado === "aprovada"
          ? "Aprovada"
          : payload.resultado === "aprovada_condicionada"
            ? "Aprovada com condição"
            : "Reprovada";
      const detalhes = [rotulo];
      if (payload.motivo?.trim()) detalhes.push(payload.motivo.trim());
      const fin = brl(payload.valorFinanciamento);
      const parc = brl(payload.valorParcela);
      if (fin || parc)
        detalhes.push(
          [fin && `financiamento ${fin}`, parc && `parcela ${parc}`].filter(Boolean).join(", "),
        );
      return { titulo: `Crédito de ${quem}`, detalhes };
    }
    case "registrar_venda":
      return {
        titulo: `Venda de ${quem}`,
        detalhes: [
          [payload.projetoNome, payload.unidade].filter(Boolean).join(" ") ||
            "Empreendimento cadastrado",
          `${brl(payload.valorVenda)}, assinatura ${fmtDiaBr(payload.dataAssinatura) ?? payload.dataAssinatura}`,
          "Vai para aprovação da gestão",
        ],
      };
    case "fazer_checkin":
      return {
        titulo:
          payload.modo === "sair"
            ? "Encerrar presença de hoje"
            : payload.modo === "casa"
              ? "Check-in em casa"
              : `Check-in na filial ${rotuloFilial(payload.filial)}`.trim(),
        detalhes: [],
      };
    case "criar_lead": {
      const detalhes = [
        `Telefone ${telefoneMascarado(payload.telefone)}`,
        `Origem: ${ORIGEM_CAPTACAO_LABEL[payload.origem ?? "captacao_corretor"]}`,
      ];
      if (payload.projetoNome?.trim()) detalhes.push(`Interesse: ${payload.projetoNome.trim()}`);
      if (payload.bairro?.trim() || payload.zona?.trim()) {
        detalhes.push(
          `Região: ${[payload.bairro?.trim(), payload.zona?.trim()].filter(Boolean).join(", ")}`,
        );
      }
      if (payload.observacoes?.trim()) detalhes.push(payload.observacoes.trim());
      detalhes.push("Entra na sua carteira em Aguardando atendimento");
      return { titulo: `Cadastrar cliente ${payload.nome}`, detalhes };
    }
    case "pedir_lote":
      return { titulo: `Pedir lote de 30 leads, zona ${payload.zona}`, detalhes: [] };
  }
}
