// Aba Configurações (admin) — parâmetros GERAIS da distribuição: % mínimo,
// statuses, tempos, mapeamento origem→roleta e funcionamento das roletas.
// Os parâmetros da Política de Distribuição v2 (SLA, faixas, posse, teto,
// feature flag) vivem na aba Política. Toda alteração é auditada
// (audit_log via RPCs admin).

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { roletaLabel } from "@/lib/distribuicao";
import {
  useAtualizarConfigOrigem,
  useAtualizarRoleta,
  useDistribuicaoConfig,
  useRoletas,
} from "./queries";
import {
  HorarioRoletaCell,
  SettingBooleano,
  SettingNumero,
  SettingStatuses,
} from "./setting-fields";
import { origemLabel } from "@/lib/origem";

const SEM_ROLETA = "__nenhuma__";

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
                    <TableCell className="font-medium">{roletaLabel(r.slug, r.nome)}</TableCell>
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
            espera a próxima janela (o cron re-tenta a cada minuto). Participantes e propriedades de
            cada fila (equipe fixa, projeto, token de campanha) ficam na aba Filas.
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
                      {origemLabel(String(c.origem))}
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
                        <SelectTrigger className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Todas as roletas do banco — campanha e base incluídas. */}
                          {(roletasQ.data ?? []).map((r) => (
                            <SelectItem key={r.slug} value={r.slug}>
                              {roletaLabel(r.slug, r.nome)}
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
