import { createFileRoute } from "@tanstack/react-router";
import { SimuladorAmortizacaoPage } from "@/features/simulador-amortizacao/simulador-amortizacao-page";

// Planilha de amortização (SAC x PRICE mês a mês). Consulta de apoio à venda,
// como a Vitrine e o Mapa de Lojas: mora em Docs & Projetos. O dossiê do lead
// abre esta tela já preenchida via ?renda=&valor=&entrada=.
type Busca = { renda?: number; valor?: number; entrada?: number };

const numeroOuNada = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const Route = createFileRoute("/_authenticated/simulador-amortizacao")({
  head: () => ({ meta: [{ title: "Planilha de amortização — Seu Metro Quadrado" }] }),
  validateSearch: (search: Record<string, unknown>): Busca => ({
    renda: numeroOuNada(search.renda),
    valor: numeroOuNada(search.valor),
    entrada: numeroOuNada(search.entrada),
  }),
  component: Pagina,
});

function Pagina() {
  const busca = Route.useSearch();
  return <SimuladorAmortizacaoPage prefill={busca} />;
}
