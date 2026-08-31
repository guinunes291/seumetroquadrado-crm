// Peças compartilhadas das listas NOMINAIS de Relatórios: célula do cliente
// (nome → ficha do lead + telefone oculto), nome do corretor resolvido pelo
// mapa de profiles e a nota de teto de linhas.

import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TelefoneOculto } from "@/features/dashboard/telefone-oculto";

/** Nome do cliente linkado à ficha completa + telefone oculto embaixo. */
export function LeadCell({
  leadId,
  nome,
  telefone,
}: {
  leadId: string | null | undefined;
  nome: string | null | undefined;
  telefone?: string | null;
}) {
  const rotulo = nome?.trim() || "—";
  return (
    <div className="min-w-0">
      {leadId ? (
        <Link
          to="/leads/$leadId"
          params={{ leadId }}
          className="font-medium hover:underline truncate block max-w-[220px]"
          title={rotulo}
        >
          {rotulo}
        </Link>
      ) : (
        <span className="font-medium truncate block max-w-[220px]">{rotulo}</span>
      )}
      {telefone ? (
        <TelefoneOculto telefone={telefone} className="text-xs text-muted-foreground" />
      ) : null}
    </div>
  );
}

/** Nome do corretor responsável a partir do mapa id→nome (profiles). */
export function corretorNome(
  id: string | null | undefined,
  nomes: Map<string, string> | undefined,
): string {
  if (!id) return "Sem corretor";
  return nomes?.get(id) ?? "—";
}

/** "mostrando X de N" quando a consulta bateu no teto de linhas. */
export function NotaTeto({ mostrando, total }: { mostrando: number; total: number }) {
  if (total <= mostrando) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Mostrando {mostrando.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} — refine o
      período para ver tudo.
    </p>
  );
}

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const fmtBRLCompacto = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

export const dataCurta = (iso: string | null | undefined) =>
  iso ? format(parseISO(iso), "dd/MM/yy", { locale: ptBR }) : "—";

export const dataHora = (iso: string | null | undefined) =>
  iso ? format(parseISO(iso), "dd/MM/yy HH:mm", { locale: ptBR }) : "—";

export function VazioPeriodo({ children }: { children?: React.ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground">
      {children ?? "Sem dados neste período. Ajuste o filtro de data acima."}
    </p>
  );
}
