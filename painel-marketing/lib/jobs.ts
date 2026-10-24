import "server-only";
import { sql } from "./db";
import { registrar } from "./auditoria";
import { ErroMeta, SemResposta, contaAnuncios, graph, graphObjeto, graphPost } from "./meta";
import {
  centavos,
  ehVideo,
  passosDoPedido,
  problemasDoPedido,
  tituloDoPedido,
  type Pedido,
} from "./planos";
import { ErroHiggsfield, cancelarVideo, enviarVideo, estimarCusto } from "./higgsfield";
import { corpoDoVideo, custoSubiu, custoTexto, endpointDoVideo } from "./video";
import { arquivarVideo, gravarEnvio, marcarVideo, registrarVideo } from "./videos";

// Fila de jobs. Todo pedido que mexe na Meta nasce aqui como
// aguardando_aprovacao e só roda depois do clique em Aprovar no Painel.
// Cada passo aplicado fica gravado em resultado.aplicado na hora em que
// acontece: se algo falhar no meio, sabemos exatamente o que já mudou e
// conseguimos reverter, sem repetir nada sozinhos.

export type Aplicado =
  | { acao: "campanha_criada"; id: string }
  | { acao: "conjunto_copiado"; id: string; origem: string }
  | {
      acao: "orcamento";
      nivel: "campaign" | "adset";
      id: string;
      antes: string | null;
      depois: string;
    }
  | { acao: "localizacao"; id: string; antes: unknown }
  | { acao: "ajuste"; id: string; antes: Record<string, string>; depois: Record<string, string> }
  | { acao: "publico_criado"; id: string; enviados?: number }
  // id é o request_id do Higgsfield; video é a linha em marketing.videos.
  | { acao: "video_enviado"; id: string; video: string };

export type Job = {
  id: string;
  tipo: string;
  titulo: string | null;
  status: string;
  agente: string | null;
  payload: Pedido;
  proposta: Record<string, unknown> | null;
  resultado: { aplicado?: Aplicado[]; observacao?: string } | null;
  erro: string | null;
  criado_por: string;
  aprovado_por: string | null;
  aprovado_em: string | null;
  reverte_job_id: string | null;
  descartado_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

export async function criarPedido(
  quem: string,
  pedido: Pedido,
  proposta: Record<string, unknown> | null,
): Promise<{ id?: string; erros: string[] }> {
  const erros = problemasDoPedido(pedido);
  if (erros.length) return { erros };
  const titulo = tituloDoPedido(pedido);
  const [j] = await sql()<{ id: string }[]>`
    insert into jobs (tipo, titulo, status, agente, payload, proposta, criado_por)
    values (${pedido.tipo}, ${titulo}, 'aguardando_aprovacao', ${proposta ? "squad" : null},
      ${sql().json(pedido as never)}, ${proposta ? sql().json(proposta as never) : null}, ${quem})
    returning id`;
  await registrar(quem, "job_criado", j.id, { tipo: pedido.tipo, titulo });
  return { id: j.id, erros: [] };
}

export async function listarJobs(limite = 50): Promise<Job[]> {
  return sql()<Job[]>`
    select * from jobs where descartado_em is null
    order by (status = 'aguardando_aprovacao') desc, criado_em desc limit ${limite}`;
}

export async function contarPendentes(): Promise<number> {
  const [{ n }] = await sql()<{ n: number }[]>`
    select count(*)::int as n from jobs where status = 'aguardando_aprovacao' and descartado_em is null`;
  return n;
}

export async function lerJob(id: string): Promise<Job | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [j] = await sql()<Job[]>`select * from jobs where id = ${id}`;
  return j ?? null;
}

export async function descartarJob(quem: string, id: string) {
  const r = await sql()`
    update jobs set descartado_em = now(), descartado_por = ${quem}, atualizado_em = now()
    where id = ${id} and status = 'aguardando_aprovacao' and descartado_em is null`;
  if (r.count) await registrar(quem, "job_descartado", id, {});
}

async function gravarAplicado(id: string, aplicado: Aplicado[]) {
  await sql()`
    update jobs set resultado = ${sql().json({ aplicado } as never)}, atualizado_em = now()
    where id = ${id}`;
}

