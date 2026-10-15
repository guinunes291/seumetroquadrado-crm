// Link de agendamento do corretor (estilo "Calendly").
//
// Cada corretor tem UM link fixo (/agendar/<slug>) para mandar no WhatsApp ou
// pôr na bio. O cliente escolhe dia e horário livres, informa nome, telefone,
// e-mail e CPF, e o servidor cria — numa única transação — o lead na carteira
// do corretor já em "Agendado" e a visita na agenda dele.
//
// Este módulo é compartilhado entre a página pública, a tela do corretor e as
// rotas de API: schemas, regras puras e textos. Nada aqui toca o banco.

import { z } from "zod";
import { isValidBrazilPhone, isValidCPF, isValidEmail, onlyDigits } from "@/lib/validators";

/** 16 caracteres base64url = 96 bits: curto para a bio, impossível de enumerar. */
export const AGENDAMENTO_LINK_SLUG_RE = /^[A-Za-z0-9_-]{16}$/;

/** Token do comprovante (.ics): 32 bytes em base64url. Só o SHA-256 vai ao banco. */
export const COMPROVANTE_RE = /^[A-Za-z0-9_-]{43}$/;

/** Lembretes do evento no calendário do cliente: 1 dia antes e 5 horas antes. */
export const LEMBRETES_CLIENTE_MINUTOS = [24 * 60, 5 * 60] as const;

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Fuso das visitas: o atendimento é presencial em São Paulo. */
export const FUSO_AGENDAMENTO = "America/Sao_Paulo";

const HORA_RE = /^([01]\d|2[0-3]):(00|30)$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Nome completo: pelo menos duas palavras com 2+ letras ("Ana Souza"). */
export function isNomeCompleto(nome: string | null | undefined): boolean {
  const partes = (nome ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 2);
  return partes.length >= 2;
}

/** Colapsa espaços e corta nas bordas — o nome vai para o lead como digitado. */
export function limparNome(nome: string): string {
  return nome.replace(/\s+/g, " ").trim();
}

/** DDD + número (10/11 dígitos): tira o 55 de quem cola o número do WhatsApp. */
export function telefoneSemDdi(telefone: string): string {
  const d = onlyDigits(telefone);
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
}

export const agendarPeloLinkSchema = z.object({
  slug: z.string().regex(AGENDAMENTO_LINK_SLUG_RE),
  /** Gerado pela página: reenvio (rede ruim, duplo toque) devolve o mesmo agendamento. */
  idempotency_key: z.string().uuid(),
  nome: z
    .string()
    .max(120)
    .transform(limparNome)
    .refine(isNomeCompleto, "Informe nome e sobrenome."),
  telefone: z
    .string()
    .max(30)
    .refine(isValidBrazilPhone, "Telefone inválido.")
    .transform(telefoneSemDdi),
  email: z
    .string()
    .max(160)
    .transform((v) => v.trim().toLowerCase())
    .refine(isValidEmail, "E-mail inválido."),
  cpf: z
    .string()
    .max(20)
    .refine(isValidCPF, "CPF inválido.")
    .transform((v) => onlyDigits(v)),
  data: z.string().regex(DATA_RE),
  horario: z.string().regex(HORA_RE),
  /** Só vale quando o corretor não pré-preencheu o endereço do link. */
  endereco: z
    .string()
    .max(300)
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .optional(),
  consentimento: z.literal(true),
  /** Honeypot: campo invisível que só robô preenche. */
  website: z.string().max(200).optional(),
});

export type AgendarPeloLinkInput = z.infer<typeof agendarPeloLinkSchema>;

export const configurarAgendamentoLinkSchema = z
  .object({
    endereco: z
      .string()
      .max(300)
      .transform((v) => v.replace(/\s+/g, " ").trim()),
    /** Stand escolhido no Mapa de Lojas (id estável) — null quando digitado. */
    local_id: z.string().min(1).max(200).nullable(),
    /** "Construtora · Stand", mostrado ao cliente; vazio quando digitado. */
    local_nome: z
      .string()
      .max(160)
      .transform((v) => v.replace(/\s+/g, " ").trim()),
    hora_inicio: z.string().regex(HORA_RE),
    hora_fim: z.string().regex(HORA_RE),
    dias_semana: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Escolha pelo menos um dia.")
      .max(7)
      .transform((dias) => [...new Set(dias)].sort((a, b) => a - b)),
    duracao_minutos: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  })
  .refine((v) => v.hora_inicio <= v.hora_fim, {
    path: ["hora_fim"],
    message: "O último horário precisa ser depois do primeiro.",
  });

