// Materiais dos empreendimentos — a tela de preenchimento em massa.
//
// Book e tabela são o que o corretor mais busca na bancada, e sem URL o botão
// lá nasce desabilitado. Preencher isso pela ficha custa abrir 50 projetos,
// achar o campo e salvar um por um — na prática, não é feito. Aqui a lista
// inteira é editável de uma vez: cola, Tab, cola, e um botão salva tudo o que
// mudou num lote só.
//
// A leitura é a mesma da bancada (parceiras primeiro, na ordem da gestão), e o
// filtro que abre a tela é "só sem material" — o trabalho que falta.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Building2,
  ClipboardPaste,
  ExternalLink,
  Save,
  Search,
  Star,
  Table2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { parceiraDoProjeto, type Parceira } from "@/lib/construtoras";
import {
  casarColagem,
  diffMateriais,
  parseColagem,
  urlValida,
  type MateriaisEdicao,
} from "@/lib/materiais";
import { useConstrutorasParceiras } from "./use-construtoras-parceiras";

/** Só o que esta tela lê e escreve — projeção enxuta de propósito. */
type ProjetoMaterial = {
  id: string;
  nome: string;
  construtora: string | null;
  bairro: string | null;
  cidade: string | null;
  book_url: string | null;
  tabela_precos_url: string | null;
};

type Edicao = MateriaisEdicao;

const SEM_CONSTRUTORA = "Sem construtora informada";

