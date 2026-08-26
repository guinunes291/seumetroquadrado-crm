// Propriedades da fila selecionada na aba Filas — TODAS as escritas via RPC
// auditada (atualizar_roleta / criar projeto+vincular). Nas campanhas, cobre
// o que antes vivia no painel de Campanhas: equipe fixa, projeto vinculado,
// token de webhook (gerado no servidor, exibido aqui) e recálculo de tiers.

import { useState } from "react";
import { Copy, Eye, EyeOff, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAtualizarRoleta, useProjetosMini, useRecalcularTiers, type RoletaRow } from "./queries";
import { HorarioRoletaCell } from "./setting-fields";

const SEM_PROJETO = "__none__";
const NOVO_PROJETO = "__new__";

export function FilaPropriedades({
  roleta,
  somenteLeitura,
}: {
  roleta: RoletaRow;
  somenteLeitura: boolean;
}) {
  const atualizar = useAtualizarRoleta();
  const recalcular = useRecalcularTiers();
  const projetosQ = useProjetosMini(roleta.tipo === "campanha");
  const [tokenVisivel, setTokenVisivel] = useState(false);
  const [criarProjetoAberto, setCriarProjetoAberto] = useState(false);

  const ehCampanha = roleta.tipo === "campanha";
  const url = `/api/public/webhooks/lead/${roleta.webhook_token ?? ""}`;

  const copiar = (texto: string | null, oQue: string) => {
    if (!texto) return;
    void navigator.clipboard.writeText(texto);
    toast.success(`${oQue} copiado`);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Propriedades da fila</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={roleta.ativo}
              disabled={somenteLeitura || atualizar.isPending}
              onCheckedChange={(v) => atualizar.mutate({ slug: roleta.slug, ativo: v })}
            />
            Ativa
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={roleta.exigir_presenca}
              disabled={somenteLeitura || atualizar.isPending}
              onCheckedChange={(v) => atualizar.mutate({ slug: roleta.slug, exigirPresenca: v })}
            />
            Exigir presença
          </label>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Horário (BRT):</span>
            {somenteLeitura ? (
              <span className="tabular-nums">
                {roleta.horario_inicio && roleta.horario_fim
                  ? `${roleta.horario_inicio.slice(0, 5)} – ${roleta.horario_fim.slice(0, 5)}`
                  : "24h"}
              </span>
            ) : (
              <HorarioRoletaCell roleta={roleta} />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={roleta.permitir_fora_horario}
              disabled={somenteLeitura || atualizar.isPending}
              onCheckedChange={(v) =>
                atualizar.mutate({ slug: roleta.slug, permitirForaHorario: v })
              }
            />
            Distribuir fora do horário
          </label>
        </div>

        {ehCampanha && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={roleta.equipe_fixa}
                  disabled={somenteLeitura || atualizar.isPending}
                  onCheckedChange={(v) => atualizar.mutate({ slug: roleta.slug, equipeFixa: v })}
                />
                <span>
                  Equipe fixa
                  <span className="ml-1 text-xs text-muted-foreground">
                    {roleta.equipe_fixa ? "(sempre neste time)" : "(respeita zonas)"}
                  </span>
                </span>
              </label>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Projeto:</span>
                <Select
                  value={roleta.projeto_id ?? SEM_PROJETO}
                  disabled={somenteLeitura}
                  onValueChange={(v) => {
                    if (v === NOVO_PROJETO) {
                      setCriarProjetoAberto(true);
                      return;
                    }
                    atualizar.mutate({
                      slug: roleta.slug,
                      projetoId: v === SEM_PROJETO ? null : v,
                    });
                  }}
                >
                  <SelectTrigger className="h-8 w-56">
                    <SelectValue placeholder="Sem projeto vinculado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_PROJETO}>Sem projeto vinculado</SelectItem>
                    <SelectItem value={NOVO_PROJETO}>
                      <span className="flex items-center gap-1 text-primary">
                        <Plus className="h-3.5 w-3.5" /> Criar novo projeto…
                      </span>
                    </SelectItem>
                    {(projetosQ.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!somenteLeitura && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => recalcular.mutate(roleta.slug)}
                  disabled={recalcular.isPending}
                  title="Recalcular tiers agora"
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Recalcular tiers
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="text-muted-foreground">Token do webhook:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {tokenVisivel
                  ? (roleta.webhook_token ?? "—")
                  : roleta.webhook_token
                    ? `${roleta.webhook_token.slice(0, 6)}…${roleta.webhook_token.slice(-4)}`
                    : "—"}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setTokenVisivel((v) => !v)}
                title={tokenVisivel ? "Ocultar" : "Mostrar"}
              >
                {tokenVisivel ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copiar(roleta.webhook_token, "Token")}
                title="Copiar token"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  copiar(
                    typeof window !== "undefined" ? `${window.location.origin}${url}` : url,
                    "URL",
                  )
                }
                title="Copiar URL completa"
              >
                URL
              </Button>
              {roleta.tiers_recalculados_em && (
                <span className="ml-2 text-xs text-muted-foreground">
                  tiers recalculados:{" "}
                  {new Date(roleta.tiers_recalculados_em).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {criarProjetoAberto && (
        <CriarProjetoDialog roleta={roleta} onClose={() => setCriarProjetoAberto(false)} />
      )}
    </Card>
  );
}

/** Cria o projeto (cadastro de Projetos, fora do escopo da distribuição) e o
 *  vincula à campanha pela RPC auditada atualizar_roleta. */
function CriarProjetoDialog({ roleta, onClose }: { roleta: RoletaRow; onClose: () => void }) {
  const [nome, setNome] = useState(roleta.nome);
  const atualizar = useAtualizarRoleta();

  const criarEVincular = useMutation({
    mutationFn: async (nomeProjeto: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const slug =
        nomeProjeto
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || `projeto-${Date.now()}`;
      const { data: novo, error } = await supabase
        .from("projetos")
        .insert({ nome: nomeProjeto, slug, ativo: true, criado_por: user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return (novo as { id: string }).id;
    },
    onSuccess: (projetoId) => {
      atualizar.mutate(
        { slug: roleta.slug, projetoId },
        {
          onSuccess: () => {
            toast.success("Projeto criado e vinculado.");
            onClose();
          },
        },
      );
    },
    onError: (e: Error) => toast.error(`Falha ao criar projeto: ${e.message}`),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar projeto</DialogTitle>
          <DialogDescription>
            O projeto será criado no CRM e vinculado automaticamente à campanha{" "}
            <span className="font-medium">{roleta.nome}</span>. Você pode completar os dados
            comerciais depois em Projetos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="novo-projeto-nome">Nome do projeto</Label>
          <Input
            id="novo-projeto-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Longitude Tucuruvi"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={criarEVincular.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => nome.trim() && criarEVincular.mutate(nome.trim())}
            disabled={criarEVincular.isPending || !nome.trim()}
          >
            {criarEVincular.isPending ? "Criando…" : "Criar e vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
