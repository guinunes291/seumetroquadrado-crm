import { Clock } from "@phosphor-icons/react";

/**
 * Carimbo de frescor de dados materializados ("Dados de HH:MM · atualização a
 * cada 15 min"). Obrigatório em toda seção que lê MV — número sem carimbo
 * parece ao vivo e mina a confiança quando diverge.
 */
export function AtualizadoEm({ quando }: { quando: string | null | undefined }) {
  if (!quando) return null;
  const d = new Date(quando);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" aria-hidden />
      Dados de {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · atualização
      a cada 15 min
    </span>
  );
}
