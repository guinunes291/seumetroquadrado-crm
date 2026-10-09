// A conta do cartão da visita no Modo Visita (identidade Lançamento, como no
// vídeo de lançamento): o rótulo "VISITA EM CAMPO · HOJE 14:00" e o briefing
// de 30 segundos em duas frases. Pura, para ser testável sem montar a página
// (tests/modo-visita-lancamento.test.tsx).
//
// Datas no calendário de São Paulo, não no fuso do aparelho nem no do
// servidor: é o dia do corretor (mesma regra do prazo da cadência). Uma
// visita às 22h não pode virar "amanhã" porque o teste roda em UTC.

import { formatDistanceStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

const FUSO = "America/Sao_Paulo";

const diaSP = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const horaSP = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(
    d,
  );

const semanaSP = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" })
    .format(d)
    .replace(".", "")
    .toUpperCase();

/** "HOJE 14:00", "AMANHÃ 10:00", "ONTEM 18:30" ou "SEX 10/10 · 18:00". */
export function quandoDaVisita(inicioIso: string, agora = new Date()): string {
  const inicio = new Date(inicioIso);
  const dias = Math.round(
    (Date.parse(diaSP(inicio)) - Date.parse(diaSP(agora))) / (24 * 60 * 60 * 1000),
  );
  const hora = horaSP(inicio);
  if (dias === 0) return `HOJE ${hora}`;
  if (dias === 1) return `AMANHÃ ${hora}`;
  if (dias === -1) return `ONTEM ${hora}`;
  const [, mm, dd] = diaSP(inicio).split("-");
  return `${semanaSP(inicio)} ${dd}/${mm} · ${hora}`;
}

/**
 * O estado da visita no rótulo do cartão. Visita cujo horário já passou e
 * não foi concluída é "a validar": enquanto não for concluída aqui, não entra
 * no relatório de visitas (o mesmo aviso do topo da página).
 */
export function estadoDaVisita(
  visita: { data_fim: string },
  concluida: boolean,
  agora = new Date(),
): "VISITA CONCLUÍDA" | "VISITA A VALIDAR" | "VISITA EM CAMPO" {
  if (concluida) return "VISITA CONCLUÍDA";
  if (new Date(visita.data_fim).getTime() < agora.getTime()) return "VISITA A VALIDAR";
  return "VISITA EM CAMPO";
}

function primeiraMaiuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function primeiraMinuscula(t: string): string {
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/**
 * O briefing de 30 segundos em duas frases: como o cliente está e o que ficou
 * combinado — a pergunta que ele faz logo depois do "bom dia" é sobre o que
 * foi prometido da última vez. Ex.: "Morno, último contato há 2 dias.
 * Combinado: apresentar a planta de 2 dorms e simular com FGTS."
 */
export function briefingCurto(
  lead: {
    temperatura: string | null;
    ultima_interacao: string | null;
    proxima_acao: string | null;
  },
  agora = new Date(),
): string {
  const contato = lead.ultima_interacao
    ? `último contato ${formatDistanceStrict(new Date(lead.ultima_interacao), agora, {
        locale: ptBR,
        addSuffix: true,
      })}`
    : "sem contato registrado";
  const temperatura = lead.temperatura?.trim();
  const estado = temperatura
    ? `${primeiraMaiuscula(temperatura)}, ${contato}.`
    : `${primeiraMaiuscula(contato)}.`;

  const combinado = lead.proxima_acao?.trim();
  if (!combinado) return `${estado} Nada combinado no último contato.`;
  const fim = /[.!?]$/.test(combinado) ? "" : ".";
  return `${estado} Combinado: ${primeiraMinuscula(combinado)}${fim}`;
}
