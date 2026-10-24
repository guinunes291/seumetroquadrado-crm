const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function moeda(valor: number): string {
  return brl.format(valor);
}

export function numero(valor: number): string {
  return inteiro.format(valor);
}

// Custo por unidade. Sem unidade não existe custo: mostrar "sem dado" evita
// ler "R$ 0,00" como se o resultado tivesse saído de graça.
export function custoPor(gasto: number, quantidade: number): string {
  if (!quantidade || quantidade <= 0) return gasto > 0 ? "nenhum ainda" : "sem dado";
  return brl.format(gasto / quantidade);
}

export function dataCurta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Regra de negócio: nenhum texto gerado pelo Painel usa travessão.
export function semTravessao(texto: string): string {
  return texto.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
}
