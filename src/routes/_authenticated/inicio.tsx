import { createFileRoute } from "@tanstack/react-router";
import { InicioPage } from "@/features/inicio/inicio-page";

// Hub "Acesso aos Módulos" — a primeira tela após o login. Desde a identidade
// Lançamento (2026-10) vive DENTRO do shell /_authenticated: a sidebar com
// todos os módulos aparece já aqui, como no vídeo, e a sessão, a conta ativa
// e a presença passam pelo mesmo guard do layout (src/lib/auth-guard.ts).
export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({ meta: [{ title: "Acesso aos Módulos — Seu Metro Quadrado" }] }),
  component: InicioPage,
});
