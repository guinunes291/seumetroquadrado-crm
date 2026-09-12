// Desfecho de um toque — lógica PURA. Depois de Ligar ou WhatsApp, "o que
// aconteceu?" com 3 a 5 respostas por situação; cada resposta já carrega o
// que o sistema vai gravar: a interação (título da timeline no vocabulário de
// RESULTADOS_CONTATO), o próximo passo com data (tarefa) e, quando cabe, a
// etapa. É o que faz o relógio "parado há X dias" dizer a verdade.
//
// A matriz é por etapa e balde, na ordem do mockup aprovado. Etapas com
// formulário obrigatório (agendado, visita realizada, análise, venda) abrem o
// modal da casa em vez de gravar aqui; "perdeu" pede motivo no diálogo de
// perda. Uma resposta nunca oferece uma transição que o funil recusaria
// (transicaoLeadPermitida) — ela vira só interação + próximo passo.

import {
  PROXIMA_ACAO,
  leadStatusLabel,
  transicaoLeadPermitida,
  type LeadStatus,
  type StageModal,
} from "@/lib/leads";
import { RESULTADOS_CONTATO, type ResultadoContato } from "@/lib/samiq-propostas";
import type { TarefaPrioridade, TarefaTipo } from "@/lib/tarefas";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";

/** Quando o próximo passo vence: em horas (ainda hoje), ou num dia à frente
 *  numa hora de expediente — o mockup marca "seg, 15 set", não "23:05". */
export type QuandoProximo = { emHoras: number } | { emDias: number; as: number };

export type ProximoPassoSugerido = {
  titulo: string;
  tipo: TarefaTipo;
  prioridade: TarefaPrioridade;
  quando: QuandoProximo;
};

export type EtapaDoDesfecho =
  | { kind: "direct"; status: LeadStatus }
  | { kind: "modal"; modal: StageModal; status: LeadStatus }
  | { kind: "perdido" };

export type OpcaoDesfecho = {
  id: string;
  rotulo: string;
  resultado: ResultadoContato;
  canal: "ligacao" | "whatsapp";
  /** Título da interação na timeline (default: RESULTADOS_CONTATO[resultado]). */
  titulo?: string;
  /** Próximo passo sugerido; null quando o modal ou a perda decidem. */
  proximo: ProximoPassoSugerido | null;
  etapa?: EtapaDoDesfecho;
  /** Pede uma linha de texto ao corretor (a objeção ou o combinado). */
  pedeTexto?: "objecao" | "nota";
  /** Ocupa a linha inteira na folha do celular ("Perdeu"). */
  largo?: boolean;
};

export type Desfecho = { pergunta: string; opcoes: OpcaoDesfecho[] };

const HORA_MS = 60 * 60 * 1000;

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

const passo = (
  titulo: string,
  quando: QuandoProximo,
  extra: Partial<Pick<ProximoPassoSugerido, "tipo" | "prioridade">> = {},
): ProximoPassoSugerido => ({
  titulo,
  tipo: extra.tipo ?? "follow_up",
  prioridade: extra.prioridade ?? "alta",
  quando,
});

const amanha = { emDias: 1, as: 9 } as const;
const emDias = (n: number): QuandoProximo => ({ emDias: n, as: 9 });

const naoAtendeu = (emHoras: number): OpcaoDesfecho => ({
  id: "nao_atendeu",
  rotulo: "Não atendeu",
  resultado: "nao_atendeu",
  canal: "ligacao",
  proximo: passo("Nova tentativa de contato", { emHoras }, { tipo: "ligacao" }),
});

const perdeu = (rotulo = "Perdeu (motivo)"): OpcaoDesfecho => ({
  id: "perdeu",
  rotulo,
  resultado: "sem_interesse",
  canal: "ligacao",
  proximo: null,
  etapa: { kind: "perdido" },
  largo: true,
});

/** Só oferece a etapa se o funil a aceita a partir do status atual; senão a
 *  resposta continua valendo como interação + próximo passo. */
function comEtapa(
  opcao: OpcaoDesfecho,
  status: string,
  etapa: EtapaDoDesfecho,
  gestao: boolean,
): OpcaoDesfecho {
  if (etapa.kind === "perdido") {
    return transicaoLeadPermitida(status, "perdido", gestao) ? { ...opcao, etapa } : opcao;
  }
  return transicaoLeadPermitida(status, etapa.status, gestao) ? { ...opcao, etapa } : opcao;
}

