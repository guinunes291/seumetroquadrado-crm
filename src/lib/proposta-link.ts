import { z } from "zod";

// Regras puras do Link de Proposta (snapshot enviado ao cliente).
// O snapshot nunca carrega telefone, CPF ou e-mail do lead: só o primeiro nome.

export const PROPOSTA_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const PROPOSTA_MAX_FLUXOS = 3;
export const PROPOSTA_VALIDADE_PADRAO_DIAS = { proposta: 15, apresentacao: 30 } as const;
export const PROPOSTA_SESSAO_NOVA_APOS_MIN = 30;

export const BLOCOS_APRESENTACAO = [
  "capa",
  "corretor",
  "empreendimento",
  "diferenciais",
  "localizacao",
  "plantas",
  "visita",
] as const;
export const BLOCOS_PROPOSTA = [
  "capa",
  "corretor",
  "empreendimento",
  "diferenciais",
  "localizacao",
  "plantas",
  "unidade",
  "fluxo",
  "validade",
  "aceite",
] as const;
export type BlocoId = (typeof BLOCOS_PROPOSTA)[number] | "visita";

const texto = (max: number) => z.string().trim().max(max);
const dinheiro = z.number().nonnegative().max(100_000_000);

export const fluxoSchema = z.object({
  titulo: texto(60).min(1),
  valor_total: dinheiro,
  ato: dinheiro.default(0),
  mensais: z.object({ quantidade: z.number().int().min(0).max(120), valor: dinheiro }).nullable().default(null),
  anuais: z.object({ quantidade: z.number().int().min(0).max(20), valor: dinheiro }).nullable().default(null),
  financiamento: dinheiro.default(0),
  fgts: dinheiro.nullable().default(null),
  subsidio: dinheiro.nullable().default(null),
});

export const snapshotSchema = z
  .object({
    modelo: z.enum(["apresentacao", "proposta"]),
    cliente_primeiro_nome: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .refine((v) => !/[\d@]/.test(v) && !/\s/.test(v), "Só o primeiro nome"),
    corretor: z.object({ nome: texto(120).min(1), foto_url: z.string().nullable(), whatsapp: z.string().regex(/^\d{12,13}$/).nullable(), creci: texto(30).nullable().default(null) }),
    projeto: z.object({
      id: z.string().uuid().nullable(),
      nome: texto(200).min(1),
      construtora: texto(200).nullable(),
      capa_url: z.string().nullable(),
      fotos: z.array(z.string()).max(12).default([]),
      diferenciais: z.array(texto(240)).max(30).default([]),
      entrega: texto(80).nullable(),
      endereco: texto(300).nullable(),
      preco_a_partir: dinheiro.nullable(),
    }),
    plantas: z.array(z.object({ titulo: texto(80), imagem_url: z.string(), metragem: z.number().positive().max(2000).nullable() })).max(8).default([]),
    unidade: z.object({ identificacao: texto(60).min(1), tipologia: texto(80).nullable(), metragem: z.number().positive().max(2000).nullable(), planta_url: z.string().nullable() }).nullable().default(null),
    fluxos: z.array(fluxoSchema).max(PROPOSTA_MAX_FLUXOS).default([]),
    blocos: z.array(z.string()).min(1).max(12),
  })
  .superRefine((s, ctx) => {
    if (s.modelo === "apresentacao" && (s.fluxos.length > 0 || s.unidade)) {
      ctx.addIssue({ code: "custom", path: ["fluxos"], message: "Apresentação não leva valores." });
    }
    if (s.modelo === "proposta" && s.fluxos.length === 0) {
      ctx.addIssue({ code: "custom", path: ["fluxos"], message: "Proposta precisa de pelo menos um fluxo." });
    }
  });

export type PropostaSnapshot = z.infer<typeof snapshotSchema>;

/** Remove blocos sem dado: nada de bloco vazio na página. */
export function blocosVisiveis(s: PropostaSnapshot): string[] {
  const temDado: Record<string, boolean> = {
    capa: true,
    corretor: true,
    empreendimento: true,
    diferenciais: s.projeto.diferenciais.length > 0,
    localizacao: !!s.projeto.endereco,
    plantas: s.plantas.length > 0,
    unidade: !!s.unidade,
    fluxo: s.fluxos.length > 0,
    validade: s.modelo === "proposta",
    aceite: s.modelo === "proposta" && s.fluxos.length > 0,
    visita: s.modelo === "apresentacao",
  };
  const permitidos: readonly string[] = s.modelo === "proposta" ? BLOCOS_PROPOSTA : BLOCOS_APRESENTACAO;
  return s.blocos.filter((b, i) => permitidos.includes(b) && temDado[b] && s.blocos.indexOf(b) === i);
}

