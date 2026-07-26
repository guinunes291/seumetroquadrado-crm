// Indicadores visuais da listagem de leads (temperatura e inatividade) —
// extraídos de leads.index.tsx sem mudança de comportamento.

import { Flame, Thermometer, Snowflake, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LIMIARES, diasSemContato } from "@/lib/lead-flags";
import type { Lead } from "./types";

export function TempIcon({ temp }: { temp: string | null }) {
  if (temp === "quente")
    return <Flame className="h-3.5 w-3.5 text-destructive" aria-label="Quente" />;
  if (temp === "morno")
    return <Thermometer className="h-3.5 w-3.5 text-warning" aria-label="Morno" />;
  if (temp === "frio") return <Snowflake className="h-3.5 w-3.5 text-info" aria-label="Frio" />;
  return null;
}

// Status em que "parado" não faz sentido: finalizados (mesma lista da régua
// única em lead-flags) + `novo` (ainda sem dono) + `aguardando_atendimento`
// (a urgência ali é o SLA/flag "atrasado", não a inatividade).
const SEM_INATIVIDADE = new Set([
  "contrato_fechado",
  "perdido",
  "pos_venda",
  "novo",
  "aguardando_atendimento",
]);

/**
 * Badge "Nd parado" com os limiares da régua única (lead-flags.LIMIARES).
 * Mantido para superfícies que não usam os FlagChips; na tabela/cards da
 * lista os chips já carregam os dias — não exiba os dois juntos.
 */
export function InatividadeBadge({ lead, now }: { lead: Lead; now?: Date }) {
  if (SEM_INATIVIDADE.has(lead.status)) return null;
  const dias = diasSemContato(lead, now);
  if (dias == null || dias < LIMIARES.ATENCAO_DIAS) return null;
  const tone =
    dias >= LIMIARES.SEM_CONTATO_DIAS
      ? "bg-destructive/15 text-destructive"
      : "bg-warning/15 text-warning";
  return (
    <Badge variant="secondary" className={`${tone} gap-1`} title={`Sem interação há ${dias} dias`}>
      <AlertCircle className="h-3 w-3" /> {dias}d parado
    </Badge>
  );
}
