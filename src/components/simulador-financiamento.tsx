import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Calculator, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { parseValorBR } from "@/lib/simulador";
import { calcularOrcamento, avaliarAderencia, brl } from "@/lib/orcamento";

type Props = {
  valorImovelInicial?: number | null;
  entradaInicial?: string | number | null;
  rendaInicial?: string | number | null;
  fgtsInicial?: string | number | null;
};

/** Pré-qualificação do lead pela tabela APROVE 2026 (motor de orçamento real, não
 *  Price genérico). Mostra o TETO de imóvel que o cliente alcança e, se informado
 *  o preço de um imóvel, se ele cabe (avaliação + regra 80/20 da construtora). */
export function SimuladorFinanciamento({
  valorImovelInicial,
  entradaInicial,
  rendaInicial,
  fgtsInicial,
}: Props) {
  const numOr = (v: string | number | null | undefined) =>
    typeof v === "number" ? v : (parseValorBR(v ?? null) ?? 0);

  const [renda, setRenda] = useState<number>(numOr(rendaInicial));
  const [entrada, setEntrada] = useState<number>(numOr(entradaInicial));
  const [fgts, setFgts] = useState<number>(numOr(fgtsInicial));
  const [tem36, setTem36] = useState<boolean>(false);
  const [temDependente, setTemDependente] = useState<boolean>(false);
  const [valorImovel, setValorImovel] = useState<number>(valorImovelInicial ?? 0);

  const orc = useMemo(
    () =>
      calcularOrcamento({
        renda,
        tem36MesesRegistro: tem36,
        temDependente,
        fgts,
        entrada,
      }),
    [renda, tem36, temDependente, fgts, entrada],
  );

  const aderencia = useMemo(
    () => (valorImovel > 0 && orc.enquadra ? avaliarAderencia(valorImovel, orc) : null),
    [valorImovel, orc],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Calculator className="h-4 w-4 text-primary" /> Pré-qualificação APROVE 2026
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Renda familiar (mensal)">
            <Input
              type="number"
              inputMode="numeric"
              value={renda || ""}
              onChange={(e) => setRenda(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
          <Field label="Entrada / recursos próprios">
            <Input
              type="number"
              value={entrada || ""}
              onChange={(e) => setEntrada(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
          <Field label="FGTS disponível">
            <Input
              type="number"
              value={fgts || ""}
              onChange={(e) => setFgts(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <SwitchRow
            checked={tem36}
            onChange={setTem36}
            label="36 meses de registro"
            hint="Reduz a taxa — financia mais"
          />
          <SwitchRow
            checked={temDependente}
            onChange={setTemDependente}
            label="Tem dependente"
            hint="Subsídio maior (Faixa 1)"
          />
        </div>

        {!orc.enquadra ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-500/5 p-3 text-sm text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{orc.motivoNaoEnquadra ?? "Renda fora da tabela APROVE."}</span>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Pode comprar até</div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">Faixa {orc.faixa}</Badge>
                  <Badge variant="outline">{orc.segmento}</Badge>
                </div>
              </div>
              <div className="mt-0.5 text-2xl font-bold text-primary">{brl(orc.tetoImovel)}</div>
              <div className="text-[11px] text-muted-foreground">
                limitado pela avaliação do segmento ({brl(orc.tetoAvaliacaoSegmento)})
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Resultado titulo="Parcela estimada" valor={brl(orc.parcelaEstimada)} sub={`taxa ${orc.taxaEfetiva}`} />
              <Resultado titulo="Financiamento" valor={brl(orc.financiamento)} sub={orc.usouRedutor ? "com redutor" : "sem redutor"} />
              <Resultado titulo="Subsídio" valor={brl(orc.subsidio)} sub={orc.subsidio > 0 ? "Faixa 1" : "não contempla"} />
              <Resultado titulo="Recursos (não construtora)" valor={brl(orc.recursosNaoConstrutora)} sub="fin + sub + FGTS + entrada" />
            </div>

            <div className="border-t pt-3">
              <Field label="Esse imóvel cabe? (preço do imóvel)">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={valorImovel || ""}
                  onChange={(e) => setValorImovel(Number(e.target.value) || 0)}
                  placeholder="informe o preço para avaliar"
                />
              </Field>

              {aderencia && (
                <div
                  className={cn(
                    "mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm",
                    aderencia.cabe
                      ? "border-emerald-300 bg-emerald-500/5 text-emerald-700"
                      : "border-rose-300 bg-rose-500/5 text-rose-700",
                  )}
                >
                  {aderencia.cabe ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      {aderencia.cabe ? "Cabe no orçamento" : "Não cabe no orçamento"}
                      {" — "}
                      {aderencia.folga >= 0
                        ? `folga de ${brl(aderencia.folga)}`
                        : `${brl(-aderencia.folga)} acima do teto`}
                    </div>
                    <div className="text-[11px] opacity-90">
                      {!aderencia.dentroDaAvaliacao
                        ? `Acima da avaliação do segmento (${brl(orc.tetoAvaliacaoSegmento)}).`
                        : aderencia.estouraParcelamento
                          ? `Construtora teria que parcelar ${aderencia.percentualConstrutora}% (acima de 20%).`
                          : `Construtora parcela ${brl(aderencia.valorParcelarConstrutora)} (${aderencia.percentualConstrutora}% do imóvel).`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          Estimativa comercial de pré-qualificação (tabela APROVE 2026) — não substitui a análise
          oficial da Caixa nem garante aprovação.
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

function SwitchRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Resultado({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="mt-0.5 text-lg font-bold">{valor}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
