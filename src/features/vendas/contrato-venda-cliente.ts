// Venda por contrato (IA) — o lado do CLIENTE e do catálogo (puro): diferença
// "atual → novo", validação do formulário, payload da gravação e sugestão de
// construtora/empreendimento.

import { chaveConstrutora, mesmaConstrutora } from "@/lib/construtoras";
import { formatPhoneBR, maskCPF, maskCurrencyBRL } from "@/lib/masks";
import { isValidBrazilPhone, isValidCPF, isValidEmail, onlyDigits } from "@/lib/validators";
import type { DadosClienteContrato } from "./contrato-venda";

export type CampoCliente = keyof DadosClienteContrato;

// ---------------------------------------------------------------------------
// 3) Cliente que já existe: "atual → novo", campo a campo
// ---------------------------------------------------------------------------

export const ROTULO_CAMPO: Record<CampoCliente, string> = {
  nome: "Nome",
  telefone: "Telefone",
  email: "E-mail",
  cpf: "CPF",
  renda_estimada: "Renda familiar",
  rg: "RG",
  rg_orgao_emissor: "Órgão emissor do RG",
  data_nascimento: "Data de nascimento",
  estado_civil: "Estado civil",
  regime_casamento: "Regime de casamento",
  profissao: "Profissão",
  nacionalidade: "Nacionalidade",
  endereco_logradouro: "Endereço",
  endereco_numero: "Número",
  endereco_complemento: "Complemento",
  endereco_bairro: "Bairro (residência)",
  endereco_cidade: "Cidade",
  endereco_uf: "UF",
  endereco_cep: "CEP",
  conjuge_nome: "Cônjuge / 2º comprador",
  conjuge_cpf: "CPF do cônjuge",
};

export const CAMPOS_CLIENTE = Object.keys(ROTULO_CAMPO) as CampoCliente[];

/** Forma comparável: dígitos para documentos, sem acento/caixa para texto. */
export function chaveComparacao(campo: CampoCliente, v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  switch (campo) {
    case "telefone":
      return onlyDigits(s).slice(-9); // mesma chave do registro mãe
    case "cpf":
    case "conjuge_cpf":
    case "endereco_cep":
      return onlyDigits(s);
    case "renda_estimada": {
      const n = Number(s);
      return Number.isFinite(n) ? n.toFixed(2) : s;
    }
    case "data_nascimento":
      return s.slice(0, 10);
    default:
      return chaveConstrutora(s);
  }
}

export type DiferencaCampo = {
  campo: CampoCliente;
  atual: string;
  novo: string;
  /** Marcado por padrão: só quando o cliente não tinha o dado (pergunta 5). */
  marcado: boolean;
};

/**
 * O que o contrato muda no cadastro atual. Campo sem valor novo não aparece
 * (o contrato não apaga o que o CRM já sabe); igual também não.
 */
export function diferencasCliente(
  atual: Partial<Record<CampoCliente, unknown>>,
  novo: DadosClienteContrato,
): DiferencaCampo[] {
  const out: DiferencaCampo[] = [];
  for (const campo of CAMPOS_CLIENTE) {
    const n = novo[campo];
    if (!n) continue;
    const a = atual[campo] == null ? "" : String(atual[campo]);
    if (chaveComparacao(campo, a) === chaveComparacao(campo, n)) continue;
    out.push({ campo, atual: a, novo: n, marcado: chaveComparacao(campo, a) === "" });
  }
  return out;
}

/** Valida o formulário antes de gravar. Vazio = pode seguir. */
export function errosCliente(d: DadosClienteContrato, exigeTelefone: boolean): string[] {
  const erros: string[] = [];
  if (d.nome.trim().length < 2) erros.push("Informe o nome do cliente.");
  if (exigeTelefone && !d.telefone) erros.push("Informe o telefone do cliente (DDD + número).");
  if (d.telefone && !isValidBrazilPhone(d.telefone)) erros.push("Telefone inválido.");
  if (d.email && !isValidEmail(d.email)) erros.push("E-mail inválido.");
  if (d.cpf && !isValidCPF(d.cpf)) erros.push("CPF inválido.");
  if (d.conjuge_cpf && !isValidCPF(d.conjuge_cpf)) erros.push("CPF do cônjuge inválido.");
  if (d.endereco_cep && onlyDigits(d.endereco_cep).length !== 8) erros.push("CEP inválido.");
  if (d.endereco_uf && !/^[A-Za-z]{2}$/.test(d.endereco_uf)) erros.push("UF inválida.");
  if (d.renda_estimada && !(Number(d.renda_estimada) >= 0)) erros.push("Renda inválida.");
  return erros;
}

