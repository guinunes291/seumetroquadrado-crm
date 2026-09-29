// Ficha do corretor na Academia (/academia/gestao/corretor/:id): a trilha
// dele vista pela gestão e as ações que a gestão pode tomar. Toda ação passa
// pela RPC, que confere equipe e "nunca eu mesmo".

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Certificate,
  ChatsCircle,
  Crown,
  SealCheck,
  Target,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { dataBr, diasAte } from "../formato";
import { estadoDoModulo, hojeBrasilia, ROTULO_ESTADO } from "../estado-modulo";
import { EsqueletoAcademia } from "../guard";
import { ROTULO_NIVEL } from "../niveis";
import { CorrecaoPratica } from "./correcao-pratica";
import { origemDoSelo } from "./derivacao";
import { SeloOrigem } from "./aba-time";
import {
  useAtribuirModulo,
  useDefinirHabilitado,
  useEquipeAcademia,
  useFichaCorretor,
  useModulosAcademia,
  usePromoverMestre,
} from "./gestao-client";
import { mensagemDaGestao } from "./mensagens";
import { somarDias } from "./aba-recomendacoes";

type Acao = "atribuir" | "habilitado" | "mestre" | "roleplay" | null;

export function FichaCorretorPage({ corretorId }: { corretorId: string }) {
  const ficha = useFichaCorretor(corretorId);
  const equipe = useEquipeAcademia();
  const modulos = useModulosAcademia();
  const atribuir = useAtribuirModulo();
  const habilitado = useDefinirHabilitado();
  const mestre = usePromoverMestre();
  const hoje = hojeBrasilia();
  const [acao, setAcao] = useState<Acao>(null);
  const [moduloId, setModuloId] = useState("");
  const [prazo, setPrazo] = useState(somarDias(hoje, 7));
  const [motivo, setMotivo] = useState("");
  const [escolha, setEscolha] = useState<"sim" | "nao" | "regra">("sim");

  if (ficha.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar a ficha."
          error={ficha.error}
          onRetry={() => void ficha.refetch()}
        />
      </div>
    );
  }
  if (ficha.isPending) return <EsqueletoAcademia />;

  const { resumo, modulos: status, atribuicoes, praticas, historico, certificados } = ficha.data;
  if (!resumo) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={Target}
          title="Esta pessoa não está na Academia, ou não é da sua equipe."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/academia/gestao" search={{ tab: "time" }}>
                Voltar ao time
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const abertas = atribuicoes.filter((a) => !a.concluida_em && !a.cancelada_em);
  const titulos = new Map((modulos.data ?? []).map((m) => [m.id, `${m.codigo} · ${m.titulo}`]));
  const publicados = (modulos.data ?? []).filter((m) => m.status === "publicado");

  function abrir(a: Exclude<Acao, null>) {
    setAcao(a);
    setMotivo("");
    setModuloId("");
    setPrazo(somarDias(hoje, 7));
    setEscolha("sim");
  }

  async function executar() {
    try {
      if (acao === "atribuir") {
        await atribuir.mutateAsync({ corretorId, moduloId, prazo, motivo: motivo.trim() });
        toast.success("Módulo atribuído.");
      } else if (acao === "habilitado") {
        await habilitado.mutateAsync({
          corretorId,
          habilitado: escolha === "regra" ? null : escolha === "sim",
          motivo: motivo.trim(),
        });
        toast.success("Selo atualizado.");
      } else if (acao === "mestre") {
        await mestre.mutateAsync({ corretorId, motivo: motivo.trim() });
        toast.success("Promovido a Mestre.");
      }
      setAcao(null);
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  const salvando = atribuir.isPending || habilitado.isPending || mestre.isPending;
  const precisaMotivo = acao === "mestre" || (acao === "habilitado" && escolha !== "regra");
  const podeConfirmar =
    !salvando &&
    (!precisaMotivo || motivo.trim() !== "") &&
    (acao !== "atribuir" || (moduloId !== "" && prazo !== ""));

  return (
    <div className="p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/academia/gestao" search={{ tab: "time" }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Time
        </Link>
      </Button>
      <PageHeader
        title={resumo.corretor_nome}
        titleAddon={<SeloOrigem origem={origemDoSelo(resumo)} />}
        description={`${ROTULO_NIVEL[resumo.nivel]} · ${resumo.modulos_concluidos} de ${resumo.modulos_obrigatorios} obrigatórios · na trilha desde ${dataBr(resumo.inicio_trilha)}`}
        actions={
          <>
            <Button size="sm" onClick={() => abrir("atribuir")} disabled={publicados.length === 0}>
              <Target className="mr-1.5 h-4 w-4" /> Atribuir módulo
            </Button>
            <Button size="sm" variant="outline" onClick={() => abrir("roleplay")}>
              <ChatsCircle className="mr-1.5 h-4 w-4" /> Roleplay presencial
            </Button>
            <Button size="sm" variant="outline" onClick={() => abrir("habilitado")}>
              <SealCheck className="mr-1.5 h-4 w-4" /> Habilitado manual
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => abrir("mestre")}
              disabled={resumo.nivel !== "especialista"}
              title={
                resumo.nivel !== "especialista" ? "Mestre só a partir de Especialista." : undefined
              }
            >
              <Crown className="mr-1.5 h-4 w-4" /> Promover a Mestre
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Atribuições abertas ({abertas.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {abertas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma.</p>
            ) : (
              abertas.map((a) => {
                const vencida = a.prazo !== null && diasAte(a.prazo, hoje) < 0;
                return (
                  <div key={a.id} className="text-sm">
                    <p className="font-medium">{titulos.get(a.modulo_id) ?? "Módulo"}</p>
                    <p
                      className={`text-xs ${vencida ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {a.motivo ? `${a.motivo} · ` : ""}
                      {a.prazo
                        ? vencida
                          ? `venceu em ${dataBr(a.prazo)}`
                          : `prazo ${dataBr(a.prazo)}`
                        : "sem prazo"}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Práticas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {praticas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma enviada.</p>
            ) : (
              praticas.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-start gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{titulos.get(p.modulo_id) ?? "Módulo"}</p>
                    {p.feedback && <p className="text-xs text-muted-foreground">{p.feedback}</p>}
                  </div>
                  <StatusBadge
                    intent={
                      p.status === "aprovada"
                        ? "success"
                        : p.status === "refazer"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {p.status === "aprovada"
                      ? "Aprovada"
                      : p.status === "refazer"
                        ? "Refazer"
                        : "Pendente"}
                  </StatusBadge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Módulos publicados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {status.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum módulo publicado ainda.</p>
            ) : (
              status.map((m) => {
                const estado = estadoDoModulo(m, hoje);
                return (
                  <div key={m.modulo_id} className="flex items-center gap-2 text-sm">
                    <span className="w-10 shrink-0 text-xs text-muted-foreground">{m.codigo}</span>
                    <span className="min-w-0 flex-1 truncate">{m.titulo}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.aulas_feitas}/{m.aulas_total}
                    </span>
                    <StatusBadge
                      intent={
                        estado === "concluido"
                          ? "success"
                          : estado === "atrasado"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {ROTULO_ESTADO[estado]}
                    </StatusBadge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Histórico de nível</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {historico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem mudanças ainda.</p>
            ) : (
              historico.slice(0, 10).map((h) => (
                <p key={h.id} className="text-sm">
                  <span className="text-xs text-muted-foreground">{dataBr(h.em)} · </span>
                  {h.de ? `${ROTULO_NIVEL[h.de]} para ` : ""}
                  {ROTULO_NIVEL[h.para]}
                  <span className="text-xs text-muted-foreground"> · {h.motivo}</span>
                </p>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Certificados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {certificados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum ainda.</p>
            ) : (
              certificados.map((c) => (
                <Link
                  key={c.id}
                  to="/academia/certificado/$codigo"
                  params={{ codigo: c.codigo }}
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Certificate className="h-4 w-4" /> {ROTULO_NIVEL[c.nivel]} · {c.codigo}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {acao === "roleplay" && (
        <CorrecaoPratica
          modo="roleplay"
          corretores={(equipe.data?.corretores ?? []).filter((c) => c.corretor_id === corretorId)}
          modulos={modulos.data ?? []}
          corretorInicial={corretorId}
          aberto
          onFechar={() => setAcao(null)}
        />
      )}

      <Dialog
        open={acao === "atribuir" || acao === "habilitado" || acao === "mestre"}
        onOpenChange={(v) => !v && setAcao(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acao === "atribuir"
                ? "Atribuir módulo"
                : acao === "habilitado"
                  ? "Habilitado manual"
                  : "Promover a Mestre"}
            </DialogTitle>
            <DialogDescription>
              {acao === "atribuir"
                ? "O módulo entra no topo da trilha com o prazo que você der."
                : acao === "habilitado"
                  ? "Decisão da gestão sobre o selo. Não é o Apto da roleta e não bloqueia nada."
                  : "Mestre exige Especialista e as fases 4 e 5 concluídas."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {acao === "atribuir" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ficha-modulo">Módulo</Label>
                  <Select value={moduloId} onValueChange={setModuloId}>
                    <SelectTrigger id="ficha-modulo">
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {publicados.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.codigo} · {m.titulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ficha-prazo">Prazo</Label>
                  <Input
                    id="ficha-prazo"
                    type="date"
                    value={prazo}
                    onChange={(e) => setPrazo(e.target.value)}
                  />
                </div>
              </>
            )}
            {acao === "habilitado" && (
              <RadioGroup
                value={escolha}
                onValueChange={(v) => setEscolha(v as "sim" | "nao" | "regra")}
                className="space-y-1"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="sim" /> Habilitar por decisão
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="nao" /> Tirar o selo por decisão
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="regra" /> Voltar à regra da trilha
                </label>
              </RadioGroup>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ficha-motivo">
                {precisaMotivo ? "Motivo (obrigatório)" : "Motivo (opcional)"}
              </Label>
              <Textarea
                id="ficha-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void executar()} disabled={!podeConfirmar}>
              {salvando ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
