// Campos de configuração compartilhados entre as abas Configurações e
// Política da Central de Distribuição. Todos gravam via RPC auditada
// (atualizar_distribuicao_setting / atualizar_roleta) e seguem o padrão
// "rascunho + botão Salvar" — onBlur direto causava flicker do valor antigo
// enquanto a invalidação não voltava.

import { useState } from "react";
import { FloppyDisk } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LEAD_STATUS_ORDER, leadStatusLabel, type LeadStatus } from "@/lib/leads";
import type { Json } from "@/integrations/supabase/types";
import { formatDuration } from "@/lib/duracao";
import {
  useAtualizarRoleta,
  useAtualizarSetting,
  useDistribuicaoSettings,
  type RoletaRow,
} from "./queries";

export function num(valor: Json | undefined, fallback: number): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : fallback;
}

export function SettingNumero({
  chave,
  label,
  hint,
  min = 1,
  sufixo,
}: {
  chave: string;
  label: string;
  hint?: string;
  min?: number;
  sufixo?: string;
}) {
  const settingsQ = useDistribuicaoSettings();
  const salvar = useAtualizarSetting();
  const atual = num(settingsQ.data?.[chave]?.valor, min);
  const [valor, setValor] = useState<string | null>(null);
  const exibido = valor ?? String(atual);
  const mudou = valor !== null && Number(valor) !== atual;

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <Label>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={min}
            className="w-28"
            value={exibido}
            onChange={(e) => setValor(e.target.value)}
          />
          {sufixo && (
            <span className="text-sm text-muted-foreground">
              {sufixo}
              {sufixo === "min" && Number(exibido) > 0 && (
                <span className="ml-1 text-xs tabular-nums">
                  (= {formatDuration(Number(exibido))})
                </span>
              )}
            </span>
          )}
          {mudou && (
            <Button
              size="sm"
              onClick={() =>
                // Rascunho só é limpo no sucesso — sem flicker do valor antigo
                // enquanto a invalidação não volta.
                salvar.mutate(
                  { chave, valor: Number(valor) as unknown as Json },
                  { onSuccess: () => setValor(null) },
                )
              }
              disabled={salvar.isPending}
            >
              <FloppyDisk className="mr-1 h-3.5 w-3.5" /> Salvar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Janela início–fim salva ATOMICAMENTE (um RPC com os dois campos) — dois
 *  onBlur separados criavam uma janela overnight fantasma no meio do caminho. */
export function HorarioRoletaCell({ roleta }: { roleta: RoletaRow }) {
  const atualizarRoleta = useAtualizarRoleta();
  const [inicio, setInicio] = useState<string | null>(null);
  const [fim, setFim] = useState<string | null>(null);
  const inicioAtual = roleta.horario_inicio?.slice(0, 5) ?? "";
  const fimAtual = roleta.horario_fim?.slice(0, 5) ?? "";
  const vInicio = inicio ?? inicioAtual;
  const vFim = fim ?? fimAtual;
  const mudou = vInicio !== inicioAtual || vFim !== fimAtual;
  // Janela precisa dos dois lados (ou nenhum — 24h).
  const valido = (vInicio === "" && vFim === "") || (vInicio !== "" && vFim !== "");

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="time"
        className="w-28"
        value={vInicio}
        onChange={(e) => setInicio(e.target.value)}
      />
      <span className="text-muted-foreground">–</span>
      <Input type="time" className="w-28" value={vFim} onChange={(e) => setFim(e.target.value)} />
      {mudou && (
        <Button
          size="sm"
          variant="outline"
          disabled={!valido || atualizarRoleta.isPending}
          title={valido ? undefined : "Preencha início e fim (ou limpe os dois para 24h)"}
          onClick={() =>
            atualizarRoleta.mutate(
              { slug: roleta.slug, horarioInicio: vInicio, horarioFim: vFim },
              {
                onSuccess: () => {
                  setInicio(null);
                  setFim(null);
                },
              },
            )
          }
        >
          <FloppyDisk className="mr-1 h-3.5 w-3.5" /> Salvar
        </Button>
      )}
    </div>
  );
}

export function SettingBooleano({
  chave,
  label,
  hint,
}: {
  chave: string;
  label: string;
  hint?: string;
}) {
  const settingsQ = useDistribuicaoSettings();
  const salvar = useAtualizarSetting();
  const atual = settingsQ.data?.[chave]?.valor === true;

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div>
        <Label>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        checked={atual}
        onCheckedChange={(v) => salvar.mutate({ chave, valor: v as unknown as Json })}
        disabled={settingsQ.isLoading || salvar.isPending}
      />
    </div>
  );
}

export function SettingStatuses({
  chave,
  label,
  hint,
}: {
  chave: string;
  label: string;
  hint?: string;
}) {
  const settingsQ = useDistribuicaoSettings();
  const salvar = useAtualizarSetting();
  const atual = new Set(
    Array.isArray(settingsQ.data?.[chave]?.valor)
      ? (settingsQ.data?.[chave]?.valor as string[])
      : [],
  );

  const toggle = (status: LeadStatus, on: boolean) => {
    const novo = new Set(atual);
    if (on) novo.add(status);
    else novo.delete(status);
    salvar.mutate({ chave, valor: [...novo] as unknown as Json });
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {LEAD_STATUS_ORDER.map((s) => (
          <label key={s} className="flex items-center gap-2 text-xs">
            <Checkbox checked={atual.has(s)} onCheckedChange={(v) => toggle(s, v === true)} />
            {leadStatusLabel(s)}
          </label>
        ))}
      </div>
    </div>
  );
}
