import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Calculator } from "lucide-react";
import { simular, parseValorBR, COMPROMETIMENTO_MAX } from "@/lib/simulador";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Props = {
  valorImovelInicial?: number | null;
  entradaInicial?: string | number | null;
  rendaInicial?: string | number | null;
};

/** Simulador rápido (tabela Price) para qualificar o lead na hora. Pré-preenche
 *  entrada/renda a partir do que o lead informou. */
export function SimuladorFinanciamento({
  valorImovelInicial,
  entradaInicial,
  rendaInicial,
}: Props) {
  const numOr = (v: string | number | null | undefined) =>
    typeof v === "number" ? v : (parseValorBR(v ?? null) ?? 0);

  const [valorImovel, setValorImovel] = useState<number>(valorImovelInicial ?? 0);
  const [entrada, setEntrada] = useState<number>(numOr(entradaInicial));
  const [renda, setRenda] = useState<number>(numOr(rendaInicial));
  const [jurosAnual, setJurosAnual] = useState<number>(10.5);
  const [meses, setMeses] = useState<number>(360);

  const r = useMemo(
    () => simular({ valorImovel, entrada, jurosAnual, meses, rendaMensal: renda }),
    [valorImovel, entrada, jurosAnual, meses, renda],
  );

  const comprometimentoPct =
    r.comprometimentoRenda != null ? Math.round(r.comprometimentoRenda * 100) : null;
  const ok = comprometimentoPct != null ? comprometimentoPct <= COMPROMETIMENTO_MAX * 100 : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Calculator className="h-4 w-4 text-primary" /> Simulador de financiamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Valor do imóvel">
            <Input
              type="number"
              inputMode="numeric"
              value={valorImovel || ""}
              onChange={(e) => setValorImovel(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
          <Field label="Entrada">
            <Input
              type="number"
              value={entrada || ""}
              onChange={(e) => setEntrada(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
          <Field label="Renda mensal">
            <Input
              type="number"
              value={renda || ""}
              onChange={(e) => setRenda(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
          <Field label="Juros (% a.a.)">
            <Input
              type="number"
              step="0.1"
              value={jurosAnual || ""}
              onChange={(e) => setJurosAnual(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Prazo (meses)">
            <Input
              type="number"
              value={meses || ""}
              onChange={(e) => setMeses(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Financiado">
            <div className="flex h-9 items-center text-sm font-medium">
              {fmtBRL(r.valorFinanciado)}
            </div>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Resultado titulo="Parcela estimada" valor={fmtBRL(r.parcela)} destaque />
          <Resultado
            titulo="Comprometimento da renda"
            valor={comprometimentoPct != null ? `${comprometimentoPct}%` : "—"}
            tom={ok == null ? undefined : ok ? "ok" : "alerta"}
            sub={
              comprometimentoPct != null
                ? ok
                  ? "dentro do limite"
                  : `acima de ${COMPROMETIMENTO_MAX * 100}%`
                : "informe a renda"
            }
          />
          <Resultado titulo="Renda mínima sugerida" valor={fmtBRL(r.rendaMinima)} />
        </div>

        <p className="text-[11px] text-muted-foreground">
          Estimativa pela tabela Price — não substitui a simulação oficial do banco.
        </p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Resultado({
  titulo,
  valor,
  sub,
  destaque,
  tom,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  destaque?: boolean;
  tom?: "ok" | "alerta";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tom === "alerta" && "border-rose-300 bg-rose-500/5",
        tom === "ok" && "border-emerald-300 bg-emerald-500/5",
      )}
    >
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div
        className={cn(
          "mt-0.5 font-bold",
          destaque ? "text-2xl" : "text-lg",
          tom === "alerta" && "text-rose-600",
          tom === "ok" && "text-emerald-600",
        )}
      >
        {valor}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
