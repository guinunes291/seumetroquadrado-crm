import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { REGUA_PADRAO, parseRegua, type TemperaturaRegua } from "@/lib/regua-followup";

type ConfigRow = { chave: string; valor: unknown; descricao: string };

const TEMPERATURAS: { key: TemperaturaRegua; label: string }[] = [
  { key: "quente", label: "Quente" },
  { key: "morno", label: "Morno" },
  { key: "frio", label: "Frio" },
];

// Etapas do fundo do funil com multiplicador de ritmo próprio (as mesmas do
// REGUA_PADRAO.multEtapa — o parser aceita outras, mas a UI edita estas).
const ETAPAS_MULT = [
  ["agendado", "Agendado"],
  ["visita_realizada", "Visita realizada"],
  ["analise_credito", "Análise de crédito"],
] as const;
type EtapaMult = (typeof ETAPAS_MULT)[number][0];

/** Gap padrão da posição i (repete o último quando a régua é maior que 13). */
function gapPadrao(t: TemperaturaRegua, i: number): number {
  const base = REGUA_PADRAO.gaps[t];
  return base[Math.min(i, base.length - 1)];
}

/**
 * Editor da régua de follow-up (gestao_config, chave `regua_followup`).
 * Admin-only — a RLS garante; aqui é a conveniência para o gestor calibrar a
 * cadência (teto de toques, gaps por temperatura, ligações, multiplicadores
 * e SLA de devolução) sem SQL. Draft local + Salvar: nada é gravado onChange.
 */
