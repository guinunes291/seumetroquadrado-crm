import { createFileRoute, redirect } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import { FechamentoPage } from "@/features/financeiro/fechamento-page";

// Financeiro · Fechamento — caixa do mês, fila de decisão e auditoria.
// Somente admin e gestor operam esta tela.
export const Route = createFileRoute("/_authenticated/financeiro/fechamento")({
  head: () => ({
    meta: [
      { title: "Financeiro · Fechamento — Seu Metro Quadrado" },
      {
        name: "description",
        content:
          "Caixa de comissões, fila de decisão, recebíveis e auditoria do fechamento financeiro.",
      },
      { property: "og:title", content: "Financeiro · Fechamento — Seu Metro Quadrado" },
      {
        property: "og:description",
        content: "Controle de comissões em aberto, travadas, aptas e pagas no mês.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroFechamentoRoute,
});

function FinanceiroFechamentoRoute() {
  const { isAdmin, isGestor, loading } = useUserRoles();
  if (!loading && !isAdmin && !isGestor) {
    throw redirect({ to: "/" });
  }
  return <FechamentoPage />;
}
