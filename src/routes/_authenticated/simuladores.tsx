import { createFileRoute } from "@tanstack/react-router";
import { SimuladoresPage } from "@/features/simuladores/simuladores-page";
import { SIMULADOR_IDS, simuladorIdOuNada, type SimuladorId } from "@/lib/simuladores/ids";

// Simuladores das construtoras (fluxo de pagamento: ato, mensais até a
// entrega, intermediárias, chaves). Consulta de apoio à venda, todos os
// papéis — mora em Docs & Projetos, como a Planilha de amortização.
// ?construtora= escolhe a aba (link direto para a Mundo Apto, por exemplo);
// ?projeto=, ?valor= e ?renda= abrem a tela já preenchida, e o dossiê do lead
// manda também o que veio da aprovação de crédito (?financiamento=,
// ?subsidio=, ?fgts=, ?parcela=).
type Busca = {
  construtora?: SimuladorId;
  projeto?: string;
  valor?: number;
  renda?: number;
  financiamento?: number;
  subsidio?: number;
  fgts?: number;
  parcela?: number;
};

const numeroOuNada = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const Route = createFileRoute("/_authenticated/simuladores")({
  head: () => ({ meta: [{ title: "Simuladores — Seu Metro Quadrado" }] }),
  validateSearch: (search: Record<string, unknown>): Busca => ({
    construtora: simuladorIdOuNada(search.construtora),
    projeto: typeof search.projeto === "string" && search.projeto ? search.projeto : undefined,
    valor: numeroOuNada(search.valor),
    renda: numeroOuNada(search.renda),
    financiamento: numeroOuNada(search.financiamento),
    subsidio: numeroOuNada(search.subsidio),
    fgts: numeroOuNada(search.fgts),
    parcela: numeroOuNada(search.parcela),
  }),
  component: Pagina,
});

function Pagina() {
  const { construtora, ...prefill } = Route.useSearch();
  return <SimuladoresPage construtora={construtora ?? SIMULADOR_IDS[0]} prefill={prefill} />;
}
