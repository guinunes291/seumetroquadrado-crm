// "Meus 65": o corretor vê quem disputa as vagas de Em atendimento, na ordem
// da regra, e escolhe quem quer manter (decisão 2.5: "nesse período o
// corretor escolhe os seus 65"). A escolha põe o lead na frente da disputa,
// mas NÃO segura o relógio (decisão do dono, 03/10/2026): escolhido sem toque
// em 5 dias desce do mesmo jeito — por isso cada escolhido mostra até quando
// precisa de um toque. A gestão abre a tela de um corretor em leitura.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ACAO_LABEL,
  dataCurta,
  prazoParaManter,
  tomContador,
  type LinhaMeus65,
} from "@/lib/em-atendimento";
import {
  escolherEmAtendimento,
  invalidarEmAtendimento,
  useEmAtendimentoContador,
  useMeus65,
} from "./use-em-atendimento";

const ACAO_TOM: Record<string, string> = {
  fica: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  excedente: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  perde_vaga: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  porta_cadencia: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function Meus65Page({ corretorId }: { corretorId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const outro = !!corretorId && corretorId !== user?.id;
  const alvo = outro ? corretorId : undefined;
  const contador = useEmAtendimentoContador(alvo);
  const meus = useMeus65(alvo);

  const escolher = useMutation({
    mutationFn: ({ leadId, sim }: { leadId: string; sim: boolean }) =>
      escolherEmAtendimento(leadId, sim),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(
          `Você já escolheu ${r.escolhidos} de ${r.teto}. Desmarque um para escolher outro.`,
        );
        return;
      }
      invalidarEmAtendimento(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = contador.data;
  const teto = c?.teto ?? 65;
  const linhas = meus.data ?? [];

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {outro ? `Os ${teto} do corretor` : `Meus ${teto}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {outro
            ? "Quem disputa as vagas de Em atendimento deste corretor, na ordem da regra. Leitura."
            : "Quem fica nas suas vagas de Em atendimento. Escolha quem você quer manter; a escolha põe o lead na frente da disputa."}
        </p>
      </header>

      {contador.isPending || meus.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !c || meus.data === null ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Sem dado: a regra dos 65 ainda não está disponível neste ambiente.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card data-testid="meus-65-placar">
            <CardContent className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-4">
              <p className="text-2xl font-semibold tabular-nums">
                {c.em_atendimento}
                <span className="text-base font-medium text-muted-foreground">/{c.teto}</span>{" "}
                <span className="text-sm font-normal text-muted-foreground">em atendimento</span>
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{c.escolhidos}</span>{" "}
                escolhidos
              </p>
              <p className="text-sm text-muted-foreground">
                Minha base:{" "}
                <span className="font-medium text-foreground tabular-nums">{c.minha_base}</span>
              </p>
              {tomContador(c) === "lotado" && (
                <p className="text-sm text-rose-700 dark:text-rose-300">
                  Lotado: para pôr mais um, libere uma vaga (entra um, sai um).
                </p>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            {c.modo === "sombra"
              ? "A regra está em modo sombra: nenhum lead é movido por robô. "
              : ""}
            A escolha não segura o relógio: sem ligação ou WhatsApp registrado em {c.dias_sem_toque}{" "}
            dias, o lead desce para a Minha base mesmo escolhido.
          </p>

          {linhas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Nenhum lead em Em atendimento.
              </CardContent>
            </Card>
          ) : (
            <ul className="divide-y rounded-xl border bg-card" data-testid="meus-65-lista">
              {linhas.map((l) => (
                <LinhaDos65
                  key={l.lead_id}
                  linha={l}
                  diasSemToque={c.dias_sem_toque}
                  somenteLeitura={outro}
                  pendente={escolher.isPending}
                  onEscolher={(sim) => escolher.mutate({ leadId: l.lead_id, sim })}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function LinhaDos65({
  linha,
  diasSemToque,
  somenteLeitura,
  pendente,
  onEscolher,
}: {
  linha: LinhaMeus65;
  diasSemToque: number;
  somenteLeitura: boolean;
  pendente: boolean;
  onEscolher: (sim: boolean) => void;
}) {
  const prazo =
    linha.escolhido && linha.acao === "fica"
      ? prazoParaManter(linha.movimento, diasSemToque)
      : null;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5" data-testid="meus-65-linha">
      <span className="w-7 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {linha.posicao ?? "—"}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          to="/leads/$leadId"
          params={{ leadId: linha.lead_id }}
          className="block truncate text-sm font-medium hover:underline"
        >
          {linha.nome}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {linha.projeto_nome ?? "sem empreendimento"}
          {linha.temperatura ? ` · ${linha.temperatura}` : ""} · {linha.dias_sem_toque}{" "}
          {linha.dias_sem_toque === 1 ? "dia" : "dias"} sem toque
          {prazo ? ` · toque até ${dataCurta(prazo)} para manter` : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
          ACAO_TOM[linha.acao] ?? "bg-muted text-muted-foreground",
        )}
        title={linha.motivo ?? undefined}
      >
        {ACAO_LABEL[linha.acao] ?? linha.acao}
      </span>
      {!somenteLeitura && (
        <label className="flex shrink-0 items-center gap-1.5 text-xs">
          <Checkbox
            checked={linha.escolhido}
            disabled={pendente}
            onCheckedChange={(v) => onEscolher(v === true)}
            aria-label={`Manter ${linha.nome} nos meus 65`}
          />
          Manter
        </label>
      )}
    </li>
  );
}
