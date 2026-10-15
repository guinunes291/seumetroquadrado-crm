// Link de documentação do cliente (migration 20261024120000).
//
// Dois links: o FIXO do corretor (/documentos/<slug>), onde o cliente informa
// os dados e o perfil de renda — o sistema acha ou cria o lead e abre a pasta
// —, e o PESSOAL da pasta de um lead (/pasta/<token>), onde ele envia os
// arquivos aos poucos (vale 30 dias). O corretor também manda o pessoal pela
// aba Documentação de um lead que já existe.
//
// Este módulo é compartilhado entre as páginas públicas, a tela do corretor e
// as rotas de API: schemas, regras puras e textos. Nada aqui toca o banco.

import { z } from "zod";
import { isNomeCompleto, limparNome, telefoneSemDdi } from "@/lib/agendamento-link";
import {
  DOC_LABEL,
  PERFIL_RENDA,
  checklistPorPerfil,
  docLabel,
  type PerfilRenda,
} from "@/lib/documentacao-checklist";
import { isValidBrazilPhone, isValidCPF, isValidEmail, onlyDigits } from "@/lib/validators";

/** 16 caracteres base64url = 96 bits (o mesmo formato do link de agendamento). */
export const DOCUMENTACAO_LINK_SLUG_RE = /^[A-Za-z0-9_-]{16}$/;

/** Token da pasta: 24 bytes em base64url = 192 bits. */
export const PASTA_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/** Mesmo limite do bucket `documentacao` e do upload do CRM. */
export const ARQUIVO_MAX_BYTES = 15 * 1024 * 1024;

export const ARQUIVO_MIME_EXTENSAO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Itens que o cliente vê e envia: sem a carta de crédito (do banco), sem a
 *  fila "não classificado" (do corretor) e sem o slug legado. */
const FORA_DO_CLIENTE = new Set(["aprovacao_credito", "nao_classificado", "extrato_bancario"]);
export const TIPOS_DO_CLIENTE: readonly string[] = Object.keys(DOC_LABEL).filter(
  (t) => !FORA_DO_CLIENTE.has(t),
);

export function tipoDoCliente(tipo: string): boolean {
  return TIPOS_DO_CLIENTE.includes(tipo);
}

/**
 * Tipo real do arquivo pelos primeiros bytes (assinatura), não pelo que o
 * navegador declarou: um .exe renomeado para .pdf não passa. Devolve o mime
 * aceito ou null.
 */
export function mimePelaAssinatura(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i];
  if (
    bytes.length >= 5 &&
    b(0) === 0x25 &&
    b(1) === 0x50 &&
    b(2) === 0x44 &&
    b(3) === 0x46 &&
    b(4) === 0x2d
  ) {
    return "application/pdf"; // %PDF-
  }
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((v, i) => b(i) === v)) {
    return "image/png";
  }
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (
    bytes.length >= 12 &&
    riff.every((v, i) => b(i) === v) &&
    webp.every((v, i) => b(8 + i) === v)
  ) {
    return "image/webp";
  }
  return null;
}

/** Nome do arquivo para a ficha: sem pasta, sem caractere de controle, até 255. */
export function nomeDeArquivoSeguro(nome: string | null | undefined, extensao: string): string {
  const base = (nome ?? "")
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
  return base || `documento.${extensao}`;
}

// ---------------------------------------------------------------------------
// Schemas das APIs públicas
// ---------------------------------------------------------------------------

const perfilSchema = z.enum(PERFIL_RENDA as [PerfilRenda, ...PerfilRenda[]]);

const respostasSchema = z.object({
  perfil: perfilSchema,
  casado: z.boolean(),
  usa_fgts: z.boolean(),
  declara_ir: z.boolean(),
});

export type RespostasPerfil = z.infer<typeof respostasSchema>;

export const iniciarDocumentacaoSchema = respostasSchema.extend({
  slug: z.string().regex(DOCUMENTACAO_LINK_SLUG_RE),
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
  consentimento: z.literal(true),
  /** Honeypot: campo invisível que só robô preenche. */
  website: z.string().max(200).optional(),
});

export type IniciarDocumentacaoInput = z.infer<typeof iniciarDocumentacaoSchema>;

export const perfilPastaSchema = respostasSchema.extend({
  token: z.string().regex(PASTA_TOKEN_RE),
});

export type PerfilPastaInput = z.infer<typeof perfilPastaSchema>;

/** A lista do perfil, com a mesma função do CRM (a aba Documentação). */
export function tiposDoPerfil(r: RespostasPerfil): string[] {
  return checklistPorPerfil(r.perfil, {
    casado: r.casado,
    usaFgts: r.usa_fgts,
    declaraIr: r.declara_ir,
  }).map((i) => i.tipo);
}

// ---------------------------------------------------------------------------
// A pasta pública
// ---------------------------------------------------------------------------

export type ItemStatus = "pendente" | "recebido" | "aprovado" | "reprovado";

export const itemPastaSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string().min(1).max(40),
  status: z.enum(["pendente", "recebido", "aprovado", "reprovado"]),
  tem_arquivo: z.boolean(),
  atualizado_em: z.string(),
});

export type ItemPasta = z.infer<typeof itemPastaSchema>;

export const pastaPublicaSchema = z.object({
  corretor_nome: z.string().min(1).max(200),
  corretor_whatsapp: z
    .string()
    .regex(/^\d{12,15}$/)
    .nullable(),
  expira_em: z.string(),
  itens: z.array(itemPastaSchema).max(400),
});

export type PastaPublica = z.infer<typeof pastaPublicaSchema>;

/** Como o cliente vê um grupo (um tipo de documento, com 1+ arquivos). */
export type EstadoGrupo = "falta" | "reenviar" | "enviado" | "aprovado";

