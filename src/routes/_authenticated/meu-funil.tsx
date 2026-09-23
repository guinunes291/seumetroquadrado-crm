import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { diaSaoPaulo } from "@/features/metas-dia/metas-dia";

const MeuFunilView = lazy(() =>
  import("@/features/meu-funil/meu-funil-view").then(({ MeuFunilView }) => ({
    default: MeuFunilView,
  })),
);

// SEM gate de papel, como o Meu Raio-X: o recorte é do banco (a RPC
// meu_funil_estudo lê só auth.uid()). O estudo OBRIGATÓRIO do dia é o
// MeuFunilGlobal no shell; esta página é para reabrir o funil a qualquer hora.
export const Route = createFileRoute("/_authenticated/meu-funil")({
  head: () => ({ meta: [{ title: "Meu Funil — Seu Metro Quadrado" }] }),
  component: MeuFunilPage,
});

function MeuFunilPage() {
  return (
    <>
      <PageHeader
        title="Meu Funil"
        description="Sua conversão por etapa e por origem, e quanto de cada etapa custa 1 venda sua."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <MeuFunilView dia={diaSaoPaulo()} />
      </Suspense>
    </>
  );
}
