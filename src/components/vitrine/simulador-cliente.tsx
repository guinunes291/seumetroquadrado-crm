// Barra do cliente do Mapa de Mercado — os campos que ANTES ficavam espremidos
// dentro do mapa (sidebar do public/mapa-mercado.html) e agora vivem na página,
// acima dele. Só entra e sai dado aqui; quem calcula é `poder-de-compra.ts` e
// quem desenha é o mapa.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowCounterClockwise, Calculator, Warning } from "@phosphor-icons/react";
import { brl } from "@/lib/orcamento";
import {
  RENDA_MINIMA,
  type PerfilCliente,
  type PoderDeCompra,
} from "@/lib/vitrine/poder-de-compra";
import { cn } from "@/lib/utils";

type Props = {
  perfil: PerfilCliente;
  poder: PoderDeCompra | null;
  onChange: (patch: Partial<PerfilCliente>) => void;
  onLimpar: () => void;
  className?: string;
};

export function SimuladorCliente({ perfil, poder, onChange, onLimpar, className }: Props) {
  const ativo = poder != null;

  return (
    <section className={cn("rounded-xl border bg-card p-3 md:p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Calculator className="h-4 w-4 text-primary" />
          Cliente na mão
          <span className="font-normal text-muted-foreground">
            — preencha e o mapa mostra quem fecha
          </span>
        </h2>
        {ativo && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onLimpar}>
            <ArrowCounterClockwise className="mr-1.5 h-3.5 w-3.5" /> Limpar simulação
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CampoValor
          id="mercado-renda"
          label="Renda familiar (mensal)"
          value={perfil.renda}
          onChange={(v) => onChange({ renda: v })}
          placeholder="3.500"
          destaque
        />
        <CampoValor
          id="mercado-fgts"
          label="FGTS disponível"
          value={perfil.fgts || null}
          onChange={(v) => onChange({ fgts: v ?? 0 })}
        />
        <CampoValor
          id="mercado-entrada"
          label="Entrada / recursos próprios"
          value={perfil.entrada || null}
          onChange={(v) => onChange({ entrada: v ?? 0 })}
        />
        <CampoValor
          id="mercado-reforco"
          label="Reforço anual (13º, IR)"
          value={perfil.reforcoAnual || null}
          onChange={(v) => onChange({ reforcoAnual: v ?? 0 })}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <Chave
          id="mercado-dependente"
          label="Tem dependente"
          dica="Muda o valor do subsídio na Faixa 1"
          checked={perfil.temDependente}
          onCheckedChange={(v) => onChange({ temDependente: v })}
        />
        <Chave
          id="mercado-carteira"
          label="Carteira assinada há +3 anos"
          dica="Dá direito ao redutor de juros — financia mais"
          checked={perfil.carteira3anos}
          onCheckedChange={(v) => onChange({ carteira3anos: v })}
        />
      </div>

      {poder && <Resumo poder={poder} />}
    </section>
  );
}

function Resumo({ poder }: { poder: PoderDeCompra }) {
  const { orcamento: orc } = poder;

  if (!orc.enquadra) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <Warning className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <b>Renda fora da tabela de crédito.</b> A tabela APROVE 2026 começa em {brl(RENDA_MINIMA)}
          . Avalie composição de renda com cônjuge ou familiar antes de apresentar empreendimento.
        </div>
      </div>
    );
  }

  const composicao = [
    ["Financiamento", orc.financiamento],
    ["Subsídio", orc.subsidio],
    ["FGTS", orc.fgts],
    ["Entrada + reforço", orc.entrada],
  ].filter(([, v]) => (v as number) > 0) as [string, number][];

  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
          Faixa {orc.faixa} · {orc.segmento}
        </span>
        <span>Juros {orc.taxaEfetiva} a.a.</span>
        <span>Parcela estimada {brl(orc.parcelaEstimada)}</span>
        {orc.usouRedutor && <span className="font-medium text-foreground">com redutor</span>}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {composicao.map(([rotulo, valor], i) => (
          <span key={rotulo}>
            {i > 0 && <span className="mr-1.5">+</span>}
            {rotulo} <b className="tabular-nums text-foreground">{brl(valor)}</b>
          </span>
        ))}
        <span className="ml-1">
          = <b className="tabular-nums text-foreground">{brl(orc.recursosNaoConstrutora)}</b> em
          recursos
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Teto
          titulo="Fecha até"
          valor={poder.teto}
          nota="Regra do CRM: construtora parcela no máximo 20% na obra."
          tom="ok"
        />
        <Teto
          titulo="Cenário otimista, até"
          valor={poder.tetoOtimista}
          nota="Só se a construtora aceitar parcelar 25% do imóvel."
          tom="neutro"
        />
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Estimativa comercial de pré-qualificação — não é simulação oficial da Caixa nem garantia de
        aprovação. Teto do produto na faixa: {brl(orc.tetoAvaliacaoSegmento)}.
      </p>
    </div>
  );
}

function Teto({
  titulo,
  valor,
  nota,
  tom,
}: {
  titulo: string;
  valor: number;
  nota: string;
  tom: "ok" | "neutro";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tom === "ok" ? "border-emerald-300 bg-emerald-50" : "bg-background",
      )}
    >
      <div className="text-[11px] text-muted-foreground">{titulo}</div>
      <div
        className={cn(
          "text-lg font-extrabold tabular-nums",
          tom === "ok" ? "text-emerald-800" : "text-foreground",
        )}
      >
        {brl(valor)}
      </div>
      <div className="text-[10.5px] leading-snug text-muted-foreground">{nota}</div>
    </div>
  );
}

function CampoValor({
  id,
  label,
  value,
  onChange,
  placeholder = "0",
  destaque,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  destaque?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div
        className={cn(
          "flex items-center rounded-md border bg-background pl-2.5 focus-within:ring-1 focus-within:ring-ring",
          destaque && "border-primary/50",
        )}
      >
        <span className="text-xs text-muted-foreground">R$</span>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={value ?? ""}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value);
            onChange(Number.isFinite(n) && n > 0 ? n : null);
          }}
          placeholder={placeholder}
          className="border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

function Chave({
  id,
  label,
  dica,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  dica: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <div className="leading-tight">
        <Label htmlFor={id} className="cursor-pointer text-xs font-medium">
          {label}
        </Label>
        <div className="text-[10.5px] text-muted-foreground">{dica}</div>
      </div>
    </div>
  );
}