export function desfechoPara(item: FilaUnicaItem, opts: { gestao?: boolean } = {}): Desfecho {
  const gestao = opts.gestao ?? false;
  const status = item.lead.status;
  const nome = primeiroNome(item.lead.nome);
  const oQueAconteceu = `O que aconteceu com ${nome}?`;

  if (status === "analise_credito") {
    return {
      pergunta: oQueAconteceu,
      opcoes: [
        {
          id: "credito_aprovado",
          rotulo: "Falei · crédito aprovado",
          resultado: "interessado",
          canal: "ligacao",
          proximo: passo("Agendar assinatura", amanha),
        },
        {
          id: "aguardando_caixa",
          rotulo: "Falei · aguardando Caixa",
          resultado: "atendeu",
          canal: "ligacao",
          proximo: passo("Cobrar o correspondente", emDias(3), { prioridade: "media" }),
        },
        {
          id: "credito_reprovado",
          rotulo: "Falei · reprovado",
          resultado: "atendeu",
          canal: "ligacao",
          proximo: passo("Nova análise ou perda", amanha),
        },
        naoAtendeu(3),
        comEtapa(perdeu(), status, { kind: "perdido" }, gestao),
      ],
    };
  }

  if (status === "agendado") {
    return {
      pergunta: `A visita de ${nome} aconteceu?`,
      opcoes: [
        comEtapa(
          {
            id: "visita_feita",
            rotulo: "Sim, foi à visita",
            resultado: "atendeu",
            canal: "ligacao",
            proximo: null,
          },
          status,
          { kind: "modal", modal: "visita_realizada", status: "visita_realizada" },
          gestao,
        ),
        {
          id: "no_show",
          rotulo: "Não foi (no-show)",
          resultado: "atendeu",
          canal: "whatsapp",
          proximo: passo("Reagendar a visita", amanha, { tipo: "whatsapp" }),
        },
        {
          id: "remarcou",
          rotulo: "Remarcou",
          resultado: "pediu_retorno",
          canal: "whatsapp",
          proximo: passo(
            "Remarcar a visita: escolher a nova data",
            { emHoras: 2 },
            { tipo: "whatsapp" },
          ),
        },
        comEtapa(perdeu("Desistiu (motivo)"), status, { kind: "perdido" }, gestao),
      ],
    };
  }

  if (status === "visita_realizada" || status === "proposta_enviada") {
    return {
      pergunta: oQueAconteceu,
      opcoes: [
        {
          id: "quer_proposta",
          rotulo: "Falei · quer proposta",
          resultado: "interessado",
          canal: "ligacao",
          proximo: passo("Enviar simulação", { emHoras: 4 }),
        },
        {
          id: "objecao",
          rotulo: "Falei · objeção",
          resultado: "atendeu",
          canal: "ligacao",
          proximo: passo("Responder a objeção", { emDias: 1, as: 10 }),
          pedeTexto: "objecao",
        },
        naoAtendeu(3),
        comEtapa(perdeu(), status, { kind: "perdido" }, gestao),
      ],
    };
  }

  if (item.bucket === "sla") {
    return {
      pergunta: `Primeiro contato com ${nome}`,
      opcoes: [
        comEtapa(
          {
            id: "qualificar",
            rotulo: "Falei · qualificar",
            resultado: "atendeu",
            canal: "ligacao",
            proximo: passo("Qualificar: renda, FGTS, urgência", { emHoras: 2 }),
          },
          status,
          { kind: "direct", status: "em_atendimento" },
          gestao,
        ),
        naoAtendeu(1),
        {
          id: "whatsapp_enviado",
          rotulo: "WhatsApp enviado",
          resultado: "nao_atendeu",
          titulo: "WhatsApp — enviado, aguardando resposta",
          canal: "whatsapp",
          proximo: passo("Aguardar a resposta", amanha, { tipo: "whatsapp", prioridade: "media" }),
        },
        comEtapa(perdeu("Sem perfil (motivo)"), status, { kind: "perdido" }, gestao),
      ],
    };
  }

  if (item.bucket === "responder") {
    const agendei: OpcaoDesfecho = {
      id: "agendei_visita",
      rotulo: "Agendei visita",
      resultado: "interessado",
      canal: "whatsapp",
      proximo: null,
    };
    const opcoes: OpcaoDesfecho[] = [
      {
        id: "enviei_simulacao",
        rotulo: "Enviei simulação",
        resultado: "atendeu",
        canal: "whatsapp",
        proximo: passo("Cobrar retorno da simulação", emDias(2), { prioridade: "media" }),
      },
    ];
    if (transicaoLeadPermitida(status, "agendado", gestao)) {
      opcoes.push({ ...agendei, etapa: { kind: "modal", modal: "agendado", status: "agendado" } });
    }
    opcoes.push({
      id: "objecao",
      rotulo: "Objeção",
      resultado: "atendeu",
      canal: "whatsapp",
      proximo: passo("Responder a objeção", { emDias: 1, as: 10 }),
      pedeTexto: "objecao",
    });
    return { pergunta: `Depois de responder ${nome}`, opcoes };
  }

  if (item.bucket === "docs") {
    return {
      pergunta: `Documentos de ${nome}`,
      opcoes: [
        {
          id: "cliente_envia",
          rotulo: "Cliente vai enviar",
          resultado: "atendeu",
          canal: "whatsapp",
          proximo: passo("Conferir o recebimento dos documentos", emDias(3), {
            tipo: "documentacao",
            prioridade: "media",
          }),
        },
        {
          id: "recebi",
          rotulo: "Recebi pelo WhatsApp",
          resultado: "atendeu",
          canal: "whatsapp",
          proximo: passo("Anexar e conferir a pasta", { emHoras: 2 }, { tipo: "documentacao" }),
        },
        naoAtendeu(3),
        comEtapa(perdeu("Desistiu (motivo)"), status, { kind: "perdido" }, gestao),
      ],
    };
  }

  // Follow-up, sem próximo passo, esfriando, fundo fora das etapas acima.
  const avanco =
    PROXIMA_ACAO[status as keyof typeof PROXIMA_ACAO]?.label ?? "Definir o próximo passo";
  return {
    pergunta: oQueAconteceu,
    opcoes: [
      {
        id: "avancar",
        rotulo: "Falei · avançar",
        resultado: "interessado",
        canal: "ligacao",
        proximo: passo(avanco, amanha),
      },
      comEtapa(
        {
          id: "pediu_retorno",
          rotulo: "Falei · pediu retorno",
          resultado: "pediu_retorno",
          canal: "ligacao",
          proximo: passo("Retornar como combinado", emDias(2), { prioridade: "media" }),
        },
        status,
        { kind: "direct", status: "aguardando_retorno" },
        gestao,
      ),
      {
        id: "objecao",
        rotulo: "Falei · objeção",
        resultado: "atendeu",
        canal: "ligacao",
        proximo: passo("Responder a objeção", { emDias: 1, as: 10 }),
        pedeTexto: "objecao",
      },
      naoAtendeu(3),
      comEtapa(perdeu(), status, { kind: "perdido" }, gestao),
    ],
  };
}