// Aprovar = executar. O update condicional garante que dois cliques não rodem
// o mesmo job duas vezes.
export async function aprovarJob(
  quem: string,
  id: string,
): Promise<{ ok: boolean; mensagem: string }> {
  const [job] = await sql()<Job[]>`
    update jobs set status = 'executando', aprovado_por = ${quem}, aprovado_em = now(), atualizado_em = now()
    where id = ${id} and status = 'aguardando_aprovacao' and descartado_em is null
    returning *`;
  if (!job)
    return { ok: false, mensagem: "Este pedido já foi aprovado, descartado ou não existe." };
  await registrar(quem, "job_aprovado", id, {
    titulo: job.titulo,
    passos: passosDoPedido(job.payload),
  });

  const aplicado: Aplicado[] = [];
  try {
    await executar(job, quem, aplicado, () => gravarAplicado(id, aplicado));
    await sql()`
      update jobs set status = 'concluido', resultado = ${sql().json({ aplicado } as never)}, atualizado_em = now()
      where id = ${id}`;
    await registrar(quem, "job_concluido", id, { aplicado });
    return {
      ok: true,
      mensagem: ehVideo(job.payload)
        ? "Enviado ao Higgsfield. O vídeo aparece em Vídeos quando ficar pronto (costuma levar alguns minutos)."
        : "Feito. Tudo o que foi aplicado está listado no pedido.",
    };
  } catch (e) {
    const msg =
      e instanceof ErroMeta || e instanceof ErroHiggsfield
        ? e.traduzido
        : ehVideo(job.payload)
          ? "Erro inesperado ao falar com o Higgsfield. Nada será repetido sozinho."
          : "Erro inesperado ao falar com a Meta. Nada será repetido sozinho.";
    const parcial = aplicado.length
      ? ` Antes do erro, ${aplicado.length} passo${aplicado.length === 1 ? "" : "s"} já tinha${aplicado.length === 1 ? "" : "m"} sido aplicado${aplicado.length === 1 ? "" : "s"}; use Reverter se quiser desfazer.`
      : "";
    await sql()`
      update jobs set status = 'erro', erro = ${msg + parcial},
        resultado = ${sql().json({ aplicado } as never)}, atualizado_em = now()
      where id = ${id}`;
    await registrar(quem, "job_erro", id, {
      erro: msg,
      aplicado,
      incerto: e instanceof SemResposta,
    });
    return { ok: false, mensagem: msg + parcial };
  }
}

