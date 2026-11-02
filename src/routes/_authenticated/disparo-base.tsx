import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { readTabularFile } from "@/lib/spreadsheets";
import { importarBaseCorretorLote } from "@/lib/disparo-base.functions";
import {
  DISPARO_BASE_KEY,
  criarDisparoBase,
  useMeusDisparos,
  usePilotoDisparoBase,
  type DisparoResumo,
} from "@/features/disparo-base/disparo-client";
import {
  LOTE_IMPORTACAO,
  RESULTADO_VAZIO,
  ROTULO_ITEM,
  ROTULO_MOTIVO,
  bloqueiosPorMotivo,
  colunasFaltando,
  linhasDaPlanilha,
  resumoImportacao,
  somarResultados,
  type LinhaBase,
  type ResultadoImportacao,
} from "@/features/disparo-base/importacao";

export const Route = createFileRoute("/_authenticated/disparo-base")({
  head: () => ({
    meta: [
      { title: "Disparo da minha base · CRM SMQ" },
      {
        name: "description",
        content: "Importe a sua base e o Marquinhos faz o primeiro contato pelo WhatsApp.",
      },
    ],
  }),
  component: DisparoBasePage,
});

const STATUS_DISPARO: Record<string, string> = {
  rascunho: "Aguardando envio",
  enviando: "Enviando",
  pausado: "Pausado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function baixarForaDoDisparo(r: ResultadoImportacao) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [
    "Linha,Nome,Telefone,Motivo",
    ...r.bloqueados.map((b) =>
      [b.linha, b.nome, b.telefone, ROTULO_MOTIVO[b.motivo]].map(esc).join(","),
    ),
    ...r.erros.map((e) => [e.linha, e.nome, e.telefone, e.motivo].map(esc).join(",")),
  ];
  const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fora-do-disparo.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function DisparoBasePage() {
  const { piloto, carregando } = usePilotoDisparoBase();

  if (carregando) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!piloto) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Disparo da minha base" />
        <Card>
          <CardContent className="space-y-2 p-6 text-sm">
            <p>O disparo da base está em piloto e ainda não foi liberado para você.</p>
            <p className="text-muted-foreground">
              Quando abrir para o time, ele aparece no menu da Prospecção.
            </p>
            <Link to="/prospeccao" className="text-primary underline">
              Voltar para a Prospecção
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <DisparoBaseConteudo />;
}

