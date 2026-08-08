import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type ConfigRow = { chave: string; valor: unknown; descricao: string };

const LIMIAR_CAMPOS = ["quente", "morno", "frio", "default"] as const;

/**
 * Editor da gestao_config (limiares de "parado", SLA fallback, análise
 * parada, capacidade, cobertura mínima e feriados do pacing). Admin-only —
 * a RLS garante; a UI é a conveniência para não editar via SQL.
 */
export function GestaoConfigCard() {
  const qc = useQueryClient();
  const configQ = useQuery({
    queryKey: ["gestao:config-all"],
    queryFn: async (): Promise<ConfigRow[]> => {
      const { data, error } = await supabase
        .from("gestao_config")
        .select("chave, valor, descricao")
        .order("chave");
      if (error) throw error;
      return (data ?? []) as ConfigRow[];
    },
  });

  const salvar = useMutation({
    mutationFn: async ({ chave, valor }: { chave: string; valor: unknown }) => {
      const { error } = await supabase
        .from("gestao_config")
        .update({ valor: valor as Json })
        .eq("chave", chave);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(`Configuração "${v.chave}" salva.`);
      qc.invalidateQueries({ queryKey: ["gestao:config-all"] });
      qc.invalidateQueries({ queryKey: ["gestao:config"] });
      qc.invalidateQueries({ queryKey: ["gestao:painel-dia"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (configQ.isLoading) return <Skeleton className="h-48 w-full" />;
  const rows = configQ.data ?? [];
  if (configQ.isError || rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4 text-info" /> Camada de gestão
          </CardTitle>
          <CardDescription>
            Configuração indisponível — aplique as migrations da camada de gestão (gestao_config)
            para editar limiares de "parado", SLA e pacing aqui.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const byChave = new Map(rows.map((r) => [r.chave, r]));

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4 text-info" /> Camada de gestão
        </CardTitle>
        <CardDescription>
          Limiares que alimentam o Painel do Dia, o Funil e o Pacing — nada disso é hardcoded.
          Mudanças valem imediatamente para todos os painéis.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {byChave.has("parado_limiares_dias") && (
          <LimiaresParadoEditor
            row={byChave.get("parado_limiares_dias")!}
            onSave={(valor) => salvar.mutate({ chave: "parado_limiares_dias", valor })}
            saving={salvar.isPending}
          />
        )}
        {(
          [
            ["sla_fallback_minutos", "SLA fallback (min)"],
            ["analise_parada_dias", "Análise parada após (dias)"],
            ["cobertura_transicoes_minima_pct", "Cobertura mínima de coorte (%)"],
            ["capacidade_leads_ativos_por_corretor", "Capacidade por corretor (leads ativos)"],
          ] as const
        ).map(
          ([chave, label]) =>
            byChave.has(chave) && (
              <NumeroEditor
                key={chave}
                label={label}
                row={byChave.get(chave)!}
                onSave={(valor) => salvar.mutate({ chave, valor })}
                saving={salvar.isPending}
              />
            ),
        )}
        {byChave.has("pacing") && (
          <PacingEditor
            row={byChave.get("pacing")!}
            onSave={(valor) => salvar.mutate({ chave: "pacing", valor })}
            saving={salvar.isPending}
          />
        )}
      </CardContent>
    </Card>
  );
}

function LimiaresParadoEditor({
  row,
  onSave,
  saving,
}: {
  row: ConfigRow;
  onSave: (valor: unknown) => void;
  saving: boolean;
}) {
  const atual = (row.valor ?? {}) as Record<string, number>;
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(LIMIAR_CAMPOS.map((c) => [c, String(atual[c] ?? "")])),
  );
  return (
    <div className="space-y-2">
      <Label className="font-medium">Lead "parado" após (dias, por temperatura)</Label>
      <p className="text-xs text-muted-foreground">{row.descricao}</p>
      <div className="flex flex-wrap gap-2">
        {LIMIAR_CAMPOS.map((c) => (
          <div key={c} className="w-24">
            <Label className="text-xs capitalize text-muted-foreground">{c}</Label>
            <Input
              type="number"
              min={1}
              value={valores[c]}
              onChange={(e) => setValores((v) => ({ ...v, [c]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <Button
        size="sm"
        disabled={saving || LIMIAR_CAMPOS.some((c) => !(Number(valores[c]) > 0))}
        onClick={() =>
          onSave(Object.fromEntries(LIMIAR_CAMPOS.map((c) => [c, Number(valores[c])])))
        }
      >
        Salvar limiares
      </Button>
    </div>
  );
}

function NumeroEditor({
  label,
  row,
  onSave,
  saving,
}: {
  label: string;
  row: ConfigRow;
  onSave: (valor: unknown) => void;
  saving: boolean;
}) {
  const [valor, setValor] = useState(String(Number(row.valor) || ""));
  return (
    <div className="space-y-2">
      <Label className="font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{row.descricao}</p>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-32"
        />
        <Button
          size="sm"
          disabled={saving || !(Number(valor) > 0)}
          onClick={() => onSave(Number(valor))}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}

const DIAS_SEMANA = [
  { iso: 1, label: "seg" },
  { iso: 2, label: "ter" },
  { iso: 3, label: "qua" },
  { iso: 4, label: "qui" },
  { iso: 5, label: "sex" },
  { iso: 6, label: "sáb" },
  { iso: 7, label: "dom" },
];

function PacingEditor({
  row,
  onSave,
  saving,
}: {
  row: ConfigRow;
  onSave: (valor: unknown) => void;
  saving: boolean;
}) {
  const atual = (row.valor ?? {}) as { dias_uteis?: number[]; feriados?: string[] };
  const [dias, setDias] = useState<Set<number>>(
    () => new Set(atual.dias_uteis ?? [1, 2, 3, 4, 5, 6]),
  );
  const [feriados, setFeriados] = useState((atual.feriados ?? []).join("\n"));

  const feriadosValidos = feriados
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  return (
    <div className="space-y-2 md:col-span-2">
      <Label className="font-medium">Calendário do pacing</Label>
      <p className="text-xs text-muted-foreground">{row.descricao}</p>
      <div className="flex flex-wrap gap-1">
        {DIAS_SEMANA.map((d) => {
          const ativo = dias.has(d.iso);
          return (
            <Button
              key={d.iso}
              type="button"
              size="sm"
              variant={ativo ? "default" : "outline"}
              aria-pressed={ativo}
              onClick={() =>
                setDias((prev) => {
                  const next = new Set(prev);
                  if (next.has(d.iso)) next.delete(d.iso);
                  else next.add(d.iso);
                  return next;
                })
              }
            >
              {d.label}
            </Button>
          );
        })}
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Feriados (um por linha, AAAA-MM-DD)</Label>
        <textarea
          value={feriados}
          onChange={(e) => setFeriados(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
          placeholder="2026-09-07"
        />
      </div>
      <Button
        size="sm"
        disabled={saving || dias.size === 0}
        onClick={() =>
          onSave({ dias_uteis: Array.from(dias).sort((a, b) => a - b), feriados: feriadosValidos })
        }
      >
        Salvar calendário
      </Button>
    </div>
  );
}
