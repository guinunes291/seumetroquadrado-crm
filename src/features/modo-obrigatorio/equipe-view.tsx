// Processo obrigatório do time — a seção da gestão no Painel do Dia.
//
// Três coisas numa tela só, porque andam juntas:
//   * o ENSAIO: quantas pendências cada corretor tem agora, mesmo com o modo
//     desligado — é o que o dono olha antes de ligar;
//   * a VÁLVULA: "Liberar hoje", com motivo, para quem tem razão real (plantão
//     no estande, atestado). Auditada e só para o dia;
//   * a CHAVE (admin): liga/desliga e os dias para "fundo parado".

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LockSimple, LockSimpleOpen } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  fetchEquipeObrigatorio,
  liberarCorretorHoje,
  MODO_OBRIGATORIO_KEY,
  type LinhaEquipeObrigatorio,
} from "@/features/modo-obrigatorio/client";

const EQUIPE_KEY = ["modo-obrigatorio:equipe"] as const;

type Config = { ativo: boolean; fundo_parado_dias: number };

function ChaveDoModo() {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ["gestao:config", "modo_obrigatorio"],
    queryFn: async (): Promise<Config> => {
      const { data, error } = await supabase
        .from("gestao_config")
        .select("valor")
        .eq("chave", "modo_obrigatorio")
        .maybeSingle();
      if (error) throw error;
      const v = (data?.valor ?? {}) as Partial<Config>;
      return { ativo: v.ativo === true, fundo_parado_dias: Number(v.fundo_parado_dias ?? 5) };
    },
  });
  const [dias, setDias] = useState<string>("");

  const salvar = useMutation({
    mutationFn: async (novo: Config) => {
      const { error } = await supabase
        .from("gestao_config")
        .update({ valor: novo })
        .eq("chave", "modo_obrigatorio");
      if (error) throw error;
    },
    onSuccess: (_d, novo) => {
      toast.success(
        novo.ativo ? "Modo Obrigatório ligado para o time." : "Modo Obrigatório desligado.",
      );
      void qc.invalidateQueries({ queryKey: ["gestao:config"] });
      void qc.invalidateQueries({ queryKey: [...EQUIPE_KEY] });
      void qc.invalidateQueries({ queryKey: [MODO_OBRIGATORIO_KEY] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!config.data) return null;
  const atual = config.data;
  const diasNum = Number(dias || atual.fundo_parado_dias);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Switch
          checked={atual.ativo}
          disabled={salvar.isPending}
          onCheckedChange={(ativo) => salvar.mutate({ ...atual, ativo })}
        />
        {atual.ativo ? "Ligado — corretor com pendência fica travado" : "Desligado (ensaio)"}
      </label>
      <div className="flex items-center gap-2 text-sm">
        <Label htmlFor="mo-dias">Fundo parado após</Label>
        <Input
          id="mo-dias"
          type="number"
          min={1}
          max={60}
          className="h-8 w-20"
          value={dias || String(atual.fundo_parado_dias)}
          onChange={(e) => setDias(e.target.value)}
        />
        <span className="text-muted-foreground">dias</span>
        <Button
          size="sm"
          variant="outline"
          disabled={
            salvar.isPending ||
            !Number.isInteger(diasNum) ||
            diasNum < 1 ||
            diasNum === atual.fundo_parado_dias
          }
          onClick={() => salvar.mutate({ ...atual, fundo_parado_dias: diasNum })}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}

function DialogLiberar({
  linha,
  onClose,
}: {
  linha: LinhaEquipeObrigatorio | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const liberar = useMutation({
    mutationFn: () => liberarCorretorHoje(linha!.corretor_id, motivo),
    onSuccess: () => {
      toast.success(`${linha?.nome ?? "Corretor"} liberado hoje.`);
      setMotivo("");
      void qc.invalidateQueries({ queryKey: [...EQUIPE_KEY] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={Boolean(linha)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liberar {linha?.nome ?? "corretor"} hoje</DialogTitle>
          <DialogDescription>
            O CRM dele volta ao normal até o fim do dia. As pendências continuam na lista e amanhã a
            trava volta. O motivo fica registrado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="mo-motivo">Motivo</Label>
          <Input
            id="mo-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: plantão no estande o dia todo"
            maxLength={300}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={motivo.trim().length < 3 || liberar.isPending}
            onClick={() => liberar.mutate()}
          >
            Liberar hoje
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModoObrigatorioEquipe() {
  const { isAdmin } = useUserRoles();
  const [liberando, setLiberando] = useState<LinhaEquipeObrigatorio | null>(null);
  const equipe = useQuery({
    queryKey: [...EQUIPE_KEY],
    queryFn: fetchEquipeObrigatorio,
    refetchInterval: 2 * 60 * 1000,
  });

  const linhas = equipe.data ?? [];
  const ativo = linhas[0]?.modo_ativo ?? false;
  const comPendencia = linhas.filter((l) => l.total > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LockSimple className="h-4 w-4" /> Processo obrigatório
          <Badge variant={ativo ? "default" : "secondary"}>{ativo ? "Ligado" : "Desligado"}</Badge>
        </CardTitle>
        <CardDescription>
          Pendências que travam o CRM de cada corretor: cadência do dia (lead novo primeiro) e fundo
          de funil parado. {ativo ? "" : "Desligado, ninguém trava — os números são o ensaio."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && <ChaveDoModo />}

        {equipe.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : equipe.isError ? (
          <QueryErrorState error={equipe.error as Error} onRetry={() => void equipe.refetch()} />
        ) : comPendencia.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum corretor com pendência obrigatória agora.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 font-medium">Corretor</th>
                  <th className="py-2 text-right font-medium">Pendências</th>
                  <th className="py-2 text-right font-medium">Lead chegou</th>
                  <th className="py-2 text-right font-medium">Fundo parado</th>
                  <th className="py-2 text-right font-medium">Atrasadas</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {comPendencia.map((l) => (
                  <tr key={l.corretor_id} className="border-b last:border-0">
                    <td className="py-2">{l.nome ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{l.total}</td>
                    <td className="py-2 text-right tabular-nums">{l.lead_chegou}</td>
                    <td className="py-2 text-right tabular-nums">{l.fundo_parado}</td>
                    <td className="py-2 text-right tabular-nums">
                      {l.atrasados > 0 ? (
                        <Badge variant="destructive">{l.atrasados}</Badge>
                      ) : (
                        l.atrasados
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {l.liberado_hoje ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                          title={l.motivo_liberacao ?? undefined}
                        >
                          <LockSimpleOpen className="h-3.5 w-3.5" /> Liberado hoje
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setLiberando(l)}>
                          Liberar hoje
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <DialogLiberar linha={liberando} onClose={() => setLiberando(null)} />
    </Card>
  );
}
