import { createFileRoute } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { MateriaisPage } from "@/features/projetos/materiais-page";

// Preenchimento em massa de book/tabela. É trabalho de gestão sobre o catálogo
// (o corretor consome o resultado na bancada), então fica atrás do gate de
// papel — a RLS de `projetos` continua sendo a proteção real.
export const Route = createFileRoute("/_authenticated/projetos-materiais")({
  head: () => ({ meta: [{ title: "Materiais dos empreendimentos — Seu Metro Quadrado" }] }),
  component: MateriaisRoute,
});

function MateriaisRoute() {
  return (
    <RequireRole allow={["admin", "gestor"]} redirectTo="/projetos-foco">
      <MateriaisPage />
    </RequireRole>
  );
}
