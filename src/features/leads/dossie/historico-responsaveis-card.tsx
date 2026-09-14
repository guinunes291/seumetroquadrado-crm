// Histórico de responsáveis do lead (visível só para gestão: admin, gestor e
// superintendente). Fonte: distribution_log (toda entrega/transferência) +
// o corretor atual da própria linha do lead.

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";

type Registro = {
  id: string;
  created_at: string;
  tipo: string;
  motivo: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
};

async function carregarHistorico(leadId: string): Promise<Registro[]> {
  const { data, error } = await supabase
    .from("distribution_log")
    .select("id, created_at, tipo, motivo, corretor_id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const linhas = data ?? [];
  const ids = Array.from(
    new Set(linhas.map((l) => l.corretor_id).filter((v): v is string => !!v)),
  );
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: perfis } = await supabase.from("profiles").select("id, nome").in("id", ids);
    for (const p of perfis ?? []) nomes.set(p.id, p.nome);
  }
  return linhas.map((l) => ({
    ...l,
    corretor_nome: l.corretor_id ? (nomes.get(l.corretor_id) ?? null) : null,
  }));
}

async function carregarNome(corretorId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("nome").eq("id", corretorId).maybeSingle();
  return data?.nome ?? null;
}

const ROTULO_TIPO: Record<string, string> = {
  automatica: "Distribuição automática",
  manual: "Transferência manual",
  inicial: "Primeira entrega",
  redistribuicao: "Redistribuição",
};

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function HistoricoResponsaveisCard({
  leadId,
  corretorId,
}: {
  leadId: string;
  corretorId: string | null;
}) {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;

  const historico = useQuery({
    queryKey: ["lead-responsaveis", leadId],
    enabled: gestao,
    staleTime: 30_000,
    queryFn: () => carregarHistorico(leadId),
  });

  const atual = useQuery({
    queryKey: ["lead-responsavel-atual", corretorId],
    enabled: gestao && !!corretorId,
    staleTime: 5 * 60_000,
    queryFn: () => carregarNome(corretorId!),
  });

  if (!gestao) return null;

  const registros = historico.data ?? [];
  const anteriores = registros
    .filter((r) => r.corretor_nome && r.corretor_id !== corretorId)
    .map((r) => r.corretor_nome!);
  const nomesAnteriores = Array.from(new Set(anteriores));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Responsáveis pelo cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Corretor atual:</span>
          <Badge variant="secondary">{atual.data ?? (corretorId ? "…" : "Sem corretor")}</Badge>
        </div>

        <div className="space-y-1 text-sm">
          <span className="text-muted-foreground">Já passou por:</span>{" "}
          {nomesAnteriores.length ? (
            <span className="font-medium">{nomesAnteriores.join(", ")}</span>
          ) : (
            <span className="text-muted-foreground">nenhum outro corretor registrado</span>
          )}
        </div>

        {historico.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando histórico…</p>
        ) : registros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem movimentações registradas.</p>
        ) : (
          <ol className="space-y-2">
            {registros.map((r) => (
              <li key={r.id} className="rounded-md border p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.corretor_nome ?? "Sem corretor definido"}
                  </span>
                  <span className="text-xs text-muted-foreground">{dataHora(r.created_at)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {ROTULO_TIPO[r.tipo] ?? r.tipo}
                  {r.motivo ? ` — ${r.motivo}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
