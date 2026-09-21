import { createFileRoute } from "@tanstack/react-router";
import { ManualPage } from "@/features/manual/manual-page";

// Manual de utilização do CRM — aberto a todos os perfis.
export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({
    meta: [
      { title: "Manual do CRM — Seu Metro Quadrado" },
      {
        name: "description",
        content:
          "Manual completo do CRM Seu Metro Quadrado: fila única, distribuição, follow-up, carteira, visitas, comissões e configurações, com telas reais.",
      },
      { property: "og:title", content: "Manual do CRM — Seu Metro Quadrado" },
      {
        property: "og:description",
        content:
          "Como usar o CRM de ponta a ponta: cada módulo, cada ação e as telas reais do sistema.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManualPage,
});
