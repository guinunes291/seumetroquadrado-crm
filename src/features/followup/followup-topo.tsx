// O topo do Follow-Up na identidade Lançamento (como no vídeo de lançamento):
// a cadência por etapa, cada uma com o checklist do que a fecha, e a régua de
// toques como uma linha de passos. É a mesma ideia de "uma entrega na outra"
// que pôs a cadência como seção deste módulo (ver sistemas.ts): até o cliente
// responder, a cadência; depois, a régua.
//
// Só leitura, e com números de verdade. O vídeo desenha três dias; o CRM tem
// quatro etapas (Lead chegou, 1º e 2º follow-up, encerramento) e mostra as
// quatro. A régua entra DEPOIS DA RESPOSTA — o vídeo diz "depois do D3", mas
// o lead que cumpre o encerramento sem responder vai para o descanso e a
// reativação, não para a régua (docs/ops/cadencia-followup-reativacao.md).
//
// Sem consulta nova: a cadência é a mesma leitura do Kanban da cadência e a
// régua, a mesma da fila logo abaixo (mesmas chaves de cache).

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle, Circle, Kanban, Phone, UserPlus } from "@phosphor-icons/react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { REGUA_PADRAO } from "@/lib/regua-followup";
import { fetchKanbanCadencia } from "@/features/cadencia/client";
import { ROTULO_ETAPA, type EtapaCadencia } from "@/features/cadencia/templates";
import { carregarRegua, fetchFilaFollowUp } from "@/features/followup/fila-client";
import {
  legendaLigacoes,
  resumoDaCadencia,
  toquesDeHoje,
  type ResumoEtapa,
} from "@/features/followup/topo-derive";

/** O selo de cada etapa. "D0" é código interno (decisão do dono, 26/09: "o
 *  primeiro toque não é um follow-up") — o Lead chegou leva um ícone; D1, D2
 *  e D3 são as palavras da operação. */
