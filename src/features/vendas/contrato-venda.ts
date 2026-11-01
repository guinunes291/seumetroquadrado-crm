// Venda por contrato (IA) — a parte PURA, sem banco nem navegador. Este
// arquivo valida o que o modelo devolve (servidor) e define os tipos; a
// seleção de páginas e o lado do cliente moram nos vizinhos e são reexportados
// daqui, para quem importa ter um ponto só.

import { z } from "zod";
import { isValidBrazilPhone, isValidCPF, isValidEmail, onlyDigits } from "@/lib/validators";
import type { CampoCliente } from "./contrato-venda-cliente";

export * from "./contrato-venda-paginas";
export * from "./contrato-venda-cliente";

// ---------------------------------------------------------------------------
// 2) O que o modelo devolve — tolerante na entrada, estrito na saída
// ---------------------------------------------------------------------------

const PLACEHOLDER = /^(x{3,}|-+|n\/?a|null|nao informado|não informado|\.+)$/i;

const texto = (max: number) =>
  z
    .preprocess((v) => {
      if (v == null) return null;
      const s = String(v).replace(/\s+/g, " ").trim();
      return !s || PLACEHOLDER.test(s) ? null : s.slice(0, max);
    }, z.string().nullable())
    .catch(null);

/** "R$ 351.100,00" | "351100" | 351100 → 351100. Lixo → null. */
export function parseValorContrato(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const valor = z.preprocess(parseValorContrato, z.number().nullable()).catch(null);

const MESES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

/** "2026-10-27" | "27/10/2026" | "27 de outubro de 2026" → "2026-10-27". */
export function parseDataContrato(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let a: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) [a, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [d, m, a] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2}) de ([a-z]+) de (\d{4})$/)) && MESES[r[2]])
    [d, m, a] = [+r[1], MESES[r[2]], +r[3]];
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (a < 1900 || a > 2100) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const data = z.preprocess(parseDataContrato, z.string().nullable()).catch(null);

const enderecoSchema = z
  .object({
    logradouro: texto(160),
    numero: texto(20),
    complemento: texto(80),
    bairro: texto(80),
    cidade: texto(80),
    uf: texto(2),
    cep: texto(12),
  })
  .partial()
  .catch({});

export const ExtracaoContratoSchema = z.object({
  comprador: z
    .object({
      nome: texto(160),
      cpf: texto(20),
      rg: texto(30),
      rg_orgao_emissor: texto(40),
      data_nascimento: data,
      estado_civil: texto(40),
      regime_casamento: texto(80),
      profissao: texto(80),
      nacionalidade: texto(40),
      email: texto(160),
      telefone: texto(30),
      renda_familiar: valor,
      endereco: enderecoSchema,
    })
    .partial()
    .catch({}),
  segundo_comprador: z
    .object({ nome: texto(160), cpf: texto(20) })
    .partial()
    .nullable()
    .catch(null),
  venda: z
    .object({
      construtora: texto(120),
      empreendimento: texto(160),
      unidade: texto(60),
      valor_venda: valor,
      data_assinatura: data,
    })
    .partial()
    .catch({}),
  confianca: z.number().min(0).max(1).catch(0.5),
  observacoes: texto(400),
});

export type ExtracaoContratoBruta = z.infer<typeof ExtracaoContratoSchema>;

/** Dados do cliente como o formulário e o banco usam (string vazia = sem valor). */
export type DadosClienteContrato = {
  nome: string;
  telefone: string; // só dígitos
  email: string;
  cpf: string; // só dígitos
  renda_estimada: string; // número em texto ("8307.34") ou ""
  rg: string;
  rg_orgao_emissor: string;
  data_nascimento: string; // AAAA-MM-DD
  estado_civil: string;
  regime_casamento: string;
  profissao: string;
  nacionalidade: string;
  endereco_logradouro: string;
  endereco_numero: string;
  endereco_complemento: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf: string;
  endereco_cep: string; // só dígitos
  conjuge_nome: string;
  conjuge_cpf: string; // só dígitos
};

export type DadosVendaContrato = {
  construtora: string | null;
  empreendimento: string | null;
  unidade: string | null;
  valorVenda: number | null;
  dataAssinatura: string | null;
};

export type LeituraContrato = {
  cliente: DadosClienteContrato;
  venda: DadosVendaContrato;
  confianca: number;
  observacoes: string | null;
  /** Campos que a IA leu (e passaram na validação): a tela destaca o resto. */
  camposLidos: CampoCliente[];
  /** Avisos determinísticos (CPF inválido descartado etc.). */
  avisos: string[];
};

