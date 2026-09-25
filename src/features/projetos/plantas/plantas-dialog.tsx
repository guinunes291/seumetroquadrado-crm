// Curadoria das plantas de um empreendimento (tela de Materiais).
//
// Fluxo: baixa o book pelo proxy → pdf.js lê cada página → a heurística
// pré-marca as prováveis plantas → a pessoa confirma/ajusta a legenda → as
// páginas marcadas sobem em alta para o bucket público `projetos-plantas` e a
// lista vai para `projetos.plantas`. Roda uma vez por projeto; o comparativo em
// PDF só lê o resultado.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle, FilePdf, Trash } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PLANTAS_BUCKET, PLANTAS_MAX, parsePlantas, type PlantaProjeto } from "@/lib/plantas";
import type { BookAberto } from "./extrair-plantas";

type Props = {
  projeto: { id: string; nome: string; book_url: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Etapa =
  | { tipo: "inicio" }
  | { tipo: "baixando"; recebido: number; total: number | null }
  | { tipo: "lendo"; atual: number; total: number }
  | { tipo: "pronto" }
  | { tipo: "erro"; mensagem: string };

const plantasQueryKey = (id: string) => ["projeto-plantas", id];

/** Caminho do objeto no bucket a partir da URL pública (para apagar). */
function caminhoNoBucket(url: string): string | null {
  const marca = `/object/public/${PLANTAS_BUCKET}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split("?")[0]) : null;
}

export function PlantasDialog({ projeto, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "inicio" });
  const [book, setBook] = useState<BookAberto | null>(null);
  const [marcadas, setMarcadas] = useState<Map<number, string>>(new Map());
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [removidas, setRemovidas] = useState<Set<string>>(new Set());
  const bookRef = useRef<BookAberto | null>(null);

  const salvasQ = useQuery({
    queryKey: plantasQueryKey(projeto.id),
    enabled: open,
    queryFn: async (): Promise<PlantaProjeto[]> => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, plantas")
        .eq("id", projeto.id)
        .maybeSingle();
      if (error) throw error;
      return parsePlantas(data?.plantas);
    },
  });
  const salvas = salvasQ.data ?? [];
  const mantidas = salvas.filter((p) => !removidas.has(p.url));

  // Libera o pdf.js (memória do book) ao fechar.
  useEffect(() => {
    if (open) return;
    bookRef.current?.fechar();
    bookRef.current = null;
    setBook(null);
    setEtapa({ tipo: "inicio" });
    setMarcadas(new Map());
    setRemovidas(new Set());
    setMostrarTodas(false);
  }, [open]);

  const extrair = async () => {
    try {
      setEtapa({ tipo: "baixando", recebido: 0, total: null });
      // Só no navegador: o ternário constante faz o build SSR descartar o pdf.js
      // (~850 KB) do bundle do Worker, onde ele nunca rodaria.
      const mod = import.meta.env.SSR ? null : await import("./extrair-plantas");
      if (!mod) throw new Error("Extração disponível só no navegador.");
      const dados = await mod.baixarBook(projeto.id, (recebido, total) =>
        setEtapa({ tipo: "baixando", recebido, total }),
      );
      const aberto = await mod.abrirBook(dados, (atual, total) =>
        setEtapa({ tipo: "lendo", atual, total }),
      );
      bookRef.current?.fechar();
      bookRef.current = aberto;
      setBook(aberto);
      const jaSalvas = new Set(salvas.map((s) => s.pagina));
      setMarcadas(
        new Map(
          aberto.paginas
            .filter((p) => p.provavel && !jaSalvas.has(p.pagina))
            .map((p) => [p.pagina, p.legendaSugerida ?? ""]),
        ),
      );
      setMostrarTodas(!aberto.paginas.some((p) => p.provavel));
      setEtapa({ tipo: "pronto" });
    } catch (e) {
      setEtapa({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Falha ao ler o book." });
    }
  };

  const vagas = PLANTAS_MAX - mantidas.length;
  const toggle = (pagina: number, legenda: string | null) => {
    const next = new Map(marcadas);
    if (next.has(pagina)) next.delete(pagina);
    else {
      if (next.size >= vagas) {
        toast.error(`Máximo de ${PLANTAS_MAX} plantas por empreendimento.`);
        return;
      }
      next.set(pagina, legenda ?? "");
    }
    setMarcadas(next);
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const novas: PlantaProjeto[] = [];
      const enviados: string[] = [];
      try {
        for (const [pagina, legenda] of [...marcadas.entries()].sort((a, b) => a[0] - b[0])) {
          if (!book) break;
          const blob = await book.renderizarAlta(pagina);
          const caminho = `${projeto.id}/p${pagina}-${Date.now()}.jpg`;
          const { error } = await supabase.storage.from(PLANTAS_BUCKET).upload(caminho, blob, {
            contentType: "image/jpeg",
            cacheControl: "31536000",
            upsert: false,
          });
          if (error) throw error;
          enviados.push(caminho);
          const { data } = supabase.storage.from(PLANTAS_BUCKET).getPublicUrl(caminho);
          novas.push({ url: data.publicUrl, legenda: legenda.trim() || null, pagina });
        }
        const lista = [...mantidas, ...novas].slice(0, PLANTAS_MAX);
        const { error } = await supabase
          .from("projetos")
          .update({ plantas: lista })
          .eq("id", projeto.id);
        if (error) throw error;
      } catch (e) {
        // Não deixar imagem órfã no bucket quando o salvamento falha no meio.
        if (enviados.length) await supabase.storage.from(PLANTAS_BUCKET).remove(enviados);
        throw e;
      }
      const apagar = salvas
        .filter((p) => removidas.has(p.url))
        .map((p) => caminhoNoBucket(p.url))
        .filter((c): c is string => c != null);
      if (apagar.length) await supabase.storage.from(PLANTAS_BUCKET).remove(apagar);
      return novas.length;
    },
    onSuccess: (n) => {
      toast.success(n ? `${n} planta(s) salva(s)` : "Plantas atualizadas");
      qc.invalidateQueries({ queryKey: plantasQueryKey(projeto.id) });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error(
        /row-level security|permission|42501/i.test(e.message)
          ? "Só o admin pode salvar plantas."
          : e.message,
      ),
  });

  const visiveis = useMemo(
    () =>
      book ? book.paginas.filter((p) => mostrarTodas || p.provavel || marcadas.has(p.pagina)) : [],
    [book, mostrarTodas, marcadas],
  );

  const temMudanca = marcadas.size > 0 || removidas.size > 0;
  const ocupado = etapa.tipo === "baixando" || etapa.tipo === "lendo" || salvar.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !salvar.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plantas · {projeto.nome}</DialogTitle>
          <DialogDescription>
            As plantas vão no comparativo em PDF que o cliente recebe. Extraia do book, confira as
            páginas marcadas e salve.
          </DialogDescription>
        </DialogHeader>

        {salvas.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Salvas ({mantidas.length}/{PLANTAS_MAX})
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {salvas.map((p) => {
                const removida = removidas.has(p.url);
                return (
                  <figure
                    key={p.url}
                    className={cn("relative rounded-md border p-1", removida && "opacity-40")}
                  >
                    <img
                      src={p.url}
                      alt={p.legenda ?? `Planta página ${p.pagina ?? ""}`}
                      className="h-24 w-full object-contain"
                      loading="lazy"
                    />
                    <figcaption className="truncate text-center text-[10px]">
                      {p.legenda ?? `pág. ${p.pagina ?? "?"}`}
                    </figcaption>
                    <button
                      type="button"
                      className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-background/90 shadow"
                      aria-label={removida ? "Manter planta" : "Remover planta"}
                      onClick={() => {
                        const next = new Set(removidas);
                        if (removida) next.delete(p.url);
                        else next.add(p.url);
                        setRemovidas(next);
                      }}
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </figure>
                );
              })}
            </div>
          </section>
        )}

        {etapa.tipo === "inicio" && (
          <div className="rounded-lg border p-4 text-sm">
            {projeto.book_url ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">
                  O book é baixado do Drive e lido aqui no navegador. Books grandes levam alguns
                  segundos.
                </p>
                <Button type="button" onClick={extrair}>
                  <FilePdf className="mr-2 h-4 w-4" /> Extrair do book
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Cadastre o link do book deste empreendimento para extrair as plantas.
              </p>
            )}
          </div>
        )}

        {etapa.tipo === "baixando" && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <p>
              Baixando o book… {(etapa.recebido / 1024 / 1024).toFixed(1)} MB
              {etapa.total ? ` de ${(etapa.total / 1024 / 1024).toFixed(1)} MB` : ""}
            </p>
            <Progress value={etapa.total ? (etapa.recebido / etapa.total) * 100 : 15} />
          </div>
        )}

        {etapa.tipo === "lendo" && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <p>
              Lendo página {etapa.atual}/{etapa.total}…
            </p>
            <Progress value={(etapa.atual / etapa.total) * 100} />
          </div>
        )}

        {etapa.tipo === "erro" && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p>{etapa.mensagem}</p>
            <Button type="button" variant="outline" onClick={extrair}>
              Tentar de novo
            </Button>
          </div>
        )}

        {etapa.tipo === "pronto" && book && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {book.paginas.some((p) => p.provavel)
                  ? `${book.paginas.filter((p) => p.provavel).length} página(s) parecem planta. Confira e ajuste.`
                  : "Não achamos texto de planta no book (provavelmente é só imagem). Escolha as páginas na grade."}
              </p>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={mostrarTodas} onCheckedChange={setMostrarTodas} />
                Mostrar todas as {book.totalPaginas} páginas
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {visiveis.map((p) => {
                const ativa = marcadas.has(p.pagina);
                return (
                  <div
                    key={p.pagina}
                    className={cn(
                      "space-y-1 rounded-md border p-1.5",
                      ativa && "border-primary ring-2 ring-primary/40",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={ativa}
                      className="relative block w-full"
                      onClick={() => toggle(p.pagina, p.legendaSugerida)}
                    >
                      <img
                        src={p.miniatura}
                        alt={`Página ${p.pagina}`}
                        className="h-36 w-full rounded object-contain"
                      />
                      {ativa && (
                        <CheckCircle
                          weight="fill"
                          className="absolute right-1 top-1 h-5 w-5 text-primary"
                        />
                      )}
                      <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[10px]">
                        pág. {p.pagina}
                      </span>
                    </button>
                    {ativa && (
                      <Input
                        className="h-8 text-xs"
                        placeholder="Legenda (ex.: 2 dorms · 41 m²)"
                        maxLength={80}
                        value={marcadas.get(p.pagina) ?? ""}
                        onChange={(e) =>
                          setMarcadas(new Map(marcadas).set(p.pagina, e.target.value))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={salvar.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={!temMudanca || ocupado} onClick={() => salvar.mutate()}>
            {salvar.isPending
              ? "Salvando…"
              : marcadas.size
                ? `Salvar ${marcadas.size} planta(s)`
                : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
