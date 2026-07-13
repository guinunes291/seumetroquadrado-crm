import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = (error as { status?: number }).status;
          if (status && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Antecipa o chunk + dados da rota ao passar o mouse/tocar no link, deixando
    // a troca de página quase instantânea. O staleTime não-zero garante que o
    // match preloaded (incluindo o beforeLoad do guard, que chama
    // conta_atual_ativa) seja reaproveitado — sem re-rodar o guard a cada hover.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    // Transição nativa entre rotas (View Transitions API): fade + deslize de
    // 4px definidos em styles.css. No-op em browsers sem suporte; desligada
    // sob prefers-reduced-motion pelo bloco global de motion.
    // Começa DESLIGADA: o primeiro navigate (ex.: guard redirecionando / →
    // /auth) pode disparar durante a hidratação, e startViewTransition mutando
    // o DOM nesse instante causa mismatch intermitente (React #418, visto no
    // smoke). Liga após a primeira pintura, quando a hidratação já assentou.
    defaultViewTransition: false,
  });

  if (typeof window !== "undefined" && typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        router.options.defaultViewTransition = true;
      });
    });
  }

  return router;
};
