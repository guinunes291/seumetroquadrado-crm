import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChatCircleDots,
  CheckCircle,
  InstagramLogo,
  Plugs,
  UserPlus,
  Warning,
} from "@phosphor-icons/react";
import { RequireRole } from "@/components/require-role";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ROTULO_ETAPA,
  TEXTOS_PADRAO,
  type Etapa,
  type TextosConversa,
} from "@/features/instagram-dm/texto";
import { CHAVE_PAINEL } from "@/features/instagram-dm/chave";
import { EditorPalavra, Roteiro } from "@/features/instagram-dm/painel-editores";
import {
  carregarPainelInstagramDm,
  conectarInstagram,
  reenviarLeadInstagram,
  salvarPalavraInstagram,
  salvarTextosInstagram,
  type ConversaPainel,
  type PainelInstagramDm,
  type PalavraInput,
  type PalavraPainel,
} from "@/lib/instagram-dm.functions";

export const Route = createFileRoute("/_authenticated/instagram-dm")({
  head: () => ({
    meta: [
      { title: "DM do Instagram · CRM SMQ" },
      {
        name: "description",
        content: "Resposta automática por palavra-chave no Instagram, qualificação e lead no CRM.",
      },
    ],
  }),
  component: () => (
    <RequireRole allow={["admin", "gestor"]}>
      <InstagramDmPage />
    </RequireRole>
  ),
});

const CHAVE = CHAVE_PAINEL;

function quando(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InstagramDmPage() {
  const carregar = useServerFn(carregarPainelInstagramDm);
  const q = useQuery({ queryKey: CHAVE, queryFn: () => carregar(), refetchInterval: 30_000 });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="DM do Instagram"
        description="Quem comentar ou mandar DM com a palavra-chave recebe a mensagem na hora, responde 3 perguntas e vira lead no CRM."
      />
      {q.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : q.isError || !q.data ? (
        <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Painel dados={q.data} />
      )}
    </div>
  );
}

