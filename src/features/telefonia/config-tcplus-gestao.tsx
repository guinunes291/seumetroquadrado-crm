// "Integração 3C Plus" (gestão): o checklist de ativação do discador virou
// semáforo. Cada linha diz se a etapa está OK e o que fazer quando não está —
// token do gestor (e em que host/modo o 3C Plus aceitou), a campanha ÚNICA
// do time (escolhida da lista de campanhas da conta), o vínculo dos agentes
// por e-mail, os tokens dos corretores e o webhook (autoteste + último
// evento recebido). Dados: edge function tcplus-config (acao diagnostico);
// só o admin altera a configuração.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  CheckCircle,
  Copy,
  PlugsConnected,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRoles } from "@/hooks/use-auth";
import { formatRelativeTime } from "@/lib/interacoes";
import {
  diagnosticarTcplus,
  salvarCampanhaTcplus,
  vincularAgentesTcplus,
  type Diagnostico,
} from "./tcplus-config-client";

const QUERY_DIAGNOSTICO = "tcplus-diagnostico";

type Estado = "ok" | "atencao" | "erro";

function Icone({ estado }: { estado: Estado }) {
  if (estado === "ok")
    return <CheckCircle weight="fill" className="h-4 w-4 shrink-0 text-success" />;
  if (estado === "atencao")
    return <WarningCircle weight="fill" className="h-4 w-4 shrink-0 text-warning" />;
  return <XCircle weight="fill" className="h-4 w-4 shrink-0 text-destructive" />;
}

