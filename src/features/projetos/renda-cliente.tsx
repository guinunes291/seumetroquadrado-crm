// Renda do cliente — a pergunta nº 1 do corretor na prateleira (decisão 8 de
// 2026-09-02): "o que cabe na renda deste cliente?". Informada aqui, cada card
// ganha o selo "Cabe / Não cabe" com a prestação estimada (PRICE, 30% da
// prestação total — lib/mcmv-estimativa) e o filtro "só o que cabe" fica
// disponível. É estimativa: o aviso acompanha sempre.

import { useEffect, useState } from "react";
import { Wallet, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { faixaPorRenda } from "@/lib/mcmv-estimativa";
import { RENDAS_RAPIDAS } from "@/lib/prateleira";
import { parseRenda } from "@/lib/renda";
import { formatBRL } from "@/lib/projetos";
import { cn } from "@/lib/utils";

export function RendaCliente({
  renda,
  onChange,
  soQueCabe,
  onSoQueCabe,
  nomeLead,
  className,
}: {
  renda: number | null;
  onChange: (renda: number | null) => void;
  soQueCabe: boolean;
  onSoQueCabe: (v: boolean) => void;
  /** Quando a prateleira foi aberta pelo dossiê de um lead. */
  nomeLead?: string | null;
  className?: string;
}) {
  const [texto, setTexto] = useState(renda != null ? String(renda) : "");

  // Renda vinda de fora (lead em contexto, chip) reflete no campo.
  useEffect(() => {
    setTexto(renda != null ? String(renda) : "");
  }, [renda]);

  const aplicar = (valor: string) => {
    setTexto(valor);
    onChange(parseRenda(valor));
  };

  const faixa = renda != null ? faixaPorRenda(renda) : null;

  return (
    <section
      aria-label="Renda do cliente"
      className={cn(
        "rounded-xl border border-gold-500/30 bg-card p-3 shadow-elev-1 sm:p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-command shadow-elev-1">
            <Wallet className="h-5 w-5 text-gold-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <Label
              htmlFor="renda-cliente"
              className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
            >
              {nomeLead
                ? `Renda familiar de ${nomeLead.split(" ")[0]}`
                : "Renda familiar do cliente"}
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="renda-cliente"
                value={texto}
                onChange={(e) => aplicar(e.target.value)}
                inputMode="numeric"
                placeholder="ex.: 4.000"
                aria-describedby="renda-cliente-ajuda"
                className="max-w-[12rem] tabular-nums"
              />
              {renda != null && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => aplicar("")}
                  aria-label="Limpar renda"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Rendas rápidas"
        >
          {RENDAS_RAPIDAS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => aplicar(renda === r ? "" : String(r))}
              aria-pressed={renda === r}
              className={cn(
                "press-scale inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium tabular-nums transition-colors",
                renda === r
                  ? "border-gold-500/60 bg-gold-500/15 text-foreground"
                  : "border-border-subtle bg-card text-muted-foreground hover:border-gold-500/40 hover:text-foreground",
              )}
            >
              {formatBRL(r)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 md:pl-2">
          <Switch
            id="so-que-cabe"
            checked={soQueCabe}
            disabled={renda == null}
            onCheckedChange={onSoQueCabe}
          />
          <Label
            htmlFor="so-que-cabe"
            className={cn("cursor-pointer text-sm", renda == null && "text-muted-foreground")}
          >
            Só o que cabe
          </Label>
        </div>
      </div>
      <p id="renda-cliente-ajuda" className="mt-2 text-xs text-muted-foreground">
        {faixa ? (
          <>
            <span className="font-medium text-foreground">{faixa.rotulo}</span> · estimativa PRICE
            com 30% da prestação total, sem entrada, FGTS ou subsídio. Não é aprovação: a análise
            formal é da Caixa.
          </>
        ) : (
          "Informe a renda para ver em cada empreendimento se cabe e a prestação estimada."
        )}
      </p>
    </section>
  );
}
