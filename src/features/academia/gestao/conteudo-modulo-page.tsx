// Editor de um módulo (/academia/conteudo/:codigo, só admin): aulas em
// markdown com prévia, questões com alternativas, correta e explicação, e os
// dois botões que liberam o módulo: "Marcar como revisado" (limpa a nota de
// revisão) e "Publicar" (chama a RPC e mostra o motivo quando ela recusa).

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  PencilSimple,
  Plus,
  Rocket,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  AcademiaAulaRow,
  AcademiaQuestaoRow,
  AcademiaStatusConteudo,
  AcademiaTipoAula,
} from "@/features/academia/tipos";
import { listaDeTextos } from "../formato";
import { EsqueletoAcademia } from "../guard";
import { Markdown } from "../markdown";
import { ROTULO_STATUS_CONTEUDO } from "./conteudo-page";
import {
  useConteudoModulo,
  useMarcarRevisado,
  usePublicarModulo,
  useSalvarAula,
  useSalvarQuestao,
  type AulaForm,
  type QuestaoForm,
} from "./gestao-client";
import { mensagemDaGestao } from "./mensagens";

const ROTULO_TIPO_AULA: Record<AcademiaTipoAula, string> = {
  texto: "Texto",
  slides: "Slides",
  video: "Vídeo",
  pratica: "Prática",
  material: "Material",
};

function aulaParaForm(a: AcademiaAulaRow): AulaForm {
  return {
    id: a.id,
    moduloId: a.modulo_id,
    ordem: a.ordem,
    titulo: a.titulo,
    tipo: a.tipo,
    conteudo_md: a.conteudo_md,
    url_material: a.url_material,
    url_video: a.url_video,
    duracao_min: a.duracao_min,
    status: a.status,
  };
}

function questaoParaForm(q: AcademiaQuestaoRow): QuestaoForm {
  return {
    id: q.id,
    moduloId: q.modulo_id,
    ordem: q.ordem,
    enunciado: q.enunciado,
    alternativas: listaDeTextos(q.alternativas),
    correta: q.correta,
    explicacao: q.explicacao,
    ativa: q.ativa,
  };
}

/** Questão válida: enunciado, 2 a 6 alternativas preenchidas e correta entre elas. */
export function questaoValida(f: QuestaoForm): boolean {
  const alts = f.alternativas.map((a) => a.trim());
  return (
    f.enunciado.trim() !== "" &&
    alts.length >= 2 &&
    alts.length <= 6 &&
    alts.every((a) => a !== "") &&
    f.correta >= 0 &&
    f.correta < alts.length
  );
}

