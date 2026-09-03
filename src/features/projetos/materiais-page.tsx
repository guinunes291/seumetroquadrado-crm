// Materiais dos empreendimentos — a tela de preenchimento em massa.
//
// Book e tabela são o que o corretor mais busca na prateleira, e sem URL o
// botão lá nasce desabilitado. Preencher isso pela ficha custa abrir 50
// projetos, achar o campo e salvar um por um — na prática, não é feito. Aqui a
// lista inteira é editável de uma vez: cola, Tab, cola, e um botão salva tudo o
// que mudou num lote só.
//
// 2026-09-02 (docs/revisao-projetos-foco.md, decisões 3, 6 e 23): a tela ganhou
// CAPA e PREÇO — Cury e Mundo Apto estavam sem preço e a prateleira image-first
// precisa de foto — e o SCORE DE COMPLETUDE por projeto, que diz à gestão o que
// falta e o que ainda não aparece na prateleira do corretor.
//
// A leitura é a mesma da prateleira (parceiras primeiro, na ordem da gestão), e
// o filtro que abre a tela é "só os que faltam algo" — o trabalho que falta.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowSquareOut,
  BookOpen,
  Buildings,
  Clipboard,
  FloppyDisk,
  Image as ImageIcon,
  MagnifyingGlass,
  Star,
  Table,
  Wallet,
  X,
} from "@phosphor-icons/react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { parceiraDoProjetoOuNome, type Parceira } from "@/lib/construtoras";
import {
  casarColagem,
  diffMateriais,
  edicaoInicial,
  parseColagem,
  precoValido,
  urlValida,
  type MateriaisEdicao,
} from "@/lib/materiais";
import { completudeProjeto, descreveFaltando, type Completude } from "@/lib/projetos-completude";
import { saneiaLocal, saneiaMetragem } from "@/lib/projetos-saneamento";
import { zonaDoProjeto } from "@/lib/zonas";
import { useConstrutorasParceiras } from "./use-construtoras-parceiras";

/** O que esta tela lê (para o score) e escreve (book, tabela, capa, preço). */
type ProjetoMaterial = {
  id: string;
  nome: string;
  construtora: string | null;
  bairro: string | null;
  cidade: string | null;
  regiao: string | null;
  zona_smq: string | null;
  book_url: string | null;
  tabela_precos_url: string | null;
  capa_url: string | null;
  preco_a_partir: number | null;
  sob_consulta: boolean;
  metragem_min: number | null;
  metragem_max: number | null;
  dorms_min: number | null;
  dorms_max: number | null;
  status_entrega: string | null;
  ano_entrega: number | null;
  renda_minima: number | null;
  diferenciais: string[] | null;
};

const SELECT_MATERIAIS =
  "id, nome, construtora, bairro, cidade, regiao, zona_smq, book_url, tabela_precos_url, capa_url, preco_a_partir, sob_consulta, metragem_min, metragem_max, dorms_min, dorms_max, status_entrega, ano_entrega, renda_minima, diferenciais";

/** Edição sempre com os quatro campos preenchidos (strings). */
type Edicao = Required<MateriaisEdicao>;

const SEM_CONSTRUTORA = "Sem construtora informada";

/** Campos que esta tela consegue resolver — é o que o filtro "falta algo" olha. */
const EDITAVEIS = new Set(["preco", "book", "tabela", "capa"]);

function completudeDe(p: ProjetoMaterial): Completude {
  const local = saneiaLocal(p.bairro, p.cidade);
  const metragem = saneiaMetragem(p.metragem_min, p.metragem_max, p.preco_a_partir);
  const zona = zonaDoProjeto({
    zona_smq: p.zona_smq,
    regiao: p.regiao,
    cidade: local.cidade,
    bairro: local.bairro,
  });
  return completudeProjeto(
    { ...p, metragem_min: metragem.metragem_min, metragem_max: metragem.metragem_max },
    zona,
  );
}