async function executar(job: Job, quem: string, aplicado: Aplicado[], salvar: () => Promise<void>) {
  const p = job.payload;
  const passo = async (a: Aplicado) => {
    aplicado.push(a);
    await salvar();
  };

  if (ehVideo(p)) {
    const endpoint = endpointDoVideo(p);
    const corpo = corpoDoVideo(p);
    const agora = await estimarCusto(endpoint, corpo);
    if (custoSubiu(p.custoUsd, agora))
      throw new ErroHiggsfield(
        `O custo estimado subiu de ${custoTexto(p.custoUsd)} para ${custoTexto(agora)} desde o pedido. Nada foi enviado; faça um pedido novo.`,
      );
    const videoId = await registrarVideo(quem, job.id, job.titulo ?? tituloDoPedido(p), p);
    try {
      // A chave de idempotência é o id do pedido: aprovar de novo nunca gera outro vídeo.
      const envio = await enviarVideo(endpoint, corpo, job.id);
      await gravarEnvio(videoId, envio.request_id);
      await passo({ acao: "video_enviado", id: envio.request_id, video: videoId });
    } catch (e) {
      await marcarVideo(
        videoId,
        "falhou",
        e instanceof ErroHiggsfield ? e.traduzido : "Não chegou ao Higgsfield.",
      );
      throw e;
    }
    return;
  }

  const conta = `act_${contaAnuncios()}`;

  if (p.tipo === "nova_campanha") {
    // 1. Campanha nova, sem filhos, a partir do modelo.
    const c = await graphPost<{ copied_campaign_id: string }>(`${p.modelo.id}/copies`, {
      deep_copy: false,
      status_option: "PAUSED",
      rename_options: { rename_strategy: "NO_RENAME" },
    });
    await passo({ acao: "campanha_criada", id: c.copied_campaign_id });
    await graphPost(c.copied_campaign_id, { name: p.nome });

    // 2. Cada conjunto copiado para dentro dela, com anúncios.
    const novos: string[] = [];
    for (const cj of p.conjuntos) {
      const r = await graphPost<{ copied_adset_id: string }>(`${cj.id}/copies`, {
        campaign_id: c.copied_campaign_id,
        deep_copy: true,
        status_option: "PAUSED",
        rename_options: { rename_strategy: "NO_RENAME" },
      });
      novos.push(r.copied_adset_id);
      await passo({ acao: "conjunto_copiado", id: r.copied_adset_id, origem: cj.id });
    }

    // 3. Orçamento.
    if (p.modelo.orcamentoNa === "campanha") {
      await graphPost(c.copied_campaign_id, { daily_budget: centavos(p.orcamentoDiario) });
      await passo({
        acao: "orcamento",
        nivel: "campaign",
        id: c.copied_campaign_id,
        antes: null,
        depois: centavos(p.orcamentoDiario),
      });
    } else {
      const porConjunto = p.orcamentoDiario / novos.length;
      for (const id of novos) {
        await graphPost(id, { daily_budget: centavos(porConjunto) });
        await passo({
          acao: "orcamento",
          nivel: "adset",
          id,
          antes: null,
          depois: centavos(porConjunto),
        });
      }
    }

    // 4. Localização: troca só geo_locations e mantém o resto da segmentação.
    if (p.local) {
      for (const id of novos) {
        const atual = await graphObjeto<{ targeting: Record<string, unknown> }>(id, "targeting");
        const targeting = {
          ...atual.targeting,
          geo_locations: {
            custom_locations: [
              {
                latitude: p.local.lat,
                longitude: p.local.lng,
                radius: p.local.raioKm,
                distance_unit: "kilometer",
              },
            ],
            location_types: ["home", "recent"],
          },
        };
        await graphPost(id, { targeting });
        await passo({ acao: "localizacao", id, antes: atual.targeting });
      }
    }
    return;
  }

  if (p.tipo === "ajustar") {
    // Confere se o objeto continua como estava quando o pedido foi feito.
    const agora = await graphObjeto<{ status: string; daily_budget?: string; name: string }>(
      p.alvo.id,
      "status,daily_budget,name",
    );
    const orcAgora = agora.daily_budget ? Number(agora.daily_budget) / 100 : null;
    if (
      agora.status !== p.antes.status ||
      orcAgora !== p.antes.orcamentoDiario ||
      agora.name !== p.antes.nome
    ) {
      throw new ErroMeta(
        "Este item mudou na Meta depois do pedido (status, orçamento ou nome). Nada foi aplicado; faça um pedido novo.",
      );
    }
    const depois: Record<string, string> = {};
    const antes: Record<string, string> = {};
    if (p.depois.status && p.depois.status !== agora.status) {
      depois.status = p.depois.status;
      antes.status = agora.status;
    }
    if (p.depois.orcamentoDiario !== undefined) {
      depois.daily_budget = centavos(p.depois.orcamentoDiario);
      antes.daily_budget = agora.daily_budget ?? "";
    }
    if (p.depois.nome && p.depois.nome !== agora.name) {
      depois.name = p.depois.nome;
      antes.name = agora.name;
    }
    await graphPost(p.alvo.id, depois);
    await passo({ acao: "ajuste", id: p.alvo.id, antes, depois });
    return;
  }

  if (p.tipo === "publico_lista") {
    const hashes = await hashesDoPublico(p.fonte, p.empreendimentoId);
    const c = await graphPost<{ id: string }>(`${conta}/customaudiences`, {
      name: p.nome,
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
      description: "Criado pelo Painel de Marketing SMQ a partir do CRM (sem telefones de teste).",
    });
    await passo({ acao: "publico_criado", id: c.id });
    let enviados = 0;
    for (let i = 0; i < hashes.length; i += 10_000) {
      const lote = hashes.slice(i, i + 10_000);
      await graphPost(`${c.id}/users`, { payload: { schema: "PHONE_SHA256", data: lote } });
      enviados += lote.length;
      aplicado[aplicado.length - 1] = { acao: "publico_criado", id: c.id, enviados };
      await salvar();
    }
    return;
  }

  if (p.tipo === "publico_semelhante") {
    const c = await graphPost<{ id: string }>(`${conta}/customaudiences`, {
      name: p.nome,
      subtype: "LOOKALIKE",
      origin_audience_id: p.origem.id,
      lookalike_spec: { ratio: p.percentual / 100, country: "BR" },
    });
    await passo({ acao: "publico_criado", id: c.id });
  }
}

export async function hashesDoPublico(
  fonte: "lead" | "comprador" | "todos",
  empreendimentoId: number | null,
): Promise<string[]> {
  const linhas = await sql()<{ hash_telefone: string }[]>`
    select distinct hash_telefone from v_publico_telefones
    where (${fonte} = 'todos' or fonte = ${fonte})
      and (${empreendimentoId}::bigint is null or empreendimento_id = ${empreendimentoId})`;
  return linhas.map((l) => l.hash_telefone);
}

