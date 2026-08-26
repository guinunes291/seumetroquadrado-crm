import { createFileRoute } from "@tanstack/react-router";
import { guardarRotaAutenticada } from "@/lib/auth-guard";
import { InicioPage } from "@/features/inicio/inicio-page";

// Hub "Acesso aos Módulos" — a primeira tela após o login. Vive fora do shell
// /_authenticated porque não tem sidebar, mas exige a MESMA autenticação
// (guard compartilhado em src/lib/auth-guard.ts).
export const Route = createFileRoute("/inicio")({
  ssr: false,
  beforeLoad: ({ location }) => guardarRotaAutenticada(location.href),
  head: () => ({ meta: [{ title: "Acesso aos Módulos — Seu Metro Quadrado" }] }),
  component: InicioPage,
});