export function MateriaisPage() {
  const qc = useQueryClient();
  const parceirasQ = useConstrutorasParceiras();
  const [busca, setBusca] = useState("");
  // Abre no trabalho que falta: quem já tem book e tabela não precisa de você.
  const [soFaltando, setSoFaltando] = useState(true);
  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({});
  const [colarOpen, setColarOpen] = useState(false);

  const projetosQ = useQuery({
    queryKey: ["projetos-materiais"],
    queryFn: async (): Promise<ProjetoMaterial[]> => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, construtora, bairro, cidade, book_url, tabela_precos_url")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ProjetoMaterial[];
    },
  });

  const projetos = useMemo(() => projetosQ.data ?? [], [projetosQ.data]);
  const parceiras = useMemo(
    () => (parceirasQ.data?.parceiras ?? []).filter((p) => p.ativo),
    [parceirasQ.data],
  );

  /** Valor em tela: a edição pendente, ou o que está gravado. */
  const valorAtual = (p: ProjetoMaterial): Edicao =>
    edicoes[p.id] ?? {
      book_url: p.book_url ?? "",
      tabela_precos_url: p.tabela_precos_url ?? "",
    };

  const pendentes = useMemo(
    () =>
      projetos
        .map((p) => ({ projeto: p, mudancas: diffMateriais(p, valorAtual(p)) }))
        .filter((x) => Object.keys(x.mudancas).length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valorAtual deriva de `edicoes`
    [projetos, edicoes],
  );

  const invalidos = useMemo(
    () =>
      Object.values(edicoes).filter(
        (e) => !urlValida(e.book_url) || !urlValida(e.tabela_precos_url),
      ).length,
    [edicoes],
  );

  const comBook = projetos.filter((p) => p.book_url).length;
  const comTabela = projetos.filter((p) => p.tabela_precos_url).length;
  const completos = projetos.filter((p) => p.book_url && p.tabela_precos_url).length;

  const salvar = useMutation({
    mutationFn: async () => {
      if (invalidos > 0) throw new Error("Há links inválidos — corrija antes de salvar.");
      // Um UPDATE por projeto: são poucos e cada um precisa da sua cláusula.
      // Erro em qualquer um aborta e mantém as edições em tela para reenvio.
      for (const { projeto, mudancas } of pendentes) {
        const { error } = await supabase.from("projetos").update(mudancas).eq("id", projeto.id);
        if (error) throw new Error(`${projeto.nome}: ${error.message}`);
      }
      return pendentes.length;
    },
    onSuccess: (total) => {
      toast.success(`${total} ${total === 1 ? "projeto salvo" : "projetos salvos"}`);
      setEdicoes({});
      qc.invalidateQueries({ queryKey: ["projetos-materiais"] });
      // A bancada e o catálogo leem as mesmas colunas.
      qc.invalidateQueries({ queryKey: ["projetos-foco"] });
      qc.invalidateQueries({ queryKey: ["projetos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return projetos.filter((p) => {
      const edicao = valorAtual(p);
      // Linha em edição nunca some do filtro no meio da digitação.
      const emEdicao = edicoes[p.id] != null;
      if (soFaltando && !emEdicao && p.book_url && p.tabela_precos_url) return false;
      if (!termo) return true;
      return [p.nome, p.construtora, p.bairro, p.cidade, edicao.book_url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valorAtual deriva de `edicoes`
  }, [projetos, busca, soFaltando, edicoes]);

  /** Mesma leitura da bancada: parceiras primeiro, na ordem da gestão. */
  const grupos = useMemo(() => {
    const porChave = new Map<
      string,
      { titulo: string; parceira: Parceira | null; itens: ProjetoMaterial[] }
    >();
    for (const p of filtrados) {
      const parceira = parceiraDoProjeto(p.construtora, parceiras);
      const chave = parceira ? `p:${parceira.id}` : `c:${p.construtora?.trim() || SEM_CONSTRUTORA}`;
      if (!porChave.has(chave)) {
        porChave.set(chave, {
          titulo: parceira ? parceira.nome : p.construtora?.trim() || SEM_CONSTRUTORA,
          parceira,
          itens: [],
        });
      }
      porChave.get(chave)!.itens.push(p);
    }
    const indice = new Map(parceiras.map((p, i) => [p.id, i]));
    return Array.from(porChave.values()).sort((a, b) => {
      const ia = a.parceira ? (indice.get(a.parceira.id) ?? 0) : Infinity;
      const ib = b.parceira ? (indice.get(b.parceira.id) ?? 0) : Infinity;
      if (ia !== ib) return ia - ib;
      return b.itens.length - a.itens.length || a.titulo.localeCompare(b.titulo, "pt-BR");
    });
  }, [filtrados, parceiras]);

  const editar = (id: string, campo: keyof Edicao, valor: string, projeto: ProjetoMaterial) => {
    setEdicoes((atual) => {
      const base = atual[id] ?? {
        book_url: projeto.book_url ?? "",
        tabela_precos_url: projeto.tabela_precos_url ?? "",
      };
      const proximo = { ...base, [campo]: valor };
      const mudou = Object.keys(diffMateriais(projeto, proximo)).length > 0;
      const copia = { ...atual };
      // Voltar ao valor original limpa a pendência em vez de fingir edição.
      if (mudou) copia[id] = proximo;
      else delete copia[id];
      return copia;
    });
  };

  /**
   * A colagem NÃO salva: vira edição pendente, igual a digitar. A pessoa revê
   * o que entrou (as linhas ficam destacadas) e confirma no "Salvar".
   */
  const aplicarColagem = (texto: string) => {
    const { aplicados, ignorados } = casarColagem(parseColagem(texto), projetos);
    if (aplicados.length === 0) {
      toast.error("Nenhuma linha casou com um empreendimento do catálogo.");
      return;
    }
    setEdicoes((atual) => {
      const copia = { ...atual };
      for (const { projeto, valores } of aplicados) {
        const base = copia[projeto.id] ?? {
          book_url: projeto.book_url ?? "",
          tabela_precos_url: projeto.tabela_precos_url ?? "",
        };
        const proximo = { ...base, ...valores };
        if (Object.keys(diffMateriais(projeto, proximo)).length > 0) copia[projeto.id] = proximo;
        else delete copia[projeto.id];
      }
      return copia;
    });
    // Sem o filtro, o que acabou de entrar sumiria da tela (já tem material).
    setSoFaltando(false);
    setColarOpen(false);
    toast.success(
      ignorados.length === 0
        ? `${aplicados.length} preenchidos — confira e salve.`
        : `${aplicados.length} preenchidos · ${ignorados.length} sem correspondência: ${ignorados.slice(0, 3).join(", ")}${ignorados.length > 3 ? "…" : ""}`,
    );
  };

  if (projetosQ.isError) {
    return (
      <div className="p-6">
        <PageHeader title="Materiais dos empreendimentos" />
        <QueryErrorState
          title="Não foi possível carregar os projetos."
          error={projetosQ.error}
          onRetry={() => projetosQ.refetch()}
        />
      </div>
    );
  }

  const total = projetos.length;

  return (
    <div className="space-y-6 p-6 pb-24">
      <PageHeader
        title="Materiais dos empreendimentos"
        description="Book e tabela de preços de cada projeto. É daqui que saem os botões da bancada do corretor."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setColarOpen(true)}>
              <ClipboardPaste className="mr-1 h-4 w-4" />
              Colar lista
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/projetos-foco">
                <Star className="mr-1 h-4 w-4" />
                Ver a bancada
              </Link>
            </Button>
          </>
        }
      />

      <ColarListaDialog open={colarOpen} onOpenChange={setColarOpen} onAplicar={aplicarColagem} />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          title="Com book"
          value={comBook}
          icon={BookOpen}
          loading={projetosQ.isLoading}
          hint={total > 0 ? `de ${total} empreendimentos` : undefined}
        />
        <StatTile
          title="Com tabela"
          value={comTabela}
          icon={Table2}
          loading={projetosQ.isLoading}
          hint={total > 0 ? `de ${total} empreendimentos` : undefined}
        />
        <StatTile
          title="Completos"
          value={completos}
          icon={Star}
          intent={completos === total && total > 0 ? "success" : "warning"}
          loading={projetosQ.isLoading}
          hint="Book e tabela preenchidos"
        />
      </div>

      {total > 0 && (
        <Progress
          value={(completos / total) * 100}
          aria-label={`${completos} de ${total} empreendimentos com material completo`}
        />
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empreendimento, construtora ou bairro…"
            aria-label="Buscar empreendimento"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="so-faltando" checked={soFaltando} onCheckedChange={setSoFaltando} />
          <Label htmlFor="so-faltando" className="cursor-pointer text-sm">
            Só os que faltam material
          </Label>
        </div>
      </div>

      {projetosQ.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhum empreendimento ativo"
          description="Cadastre projetos no catálogo para preencher os materiais aqui."
          className="py-12"
        />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={soFaltando ? Star : Search}
          title={
            soFaltando && !busca.trim()
              ? "Todo empreendimento já tem book e tabela"
              : "Nenhum empreendimento encontrado"
          }
          description={
            soFaltando && !busca.trim()
              ? "Nada pendente. Desligue o filtro para revisar ou trocar links existentes."
              : "Ajuste a busca ou desligue o filtro de pendências."
          }
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBusca("");
                setSoFaltando(false);
              }}
            >
              <X className="mr-1 h-4 w-4" />
              Limpar filtros
            </Button>
          }
          className="py-12"
        />
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <div key={g.titulo} className="space-y-2">
              <div className="flex items-center gap-2">
                {g.parceira ? (
                  <Star
                    className="h-4 w-4 text-gold-600 dark:text-gold-300"
                    aria-label="Construtora parceira"
                  />
                ) : (
                  <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                )}
                <h2 className="font-display text-sm font-semibold tracking-tight">{g.titulo}</h2>
                <Badge variant="outline" className="text-[10px]">
                  {g.itens.length}
                </Badge>
              </div>
              <div
                className={cn(
                  "divide-y divide-border-subtle overflow-hidden rounded-xl border bg-card shadow-elev-1",
                  g.parceira ? "border-gold-500/25" : "border-border-subtle",
                )}
              >
                {g.itens.map((p) => (
                  <LinhaMaterial
                    key={p.id}
                    projeto={p}
                    edicao={valorAtual(p)}
                    alterado={edicoes[p.id] != null}
                    onChange={(campo, valor) => editar(p.id, campo, valor, p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {pendentes.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-card/95 p-3 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <span className="flex-1 text-sm">
              <strong className="tabular-nums">{pendentes.length}</strong>{" "}
              {pendentes.length === 1 ? "projeto alterado" : "projetos alterados"}
              {invalidos > 0 && (
                <span className="ml-2 text-destructive">· {invalidos} com link inválido</span>
              )}
            </span>
            <Button variant="ghost" onClick={() => setEdicoes({})} disabled={salvar.isPending}>
              Descartar
            </Button>
            <Button
              onClick={() => salvar.mutate()}
              loading={salvar.isPending}
              disabled={invalidos > 0}
            >
              <Save className="mr-1 h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ColarListaDialog({
  open,
  onOpenChange,
  onAplicar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAplicar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTexto("");
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Colar lista de materiais</DialogTitle>
          <DialogDescription>
            Uma linha por empreendimento: nome, link do book e link da tabela, separados por TAB (o
            que sai do Sheets) ou ponto-e-vírgula. O nome não precisa ser idêntico ao do catálogo —
            quando ficar ambíguo, a linha volta para você decidir em vez de arriscar.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={12}
          className="font-mono text-xs"
          aria-label="Lista de materiais"
          placeholder={"MA Lapa;https://drive.google.com/…;https://drive.google.com/…"}
        />
        <p className="text-xs text-muted-foreground">
          Nada é salvo agora: as linhas viram alterações pendentes para você conferir antes de
          clicar em Salvar.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onAplicar(texto)} disabled={!texto.trim()}>
            Preencher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinhaMaterial({
  projeto,
  edicao,
  alterado,
  onChange,
}: {
  projeto: ProjetoMaterial;
  edicao: Edicao;
  alterado: boolean;
  onChange: (campo: keyof Edicao, valor: string) => void;
}) {
  const local = [projeto.bairro, projeto.cidade].filter(Boolean).join(", ");
  return (
    <div className={cn("space-y-2 p-3", alterado && "bg-gold-500/5")}>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium">{projeto.nome}</span>
        {local && <span className="truncate text-xs text-muted-foreground">{local}</span>}
        <Button asChild variant="ghost" size="sm">
          <Link to="/projetos/$projetoId" params={{ projetoId: projeto.id }}>
            Ficha
            <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <CampoUrl
          id={`book-${projeto.id}`}
          icone={BookOpen}
          rotulo="Book"
          valor={edicao.book_url}
          onChange={(v) => onChange("book_url", v)}
          projeto={projeto.nome}
        />
        <CampoUrl
          id={`tabela-${projeto.id}`}
          icone={Table2}
          rotulo="Tabela de preços"
          valor={edicao.tabela_precos_url}
          onChange={(v) => onChange("tabela_precos_url", v)}
          projeto={projeto.nome}
        />
      </div>
    </div>
  );
}

function CampoUrl({
  id,
  icone: Icone,
  rotulo,
  valor,
  onChange,
  projeto,
}: {
  id: string;
  icone: typeof BookOpen;
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  projeto: string;
}) {
  const invalido = !urlValida(valor);
  return (
    <div>
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {rotulo}
      </Label>
      <div className="mt-1 flex items-center gap-1">
        <Input
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://drive.google.com/…"
          aria-label={`${rotulo} de ${projeto}`}
          aria-invalid={invalido || undefined}
          className={cn("text-xs", invalido && "border-destructive focus-visible:ring-destructive")}
        />
        {valor.trim() && !invalido && (
          <Button asChild variant="ghost" size="icon" title={`Abrir ${rotulo.toLowerCase()}`}>
            <a
              href={valor.trim()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${rotulo.toLowerCase()} de ${projeto}`}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
      {invalido && (
        <p className="mt-1 text-xs text-destructive">Cole um endereço começando com https://</p>
      )}
    </div>
  );
}
