// Espelho do lead — só o ADMIN (decisão 2026-09-04): adicionar um corretor
// extra ao mesmo registro, substituir o dono, remover um espelho, ou devolver
// ao SDR. Tudo com motivo obrigatório e trilha em distribution_log.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { UsersThree } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/interacoes";
import {
  alocarEspelho,
  devolverAoSdr,
  removerEspelho,
  useEspelhos,
  useInvalidarSdr,
} from "./client";

type Lead = {
  id: string;
  nome: string;
  corretor_id: string | null;
  sdr_id?: string | null;
  sdr_entregue_em?: string | null;
};

function useCorretoresAtivos(enabled: boolean) {
  return useQuery({
    queryKey: ["corretores-ativos-espelho"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: roles, error: e1 } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "corretor");
      if (e1) throw e1;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [] as Array<{ id: string; nome: string }>;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function MotivoDialog({
  titulo,
  descricao,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  titulo: string;
  descricao?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (motivo: string) => void;
  pending?: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Motivo</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={motivo.trim().length < 5 || pending}
            onClick={() => onConfirm(motivo.trim())}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EspelhoLeadCard({ lead }: { lead: Lead }) {
  const { isAdmin } = useUserRoles();
  const invalidar = useInvalidarSdr();
  const espelhos = useEspelhos(lead.id, isAdmin);
  const corretores = useCorretoresAtivos(isAdmin);
  const [alocarAberto, setAlocarAberto] = useState(false);
  const [modo, setModo] = useState<"adicionar" | "substituir">("adicionar");
  const [corretorId, setCorretorId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [devolvendo, setDevolvendo] = useState(false);

  const nomePor = (id: string) => corretores.data?.find((c) => c.id === id)?.nome ?? id.slice(0, 8);

  const alocar = useMutation({
    mutationFn: () => alocarEspelho({ leadId: lead.id, corretorId, modo, motivo: motivo.trim() }),
    onSuccess: (res) => {
      toast.success(
        modo === "adicionar"
          ? `${res.corretor_nome ?? "Corretor"} entrou no espelho`
          : `${res.corretor_nome ?? "Corretor"} é o novo dono do lead`,
      );
      setAlocarAberto(false);
      setMotivo("");
      setCorretorId("");
      invalidar(lead.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: ({ corretor, motivoRem }: { corretor: string; motivoRem: string }) =>
      removerEspelho(lead.id, corretor, motivoRem),
    onSuccess: () => {
      toast.success("Espelho removido");
      setRemovendo(null);
      invalidar(lead.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const devolver = useMutation({
    mutationFn: (m: string) => devolverAoSdr(lead.id, m),
    onSuccess: () => {
      toast.success("Lead devolvido ao SDR");
      setDevolvendo(false);
      invalidar(lead.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <UsersThree className="h-4 w-4" weight="duotone" /> Espelho do lead (admin)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4 text-sm">
        <p className="text-muted-foreground">
          Dono comercial:{" "}
          <strong>{lead.corretor_id ? nomePor(lead.corretor_id) : "sem corretor"}</strong>
          {lead.sdr_id && (
            <>
              {" "}
              · SDR: <strong>{nomePor(lead.sdr_id)}</strong>
            </>
          )}
        </p>
        {(espelhos.data?.length ?? 0) > 0 && (
          <ul className="space-y-1">
            {espelhos.data!.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span>
                  <strong>{nomePor(e.user_id)}</strong>{" "}
                  <span className="text-xs text-muted-foreground">
                    · {e.motivo} · {formatRelativeTime(e.concedido_em)}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setRemovendo(e.user_id)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAlocarAberto(true)}>
            Alocar espelho
          </Button>
          {lead.sdr_id && lead.sdr_entregue_em && (
            <Button size="sm" variant="outline" onClick={() => setDevolvendo(true)}>
              Devolver ao SDR
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={alocarAberto} onOpenChange={setAlocarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alocar espelho de {lead.nome}</DialogTitle>
            <DialogDescription>
              Adicionar mantém o dono atual e soma um corretor. Substituir troca o dono: o anterior
              perde o acesso e tarefas abertas migram.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="adicionar" id="espelho-adicionar" />
                <Label htmlFor="espelho-adicionar">Adicionar corretor ao espelho</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="substituir" id="espelho-substituir" />
                <Label htmlFor="espelho-substituir">Substituir o dono</Label>
              </div>
            </RadioGroup>
            <div className="space-y-1.5">
              <Label>Corretor</Label>
              <Select value={corretorId} onValueChange={setCorretorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o corretor" />
                </SelectTrigger>
                <SelectContent>
                  {(corretores.data ?? [])
                    .filter((c) => c.id !== lead.corretor_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo (obrigatório)</Label>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlocarAberto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!corretorId || motivo.trim().length < 5 || alocar.isPending}
              onClick={() => alocar.mutate()}
            >
              {modo === "adicionar" ? "Adicionar" : "Substituir dono"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {removendo && (
        <MotivoDialog
          titulo={`Remover ${nomePor(removendo)} do espelho`}
          open={!!removendo}
          onOpenChange={(v) => !v && setRemovendo(null)}
          pending={remover.isPending}
          onConfirm={(m) => remover.mutate({ corretor: removendo, motivoRem: m })}
        />
      )}
      {devolvendo && (
        <MotivoDialog
          titulo="Devolver o lead ao SDR"
          descricao="O corretor perde o acesso, tarefas abertas dele cancelam e o SDR ganha a tarefa de reaquecer."
          open={devolvendo}
          onOpenChange={setDevolvendo}
          pending={devolver.isPending}
          onConfirm={(m) => devolver.mutate(m)}
        />
      )}
    </Card>
  );
}