function SeloEtapa({ etapa, ativo }: { etapa: EtapaCadencia; ativo: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold",
        ativo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {etapa === "D0" ? <UserPlus className="h-4 w-4" weight="fill" /> : etapa}
    </span>
  );
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function CartaoEtapa({ r }: { r: ResumoEtapa }) {
  return (
    <li
      data-testid="cadencia-etapa"
      className="flex w-[82%] shrink-0 snap-start flex-col rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground sm:w-auto"
    >
      <div className="flex items-center gap-3">
        <SeloEtapa etapa={r.etapa} ativo={r.total > 0} />
        <div className="min-w-0">
          <h3 className="truncate font-display text-[15px] font-bold">{ROTULO_ETAPA[r.etapa]}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {r.total === 0 ? "Nenhum cliente agora" : plural(r.total, "cliente", "clientes")}
          </p>
        </div>
      </div>
      {/* Os prazos só aparecem quando há o que cobrar — mesma regra dos
          selos do kanban. Etapa vencida em Lead chegou, 1º ou 2º follow-up
          vai para a roleta. A linha fica reservada mesmo vazia, para os
          checklists começarem na mesma altura em todos os cartões. */}
      <div className="mt-3 flex min-h-5 flex-wrap gap-1.5 text-[11px] font-medium">
        {r.venceram > 0 && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
            {plural(r.venceram, "venceu", "venceram")}
          </span>
        )}
        {r.venceHoje > 0 && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">
            {plural(r.venceHoje, "vence hoje", "vencem hoje")}
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-2.5">
        {r.passos.map((p) => {
          const completo = r.total > 0 && p.feitos === r.total;
          return (
            <li key={p.rotulo} className="flex items-center gap-2.5 text-sm">
              {completo ? (
                <CheckCircle className="h-5 w-5 shrink-0 text-success" weight="fill" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" />
              )}
              <span className="min-w-0 flex-1 truncate">{p.rotulo}</span>
              {r.total > 0 && !completo && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {p.feitos} de {r.total}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function CadenciaEtapas() {
  const { user } = useAuth();
  // Mesma chave do Kanban da cadência: uma leitura serve as duas telas.
  const kanban = useQuery({
    queryKey: ["cadencia:kanban", user?.id],
    queryFn: () => fetchKanbanCadencia(),
    enabled: Boolean(user?.id),
  });
  const itens = kanban.data?.itens ?? [];
  const cortado = (kanban.data?.total ?? 0) > itens.length;

  return (
    <section aria-label="Cadência até o cliente responder">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold">Até o cliente responder: a cadência</h2>
          <p className="text-xs text-muted-foreground">
            A etapa anda sozinha com as ligações e o WhatsApp registrados.
            {cortado && ` Contando os primeiros ${itens.length} clientes.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/cadencia"
            search={{ tab: "kanban" }}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <Kanban className="h-3.5 w-3.5" /> Kanban
          </Link>
          <Link
            to="/cadencia"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Fila do Dia <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      {kanban.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : kanban.isError ? (
        // O erro detalhado (com "tentar de novo") mora no Kanban da cadência.
        <p className="rounded-2xl border border-border-subtle bg-card p-4 text-sm text-muted-foreground">
          Não foi possível carregar a cadência agora.{" "}
          <button
            type="button"
            className="font-medium text-foreground underline"
            onClick={() => void kanban.refetch()}
          >
            Tentar de novo
          </button>
        </p>
      ) : (
        // No celular, uma faixa que desliza (o próximo cartão aparece na
        // borda): quatro cartões empilhados empurrariam a fila para longe.
        <ol className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
          {resumoDaCadencia(itens).map((r) => (
            <CartaoEtapa key={r.etapa} r={r} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function ReguaDeToques() {
  const { user } = useAuth();
  // Mesmas chaves da fila da régua, logo abaixo: nenhuma chamada a mais.
  const filaQ = useQuery({
    queryKey: ["followup:fila", user?.id],
    enabled: !!user,
    queryFn: () => fetchFilaFollowUp(),
  });
  const reguaQ = useQuery({
    queryKey: ["followup:regua"],
    staleTime: 5 * 60_000,
    queryFn: carregarRegua,
  });
  const regua = reguaQ.data ?? REGUA_PADRAO;
  const naFila = filaQ.data ? toquesDeHoje(filaQ.data.itens, regua.maxToques) : null;
  const totalHoje = filaQ.data?.itens.length ?? 0;
  const legenda = legendaLigacoes(regua.ligacaoNosToques);

  return (
    <section
      aria-label={`A régua dos ${regua.maxToques} toques`}
      className="rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground md:p-5"
    >
      <h2 className="font-display text-lg font-bold">
        Depois da resposta: a régua dos {regua.maxToques} toques
      </h2>
      <ol className="relative mt-4 flex items-start justify-between">
        <span
          aria-hidden="true"
          className="absolute inset-x-2.5 top-2.5 h-px bg-border sm:inset-x-3 sm:top-3 md:inset-x-4 md:top-4"
        />
        {Array.from({ length: regua.maxToques }, (_, i) => {
          const toque = i + 1;
          const hoje = naFila?.[i] ?? 0;
          const porLigacao = regua.ligacaoNosToques.includes(toque);
          return (
            <li
              key={toque}
              data-testid="regua-toque"
              data-hoje={hoje > 0 || undefined}
              aria-label={`Toque ${toque}${porLigacao ? ", por ligação" : ""}${
                hoje > 0 ? `, ${plural(hoje, "cliente", "clientes")} hoje` : ""
              }`}
              className="relative flex flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums sm:h-6 sm:w-6 md:h-8 md:w-8 md:text-xs",
                  hoje > 0
                    ? "border-gold-500 bg-gold-500 text-navy-900"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {toque}
              </span>
              {porLigacao && <Phone className="h-3 w-3 text-muted-foreground" aria-hidden />}
              {hoje > 0 && (
                <span className="text-[10px] font-semibold tabular-nums text-gold-700 dark:text-gold-400 md:text-[11px]">
                  {hoje}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Cada toque no canal certo, até a resposta ou a decisão
        {legenda ? ` — ${legenda}, os demais por WhatsApp` : ""}.
        {filaQ.data &&
          (totalHoje > 0
            ? ` Hoje: ${plural(totalHoje, "cliente", "clientes")} na fila, em dourado no toque em que está.`
            : " Hoje: fila da régua zerada.")}
      </p>
    </section>
  );
}

/** Cadência e régua, nessa ordem — a ordem em que o cliente passa por elas. */
export function FollowUpTopo() {
  return (
    <div className="space-y-4">
      <CadenciaEtapas />
      <ReguaDeToques />
    </div>
  );
}