function DisparoBaseConteudo() {
  const qc = useQueryClient();
  const importar = useServerFn(importarBaseCorretorLote);
  const disparos = useMeusDisparos();

  const [nome, setNome] = useState("");
  const [declarou, setDeclarou] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [total, setTotal] = useState(0);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  async function iniciar() {
    if (!arquivo) return;
    setResultado(null);
    let linhas: LinhaBase[];
    try {
      const brutas = await readTabularFile(arquivo);
      const faltam = colunasFaltando(brutas);
      if (faltam.length) {
        toast.error(`A planilha precisa das colunas: ${faltam.join(" e ")}.`);
        return;
      }
      linhas = linhasDaPlanilha(brutas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      return;
    }
    if (linhas.length === 0) {
      toast.error("A planilha não tem contatos.");
      return;
    }

    let disparoId: string;
    try {
      disparoId = await criarDisparoBase(nome.trim() || arquivo.name, declarou);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o disparo.");
      return;
    }

    let acc = RESULTADO_VAZIO;
    setTotal(linhas.length);
    setFeitos(0);
    setRodando(true);
    for (let i = 0; i < linhas.length; i += LOTE_IMPORTACAO) {
      const lote = linhas.slice(i, i + LOTE_IMPORTACAO);
      try {
        acc = somarResultados(acc, await importar({ data: { disparoId, rows: lote } }));
      } catch (e) {
        const motivo = e instanceof Error ? e.message : "falha no lote";
        acc = somarResultados(acc, {
          ...RESULTADO_VAZIO,
          erros: lote.map((l) => ({ linha: l.linha, nome: l.nome, telefone: l.telefone, motivo })),
        });
      }
      setFeitos(Math.min(i + LOTE_IMPORTACAO, linhas.length));
    }
    setRodando(false);
    setResultado(acc);
    toast.success(resumoImportacao(acc));
    setArquivo(null);
    setNome("");
    void qc.invalidateQueries({ queryKey: ["disparo-base"] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Disparo da minha base"
        description="Suba a sua planilha de contatos. O Marquinhos faz o primeiro contato pelo WhatsApp oficial e quem se interessar chega qualificado para você. Os contatos entram na sua carteira e continuam seus."
      />

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="font-display text-lg font-bold">1. Importar a base</h3>
          <p className="text-sm text-muted-foreground">
            Colunas: <strong>Nome</strong> e <strong>Telefone</strong> (obrigatórias), Email, Zona,
            Renda. Aceita CSV ou Excel. Cliente de outro corretor, quem pediu para não receber
            mensagens e telefones repetidos ficam de fora automaticamente.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="disparo-nome">Nome do disparo</Label>
            <Input
              id="disparo-nome"
              placeholder="Ex.: Feirão Itaquera 2025"
              value={nome}
              maxLength={120}
              disabled={rodando}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <input
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={rodando}
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
          />
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={declarou}
              disabled={rodando}
              onCheckedChange={(v) => setDeclarou(v === true)}
              className="mt-0.5"
            />
            <span>
              Confirmo que esta base é minha e que os contatos aceitaram ser procurados (LGPD).
            </span>
          </label>
          <Button onClick={iniciar} disabled={!arquivo || !declarou || rodando}>
            {rodando ? "Importando…" : "Importar contatos"}
          </Button>
          {total > 0 && rodando && (
            <div className="space-y-1">
              <Progress value={(feitos / total) * 100} />
              <p className="text-sm text-muted-foreground">
                {feitos.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} linhas
              </p>
            </div>
          )}
          {resultado && <ResumoImportacao r={resultado} />}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="font-display text-lg font-bold">2. Meus disparos</h3>
          <p className="text-sm text-muted-foreground">
            O envio pelo WhatsApp oficial entra na próxima etapa do piloto. Até lá, os contatos
            ficam na sua carteira como &ldquo;Aguardando retorno&rdquo;, sem tarefa nem cadência.
          </p>
          {disparos.isPending ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : disparos.isError ? (
            <p className="text-sm text-destructive">Não foi possível carregar os disparos.</p>
          ) : (disparos.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum disparo ainda.</p>
          ) : (
            <ul className="space-y-3">
              {(disparos.data ?? []).map((d) => (
                <LinhaDisparo key={d.id} d={d} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoImportacao({ r }: { r: ResultadoImportacao }) {
  const motivos = bloqueiosPorMotivo(r);
  return (
    <div className="space-y-2 rounded-md border p-4 text-sm">
      <p className="font-semibold">{resumoImportacao(r)}</p>
      <ul className="space-y-1">
        <li>Novos na sua carteira: {r.novos.toLocaleString("pt-BR")}</li>
        <li>Já eram seus: {r.ja_na_carteira.toLocaleString("pt-BR")}</li>
        {motivos.map((m) => (
          <li key={m.motivo}>
            {ROTULO_MOTIVO[m.motivo]}: {m.qtd.toLocaleString("pt-BR")}
          </li>
        ))}
        {r.erros.length > 0 && <li>Com erro na linha: {r.erros.length.toLocaleString("pt-BR")}</li>}
      </ul>
      {(r.bloqueados.length > 0 || r.erros.length > 0) && (
        <Button variant="outline" size="sm" onClick={() => baixarForaDoDisparo(r)}>
          Baixar quem ficou de fora (CSV)
        </Button>
      )}
    </div>
  );
}

function LinhaDisparo({ d }: { d: DisparoResumo }) {
  const etapas = ["enviado", "entregue", "lido", "respondeu", "qualificado"] as const;
  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{d.nome}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(d.criadoEm).toLocaleDateString("pt-BR")} · {d.total.toLocaleString("pt-BR")}{" "}
            contatos
          </p>
        </div>
        <Badge variant="secondary">{STATUS_DISPARO[d.status] ?? d.status}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-5">
        {etapas.map((e) => (
          <div key={e} className="rounded bg-muted/50 p-2">
            <dt className="text-muted-foreground">{ROTULO_ITEM[e]}</dt>
            <dd className="text-base font-bold">{d.funil[e].toLocaleString("pt-BR")}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
