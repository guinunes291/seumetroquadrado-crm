import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowSquareOut,
  Buildings,
  CircleNotch,
  FileText,
  ListChecks,
  Paperclip,
  Warning,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import { SamiMark } from "@/components/ui/sami-mark";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import {
  listarDocs,
  criarDocs,
  atualizarDoc,
  checklistPorPerfil,
  docLabel,
  docResolvido,
  isLinkExterno,
  nomeArquivo,
  uploadDocArquivo,
  urlAssinadaDoc,
  removerDocArquivo,
  listarProjetosMin,
  derivarEmpreendimentoPatch,
  atualizarEmpreendimentoLead,
  DOC_STATUS,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  PERFIL_RENDA,
  PERFIL_LABEL,
  type DocStatus,
  type Documentacao,
  type PerfilRenda,
} from "@/lib/documentacao";

type Props = {
  leadId: string;
  lead: {
    nome: string;
    telefone: string;
    corretor_id: string | null;
    status: string;
    projeto_id: string | null;
    projeto_nome: string | null;
    construtora: string | null;
  };
};

/** Aba "Documentação" da página do lead: dá UI à tabela `documentacoes` (antes
 *  headless) — checklist por perfil, status, anexos (Storage ou link) e cobrança. */
export function DocumentacaoTab({ leadId, lead }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilRenda>("clt");
  const [casado, setCasado] = useState(false);
  const [usaFgts, setUsaFgts] = useState(false);
  const [declaraIr, setDeclaraIr] = useState(false);

  const {
    data: docs = [],
    isSuccess: docsCarregados,
    isError: docsFalharam,
    error: docsErro,
    refetch: recarregarDocs,
  } = useQuery({
    queryKey: ["documentacoes", leadId],
    queryFn: () => listarDocs(leadId),
  });

  // Mexer em documento pode mover o lead: a regra "3 documentos → análise de
  // crédito" mora no banco (trigger pasta_montada_after_doc). Recarregamos o
  // lead junto para a tela acompanhar a transição em vez de ficar defasada.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["documentacoes", leadId] });
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["leads-kanban"] });
  };

  const gerar = useMutation({
    mutationFn: async () => {
      const itens = checklistPorPerfil(perfil, { casado, usaFgts, declaraIr });
      const existentes = new Set(docs.map((d) => d.tipo));
      const novos = itens.map((i) => i.tipo).filter((t) => !existentes.has(t));
      return criarDocs(leadId, lead.corretor_id ?? user?.id ?? null, novos);
    },
    onSuccess: (qtd) => {
      toast.success(
        qtd > 0 ? `${qtd} documento(s) adicionado(s) ao checklist` : "Checklist já está completo",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DocStatus }) => atualizarDoc(id, { status }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarUrl = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string | null }) => atualizarDoc(id, { url }),
    onSuccess: () => {
      toast.success("Link salvo");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anexar = useMutation({
    mutationFn: async ({ doc, file }: { doc: Documentacao; file: File }) => {
      await uploadDocArquivo(leadId, doc.id, file);
    },
    onSuccess: () => {
      toast.success("Arquivo anexado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const limparArquivo = useMutation({
    mutationFn: async (doc: Documentacao) => {
      if (doc.url && !isLinkExterno(doc.url)) await removerDocArquivo(doc.id);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const { total, resolvidos, pendentes } = useMemo(() => {
    const total = docs.length;
    const resolvidos = docs.filter((d) => docResolvido(d.status)).length;
    const pendentes = docs.filter((d) => !docResolvido(d.status));
    return { total, resolvidos, pendentes };
  }, [docs]);

  // Auto-avanço para Análise de crédito no 3º documento: a regra passou a ser
  // do BANCO (trigger pasta_montada_after_doc, migration 20260731120000), que
  // vale para qualquer caminho — upload pela tela, WhatsApp da Sami, API. Antes
  // havia uma cópia da regra aqui, que só rodava com esta aba aberta; manter as
  // duas significava duas decisões sobre o mesmo fato. Aqui ficou só o aviso:
  // quando o lead muda de etapa sozinho, o corretor é avisado.
  const statusAnterior = useRef<string | null>(null);
  useEffect(() => {
    if (!docsCarregados) return;
    const anterior = statusAnterior.current;
    statusAnterior.current = lead.status;
    if (anterior && anterior !== lead.status && lead.status === "analise_credito") {
      toast.success("Pasta montada — lead movido para Análise de Crédito");
    }
  }, [docsCarregados, lead.status]);

  // Abre o WhatsApp e registra a interação na timeline (antes o envio do
  // checklist/cobrança não deixava rastro no histórico do lead).
  const abrirWa = useWhatsAppLead();
  const abrirWhatsapp = (linhas: Documentacao[], intro: string, vazio: string, titulo: string) => {
    if (linhas.length === 0) {
      toast.info(vazio);
      return;
    }
    const lista = linhas.map((d) => `• ${docLabel(d.tipo)}`).join("\n");
    const msg = `Olá ${lead.nome}! ${intro}\n\n${lista}\n\nPode me enviar por aqui mesmo? 😊`;
    abrirWa({ id: leadId, nome: lead.nome, telefone: lead.telefone }, { mensagem: msg, titulo });
  };

  return (
    <div className="space-y-4">
      <EmpreendimentoCard leadId={leadId} lead={lead} />

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" /> Checklist por perfil
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Perfil de renda</Label>
              <Select value={perfil} onValueChange={(v) => setPerfil(v as PerfilRenda)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFIL_RENDA.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PERFIL_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={casado} onCheckedChange={setCasado} /> Casado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={usaFgts} onCheckedChange={setUsaFgts} /> Usa FGTS
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={declaraIr} onCheckedChange={setDeclaraIr} /> Declara IR
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
              <ListChecks className="h-4 w-4 mr-2" /> Gerar checklist
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() =>
                abrirWhatsapp(
                  docs,
                  "Para seguirmos com a documentação, preciso destes documentos:",
                  "Gere o checklist primeiro.",
                  "Checklist de documentação enviado via WhatsApp",
                )
              }
            >
              <WhatsappLogo className="h-4 w-4 mr-2" /> Enviar checklist
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                abrirWhatsapp(
                  pendentes,
                  "Ainda faltam alguns documentos para darmos andamento:",
                  "Nenhuma pendência. 🎉",
                  "Cobrança de pendência de documentos via WhatsApp",
                )
              }
            >
              <WhatsappLogo className="h-4 w-4 mr-2" /> Cobrar pendência
            </Button>
          </div>
        </CardContent>
      </Card>

      {docsFalharam ? (
        <Card>
          <CardContent role="alert" className="space-y-3 py-8 text-center text-sm">
            <p className="font-medium">Não foi possível carregar a documentação.</p>
            <p className="text-muted-foreground">
              {docsErro instanceof Error ? docsErro.message : "Tente novamente em instantes."}
            </p>
            <Button size="sm" variant="outline" onClick={() => void recarregarDocs()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : total === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Sem documentos ainda. Escolha o perfil acima e gere o checklist.
          </CardContent>
        </Card>
      ) : (
        <>
          <NaoClassificadosBloco
            docs={docs.filter((d) => d.tipo === "nao_classificado" || d.tipo === "outro")}
            onUpdateTipo={(id, tipo) =>
              atualizarDoc(id, { tipo })
                .then(invalidate)
                .catch((e) => toast.error(e.message))
            }
          />

          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {resolvidos} de {total} recebidos
                </span>
                <span className="text-muted-foreground">{pendentes.length} pendente(s)</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  role="progressbar"
                  aria-label="Completude da documentação"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={resolvidos}
                  className={cn(
                    "h-full rounded-full",
                    resolvidos === total ? "bg-green-500" : "bg-primary",
                  )}
                  style={{ width: `${total > 0 ? (resolvidos / total) * 100 : 0}%` }}
                />
              </div>
              <div className="divide-y">
                {docs.map((d) => (
                  <DocRow
                    key={d.id}
                    doc={d}
                    uploading={anexar.isPending}
                    onStatus={(status) => mudarStatus.mutate({ id: d.id, status })}
                    onUrl={(url) => salvarUrl.mutate({ id: d.id, url })}
                    onUpload={(file) => anexar.mutate({ doc: d, file })}
                    onClearArquivo={() => limparArquivo.mutate(d)}
                    onCorrigirTipo={(tipo) =>
                      atualizarDoc(d.id, { tipo })
                        .then(() => {
                          toast.success("Tipo atualizado");
                          invalidate();
                        })
                        .catch((e) => toast.error(e.message))
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** Bloco em destaque no topo listando arquivos recebidos por WhatsApp que não
 *  foram reconhecidos pela IA. O corretor corrige o tipo em um clique. */
function NaoClassificadosBloco({
  docs,
  onUpdateTipo,
}: {
  docs: Documentacao[];
  onUpdateTipo: (id: string, tipo: string) => void;
}) {
  const pendentesRevisao = docs.filter((d) => d.arquivo_path);
  if (pendentesRevisao.length === 0) return null;
  const opcoes: string[] = [
    "documento_identidade",
    "cpf",
    "comprovante_residencia",
    "comprovante_estado_civil",
    "carteira_trabalho",
    "holerites",
    "extrato_bancario_6m",
    "decore",
    "outro",
  ];
  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
          <Warning className="h-4 w-4" />
          {pendentesRevisao.length} documento(s) precisa(m) de revisão
        </div>
        {pendentesRevisao.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center gap-2 rounded-md bg-white/70 p-2 text-sm"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{d.arquivo_nome ?? nomeArquivo(d.url ?? "")}</span>
            <Select onValueChange={(v) => onUpdateTipo(d.id, v)}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Classificar como…" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((o) => (
                  <SelectItem key={o} value={o}>
                    {docLabel(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Card "Empreendimento de destino": registra no lead para qual projeto e
 *  construtora direcionar o cliente. Reusa `leads.projeto_id`/`projeto_nome`
 *  (selecionar OU digitar) + `construtora`. A construtora é sempre editável —
 *  pré-preenchida a partir do projeto escolhido, mas livre para ajuste. */
function EmpreendimentoCard({
  leadId,
  lead,
}: {
  leadId: string;
  lead: { projeto_id: string | null; projeto_nome: string | null; construtora: string | null };
}) {
  const qc = useQueryClient();
  const [manual, setManual] = useState(
    !lead.projeto_id && (!!lead.projeto_nome || !!lead.construtora),
  );
  const [projetoId, setProjetoId] = useState<string>(lead.projeto_id ?? "none");
  const [empreendimentoManual, setEmpreendimentoManual] = useState(lead.projeto_nome ?? "");
  const [construtora, setConstrutora] = useState(lead.construtora ?? "");

  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-min-construtora"],
    queryFn: listarProjetosMin,
  });

  // Ao escolher um projeto, pré-preenche a construtora — mantendo-a editável.
  const escolherProjeto = (id: string) => {
    setProjetoId(id);
    if (id !== "none") setConstrutora(projetos.find((x) => x.id === id)?.construtora ?? "");
  };

  const salvar = useMutation({
    mutationFn: () =>
      atualizarEmpreendimentoLead(
        leadId,
        derivarEmpreendimentoPatch({
          manual,
          projetoId,
          empreendimentoManual,
          construtora,
          projetos,
          leadProjetoNome: lead.projeto_nome,
        }),
      ),
    onSuccess: () => {
      toast.success("Empreendimento de destino salvo");
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Buildings className="h-4 w-4 text-primary" /> Empreendimento de destino
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={manual} onCheckedChange={setManual} /> Inserir manualmente
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Empreendimento</Label>
            {manual ? (
              <Input
                value={empreendimentoManual}
                onChange={(e) => setEmpreendimentoManual(e.target.value)}
                placeholder="Nome do empreendimento"
              />
            ) : (
              <Select value={projetoId} onValueChange={escolherProjeto}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem projeto vinculado —</SelectItem>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                      {p.construtora ? ` · ${p.construtora}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Construtora</Label>
            <Input
              value={construtora}
              onChange={(e) => setConstrutora(e.target.value)}
              placeholder="Nome da construtora"
            />
          </div>
        </div>

        {(lead.projeto_nome || lead.construtora) && (
          <p className="text-xs text-muted-foreground">
            Atual: {lead.projeto_nome ?? "—"}
            {lead.construtora ? ` · ${lead.construtora}` : ""}
          </p>
        )}

        <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? (
            <CircleNotch className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Buildings className="h-4 w-4 mr-2" />
          )}
          Salvar empreendimento
        </Button>
      </CardContent>
    </Card>
  );
}

function DocRow({
  doc,
  uploading,
  onStatus,
  onUrl,
  onUpload,
  onClearArquivo,
  onCorrigirTipo,
}: {
  doc: Documentacao;
  uploading: boolean;
  onStatus: (status: DocStatus) => void;
  onUrl: (url: string | null) => void;
  onUpload: (file: File) => void;
  onClearArquivo: () => void;
  onCorrigirTipo?: (tipo: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(doc.url ?? "");
  const [abrindo, setAbrindo] = useState(false);

  useEffect(() => setUrl(doc.url ?? ""), [doc.url]);

  const temArquivo = !!doc.url && !isLinkExterno(doc.url);

  const abrirArquivo = async () => {
    if (!doc.url) return;
    setAbrindo(true);
    try {
      const signed = await urlAssinadaDoc(doc.id);
      if (signed) window.open(signed, "_blank", "noopener,noreferrer");
      else toast.error("Não foi possível gerar o link do arquivo.");
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao abrir o arquivo.");
    } finally {
      setAbrindo(false);
    }
  };

  return (
    <div className="py-3 space-y-2">
      {/* No celular os dois seletores (corrigir tipo + status) somam ~290px e
          espremiam o nome do documento contra a borda: em telas estreitas eles
          descem para a própria linha. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate">{docLabel(doc.tipo)}</span>
          <Badge variant="outline" className={cn("shrink-0", DOC_STATUS_TONE[doc.status])}>
            {DOC_STATUS_LABEL[doc.status]}
          </Badge>
          {doc.origem === "whatsapp" && (
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-500 text-emerald-700"
              title="Recebido pelo WhatsApp"
            >
              <WhatsappLogo className="h-3 w-3 mr-1" /> WhatsApp
            </Badge>
          )}
          {doc.classificado_por === "ia" && (
            <Badge
              variant="outline"
              className="shrink-0 border-violet-500 text-violet-700"
              title={
                doc.confianca_ia != null
                  ? `Classificado pela IA (${Math.round(doc.confianca_ia * 100)}% de confiança)`
                  : "Classificado pela IA"
              }
            >
              <SamiMark className="h-3 w-3 mr-1" /> IA
            </Badge>
          )}
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
          {onCorrigirTipo && (doc.classificado_por === "ia" || doc.tipo === "nao_classificado") && (
            <Select onValueChange={onCorrigirTipo}>
              <SelectTrigger className="min-h-11 w-[150px]" title="Corrigir tipo">
                <SelectValue placeholder="Corrigir tipo" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "documento_identidade",
                  "cpf",
                  "comprovante_residencia",
                  "comprovante_estado_civil",
                  "carteira_trabalho",
                  "holerites",
                  "extrato_bancario_6m",
                  "decore",
                  "outro",
                ].map((t) => (
                  <SelectItem key={t} value={t}>
                    {docLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={doc.status} onValueChange={(v) => onStatus(v as DocStatus)}>
            <SelectTrigger className="min-h-11 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_STATUS.map((s) => (
                <SelectItem key={s} value={s}>
                  {DOC_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {doc.mime_type?.startsWith("image/") && doc.arquivo_path && <ImagemPreview docId={doc.id} />}

      {temArquivo ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1">{nomeArquivo(doc.url!)}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={abrirArquivo}
            disabled={abrindo}
            aria-label={`Abrir arquivo de ${docLabel(doc.tipo)}`}
            title="Abrir arquivo"
          >
            {abrindo ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowSquareOut className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={onClearArquivo}
            aria-label={`Remover arquivo de ${docLabel(doc.tipo)}`}
            title="Remover arquivo"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              const v = url.trim();
              if (v !== (doc.url ?? "")) onUrl(v || null);
            }}
            placeholder="Link do arquivo (Drive, etc.) — opcional"
            className="min-h-11 text-xs"
          />
          {isLinkExterno(doc.url) && (
            <Button asChild size="icon" variant="ghost" className="h-11 w-11" title="Abrir link">
              <a
                href={doc.url!}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir link de ${docLabel(doc.tipo)}`}
              >
                <ArrowSquareOut className="h-4 w-4" />
              </a>
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            aria-label={`Anexar arquivo para ${docLabel(doc.tipo)}`}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 shrink-0"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
            <span className="ml-1 hidden sm:inline">Anexar</span>
          </Button>
        </div>
      )}
    </div>
  );
}

/** Miniatura para imagens — gera signed URL sob demanda e não bloqueia a lista. */
function ImagemPreview({ docId }: { docId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let ativo = true;
    urlAssinadaDoc(docId)
      .then((u) => ativo && setUrl(u))
      .catch(() => ativo && setErro(true));
    return () => {
      ativo = false;
    };
  }, [docId]);
  if (erro) return null;
  if (!url) return <div className="h-24 w-24 animate-pulse rounded-md bg-muted" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
      <img
        src={url}
        alt="Prévia do documento"
        className="h-24 w-24 rounded-md border object-cover"
        loading="lazy"
      />
    </a>
  );
}
