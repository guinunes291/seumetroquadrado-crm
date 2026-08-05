import { createFileRoute } from "@tanstack/react-router";
import { ProjetosFocoPage } from "@/features/projetos/projetos-foco-page";

// Destino de consulta diária do corretor: construtoras parceiras + projetos em
// campanha, com book/tabela/resumo à mão. O catálogo completo (/projetos)
// continua sendo o cadastro; aqui é a bancada de trabalho.
export const Route = createFileRoute("/_authenticated/projetos-foco")({
  head: () => ({ meta: [{ title: "Projetos em Foco — Seu Metro Quadrado" }] }),
  component: ProjetosFocoPage,
});
