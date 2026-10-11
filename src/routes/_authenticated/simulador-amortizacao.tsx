import { createFileRoute } from "@tanstack/react-router";
import { SimuladorAmortizacaoPage } from "@/features/simulador-amortizacao/simulador-amortizacao-page";
import type { PrefillSimulador } from "@/features/simulador-amortizacao/estado";

// Planilha de amortização (SAC x PRICE mês a mês). Consulta de apoio à venda,
// como a Vitrine e o Mapa de Lojas: mora em Docs & Projetos. O dossiê do lead
// abre esta tela já preenchida com os dados do contrato (aprovação de crédito):
// ?financiamento=&taxa=&prazo=&sistema=&renda=&avaliacao=
const numeroOuNada = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const Route = createFileRoute("/_authenticated/simulador-amortizacao")({
  head: () => ({ meta: [{ title: "Planilha de amortização — Seu Metro Quadrado" }] }),
  validateSearch: (search: Record<string, unknown>): PrefillSimulador => {
    const sistema = String(search.sistema ?? "").toUpperCase();
    return {
      financiamento: numeroOuNada(search.financiamento),
      taxa: numeroOuNada(search.taxa),
      prazo: numeroOuNada(search.prazo),
      sistema: sistema === "SAC" || sistema === "PRICE" ? sistema : undefined,
      renda: numeroOuNada(search.renda),
      avaliacao: numeroOuNada(search.avaliacao),
    };
  },
  component: Pagina,
});

function Pagina() {
  const busca = Route.useSearch();
  return <SimuladorAmortizacaoPage prefill={busca} />;
}
