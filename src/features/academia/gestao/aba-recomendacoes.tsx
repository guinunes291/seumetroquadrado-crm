// Aba "Recomendações": a fila que o motor diário gera comparando cada
// corretor com a mediana da empresa (sem ele mesmo), com amostra mínima.
// Em modo SOMBRA o corretor não vê nada: é o gestor aprendendo se a regra faz
// sentido. Nada é atribuído sem alguém clicar.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lightbulb, Play } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useUserRoles } from "@/hooks/use-auth";
import type { AcademiaRecomendacaoRow } from "@/features/academia/tipos";
import { dataBr } from "../formato";
import { hojeBrasilia } from "../estado-modulo";
import { formatarIndicador, rotuloIndicador } from "./derivacao";
import {
  useDecidirRecomendacao,
  useEquipeAcademia,
  useModulosAcademia,
  useRecomendacoes,
  useRodarMotor,
} from "./gestao-client";
import { mensagemDaGestao } from "./mensagens";

/** Hoje + n dias, em YYYY-MM-DD de Brasília. */
export function somarDias(hoje: string, n: number): string {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Decisao = { rec: AcademiaRecomendacaoRow; acao: "atribuir" | "descartar" };

export function AbaRecomendacoes() {
  const { isAdmin } = useUserRoles();
  const dados = useRecomendacoes();
  const equipe = useEquipeAcademia();
  const modulos = useModulosAcademia();
  const decidir = useDecidirRecomendacao();
  const motor = useRodarMotor();
  const [decisao, setDecisao] = useState<Decisao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [prazo, setPrazo] = useState("");
  const hoje = hojeBrasilia();

  const resumo = useMemo(() => {
    const semana = somarDias(hoje, -7);
    const porRegra = new Map<string, number>();
    for (const r of dados.data?.recomendacoes ?? []) {
      if (r.data_ref >= semana) porRegra.set(r.regra_id, (porRegra.get(r.regra_id) ?? 0) + 1);
    }
    return porRegra;
  }, [dados.data, hoje]);

  const erro = dados.error ?? equipe.error;
  if (erro) {
    return (
      <QueryErrorState
        title="Não foi possível carregar as recomendações."
        error={erro}
        onRetry={() => {
          void dados.refetch();
          void equipe.refetch();
        }}
      />
    );
  }
  if (!dados.data || !equipe.data) return <Skeleton className="h-64 w-full" />;

  const { modo, regras, recomendacoes } = dados.data;
  const regraPorId = new Map(regras.map((r) => [r.id, r]));
  const nomes = new Map(equipe.data.corretores.map((c) => [c.corretor_id, c.corretor_nome]));
  const modPorId = new Map((modulos.data ?? []).map((m) => [m.id, m]));
  const fila = recomendacoes.filter((r) => r.status === "sombra" || r.status === "aberta");

  function abrir(rec: AcademiaRecomendacaoRow, acao: Decisao["acao"]) {
    setDecisao({ rec, acao });
    setMotivo("");
    setPrazo(somarDias(hoje, 7));
  }

  async function confirmar() {
    if (!decisao) return;
    try {
      await decidir.mutateAsync({
        recId: decisao.rec.id,
        acao: decisao.acao,
        motivo: motivo.trim(),
        prazo: decisao.acao === "atribuir" ? prazo || null : null,
      });
      toast.success(decisao.acao === "atribuir" ? "Módulo atribuído." : "Recomendação descartada.");
      setDecisao(null);
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  async function rodar() {
    try {
      const r = await motor.mutateAsync();
      toast.success(
        `Cálculo feito: ${r.indicadores} indicadores e ${r.recomendacoes} recomendações novas.`,
      );
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  return (
    <div className="space-y-4">
      {modo === "sombra" && (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>MODO SOMBRA · o corretor não vê nada disso</AlertTitle>
          <AlertDescription>
            As regras rodam todo dia às 02:45 e só a gestão vê o resultado. Use esta fila para
            julgar se cada regra faz sentido antes de o dono ligar o modo ativo.
          </AlertDescription>
        </Alert>
      )}
      {modo === "desligado" && (
        <Alert>
          <AlertTitle>Recomendações desligadas</AlertTitle>
          <AlertDescription>
            O motor calcula os indicadores, mas não gera recomendação.
          </AlertDescription>
        </Alert>
      )}

      {regras.length > 0 && (
        <section aria-labelledby="rec-resumo">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="rec-resumo" className="text-sm font-semibold">
              Últimos 7 dias, por regra
            </h2>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void rodar()}
                disabled={motor.isPending}
              >
                <Play className="mr-1.5 h-4 w-4" />
                {motor.isPending ? "Calculando..." : "Calcular agora"}
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {regras.map((r) => (
              <Card key={r.id} className={r.ativa ? undefined : "opacity-60"}>
                <CardContent className="py-3">
                  <p className="text-xs text-muted-foreground">
                    {r.codigo} · {r.ativa ? `janela de ${r.janela_dias} dias` : "desativada"}
                  </p>
                  <p className="truncate text-sm font-medium">{rotuloIndicador(r.indicador)}</p>
                  <p className="text-lg font-semibold tabular-nums">{resumo.get(r.id) ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="rec-fila">
        <h2 id="rec-fila" className="mb-2 text-sm font-semibold">
          Para decidir ({fila.length})
        </h2>
        {fila.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="Nenhuma recomendação para decidir."
            description="O motor roda todo dia às 02:45. Recomendação só nasce com amostra mínima e bem longe da mediana do time."
          />
        ) : (
          <div className="space-y-2">
            {fila.map((rec) => {
              const regra = regraPorId.get(rec.regra_id);
              const mod = modPorId.get(rec.modulo_id);
              const publicado = mod?.status === "publicado";
              return (
                <Card key={rec.id}>
                  <CardContent className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {nomes.get(rec.corretor_id) ?? "Corretor"}
                      </p>
                      <StatusBadge intent={rec.status === "sombra" ? "neutral" : "info"}>
                        {rec.status === "sombra" ? "Sombra" : "Aberta"}
                      </StatusBadge>
                      {regra && (
                        <span className="text-xs text-muted-foreground">{regra.codigo}</span>
                      )}
                    </div>
                    <p className="text-sm">
                      {rotuloIndicador(rec.indicador)}:{" "}
                      <span className="font-semibold">
                        {formatarIndicador(rec.indicador, rec.valor_corretor)}
                      </span>{" "}
                      contra {formatarIndicador(rec.indicador, rec.valor_referencia)} do time
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Amostra {rec.amostra ?? 0} · janela de {regra?.janela_dias ?? "?"} dias ·
                      medido em {dataBr(rec.data_ref)} · sugere{" "}
                      {mod ? `${mod.codigo} · ${mod.titulo}` : regra?.modulo_codigo}
                      {!publicado && " (módulo ainda não publicado)"}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => abrir(rec, "atribuir")}
                        disabled={!publicado}
                      >
                        Atribuir
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => abrir(rec, "descartar")}>
                        Descartar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={decisao !== null} onOpenChange={(v) => !v && setDecisao(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisao?.acao === "atribuir" ? "Atribuir o módulo" : "Descartar a recomendação"}
            </DialogTitle>
            <DialogDescription>
              {decisao?.acao === "atribuir"
                ? "O corretor recebe o módulo com prazo, no topo da trilha dele."
                : "O motivo fica registrado. Serve para calibrar a regra."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {decisao?.acao === "atribuir" && (
              <div className="space-y-1.5">
                <Label htmlFor="rec-prazo">Prazo</Label>
                <Input
                  id="rec-prazo"
                  type="date"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rec-motivo">
                {decisao?.acao === "descartar" ? "Motivo (obrigatório)" : "Motivo (opcional)"}
              </Label>
              <Textarea
                id="rec-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisao(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmar()}
              disabled={
                decidir.isPending ||
                (decisao?.acao === "descartar" && motivo.trim() === "") ||
                (decisao?.acao === "atribuir" && prazo === "")
              }
            >
              {decidir.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
