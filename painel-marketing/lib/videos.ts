import "server-only";
import { put } from "@vercel/blob";
import { sql } from "./db";
import { registrar } from "./auditoria";
import { ErroHiggsfield, situacaoDoVideo } from "./higgsfield";
import { corpoDoVideo, endpointDoVideo, type PedidoVideo } from "./video";

// Biblioteca de vídeos (marketing.videos). O arquivo pronto é copiado para o
// Vercel Blob do Painel, porque o Higgsfield apaga tudo 7 dias depois.
// O token do Blob (BLOB_READ_WRITE_TOKEN) é posto pela própria Vercel ao ligar o
// armazenamento ao projeto, e só existe no servidor.

export type Video = {
  id: string;
  job_id: string;
  tipo: "gerar" | "editar";
  empreendimento_id: number | null;
  empreendimento: string | null;
  titulo: string;
  ideia: string;
  prompt: string;
  modelo: string;
  parametros: Record<string, unknown>;
  entrada_url: string | null;
  hf_request_id: string | null;
  status: "gerando" | "pronto" | "falhou" | "cancelado";
  custo_estimado_usd: number | null;
  url: string | null;
  erro: string | null;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
  arquivado_em: string | null;
};

export function armazenamentoConfigurado(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function registrarVideo(
  quem: string,
  jobId: string,
  titulo: string,
  p: PedidoVideo,
): Promise<string> {
  const [v] = await sql()<{ id: string }[]>`
    insert into videos (job_id, tipo, empreendimento_id, titulo, ideia, prompt, modelo, parametros,
      entrada_url, custo_estimado_usd, criado_por)
    values (${jobId}, ${p.tipo === "video_editar" ? "editar" : "gerar"}, ${p.empreendimentoId},
      ${titulo}, ${p.ideia}, ${p.prompt}, ${endpointDoVideo(p)},
      ${sql().json(corpoDoVideo(p) as never)},
      ${p.tipo === "video_editar" ? p.videoUrl : p.imagemUrl}, ${p.custoUsd}, ${quem})
    on conflict (job_id) do update set atualizado_em = now()
    returning id`;
  return v.id;
}

export async function gravarEnvio(id: string, requestId: string) {
  await sql()`update videos set hf_request_id = ${requestId}, atualizado_em = now() where id = ${id}`;
}

export async function marcarVideo(id: string, status: Video["status"], erro: string | null) {
  await sql()`update videos set status = ${status}, erro = ${erro}, atualizado_em = now() where id = ${id}`;
}

// Função (e não constante) para não abrir conexão ao carregar o módulo no build.
const colunas = () => sql()`
  v.id, v.job_id, v.tipo, v.empreendimento_id, e.nome as empreendimento, v.titulo, v.ideia,
  v.prompt, v.modelo, v.parametros, v.entrada_url, v.hf_request_id, v.status,
  v.custo_estimado_usd::float8 as custo_estimado_usd, v.url, v.erro, v.criado_por, v.criado_em,
  v.atualizado_em, v.arquivado_em`;

export async function listarVideos(arquivados = false): Promise<Video[]> {
  return sql()<Video[]>`
    select ${colunas()} from videos v left join empreendimentos e on e.id = v.empreendimento_id
    where (v.arquivado_em is not null) = ${arquivados}
    order by v.criado_em desc limit 100`;
}

export async function videoDoJob(jobId: string): Promise<Video | null> {
  const [v] = await sql()<Video[]>`
    select ${colunas()} from videos v left join empreendimentos e on e.id = v.empreendimento_id
    where v.job_id = ${jobId}`;
  return v ?? null;
}

// Pergunta ao Higgsfield como está um vídeo em geração (só leitura, pode repetir
// à vontade) e, se ficou pronto, copia o arquivo para o Blob.
export async function conferirVideo(v: Video): Promise<Video["status"]> {
  if (v.status !== "gerando" || !v.hf_request_id) return v.status;
  let s;
  try {
    s = await situacaoDoVideo(v.hf_request_id);
  } catch (e) {
    if (e instanceof ErroHiggsfield) return v.status; // tenta de novo na próxima visita
    throw e;
  }
  if (s.status === "queued" || s.status === "in_progress") return v.status;
  if (s.status === "completed" && s.video?.url) {
    const arquivo = await fetch(s.video.url, { cache: "no-store" });
    if (!arquivo.ok || !arquivo.body) return v.status;
    const salvo = await put(`videos/${v.id}.mp4`, arquivo.body, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    });
    // Só grava se ainda estava gerando: duas abas abertas não copiam duas vezes
    // para a mesma linha.
    const r = await sql()`
      update videos set status = 'pronto', url = ${salvo.url}, erro = null, atualizado_em = now()
      where id = ${v.id} and status = 'gerando'`;
    if (r.count) await registrar("higgsfield", "video_pronto", v.id, { job: v.job_id });
    return "pronto";
  }
  const motivo =
    s.status === "nsfw"
      ? "A moderação do Higgsfield barrou este vídeo. Nada foi cobrado; ajuste o texto e peça de novo."
      : s.status === "canceled"
        ? "Cancelado na fila. O Higgsfield devolveu o valor."
        : "O Higgsfield não conseguiu gerar este vídeo. Nada foi cobrado.";
  const final = s.status === "canceled" ? "cancelado" : "falhou";
  await marcarVideo(v.id, final, motivo);
  await registrar("higgsfield", `video_${final}`, v.id, { job: v.job_id, status: s.status });
  return final;
}

// Confere até 5 vídeos em geração, em paralelo. Roda quando a Biblioteca abre.
export async function conferirGerando(): Promise<number> {
  // Inclui os arquivados: um vídeo arquivado no meio da geração ainda é copiado,
  // porque já foi pago.
  const gerando = await sql()<Video[]>`
    select ${colunas()} from videos v left join empreendimentos e on e.id = v.empreendimento_id
    where v.status = 'gerando' and v.hf_request_id is not null
    order by v.criado_em limit 5`;
  const r = await Promise.allSettled(gerando.map(conferirVideo));
  return r.filter((x) => x.status === "fulfilled" && x.value !== "gerando").length;
}

export async function arquivarVideo(quem: string, id: string, arquivar: boolean) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const r = arquivar
    ? await sql()`update videos set arquivado_em = now(), arquivado_por = ${quem}, atualizado_em = now()
        where id = ${id} and arquivado_em is null`
    : await sql()`update videos set arquivado_em = null, arquivado_por = null, atualizado_em = now()
        where id = ${id} and arquivado_em is not null`;
  if (r.count) await registrar(quem, arquivar ? "video_arquivado" : "video_restaurado", id, {});
}