export function ConteudoModuloPage({ codigo }: { codigo: string }) {
  const dados = useConteudoModulo(codigo, true);
  const salvarAula = useSalvarAula();
  const salvarQuestao = useSalvarQuestao();
  const revisado = useMarcarRevisado();
  const publicar = usePublicarModulo();
  const [aba, setAba] = useState("aulas");
  const [aula, setAula] = useState<AulaForm | null>(null);
  const [previa, setPrevia] = useState(false);
  const [questao, setQuestao] = useState<QuestaoForm | null>(null);
  const [erroPublicar, setErroPublicar] = useState<string | null>(null);

  if (dados.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar o módulo."
          error={dados.error}
          onRetry={() => void dados.refetch()}
        />
      </div>
    );
  }
  if (dados.isPending) return <EsqueletoAcademia />;

  const { modulo, aulas, questoes } = dados.data;
  if (!modulo) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState icon={Warning} title={`O módulo ${codigo} não existe.`} />
      </div>
    );
  }
  const status = ROTULO_STATUS_CONTEUDO[modulo.status];
  const ativas = questoes.filter((q) => q.ativa).length;

  async function onSalvarAula() {
    if (!aula) return;
    try {
      await salvarAula.mutateAsync(aula);
      toast.success(aula.id ? "Aula salva." : "Aula criada.");
      setAula(null);
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  async function onSalvarQuestao() {
    if (!questao) return;
    try {
      await salvarQuestao.mutateAsync({
        ...questao,
        alternativas: questao.alternativas.map((a) => a.trim()),
      });
      toast.success(questao.id ? "Questão salva." : "Questão criada.");
      setQuestao(null);
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  async function onRevisado() {
    if (!modulo) return;
    try {
      await revisado.mutateAsync(modulo.id);
      toast.success("Revisão marcada como resolvida.");
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  async function onPublicar() {
    if (!modulo) return;
    setErroPublicar(null);
    try {
      await publicar.mutateAsync(modulo.id);
      toast.success(modulo.publicado_em ? "Nova versão publicada." : "Módulo publicado.");
    } catch (e) {
      setErroPublicar(mensagemDaGestao(e));
    }
  }

  return (
    <div className="p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/academia/conteudo">
          <ArrowLeft className="mr-1 h-4 w-4" /> Conteúdo
        </Link>
      </Button>
      <PageHeader
        title={`${modulo.codigo} · ${modulo.titulo}`}
        titleAddon={<StatusBadge intent={status.intent}>{status.texto}</StatusBadge>}
        description={`Versão ${modulo.versao} · ${aulas.length} aulas · ${ativas} questões ativas${modulo.exige_pratica ? " · exige prática" : ""}`}
        actions={
          <Button onClick={() => void onPublicar()} disabled={publicar.isPending} size="sm">
            <Rocket className="mr-1.5 h-4 w-4" />
            {publicar.isPending
              ? "Publicando..."
              : modulo.status === "publicado"
                ? "Publicar nova versão"
                : "Publicar"}
          </Button>
        }
      />

      {modulo.revisao_pendente && (
        <Alert className="mb-4">
          <Warning className="h-4 w-4" />
          <AlertTitle>Revisão pendente</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{modulo.revisao_pendente}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onRevisado()}
              disabled={revisado.isPending}
            >
              <CheckCircle className="mr-1.5 h-4 w-4" /> Marcar como revisado
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {erroPublicar && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Não publicou</AlertTitle>
          <AlertDescription>{erroPublicar}</AlertDescription>
        </Alert>
      )}

      <ResponsiveTabs
        value={aba}
        onValueChange={setAba}
        items={[
          { value: "aulas", label: `Aulas (${aulas.length})` },
          { value: "questoes", label: `Questões (${questoes.length})` },
        ]}
        ariaLabel="Partes do módulo"
        className="space-y-4"
      >
        <ResponsiveTabsContent value="aulas">
          <div className="mb-3 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPrevia(false);
                setAula({
                  id: null,
                  moduloId: modulo.id,
                  ordem: Math.max(0, ...aulas.map((a) => a.ordem)) + 1,
                  titulo: "",
                  tipo: "texto",
                  conteudo_md: "",
                  url_material: null,
                  url_video: null,
                  duracao_min: 10,
                  status: "publicado",
                });
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Nova aula
            </Button>
          </div>
          <div className="space-y-2">
            {aulas.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <span className="w-6 shrink-0 text-xs text-muted-foreground">{a.ordem}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROTULO_TIPO_AULA[a.tipo]}
                      {a.duracao_min ? ` · ${a.duracao_min} min` : ""}
                      {a.status !== "publicado"
                        ? ` · ${ROTULO_STATUS_CONTEUDO[a.status].texto}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Editar ${a.titulo}`}
                    onClick={() => {
                      setPrevia(false);
                      setAula(aulaParaForm(a));
                    }}
                  >
                    <PencilSimple className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="questoes">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              O quiz sorteia até 10 das questões ativas. Para publicar, são pelo menos 5.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setQuestao({
                  id: null,
                  moduloId: modulo.id,
                  ordem: Math.max(0, ...questoes.map((q) => q.ordem)) + 1,
                  enunciado: "",
                  alternativas: ["", "", "", ""],
                  correta: 0,
                  explicacao: "",
                  ativa: true,
                })
              }
            >
              <Plus className="mr-1.5 h-4 w-4" /> Nova questão
            </Button>
          </div>
          <div className="space-y-2">
            {questoes.map((q) => {
              const alts = listaDeTextos(q.alternativas);
              return (
                <Card key={q.id} className={q.ativa ? undefined : "opacity-60"}>
                  <CardContent className="space-y-1 py-3">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-sm font-medium">
                        {q.ordem}. {q.enunciado}
                      </p>
                      {!q.ativa && <StatusBadge intent="neutral">Inativa</StatusBadge>}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Editar questão ${q.ordem}`}
                        onClick={() => setQuestao(questaoParaForm(q))}
                      >
                        <PencilSimple className="h-4 w-4" />
                      </Button>
                    </div>
                    <ul className="space-y-0.5 text-xs">
                      {alts.map((alt, i) => (
                        <li
                          key={i}
                          className={
                            i === q.correta
                              ? "font-medium text-emerald-700 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }
                        >
                          {i === q.correta ? "Correta: " : ""}
                          {alt}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ResponsiveTabsContent>
      </ResponsiveTabs>

      <Dialog open={aula !== null} onOpenChange={(v) => !v && setAula(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{aula?.id ? "Editar aula" : "Nova aula"}</DialogTitle>
          </DialogHeader>
          {aula && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="aula-titulo">Título</Label>
                <Input
                  id="aula-titulo"
                  value={aula.titulo}
                  onChange={(e) => setAula({ ...aula, titulo: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="aula-tipo">Tipo</Label>
                  <Select
                    value={aula.tipo}
                    onValueChange={(v) => setAula({ ...aula, tipo: v as AcademiaTipoAula })}
                  >
                    <SelectTrigger id="aula-tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROTULO_TIPO_AULA) as AcademiaTipoAula[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {ROTULO_TIPO_AULA[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aula-status">Status</Label>
                  <Select
                    value={aula.status}
                    onValueChange={(v) => setAula({ ...aula, status: v as AcademiaStatusConteudo })}
                  >
                    <SelectTrigger id="aula-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="publicado">Publicada</SelectItem>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="arquivado">Arquivada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aula-duracao">Minutos</Label>
                  <Input
                    id="aula-duracao"
                    type="number"
                    min={1}
                    value={aula.duracao_min ?? ""}
                    onChange={(e) =>
                      setAula({
                        ...aula,
                        duracao_min: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              {(aula.tipo === "slides" || aula.tipo === "material") && (
                <div className="space-y-1.5">
                  <Label htmlFor="aula-material">Link do material ou dos slides</Label>
                  <Input
                    id="aula-material"
                    value={aula.url_material ?? ""}
                    onChange={(e) =>
                      setAula({ ...aula, url_material: e.target.value.trim() || null })
                    }
                    placeholder="https://gamma.app/..."
                  />
                </div>
              )}
              {aula.tipo === "video" && (
                <div className="space-y-1.5">
                  <Label htmlFor="aula-video">Link do vídeo</Label>
                  <Input
                    id="aula-video"
                    value={aula.url_video ?? ""}
                    onChange={(e) => setAula({ ...aula, url_video: e.target.value.trim() || null })}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="aula-md">Texto da aula (markdown)</Label>
                  <Button size="sm" variant="ghost" onClick={() => setPrevia((p) => !p)}>
                    {previa ? (
                      <PencilSimple className="mr-1 h-4 w-4" />
                    ) : (
                      <Eye className="mr-1 h-4 w-4" />
                    )}
                    {previa ? "Editar" : "Prévia"}
                  </Button>
                </div>
                {previa ? (
                  <div className="min-h-40 rounded-md border p-3">
                    <Markdown>{aula.conteudo_md ?? ""}</Markdown>
                  </div>
                ) : (
                  <Textarea
                    id="aula-md"
                    value={aula.conteudo_md ?? ""}
                    onChange={(e) => setAula({ ...aula, conteudo_md: e.target.value })}
                    rows={14}
                    className="font-mono text-xs"
                  />
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAula(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void onSalvarAula()}
              disabled={salvarAula.isPending || !aula || aula.titulo.trim() === ""}
            >
              {salvarAula.isPending ? "Salvando..." : "Salvar aula"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={questao !== null} onOpenChange={(v) => !v && setQuestao(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{questao?.id ? "Editar questão" : "Nova questão"}</DialogTitle>
          </DialogHeader>
          {questao && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="q-enunciado">Enunciado</Label>
                <Textarea
                  id="q-enunciado"
                  value={questao.enunciado}
                  onChange={(e) => setQuestao({ ...questao, enunciado: e.target.value })}
                  rows={3}
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Alternativas (marque a correta)</legend>
                <RadioGroup
                  value={String(questao.correta)}
                  onValueChange={(v) => setQuestao({ ...questao, correta: Number(v) })}
                  className="space-y-2"
                >
                  {questao.alternativas.map((alt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <RadioGroupItem
                        value={String(i)}
                        aria-label={`Alternativa ${i + 1} é a correta`}
                      />
                      <Input
                        value={alt}
                        onChange={(e) => {
                          const alternativas = [...questao.alternativas];
                          alternativas[i] = e.target.value;
                          setQuestao({ ...questao, alternativas });
                        }}
                        aria-label={`Alternativa ${i + 1}`}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remover alternativa ${i + 1}`}
                        disabled={questao.alternativas.length <= 2}
                        onClick={() => {
                          const alternativas = questao.alternativas.filter((_, j) => j !== i);
                          const correta =
                            questao.correta === i
                              ? 0
                              : questao.correta > i
                                ? questao.correta - 1
                                : questao.correta;
                          setQuestao({ ...questao, alternativas, correta });
                        }}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </RadioGroup>
                {questao.alternativas.length < 6 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setQuestao({ ...questao, alternativas: [...questao.alternativas, ""] })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" /> Alternativa
                  </Button>
                )}
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="q-explicacao">Explicação (aparece na correção)</Label>
                <Textarea
                  id="q-explicacao"
                  value={questao.explicacao ?? ""}
                  onChange={(e) => setQuestao({ ...questao, explicacao: e.target.value })}
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={questao.ativa}
                  onCheckedChange={(v) => setQuestao({ ...questao, ativa: v })}
                />
                Questão ativa no quiz
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestao(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void onSalvarQuestao()}
              disabled={salvarQuestao.isPending || !questao || !questaoValida(questao)}
            >
              {salvarQuestao.isPending ? "Salvando..." : "Salvar questão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
