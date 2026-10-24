// Tabela de preços em dia ou desatualizada (Sami v8) — PURO, sem rede.
//
// Regra do Guilherme (24/10/2026): a construtora solta a tabela nova no
// começo do mês, então do DIA 5 em diante a tabela que não é do mês corrente
// está desatualizada. Do dia 1 ao dia 4, a do mês anterior ainda vale.
//
// Exemplos com hoje = 24/10/2026: tabela de 12/10 está em dia; a de 28/09
// está desatualizada. Em 03/11/2026 a de 12/10 ainda vale; em 05/11 deixa de
// valer. Em 03/11 a de 28/09 já está desatualizada (a esperada é a de
// outubro, que deveria ter chegado até 05/10).
//
// A data é o carimbo `projetos.tabela_atualizada_em` (trigger: muda quando o
// link da tabela muda), lida no calendário de São Paulo. O mesmo corte está
// no atalho de materiais do n8n (nó "Montar materiais" do workflow
// fasjOpLA6QWbRfkU): mudou aqui, mude lá.

import { diaSP } from "@/lib/samiq-datas";

/** Do dia 5 em diante, só vale a tabela do mês. */
export const SAMIQ_DIA_CORTE_TABELA = 5;

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export type SituacaoTabelaSamiQ =
  | { estado: "sem_data" }
  | { estado: "em_dia"; data: string }
  | { estado: "desatualizada"; data: string; mesEsperado: string };

const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** [ano, mês, dia] da tabela no calendário de SP; data só (AAAA-MM-DD) fica como veio. */
function diaDaTabela(valor: string): [number, number, number] | null {
  const v = valor.trim();
  const so = SO_DATA.exec(v);
  if (so) return [Number(so[1]), Number(so[2]), Number(so[3])];
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const [a, m, d] = diaSP(new Date(t)).split("-").map(Number);
  return [a, m, d];
}

const indiceMes = (ano: number, mes: number) => ano * 12 + (mes - 1);
const dois = (n: number) => String(n).padStart(2, "0");

/** Situação da tabela em `agora` (São Paulo). Sem data ou data ilegível: sem_data. */
export function situacaoTabelaSamiQ(
  atualizadaEm: string | null | undefined,
  agora: Date = new Date(),
): SituacaoTabelaSamiQ {
  const tabela = atualizadaEm ? diaDaTabela(atualizadaEm) : null;
  if (!tabela) return { estado: "sem_data" };
  const [ta, tm, td] = tabela;
  const [ha, hm, hd] = diaSP(agora).split("-").map(Number);
  const data = `${dois(td)}/${dois(tm)}/${ta}`;
  // Mês mínimo aceito: o atual do dia de corte em diante; antes dele, o anterior.
  const minimo = indiceMes(ha, hm) - (hd >= SAMIQ_DIA_CORTE_TABELA ? 0 : 1);
  if (indiceMes(ta, tm) >= minimo) return { estado: "em_dia", data };
  const mesEsperado = `${MESES[minimo % 12]}/${Math.floor(minimo / 12)}`;
  return { estado: "desatualizada", data, mesEsperado };
}

/** Aviso que vai na ficha que a Sami lê. Tabela em dia: nenhum. */
export function avisoTabelaSamiQ(s: SituacaoTabelaSamiQ): string | undefined {
  if (s.estado === "sem_data") {
    return "Tabela sem data de atualização no CRM: confirme valores e disponibilidade com a construtora antes de passar ao cliente.";
  }
  if (s.estado === "desatualizada") {
    return `Tabela desatualizada: é de ${s.data} e a de ${s.mesEsperado} ainda não está no CRM. Confirme valores e disponibilidade com a construtora antes de passar ao cliente.`;
  }
  return undefined;
}