// Reverter desfaz o que foi aplicado, do último passo para o primeiro.
// Nunca apaga: campanha criada é arquivada; ajuste volta ao valor anterior;
// público não é apagado (fica sem uso) e isso é dito na tela.
export async function reverterJob(
  quem: string,
  id: string,
): Promise<{ ok: boolean; mensagem: string }> {
  const [job] = await sql()<Job[]>`
    update jobs set status = 'executando', atualizado_em = now()
    where id = ${id} and status in ('concluido', 'erro') and descartado_em is null
    returning *`;
  if (!job) return { ok: false, mensagem: "Este pedido não pode ser revertido agora." };
  const statusOriginal = job.erro ? "erro" : "concluido";
  const aplicado = [...(job.resultado?.aplicado ?? [])].reverse();
  const desfeito: string[] = [];
  const mantido: string[] = [];
  try {
    for (const a of aplicado) {
      if (a.acao === "campanha_criada") {
        await graphPost(a.id, { status: "ARCHIVED" });
        desfeito.push(`Campanha ${a.id} arquivada.`);
      } else if (a.acao === "ajuste") {
        await graphPost(a.id, a.antes);
        desfeito.push(`Item ${a.id} voltou ao que era antes.`);
      } else if (a.acao === "video_enviado") {
        if (await cancelarVideo(a.id)) {
          await marcarVideo(
            a.video,
            "cancelado",
            "Cancelado na fila. O Higgsfield devolve o valor.",
          );
          desfeito.push(
            "Vídeo cancelado enquanto ainda estava na fila; o Higgsfield devolve o valor.",
          );
        } else {
          await arquivarVideo(quem, a.video, true);
          mantido.push(
            "O vídeo já estava sendo gerado e não dá mais para cancelar (o Higgsfield cobra). Ele foi arquivado na Biblioteca de vídeos; nada é apagado.",
          );
        }
      } else if (a.acao === "publico_criado") {
        mantido.push(
          `Público ${a.id} não foi apagado (regra: nada é apagado). Ele não gasta nada se ninguém usar.`,
        );
      }
      // Conjuntos, orçamento e localização de uma campanha nova somem junto
      // quando ela é arquivada.
    }
    const [rev] = await sql()<{ id: string }[]>`
      insert into jobs (tipo, titulo, status, payload, resultado, criado_por, aprovado_por, aprovado_em, reverte_job_id)
      values ('reverter', ${`Reverter: ${job.titulo ?? job.tipo}`}, 'concluido', '{}'::jsonb,
        ${sql().json({ desfeito, mantido } as never)}, ${quem}, ${quem}, now(), ${id})
      returning id`;
    await sql()`update jobs set status = 'revertido', atualizado_em = now() where id = ${id}`;
    await registrar(quem, "job_revertido", id, { reverte_com: rev.id, desfeito, mantido });
    return { ok: true, mensagem: [...desfeito, ...mantido].join(" ") || "Nada a desfazer." };
  } catch (e) {
    const msg =
      e instanceof ErroMeta || e instanceof ErroHiggsfield
        ? e.traduzido
        : "Erro inesperado ao reverter.";
    await sql()`
      update jobs set status = ${statusOriginal}, erro = ${`Reversão parou: ${msg} Já desfeito: ${desfeito.join(" ") || "nada"}.`},
        atualizado_em = now()
      where id = ${id}`;
    await registrar(quem, "job_reversao_erro", id, { erro: msg, desfeito });
    return { ok: false, mensagem: msg };
  }
}

// Leituras usadas pelos formulários (sempre ao vivo da Meta).
export type CampanhaMeta = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
};
export type ConjuntoMeta = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  daily_budget?: string;
};

export async function campanhasDaConta(): Promise<CampanhaMeta[]> {
  return graph<CampanhaMeta>(`act_${contaAnuncios()}/campaigns`, {
    fields: "id,name,status,effective_status,objective,daily_budget",
    filtering: JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ]),
  });
}

export async function conjuntosDaCampanha(campanhaId: string): Promise<ConjuntoMeta[]> {
  return graph<ConjuntoMeta>(`${campanhaId}/adsets`, {
    fields: "id,name,status,campaign_id,daily_budget",
    filtering: JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ]),
  });
}

export type PublicoMeta = {
  id: string;
  name: string;
  subtype: string;
  approximate_count_lower_bound?: number;
};

export async function publicosDaConta(): Promise<PublicoMeta[]> {
  return graph<PublicoMeta>(`act_${contaAnuncios()}/customaudiences`, {
    fields: "id,name,subtype,approximate_count_lower_bound",
  });
}
