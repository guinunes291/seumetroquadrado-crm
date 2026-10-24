// Regras de visibilidade por papel e flag, badges, home e número do módulo.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import type { NavBadges } from "@/features/nav/use-nav-badges";
import type { Destino, Secao, SistemaId, Sistema, PapelCtx } from "@/features/nav/sistemas-tipos";
import { temPapel } from "@/features/nav/sistemas-papeis";
import { SISTEMAS, SISTEMAS_NAV } from "@/features/nav/sistemas-registro";

export function secoesVisiveis(sistema: Sistema, ctx: PapelCtx): Secao[] {
  return sistema.secoes.filter(
    (s) => (!s.flag || ctx.flagsLigadas?.has(s.flag) === true) && temPapel(s.roles, ctx),
  );
}

/** Sistema visível se o papel passa no gate E alguma seção é visível
 *  (sistema sem seções, como Configurações, decide só pelo gate). */
export function sistemaVisivel(sistema: Sistema, ctx: PapelCtx): boolean {
  // A flag vem ANTES do papel: admin enxerga tudo por papel, mas não fura
  // feature flag. Sem `flagsLigadas` no contexto, sistema com flag some.
  if (sistema.flag && !ctx.flagsLigadas?.has(sistema.flag)) return false;
  if (!temPapel(sistema.roles, ctx)) return false;
  if (sistema.secoes.length === 0) return true;
  return secoesVisiveis(sistema, ctx).length > 0;
}

export function sistemasVisiveis(ctx: PapelCtx, lista: Sistema[] = SISTEMAS): Sistema[] {
  return lista.filter((s) => sistemaVisivel(s, ctx));
}

/** 0 = sem badge (dados indisponíveis, papel sem a ação, ou contagem zerada). */
export function badgeDoSistema(s: Sistema, badges: NavBadges | null, ctx: PapelCtx): number {
  if (!badges || !s.badge) return 0;
  if (s.badgeRoles && !temPapel(s.badgeRoles, ctx)) return 0;
  return s.badge(badges);
}

export function badgeDaSecao(s: Secao, badges: NavBadges | null, ctx: PapelCtx): number {
  if (!badges || !s.badge) return 0;
  if (s.badgeRoles && !temPapel(s.badgeRoles, ctx)) return 0;
  return s.badge(badges);
}

export function homeDoSistema(s: Sistema, ctx: PapelCtx): Destino {
  return s.homePorPapel?.(ctx) ?? s.home;
}

/** Número fixo do módulo ("Módulo 01"), na ordem do registro — o mesmo para
 *  todo papel, para "abra o módulo 04" valer no treino e no suporte. As
 *  Configurações ficam de fora: não são módulo de trabalho, moram no rodapé
 *  da sidebar (identidade Lançamento, 2026-10). Sem número = null. */
export function numeroDoModulo(id: SistemaId, lista: Sistema[] = SISTEMAS_NAV): number | null {
  const numerados = lista.filter((s) => s.id !== "configuracoes");
  const i = numerados.findIndex((s) => s.id === id);
  return i < 0 ? null : i + 1;
}