export const CLIENTE_VAZIO: DadosClienteContrato = {
  nome: "",
  telefone: "",
  email: "",
  cpf: "",
  renda_estimada: "",
  rg: "",
  rg_orgao_emissor: "",
  data_nascimento: "",
  estado_civil: "",
  regime_casamento: "",
  profissao: "",
  nacionalidade: "",
  endereco_logradouro: "",
  endereco_numero: "",
  endereco_complemento: "",
  endereco_bairro: "",
  endereco_cidade: "",
  endereco_uf: "",
  endereco_cep: "",
  conjuge_nome: "",
  conjuge_cpf: "",
};

/** "MARIA DA SILVA" → "Maria da Silva" (preposições minúsculas). */
export function nomeProprio(s: string): string {
  if (s !== s.toUpperCase()) return s; // já veio em caixa mista: respeita
  return s
    .toLowerCase()
    .split(" ")
    .map((p, i) =>
      i > 0 && /^(da|de|do|das|dos|e)$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(" ");
}

function telefoneNacional(v: string | null | undefined): string {
  let d = onlyDigits(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return isValidBrazilPhone(d) ? d : "";
}

/**
 * Validação determinística por cima da leitura: o que não passa vira vazio
 * (e aviso), nunca um valor errado pré-preenchido. `hoje` em AAAA-MM-DD.
 */
export function normalizarLeituraContrato(
  bruta: ExtracaoContratoBruta,
  hoje: string,
): LeituraContrato {
  const c = bruta.comprador ?? {};
  const e = c.endereco ?? {};
  const s = bruta.segundo_comprador ?? null;
  const v = bruta.venda ?? {};
  const avisos: string[] = [];

  const cpf = onlyDigits(c.cpf);
  if (c.cpf && !isValidCPF(cpf)) avisos.push("O CPF lido no contrato não é válido: confira.");
  const telefone = telefoneNacional(c.telefone);
  if (c.telefone && !telefone) avisos.push("O telefone lido no contrato não é válido: confira.");
  const email = (c.email ?? "").toLowerCase();
  const conjugeCpf = onlyDigits(s?.cpf);
  const cep = onlyDigits(e.cep);
  const uf = (e.uf ?? "").toUpperCase();
  const nascimento = c.data_nascimento && c.data_nascimento < hoje ? c.data_nascimento : "";

  const cliente: DadosClienteContrato = {
    nome: c.nome ? nomeProprio(c.nome) : "",
    telefone,
    email: isValidEmail(email) ? email : "",
    cpf: isValidCPF(cpf) ? cpf : "",
    renda_estimada: c.renda_familiar ? String(Math.round(c.renda_familiar * 100) / 100) : "",
    rg: c.rg ?? "",
    rg_orgao_emissor: c.rg_orgao_emissor ?? "",
    data_nascimento: nascimento,
    estado_civil: c.estado_civil ? nomeProprio(c.estado_civil) : "",
    regime_casamento: c.regime_casamento ?? "",
    profissao: c.profissao ? nomeProprio(c.profissao) : "",
    nacionalidade: c.nacionalidade ? nomeProprio(c.nacionalidade) : "",
    endereco_logradouro: e.logradouro ? nomeProprio(e.logradouro.replace(/,\s*$/, "")) : "",
    endereco_numero: e.numero ?? "",
    endereco_complemento: e.complemento ?? "",
    endereco_bairro: e.bairro ? nomeProprio(e.bairro) : "",
    endereco_cidade: e.cidade ? nomeProprio(e.cidade.replace(/\s*\/\s*[A-Z]{2}$/i, "")) : "",
    endereco_uf: /^[A-Z]{2}$/.test(uf) ? uf : "",
    endereco_cep: cep.length === 8 ? cep : "",
    conjuge_nome: s?.nome ? nomeProprio(s.nome) : "",
    conjuge_cpf: isValidCPF(conjugeCpf) ? conjugeCpf : "",
  };
  if (cliente.conjuge_cpf && cliente.conjuge_cpf === cliente.cpf) {
    cliente.conjuge_cpf = "";
    avisos.push("O segundo comprador veio com o mesmo CPF do comprador: confira.");
  }

  const dataAssinatura = v.data_assinatura && v.data_assinatura <= hoje ? v.data_assinatura : null;
  if (v.data_assinatura && !dataAssinatura) {
    avisos.push("A data de assinatura lida está no futuro: confira.");
  }

  const camposLidos = (Object.keys(cliente) as CampoCliente[]).filter((k) => cliente[k] !== "");
  return {
    cliente,
    venda: {
      construtora: v.construtora ?? null,
      empreendimento: v.empreendimento ?? null,
      unidade: v.unidade ?? null,
      valorVenda: v.valor_venda ?? null,
      dataAssinatura,
    },
    confianca: bruta.confianca,
    observacoes: bruta.observacoes ?? null,
    camposLidos,
    avisos,
  };
}