function Etapa({
  estado,
  titulo,
  children,
}: {
  estado: Estado;
  titulo: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5 border-t py-3 first:border-t-0 first:pt-0">
      <Icone estado={estado} />
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        <p className="font-medium leading-4">{titulo}</p>
        {children && <div className="space-y-2 text-xs text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

export function ConfigTcplusGestao() {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;
  if (!gestao) return null;
  return <PainelConfig admin={isAdmin} />;
}

function PainelConfig({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const diagQ = useQuery({
    queryKey: [QUERY_DIAGNOSTICO],
    queryFn: diagnosticarTcplus,
    staleTime: 60_000,
    retry: false,
  });
  const d = diagQ.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <PlugsConnected className="h-4 w-4 text-primary" /> Integração 3C Plus
          {d && <ResumoBadge d={d} />}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7"
            disabled={diagQ.isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: [QUERY_DIAGNOSTICO] })}
          >
            <ArrowsClockwise
              className={`mr-1.5 h-3.5 w-3.5 ${diagQ.isFetching ? "animate-spin" : ""}`}
            />
            {diagQ.isFetching ? "Testando…" : "Testar de novo"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {diagQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : diagQ.error ? (
          <p className="text-sm text-destructive">{(diagQ.error as Error).message}</p>
        ) : d ? (
          <Etapas d={d} admin={admin} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function pronto(d: Diagnostico): boolean {
  return (
    d.gestor.ok &&
    !!d.campanha_unica &&
    d.campanha_unica.existe !== false &&
    !!d.webhook.autoteste?.ok &&
    d.corretores.some((c) => c.token_conectado)
  );
}

function ResumoBadge({ d }: { d: Diagnostico }) {
  return pronto(d) ? (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle className="h-3 w-3" /> pronto para discar
    </Badge>
  ) : (
    <Badge variant="destructive">configuração pendente</Badge>
  );
}

function Etapas({ d, admin }: { d: Diagnostico; admin: boolean }) {
  const qc = useQueryClient();
  const recarregar = () => qc.invalidateQueries({ queryKey: [QUERY_DIAGNOSTICO] });
  const [campanha, setCampanha] = useState<string>(d.campanha_unica?.id ?? "");

  const salvarCampanha = useMutation({
    mutationFn: () => salvarCampanhaTcplus(campanha),
    onSuccess: (r) => {
      toast.success(`Campanha do discador: ${r.nome ?? `#${r.campaign_id}`}.`);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const vincular = useMutation({
    mutationFn: vincularAgentesTcplus,
    onSuccess: (r) => {
      toast.success(
        r.vinculados > 0
          ? `${r.vinculados} corretor(es) vinculado(s) ao agente do 3C Plus.`
          : "Nenhum vínculo novo — os agentes já estavam vinculados.",
      );
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar — selecione e copie à mão.");
    }
  };

  // 1. Token do gestor -------------------------------------------------------
  const estadoGestor: Estado = d.gestor.ok
    ? d.gestor.sugerir_base_url
      ? "atencao"
      : "ok"
    : "erro";

  // 2. Campanha única --------------------------------------------------------
  const estadoCampanha: Estado = !d.campanha_unica
    ? "erro"
    : d.campanha_unica.existe === false
      ? "erro"
      : "ok";

  // 3. Corretores ------------------------------------------------------------
  const conectados = d.corretores.filter((c) => c.token_conectado);
  const semAgente = d.corretores.filter((c) => !c.agent_id && c.agente_3c);
  const estadoCorretores: Estado =
    conectados.length === 0 ? "erro" : semAgente.length > 0 ? "atencao" : "ok";

  // 4. Webhook ---------------------------------------------------------------
  const estadoWebhook: Estado = !d.ambiente.webhook_secret_configurado
    ? "erro"
    : !d.webhook.autoteste?.ok
      ? "erro"
      : d.webhook.ultimo_evento_em
        ? "ok"
        : "atencao";

  return (
    <div>
      <Etapa estado={estadoGestor} titulo="1. Token do gestor (TCPLUS_API_TOKEN)">
        {!d.ambiente.token_gestor_configurado ? (
          <p>
            Falta o secret <code>TCPLUS_API_TOKEN</code> nas variáveis do backend (Cloud → Secrets).
            Ele é o token de API do usuário <strong>gestor</strong> no 3C Plus.
          </p>
        ) : d.gestor.ok ? (
          <>
            <p>
              Aceito pelo 3C Plus
              {d.gestor.usuario?.nome ? ` (usuário ${d.gestor.usuario.nome})` : ""} em{" "}
              <code>{d.gestor.base_url_funcional}</code>.
            </p>
            {d.gestor.sugerir_base_url && (
              <p className="text-warning">
                O endereço configurado ({d.ambiente.base_url}) não respondeu; o padrão sim. Ajuste o
                secret <code>TCPLUS_BASE_URL</code> para <code>{d.gestor.sugerir_base_url}</code> ou
                apague-o.
              </p>
            )}
          </>
        ) : (
          <>
            <p>O 3C Plus recusou o token do gestor em todos os endereços testados:</p>
            <ul className="list-disc pl-4">
              {d.gestor.tentativas.map((t) => (
                <li key={t.base_url}>
                  <code>{t.base_url}</code> — {t.status === 0 ? "sem resposta" : `HTTP ${t.status}`}
                  {t.detalhe ? ` (${t.detalhe})` : ""}
                </li>
              ))}
            </ul>
            <p>
              HTTP 401: token errado/expirado — copie de novo no 3C Plus (usuário gestor → token de
              API). Sem resposta: defina <code>TCPLUS_BASE_URL</code> com o domínio da empresa (ex.:{" "}
              <code>seumetroquadrado.3c.plus</code>).
            </p>
          </>
        )}
      </Etapa>

      <Etapa estado={estadoCampanha} titulo="2. Campanha do discador (uma para o time todo)">
        {d.campanha_unica ? (
          <p>
            Usando <strong>{d.campanha_unica.nome ?? `#${d.campanha_unica.id}`}</strong>
            {d.campanha_unica.existe === false && (
              <span className="text-destructive"> — essa campanha não existe mais no 3C Plus</span>
            )}
            . Todo corretor discando o Bolsão entra nela; quem atende fica com o Atendido.
          </p>
        ) : (
          <p>
            Crie no 3C Plus uma campanha de discador (ex.: “CRM – Bolsão”), com as qualificações do
            time, e escolha-a aqui.
          </p>
        )}
        {admin && d.campanhas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={campanha} onValueChange={setCampanha}>
              <SelectTrigger className="h-8 w-[260px]">
                <SelectValue placeholder="Escolha a campanha" />
              </SelectTrigger>
              <SelectContent>
                {d.campanhas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} (#{c.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!campanha || campanha === d.campanha_unica?.id || salvarCampanha.isPending}
              onClick={() => salvarCampanha.mutate()}
            >
              {salvarCampanha.isPending ? "Salvando…" : "Usar esta campanha"}
            </Button>
          </div>
        )}
        {d.gestor.ok && d.campanhas.length === 0 && (
          <p>Nenhuma campanha encontrada na conta do 3C Plus.</p>
        )}
      </Etapa>

      <Etapa
        estado={estadoCorretores}
        titulo={`3. Corretores conectados (${conectados.length} de ${d.corretores.length})`}
      >
        <p>
          Cada corretor cola o <strong>próprio</strong> token de agente no card “Meu 3C Plus” desta
          aba (o CRM confere na hora). O vínculo agente ↔ corretor é pelo e-mail.
        </p>
        {d.corretores.length > 0 && (
          <ul className="space-y-1">
            {d.corretores.map((c) => (
              <li key={c.user_id} className="flex flex-wrap items-center gap-x-2">
                <Icone estado={c.token_conectado ? (c.agent_id ? "ok" : "atencao") : "erro"} />
                <span className="text-foreground">{c.nome}</span>
                <span>
                  {c.agent_id
                    ? `agente #${c.agent_id}`
                    : c.agente_3c
                      ? "agente encontrado, falta vincular"
                      : "sem agente no 3C Plus com este e-mail"}
                  {" · "}
                  {c.token_conectado
                    ? `token ${c.token_atualizado_em ? formatRelativeTime(c.token_atualizado_em) : "ok"}`
                    : "token pendente"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {d.agentes_sem_corretor.length > 0 && (
          <p>
            Agentes do 3C Plus sem corretor com o mesmo e-mail no CRM:{" "}
            {d.agentes_sem_corretor.join(", ")}.
          </p>
        )}
        {admin && d.gestor.ok && (
          <Button
            size="sm"
            variant="outline"
            disabled={vincular.isPending}
            onClick={() => vincular.mutate()}
          >
            {vincular.isPending ? "Vinculando…" : "Vincular agentes por e-mail"}
          </Button>
        )}
      </Etapa>

      <Etapa estado={estadoWebhook} titulo="4. Webhook (o 3C Plus avisa o CRM de cada chamada)">
        {!d.ambiente.webhook_secret_configurado ? (
          <p>
            Falta o secret <code>TCPLUS_WEBHOOK_SECRET</code> (um texto longo e aleatório). Sem ele
            status, gravação e qualificação não voltam para o lead.
          </p>
        ) : !d.webhook.autoteste?.ok ? (
          <p>
            O autoteste falhou (HTTP {d.webhook.autoteste?.status ?? 0}): a function{" "}
            <code>tcplus-webhook</code> não está publicada ou recusou o segredo.
          </p>
        ) : (
          <>
            <p>
              Autoteste OK.{" "}
              {d.webhook.ultimo_evento_em
                ? `Último evento do 3C Plus recebido ${formatRelativeTime(d.webhook.ultimo_evento_em)}.`
                : "Nenhum evento do 3C Plus chegou ainda — registre a URL abaixo no 3C Plus."}
            </p>
            <p>
              No 3C Plus: <strong>Configurações → Integrações → Webhook</strong>, eventos{" "}
              <code>call-was-connected</code> e <code>call-history-was-created</code>, com a URL:
            </p>
            {d.webhook.url_com_segredo ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full break-all rounded bg-muted px-2 py-1 text-[11px] text-foreground">
                  {d.webhook.url}
                </code>
                <Button size="sm" variant="outline" onClick={() => copiar(d.webhook.url)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
            ) : (
              <p>
                <code>{d.webhook.url}?secret=…</code> (a URL completa, com o segredo, aparece para o
                admin).
              </p>
            )}
          </>
        )}
      </Etapa>
    </div>
  );
}
