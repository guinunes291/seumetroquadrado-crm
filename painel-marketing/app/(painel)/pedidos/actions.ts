"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { ErroMeta, graphObjeto } from "@/lib/meta";
import {
  aprovarJob,
  conjuntosDaCampanha,
  criarPedido,
  descartarJob,
  hashesDoPublico,
  reverterJob,
} from "@/lib/jobs";
import { listar } from "@/lib/empreendimentos";
import { diagnostico, periodos } from "@/lib/diagnostico";
import {
  agentesDisponiveis,
  AgenteRecusou,
  copywriterComAuditoria,
  estrategista,
} from "@/lib/agentes";
import type { Ajuste, Local, Nivel, PublicoLista, PublicoSemelhante } from "@/lib/planos";

export type Estado = { erros: string[] } | null;

function numeroBr(v: FormDataEntryValue | null): number {
  const t = String(v ?? "")
    .trim()
    .replace(/\s|R\$/g, "");
  // "1.234,56" ou "1234.56"
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function mensagemDe(e: unknown): string {
  if (e instanceof ErroMeta) return e.traduzido;
  if (e instanceof AgenteRecusou)
    return "Um agente recusou o pedido; envie sem a proposta dos agentes.";
  return "Não consegui concluir agora. Nada foi alterado na Meta.";
}

// Nova campanha ---------------------------------------------------------------

export async function acaoNovaCampanha(_: Estado, form: FormData): Promise<Estado> {
  const s = await exigirSessao();
  let id: string | undefined;
  try {
    const modeloId = texto(form.get("modelo"));
    if (!/^\d+$/.test(modeloId)) return { erros: ["Escolha a campanha modelo."] };
    const modelo = await graphObjeto<{ id: string; name: string; daily_budget?: string }>(
      modeloId,
      "id,name,daily_budget",
    );
    const conjuntos = (await conjuntosDaCampanha(modeloId)).map((c) => ({
      id: c.id,
      nome: c.name,
    }));

    const empId = Number(form.get("empreendimento")) || null;
    const emps = await listar();
    const emp = emps.find((e) => e.id === empId) ?? null;

    let local: Local | null = null;
    const coords = texto(form.get("coordenadas"));
    if (coords) {
      const [lat, lng] = coords.split(",").map((x) => Number(x.trim()));
      local = { lat, lng, raioKm: numeroBr(form.get("raio")) || 5 };
    }

    const pedido = {
      tipo: "nova_campanha" as const,
      modelo: {
        id: modelo.id,
        nome: modelo.name,
        orcamentoNa: modelo.daily_budget ? ("campanha" as const) : ("conjuntos" as const),
      },
      conjuntos,
      nome: texto(form.get("nome")),
      empreendimentoId: empId,
      orcamentoDiario: numeroBr(form.get("orcamento")),
      local,
    };

    let proposta: Record<string, unknown> | null = null;
    if (form.get("agentes") === "sim" && agentesDisponiveis()) {
      const lista = await periodos();
      const d = lista[0] ? await diagnostico(lista[0]) : null;
      const linha = d?.linhas.find((l) => l.empreendimentoId === empId) ?? null;
      const briefing = texto(form.get("briefing"));
      const [estrategia, copy] = await Promise.all([
        estrategista({
          empreendimento: emp?.nome ?? "não informado",
          objetivoDoPedido: briefing || "campanha nova a partir do modelo escolhido",
          orcamentoPedido: pedido.orcamentoDiario,
          modelo: modelo.name,
          diagnostico: linha ? { ...linha, periodo: d?.periodo } : null,
        }),
        copywriterComAuditoria({ empreendimento: emp?.nome ?? "não informado", briefing }),
      ]);
      proposta = { estrategia, copy };
    }

    const r = await criarPedido(s.email, pedido, proposta);
    if (r.erros.length) return { erros: r.erros };
    id = r.id;
  } catch (e) {
    await registrar(s.email, "pedido_falhou", "nova_campanha", { motivo: mensagemDe(e) });
    return { erros: [mensagemDe(e)] };
  }
  revalidatePath("/", "layout");
  redirect(`/aprovacoes/${id}`);
}

// Ajustar campanha ------------------------------------------------------------

export async function acaoAjustar(_: Estado, form: FormData): Promise<Estado> {
  const s = await exigirSessao();
  let id: string | undefined;
  try {
    const [nivelBruto, alvoId] = texto(form.get("alvo")).split(":");
    const nivel: Nivel = nivelBruto === "adset" ? "adset" : "campaign";
    if (!/^\d+$/.test(alvoId ?? "")) return { erros: ["Escolha o que ajustar."] };
    const atual = await graphObjeto<{
      id: string;
      name: string;
      status: string;
      daily_budget?: string;
    }>(alvoId, "id,name,status,daily_budget");
    const status = texto(form.get("status"));
    const orc = texto(form.get("orcamento"));
    const nome = texto(form.get("novo_nome"));
    const pedido: Ajuste = {
      tipo: "ajustar",
      alvo: { nivel, id: atual.id, nome: atual.name },
      antes: {
        status: atual.status,
        orcamentoDiario: atual.daily_budget ? Number(atual.daily_budget) / 100 : null,
        nome: atual.name,
      },
      depois: {
        ...(status === "ACTIVE" || status === "PAUSED" ? { status } : {}),
        ...(orc ? { orcamentoDiario: numeroBr(orc) } : {}),
        ...(nome ? { nome } : {}),
      },
    };
    const r = await criarPedido(s.email, pedido, null);
    if (r.erros.length) return { erros: r.erros };
    id = r.id;
  } catch (e) {
    await registrar(s.email, "pedido_falhou", "ajustar", { motivo: mensagemDe(e) });
    return { erros: [mensagemDe(e)] };
  }
  revalidatePath("/", "layout");
  redirect(`/aprovacoes/${id}`);
}

// Criar público ---------------------------------------------------------------

export async function acaoPublico(_: Estado, form: FormData): Promise<Estado> {
  const s = await exigirSessao();
  let id: string | undefined;
  try {
    const tipo = texto(form.get("tipo"));
    const nome = texto(form.get("nome"));
    if (!nome) return { erros: ["Dê um nome para o público."] };
    let pedido: PublicoLista | PublicoSemelhante;
    if (tipo === "semelhante") {
      const [origemId, ...resto] = texto(form.get("origem")).split("|");
      if (!/^\d+$/.test(origemId)) return { erros: ["Escolha o público de origem."] };
      pedido = {
        tipo: "publico_semelhante",
        nome,
        origem: { id: origemId, nome: resto.join("|") },
        percentual: numeroBr(form.get("percentual")),
      };
    } else {
      const fonteBruta = texto(form.get("fonte"));
      const fonte = fonteBruta === "comprador" || fonteBruta === "todos" ? fonteBruta : "lead";
      const empId = Number(form.get("empreendimento")) || null;
      const emp = (await listar()).find((e) => e.id === empId) ?? null;
      const quantidade = (await hashesDoPublico(fonte, empId)).length;
      pedido = {
        tipo: "publico_lista",
        nome,
        fonte,
        empreendimentoId: empId,
        empreendimentoNome: emp?.nome ?? null,
        quantidade,
      };
    }
    const r = await criarPedido(s.email, pedido, null);
    if (r.erros.length) return { erros: r.erros };
    id = r.id;
  } catch (e) {
    await registrar(s.email, "pedido_falhou", "publico", { motivo: mensagemDe(e) });
    return { erros: [mensagemDe(e)] };
  }
  revalidatePath("/", "layout");
  redirect(`/aprovacoes/${id}`);
}

// Aprovar, descartar, reverter ------------------------------------------------

export async function acaoAprovar(_: string | null, form: FormData): Promise<string | null> {
  const s = await exigirSessao();
  if (form.get("confirmo") !== "sim") return "Marque a confirmação antes de aprovar.";
  const r = await aprovarJob(s.email, texto(form.get("id")));
  revalidatePath("/", "layout");
  return r.mensagem;
}

export async function acaoDescartar(form: FormData) {
  const s = await exigirSessao();
  await descartarJob(s.email, texto(form.get("id")));
  revalidatePath("/", "layout");
  redirect("/aprovacoes");
}

export async function acaoReverter(_: string | null, form: FormData): Promise<string | null> {
  const s = await exigirSessao();
  if (form.get("confirmo") !== "sim") return "Marque a confirmação antes de reverter.";
  const r = await reverterJob(s.email, texto(form.get("id")));
  revalidatePath("/", "layout");
  return r.mensagem;
}
