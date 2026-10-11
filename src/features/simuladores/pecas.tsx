// Peças comuns às abas dos Simuladores: o cabeçalho com as abas das
// construtoras, os campos do formulário e os cards pequenos. Cada aba monta o
// próprio corpo (o fluxo genérico em simuladores-page, a tabela da Vibra em
// simulador-vibra), mas a tela tem a mesma cara em todas.

import { useId, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Calculator, Info, Warning, XCircle } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { logoDaConstrutora, urlLogo } from "@/lib/logos-construtoras";
import { SIMULADORES_CONSTRUTORAS, simuladorPorId } from "@/lib/simuladores/construtoras";
import type { SimuladorId } from "@/lib/simuladores/ids";
import { cn } from "@/lib/utils";
import type { PrefillFluxo } from "./estado";

export function CabecalhoSimuladores({
  atual,
  onTrocar,
  acoes,
}: {
  atual: SimuladorId;
  onTrocar: (id: SimuladorId) => void;
  acoes: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title="Simuladores"
        description="O fluxo de pagamento de cada construtora, com as regras dela. As mensais contam a partir do mês do ato: cada mês sem fechar é uma mensal a menos."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/simulador-amortizacao">
                <Calculator className="mr-1.5 h-4 w-4" /> Planilha de amortização
              </Link>
            </Button>
            {acoes}
          </>
        }
      />
      <Tabs value={atual} onValueChange={(v) => onTrocar(simuladorPorId(v).id)} className="mb-4">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1 sm:w-auto">
          {SIMULADORES_CONSTRUTORAS.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="gap-2 px-3 py-1.5">
              <LogoAba nome={s.nome} />
              {s.nome}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </>
  );
}

/**
 * Troca de aba levando o que é do CLIENTE (valor, renda, recursos do banco)
 * na URL: a aba nova abre já preenchida, mesmo quando ela tem outro
 * formulário (a da Vibra pede subsídio e FGTS somados, por exemplo).
 */
export function useTrocarConstrutora() {
  const navigate = useNavigate();
  return (id: SimuladorId, cliente: PrefillFluxo) => {
    const n = (v: number | undefined) => (v && v > 0 ? v : undefined);
    void navigate({
      to: "/simuladores",
      search: {
        construtora: id,
        valor: n(cliente.valor),
        renda: n(cliente.renda),
        financiamento: n(cliente.financiamento),
        subsidio: n(cliente.subsidio),
        fgts: n(cliente.fgts),
        parcela: n(cliente.parcela),
      },
      replace: true,
    });
  };
}

type Alerta = { nivel: "erro" | "aviso" | "info"; codigo: string; texto: string };

export function Alertas({ alertas }: { alertas: readonly Alerta[] }) {
  if (alertas.length === 0) return null;
  return (
    <div className="space-y-2">
      {alertas.map((a) => (
        <div
          key={a.codigo}
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3 text-sm",
            a.nivel === "erro" && "border-perigo-300 bg-perigo-500/5 text-perigo-700",
            a.nivel === "aviso" && "border-aviso-300 bg-aviso-500/5 text-aviso-700",
            a.nivel === "info" && "bg-muted/40 text-muted-foreground",
          )}
        >
          {a.nivel === "erro" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : a.nivel === "aviso" ? (
            <Warning className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{a.texto}</span>
        </div>
      ))}
    </div>
  );
}

function LogoAba({ nome }: { nome: string }) {
  const logo = logoDaConstrutora(nome);
  if (!logo) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-5 w-8 place-items-center overflow-hidden rounded-sm p-0.5",
        logo.fundo === "escuro" ? "bg-gradient-command" : "bg-claro",
      )}
    >
      <img src={urlLogo(logo)} alt="" className="h-full w-full object-contain" loading="lazy" />
    </span>
  );
}

export function Campo({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Numero({
  label,
  value,
  onChange,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <Campo label={label} hint={hint} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step ?? "any"}
        min={0}
        value={Number.isFinite(value) && value !== 0 ? value : ""}
        placeholder="0"
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </Campo>
  );
}

/**
 * Valor em R$ que é DERIVADO de outro estado (o total de uma linha é parcela ×
 * quantidade). Enquanto o campo está em uso ele mostra o que foi digitado;
 * ao sair, volta a mostrar o valor calculado. Sem isso, digitar "1000" no
 * total de 3 parcelas viraria "999,99" no meio da digitação.
 */
export function CampoValor({
  value,
  onChange,
  rotulo,
  disabled,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  rotulo: string;
  disabled?: boolean;
  className?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const formatado = Number.isFinite(value) && value !== 0 ? String(value) : "";
  return (
    <Input
      type="number"
      inputMode="decimal"
      step="any"
      min={0}
      aria-label={rotulo}
      disabled={disabled}
      className={cn("h-9 text-right tabular-nums", className)}
      value={texto ?? formatado}
      placeholder="0"
      onFocus={() => setTexto(formatado)}
      onBlur={() => setTexto(null)}
      onChange={(e) => {
        setTexto(e.target.value);
        onChange(e.target.value === "" ? 0 : Number(e.target.value));
      }}
    />
  );
}

export function SwitchLinha({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-xs font-medium">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function Kpi({
  titulo,
  valor,
  sub,
  destaque,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn("rounded-lg border bg-card p-3", destaque && "border-primary/40 bg-primary/5")}
    >
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={cn("mt-0.5 font-display text-lg font-bold", destaque && "text-primary")}>
        {valor}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
