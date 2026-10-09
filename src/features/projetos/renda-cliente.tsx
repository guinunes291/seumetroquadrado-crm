// Renda do cliente — a pergunta nº 1 do corretor na prateleira (decisão 8 de
// 2026-09-02): "o que cabe na renda deste cliente?". Informada aqui, cada card
// ganha o selo "Cabe / Não cabe" com a prestação estimada (PRICE, 30% da
// prestação total — lib/mcmv-estimativa) e o filtro "só o que cabe" fica
// disponível. É estimativa: o aviso acompanha sempre.

import { useEffect, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  contagem,
  className,
}: {
  renda: number | null;
  onChange: (renda: number | null) => void;
  soQueCabe: boolean;
  onSoQueCabe: (v: boolean) => void;
  /** Quando a prateleira foi aberta pelo dossiê de um lead. */
  nomeLead?: string | null;
  /** Quantos empreendimentos a prateleira mostra agora (com os filtros). */
  contagem?: number;
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
  // O campo mostra só a renda "de fora" dos chips — com um chip escolhido,
  // ele fica vazio para não repetir o valor.
  const doChip = renda != null && (RENDAS_RAPIDAS as readonly number[]).includes(renda);

  // Identidade Lançamento (como no vídeo): uma linha só — "Renda familiar",
  // os chips, "Só o que cabe" e a contagem. O campo livre continua para a
  // renda que não está nos chips.
  return (
    <section aria-label="Renda do cliente" className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="renda-cliente" className="mr-1 text-sm font-semibold">
          {nomeLead ? `Renda familiar de ${nomeLead.split(" ")[0]}` : "Renda familiar"}
        </Label>
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
                "press-scale inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-semibold tabular-nums transition-colors",
                renda === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-subtle bg-card text-foreground hover:border-primary/40",
              )}
            >
              {formatBRL(r)}
            </button>
          ))}
        </div>
        <div className="relative">
          <Input
            id="renda-cliente"
            value={doChip ? "" : texto}
            onChange={(e) => aplicar(e.target.value)}
            inputMode="numeric"
            placeholder="outra"
            aria-describedby="renda-cliente-ajuda"
            className="h-9 w-28 rounded-full pr-8 text-xs tabular-nums"
          />
          {renda != null && !doChip && (
            <button
              type="button"
              onClick={() => aplicar("")}
              aria-label="Limpar renda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          id="so-que-cabe"
          aria-pressed={soQueCabe}
          disabled={renda == null}
          onClick={() => onSoQueCabe(!soQueCabe)}
          title={renda == null ? "Escolha a renda para filtrar o que cabe" : undefined}
          className={cn(
            "press-scale inline-flex min-h-9 items-center gap-1 rounded-full px-3.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            soQueCabe
              ? "bg-gold-500 text-navy-900"
              : "bg-gold-100 text-gold-800 hover:bg-gold-200 dark:bg-gold-500/15 dark:text-gold-300",
          )}
        >
          <Check className="h-3.5 w-3.5" weight="bold" aria-hidden="true" /> Só o que cabe
        </button>
        {contagem != null && (
          <span className="ml-auto font-display text-base font-bold tabular-nums">
            {contagem} {contagem === 1 ? "empreendimento" : "empreendimentos"}
          </span>
        )}
      </div>
      <p id="renda-cliente-ajuda" className="text-xs text-muted-foreground">
        {faixa ? (
          <>
            <span className="font-medium text-foreground">{faixa.rotulo}</span> · estimativa PRICE
            com 30% da prestação total, sem entrada, FGTS ou subsídio. Não é aprovação: a análise
            formal é da Caixa.
          </>
        ) : (
          "Escolha a renda para ver em cada empreendimento se cabe e a prestação estimada."
        )}
      </p>
    </section>
  );
}
