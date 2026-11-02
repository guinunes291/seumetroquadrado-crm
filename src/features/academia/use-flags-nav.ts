// Resolve quais flags de SISTEMA estão ligadas para a pessoa logada.
//
// Não basta a flag estar ligada em app_flags: as flags são GLOBAIS e a
// Academia é individual. O conjunto recebe chaves que já respondem "esta
// pessoa entra por esta porta?":
//
//   academia_menu        estuda: flag ligada E participação ativa;
//   academia_gestao      gere: admin SEMPRE (prepara conteúdo e inscreve antes
//                        de abrir para o time), gestor e superintendente só
//                        com a flag academia_menu ligada;
//   academia_card_inicio o card do /inicio, só de quem estuda;
//   disparo_base         a seção "Disparo da base" da Prospecção, só de quem
//                        está no piloto (disparo_base_pilotos).
//
// Enquanto carrega, o conjunto sai vazio: o menu aparecer e sumir é pior do
// que aparecer meio segundo depois.

import { useMemo } from "react";
import { useUserRoles } from "@/hooks/use-auth";
import { useAppFlag } from "@/hooks/use-app-flags";
import { useEhParticipante } from "./academia-client";
import { usePilotoDisparoBase } from "@/features/disparo-base/disparo-client";

/** Regra pura de quem entra na gestão, testável sem montar componente. */
export function podeGerirAcademia(p: {
  isAdmin: boolean;
  isGestor: boolean;
  isSuperintendente: boolean;
  menuLigado: boolean;
}): boolean {
  if (p.isAdmin) return true;
  return p.menuLigado && (p.isGestor || p.isSuperintendente);
}

export function useFlagsNav(): Set<string> {
  const menu = useAppFlag("academia_menu");
  const card = useAppFlag("academia_card_inicio");
  const { participa } = useEhParticipante();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const { piloto: pilotoDisparo } = usePilotoDisparoBase();

  return useMemo(() => {
    const ligadas = new Set<string>();
    if (menu.ligada && participa) ligadas.add("academia_menu");
    if (podeGerirAcademia({ isAdmin, isGestor, isSuperintendente, menuLigado: menu.ligada })) {
      ligadas.add("academia_gestao");
    }
    // O card do /inicio é só para quem estuda: admin que não participa não
    // tem "próxima aula" nenhuma para ver.
    if (card.ligada && participa) ligadas.add("academia_card_inicio");
    if (pilotoDisparo) ligadas.add("disparo_base");
    return ligadas;
  }, [menu.ligada, card.ligada, participa, isAdmin, isGestor, isSuperintendente, pilotoDisparo]);
}
