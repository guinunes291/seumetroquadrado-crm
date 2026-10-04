// O contador "X/65 em atendimento" (regra dos 65, decisão 2.5: "o corretor vê
// sempre o contador"). Verde até a trava da roleta, âmbar até o teto,
// vermelho lotado. Leva à tela "Meus 65". Só aparece para conta de corretor
// (contas sem o papel não têm teto) e some em banco sem a migration.
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { tomContador, type TomContador } from "@/lib/em-atendimento";
import { useEmAtendimentoContador } from "./use-em-atendimento";

const TOM_CLASSE: Record<TomContador, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  alerta: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  lotado: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function ContadorEmAtendimento({
  corretorId,
  className,
}: {
  /** Outro corretor (gestão). Sem valor, o próprio. */
  corretorId?: string | null;
  className?: string;
}) {
  const q = useEmAtendimentoContador(corretorId);
  const c = q.data;
  if (!c || !c.corretor) return null;
  const tom = tomContador(c);
  const titulo =
    tom === "lotado"
      ? `Em atendimento lotado (${c.em_atendimento} de ${c.teto}). Para pôr mais um, libere uma vaga: entra um, sai um.`
      : tom === "alerta"
        ? `${c.em_atendimento} de ${c.teto} em atendimento. A roleta trava em ${c.trava_roleta} quando a regra ligar.`
        : `${c.em_atendimento} de ${c.teto} em atendimento.`;
  return (
    <Link
      to="/meus-65"
      search={corretorId ? { corretor: corretorId } : {}}
      title={titulo}
      data-testid="contador-em-atendimento"
      data-tom={tom}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium tabular-nums transition hover:brightness-95",
        TOM_CLASSE[tom],
        className,
      )}
    >
      <span className="font-semibold">
        {c.em_atendimento}/{c.teto}
      </span>
      em atendimento
      {tom === "lotado" && <span className="font-semibold">· lotado</span>}
    </Link>
  );
}
