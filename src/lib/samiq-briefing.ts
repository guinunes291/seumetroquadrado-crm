// Briefing ao abrir a Sami (Onda S3, decisão D13) — a parte PURA.
// "Hoje: 2 visitas (1 sem confirmar), 3 follow-ups vencidos, 4 clientes
// esfriando" montado a partir de agenda, tarefas e filas de Atender, sem
// chamar o modelo: zero custo de IA, resposta instantânea, e cada linha vira
// um atalho (navegar) ou uma pergunta pronta para a Sami. O servidor coleta
// (samiq-briefing.functions.ts); aqui só a regra e o texto.

import type { QueueKey } from "@/features/atendimento/derive";

export type BriefingAgendaItem = {
  id: string;
  tipo: string;
  status: string;
  titulo: string;
  inicio: string;
  leadId: string | null;
  leadNome: string | null;
};

export type BriefingTarefa = {
  id: string;
  titulo: string;
  venceEm: string | null;
  leadId: string | null;
  leadNome: string | null;
};

export type BriefingDados = {
  /** Instante de referência (o servidor passa `new Date()`). */
  agora: Date;
  /** AAAA-MM-DD em São Paulo (hojeSaoPaulo). */
  hoje: string;
  /** Compromissos de hoje e amanhã, abertos (agendado/confirmado). */
  agenda: BriefingAgendaItem[];
  /** Tarefas vencidas (as primeiras, ordenadas pela mais antiga). */
  tarefasVencidas: BriefingTarefa[];
  totalTarefasVencidas: number;
  /** Totais das filas de Atender (atendimento_inbox). */
  contagens: Partial<Record<QueueKey, number>>;
};

export type BriefingIcone =
  | "agenda"
  | "confirmar"
  | "followup"
  | "responder"
  | "esfriando"
  | "docs"
  | "novos";

export type BriefingLinha = {
  chave: string;
  icone: BriefingIcone;
  texto: string;
  tom: "neutral" | "warning" | "info";
  /** Rota para o botão de atalho. */
  to?: string;
  /** Pergunta pronta que o painel envia à Sami ao tocar na linha. */
  pergunta?: string;
};

export type BriefingSamiQ = {
  saudacao: string;
  linhas: BriefingLinha[];
  vazio: boolean;
  geradoEm: string;
};

const FUSO = "America/Sao_Paulo";

function horaSP(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(":", "h");
}

