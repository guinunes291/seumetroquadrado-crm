// Card "Perfil do cliente" da aba Qualificação: o que o cliente procura além da
// parte financeira (quartos, vaga, prioridades) e a nota do corretor. É o que o
// comparativo em PDF usa para dizer por que cada empreendimento combina com ele.
// Renda, entrada, FGTS e zona continuam editados onde já estavam (Editar dados).

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserFocus } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PRIORIDADES,
  ehPrioridade,
  perfilDoLead,
  resumoDoPerfil,
  type Prioridade,
} from "@/features/comparativo/encaixe";
import { buscarPerfilDoLead, leadPerfilQueryKey } from "@/features/comparativo/lead-perfil-query";

type Form = {
  dorms: number | null;
  vaga: boolean | null;
  prioridades: Prioridade[];
  nota: string;
};

const NOTA_MAX = 1200;

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 text-xs transition-colors",
        ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

export function PerfilClienteCard({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const perfilQ = useQuery({
    queryKey: leadPerfilQueryKey(leadId),
    queryFn: () => buscarPerfilDoLead(leadId),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<Form | null>(null);
  const lead = perfilQ.data;

  useEffect(() => {
    if (!lead) return;
    setForm({
      dorms: lead.dorms_desejados ?? null,
      vaga: lead.precisa_vaga ?? null,
      prioridades: (lead.prioridades ?? []).filter(ehPrioridade),
      nota: lead.nota_perfil_cliente ?? "",
    });
  }, [lead]);

  const salvar = useMutation({
    mutationFn: async (f: Form) => {
      const { error } = await supabase
        .from("leads")
        .update({
          dorms_desejados: f.dorms,
          precisa_vaga: f.vaga,
          prioridades: f.prioridades,
          nota_perfil_cliente: f.nota.trim().slice(0, NOTA_MAX) || null,
        })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil do cliente salvo");
      qc.invalidateQueries({ queryKey: leadPerfilQueryKey(leadId) });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (perfilQ.isLoading || (!form && lead)) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (perfilQ.isError || !lead || !form) return null;
  if (!lead.perfilDisponivel) return null;

  const original = {
    dorms: lead.dorms_desejados ?? null,
    vaga: lead.precisa_vaga ?? null,
    prioridades: (lead.prioridades ?? []).filter(ehPrioridade),
    nota: lead.nota_perfil_cliente ?? "",
  };
  const mudou = JSON.stringify(original) !== JSON.stringify(form);

  const resumo = resumoDoPerfil(
    perfilDoLead({
      ...lead,
      dorms_desejados: form.dorms,
      precisa_vaga: form.vaga,
      prioridades: form.prioridades,
    }),
  );

  const togglePrio = (p: Prioridade) =>
    setForm({
      ...form,
      prioridades: form.prioridades.includes(p)
        ? form.prioridades.filter((x) => x !== p)
        : [...form.prioridades, p],
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <UserFocus className="h-4 w-4 text-primary" /> Perfil do cliente
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Vai no comparativo em PDF: é com isso que cada empreendimento é explicado para o cliente.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Quartos</Label>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <Chip
                key={n}
                ativo={form.dorms === n}
                onClick={() => setForm({ ...form, dorms: form.dorms === n ? null : n })}
              >
                {n === 4 ? "4+" : n} {n === 1 ? "dorm" : "dorms"}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Vaga de garagem</Label>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              ativo={form.vaga === true}
              onClick={() => setForm({ ...form, vaga: form.vaga === true ? null : true })}
            >
              Precisa de vaga
            </Chip>
            <Chip
              ativo={form.vaga === false}
              onClick={() => setForm({ ...form, vaga: form.vaga === false ? null : false })}
            >
              Não precisa
            </Chip>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Prioridades</Label>
          <div className="flex flex-wrap gap-1.5">
            {PRIORIDADES.map((p) => (
              <Chip
                key={p.chave}
                ativo={form.prioridades.includes(p.chave)}
                onClick={() => togglePrio(p.chave)}
              >
                {p.rotulo}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`nota-perfil-${leadId}`} className="text-xs">
            O que faz sentido para este cliente
          </Label>
          <Textarea
            id={`nota-perfil-${leadId}`}
            rows={3}
            maxLength={NOTA_MAX}
            placeholder="Ex.: Casal com um filho pequeno, trabalha na Paulista e quer sair do aluguel até o fim do ano. Quer condomínio com lazer para a criança."
            value={form.nota}
            onChange={(e) => setForm({ ...form, nota: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">
            Aparece como mensagem na capa do PDF (dá para ajustar na hora de gerar).
          </p>
        </div>

        {resumo.length > 0 && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs">
            <span className="font-medium">Resumo no PDF: </span>
            {resumo.join(" · ")}
          </div>
        )}

        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={!mudou || salvar.isPending}
          onClick={() => salvar.mutate(form)}
        >
          {salvar.isPending ? "Salvando…" : "Salvar perfil"}
        </Button>
      </CardContent>
    </Card>
  );
}