export type ConfigurarAgendamentoLinkInput = z.infer<typeof configurarAgendamentoLinkSchema>;

export type DisponibilidadeDia = { data: string; horarios: string[] };

/** O que a página pública recebe: nada sobre os clientes do corretor. */
export type AgendamentoLinkPublico = {
  corretor_nome: string;
  endereco: string | null;
  /** "Construtora · Stand" quando o link foi criado a partir do Mapa de Lojas. */
  local_nome: string | null;
  duracao_minutos: number;
  disponibilidade: DisponibilidadeDia[];
};

/** Confirmação devolvida depois de agendar (também alimenta o .ics). */
export type AgendamentoConfirmado = {
  agendamento_id: string;
  inicio: string;
  fim: string;
  endereco: string;
  local_nome: string | null;
  corretor_nome: string;
  corretor_whatsapp: string | null;
  /** Token do comprovante: baixa o .ics pelo servidor (iPhone/WhatsApp). */
  comprovante: string;
};

export type AgendamentoLinkResumo = {
  id: string;
  slug: string;
  path: string;
  endereco: string;
  local_id: string | null;
  local_nome: string;
  hora_inicio: string;
  hora_fim: string;
  dias_semana: number[];
  duracao_minutos: number;
  created_at: string;
  total_agendamentos: number;
  ultimo_agendamento_em: string | null;
};

const resumoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(AGENDAMENTO_LINK_SLUG_RE),
  endereco: z.string(),
  local_id: z.string().nullable(),
  local_nome: z.string(),
  hora_inicio: z.string().regex(HORA_RE),
  hora_fim: z.string().regex(HORA_RE),
  dias_semana: z.array(z.number().int().min(0).max(6)),
  duracao_minutos: z.number().int(),
  created_at: z.string(),
  total_agendamentos: z.number().int().nonnegative(),
  ultimo_agendamento_em: z.string().nullable(),
});

/** Resumo de um link vindo das RPCs do corretor. */
export function parseAgendamentoLinkResumo(data: unknown): AgendamentoLinkResumo {
  const r = resumoSchema.parse(data);
  return { ...r, path: agendamentoLinkPath(r.slug) };
}

/** Os links ativos do corretor (`meus_agendamento_links`), mais novo primeiro. */
export function parseAgendamentoLinks(data: unknown): AgendamentoLinkResumo[] {
  return z
    .array(z.unknown())
    .parse(data ?? [])
    .map(parseAgendamentoLinkResumo);
}

/** Resposta de `criar_agendamento_link`: o link e se ele já existia (mesmo endereço). */
export function parseLinkCriado(data: unknown): {
  link: AgendamentoLinkResumo;
  jaExistia: boolean;
} {
  const { ja_existia } = z.object({ ja_existia: z.boolean() }).parse(data);
  return { link: parseAgendamentoLinkResumo(data), jaExistia: ja_existia };
}

/** Como o link aparece para o corretor: o stand, senão o endereço. */
export function tituloDoLink(link: Pick<AgendamentoLinkResumo, "local_nome" | "endereco">): string {
  return link.local_nome || link.endereco || "Endereço informado pelo cliente";
}

/** "Seg a Sáb · 09:00–18:00 · 1 hora" — resumo da agenda do link. */
export function resumoAgendaDoLink(
  link: Pick<AgendamentoLinkResumo, "dias_semana" | "hora_inicio" | "hora_fim" | "duracao_minutos">,
): string {
  const dias = [...link.dias_semana].sort((a, b) => a - b);
  const seguidos = dias.length > 2 && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  const rotuloDias =
    dias.length === 7
      ? "Todos os dias"
      : seguidos
        ? `${DIAS_SEMANA[dias[0]]} a ${DIAS_SEMANA[dias[dias.length - 1]]}`
        : dias.map((d) => DIAS_SEMANA[d]).join(", ");
  const duracao =
    link.duracao_minutos < 60
      ? `${link.duracao_minutos} min`
      : link.duracao_minutos % 60 === 0
        ? `${link.duracao_minutos / 60} h`
        : `${Math.floor(link.duracao_minutos / 60)}h${link.duracao_minutos % 60}`;
  return `${rotuloDias} · ${link.hora_inicio}–${link.hora_fim} · ${duracao}`;
}

