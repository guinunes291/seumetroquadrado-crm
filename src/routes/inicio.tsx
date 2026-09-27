import { createFileRoute } from "@tanstack/react-router";
import { guardarRotaAutenticada } from "@/lib/auth-guard";
import { exigirProcessoObrigatorio } from "@/features/modo-obrigatorio/use-modo-obrigatorio";
import { InicioPage } from "@/features/inicio/inicio-page";

// Hub "Acesso aos Módulos" — a primeira tela após o login. Vive fora do shell
// /_authenticated porque não tem sidebar, mas exige a MESMA autenticação
// (guard compartilhado em src/lib/auth-guard.ts).
export const Route = createFileRoute("/inicio")({
  ssr: false,
  // O Modo Obrigatório vale aqui também: o hub é uma porta de entrada, e o
  // corretor travado não pode usá-lo para chegar aos módulos.
  beforeLoad: async ({ location, context }) => {
    const r = await guardarRotaAutenticada(location.href);
    await exigirProcessoObrigatorio(context.queryClient, r.user.id, location.pathname);
    return r;
  },
  head: () => ({ meta: [{ title: "Acesso aos Módulos — Seu Metro Quadrado" }] }),
  component: InicioPage,
});
