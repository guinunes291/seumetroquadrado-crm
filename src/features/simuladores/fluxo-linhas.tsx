// Peças da tela para os simuladores "por linhas com teto" (Vibra, Mundo
// Apto): cada tipo de parcela é uma linha com quantidade, teto e o valor que o
// corretor digita (da parcela ou do total), o status FECHOU / FALTA / SOBRA,
// quanto custa esperar e o cronograma. As regras ficam no motor de cada
// construtora; aqui só a apresentação, igual nas duas abas.

import type { ReactNode } from "react";
import { CheckCircle, Eraser, Hourglass, ListChecks, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { centavos } from "@/lib/amortizacao";
import { rotuloMes, type Competencia } from "@/lib/simuladores/fluxo";
import { cn } from "@/lib/utils";
import { brl } from "./estado";
import { CampoValor } from "./pecas";

export type TomStatus = "ok" | "pendente" | "neutro";

export function StatusFluxo({ tom, texto }: { tom: TomStatus; texto: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-bold",
        tom === "ok" && "border-exito-500 bg-exito-500/10 text-exito-700 dark:text-exito-300",
        tom === "pendente" &&
          "border-perigo-500 bg-perigo-500/5 text-perigo-700 dark:text-perigo-300",
        tom === "neutro" && "bg-muted/40 font-medium text-muted-foreground",
      )}
    >
      {tom === "ok" ? (
        <CheckCircle weight="fill" className="h-5 w-5 shrink-0" />
      ) : (
        <WarningCircle className="h-5 w-5 shrink-0" />
      )}
      <span>{texto}</span>
    </div>
  );
}

/** Uma linha do fluxo já pronta para a tela. */
export interface LinhaVisivel {
  id: string;
  rotulo: string;
  qtd: number;
  valor: number;
  total: number;
  /** "fev/2027 a mar/2027 · máx. R$ 1.400,00 cada (28% da renda)". */
  descricao: string;
  /** Verde (dentro do teto), vermelho (acima) ou sem cor. */
  tom: "ok" | "excedeu" | "neutro";
}

const GRADE_LINHA = "sm:grid-cols-[minmax(0,1fr)_2.5rem_8.5rem_8.5rem]";

export function CardLinhasFluxo({
  linhas,
  onValor,
  instrucao,
  rotuloPreencher,
  preencher,
  podePreencher,
  zerar,
  rodape,
}: {
  linhas: LinhaVisivel[];
  onValor: (id: string, valorDaParcela: number) => void;
  instrucao: string;
  rotuloPreencher: string;
  preencher: () => void;
  podePreencher: boolean;
  zerar: () => void;
  rodape: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm">Fluxo de pagamento</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={zerar}>
            <Eraser className="mr-1.5 h-4 w-4" /> Zerar
          </Button>
          <Button size="sm" onClick={preencher} disabled={!podePreencher}>
            <ListChecks className="mr-1.5 h-4 w-4" /> {rotuloPreencher}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">{instrucao}</p>
        <div
          className={cn(
            "hidden gap-2 border-b pb-1 text-[11px] font-medium text-muted-foreground sm:grid",
            GRADE_LINHA,
          )}
        >
          <span>Parcela</span>
          <span className="text-center">Qtd</span>
          <span className="text-right">Valor da parcela</span>
          <span className="text-right">Total</span>
        </div>
        <ul>
          {linhas.map((l) => (
            <LinhaFluxo key={l.id} l={l} onValor={(v) => onValor(l.id, v)} />
          ))}
        </ul>
        <div className="space-y-1 border-t pt-2 text-sm">{rodape}</div>
      </CardContent>
    </Card>
  );
}

function LinhaFluxo({ l, onValor }: { l: LinhaVisivel; onValor: (v: number) => void }) {
  const ativa = l.qtd > 0;
  const tom =
    l.tom === "excedeu"
      ? "border-perigo-500 bg-perigo-500/5"
      : l.tom === "ok"
        ? "border-exito-500 bg-exito-500/5"
        : "";
  return (
    <li
      className={cn(
        "grid grid-cols-2 items-center gap-x-2 gap-y-1.5 border-b py-2 last:border-0",
        GRADE_LINHA,
        !ativa && "opacity-55",
      )}
    >
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="text-sm font-medium">
          {l.rotulo}
          {ativa && l.qtd > 1 && (
            <span className="font-normal text-muted-foreground sm:hidden"> · {l.qtd}x</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">{l.descricao}</div>
      </div>
      <div className="hidden text-center text-sm tabular-nums sm:block">{ativa ? l.qtd : "-"}</div>
      <CampoValor
        rotulo={`${l.rotulo}: valor da parcela`}
        value={l.valor}
        onChange={onValor}
        disabled={!ativa}
        className={tom}
      />
      {l.qtd > 1 ? (
        <CampoValor
          rotulo={`${l.rotulo}: total`}
          value={l.total}
          onChange={(t) => onValor(centavos(t / l.qtd))}
          className={tom}
        />
      ) : (
        <div className="pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {l.total > 0 ? brl(l.total) : "-"}
        </div>
      )}
    </li>
  );
}

/** Linha do rodapé do card do fluxo ("Pró-soluto ... 12,5%"). */
export function LinhaRodape({
  rotulo,
  valor,
  forte,
  alerta,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-3", forte ? "font-semibold" : "text-xs")}>
      <span className={cn(!forte && "text-muted-foreground")}>{rotulo}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          !forte && "font-semibold",
          alerta && "text-perigo-600 dark:text-perigo-400",
        )}
      >
        {valor}
      </span>
    </div>
  );
}