export const AGENDAMENTO_LINK_DEFAULTS = {
  endereco: "",
  local_id: null,
  local_nome: "",
  hora_inicio: "09:00",
  hora_fim: "18:00",
  dias_semana: [1, 2, 3, 4, 5, 6],
  duracao_minutos: 60,
} as const;

/** Horários de 30 em 30 minutos para os selects da configuração. */
export function opcoesDeHorario(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ["00", "30"]) out.push(`${String(h).padStart(2, "0")}:${m}`);
  }
  return out;
}

export function agendamentoLinkPath(slug: string): string {
  return `/agendar/${slug}`;
}

/** "sábado, 21 de novembro" — rótulo de um dia YYYY-MM-DD, sem depender do fuso do aparelho. */
export function rotuloDia(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(a, m - 1, d, 12)));
}

/** "21/11" + "Sáb" para os chips de dia. */
export function chipDia(data: string): { semana: string; dia: string } {
  const [a, m, d] = data.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
  return {
    semana: DIAS_SEMANA[dow],
    dia: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
  };
}

/** Data e hora de um instante no fuso das visitas: "sábado, 21 de novembro às 10:00". */
export function rotuloInstante(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: FUSO_AGENDAMENTO,
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_AGENDAMENTO,
  }).format(d);
  return `${dia} às ${hora}`;
}

/** Mensagem pronta para o corretor mandar o link no WhatsApp. */
export function mensagemConviteAgendamento(
  url: string,
  nomeCorretor: string | null,
  localNome: string | null = null,
): string {
  const quem = nomeCorretor ? `Aqui é ${nomeCorretor.split(" ")[0]}, da Seu Metro Quadrado. ` : "";
  const onde = localNome ? ` no ${localNome}` : "";
  return `Olá! ${quem}Escolha o melhor dia e horário para a sua visita${onde} por este link — leva menos de 1 minuto: ${url}`;
}

/** Descrição do evento no calendário do cliente (sem dados pessoais dele). */
export function descricaoEventoCliente(
  c: Pick<AgendamentoConfirmado, "corretor_nome" | "corretor_whatsapp"> &
    Partial<Pick<AgendamentoConfirmado, "local_nome">>,
): string {
  const linhas = [
    `Visita agendada com ${c.corretor_nome} (Seu Metro Quadrado).`,
    ...(c.local_nome ? [`Local: ${c.local_nome}`] : []),
    "Leve um documento com foto. Se precisar remarcar, avise o corretor.",
  ];
  if (c.corretor_whatsapp)
    linhas.push(`WhatsApp do corretor: https://wa.me/${c.corretor_whatsapp}`);
  return linhas.join("\n");
}

export function tituloEventoCliente(corretorNome: string): string {
  return `Visita com ${corretorNome.split(" ")[0]} — Seu Metro Quadrado`;
}

/** Texto de erro para cada código das APIs (público e corretor). */
export const MENSAGENS_ERRO_AGENDAMENTO: Record<string, string> = {
  account_inactive: "Sua conta está pendente ou bloqueada.",
  forbidden: "Você não tem permissão para esta ação.",
  invalid_input: "Confira os dados informados.",
  not_found: "Este link de agendamento não está mais disponível.",
  rate_limited: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.",
  limite_link: "Este link recebeu muitos agendamentos hoje. Fale direto com o corretor.",
  horario_indisponivel: "Esse horário acabou de ser ocupado. Escolha outro, por favor.",
  horario_invalido: "Escolha um horário disponível na lista.",
  endereco_obrigatorio: "Informe o endereço da visita.",
  // Genérica de propósito: a página não confirma quem já é cliente de quem.
  nao_permitido:
    "Não foi possível concluir o agendamento por aqui. Fale direto com o seu corretor.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
};

export function mensagemErroAgendamento(code: string | undefined | null): string {
  return (
    MENSAGENS_ERRO_AGENDAMENTO[code ?? ""] ?? "Não foi possível concluir agora. Tente novamente."
  );
}