function diaSP(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** AAAA-MM-DD → o dia seguinte (aritmética em UTC sobre a data pura). */
function diaSeguinte(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function primeiroNome(nome: string | null): string {
  return nome?.trim().split(/\s+/)[0] || "cliente";
}

function listarNomes(nomes: string[], max = 3): string {
  const unicos = [...new Set(nomes)];
  if (unicos.length <= max) return unicos.join(", ");
  return `${unicos.slice(0, max).join(", ")} e mais ${unicos.length - max}`;
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

export function saudacaoSamiQ(agora: Date): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO, hour: "numeric", hourCycle: "h23" }).format(
      agora,
    ),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function montarBriefingSamiQ(dados: BriefingDados): BriefingSamiQ {
  const linhas: BriefingLinha[] = [];
  const c = dados.contagens;

  // 1) Visitas de hoje (com quem e a que horas).
  const visitasHoje = dados.agenda
    .filter((a) => a.tipo === "visita" && diaSP(a.inicio) === dados.hoje)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (visitasHoje.length > 0) {
    const quem = listarNomes(
      visitasHoje.map((v) => `${primeiroNome(v.leadNome)} ${horaSP(v.inicio)}`),
    );
    linhas.push({
      chave: "visitas_hoje",
      icone: "agenda",
      tom: "info",
      texto: `${plural(visitasHoje.length, "visita hoje", "visitas hoje")}: ${quem}`,
      to: "/agendamentos",
      pergunta: "Quem tem visita hoje e o que preciso saber de cada um?",
    });
  }

  // 1b) Visitas de AMANHÃ (Onda S5, D16/D13): o preparador de visita começa
  //     na véspera — a linha já vem com a pergunta "me prepara".
  const amanha = diaSeguinte(dados.hoje);
  const visitasAmanha = dados.agenda
    .filter((a) => a.tipo === "visita" && diaSP(a.inicio) === amanha)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (visitasAmanha.length > 0) {
    const quem = listarNomes(
      visitasAmanha.map((v) => `${primeiroNome(v.leadNome)} ${horaSP(v.inicio)}`),
    );
    const unico = visitasAmanha.length === 1 ? primeiroNome(visitasAmanha[0].leadNome) : null;
    linhas.push({
      chave: "visitas_amanha",
      icone: "agenda",
      tom: "info",
      texto: `${plural(visitasAmanha.length, "visita amanhã", "visitas amanhã")}: ${quem}`,
      to: "/agendamentos",
      pergunta: unico
        ? `Me prepara para a visita de amanhã com ${unico}.`
        : "Me prepara para as visitas de amanhã: o que confirmar, levar e perguntar em cada uma?",
    });
  }

  // 2) Visitas ainda sem confirmação (hoje e amanhã) — a tarefa que não existia
  //    no CRM até a auditoria; aqui vira a primeira coisa que a Sami cobra.
  const semConfirmar = dados.agenda.filter((a) => a.tipo === "visita" && a.status === "agendado");
  if (semConfirmar.length > 0) {
    const quem = listarNomes(
      semConfirmar.map(
        (v) =>
          `${primeiroNome(v.leadNome)} ${diaSP(v.inicio) === dados.hoje ? "hoje" : "amanhã"} ${horaSP(v.inicio)}`,
      ),
    );
    linhas.push({
      chave: "sem_confirmar",
      icone: "confirmar",
      tom: "warning",
      texto: `${plural(semConfirmar.length, "visita sem confirmar", "visitas sem confirmar")}: ${quem}`,
      to: "/atendimento",
      pergunta: "Quais visitas ainda não confirmei? Me ajuda a confirmar.",
    });
  }

  // 3) Follow-ups vencidos.
  if (dados.totalTarefasVencidas > 0) {
    const quem = listarNomes(
      dados.tarefasVencidas.map((t) => primeiroNome(t.leadNome ?? t.titulo)),
    );
    linhas.push({
      chave: "followups_vencidos",
      icone: "followup",
      tom: "warning",
      texto: `${plural(dados.totalTarefasVencidas, "follow-up vencido", "follow-ups vencidos")}${quem ? `: ${quem}` : ""}`,
      to: "/tarefas",
      pergunta: "Quais follow-ups estão vencidos e por quem começo?",
    });
  }

  // 4) Filas de Atender.
  if ((c.responder ?? 0) > 0) {
    linhas.push({
      chave: "responder",
      icone: "responder",
      tom: "warning",
      texto: `${plural(c.responder!, "conversa aguardando resposta", "conversas aguardando resposta")}`,
      to: "/atendimento",
      pergunta: "Quem está esperando minha resposta?",
    });
  }
  if ((c.novos ?? 0) > 0) {
    linhas.push({
      chave: "novos",
      icone: "novos",
      tom: "info",
      texto: `${plural(c.novos!, "cliente novo sem primeiro contato", "clientes novos sem primeiro contato")}`,
      to: "/atendimento",
      pergunta: "Quais clientes novos ainda não recebi contato?",
    });
  }
  if ((c.esfriando ?? 0) > 0) {
    linhas.push({
      chave: "esfriando",
      icone: "esfriando",
      tom: "neutral",
      texto: `${plural(c.esfriando!, "cliente esfriando", "clientes esfriando")}`,
      to: "/atendimento",
      pergunta: "Quem está esfriando e o que eu digo para cada um?",
    });
  }
  if ((c.docs ?? 0) > 0) {
    linhas.push({
      chave: "docs",
      icone: "docs",
      tom: "neutral",
      texto: `${plural(c.docs!, "pasta travada por documento", "pastas travadas por documento")}`,
      to: "/atendimento",
      pergunta: "Quais pastas estão travadas e o que falta em cada uma?",
    });
  }

  return {
    saudacao: saudacaoSamiQ(dados.agora),
    linhas,
    vazio: linhas.length === 0,
    geradoEm: dados.agora.toISOString(),
  };
}

/** Texto de uma linha só — o mesmo resumo que o alerta diário do banco usa. */
export function resumirBriefingSamiQ(b: BriefingSamiQ): string {
  if (b.vazio) return "Tudo em dia por aqui.";
  return b.linhas.map((l) => l.texto).join(" · ");
}
