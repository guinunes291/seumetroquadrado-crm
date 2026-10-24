// Sami — datas no fuso de São Paulo e termos de busca seguros para o
// PostgREST (agenda, buscar_clientes).
// Recortado de samiq-tools.ts sem mudança de comportamento.

import { DATA_ISO } from "./samiq-tools-catalogo";

// ---------------------------------------------------------------------------
// Datas (o servidor roda em UTC; a operação vive em São Paulo)
// ---------------------------------------------------------------------------

export const SAMIQ_FUSO = "America/Sao_Paulo";
const OFFSET_SP = "-03:00";
export const MAX_DIAS_AGENDA = 31;

/** AAAA-MM-DD de `agora` no fuso de São Paulo. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAMIQ_FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function somarDiasIso(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/**
 * Intervalo [inicio, fim] em ISO com fuso de SP para a consulta da agenda.
 * Padrão: hoje → hoje + 7 dias. Janela máxima de 31 dias; `ate` antes de `de`
 * vira o próprio `de` (um dia só) em vez de erro — o modelo erra datas.
 */
export function intervaloAgendaSamiQ(
  hoje: string,
  de?: string,
  ate?: string,
): { de: string; ate: string; inicioIso: string; fimIso: string } {
  const inicio = de && DATA_ISO.test(de) ? de : hoje;
  let fim = ate && DATA_ISO.test(ate) ? ate : somarDiasIso(inicio, 7);
  if (fim < inicio) fim = inicio;
  const limite = somarDiasIso(inicio, MAX_DIAS_AGENDA - 1);
  if (fim > limite) fim = limite;
  return {
    de: inicio,
    ate: fim,
    inicioIso: `${inicio}T00:00:00${OFFSET_SP}`,
    fimIso: `${fim}T23:59:59${OFFSET_SP}`,
  };
}

/**
 * Separa o que é nome/empreendimento do que é telefone no termo do
 * buscar_clientes ("Lucas 4321", "final 4321", "lucas final 98765-4321").
 * Os 4 últimos dígitos bastam para separar homônimos e não expõem o número.
 * Menos de 4 dígitos não vira filtro de telefone (fica no texto, como antes).
 */
export function separarTermoBuscaSamiQ(termo: string): {
  texto: string;
  finalTelefone: string | null;
} {
  const digitos = (termo.match(/\d[\d\s.-]*\d|\d/g) ?? [])
    .map((d) => d.replace(/\D/g, ""))
    .filter((d) => d.length >= 4);
  if (digitos.length === 0) return { texto: termoBuscaSamiQ(termo), finalTelefone: null };
  const ultimo = digitos[digitos.length - 1];
  const texto = termoBuscaSamiQ(
    termo
      .replace(/\d[\d\s.-]*\d|\d/g, " ")
      .replace(/\b(?:final|finais|terminado|termina|tel|telefone|cel|celular|em|com|o|a)\b/gi, " "),
  );
  return { texto, finalTelefone: ultimo.slice(-Math.min(ultimo.length, 9)) };
}

/** Termo de busca seguro para o filtro `.or()` do PostgREST (vírgula e
 *  parênteses são sintaxe; `%`/`*` são curingas que o modelo não controla). */
export function termoBuscaSamiQ(termo: string): string {
  return termo
    .replace(/[,()%*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Mesmo formato das colunas de busca normalizadas no banco. */
export function termoSemAcentoSamiQ(termo: string): string {
  return termoBuscaSamiQ(termo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
