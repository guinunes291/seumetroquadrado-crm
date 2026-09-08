import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Medal, type MedalTier } from "@/features/ranking/medal";
import { cn } from "@/lib/utils";

export type PodiumEntry = {
  id: string;
  nome: string;
  legenda?: string | null;
  foto?: string | null;
  emblema?: string | null;
  valor: number;
  valorTexto?: string;
  unidade: string;
  detalhe?: string | null;
  posicao?: 1 | 2 | 3;
};
const TIER: Record<1 | 2 | 3, MedalTier> = { 1: "ouro", 2: "prata", 3: "bronze" };

/** Mantém os retratos circulares do CRM; o relevo fica na moldura e no card. */
export function Podium({
  entries,
  emptyMessage = "Nenhum corretor no ranking",
  className,
  onSelect,
  pagina,
  userKey,
}: {
  entries: PodiumEntry[];
  emptyMessage?: string;
  className?: string;
  onSelect?: (id: string) => void;
  pagina?: number;
  userKey?: string;
}) {
  const [manual, setManual] = useState(0);
  const pages = Math.max(1, Math.ceil(entries.length / 3));
  const current = (pagina ?? manual) % pages;
  const visible = entries.slice(current * 3, current * 3 + 3);
  if (!entries.length)
    return <div className="smq-podium-empty text-sm text-navy-300">{emptyMessage}</div>;
  return (
    <div className={cn("smq-podium-wrap", className)}>
      <div
        className="smq-podium"
        role="list"
        aria-label="Pódio dos corretores"
        data-tied={
          visible.some((r, i) => visible.some((o, j) => i !== j && r.posicao === o.posicao)) ||
          undefined
        }
      >
        {visible.map((entry, index) => {
          const rank = entry.posicao ?? ((index + 1) as 1 | 2 | 3);
          const tied = entries.filter((r) => r.posicao === rank).length > 1;
          const fullName = entry.legenda || entry.nome;
          const initials = entry.nome
            .trim()
            .split(/\s+/)
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <div
              role="listitem"
              key={entry.id}
              className={cn("smq-podium-slot", `smq-slot-${index + 1}`)}
              data-rank={rank}
            >
              <button
                type="button"
                className={cn("smq-contender", `smq-medal-${rank}`)}
                data-tilt
                data-self={entry.id === userKey || undefined}
                disabled={!onSelect}
                onClick={() => onSelect?.(entry.id)}
                aria-label={`Analisar ${fullName}, ${rank}º lugar${tied ? ", empatado" : ""}`}
              >
                <span className="smq-card-reflection" aria-hidden="true" />
                <span className="smq-podium-portrait">
                  <span className="smq-avatar-ring">
                    <Avatar className="smq-podium-avatar">
                      {entry.foto && <AvatarImage src={entry.foto} alt={fullName} />}
                      <AvatarFallback>{entry.emblema ?? initials}</AvatarFallback>
                    </Avatar>
                  </span>
                  <Medal
                    tier={TIER[rank]}
                    size={rank === 1 ? "md" : "sm"}
                    title={`${rank}º lugar`}
                    className="smq-podium-medal"
                  >
                    {rank}
                  </Medal>
                </span>
                <strong className="smq-first-name">{entry.nome}</strong>
                {entry.legenda && (
                  <span className="smq-full-name" title={fullName}>
                    {entry.legenda}
                  </span>
                )}
                <strong className="smq-podium-value">
                  {entry.valorTexto ?? <AnimatedNumber value={entry.valor} durationMs={700} />}
                </strong>
                <span className="smq-podium-unit">{entry.unidade}</span>
                {entry.detalhe && <span className="smq-podium-detail">{entry.detalhe}</span>}
                {tied && <span className="smq-tie-label">Posição compartilhada</span>}
              </button>
            </div>
          );
        })}
      </div>
      {pages > 1 && pagina === undefined && (
        <div className="smq-podium-pagination">
          <button type="button" onClick={() => setManual((p) => (p - 1 + pages) % pages)}>
            Anterior
          </button>
          <span>
            Empates no pódio · {current + 1}/{pages}
          </span>
          <button type="button" onClick={() => setManual((p) => (p + 1) % pages)}>
            Próximos
          </button>
        </div>
      )}
    </div>
  );
}
