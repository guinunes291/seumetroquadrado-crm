// Aba Configurações (admin) — parâmetros da distribuição que antes viviam
// hardcoded em migrations: % mínimo, statuses, tempos, mapeamento
// origem→roleta, horários e presença por roleta. Toda alteração é auditada
// (audit_log via RPCs admin).

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LEAD_STATUS_ORDER, leadStatusLabel, type LeadStatus } from "@/lib/leads";
import { roletaLabel, ROLETA_LABEL } from "@/lib/distribuicao";
import type { Json } from "@/integrations/supabase/types";
import {
  useAtualizarConfigOrigem,
  useAtualizarRoleta,
  useAtualizarSetting,
  useDistribuicaoConfig,
  useDistribuicaoSettings,
  useRoletas,
  type RoletaRow,
} from "./queries";

const SEM_ROLETA = "__nenhuma__";

function num(valor: Json | undefined, fallback: number): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : fallback;
}

function SettingNumero({
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
          {sufixo && <span className="text-sm text-muted-foreground">{sufixo}</span>}
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
              <Save className="mr-1 h-3.5 w-3.5" /> Salvar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Janela início–fim salva ATOMICAMENTE (um RPC com os dois campos) — dois
 *  onBlur separados criavam uma janela overnight fantasma no meio do caminho. */
function HorarioRoletaCell({ roleta }: { roleta: RoletaRow }) {
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
          <Save className="mr-1 h-3.5 w-3.5" /> Salvar
        </Button>
      )}
    </div>
  );
}

function SettingBooleano({ chave, label, hint }: { chave: string; label: string; hint?: string }) {
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

function SettingStatuses({ chave, label, hint }: { chave: string; label: string; hint?: string }) {
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

export function TabConfiguracoes() {
  const roletasQ = useRoletas();
  const configQ = useDistribuicaoConfig();
  const atualizarRoleta = useAtualizarRoleta();
  const atualizarOrigem = useAtualizarConfigOrigem();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Regras de aptidão e volume</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingNumero
              chave="percentual_minimo_trabalhado"
              label="Percentual mínimo de leads trabalhados (Roleta Plantão)"
              hint="Abaixo disso o corretor fica temporariamente fora da roleta até regularizar."
              min={0}
              sufixo="%"
            />
            <SettingNumero
              chave="limite_diario_default"
              label="Limite diário padrão de leads por corretor (por roleta)"
              hint="Pode ser sobrescrito por corretor na própria roleta."
              sufixo="leads/dia"
            />
            <SettingNumero
              chave="max_minutos_sem_atendimento"
              label="Tempo máximo para considerar lead sem atendimento"
              hint="Usado nos cards do painel e nos alertas."
              sufixo="min"
            />
            <SettingNumero
              chave="reprocesso_max_tentativas"
              label="Máximo de tentativas automáticas por lead"
              hint="Depois disso, o lead espera ação humana na fila de exceções."
              sufixo="tentativas"
            />
            <SettingBooleano
              chave="permitir_inclusao_manual"
              label="Gestor pode incluir corretores na Roleta Marquinhos"
              hint="Desligado: apenas administradores incluem."
            />
            <SettingBooleano
              chave="cota_conta_redistribuicao"
              label="Redistribuições contam na cota diária"
              hint="Ligado: repasses de SLA/parados também consomem a cota do corretor."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Statuses do cálculo de % trabalhado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <SettingStatuses
              chave="statuses_aguardando"
              label="Contam como AGUARDANDO (não trabalhado)"
              hint='Padrão: apenas "Aguardando atendimento".'
            />
            <SettingStatuses
              chave="statuses_encerrados"
              label="Fora da carteira ativa (encerrados)"
              hint="Não entram no denominador do % trabalhado."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Roletas — funcionamento</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {roletasQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roleta</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead>Exigir presença</TableHead>
                  <TableHead>Horário (BRT)</TableHead>
                  <TableHead>Fora do horário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(roletasQ.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{roletaLabel(r.slug)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.ativo}
                        onCheckedChange={(v) => atualizarRoleta.mutate({ slug: r.slug, ativo: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.exigir_presenca}
                        onCheckedChange={(v) =>
                          atualizarRoleta.mutate({ slug: r.slug, exigirPresenca: v })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <HorarioRoletaCell roleta={r} />
                    </TableCell>
                    <TableCell>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={r.permitir_fora_horario}
                          onCheckedChange={(v) =>
                            atualizarRoleta.mutate({ slug: r.slug, permitirForaHorario: v })
                          }
                        />
                        distribuir mesmo assim
                      </label>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Sem horário definido = 24h. Com horário e "distribuir mesmo assim" desligado, o lead
            espera a próxima janela (o cron re-tenta a cada minuto).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Origens — roleta e tempos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {configQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origem</TableHead>
                  <TableHead>Roleta</TableHead>
                  <TableHead className="text-right">Repasse SLA (min)</TableHead>
                  <TableHead className="text-right">Redistribuição (h)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(configQ.data ?? []).map((c) => (
                  <TableRow key={c.origem}>
                    <TableCell className="font-medium capitalize">
                      {String(c.origem).replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={c.roleta_slug ?? SEM_ROLETA}
                        onValueChange={(v) =>
                          atualizarOrigem.mutate({
                            origem: c.origem,
                            roletaSlug: v === SEM_ROLETA ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLETA_LABEL).map(([slug, label]) => (
                            <SelectItem key={slug} value={slug}>
                              {label}
                            </SelectItem>
                          ))}
                          <SelectItem value={SEM_ROLETA}>Nenhuma (vai para exceção)</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        className="ml-auto w-24 text-right"
                        defaultValue={c.timeout_minutos ?? ""}
                        placeholder="—"
                        onBlur={(e) =>
                          atualizarOrigem.mutate({
                            origem: c.origem,
                            timeoutMinutos: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={1}
                        className="ml-auto w-24 text-right"
                        defaultValue={c.timeout_horas}
                        onBlur={(e) => {
                          // Campo vazio/valor inválido não muda nada (antes
                          // coagia silenciosamente para 24h).
                          const n = Number(e.target.value);
                          if (!Number.isInteger(n) || n < 1 || n === c.timeout_horas) return;
                          atualizarOrigem.mutate({ origem: c.origem, timeoutHoras: n });
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Repasse SLA vazio = origem sem repasse por minutos (só a régua de horas). O repasse por
            minutos vale apenas para leads chegados por webhook.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
