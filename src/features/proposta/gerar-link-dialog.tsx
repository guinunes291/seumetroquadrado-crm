import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeSlash,
  ImageSquare,
  LinkSimple,
  Plus,
  Trash,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BLOCOS_APRESENTACAO,
  BLOCOS_PROPOSTA,
  MIDIA_PREFIXO,
  PROPOSTA_MAX_FLUXOS,
  ROTULO_BLOCO,
  blocosVisiveis,
  mensagemWhatsappProposta,
  primeiroNome,
  snapshotSchema,
  telefoneWaMe,
  validadeMaxima,
  type PropostaSnapshot,
} from "@/lib/proposta-link";
import { publicarPropostaLink } from "@/lib/proposta-link.functions";
import { PropostaView } from "./proposta-view";

type Modelo = "apresentacao" | "proposta";
type Planta = { titulo: string; imagem_url: string; metragem: number | null };
type Fluxo = {
  titulo: string;
  valor_total: string;
  ato: string;
  mensais_qtd: string;
  mensais_valor: string;
  anuais_qtd: string;
  anuais_valor: string;
  financiamento: string;
  fgts: string;
  subsidio: string;
};
const FLUXO_VAZIO: Fluxo = {
  titulo: "",
  valor_total: "",
  ato: "",
  mensais_qtd: "",
  mensais_valor: "",
  anuais_qtd: "",
  anuais_valor: "",
  financiamento: "",
  fgts: "",
  subsidio: "",
};

type ProjetoRow = {
  id: string;
  nome: string;
  construtora: string | null;
  capa_url: string | null;
  galeria_urls: string[] | null;
  diferenciais: string[] | null;
  endereco: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  mes_entrega: number | null;
  ano_entrega: number | null;
  status_entrega: string | null;
  preco_a_partir: number | null;
  plantas: unknown;
};

const num = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const isoLocal = (d: Date) => {
  const brt = new Date(d.getTime() - 3 * 3_600_000);
  return brt.toISOString().slice(0, 10);
};

function plantasDoProjeto(raw: unknown): Planta[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: Record<string, unknown>) => ({
      titulo: String(p?.titulo ?? p?.nome ?? p?.tipologia ?? "Planta").slice(0, 80),
      imagem_url: String(p?.imagem_url ?? p?.url ?? p?.imagem ?? ""),
      metragem: typeof p?.metragem === "number" ? p.metragem : typeof p?.area === "number" ? (p.area as number) : null,
    }))
    .filter((p) => /^https?:\/\//.test(p.imagem_url))
    .slice(0, 8);
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: { id: string; nome: string; telefone: string | null; projeto_id?: string | null };
};

