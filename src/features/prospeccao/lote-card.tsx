// Lote de prospecção: a única porta de base nova do corretor (além de roleta
// e redistribuição). Pede até 30 clientes do Bolsão numa zona; eles entram na
// cadência D0→D3. Novo lote só quando o anterior zerar; carteira cheia bloqueia.
// Regras no banco: prospeccao_pedir_lote / prospeccao_lote_status_v1.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ZONAS = ["Leste", "Oeste", "Norte", "Sul", "Centro"] as const;

type StatusLote = {
  lote_id: string | null;
  zona: string | null;
  criado_em: string | null;
  entregues: number;
  em_cadencia: number;
  ficaram: number;
  sairam: number;
  vagas: number;
  teto: number;
  pode_pedir: boolean;
  motivo: string | null;
};

export function motivoBloqueio(s: Pick<StatusLote, "motivo" | "em_cadencia" | "teto">): string | null {
  if (s.motivo === "lote_em_andamento")
    return `Seu lote atual ainda tem ${s.em_cadencia} ${s.em_cadencia === 1 ? "cliente" : "clientes"} na cadência. Termine para pedir outro.`;
  if (s.motivo === "carteira_cheia")
    return `Sua carteira ativa está no teto (${s.teto}). Abra vagas para pedir um lote.`;
  if (s.motivo === "so_corretor") return "Só corretores pedem lote.";
  return null;
}

export function LoteProspeccaoCard() {
  const { user } = useAuth();
  const { isCorretor } = useUserRoles();
  const qc = useQueryClient();
  const [zona, setZona] = useState<string>("");

  const statusQ = useQuery({
    queryKey: ["prospeccao:lote-status", user?.id],
    enabled: !!user && isCorretor,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("prospeccao_lote_status_v1");
      if (error) throw error;
      return data as unknown as StatusLote;
    },
  });

  const pedir = useMutation({
    mutationFn: async (z: string) => {
      const { data, error } = await supabase.rpc("prospeccao_pedir_lote", { _zona: z });
      if (error) throw error;
      return data as unknown as { ok: boolean; motivo?: string; entregues?: number };
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Vieram ${r.entregues} clientes`, {
          description: "Eles já estão na sua Fila do Dia da cadência.",
        });
      } else if (r.motivo === "zona_vazia") {
        toast.info("Não há clientes disponíveis nessa zona agora. Tente outra.");
      } else {
        toast.error(motivoBloqueio({ motivo: r.motivo ?? null, em_cadencia: 0, teto: 65 }) ?? "Não foi possível pedir o lote.");
      }
      for (const k of ["prospeccao:lote-status", "prospeccao:contagens", "leads", "cadencia", "nav-badges"])
        void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: () => toast.error("Não foi possível pedir o lote."),
  });

  if (!isCorretor) return null;
  const s = statusQ.data;
  const bloqueio = s ? motivoBloqueio(s) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-display font-semibold">Pedir lote de 30</h3>
            <p className="text-sm text-muted-foreground">
              Clientes do Bolsão da zona que você escolher. Entram na cadência e, no encerramento, quem respondeu fica na sua carteira.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={zona} onValueChange={setZona} disabled={!s?.pode_pedir}>
            <SelectTrigger className="w-36" aria-label="Zona">
              <SelectValue placeholder="Zona" />
            </SelectTrigger>
            <SelectContent>
              {ZONAS.map((z) => (
                <SelectItem key={z} value={z}>Zona {z}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!s?.pode_pedir || !zona || pedir.isPending}
            onClick={() => pedir.mutate(zona)}
          >
            {pedir.isPending ? "Separando…" : "Pedir lote"}
          </Button>
        </div>
      </div>

      {statusQ.isLoading ? (
        <Skeleton className="mt-4 h-5 w-64" />
      ) : (
        <div className="mt-4 space-y-1 text-sm">
          {s?.lote_id && s.criado_em && (
            <p>
              Lote de {new Date(s.criado_em).toLocaleDateString("pt-BR")} (Zona {s.zona}) — {s.em_cadencia} em cadência, {s.ficaram} ficaram, {s.sairam} saíram
            </p>
          )}
          {bloqueio && <p className="text-muted-foreground">{bloqueio}</p>}
        </div>
      )}
    </div>
  );
}