export function primeiroNome(nome: string | null | undefined): string {
  const p = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  return p.replace(/[\d@]/g, "").slice(0, 40) || "Cliente";
}

/** Status mostrado ao corretor. */
export function statusProposta(p: {
  revogado_em: string | null;
  aceita_em: string | null;
  expira_em: string | null;
  total_aberturas: number;
  leitura_pct: number | null;
}, agora = new Date()): string {
  if (p.aceita_em) return "Aceita";
  if (p.revogado_em) return "Revogada";
  if (p.expira_em && new Date(p.expira_em) <= agora) return "Expirada";
  if (p.total_aberturas === 0) return "Enviada";
  if (p.leitura_pct != null && p.leitura_pct > 0) return `Lida ${Math.round(p.leitura_pct)}%`;
  return "Aberta";
}

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/**
 * Validade máxima (mesma regra da função proposta_validade_maxima no banco).
 * Proposta: dia 4 do mês seguinte às 23:59:59 de Brasília ou envio + 15 dias,
 * o que vencer primeiro. Apresentação: 30 dias. O corretor só pode encurtar.
 */
export function validadeMaxima(modelo: "proposta" | "apresentacao", agora = new Date()): Date {
  const dia = 86_400_000;
  if (modelo === "apresentacao") return new Date(agora.getTime() + 30 * dia);
  const brt = new Date(agora.getTime() - 3 * 3_600_000); // Brasília, sem horário de verão
  const dia4 = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth() + 1, 4, 23 + 3, 59, 59);
  return new Date(Math.min(dia4, agora.getTime() + 15 * dia));
}

/** Segundos em "hh:mm" (horas e minutos). */
export function hhmm(segundos: number): string {
  const m = Math.max(0, Math.round(segundos / 60));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Soma o tempo por seção de várias sessões. */
export function somarTempoPorSecao(sessoes: { tempo_por_secao: unknown }[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const s of sessoes) {
    const t = s.tempo_por_secao;
    if (!t || typeof t !== "object") continue;
    for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) total[k] = (total[k] ?? 0) + v;
    }
  }
  return total;
}

export const ROTULO_BLOCO: Record<string, string> = {
  capa: "Capa",
  corretor: "Seu corretor",
  empreendimento: "Empreendimento",
  diferenciais: "Diferenciais",
  localizacao: "Localização",
  plantas: "Plantas",
  unidade: "Unidade",
  fluxo: "Fluxo de pagamento",
  validade: "Validade",
  aceite: "Aceite",
  visita: "Visita",
};

/** Mensagem curta e humana para o WhatsApp, sem travessão. */
export function mensagemWhatsappProposta(
  modelo: "apresentacao" | "proposta",
  primeiro: string,
  projeto: string,
  url: string,
): string {
  const nome = primeiro && primeiro !== "Cliente" ? `Oi, ${primeiro}!` : "Oi!";
  return modelo === "proposta"
    ? `${nome} Preparei sua proposta do ${projeto} com a unidade e o fluxo que conversamos. Dá uma olhada com calma: ${url}`
    : `${nome} Separei uma apresentação do ${projeto} para você conhecer antes da visita. Dá uma olhada com calma: ${url}`;
}

/** Telefone do lead em dígitos para wa.me (com 55). */
export function telefoneWaMe(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

/** Imagens enviadas ficam no bucket privado; o snapshot guarda "midia:<caminho>". */
export const MIDIA_PREFIXO = "midia:";

/** Domínio publicado do CRM: todo link enviado ao cliente usa este endereço, nunca o de prévia. */
export const CRM_URL_PUBLICA = "https://seumetroquadrado-crm.lovable.app";
export const urlPublicaProposta = (path: string) => `${CRM_URL_PUBLICA}${path}`;

export const TEXTO_LEGAL_ACEITE =
  "O aceite registra seu interesse e a condição apresentada. Valores sujeitos à análise de crédito e à disponibilidade da unidade. Não substitui o contrato da construtora.";

/** Código curto do comprovante, derivado do hash do snapshot aceito. */
export function codigoVerificacao(snapshotHash: string): string {
  const h = (snapshotHash ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase().slice(0, 8).padEnd(8, "0");
  return `${h.slice(0, 4)}-${h.slice(4)}`;
}

/** CPF mostrando só os 3 últimos dígitos. */
export function cpfMascarado(final3: string): string {
  return `***.***.**${final3.slice(0, 1)}-${final3.slice(1)}`;
}

export function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}
