import { createFileRoute } from "@tanstack/react-router";
import { ObrigatorioPage } from "@/features/modo-obrigatorio/obrigatorio-page";

// Processo Obrigatório: enquanto houver pendência (cadência do dia, fundo de
// funil parado), é a única tela do corretor. Desenho e regras:
// docs/ops/modo-obrigatorio.md e migration 20261002120000.
export const Route = createFileRoute("/_authenticated/obrigatorio")({
  head: () => ({ meta: [{ title: "Processo obrigatório — Seu Metro Quadrado" }] }),
  component: ObrigatorioPage,
});