/** O payload de `aplicar_dados_contrato_lead`: só os campos escolhidos. */
export function payloadDadosCliente(
  d: DadosClienteContrato,
  campos: readonly CampoCliente[],
  formatarCpf: (cpf: string) => string,
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const campo of campos) {
    const v = d[campo].trim();
    if (!v) continue; // o contrato nunca apaga dado do CRM
    if (campo === "cpf") out.cpf = formatarCpf(v);
    else if (campo === "renda_estimada") out.renda_estimada = Number(v);
    else if (campo === "endereco_uf") out.endereco_uf = v.toUpperCase();
    else out[campo] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4) Construtora e empreendimento: sugestão, nunca escolha silenciosa
// ---------------------------------------------------------------------------

/** A construtora da lista do CRM que corresponde à lida no contrato. */
export function sugerirConstrutora(lida: string | null, lista: readonly string[]): string | null {
  if (!lida) return null;
  return lista.find((c) => mesmaConstrutora(lida, c) || mesmaConstrutora(c, lida)) ?? null;
}

const RUIDO_EMPREENDIMENTO =
  /\b(condominio|residencial|edificio|empreendimento|conjunto|torre|bloco|spe|ltda|the|de|da|do|das|dos|e)\b/g;

function tokensEmpreendimento(nome: string): string[] {
  return chaveConstrutora(nome)
    .replace(RUIDO_EMPREENDIMENTO, " ")
    .split(" ")
    .filter((t) => t.length >= 2);
}

/**
 * Empreendimento do CRM mais parecido com o nome lido ("Condomínio Jardim das
 * Origens - Parque Aruá" ↔ "Parque Aruá"). Pontua pela fração de palavras do
 * nome do CRM presentes no lido (+0,15 se a construtora bate); abaixo de 0,6
 * não sugere nada.
 */
export function sugerirProjeto<T extends { id: string; nome: string; construtora: string | null }>(
  lido: string | null,
  construtora: string | null,
  projetos: readonly T[],
): T | null {
  if (!lido) return null;
  const alvo = new Set(tokensEmpreendimento(lido));
  if (alvo.size === 0) return null;
  let melhor: { p: T; score: number } | null = null;
  for (const p of projetos) {
    const toks = tokensEmpreendimento(p.nome);
    if (toks.length === 0) continue;
    const comuns = toks.filter((t) => alvo.has(t)).length;
    const mesmaMarca =
      !!construtora && !!p.construtora && mesmaConstrutora(p.construtora, construtora);
    // Nome de UMA palavra só casa com a construtora confirmando: senão
    // "Jardim" seria sugerido para todo contrato com "Jardim" no nome.
    if (comuns === 0 || (comuns < 2 && !mesmaMarca)) continue;
    let score = comuns / toks.length;
    if (mesmaMarca) score += 0.15;
    if (!melhor || score > melhor.score) melhor = { p, score };
  }
  return melhor && melhor.score >= 0.6 ? melhor.p : null;
}

// ---------------------------------------------------------------------------
// 5) Exibição dos valores (formulário e "atual → novo")
// ---------------------------------------------------------------------------

export const maskCEP = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export const brlDeNumero = (s: string) =>
  s ? maskCurrencyBRL(String(Math.round(Number(s) * 100))) : "";

/** Como o campo aparece na tela ("atual → novo" e formulário). */
export function exibir(campo: CampoCliente, v: string): string {
  if (!v) return "—";
  if (campo === "telefone") return formatPhoneBR(v);
  if (campo === "cpf" || campo === "conjuge_cpf") return maskCPF(v);
  if (campo === "endereco_cep") return maskCEP(v);
  if (campo === "renda_estimada") return brlDeNumero(v);
  if (campo === "data_nascimento" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split("-");
    return `${d}/${m}/${a}`;
  }
  return v;
}
