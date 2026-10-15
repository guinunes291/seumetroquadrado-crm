// Servidor do link de documentação: a única ponte entre as páginas públicas e
// o banco. Roda com a service role e chama só as RPCs estreitas da migration
// 20261024120000 (tabelas fechadas para anon/authenticated).
//
// Nunca registrar request/body nem nome de arquivo: carregam nome, telefone,
// e-mail, CPF e documentos do cliente.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ARQUIVO_MAX_BYTES,
  ARQUIVO_MIME_EXTENSAO,
  DOCUMENTACAO_LINK_SLUG_RE,
  PASTA_TOKEN_RE,
  mimePelaAssinatura,
  nomeDeArquivoSeguro,
  pastaPublicaSchema,
  tipoDoCliente,
  tiposDoPerfil,
  type IniciarDocumentacaoInput,
  type PastaPublica,
  type PerfilPastaInput,
} from "@/lib/documentacao-link";
import { maskPhoneBR } from "@/lib/masks";

const BUCKET = "documentacao";

export class DocumentacaoLinkError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "DocumentacaoLinkError";
  }
}

const recusaSchema = z.object({ ok: z.literal(false), motivo: z.string().max(60) });

/** Motivos de negócio que as RPCs devolvem e viram 4xx com código estável. */
const STATUS_DO_MOTIVO: Record<string, number> = {
  invalid_input: 422,
  not_found: 404,
  limite_link: 429,
  limite_pasta: 429,
  limite_item: 409,
  item_invalido: 409,
  nao_permitido: 409,
};

