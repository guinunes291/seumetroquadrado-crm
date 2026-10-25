import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LinkSimple, Prohibit } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROTULO_BLOCO, hhmm, somarTempoPorSecao, statusProposta } from "@/lib/proposta-link";
import { revogarPropostaLink } from "@/lib/proposta-link.functions";
import { GerarLinkDialog } from "./gerar-link-dialog";

type Props = { lead: { id: string; nome: string; telefone: string | null; projeto_id?: string | null } };

function quando(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function LinksEnviadosCard({ lead }: Props) {
  const [aberto, setAberto] = useState(false);
  const qc = useQueryClient();
  const revogar = useServerFn(revogarPropostaLink);
  const q = useQuery({
    queryKey: ["propostas-lead", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("propostas")
        .select(
          "id, modelo, created_at, expira_em, revogado_em, aceita_em, total_aberturas, ultimo_acesso_em, versao_atual, proposta_sessoes(tempo_por_secao, tempo_total_s, profundidade_max)",
        )
        .eq("lead_id", lead.id)
        .not("token_hash", "is", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const onRevogar = async (id: string) => {
    if (!window.confirm("Revogar este link? O cliente não vai mais conseguir abrir.")) return;
    try {
      await revogar({ data: { id } });
      toast.success("Link revogado.");
      void qc.invalidateQueries({ queryKey: ["propostas-lead", lead.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível revogar.");
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">Links enviados</CardTitle>
        <Button size="sm" onClick={() => setAberto(true)}>
          <LinkSimple className="mr-1 h-4 w-4" /> Gerar link
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {q.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum link ainda. Gere uma apresentação ou proposta para o cliente.</p>
        )}
        {q.data?.map((p) => {
          const sessoes = p.proposta_sessoes ?? [];
          const prof = Math.max(0, ...sessoes.map((s) => s.profundidade_max ?? 0));
          const total = sessoes.reduce((a, s) => a + (s.tempo_total_s ?? 0), 0);
          const secoes = Object.entries(somarTempoPorSecao(sessoes)).sort((a, b) => b[1] - a[1]);
          const status = statusProposta({ ...p, leitura_pct: sessoes.length ? prof : null });
          const ativo = !p.revogado_em && !p.aceita_em && (!p.expira_em || new Date(p.expira_em) > new Date());
          return (
            <div key={p.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.modelo === "proposta" ? "Proposta" : "Apresentação"}</span>
                <Badge variant="secondary">{status}</Badge>
                <span className="text-muted-foreground">enviado {quando(p.created_at)}</span>
                {ativo && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onRevogar(p.id)}>
                    <Prohibit className="mr-1 h-4 w-4" /> Revogar
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                <span>{p.total_aberturas} aberturas</span>
                <span>último acesso {quando(p.ultimo_acesso_em)}</span>
                <span>tempo total {hhmm(total)}</span>
              </div>
              {secoes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {secoes.map(([k, v], i) => (
                    <Badge key={k} variant={i === 0 ? "default" : "outline"}>
                      {ROTULO_BLOCO[k] ?? k} {hhmm(v)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      <GerarLinkDialog open={aberto} onOpenChange={setAberto} lead={lead} />
    </Card>
  );
}
