// Servidor do link de agendamento: a única ponte entre a página pública e o
// banco. Roda com a service role e chama só as RPCs estreitas da migration
// 20261022120000 (tabelas fechadas para anon/authenticated).
//
// Nunca registrar request/body: carregam nome, telefone, e-mail e CPF.

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  AGENDAMENTO_LINK_SLUG_RE,
  COMPROVANTE_RE,
  type AgendamentoConfirmado,
  type AgendamentoLinkPublico,
  type AgendarPeloLinkInput,
} from "@/lib/agendamento-link";
import { maskPhoneBR } from "@/lib/masks";

export class AgendamentoLinkError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "AgendamentoLinkError";
  }
}

export function hashComprovante(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function novoComprovante(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashComprovante(token) };
}

const publicoSchema = z.object({
  corretor_nome: z.string().min(1).max(200),
  endereco: z.string().max(300).nullable(),
  duracao_minutos: z.number().int().min(15).max(240),
  disponibilidade: z
    .array(
      z.object({
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        horarios: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(48),
      }),
    )
    .max(40),
});

const confirmacaoSchema = z.object({
  ok: z.literal(true),
  agendamento_id: z.string().uuid(),
  inicio: z.string(),
  fim: z.string(),
  endereco: z.string(),
  corretor_nome: z.string(),
  corretor_whatsapp: z
    .string()
    .regex(/^\d{12,15}$/)
    .nullable(),
});

const recusaSchema = z.object({ ok: z.literal(false), motivo: z.string().max(60) });

/** Motivos de negócio que a RPC devolve e viram 4xx com código estável. */
const STATUS_DO_MOTIVO: Record<string, number> = {
  invalid_input: 422,
  not_found: 404,
  limite_link: 429,
  horario_indisponivel: 409,
  horario_invalido: 422,
  endereco_obrigatorio: 422,
  nao_permitido: 409,
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function exigirSlug(slug: string): string {
  if (!AGENDAMENTO_LINK_SLUG_RE.test(slug)) throw new AgendamentoLinkError(404, "not_found");
  return slug;
}

/** Limite distribuído por link, antes de qualquer leitura ou escrita. */
export async function consumirRequisicao(slug: string): Promise<void> {
  const db = await admin();
  const { data, error } = await db.rpc("consumir_agendamento_link_requisicao", {
    _slug: exigirSlug(slug),
  });
  if (error) throw new AgendamentoLinkError(503, "limit_unavailable");
  if (data === "not_found") throw new AgendamentoLinkError(404, "not_found");
  if (data === "rate_limited") throw new AgendamentoLinkError(429, "rate_limited");
  if (data !== "allowed") throw new AgendamentoLinkError(500, "limit_failed");
}

export async function carregarLinkPublico(slug: string): Promise<AgendamentoLinkPublico> {
  const db = await admin();
  const { data, error } = await db.rpc("obter_agendamento_link_publico", {
    _slug: exigirSlug(slug),
  });
  if (error) throw new AgendamentoLinkError(503, "load_unavailable");
  if (data == null) throw new AgendamentoLinkError(404, "not_found");
  const parsed = publicoSchema.safeParse(data);
  if (!parsed.success) throw new AgendamentoLinkError(503, "payload_unavailable");
  return parsed.data;
}

export async function agendarPeloLink(input: AgendarPeloLinkInput): Promise<AgendamentoConfirmado> {
  // Honeypot preenchido: responde como recusa comum, sem tocar no banco.
  if (input.website) throw new AgendamentoLinkError(422, "invalid_input");

  const { token, hash } = novoComprovante();
  const db = await admin();
  const { data, error } = await db.rpc("agendar_pelo_link", {
    _slug: exigirSlug(input.slug),
    _idempotency_key: input.idempotency_key,
    _nome: input.nome,
    _telefone: maskPhoneBR(input.telefone),
    _email: input.email,
    _cpf: input.cpf,
    _data: input.data,
    _horario: input.horario,
    _endereco: input.endereco ?? "",
    _comprovante_hash: hash,
  });
  if (error) throw new AgendamentoLinkError(503, "schedule_unavailable");

  const recusa = recusaSchema.safeParse(data);
  if (recusa.success) {
    const status = STATUS_DO_MOTIVO[recusa.data.motivo] ?? 500;
    throw new AgendamentoLinkError(status, status === 500 ? "schedule_failed" : recusa.data.motivo);
  }
  const ok = confirmacaoSchema.safeParse(data);
  if (!ok.success) throw new AgendamentoLinkError(500, "schedule_failed");
  const { ok: _ok, ...confirmacao } = ok.data;
  return { ...confirmacao, comprovante: token };
}

/** Dados do .ics pelo token do comprovante (a visita como está agora). */
export async function obterComprovante(
  token: string,
): Promise<Omit<AgendamentoConfirmado, "comprovante">> {
  if (!COMPROVANTE_RE.test(token)) throw new AgendamentoLinkError(404, "not_found");
  const db = await admin();
  const { data, error } = await db.rpc("obter_agendamento_comprovante", {
    _comprovante_hash: hashComprovante(token),
  });
  if (error) throw new AgendamentoLinkError(503, "load_unavailable");
  const ok = confirmacaoSchema.safeParse(data);
  if (!ok.success) throw new AgendamentoLinkError(404, "not_found");
  const { ok: _ok, ...confirmacao } = ok.data;
  return confirmacao;
}