export type GrupoPasta = {
  tipo: string;
  label: string;
  estado: EstadoGrupo;
  arquivos: number;
  /** Onde o próximo arquivo entra: o item pendente/reprovado; null = item a mais. */
  alvo: string | null;
  /** O item recebido mais recente — "trocar arquivo" vira versão nova dele. */
  trocavel: string | null;
};

/**
 * Agrupa os itens por tipo, na ordem em que aparecem. Pendência primeiro: um
 * grupo com item reprovado pede reenvio; com item pendente, falta; com tudo
 * recebido, foi enviado; com tudo aprovado, está aprovado.
 */
export function agruparItens(itens: ItemPasta[]): GrupoPasta[] {
  const ordem: string[] = [];
  const por = new Map<string, ItemPasta[]>();
  for (const it of itens) {
    if (!por.has(it.tipo)) {
      por.set(it.tipo, []);
      ordem.push(it.tipo);
    }
    por.get(it.tipo)!.push(it);
  }
  return ordem.map((tipo) => {
    const grupo = por.get(tipo)!;
    const reprovado = grupo.find((i) => i.status === "reprovado");
    const pendente = grupo.find((i) => i.status === "pendente");
    const recebidos = grupo.filter((i) => i.status === "recebido");
    const estado: EstadoGrupo = reprovado
      ? "reenviar"
      : pendente
        ? "falta"
        : recebidos.length > 0
          ? "enviado"
          : "aprovado";
    return {
      tipo,
      label: docLabel(tipo),
      estado,
      arquivos: grupo.filter((i) => i.tem_arquivo).length,
      alvo: (reprovado ?? pendente)?.id ?? null,
      trocavel: recebidos.at(-1)?.id ?? null,
    };
  });
}

/** Quantos grupos ainda pedem arquivo do cliente. */
export function gruposPendentes(grupos: GrupoPasta[]): number {
  return grupos.filter((g) => g.estado === "falta" || g.estado === "reenviar").length;
}

// ---------------------------------------------------------------------------
// Tela do corretor
// ---------------------------------------------------------------------------

export const documentacaoLinkResumoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(DOCUMENTACAO_LINK_SLUG_RE),
  created_at: z.string(),
  total_cadastros: z.number().int().nonnegative(),
  ultimo_cadastro_em: z.string().nullable(),
});

export type DocumentacaoLinkResumo = z.infer<typeof documentacaoLinkResumoSchema>;

export const pastaResumoSchema = z.object({
  id: z.string().uuid(),
  token: z.string().regex(PASTA_TOKEN_RE),
  expira_em: z.string(),
  expirada: z.boolean(),
  created_at: z.string(),
  perfil: z.string().nullable(),
  pelo_link_fixo: z.boolean(),
  ultimo_envio_em: z.string().nullable(),
  arquivos_recebidos: z.number().int().nonnegative(),
});

export type PastaResumo = z.infer<typeof pastaResumoSchema>;

export function documentacaoLinkPath(slug: string): string {
  return `/documentos/${slug}`;
}

export function pastaPath(token: string): string {
  return `/pasta/${token}`;
}

const primeiroNome = (nome: string | null | undefined) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

/** Convite do link fixo (para qualquer cliente). */
export function mensagemConviteDocumentos(url: string, nomeCorretor: string | null): string {
  const quem = nomeCorretor ? `Aqui é ${primeiroNome(nomeCorretor)}, da Seu Metro Quadrado. ` : "";
  return `Olá! ${quem}Para adiantar a sua análise de crédito, envie os seus documentos por este link — dá para tirar foto pelo celular e mandar aos poucos: ${url}`;
}

/** Convite do link pessoal da pasta (lead que já existe). */
export function mensagemConvitePasta(
  url: string,
  nomeCliente: string | null,
  nomeCorretor: string | null,
): string {
  const ola = nomeCliente ? `Olá, ${primeiroNome(nomeCliente)}! ` : "Olá! ";
  const quem = nomeCorretor ? `Aqui é ${primeiroNome(nomeCorretor)}, da Seu Metro Quadrado. ` : "";
  return `${ola}${quem}Este é o link da sua pasta de documentos: é só abrir, tirar foto ou anexar o PDF de cada item. Pode mandar aos poucos — o link fica valendo por 30 dias: ${url}`;
}

/** Texto de erro para cada código das APIs (público e corretor). */
export const MENSAGENS_ERRO_DOCUMENTACAO: Record<string, string> = {
  invalid_input: "Confira os dados informados.",
  not_found: "Este link não está mais disponível. Peça um novo ao seu corretor.",
  rate_limited: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.",
  limite_link: "Este link recebeu muitos cadastros hoje. Fale direto com o corretor.",
  limite_pasta: "Muitos arquivos em pouco tempo. Aguarde um pouco e continue.",
  limite_item: "Este item já tem arquivos demais. Fale com o seu corretor.",
  item_invalido: "Este item não aceita mais arquivos. Atualize a página.",
  arquivo_invalido: "Envie foto (JPG, PNG ou WebP) ou PDF de até 15 MB.",
  arquivo_grande: "O arquivo passa de 15 MB. Tire outra foto ou envie um PDF menor.",
  // Genérica de propósito: a página não confirma quem já é cliente de quem.
  nao_permitido: "Não foi possível abrir a sua pasta por aqui. Fale direto com o seu corretor.",
};

export function mensagemErroDocumentacao(code: string | undefined | null): string {
  return (
    MENSAGENS_ERRO_DOCUMENTACAO[code ?? ""] ?? "Não foi possível concluir agora. Tente novamente."
  );
}