export interface CenarioEsperaLinhas {
  hoje: Competencia;
  mensais: number;
  capacidadeParcelado: number;
  atosMinimos: number;
  diferenca: number;
}

export function QuantoCustaEsperarLinhas({
  cenarios,
  rotuloAtos,
}: {
  cenarios: CenarioEsperaLinhas[];
  /** "os atos", "ato e entradas". */
  rotuloAtos: string;
}) {
  if (cenarios.length < 2 || cenarios[0].mensais === 0) return null;
  const [agora, prox] = cenarios;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Hourglass className="h-4 w-4 text-gold-600" /> Quanto custa esperar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Assinando em <b>{rotuloMes(agora.hoje)}</b> são <b>{agora.mensais} mensais</b> e{" "}
          {rotuloAtos} precisam somar no mínimo <b>{brl(agora.atosMinimos)}</b>.{" "}
          {prox.mensais < agora.mensais &&
            (prox.diferenca > 0 ? (
              <>
                Em {rotuloMes(prox.hoje)} sobram {prox.mensais} e esse mínimo sobe{" "}
                <b>{brl(prox.diferenca)}</b>.
              </>
            ) : (
              <>
                Em {rotuloMes(prox.hoje)} sobram {prox.mensais}; o mínimo ainda não sobe porque o
                fluxo tem folga (ou o pró-soluto já está no limite).
              </>
            ))}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1.5 pr-3 text-left font-medium">Assinando em</th>
                <th className="py-1.5 pr-3 text-right font-medium">Mensais</th>
                <th className="hidden py-1.5 pr-3 text-right font-medium sm:table-cell">
                  Parcelado máx.
                </th>
                <th className="py-1.5 pr-3 text-right font-medium">Entrada mínima</th>
                <th className="py-1.5 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {cenarios.map((c, i) => (
                <tr
                  key={c.hoje}
                  className={cn("border-b last:border-0", i === 0 && "font-semibold")}
                >
                  <td className="py-1.5 pr-3">
                    {rotuloMes(c.hoje)}
                    {i === 0 && " (agora)"}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{c.mensais}</td>
                  <td className="hidden py-1.5 pr-3 text-right sm:table-cell">
                    {brl(c.capacidadeParcelado)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{brl(c.atosMinimos)}</td>
                  <td
                    className={cn(
                      "py-1.5 text-right",
                      c.diferenca > 0 && "text-perigo-600 dark:text-perigo-400",
                    )}
                  >
                    {i === 0 ? "-" : `+${brl(c.diferenca)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export interface ParcelaCronograma {
  competencia: Competencia;
  id: string;
  rotulo: string;
  valor: number;
  /** Fundo da linha: entrada (dourado), intermediária, pós ou nenhum (mensal). */
  destaque: "entrada" | "intermediaria" | "pos" | null;
}

const TOM_CRONOGRAMA: Record<NonNullable<ParcelaCronograma["destaque"]>, string> = {
  entrada: "bg-gold/10",
  intermediaria: "bg-anil-500/5",
  pos: "bg-ardosia-500/5",
};

export function CronogramaLinhas({ parcelas }: { parcelas: ParcelaCronograma[] }) {
  if (parcelas.length === 0) return null;
  let acumulado = 0;
  const TH = "sticky top-0 bg-card px-2 py-2 text-right font-medium text-muted-foreground";
  const TD = "px-2 py-1.5 text-right tabular-nums";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cronograma mês a mês</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className={cn(TH, "text-left")}>Mês</th>
                <th className={cn(TH, "text-left")}>Parcela</th>
                <th className={TH}>Valor</th>
                <th className={TH}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p, i) => {
                acumulado = centavos(acumulado + p.valor);
                return (
                  <tr
                    key={`${p.competencia}-${p.id}-${i}`}
                    className={cn(
                      "border-b last:border-0",
                      p.destaque && TOM_CRONOGRAMA[p.destaque],
                    )}
                  >
                    <td className={cn(TD, "text-left")}>{rotuloMes(p.competencia)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-left")}>{p.rotulo}</td>
                    <td className={cn(TD, "font-semibold")}>{brl(p.valor)}</td>
                    <td className={TD}>{brl(acumulado)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
