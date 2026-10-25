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
    corretor: z.object({ nome: texto(120).min(1), foto_url: z.string().url().nullable(), whatsapp: z.string().regex(/^\d{12,13}$/).nullable() }),
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
