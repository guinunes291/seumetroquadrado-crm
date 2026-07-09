// Aba Fila de Exceções — nenhum lead some: tudo que não pôde ser distribuído
// aparece aqui com motivo, tentativas e ações (reprocessar, corrigir origem,
// enviar para roleta, atribuir manualmente, arquivar). Toda ação é auditada.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EXCECAO_STATUS_LABEL,
  motivoExcecaoLabel,
  roletaLabel,
} from "@/lib/distribuicao";
import {
  useCorretoresDisponiveis,
  useExcecoes,
  useNomesPerfis,
  useResolverExcecao,
  type ExcecaoLinha,
} from "./queries";

const ORIGENS = [
  "facebook",
  "google_sheets",
  "site",
  "indicacao",
  "captacao_corretor",
  "whatsapp",
  "telefone",
  "plantao",
  "agendamento_self_service",
  "chatbot",
  "outro",
  "importacao",
] as const;

export function TabExcecoes({ somenteLeitura }: { somenteLeitura: boolean }) {
  const [visao, setVisao] = useState<"abertas" | "todas">("abertas");
  const q = useExcecoes(visao);
  const nomesQ = useNomesPerfis();
  const resolver = useResolverExcecao();
  const [alvo, setAlvo] = useState<ExcecaoLinha | null>(null);

  const linhas = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Leads que a roleta não conseguiu distribuir. Reprocessar tenta a roleta de novo;
          corrigir a origem/roleta redireciona; atribuição manual entrega direto a um corretor.
        </p>
        <Tabs value={visao} onValueChange={(v) => setVisao(v as "abertas" | "todas")}>
          <TabsList>
            <TabsTrigger value="abertas">Abertas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          {q.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : linhas.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={visao === "abertas" ? "Fila de exceções vazia 👏" : "Nenhuma exceção registrada"}
              description="Todos os leads entraram nas roletas normalmente."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Roleta sugerida</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tentativas</TableHead>
                  <TableHead>Resolução</TableHead>
                  {!somenteLeitura && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: e.lead_id }}
                        className="hover:underline"
                      >
                        {e.leads?.nome ?? "(lead)"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {e.leads?.telefone ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{e.leads?.origem ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {format(parseISO(e.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge intent={e.motivo === "falha_tecnica" ? "danger" : "warning"}>
                        {motivoExcecaoLabel(e.motivo)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs">{roletaLabel(e.roleta_slug)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        intent={
                          e.status === "resolvida"
                            ? "success"
                            : e.status === "arquivada"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {EXCECAO_STATUS_LABEL[e.status] ?? e.status}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.tentativas}</TableCell>
                    <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                      {e.status === "resolvida" || e.status === "arquivada"
                        ? `${e.resolucao ?? "—"}${
                            e.resolvida_por
                              ? ` · ${nomesQ.data?.get(e.resolvida_por) ?? ""}`
                              : ""
                          }`
                        : (e.ultimo_erro ?? "—")}
                    </TableCell>
                    {!somenteLeitura && (
                      <TableCell>
                        {(e.status === "pendente" || e.status === "em_analise") && (
                          <Button variant="outline" size="sm" onClick={() => setAlvo(e)}>
                            Resolver
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ResolverExcecaoDialog
        alvo={alvo}
        onFechar={() => setAlvo(null)}
        resolver={resolver}
      />
    </div>
  );
}

function ResolverExcecaoDialog({
  alvo,
  onFechar,
  resolver,
}: {
  alvo: ExcecaoLinha | null;
  onFechar: () => void;
  resolver: ReturnType<typeof useResolverExcecao>;
}) {
  const [acao, setAcao] = useState<string>("reprocessar");
  const [corretorId, setCorretorId] = useState("");
  const [roleta, setRoleta] = useState("");
  const [origem, setOrigem] = useState("");
  const corretoresQ = useCorretoresDisponiveis(!!alvo);

  const executar = () => {
    if (!alvo) return;
    const params: Record<string, string> = {};
    if (acao === "atribuir_manual") params.corretor_id = corretorId;
    if (acao === "escolher_roleta") params.roleta_slug = roleta;
    if (acao === "corrigir_origem") params.origem = origem;
    resolver.mutate(
      { excecaoId: alvo.id, acao, params },
      { onSuccess: () => onFechar() },
    );
  };

  const pronto =
    acao === "reprocessar" ||
    acao === "arquivar" ||
    (acao === "atribuir_manual" && !!corretorId) ||
    (acao === "escolher_roleta" && !!roleta) ||
    (acao === "corrigir_origem" && !!origem);

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <ShieldAlert className="mr-1.5 inline h-4 w-4" />
            Resolver exceção — {alvo?.leads?.nome}
          </DialogTitle>
          <DialogDescription>
            Motivo: {alvo ? motivoExcecaoLabel(alvo.motivo) : ""} · {alvo?.tentativas} tentativa(s).
            A ação fica registrada com seu usuário.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ação</Label>
            <Select value={acao} onValueChange={setAcao}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reprocessar">
                  Reprocessar (tentar a roleta novamente)
                </SelectItem>
                <SelectItem value="escolher_roleta">Enviar para uma roleta específica</SelectItem>
                <SelectItem value="atribuir_manual">Atribuir manualmente a um corretor</SelectItem>
                <SelectItem value="corrigir_origem">Corrigir a origem e reprocessar</SelectItem>
                <SelectItem value="arquivar">Arquivar exceção (lead fica sem corretor)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {acao === "atribuir_manual" && (
            <div className="space-y-1.5">
              <Label>Corretor</Label>
              <Select value={corretorId} onValueChange={setCorretorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o corretor" />
                </SelectTrigger>
                <SelectContent>
                  {(corretoresQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {acao === "escolher_roleta" && (
            <div className="space-y-1.5">
              <Label>Roleta</Label>
              <Select value={roleta} onValueChange={setRoleta}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a roleta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plantao">Roleta Plantão</SelectItem>
                  <SelectItem value="marquinhos">Roleta Marquinhos</SelectItem>
                  <SelectItem value="landing">Roleta Landing Page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {acao === "corrigir_origem" && (
            <div className="space-y-1.5">
              <Label>Nova origem</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a origem" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGENS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {acao === "arquivar" && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              Arquivar NÃO distribui o lead — ele permanece sem corretor, fora da fila de
              exceções. Use apenas para casos tratados fora do sistema.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={executar} disabled={!pronto || resolver.isPending}>
            {resolver.isPending ? (
              <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Executar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
