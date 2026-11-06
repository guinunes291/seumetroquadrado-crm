// Disparo da base do corretor — leitura da planilha e contrato da importação.
//
// Puro (só zod) para o teste cobrir sem montar tela nem banco. As regras de
// quem pode entrar moram no banco (importar_base_corretor_lote, migration
// 20261102120000); aqui ficam o formato das linhas, a validação do que o
// banco devolve (fail-closed) e os textos que o corretor lê.

import { z } from "zod";

/** Linhas por chamada (o banco recusa acima disso). */
export const LOTE_IMPORTACAO = 500;

export type LinhaBase = {
  linha: number;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  zona: string | null;
  renda: string | null;
};

/** Nomes de coluna aceitos (sem acento, minúsculo). A planilha do corretor
 *  vem de todo lugar: celular, WhatsApp, "Nome completo"… */
const COLUNAS: Record<keyof Omit<LinhaBase, "linha">, readonly string[]> = {
  nome: ["nome", "nome completo", "cliente", "contato"],
  telefone: ["telefone", "celular", "whatsapp", "whats", "fone", "tel", "telefone 1"],
  email: ["email", "e-mail"],
  zona: ["zona", "regiao", "região"],
  renda: ["renda", "renda familiar", "faixa de renda"],
};

const ZONAS: Record<string, string> = {
  "zona leste": "Leste",
  leste: "Leste",
  "zona oeste": "Oeste",
  oeste: "Oeste",
  "zona norte": "Norte",
  norte: "Norte",
  "zona sul": "Sul",
  sul: "Sul",
  centro: "Centro",
  "grande sp": "Grande SP",
};

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function texto(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function pegar(row: Record<string, unknown>, nomes: readonly string[]): string | null {
  const alvo = new Set(nomes.map(normalizar));
  const k = Object.keys(row).find((c) => alvo.has(normalizar(c)));
  return k ? texto(row[k]) : null;
}

/** Linhas da planilha → linhas do disparo (linha 1 é o cabeçalho). */
export function linhasDaPlanilha(rows: Record<string, unknown>[]): LinhaBase[] {
  return rows
    .map((r, i) => {
      const zona = pegar(r, COLUNAS.zona);
      return {
        linha: i + 2,
        nome: pegar(r, COLUNAS.nome),
        telefone: pegar(r, COLUNAS.telefone),
        email: pegar(r, COLUNAS.email),
        zona: zona ? (ZONAS[normalizar(zona)] ?? null) : null,
        renda: pegar(r, COLUNAS.renda),
      };
    })
    .filter((l) => l.nome || l.telefone);
}

/** A planilha precisa ter, no mínimo, colunas de nome e telefone. */
export function colunasFaltando(rows: Record<string, unknown>[]): string[] {
  const cab = new Set(Object.keys(rows[0] ?? {}).map(normalizar));
  const tem = (nomes: readonly string[]) => nomes.some((n) => cab.has(normalizar(n)));
  const faltam: string[] = [];
  if (!tem(COLUNAS.nome)) faltam.push("Nome");
  if (!tem(COLUNAS.telefone)) faltam.push("Telefone");
  return faltam;
}

const MOTIVOS = [
  "outra_carteira",
  "ja_no_crm",
  "pediu_para_sair",
  "repetido_na_planilha",
  "limite_do_disparo",
] as const;
export type MotivoBloqueio = (typeof MOTIVOS)[number];

export const ROTULO_MOTIVO: Record<MotivoBloqueio, string> = {
  outra_carteira: "Cliente de outro corretor",
  ja_no_crm: "Já está no CRM (sem ser seu)",
  pediu_para_sair: "Pediu para não receber mensagens",
  repetido_na_planilha: "Repetido na planilha",
  limite_do_disparo: "Passou do limite do disparo",
};

const linhaRetorno = z.object({
  linha: z.number().int(),
  nome: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  motivo: z.string(),
});

const resultadoSchema = z.object({
  novos: z.number().int().nonnegative(),
  ja_na_carteira: z.number().int().nonnegative(),
  bloqueados: z.array(linhaRetorno.extend({ motivo: z.enum(MOTIVOS) })),
  erros: z.array(linhaRetorno),
});

export type ResultadoImportacao = z.infer<typeof resultadoSchema>;

/** Fail-closed: fora do contrato vira null e a server function acusa erro. */
export function lerResultadoImportacao(data: unknown): ResultadoImportacao | null {
  const r = resultadoSchema.safeParse(data);
  return r.success ? r.data : null;
}

export function somarResultados(
  a: ResultadoImportacao,
  b: ResultadoImportacao,
): ResultadoImportacao {
  return {
    novos: a.novos + b.novos,
    ja_na_carteira: a.ja_na_carteira + b.ja_na_carteira,
    bloqueados: [...a.bloqueados, ...b.bloqueados],
    erros: [...a.erros, ...b.erros],
  };
}

export const RESULTADO_VAZIO: ResultadoImportacao = {
  novos: 0,
  ja_na_carteira: 0,
  bloqueados: [],
  erros: [],
};

/** Bloqueios agrupados por motivo, na ordem da lista (para o resumo). */
export function bloqueiosPorMotivo(
  r: ResultadoImportacao,
): { motivo: MotivoBloqueio; qtd: number }[] {
  return MOTIVOS.map((motivo) => ({
    motivo,
    qtd: r.bloqueados.filter((b) => b.motivo === motivo).length,
  })).filter((x) => x.qtd > 0);
}

/** Uma frase para o toast: o que entrou no disparo. */
export function resumoImportacao(r: ResultadoImportacao): string {
  const entram = r.novos + r.ja_na_carteira;
  const fora = r.bloqueados.length + r.erros.length;
  const base = `${entram} contato${entram === 1 ? "" : "s"} no disparo`;
  return fora ? `${base}; ${fora} ficaram de fora.` : `${base}.`;
}

// ---------------------------------------------------------------------------
// Status do item (o funil do disparo)
// ---------------------------------------------------------------------------

export const ETAPAS_ITEM = [
  "na_fila",
  "enviado",
  "entregue",
  "lido",
  "respondeu",
  "qualificado",
  "falha",
  "saiu",
] as const;
export type StatusItem = (typeof ETAPAS_ITEM)[number];

export const ROTULO_ITEM: Record<StatusItem, string> = {
  na_fila: "Na fila",
  enviado: "Enviados",
  entregue: "Entregues",
  lido: "Lidos",
  respondeu: "Responderam",
  qualificado: "Qualificados",
  falha: "Falharam",
  saiu: "Pediram para sair",
};

/** Contagem por etapa: quem está numa etapa adiante também passou pelas de trás. */
export function funilDoDisparo(status: readonly string[]): Record<StatusItem, number> {
  const ordem: StatusItem[] = ["enviado", "entregue", "lido", "respondeu", "qualificado"];
  const conta = Object.fromEntries(ETAPAS_ITEM.map((e) => [e, 0])) as Record<StatusItem, number>;
  for (const s of status) {
    if (!(ETAPAS_ITEM as readonly string[]).includes(s)) continue;
    const st = s as StatusItem;
    const idx = ordem.indexOf(st);
    if (idx >= 0) for (const e of ordem.slice(0, idx + 1)) conta[e] += 1;
    else conta[st] += 1;
  }
  return conta;
}
