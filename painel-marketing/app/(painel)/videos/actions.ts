"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { criarPedido } from "@/lib/jobs";
import { listar } from "@/lib/empreendimentos";
import { agentesDisponiveis, AgenteRecusou, roteiristaDeVideo, type Roteiro } from "@/lib/agentes";
import { ErroHiggsfield, estimarCusto } from "@/lib/higgsfield";
import { arquivarVideo } from "@/lib/videos";
import {
  FORMATOS,
  corpoDoVideo,
  endpointDoVideo,
  problemasDoVideo,
  type Formato,
  type PedidoVideo,
  type Resolucao,
} from "@/lib/video";
import type { Estado } from "../pedidos/actions";

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function mensagemDe(e: unknown): string {
  if (e instanceof ErroHiggsfield) return e.traduzido;
  if (e instanceof AgenteRecusou)
    return "O Roteirista recusou o pedido. Reescreva a ideia ou desmarque o Roteirista.";
  return "Não consegui preparar o pedido agora. Nada foi gerado nem cobrado.";
}

// Monta o pedido, passa pelo Roteirista (se marcado), confere as regras e só
// então pede ao Higgsfield o custo. Nada é gerado aqui: o pedido vai para a fila
// de Aprovações com o custo na tela.
async function prepararVideo(
  form: FormData,
  tipo: "gerar" | "editar",
): Promise<{ erros: string[]; id?: string }> {
  const s = await exigirSessao();
  try {
    const empId = Number(form.get("empreendimento")) || null;
    const emp = (await listar()).find((e) => e.id === empId) ?? null;
    const ideia = texto(form.get("ideia"));
    const resolucao: Resolucao = texto(form.get("resolucao")) === "1080p" ? "1080p" : "720p";
    const audio = form.get("audio") === "sim";
    const formatoBruto = texto(form.get("formato"));
    const formato: Formato =
      FORMATOS.find((f) => f.valor === formatoBruto)?.valor ?? ("9:16" as Formato);
    const entrada = texto(form.get(tipo === "editar" ? "video_url" : "imagem_url"));

    let roteiro: Roteiro | null = null;
    let prompt = texto(form.get("prompt")) || ideia;
    if (form.get("roteirista") === "sim" && agentesDisponiveis() && ideia) {
      roteiro = await roteiristaDeVideo({
        tipo,
        empreendimento: emp?.nome ?? "não informado",
        ideia,
        formato: FORMATOS.find((f) => f.valor === formato)?.rotulo ?? formato,
        comImagem: Boolean(entrada),
      });
      prompt = roteiro.prompt;
    }

    const base = {
      empreendimentoId: emp?.id ?? null,
      empreendimentoNome: emp?.nome ?? null,
      ideia,
      prompt,
      resolucao,
      audio,
      custoUsd: 0,
    };
    const pedido: PedidoVideo =
      tipo === "editar"
        ? { tipo: "video_editar", ...base, videoUrl: entrada }
        : {
            tipo: "video_gerar",
            ...base,
            imagemUrl: entrada || null,
            formato,
            duracao: Math.round(Number(texto(form.get("duracao")))) || 5,
          };

    const erros = problemasDoVideo(pedido);
    if (erros.length) return { erros };
    pedido.custoUsd = await estimarCusto(endpointDoVideo(pedido), corpoDoVideo(pedido));

    const r = await criarPedido(
      s.email,
      pedido,
      roteiro ? { roteiro: roteiro as unknown as Record<string, unknown> } : null,
    );
    return r;
  } catch (e) {
    await registrar(s.email, "pedido_falhou", `video_${tipo}`, { motivo: mensagemDe(e) });
    return { erros: [mensagemDe(e)] };
  }
}

export async function acaoGerarVideo(_: Estado, form: FormData): Promise<Estado> {
  const r = await prepararVideo(form, "gerar");
  if (!r.id) return { erros: r.erros };
  revalidatePath("/", "layout");
  redirect(`/aprovacoes/${r.id}`);
}

export async function acaoEditarVideo(_: Estado, form: FormData): Promise<Estado> {
  const r = await prepararVideo(form, "editar");
  if (!r.id) return { erros: r.erros };
  revalidatePath("/", "layout");
  redirect(`/aprovacoes/${r.id}`);
}

export async function acaoArquivarVideo(form: FormData) {
  const s = await exigirSessao();
  await arquivarVideo(s.email, texto(form.get("id")), form.get("arquivar") === "sim");
  revalidatePath("/videos");
}
