import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { FilaCadenciaView } from "@/features/cadencia/fila-view";

// Cadência D1/D2/D3 — a Fila do Dia do corretor para lead que ainda não
// respondeu. Depois da resposta o lead sai daqui e passa a ser regido pela
// régua de 13 toques em /follow-up: uma tela por janela, para o corretor
// nunca receber duas ordens sobre o mesmo cliente.
//
// Desenho e regras: docs/ops/cadencia-followup-reativacao.md.

export const Route = createFileRoute("/_authenticated/cadencia")({
  head: () => ({ meta: [{ title: "Cadência — Seu Metro Quadrado" }] }),
  component: CadenciaPage,
});

function CadenciaPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Fila do Dia"
        description="Os leads cuja etapa vence hoje ou já venceu. Cumprir a cadência até o fim não conta como perda — deixar vencer, sim."
      />
      <FilaCadenciaView />
    </div>
  );
}
