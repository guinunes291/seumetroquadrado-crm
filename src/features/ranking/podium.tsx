import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Medal, type MedalTier } from "@/features/ranking/medal";
import { cn } from "@/lib/utils";

/**
 * Pódio hero do Desempenho — top 3 em cards sobre superfície escura (TV do
 * ranking e Copa). O campeão fica ao centro, maior, com anel em gradiente
 * dourado + glow e o fio de luz beam-border (é O hero da tela — máx. um).
 * Números sempre em font-display com AnimatedNumber (tabular-nums); entrada
 * escalonada via stagger-children (campeão entra primeiro).
 */

export type PodiumEntry = {
  id: string;
  nome: string;
  /** Linha secundária opcional (ex.: nome do corretor sob a seleção na Copa). */
  legenda?: string | null;
  foto?: string | null;
  /** Emblema no lugar da foto (ex.: bandeira da seleção). */
  emblema?: string | null;
  valor: number;
  /** Sufixo curto do valor: "vendas", "pts"… */
  unidade: string;
};

const TIER_BY_POS: Record<1 | 2 | 3, MedalTier> = { 1: "ouro", 2: "prata", 3: "bronze" };

// Classes estáticas por posição (Tailwind precisa das strings literais).
const CARD_BY_POS: Record<1 | 2 | 3, string> = {
  1: "order-2 beam-border border-gold-500/40 bg-navy-900/70 shadow-glow-gold sm:-translate-y-3 sm:p-6",
  2: "order-1 border-navy-700/60 bg-navy-900/50",
  3: "order-3 border-navy-700/60 bg-navy-900/50",
};

const RING_BY_POS: Record<1 | 2 | 3, string> = {
  1: "bg-gradient-gold p-[3px] shadow-glow-gold",
  2: "bg-gradient-to-br from-zinc-100 via-zinc-300 to-zinc-500 p-[2px]",
  3: "bg-gradient-to-br from-amber-500 via-amber-700 to-amber-900 p-[2px]",
};

function getInitials(nome: string): string {
  return nome
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function PodiumCard({ entry, pos }: { entry: PodiumEntry; pos: 1 | 2 | 3 }) {
  const first = pos === 1;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center rounded-2xl border p-4 text-center",
        CARD_BY_POS[pos],
      )}
    >
      <div className="relative mb-2">
        <span className={cn("inline-flex rounded-full", RING_BY_POS[pos])}>
          <Avatar className={first ? "h-24 w-24" : "h-16 w-16"}>
            {entry.foto && <AvatarImage src={entry.foto} />}
            <AvatarFallback
              className={cn(
                "bg-navy-800 text-white",
                entry.emblema ? (first ? "text-4xl" : "text-2xl") : "font-semibold",
              )}
            >
              {entry.emblema ?? getInitials(entry.nome)}
            </AvatarFallback>
          </Avatar>
        </span>
        <Medal
          tier={TIER_BY_POS[pos]}
          size={first ? "md" : "sm"}
          title={`${pos}º lugar`}
          className="absolute -right-1 -top-1 z-10"
        >
          {pos}
        </Medal>
      </div>
      <p
        className={cn(
          "w-full truncate text-sm font-semibold",
          first ? "text-gold-300" : "text-white",
        )}
      >
        {entry.nome}
      </p>
      {entry.legenda && (
        <p className="w-full truncate text-[11px] text-navy-300">{entry.legenda}</p>
      )}
      <div
        className={cn(
          "font-display mt-1 font-semibold tabular-nums text-white",
          first ? "text-3xl" : "text-xl",
        )}
      >
        <AnimatedNumber value={entry.valor} />
      </div>
      <div className="text-[11px] uppercase tracking-wider text-navy-300">{entry.unidade}</div>
    </div>
  );
}

export function Podium({
  entries,
  emptyMessage = "Nenhum corretor no ranking",
  className,
}: {
  entries: PodiumEntry[];
  emptyMessage?: string;
  className?: string;
}) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-navy-400">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className={cn("stagger-children grid grid-cols-3 items-end gap-3 py-2", className)}>
      {top3.map((entry, i) => (
        <PodiumCard key={entry.id} entry={entry} pos={(i + 1) as 1 | 2 | 3} />
      ))}
    </div>
  );
}