/** Data/hora do próximo passo a partir de "agora". */
export function vencimentoDe(quando: QuandoProximo, agora: Date): Date {
  if ("emHoras" in quando) return new Date(agora.getTime() + quando.emHoras * HORA_MS);
  const d = new Date(agora);
  d.setDate(d.getDate() + quando.emDias);
  d.setHours(quando.as, 0, 0, 0);
  return d;
}

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "hoje 14:00" (em horas), "amanhã" ou "qua, 17 set" (em dias). */
export function descreverQuando(quando: QuandoProximo, agora: Date): string {
  const v = vencimentoDe(quando, agora);
  if ("emHoras" in quando) {
    const hora = v.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (mesmoDia(v, agora)) return `hoje ${hora}`;
    return `amanhã ${hora}`;
  }
  if (quando.emDias === 1) return "amanhã";
  return v.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

/** "cobrar o correspondente · qua, 17 set" — a linha do "próximo passo sugerido". */
export function descreverProximo(opcao: OpcaoDesfecho, agora: Date): string | null {
  if (!opcao.proximo) {
    if (opcao.etapa?.kind === "perdido") return "perda com motivo";
    if (opcao.etapa?.kind === "modal")
      return `abrir ${leadStatusLabel(opcao.etapa.status).toLowerCase()}`;
    return null;
  }
  return `${opcao.proximo.titulo.toLowerCase()} · ${descreverQuando(opcao.proximo.quando, agora)}`;
}

/** O título que vai para a timeline. */
export function tituloDaInteracao(opcao: OpcaoDesfecho): string {
  return opcao.titulo ?? RESULTADOS_CONTATO[opcao.resultado];
}

/** "etapa → Em atendimento" quando a resposta muda a etapa. */
export function rotuloDaEtapa(opcao: OpcaoDesfecho): string | null {
  if (!opcao.etapa) return null;
  if (opcao.etapa.kind === "perdido") return "etapa → Perdido";
  return `etapa → ${leadStatusLabel(opcao.etapa.status)}`;
}