export function GerarLinkDialog({ open, onOpenChange, lead }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const publicar = useServerFn(publicarPropostaLink);

  const [modelo, setModelo] = useState<Modelo>("apresentacao");
  const [busca, setBusca] = useState("");
  const [projetoId, setProjetoId] = useState<string | null>(lead.projeto_id ?? null);
  const [nome, setNome] = useState("");
  const [construtora, setConstrutora] = useState("");
  const [capa, setCapa] = useState<string | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [diferenciais, setDiferenciais] = useState("");
  const [endereco, setEndereco] = useState("");
  const [entrega, setEntrega] = useState("");
  const [preco, setPreco] = useState<number | null>(null);
  const [plantas, setPlantas] = useState<Planta[]>([]);
  const [unidade, setUnidade] = useState({ identificacao: "", tipologia: "", metragem: "" });
  const [fluxos, setFluxos] = useState<Fluxo[]>([{ ...FLUXO_VAZIO, titulo: "Opção principal" }]);
  const [ordem, setOrdem] = useState<string[]>([...BLOCOS_PROPOSTA, "visita"]);
  const [ocultos, setOcultos] = useState<string[]>([]);
  const maxValidade = useMemo(() => validadeMaxima(modelo), [modelo]);
  const [validade, setValidade] = useState(isoLocal(maxValidade));
  const [assinadas, setAssinadas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [publicado, setPublicado] = useState<{ url: string } | null>(null);

  useEffect(() => setValidade(isoLocal(validadeMaxima(modelo))), [modelo]);

  const projetosQ = useQuery({
    queryKey: ["proposta-projetos", busca],
    enabled: open && busca.trim().length >= 2,
    queryFn: async () => {
      const termo = busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const { data } = await supabase
        .from("projetos")
        .select("id, nome, construtora, bairro")
        .is("deleted_at", null)
        .ilike("nome_busca", `%${termo}%`)
        .order("nome")
        .limit(8);
      return data ?? [];
    },
  });

  const carregarProjeto = async (id: string) => {
    const { data } = await supabase
      .from("projetos")
      .select(
        "id, nome, construtora, capa_url, galeria_urls, diferenciais, endereco, logradouro, numero, bairro, cidade, mes_entrega, ano_entrega, status_entrega, preco_a_partir, plantas",
      )
      .eq("id", id)
      .maybeSingle();
    const p = data as ProjetoRow | null;
    if (!p) return;
    setProjetoId(p.id);
    setNome(p.nome);
    setConstrutora(p.construtora ?? "");
    setCapa(p.capa_url);
    setFotos((p.galeria_urls ?? []).filter(Boolean).slice(0, 12));
    setDiferenciais((p.diferenciais ?? []).join("\n"));
    setEndereco(
      p.endereco || [[p.logradouro, p.numero].filter(Boolean).join(", "), p.bairro, p.cidade].filter(Boolean).join(" · "),
    );
    setEntrega(
      p.mes_entrega && p.ano_entrega
        ? `${String(p.mes_entrega).padStart(2, "0")}/${p.ano_entrega}`
        : p.ano_entrega
          ? String(p.ano_entrega)
          : (p.status_entrega ?? ""),
    );
    setPreco(p.preco_a_partir);
    setPlantas(plantasDoProjeto(p.plantas));
    setBusca("");
  };

  useEffect(() => {
    if (open && lead.projeto_id && !nome) void carregarProjeto(lead.projeto_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.projeto_id]);

  const subir = async (file: File): Promise<string | null> => {
    if (!user) return null;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imagem acima de 10 MB.");
      return null;
    }
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${user.id}/${crypto.randomUUID()}.${ext || "jpg"}`;
    const { error } = await supabase.storage.from("propostas-midia").upload(path, file, { contentType: file.type });
    if (error) {
      toast.error("Não foi possível enviar a imagem.");
      return null;
    }
    const { data } = await supabase.storage.from("propostas-midia").createSignedUrl(path, 60 * 60 * 4);
    const ref = MIDIA_PREFIXO + path;
    if (data?.signedUrl) setAssinadas((m) => ({ ...m, [ref]: data.signedUrl }));
    return ref;
  };

  const blocosDoModelo: readonly string[] = modelo === "proposta" ? BLOCOS_PROPOSTA : BLOCOS_APRESENTACAO;
  const blocosOrdenados = ordem.filter((b) => blocosDoModelo.includes(b));

  const conteudo = useMemo(() => {
    const listaDif = diferenciais
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, 30);
    return {
      projeto: {
        id: projetoId,
        nome: nome.trim() || "Empreendimento",
        construtora: construtora.trim() || null,
        capa_url: capa,
        fotos,
        diferenciais: listaDif,
        entrega: entrega.trim() || null,
        endereco: endereco.trim() || null,
        preco_a_partir: modelo === "proposta" ? preco : null,
      },
      plantas,
      unidade:
        modelo === "proposta" && unidade.identificacao.trim()
          ? {
              identificacao: unidade.identificacao.trim(),
              tipologia: unidade.tipologia.trim() || null,
              metragem: num(unidade.metragem) || null,
              planta_url: null,
            }
          : null,
      fluxos:
        modelo === "proposta"
          ? fluxos
              .filter((f) => f.titulo.trim() && num(f.valor_total) > 0)
              .map((f) => ({
                titulo: f.titulo.trim(),
                valor_total: num(f.valor_total),
                ato: num(f.ato),
                mensais: num(f.mensais_qtd) ? { quantidade: Math.round(num(f.mensais_qtd)), valor: num(f.mensais_valor) } : null,
                anuais: num(f.anuais_qtd) ? { quantidade: Math.round(num(f.anuais_qtd)), valor: num(f.anuais_valor) } : null,
                financiamento: num(f.financiamento),
                fgts: num(f.fgts) || null,
                subsidio: num(f.subsidio) || null,
              }))
          : [],
      blocos: blocosOrdenados.filter((b) => !ocultos.includes(b)),
    };
  }, [projetoId, nome, construtora, capa, fotos, diferenciais, entrega, endereco, preco, plantas, unidade, fluxos, modelo, blocosOrdenados, ocultos]);

  const previa: PropostaSnapshot | null = useMemo(() => {
    const r = snapshotSchema.safeParse({
      ...conteudo,
      modelo,
      cliente_primeiro_nome: primeiroNome(lead.nome),
      corretor: { nome: user?.user_metadata?.nome ?? "Seu corretor", foto_url: null, whatsapp: null, creci: null },
    });
    if (!r.success) return null;
    const t = (u: string | null) => (u ? (assinadas[u] ?? (u.startsWith(MIDIA_PREFIXO) ? null : u)) : null);
    return {
      ...r.data,
      projeto: { ...r.data.projeto, capa_url: t(r.data.projeto.capa_url), fotos: r.data.projeto.fotos.map((f) => t(f) ?? "").filter(Boolean) },
      plantas: r.data.plantas.map((p) => ({ ...p, imagem_url: t(p.imagem_url) ?? "" })).filter((p) => p.imagem_url),
    };
  }, [conteudo, modelo, lead.nome, user, assinadas]);

  const gerar = async () => {
    if (!nome.trim()) return toast.error("Escolha o empreendimento.");
    if (modelo === "proposta" && conteudo.fluxos.length === 0) return toast.error("Preencha pelo menos um fluxo com valor.");
    const fim = new Date(`${validade}T23:59:00-03:00`);
    const exp = fim > maxValidade ? maxValidade : fim;
    setEnviando(true);
    try {
      const r = await publicar({
        data: { leadId: lead.id, modelo, projetoId, expiraEm: exp.toISOString(), conteudo },
      });
      setPublicado({ url: `${window.location.origin}${r.path}` });
      void qc.invalidateQueries({ queryKey: ["propostas-lead", lead.id] });
      toast.success("Link gerado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o link.");
    } finally {
      setEnviando(false);
    }
  };

  const fechar = (v: boolean) => {
    if (!v) setPublicado(null);
    onOpenChange(v);
  };

  if (publicado) {
    const msg = mensagemWhatsappProposta(modelo, primeiroNome(lead.nome), nome, publicado.url);
    const wa = telefoneWaMe(lead.telefone);
    return (
      <Dialog open={open} onOpenChange={fechar}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link pronto</DialogTitle>
            <DialogDescription>
              Guarde ou envie agora: por segurança o link completo só aparece nesta tela.
            </DialogDescription>
          </DialogHeader>
          <Input readOnly value={publicado.url} onFocus={(e) => e.currentTarget.select()} />
          <Textarea readOnly value={msg} rows={4} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(publicado.url).then(() => toast.success("Link copiado."))}
            >
              <Copy className="mr-2 h-4 w-4" /> Copiar link
            </Button>
            {wa && (
              <Button asChild>
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
                  <WhatsappLogo className="mr-2 h-4 w-4" /> Enviar no WhatsApp
                </a>
              </Button>
            )}
            <Button variant="ghost" asChild>
              <a href={`${publicado.url}?previa=1`} target="_blank" rel="noreferrer">
                <Eye className="mr-2 h-4 w-4" /> Ver como o cliente
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const editor = (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Modelo</Label>
        <ToggleGroup type="single" value={modelo} onValueChange={(v) => v && setModelo(v as Modelo)} className="justify-start">
          <ToggleGroupItem value="apresentacao">Apresentação (sem valores)</ToggleGroupItem>
          <ToggleGroupItem value="proposta">Proposta (com valores)</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-2">
        <Label>Empreendimento</Label>
        <Input placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {projetosQ.data && projetosQ.data.length > 0 && (
          <div className="rounded-md border">
            {projetosQ.data.map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => void carregarProjeto(p.id)}
              >
                {p.nome} <span className="text-muted-foreground">{[p.construtora, p.bairro].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Nome na página" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input placeholder="Construtora" value={construtora} onChange={(e) => setConstrutora(e.target.value)} />
          <Input placeholder="Entrega (ex.: 12/2027)" value={entrega} onChange={(e) => setEntrega(e.target.value)} />
          <Input placeholder="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </div>
        <Textarea
          placeholder="Diferenciais, um por linha"
          rows={4}
          value={diferenciais}
          onChange={(e) => setDiferenciais(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Imagens</Label>
        <div className="flex flex-wrap items-center gap-2">
          <UploadBotao rotulo={capa ? "Trocar capa" : "Subir capa"} onFile={async (f) => setCapa((await subir(f)) ?? capa)} />
          <UploadBotao
            rotulo="Adicionar foto"
            onFile={async (f) => {
              const r = await subir(f);
              if (r) setFotos((x) => [...x, r].slice(0, 12));
            }}
          />
          <UploadBotao
            rotulo="Adicionar planta"
            onFile={async (f) => {
              const r = await subir(f);
              if (r) setPlantas((x) => [...x, { titulo: "Planta", imagem_url: r, metragem: null }].slice(0, 8));
            }}
          />
          <span className="text-xs text-muted-foreground">
            {capa ? "Com capa" : "Sem capa"} · {fotos.length} fotos · {plantas.length} plantas
          </span>
        </div>
        {fotos.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFotos([])}>
            <Trash className="mr-1 h-4 w-4" /> Limpar fotos
          </Button>
        )}
        {plantas.map((p, i) => (
          <div key={p.imagem_url} className="flex gap-2">
            <Input
              value={p.titulo}
              onChange={(e) => setPlantas((x) => x.map((y, j) => (j === i ? { ...y, titulo: e.target.value } : y)))}
            />
            <Input
              className="w-28"
              placeholder="m²"
              value={p.metragem ?? ""}
              onChange={(e) =>
                setPlantas((x) => x.map((y, j) => (j === i ? { ...y, metragem: num(e.target.value) || null } : y)))
              }
            />
            <Button variant="ghost" size="icon" onClick={() => setPlantas((x) => x.filter((_, j) => j !== i))} aria-label="Remover planta">
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {modelo === "proposta" && (
        <>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="Ex.: Torre B, 1204" value={unidade.identificacao} onChange={(e) => setUnidade({ ...unidade, identificacao: e.target.value })} />
              <Input placeholder="Tipologia" value={unidade.tipologia} onChange={(e) => setUnidade({ ...unidade, tipologia: e.target.value })} />
              <Input placeholder="m²" value={unidade.metragem} onChange={(e) => setUnidade({ ...unidade, metragem: e.target.value })} />
            </div>
          </div>
          <div className="space-y-3">
            <Label>Fluxos de pagamento (até {PROPOSTA_MAX_FLUXOS})</Label>
            {fluxos.map((f, i) => {
              const set = (k: keyof Fluxo, v: string) => setFluxos((x) => x.map((y, j) => (j === i ? { ...y, [k]: v } : y)));
              return (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex gap-2">
                    <Input placeholder="Título" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} />
                    {fluxos.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => setFluxos((x) => x.filter((_, j) => j !== i))} aria-label="Remover fluxo">
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input placeholder="Valor total" value={f.valor_total} onChange={(e) => set("valor_total", e.target.value)} />
                    <Input placeholder="Ato" value={f.ato} onChange={(e) => set("ato", e.target.value)} />
                    <Input placeholder="Nº mensais" value={f.mensais_qtd} onChange={(e) => set("mensais_qtd", e.target.value)} />
                    <Input placeholder="Valor mensal" value={f.mensais_valor} onChange={(e) => set("mensais_valor", e.target.value)} />
                    <Input placeholder="Nº anuais" value={f.anuais_qtd} onChange={(e) => set("anuais_qtd", e.target.value)} />
                    <Input placeholder="Valor anual" value={f.anuais_valor} onChange={(e) => set("anuais_valor", e.target.value)} />
                    <Input placeholder="FGTS" value={f.fgts} onChange={(e) => set("fgts", e.target.value)} />
                    <Input placeholder="Subsídio" value={f.subsidio} onChange={(e) => set("subsidio", e.target.value)} />
                    <Input placeholder="Financiamento" value={f.financiamento} onChange={(e) => set("financiamento", e.target.value)} />
                  </div>
                </div>
              );
            })}
            {fluxos.length < PROPOSTA_MAX_FLUXOS && (
              <Button variant="outline" size="sm" onClick={() => setFluxos((x) => [...x, { ...FLUXO_VAZIO, titulo: `Opção ${x.length + 1}` }])}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar fluxo
              </Button>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Blocos da página</Label>
        <div className="divide-y rounded-md border">
          {blocosOrdenados.map((b, i) => (
            <div key={b} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className={ocultos.includes(b) ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{ROTULO_BLOCO[b] ?? b}</span>
              <Button
                variant="ghost"
                size="icon"
                disabled={i === 0}
                aria-label="Subir"
                onClick={() => {
                  const a = [...blocosOrdenados];
                  [a[i - 1], a[i]] = [a[i], a[i - 1]];
                  setOrdem(a.concat(ordem.filter((x) => !a.includes(x))));
                }}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={i === blocosOrdenados.length - 1}
                aria-label="Descer"
                onClick={() => {
                  const a = [...blocosOrdenados];
                  [a[i + 1], a[i]] = [a[i], a[i + 1]];
                  setOrdem(a.concat(ordem.filter((x) => !a.includes(x))));
                }}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={b === "capa"}
                aria-label={ocultos.includes(b) ? "Mostrar" : "Ocultar"}
                onClick={() => setOcultos((o) => (o.includes(b) ? o.filter((x) => x !== b) : [...o, b]))}
              >
                {ocultos.includes(b) ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Blocos sem informação não aparecem para o cliente.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="validade">Validade</Label>
        <Input
          id="validade"
          type="date"
          value={validade}
          min={isoLocal(new Date(Date.now() + 86_400_000))}
          max={isoLocal(maxValidade)}
          onChange={(e) => setValidade(e.target.value > isoLocal(maxValidade) ? isoLocal(maxValidade) : e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Sugerida automaticamente: {maxValidade.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Você só pode encurtar.
        </p>
      </div>

      <Button className="w-full" onClick={gerar} disabled={enviando}>
        <LinkSimple className="mr-2 h-4 w-4" /> {enviando ? "Gerando..." : "Gerar link"}
      </Button>
    </div>
  );

  const quadroPrevia = previa ? (
    <div className="h-full overflow-y-auto rounded-lg border">
      <PropostaView snapshot={previa} blocos={blocosVisiveis(previa)} expiraEm={new Date(`${validade}T23:59:00-03:00`).toISOString()} previa />
    </div>
  ) : (
    <p className="p-6 text-sm text-muted-foreground">Preencha o empreendimento para ver a prévia.</p>
  );

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Gerar link para {primeiroNome(lead.nome)}</DialogTitle>
          <DialogDescription>Monte a página que o cliente vai abrir no celular.</DialogDescription>
        </DialogHeader>
        <div className="hidden h-[76vh] grid-cols-2 gap-6 px-6 pb-6 lg:grid">
          <div className="overflow-y-auto pr-2">{editor}</div>
          {quadroPrevia}
        </div>
        <Tabs defaultValue="editar" className="px-4 pb-4 lg:hidden">
          <TabsList className="w-full">
            <TabsTrigger value="editar" className="flex-1">Editar</TabsTrigger>
            <TabsTrigger value="previa" className="flex-1">Prévia</TabsTrigger>
          </TabsList>
          <TabsContent value="editar" className="max-h-[70vh] overflow-y-auto">{editor}</TabsContent>
          <TabsContent value="previa" className="h-[70vh]">{quadroPrevia}</TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function UploadBotao({ rotulo, onFile }: { rotulo: string; onFile: (f: File) => void | Promise<void> }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <label className="cursor-pointer">
        <ImageSquare className="mr-1 h-4 w-4" /> {rotulo}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
      </label>
    </Button>
  );
}
