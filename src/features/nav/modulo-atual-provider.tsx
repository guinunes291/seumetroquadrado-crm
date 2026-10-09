import { useMemo, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useFaseDaJornada } from "@/features/nav/contexto-jornada";
import { ModuloAtualContext } from "@/features/nav/modulo-atual";
import { numeroDoModulo, sistemaAtivoContextual, SISTEMAS_NAV } from "@/features/nav/sistemas";

/**
 * Resolve UMA vez, no shell, em que módulo a página está — pela mesma regra
 * da sidebar e da trilha (sistemaAtivoContextual, com a fase da jornada da
 * ficha do lead) — e entrega por contexto. Quem lê (o eyebrow "Módulo 03" do
 * PageHeader) não precisa conhecer o roteador nem o registro.
 */
export function ModuloAtualProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const faseJornada = useFaseDaJornada();
  const sistema = sistemaAtivoContextual({ pathname, search }, faseJornada, SISTEMAS_NAV);
  const numero = sistema ? numeroDoModulo(sistema.id) : null;
  const titulo = sistema?.titulo ?? null;
  const valor = useMemo(() => (numero && titulo ? { numero, titulo } : null), [numero, titulo]);
  return <ModuloAtualContext.Provider value={valor}>{children}</ModuloAtualContext.Provider>;
}