function recusa(data: unknown, falha: string): DocumentacaoLinkError | null {
  const r = recusaSchema.safeParse(data);
  if (!r.success) return null;
  const status = STATUS_DO_MOTIVO[r.data.motivo] ?? 500;
  return new DocumentacaoLinkError(status, status === 500 ? falha : r.data.motivo);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function exigirSlug(slug: string): string {
  if (!DOCUMENTACAO_LINK_SLUG_RE.test(slug)) throw new DocumentacaoLinkError(404, "not_found");
  return slug;
}

function exigirToken(token: string): string {
  if (!PASTA_TOKEN_RE.test(token)) throw new DocumentacaoLinkError(404, "not_found");
  return token;
}

function resultadoDoLimite(data: unknown, error: unknown): void {
  if (error) throw new DocumentacaoLinkError(503, "limit_unavailable");
  if (data === "not_found") throw new DocumentacaoLinkError(404, "not_found");
  if (data === "rate_limited") throw new DocumentacaoLinkError(429, "rate_limited");
  if (data !== "allowed") throw new DocumentacaoLinkError(500, "limit_failed");
}

/** Limite distribuído por link fixo, antes de qualquer leitura ou escrita. */
export async function consumirLink(slug: string): Promise<void> {
  const db = await admin();
  const { data, error } = await db.rpc("consumir_documentacao_link_requisicao", {
    _slug: exigirSlug(slug),
  });
  resultadoDoLimite(data, error);
}

/** Limite distribuído por pasta, antes de qualquer leitura ou escrita. */
export async function consumirPasta(token: string): Promise<void> {
  const db = await admin();
  const { data, error } = await db.rpc("consumir_documentacao_pasta_requisicao", {
    _token: exigirToken(token),
  });
  resultadoDoLimite(data, error);
}

export async function carregarLink(slug: string): Promise<{ corretor_nome: string }> {
  const db = await admin();
  const { data, error } = await db.rpc("obter_documentacao_link_publico", {
    _slug: exigirSlug(slug),
  });
  if (error) throw new DocumentacaoLinkError(503, "load_unavailable");
  const parsed = z.object({ corretor_nome: z.string().min(1).max(200) }).safeParse(data);
  if (!parsed.success) throw new DocumentacaoLinkError(404, "not_found");
  return parsed.data;
}

/** O cadastro pelo link fixo: devolve o token da pasta do cliente. */
export async function iniciar(input: IniciarDocumentacaoInput): Promise<{ token: string }> {
  // Honeypot preenchido: responde como recusa comum, sem tocar no banco.
  if (input.website) throw new DocumentacaoLinkError(422, "invalid_input");
  const db = await admin();
  const { data, error } = await db.rpc("iniciar_documentacao_pelo_link", {
    _slug: exigirSlug(input.slug),
    _nome: input.nome,
    _telefone: maskPhoneBR(input.telefone),
    _email: input.email,
    _cpf: input.cpf,
    _perfil: input.perfil,
    _casado: input.casado,
    _usa_fgts: input.usa_fgts,
    _declara_ir: input.declara_ir,
    _tipos: tiposDoPerfil(input),
  });
  if (error) throw new DocumentacaoLinkError(503, "start_unavailable");
  const r = recusa(data, "start_failed");
  if (r) throw r;
  const ok = z
    .object({ ok: z.literal(true), token: z.string().regex(PASTA_TOKEN_RE) })
    .safeParse(data);
  if (!ok.success) throw new DocumentacaoLinkError(500, "start_failed");
  return { token: ok.data.token };
}

function pastaDe(data: unknown): PastaPublica {
  const parsed = pastaPublicaSchema.safeParse(data);
  if (!parsed.success) throw new DocumentacaoLinkError(503, "payload_unavailable");
  return parsed.data;
}

export async function carregarPasta(token: string): Promise<PastaPublica> {
  const db = await admin();
  const { data, error } = await db.rpc("obter_pasta_publica", { _token: exigirToken(token) });
  if (error) throw new DocumentacaoLinkError(503, "load_unavailable");
  if (data == null) throw new DocumentacaoLinkError(404, "not_found");
  return pastaDe(data);
}

/** O cliente que chegou pelo link da aba responde o perfil: entra a lista. */
export async function definirPerfil(input: PerfilPastaInput): Promise<PastaPublica> {
  const db = await admin();
  const { data, error } = await db.rpc("definir_perfil_pasta", {
    _token: exigirToken(input.token),
    _perfil: input.perfil,
    _casado: input.casado,
    _usa_fgts: input.usa_fgts,
    _declara_ir: input.declara_ir,
    _tipos: tiposDoPerfil(input),
  });
  if (error) throw new DocumentacaoLinkError(503, "profile_unavailable");
  const r = recusa(data, "profile_failed");
  if (r) throw r;
  return pastaDe(data);
}

export type AlvoDoArquivo = { documentacaoId: string } | { tipo: string };

/**
 * Um arquivo para a pasta: confere o conteúdo (assinatura, não o tipo
 * declarado), valida no banco, sobe ao bucket privado com nome aleatório e
 * registra a versão. Se o registro falhar, o objeto sai do bucket.
 */
export async function enviarArquivo(
  token: string,
  alvo: AlvoDoArquivo,
  arquivo: File,
): Promise<{ documentacao_id: string; versao: number }> {
  exigirToken(token);
  if (arquivo.size < 1 || arquivo.size > ARQUIVO_MAX_BYTES) {
    throw new DocumentacaoLinkError(413, "arquivo_grande");
  }
  if ("tipo" in alvo && !tipoDoCliente(alvo.tipo)) {
    throw new DocumentacaoLinkError(409, "item_invalido");
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const mime = mimePelaAssinatura(bytes.subarray(0, 16));
  const extensao = mime ? ARQUIVO_MIME_EXTENSAO[mime] : undefined;
  if (!mime || !extensao) throw new DocumentacaoLinkError(415, "arquivo_invalido");

  const documentacaoId = "documentacaoId" in alvo ? alvo.documentacaoId : undefined;
  const tipo = "tipo" in alvo ? alvo.tipo : undefined;
  const db = await admin();
  const { data: v, error: vError } = await db.rpc("validar_upload_pasta", {
    _token: token,
    _documentacao_id: documentacaoId,
    _tipo: tipo,
  });
  if (vError) throw new DocumentacaoLinkError(503, "upload_unavailable");
  const r = recusa(v, "upload_failed");
  if (r) throw r;
  const ok = z.object({ ok: z.literal(true), lead_id: z.string().uuid() }).safeParse(v);
  if (!ok.success) throw new DocumentacaoLinkError(500, "upload_failed");

  const novoId = documentacaoId ? undefined : randomUUID();
  const objectPath = `${ok.data.lead_id}/${documentacaoId ?? novoId}/${randomUUID()}.${extensao}`;
  const { error: upError } = await db.storage.from(BUCKET).upload(objectPath, bytes, {
    cacheControl: "0",
    contentType: mime,
    upsert: false,
  });
  if (upError) {
    console.error("[documentacao-publica] upload ao storage falhou");
    throw new DocumentacaoLinkError(502, "upload_failed");
  }

  const { data: reg, error: regError } = await db.rpc("registrar_upload_pasta", {
    _token: token,
    _object_path: objectPath,
    _nome_original: nomeDeArquivoSeguro(arquivo.name, extensao),
    _mime_type: mime,
    _tamanho_bytes: bytes.byteLength,
    _documentacao_id: documentacaoId,
    _novo_documentacao_id: novoId,
    _tipo: tipo,
  });
  const regRecusa = regError ? null : recusa(reg, "upload_failed");
  const regOk = z
    .object({
      ok: z.literal(true),
      documentacao_id: z.string().uuid(),
      versao: z.number().int().positive(),
    })
    .safeParse(reg);
  if (regError || regRecusa || !regOk.success) {
    await db.storage.from(BUCKET).remove([objectPath]);
    if (regRecusa) throw regRecusa;
    throw new DocumentacaoLinkError(regError ? 503 : 500, "upload_failed");
  }
  return { documentacao_id: regOk.data.documentacao_id, versao: regOk.data.versao };
}
