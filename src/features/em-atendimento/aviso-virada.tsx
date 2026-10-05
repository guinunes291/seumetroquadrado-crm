// O aviso da virada ao corretor (regra dos 65, Fatia 5). Enquanto a regra
// está agendada, diz a data e o que muda; nos primeiros dias ligada, diz que
// já vale. O texto é o do desenho (§2.3, §2.5 e §4): contato fora do CRM
// passa a custar a vaga, e isso tem de ser dito antes. Some em sombra e
// depois da primeira semana ligada; some também sem a migration.
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { avisoDaVirada } from "@/lib/em-atendimento";
import { useRegra65Config } from "@/features/gestao/regra-65/use-regra-65";

/** "13/10 às 09:00" — data e hora separadas para não depender da vírgula do locale. */
const fmtDataHora = (d: Date) =>
  `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString(
    "pt-BR",
    { hour: "2-digit", minute: "2-digit" },
  )}`;

export function AvisoViradaRegra65({ className }: { className?: string }) {
  const cfg = useRegra65Config();
  const c = cfg.data;
  const aviso = avisoDaVirada(c);
  if (!c || !aviso) return null;
  const dias = c.dias_sem_toque ?? 5;
  return (
    <div
      role="status"
      data-testid="aviso-virada-65"
      data-estado={aviso.estado}
      className={cn(
        "space-y-1 rounded-2xl border p-3 text-sm",
        aviso.estado === "agendada"
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-emerald-500/40 bg-emerald-500/10",
        className,
      )}
    >
      <p className="font-semibold">
        {aviso.estado === "agendada"
          ? `A regra dos ${c.teto} liga em ${fmtDataHora(aviso.viradaEm)}.`
          : `A regra dos ${c.teto} está valendo desde ${fmtDataHora(aviso.desde)}.`}
      </p>
      <p className="text-muted-foreground">
        No máximo {c.teto} leads em Em atendimento. {dias} dias sem contato registrado e o lead
        perde a vaga (desce para a Minha base); na Minha base, {dias} dias sem toque e o lead sai
        (pago volta à roleta, estoque vai ao Bolsão; o seu próprio fica). A roleta para de mandar
        lead novo com {c.trava_roleta} em atendimento ou {c.teto_base} na Minha base.{" "}
        <b className="text-foreground">Contato fora do CRM não conta</b>: registre a ligação e o
        WhatsApp.
      </p>
      <p>
        {aviso.estado === "agendada"
          ? "Até lá, escolha quem fica nos seus "
          : "Veja quem fica nos seus "}
        <Link to="/meus-65" search={{}} className="font-semibold underline">
          {c.teto}
        </Link>
        .
      </p>
    </div>
  );
}
