// Papéis: os grupos que sistemas e atalhos usam como gate e a regra temPapel.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import type { AppRole } from "@/hooks/use-auth";
import type { PapelCtx } from "@/features/nav/sistemas-tipos";

export const GESTAO: AppRole[] = ["admin", "gestor", "superintendente"];

// Papéis da OPERAÇÃO de venda (2026-09-04): os hubs do dia do corretor e da
// gestão. O SDR (pré-venda) tem hub próprio e só compartilha Docs & Projetos —
// o resto seria cockpit vazio para ele (RLS não lhe mostra carteira alguma).
export const OPERACAO: AppRole[] = ["admin", "gestor", "corretor", "superintendente"];
// O papel `sdr` fica fora de OPERACAO de propósito (o dia dele é o hub /sdr),
// com uma exceção: Modo Foco (Prospecção) + Base de leads (hoje na Carteira).
// Quem virou SDR vindo de corretor ainda é `corretor_id` de leads agendados e
// de base da carteira antiga e precisa continuar controlando esses
// atendimentos pelo mesmo lugar (2026-09-04). O resto das seções desses dois
// módulos (Oferta Ativa, Discador, Kanban, Agenda, Tarefas) e as seções de
// gestão ficam gated por OPERACAO — a superfície do SDR não cresceu na
// reorganização de 2026-09-11.

/** Mesma regra da sidebar desde sempre: admin enxerga tudo. */
export function temPapel(permitidos: AppRole[] | undefined, ctx: PapelCtx): boolean {
  if (!permitidos) return true;
  if (ctx.isAdmin) return true;
  return permitidos.some((r) => ctx.roles.includes(r));
}