export function MateriaisPage() {
  const qc = useQueryClient();
  const parceirasQ = useConstrutorasParceiras();
  const [busca, setBusca] = useState("");
  // Abre no trabalho que falta: quem já tem tudo não precisa de você.
  const [soFaltando, setSoFaltando] = useState(true);
  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({});
  const [colarOpen, setColarOpen] = useState(false);

  const projetosQ = useQuery({
    queryKey: ["projetos-materiais"],
    queryFn: async (): Promise<ProjetoMaterial[]> => {
      const { data, error } = await supabase
        .from("projetos")
        .select(SELECT_MATERIAIS)
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

  const completudes = useMemo(() => {
    const map = new Map<string, Completude>();
    for (const p of projetos) map.set(p.id, completudeDe(p));
    return map;
  }, [projetos]);

  /** Valor em tela: a edição pendente, ou o que está gravado. */
  const valorAtual = (p: ProjetoMaterial): Edicao => edicoes[p.id] ?? (edicaoInicial(p) as Edicao);

  const pendentes = useMemo(
    () =>
      projetos
        .map((p) => ({ projeto: p, mudancas: diffMateriais(p, valorAtual(p)) }))
        .filter((x) => Object.keys(x.mudancas).length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valorAtual deriva de `edicoes`
    [projetos, edicoes],
  );

  const edicaoValida = (e: Edicao) =>
    urlValida(e.book_url) &&
    urlValida(e.tabela_precos_url) &&
    urlValida(e.capa_url) &&
    precoValido(e.preco_a_partir);

  const invalidos = useMemo(
    () => Object.values(edicoes).filter((e) => !edicaoValida(e)).length,
    [edicoes],
  );

  const total = projetos.length;
  const comBook = projetos.filter((p) => p.book_url).length;
  const comTabela = projetos.filter((p) => p.tabela_precos_url).length;
  const comCapa = projetos.filter((p) => p.capa_url).length;
  const comPreco = projetos.filter((p) => p.preco_a_partir != null || p.sob_consulta).length;
  const prontos = projetos.filter((p) => completudes.get(p.id)?.prontoParaPrateleira).length;

  const salvar = useMutation({
    mutationFn: async () => {
      if (invalidos > 0) throw new Error("Há campos inválidos — corrija antes de salvar.");
      // Um UPDATE por projeto: são poucos e cada um precisa da sua cláusula.
      // Erro em qualquer um aborta e mantém as edições em tela para reenvio.
      for (const { projeto, mudancas } of pendentes) {
        const { error } = await supabase.from("projetos").update(mudancas).eq("id", projeto.id);
        if (error) throw new Error(`${projeto.nome}: ${error.message}`);
      }
      return pendentes.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? "projeto salvo" : "projetos salvos"}`);
      setEdicoes({});
      qc.invalidateQueries({ queryKey: ["projetos-materiais"] });
      // A prateleira, a Vitrine e o catálogo leem as mesmas colunas.
      qc.invalidateQueries({ queryKey: ["projetos-foco"] });
      qc.invalidateQueries({ queryKey: ["projetos"] });
      qc.invalidateQueries({ queryKey: ["vitrine-projetos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const faltaEditavel = (p: ProjetoMaterial) =>
    (completudes.get(p.id)?.faltando ?? []).some((c) => EDITAVEIS.has(c));

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return projetos.filter((p) => {
      const edicao = valorAtual(p);
      // Linha em edição nunca some do filtro no meio da digitação.
      const emEdicao = edicoes[p.id] != null;
      if (soFaltando && !emEdicao && !faltaEditavel(p)) return false;
      if (!termo) return true;
      return [p.nome, p.construtora, p.bairro, p.cidade, edicao.book_url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valorAtual/faltaEditavel derivam de `edicoes`/`completudes`
  }, [projetos, busca, soFaltando, edicoes, completudes]);

  /** Mesma leitura da prateleira: parceiras primeiro, na ordem da gestão; dentro, o mais incompleto antes. */
  const grupos = useMemo(() => {
    const porChave = new Map<
      string,
      { titulo: string; parceira: Parceira | null; itens: ProjetoMaterial[] }
    >();
    for (const p of filtrados) {
      const { parceira } = parceiraDoProjetoOuNome(
        { construtora: p.construtora, nome: p.nome },
        parceiras,
      );
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
    const score = (p: ProjetoMaterial) => completudes.get(p.id)?.score ?? 0;
    return Array.from(porChave.values())
      .map((g) => ({
        ...g,
        itens: [...g.itens].sort(
          (a, b) => score(a) - score(b) || a.nome.localeCompare(b.nome, "pt-BR"),
        ),
      }))
      .sort((a, b) => {
        const ia = a.parceira ? (indice.get(a.parceira.id) ?? 0) : Infinity;
        const ib = b.parceira ? (indice.get(b.parceira.id) ?? 0) : Infinity;
        if (ia !== ib) return ia - ib;
        return b.itens.length - a.itens.length || a.titulo.localeCompare(b.titulo, "pt-BR");
      });
  }, [filtrados, parceiras, completudes]);

  const editar = (id: string, campo: keyof Edicao, valor: string, projeto: ProjetoMaterial) => {
    setEdicoes((atual) => {
      const base = atual[id] ?? (edicaoInicial(projeto) as Edicao);
      const proximo = { ...base, [campo]: valor };
      const mudou =
        Object.keys(diffMateriais(projeto, proximo)).length > 0 || !edicaoValida(proximo);
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
        const base = copia[projeto.id] ?? (edicaoInicial(projeto) as Edicao);
        const proximo = { ...base, ...valores } as Edicao;
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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 p-6 pb-24">
        <PageHeader
          title="Materiais dos empreendimentos"
          description="Book, tabela, capa e preço de cada projeto. É daqui que a prateleira do corretor se alimenta — o que falta aqui não aparece lá."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setColarOpen(true)}>
                <Clipboard className="mr-1 h-4 w-4" />
                Colar lista
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/projetos-foco">
                  <Star className="mr-1 h-4 w-4" />
                  Ver a prateleira
                </Link>
              </Button>
            </>
          }
        />

        <ColarListaDialog open={colarOpen} onOpenChange={setColarOpen} onAplicar={aplicarColagem} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            icon={Table}
            loading={projetosQ.isLoading}
            hint={total > 0 ? `de ${total} empreendimentos` : undefined}
          />
          <StatTile
            title="Com capa"
            value={comCapa}
            icon={ImageIcon}
            loading={projetosQ.isLoading}
            hint="Foto do card na prateleira"
          />
          <StatTile
            title="Com preço"
            value={comPreco}
            icon={Wallet}
            loading={projetosQ.isLoading}
            hint="Ou marcado como sob consulta"
          />
        </div>

        {total > 0 && (
          <div className="space-y-1">
            <Progress
              value={(prontos / total) * 100}
              aria-label={`${prontos} de ${total} empreendimentos prontos para a prateleira`}
            />
            <p className="text-xs text-muted-foreground">
              <strong className="tabular-nums text-foreground">{prontos}</strong> de {total} prontos
              para a prateleira (zona conhecida e book ou tabela). Os demais ficam só no catálogo.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
              Só os que faltam algo
            </Label>
          </div>
        </div>

        {projetosQ.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState
            icon={Buildings}
            title="Nenhum empreendimento ativo"
            description="Cadastre projetos no catálogo para preencher os materiais aqui."
            className="py-12"
          />
        ) : filtrados.length === 0 ? (
          <EmptyState
            icon={soFaltando ? Star : MagnifyingGlass}
            title={
              soFaltando && !busca.trim()
                ? "Todo empreendimento já tem book, tabela, capa e preço"
                : "Nenhum empreendimento encontrado"
            }
            description={
              soFaltando && !busca.trim()
                ? "Nada pendente. Desligue o filtro para revisar ou trocar o que já existe."
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
                    <Buildings className="h-4 w-4 text-primary" aria-hidden="true" />
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
                      completude={completudes.get(p.id)}
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

        {pendentes.length + invalidos > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-card/95 p-3 backdrop-blur md:left-64">
            <div className="mx-auto flex max-w-4xl items-center gap-3">
              <span className="flex-1 text-sm">
                <strong className="tabular-nums">{pendentes.length}</strong>{" "}
                {pendentes.length === 1 ? "projeto alterado" : "projetos alterados"}
                {invalidos > 0 && (
                  <span className="ml-2 text-destructive">· {invalidos} com campo inválido</span>
                )}
              </span>
              <Button variant="ghost" onClick={() => setEdicoes({})} disabled={salvar.isPending}>
                Descartar
              </Button>
              <Button
                onClick={() => salvar.mutate()}
                loading={salvar.isPending}
                disabled={invalidos > 0 || pendentes.length === 0}
              >
                <FloppyDisk className="mr-1 h-4 w-4" />
                Salvar
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
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
            Uma linha por empreendimento: nome, link do book, link da tabela, link da capa e preço,
            separados por TAB (o que sai do Sheets) ou ponto-e-vírgula. As quatro últimas colunas
            são opcionais. O nome não precisa ser idêntico ao do catálogo — quando ficar ambíguo, a
            linha volta para você decidir em vez de arriscar.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={12}
          className="font-mono text-xs"
          aria-label="Lista de materiais"
          placeholder={
            "MA Lapa;https://drive.google.com/…;https://drive.google.com/…;https://…/capa.jpg;R$ 249.900"
          }
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

function tomDoScore(score: number): string {
  if (score >= 80) return "border-success/40 bg-success/10 text-success";
  if (score >= 50) return "border-warning/40 bg-warning/10 text-warning";
  return "border-destructive/40 bg-destructive/10 text-destructive";
}

function LinhaMaterial({
  projeto,
  completude,
  edicao,
  alterado,
  onChange,
}: {
  projeto: ProjetoMaterial;
  completude: Completude | undefined;
  edicao: Edicao;
  alterado: boolean;
  onChange: (campo: keyof Edicao, valor: string) => void;
}) {
  const local = saneiaLocal(projeto.bairro, projeto.cidade);
  const localTexto = [local.bairro, local.cidade].filter(Boolean).join(", ");
  return (
    <div className={cn("space-y-2 p-3", alterado && "bg-gold-500/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{projeto.nome}</span>
        {localTexto && <span className="truncate text-xs text-muted-foreground">{localTexto}</span>}
        {completude && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                  tomDoScore(completude.score),
                )}
                aria-label={`Completude ${completude.score} de 100`}
              >
                {completude.score}%
                {!completude.prontoParaPrateleira && (
                  <span className="ml-1 font-normal">· fora da prateleira</span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>{descreveFaltando(completude.faltando, 5)}</TooltipContent>
          </Tooltip>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link to="/projetos/$projetoId" params={{ projetoId: projeto.id }}>
            Ficha
            <ArrowSquareOut className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
          icone={Table}
          rotulo="Tabela de preços"
          valor={edicao.tabela_precos_url}
          onChange={(v) => onChange("tabela_precos_url", v)}
          projeto={projeto.nome}
        />
        <CampoUrl
          id={`capa-${projeto.id}`}
          icone={ImageIcon}
          rotulo="Capa (imagem)"
          valor={edicao.capa_url}
          onChange={(v) => onChange("capa_url", v)}
          projeto={projeto.nome}
          previa
        />
        <CampoPreco
          id={`preco-${projeto.id}`}
          valor={edicao.preco_a_partir}
          sobConsulta={projeto.sob_consulta}
          onChange={(v) => onChange("preco_a_partir", v)}
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
  previa,
}: {
  id: string;
  icone: typeof BookOpen;
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  projeto: string;
  /** Mostra a miniatura da imagem quando o link é válido. */
  previa?: boolean;
}) {
  const invalido = !urlValida(valor);
  const temLink = valor.trim().length > 0 && !invalido;
  return (
    <div>
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {rotulo}
      </Label>
      <div className="mt-1 flex items-center gap-1">
        {previa && temLink && (
          <img
            src={valor.trim()}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-9 w-12 shrink-0 rounded-md border border-border-subtle object-cover"
          />
        )}
        <Input
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          aria-label={`${rotulo} de ${projeto}`}
          aria-invalid={invalido || undefined}
          className={cn("text-xs", invalido && "border-destructive focus-visible:ring-destructive")}
        />
        {temLink && (
          <Button asChild variant="ghost" size="icon" title={`Abrir ${rotulo.toLowerCase()}`}>
            <a
              href={valor.trim()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${rotulo.toLowerCase()} de ${projeto}`}
            >
              <ArrowSquareOut className="h-4 w-4" />
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

function CampoPreco({
  id,
  valor,
  sobConsulta,
  onChange,
  projeto,
}: {
  id: string;
  valor: string;
  sobConsulta: boolean;
  onChange: (valor: string) => void;
  projeto: string;
}) {
  const invalido = !precoValido(valor);
  return (
    <div>
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
        Preço a partir de (R$)
        {sobConsulta && (
          <Badge variant="outline" className="ml-1 text-[10px]">
            sob consulta
          </Badge>
        )}
      </Label>
      <Input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="ex.: 249.900"
        aria-label={`Preço a partir de ${projeto}`}
        aria-invalid={invalido || undefined}
        className={cn(
          "mt-1 text-xs tabular-nums",
          invalido && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {invalido && (
        <p className="mt-1 text-xs text-destructive">Só números: 249900, 249.900 ou 250 mil.</p>
      )}
    </div>
  );
}
