// Aba "Participantes" (só admin): quem entra na Academia é decisão do dono,
// nunca inferência. A tela lista todo mundo com os vetos já calculados (robô,
// identidade MCP, conta inativa) para explicar por que alguém não pode entrar,
// e inscreve em lote com a data de início da trilha.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MagnifyingGlass, UserPlus } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AcademiaCandidatoRow } from "@/features/academia/tipos";
import { dataBr } from "../formato";
import { hojeBrasilia } from "../estado-modulo";
import { ROTULO_NIVEL } from "../niveis";
import { useCandidatos, useDefinirParticipacao } from "./gestao-client";
import { mensagemDaGestao } from "./mensagens";

const ROTULO_PAPEL: Record<string, string> = {
  admin: "Admin",
  gestor: "Gestor",
  corretor: "Corretor",
  superintendente: "Superintendente",
  sdr: "SDR",
};

/** Por que esta pessoa não pode ser inscrita (null = pode). */
export function vetoDeInscricao(c: AcademiaCandidatoRow): string | null {
  if (c.eh_bot) return "Conta de robô";
  if (c.eh_mcp) return "Identidade de integração";
  if (!c.conta_ativa) return "Conta inativa";
  return null;
}

export function AbaParticipantes() {
  const candidatos = useCandidatos(true);
  const definir = useDefinirParticipacao();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"inscritos" | "fora">("inscritos");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [inicio, setInicio] = useState(hojeBrasilia());
  const [removendo, setRemovendo] = useState<AcademiaCandidatoRow | null>(null);
  const [salvando, setSalvando] = useState(false);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (candidatos.data ?? [])
      .filter((c) => (filtro === "inscritos" ? c.participa : !c.participa))
      .filter(
        (c) =>
          !termo ||
          (c.nome ?? "").toLowerCase().includes(termo) ||
          (c.email ?? "").toLowerCase().includes(termo),
      );
  }, [candidatos.data, busca, filtro]);

  if (candidatos.isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar a lista de pessoas."
        error={candidatos.error}
        onRetry={() => void candidatos.refetch()}
      />
    );
  }
  if (candidatos.isPending) return <Skeleton className="h-64 w-full" />;
  if (candidatos.data === null) {
    return (
      <EmptyState
        icon={UserPlus}
        title="A lista de participantes ainda não está no banco."
        description="Rode o SQL da gestão da Academia no editor do Lovable Cloud para liberar esta aba."
      />
    );
  }

  const inscritos = candidatos.data.filter((c) => c.participa).length;

  async function inscreverMarcados() {
    setSalvando(true);
    let ok = 0;
    for (const id of marcados) {
      try {
        await definir.mutateAsync({ pessoaId: id, participa: true, inicio });
        ok += 1;
      } catch (e) {
        const nome = candidatos.data?.find((c) => c.pessoa_id === id)?.nome ?? "Pessoa";
        toast.error(`${nome}: ${mensagemDaGestao(e)}`);
      }
    }
    setSalvando(false);
    setMarcados(new Set());
    if (ok > 0) toast.success(ok === 1 ? "1 pessoa inscrita." : `${ok} pessoas inscritas.`);
  }

  async function remover(c: AcademiaCandidatoRow) {
    try {
      await definir.mutateAsync({ pessoaId: c.pessoa_id, participa: false, inicio: null });
      toast.success(`${c.nome ?? "Pessoa"} saiu da Academia. O histórico fica guardado.`);
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          type="single"
          value={filtro}
          onValueChange={(v) => {
            if (v === "inscritos" || v === "fora") {
              setFiltro(v);
              setMarcados(new Set());
            }
          }}
          aria-label="Quem mostrar"
        >
          <ToggleGroupItem value="inscritos">Inscritos ({inscritos})</ToggleGroupItem>
          <ToggleGroupItem value="fora">
            Fora da Academia ({candidatos.data.length - inscritos})
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="relative sm:w-72">
          <MagnifyingGlass className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-8"
            aria-label="Buscar pessoa"
          />
        </div>
      </div>

      {filtro === "fora" && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="inicio-trilha">Início da trilha</Label>
            <Input
              id="inicio-trilha"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="w-44"
            />
          </div>
          <Button
            onClick={() => void inscreverMarcados()}
            disabled={marcados.size === 0 || salvando || !inicio}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            {salvando
              ? "Inscrevendo..."
              : marcados.size === 0
                ? "Marque quem vai entrar"
                : `Inscrever ${marcados.size}`}
          </Button>
          <p className="text-xs text-muted-foreground sm:ml-2">
            O prazo de cada módulo conta a partir do início da trilha.
          </p>
        </div>
      )}

      {lista.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={filtro === "inscritos" ? "Ninguém inscrito ainda." : "Ninguém encontrado."}
          description={
            filtro === "inscritos"
              ? "Troque para Fora da Academia, marque quem entra e clique em Inscrever."
              : "Ajuste a busca."
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {lista.map((c) => {
            const veto = vetoDeInscricao(c);
            return (
              <li key={c.pessoa_id} className="flex items-center gap-3 p-3">
                {filtro === "fora" && (
                  <Checkbox
                    checked={marcados.has(c.pessoa_id)}
                    disabled={veto !== null}
                    aria-label={`Marcar ${c.nome ?? c.email}`}
                    onCheckedChange={(v) =>
                      setMarcados((atual) => {
                        const novo = new Set(atual);
                        if (v === true) novo.add(c.pessoa_id);
                        else novo.delete(c.pessoa_id);
                        return novo;
                      })
                    }
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.nome ?? c.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.papeis.map((p) => ROTULO_PAPEL[p] ?? p).join(", ") || "Sem papel"}
                    {c.participa && c.inicio_trilha
                      ? ` · na trilha desde ${dataBr(c.inicio_trilha)}`
                      : ""}
                    {c.participa && c.nivel ? ` · ${ROTULO_NIVEL[c.nivel]}` : ""}
                  </p>
                </div>
                {veto && <StatusBadge intent="neutral">{veto}</StatusBadge>}
                {c.participa && (
                  <Button size="sm" variant="outline" onClick={() => setRemovendo(c)}>
                    Remover
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={removendo !== null} onOpenChange={(v) => !v && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Tirar {removendo?.nome ?? "esta pessoa"} da Academia?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A trilha some do menu dela. Nível, certificados e histórico ficam guardados e voltam
              se ela for inscrita de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => removendo && void remover(removendo)}>
              Tirar da Academia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