export function ReguaFollowUpConfigCard() {
  const qc = useQueryClient();
  const configQ = useQuery({
    queryKey: ["gestao:regua-followup"],
    queryFn: async (): Promise<ConfigRow | null> => {
      const { data, error } = await supabase
        .from("gestao_config")
        .select("chave, valor, descricao")
        .eq("chave", "regua_followup")
        .maybeSingle();
      if (error) throw error;
      return (data as ConfigRow | null) ?? null;
    },
  });

  const salvar = useMutation({
    mutationFn: async (valor: unknown) => {
      const { error } = await supabase
        .from("gestao_config")
        .update({ valor: valor as Json })
        .eq("chave", "regua_followup");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Régua de follow-up salva.");
      qc.invalidateQueries({ queryKey: ["gestao:regua-followup"] });
      qc.invalidateQueries({ queryKey: ["gestao:config"] });
      qc.invalidateQueries({ queryKey: ["gestao:config-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (configQ.isLoading) return <Skeleton className="h-64 w-full" />;
  const row = configQ.data;

  // Degradação: sem a chave (migration pendente) o card explica em vez de
  // quebrar — mesmo padrão do GestaoConfigCard.
  if (configQ.isError || !row) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Repeat className="h-4 w-4 text-info" /> Régua de Follow-Up
          </CardTitle>
          <CardDescription>
            Configuração indisponível — aplique a migration da régua de follow-up (chave{" "}
            <code>regua_followup</code> em <code>gestao_config</code>) para calibrar a cadência de
            toques aqui. Enquanto isso, a fila usa a régua padrão de 13 toques.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ReguaEditor row={row} onSave={(valor) => salvar.mutate(valor)} saving={salvar.isPending} />
  );
}

function ReguaEditor({
  row,
  onSave,
  saving,
}: {
  row: ConfigRow;
  onSave: (valor: unknown) => void;
  saving: boolean;
}) {
  // parseRegua é tolerante: config parcial/malformada vira um draft completo.
  const [inicial] = useState(() => parseRegua(row.valor));
  const [maxToques, setMaxToques] = useState(String(inicial.maxToques));
  const [gaps, setGaps] = useState<Record<TemperaturaRegua, string[]>>(() => ({
    quente: inicial.gaps.quente.map(String),
    morno: inicial.gaps.morno.map(String),
    frio: inicial.gaps.frio.map(String),
  }));
  const [ligacao, setLigacao] = useState<Set<number>>(() => new Set(inicial.ligacaoNosToques));
  const [mult, setMult] = useState<Record<EtapaMult, string>>(() => ({
    agendado: String(inicial.multEtapa.agendado ?? 1),
    visita_realizada: String(inicial.multEtapa.visita_realizada ?? 1),
    analise_credito: String(inicial.multEtapa.analise_credito ?? 1),
  }));
  const [sla, setSla] = useState(String(inicial.slaDevolucaoDias));
  const [devolucaoAtiva, setDevolucaoAtiva] = useState(inicial.devolucaoAtiva);

  const n = Math.floor(Number(maxToques));
  const nValido = Number.isFinite(n) && n >= 1 && n <= 30;
  // Enquanto o campo do teto está inválido (ex.: apagado), a matriz mantém o
  // tamanho anterior para o gestor não perder o que digitou.
  const colunas = nValido ? n : inicial.maxToques;
  const toques = Array.from({ length: colunas }, (_, i) => i + 1);

  // Coluna além do que já foi digitado cai no padrão daquela posição — assim
  // aumentar o teto não abre buracos vazios na matriz.
  const gapDraft = (t: TemperaturaRegua, i: number): string =>
    gaps[t][i] ?? String(gapPadrao(t, i));

  const setGap = (t: TemperaturaRegua, i: number, valor: string) =>
    setGaps((prev) => {
      const arr = Array.from({ length: Math.max(prev[t].length, i + 1) }, (_, j) =>
        j === i ? valor : (prev[t][j] ?? String(gapPadrao(t, j))),
      );
      return { ...prev, [t]: arr };
    });

  const gapValido = (s: string) => {
    const v = Number(s);
    return s.trim() !== "" && Number.isFinite(v) && v >= 0;
  };
  const gapsValidos = TEMPERATURAS.every(({ key }) =>
    toques.every((toque) => gapValido(gapDraft(key, toque - 1))),
  );
  const multValido = ETAPAS_MULT.every(([key]) => {
    const v = Number(mult[key]);
    return Number.isFinite(v) && v >= 0.1 && v <= 4;
  });
  const slaNum = Math.floor(Number(sla));
  const slaValido = Number.isFinite(slaNum) && slaNum >= 1;
  const podeSalvar = nValido && gapsValidos && multValido && slaValido;

  // Serializa para o shape snake_case do jsonb documentado em parseRegua.
  const serializar = () => ({
    max_toques: n,
    gaps: Object.fromEntries(
      TEMPERATURAS.map(({ key }) => [key, toques.map((toque) => Number(gapDraft(key, toque - 1)))]),
    ),
    ligacao_nos_toques: Array.from(ligacao)
      .filter((t) => t >= 1 && t <= n)
      .sort((a, b) => a - b),
    mult_etapa: Object.fromEntries(ETAPAS_MULT.map(([key]) => [key, Number(mult[key])])),
    sla_devolucao_dias: slaNum,
    devolucao_ativa: devolucaoAtiva,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4 text-info" /> Régua de Follow-Up
        </CardTitle>
        <CardDescription>
          {row.descricao ||
            "Cadência de toques por temperatura e etapa — quando e por qual canal sai o próximo follow-up de cada lead."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="font-medium">Teto de toques da régua</Label>
          <p className="text-xs text-muted-foreground">
            Esgotou os toques sem resposta → decisão humana (reativar ou descartar), nunca
            auto-perdido.
          </p>
          <Input
            type="number"
            min={1}
            max={30}
            value={maxToques}
            onChange={(e) => setMaxToques(e.target.value)}
            className="w-24"
          />
        </div>

        <div className="space-y-2">
          <Label className="font-medium">Dias entre toques, por temperatura</Label>
          <p className="text-xs text-muted-foreground">
            Coluna N = dias de espera até o toque N (coluna 1 = entrada na régua; 0 = imediato).
          </p>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="pr-2 text-left text-xs font-normal text-muted-foreground">
                    Toque
                  </th>
                  {toques.map((toque) => (
                    <th
                      key={toque}
                      className="text-center text-xs font-normal tabular-nums text-muted-foreground"
                    >
                      {toque}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEMPERATURAS.map(({ key, label }) => (
                  <tr key={key}>
                    <td className="pr-2 text-xs text-muted-foreground">{label}</td>
                    {toques.map((toque) => (
                      <td key={toque}>
                        <Input
                          type="number"
                          min={0}
                          aria-label={`${label}, dias até o toque ${toque}`}
                          value={gapDraft(key, toque - 1)}
                          onChange={(e) => setGap(key, toque - 1, e.target.value)}
                          className="h-8 w-14 px-1 text-center text-xs tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="font-medium">Toques por ligação (Discador)</Label>
          <p className="text-xs text-muted-foreground">
            Os toques marcados saem como tarefa de ligação; os demais, WhatsApp.
          </p>
          <div className="flex flex-wrap gap-1">
            {toques.map((toque) => {
              const ativo = ligacao.has(toque);
              return (
                <Button
                  key={toque}
                  type="button"
                  size="sm"
                  variant={ativo ? "default" : "outline"}
                  aria-pressed={ativo}
                  onClick={() =>
                    setLigacao((prev) => {
                      const next = new Set(prev);
                      if (next.has(toque)) next.delete(toque);
                      else next.add(toque);
                      return next;
                    })
                  }
                >
                  {toque}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="font-medium">Ritmo por etapa (multiplicador dos dias)</Label>
          <p className="text-xs text-muted-foreground">
            1 = ritmo normal; 0,5 = duas vezes mais rápido. Fundo do funil costuma acelerar.
          </p>
          <div className="flex flex-wrap gap-2">
            {ETAPAS_MULT.map(([key, label]) => (
              <div key={key} className="w-36">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  type="number"
                  min={0.1}
                  max={4}
                  step={0.1}
                  value={mult[key]}
                  onChange={(e) => setMult((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="font-medium">Devolução por SLA</Label>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">SLA de devolução (dias)</Label>
              <Input type="number" min={1} value={sla} onChange={(e) => setSla(e.target.value)} />
            </div>
            <div className="flex h-10 items-center gap-2">
              <Switch
                checked={devolucaoAtiva}
                onCheckedChange={setDevolucaoAtiva}
                aria-label="Devolução automática ativa"
              />
              <Label className="cursor-pointer">Devolução automática ativa</Label>
            </div>
          </div>
          {devolucaoAtiva && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              Atenção: com a devolução ativa, um lead com follow-up vencido há{" "}
              {slaValido ? slaNum : "N"} dia(s) sai da carteira do corretor e volta à roleta
              automaticamente.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Os textos dos toques vêm da biblioteca (Comunicação): nomeie templates como "Régua 1",
            "Régua 2"…
          </p>
          <Button size="sm" disabled={saving || !podeSalvar} onClick={() => onSave(serializar())}>
            Salvar régua
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