function Painel({ dados }: { dados: PainelInstagramDm }) {
  const { totais } = dados;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile title="Conversas" value={totais.conversas} icon={ChatCircleDots} />
        <StatTile
          title="Resposta enviada"
          value={totais.respondidas}
          icon={CheckCircle}
          intent="success"
        />
        <StatTile title="Qualificados" value={totais.qualificadas} icon={UserPlus} intent="info" />
        <StatTile title="Leads no CRM" value={totais.leads} icon={UserPlus} intent="success" />
        <StatTile
          title="Erros"
          value={totais.erros}
          icon={Warning}
          intent={totais.erros > 0 ? "danger" : "neutral"}
        />
      </div>

      <Conexao dados={dados} />

      <Tabs defaultValue="conversas">
        <TabsList>
          <TabsTrigger value="conversas">Quem mandou</TabsTrigger>
          <TabsTrigger value="palavras">Palavras-chave</TabsTrigger>
          <TabsTrigger value="textos">Roteiro</TabsTrigger>
          <TabsTrigger value="erros">Erros ({dados.erros.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="conversas" className="mt-4">
          <ListaConversas conversas={dados.conversas} podeEditar={dados.podeEditar} />
        </TabsContent>
        <TabsContent value="palavras" className="mt-4">
          <Palavras dados={dados} />
        </TabsContent>
        <TabsContent value="textos" className="mt-4">
          <Roteiro dados={dados} />
        </TabsContent>
        <TabsContent value="erros" className="mt-4">
          <ListaErros dados={dados} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Conexao({ dados }: { dados: PainelInstagramDm }) {
  const qc = useQueryClient();
  const conectar = useServerFn(conectarInstagram);
  // window só existe no navegador; o painel é client-side depois do login.
  const [origem, setOrigem] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const ehPreview = /(^|[.-])preview|localhost/i.test(origem);
  const m = useMutation({
    mutationFn: () => conectar({ data: { origem } }),
    onSuccess: (r) => {
      toast.success(
        `Instagram ${r.username ? `@${r.username} ` : ""}conectado. Webhook ${r.acao === "criado" ? "cadastrado" : "atualizado"} no Zernio.`,
      );
      void qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível conectar."),
  });
  const { conexao } = dados;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <InstagramLogo className="h-5 w-5" />
          Conexão com o Instagram (Zernio)
          {conexao.conectado ? (
            <Badge variant="secondary" className="bg-success/12 text-success">
              Conectado{conexao.username ? ` · @${conexao.username}` : ""}
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-warning/12 text-warning">
              Não conectado
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!dados.chaveConfigurada && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3">
            Falta a chave da API do Zernio. Cadastre o secret <code>ZERNIO_API_KEY</code> no Lovable
            (Cloud → Secrets) e recarregue esta página.
          </p>
        )}
        {conexao.conectado && (
          <p className="text-muted-foreground">
            Recebendo em <code className="break-all">{conexao.webhookUrl}</code> desde{" "}
            {quando(conexao.conectadoEm)}.
          </p>
        )}
        {dados.podeEditar && (
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="origem-crm">Endereço publicado do CRM</Label>
              <Input
                id="origem-crm"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="https://seu-crm.lovable.app"
              />
              {ehPreview && (
                <p className="text-xs text-warning">
                  Este é o endereço de preview. Troque pelo endereço publicado, senão o Instagram
                  para de responder quando o preview fechar.
                </p>
              )}
            </div>
            <Button
              onClick={() => m.mutate()}
              disabled={m.isPending || !dados.chaveConfigurada || !origem || ehPreview}
            >
              <Plugs className="mr-2 h-4 w-4" />
              {m.isPending
                ? "Conectando…"
                : conexao.conectado
                  ? "Reconectar"
                  : "Conectar ao Instagram"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function rotuloEtapa(etapa: string): string {
  return etapa in ROTULO_ETAPA ? ROTULO_ETAPA[etapa as Etapa] : "Abandonada";
}

function StatusLead({ c }: { c: ConversaPainel }) {
  if (c.lead_id) {
    return (
      <Link to="/leads/$leadId" params={{ leadId: c.lead_id }} className="text-primary underline">
        {c.lead_status === "duplicado" ? "Já era lead" : "Ver lead"}
      </Link>
    );
  }
  if (c.lead_status === "aguardando_roleta")
    return <span className="text-warning">Sem roleta</span>;
  if (c.lead_status === "erro") return <span className="text-destructive">Erro</span>;
  return <span className="text-muted-foreground">—</span>;
}

function ListaConversas({
  conversas,
  podeEditar,
}: {
  conversas: ConversaPainel[];
  podeEditar: boolean;
}) {
  const qc = useQueryClient();
  const reenviar = useServerFn(reenviarLeadInstagram);
  const m = useMutation({
    mutationFn: (conversaId: string) => reenviar({ data: { conversaId } }),
    onSuccess: (r) => {
      if (r.ok)
        toast.success(r.status === "duplicado" ? "Já era lead no CRM." : "Lead criado no CRM.");
      else toast.error(r.erro ?? `Não foi: ${r.status}`);
      void qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou."),
  });

  if (conversas.length === 0) {
    return (
      <EmptyState
        icon={ChatCircleDots}
        title="Ninguém chamou ainda"
        description="Assim que alguém comentar ou mandar DM com uma palavra-chave, aparece aqui."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quem mandou</TableHead>
            <TableHead>Quando</TableHead>
            <TableHead>Palavra</TableHead>
            <TableHead>Resposta</TableHead>
            <TableHead>Qualificação</TableHead>
            <TableHead>CRM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conversas.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="font-medium">{c.nome || "Sem nome"}</div>
                {c.username && (
                  <a
                    href={`https://instagram.com/${c.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    @{c.username}
                  </a>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{quando(c.criado_em)}</TableCell>
              <TableCell>
                <Badge variant="outline">{c.palavra}</Badge>
                <div className="mt-1 text-xs text-muted-foreground">
                  {c.origem === "comentario" ? "Comentário" : "DM"}
                </div>
              </TableCell>
              <TableCell className="text-sm">
                {c.resposta_enviada ? (
                  <span className="text-success">Enviada · {quando(c.resposta_enviada_em)}</span>
                ) : c.erro ? (
                  <span className="text-destructive" title={c.erro}>
                    Não enviada
                  </span>
                ) : (
                  <span className="text-muted-foreground">Enviando…</span>
                )}
              </TableCell>
              <TableCell className="max-w-[260px] text-xs">
                <div className="font-medium text-sm">{rotuloEtapa(c.etapa)}</div>
                {c.renda_texto && <div>Renda: {c.renda_texto}</div>}
                {c.regiao && <div>Região: {c.regiao}</div>}
                {c.prazo && <div>Prazo: {c.prazo}</div>}
              </TableCell>
              <TableCell className="text-sm">
                <StatusLead c={c} />
                {podeEditar && !c.lead_id && c.tem_whatsapp && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 block"
                    disabled={m.isPending}
                    onClick={() => m.mutate(c.id)}
                  >
                    Reenviar ao CRM
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ListaErros({ dados }: { dados: PainelInstagramDm }) {
  if (dados.erros.length === 0) {
    return <EmptyState icon={CheckCircle} title="Nenhum erro" description="Tudo respondido." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Onde</TableHead>
            <TableHead>O que aconteceu</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.erros.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap text-sm">{quando(e.quando)}</TableCell>
              <TableCell className="text-sm">{e.origem}</TableCell>
              <TableCell className="text-sm">{e.erro}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Palavras({ dados }: { dados: PainelInstagramDm }) {
  const [editando, setEditando] = useState<PalavraInput | null>(null);
  const nova = (): PalavraInput => ({
    palavra: "",
    ativo: true,
    mensagem_abertura: dados.padroes.abertura,
    resposta_publica: dados.padroes.respostaPublica,
    post_id: "",
    roleta_id: null,
    assunto: "",
  });
  const editar = (p: PalavraPainel): PalavraInput => ({ ...p });

  return (
    <div className="space-y-3">
      {dados.podeEditar && <Button onClick={() => setEditando(nova())}>Nova palavra-chave</Button>}
      <div className="grid gap-3 md:grid-cols-2">
        {dados.palavras.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-bold">{p.palavra}</span>
                <Badge variant={p.ativo ? "secondary" : "outline"}>
                  {p.ativo ? "Ativa" : "Pausada"}
                </Badge>
                {p.roleta_nome ? (
                  <Badge variant="outline">Roleta: {p.roleta_nome}</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-warning/12 text-warning">
                    Escolha a roleta
                  </Badge>
                )}
              </div>
              {p.assunto && <p className="text-muted-foreground">{p.assunto}</p>}
              <p className="whitespace-pre-line rounded-md bg-muted p-2 text-xs">
                {p.mensagem_abertura}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.post_id ? `Só no post ${p.post_id}` : "Vale em qualquer post e na DM"}
              </p>
              {dados.podeEditar && (
                <Button size="sm" variant="outline" onClick={() => setEditando(editar(p))}>
                  Editar
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {editando && (
        <EditorPalavra
          inicial={editando}
          roletas={dados.roletas}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
