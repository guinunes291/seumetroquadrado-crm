// Indicadores visuais da listagem de leads (temperatura e inatividade) —
// extraídos de leads.index.tsx sem mudança de comportamento.

import { Flame, Thermometer, Snowflake, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Lead } from "./types";

export function TempIcon({ temp }: { temp: string | null }) {
  if (temp === "quente")
    return <Flame className="h-3.5 w-3.5 text-destructive" aria-label="Quente" />;
  if (temp === "morno")
    return <Thermometer className="h-3.5 w-3.5 text-warning" aria-label="Morno" />;
  if (temp === "frio") return <Snowflake className="h-3.5 w-3.5 text-info" aria-label="Frio" />;
  return null;
}

export function InatividadeBadge({ lead }: { lead: Lead }) {
  const ativo = !["contrato_fechado", "perdido", "pos_venda", "novo"].includes(lead.status);
  if (!ativo) return null;
  const ref = lead.ultima_interacao ?? lead.created_at;
  if (!ref) return null;
  const dias = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  if (dias < 2) return null;
  const tone = dias >= 5 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning";
  return (
    <Badge variant="secondary" className={`${tone} gap-1`} title={`Sem interação há ${dias} dias`}>
      <AlertCircle className="h-3 w-3" /> {dias}d parado
    </Badge>
  );
}
