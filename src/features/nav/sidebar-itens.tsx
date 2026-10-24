// Barra lateral — os itens da navegação: módulo (com as seções aninhadas
// quando é o aberto), seção, e as versões de trilho (só ícone com tooltip).
// Recortado de src/components/app-sidebar.tsx sem mudança de comportamento.

import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  badgeDaSecao,
  badgeDoSistema,
  homeDoSistema,
  type PapelCtx,
  type Secao,
  type Sistema,
} from "@/features/nav/sistemas";
import type { NavBadges } from "@/features/nav/use-nav-badges";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** O que todo item precisa saber da barra: papel, pendências, o aceso. */
export type NavItemCtx = {
  ctx: PapelCtx;
  badges: NavBadges | null;
  onNavigate?: () => void;
  ativo: Sistema | null;
  secaoAcesa: Secao | null;
  secoesDoAtivo: Secao[];
};

/** Contagem 99+ para não estourar o layout. */
function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

const countPill = (n: number) =>
  n > 0 ? (
    <span
      aria-label={`${n} pendências`}
      className="ml-auto shrink-0 rounded-full bg-destructive px-1.5 py-px text-[11px] font-semibold tabular-nums text-destructive-foreground"
    >
      {badgeText(n)}
    </span>
  ) : null;

// ---- Modo trilho (colapsado): só ícones com tooltip. A search vai junto no
// Link — sem ela o destino cai na visão errada (ex.: fase do pipeline).
const railClasses = (active: boolean) =>
  cn(
    "relative mx-auto flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
    active
      ? "bg-claro/[0.09] text-claro ring-1 ring-inset ring-claro/10"
      : "text-sidebar-foreground/70 hover:bg-claro/[0.05] hover:text-claro",
  );

const railDot = (n: number) =>
  n > 0 ? (
    <span
      aria-label={`${n} pendências`}
      className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive"
    />
  ) : null;

export function ItemSecao({ secao, nav }: { secao: Secao; nav: NavItemCtx }) {
  const { ctx, badges, onNavigate, secaoAcesa } = nav;
  const active = secaoAcesa?.id === secao.id;
  return (
    <li key={secao.id}>
      <Link
        to={secao.to}
        search={secao.search}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-11 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors md:min-h-9",
          active
            ? "bg-claro/[0.07] font-medium text-claro before:absolute before:-left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:rounded-full before:bg-gold"
            : "text-sidebar-foreground/65 hover:bg-claro/[0.04] hover:text-claro",
        )}
      >
        <span className="flex-1 truncate">{secao.label}</span>
        {countPill(badgeDaSecao(secao, badges, ctx))}
      </Link>
    </li>
  );
}

export function ItemModulo({ sistema: s, nav }: { sistema: Sistema; nav: NavItemCtx }) {
  const { ctx, badges, onNavigate, ativo, secoesDoAtivo } = nav;
  // Seções só aparecem quando há escolha: módulo de uma página só (Modo
  // Visita) é o próprio item da lista.
  const mostraSecoes = (s: Sistema) => s.id === ativo?.id && secoesDoAtivo.length > 1;
  const renderSecao = (secao: Secao) => <ItemSecao key={secao.id} secao={secao} nav={nav} />;
  const Icon = s.icon;
  const eAtivo = s.id === ativo?.id;
  const aberto = mostraSecoes(s);
  return (
    <li key={s.id}>
      <Link
        {...homeDoSistema(s, ctx)}
        onClick={onNavigate}
        // Com as seções abertas, quem diz "página atual" é a seção acesa.
        aria-current={eAtivo && !aberto ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors md:min-h-10",
          eAtivo
            ? "bg-claro/[0.09] font-medium text-claro ring-1 ring-inset ring-claro/10"
            : "text-sidebar-foreground/75 hover:bg-claro/[0.05] hover:text-claro",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" weight="regular" />
        <span className="flex-1 truncate" title={s.titulo}>
          {s.titulo}
        </span>
        {!aberto && countPill(badgeDoSistema(s, badges, ctx))}
      </Link>
      {aberto && (
        <ul
          aria-label={`Páginas de ${s.titulo}`}
          className="mb-1.5 ml-[21px] mt-1 space-y-0.5 border-l border-claro/10 pl-2.5"
        >
          {secoesDoAtivo.map(renderSecao)}
        </ul>
      )}
    </li>
  );
}

export function ItemTrilhoModulo({ sistema: s, nav }: { sistema: Sistema; nav: NavItemCtx }) {
  const { ctx, badges, onNavigate, ativo } = nav;
  const Icon = s.icon;
  const eAtivo = s.id === ativo?.id;
  const n = badgeDoSistema(s, badges, ctx);
  return (
    <li key={s.id}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            {...homeDoSistema(s, ctx)}
            onClick={onNavigate}
            aria-current={eAtivo ? "page" : undefined}
            aria-label={s.titulo}
            className={railClasses(eAtivo)}
          >
            <Icon className="h-5 w-5" weight="regular" />
            {railDot(n)}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {s.titulo}
          {n > 0 && <span className="tabular-nums">{badgeText(n)}</span>}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

export function ItemTrilhoSecao({ secao, nav }: { secao: Secao; nav: NavItemCtx }) {
  const { ctx, badges, onNavigate, secaoAcesa } = nav;
  const Icon = secao.icon;
  const active = secaoAcesa?.id === secao.id;
  const n = badgeDaSecao(secao, badges, ctx);
  return (
    <li key={secao.id}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={secao.to}
            search={secao.search}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            aria-label={secao.label}
            className={cn(railClasses(active), "h-9 w-9")}
          >
            <Icon className="h-4 w-4" weight={active ? "fill" : "regular"} />
            {railDot(n)}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{secao.label}</TooltipContent>
      </Tooltip>
    </li>
  );
}
