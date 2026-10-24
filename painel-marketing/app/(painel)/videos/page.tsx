import Link from "next/link";
import { conferirGerando, listarVideos, type Video } from "@/lib/videos";
import { custoTexto } from "@/lib/video";
import { dataHora } from "@/lib/formato";
import { AtualizarSozinho } from "@/components/atualizar-sozinho";
import { acaoArquivarVideo } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS: Record<Video["status"], { texto: string; cor: string }> = {
  gerando: { texto: "Gerando", cor: "bg-navy/10 text-navy" },
  pronto: { texto: "Pronto", cor: "bg-green-100 text-green-800" },
  falhou: { texto: "Não saiu", cor: "bg-alerta/10 text-alerta" },
  cancelado: { texto: "Cancelado", cor: "bg-creme text-cinza" },
};

export default async function Videos({
  searchParams,
}: {
  searchParams: Promise<{ arquivados?: string }>;
}) {
  const { arquivados } = await searchParams;
  const verArquivados = arquivados === "1";
  // Antes de listar, pergunta ao Higgsfield pelos que ainda estão gerando.
  await conferirGerando().catch(() => 0);
  const videos = await listarVideos(verArquivados);
  const gerando = videos.some((v) => v.status === "gerando");

  return (
    <div className="space-y-6">
      <AtualizarSozinho ativo={gerando} />
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Vídeos</h1>
          <p className="mt-1 text-sm text-cinza">
            Tudo o que foi gerado ou editado no Higgsfield pelo Painel. Os arquivos ficam guardados
            aqui (no Higgsfield somem em 7 dias). Nada é publicado sozinho.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/videos/gerar"
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-creme hover:bg-navy-claro"
          >
            Gerar vídeo por prompt
          </Link>
          <Link
            href="/videos/editar"
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-creme hover:bg-navy-claro"
          >
            Editar vídeo
          </Link>
        </div>
      </section>

      <p className="text-sm">
        {verArquivados ? (
          <Link href="/videos" className="underline">
            Voltar aos vídeos ativos
          </Link>
        ) : (
          <Link href="/videos?arquivados=1" className="text-cinza underline">
            Ver arquivados
          </Link>
        )}
      </p>

      {videos.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-sm text-cinza ring-1 ring-navy/10">
          {verArquivados ? "Nenhum vídeo arquivado." : "Nenhum vídeo ainda."}
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => {
            const s = STATUS[v.status];
            return (
              <article key={v.id} className="flex flex-col rounded-lg bg-white ring-1 ring-navy/10">
                <div className="flex aspect-[9/12] items-center justify-center overflow-hidden rounded-t-lg bg-navy">
                  {v.url ? (
                    <video
                      src={v.url}
                      controls
                      preload="metadata"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <p className="px-6 text-center text-sm text-creme/80">
                      {v.status === "gerando"
                        ? "Gerando no Higgsfield. Esta página confere sozinha."
                        : (v.erro ?? "Sem arquivo.")}
                    </p>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-navy">{v.titulo}</p>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.cor}`}>
                      {s.texto}
                    </span>
                  </div>
                  <p className="text-cinza">{v.ideia}</p>
                  <p className="text-xs text-cinza">
                    {v.tipo === "editar" ? "Edição" : "Gerado"} em {dataHora(v.criado_em)}
                    {v.custo_estimado_usd ? ` · ${custoTexto(v.custo_estimado_usd)}` : ""}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-2 text-xs">
                    <Link href={`/aprovacoes/${v.job_id}`} className="underline">
                      Ver pedido
                    </Link>
                    {v.url && (
                      <a href={v.url} download className="underline">
                        Baixar
                      </a>
                    )}
                    <form action={acaoArquivarVideo}>
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="arquivar" value={verArquivados ? "nao" : "sim"} />
                      <button className="text-cinza underline">
                        {verArquivados ? "Restaurar" : "Arquivar"}
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
