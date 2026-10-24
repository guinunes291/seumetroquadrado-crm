import Link from "next/link";
import { notFound } from "next/navigation";
import { lerJob } from "@/lib/jobs";
import { gastaDinheiro, passosDoPedido } from "@/lib/planos";
import type { Estrategia, Variacao } from "@/lib/agentes";
import { dataHora, moeda } from "@/lib/formato";
import { ROTULO_STATUS } from "@/components/status-job";
import { Aprovar, Descartar, Reverter } from "@/components/acoes-job";

export const dynamic = "force-dynamic";

function Caixa({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-6 ring-1 ring-navy/10">
      <h2 className="mb-3 text-base">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function Pedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await lerJob(id);
  if (!job) notFound();
  const s = ROTULO_STATUS[job.status] ?? { texto: job.status, cor: "bg-creme" };
  const ehReversao = job.tipo === "reverter";
  const passos = ehReversao ? [] : passosDoPedido(job.payload);
  const gasta = !ehReversao && gastaDinheiro(job.payload);
  const estrategia = job.proposta?.estrategia as Estrategia | undefined;
  const copy = job.proposta?.copy as { variacoes: Variacao[]; auditor: string } | undefined;
  const aplicado = job.resultado?.aplicado ?? [];
  const rev = job.resultado as { desfeito?: string[]; mantido?: string[] } | null;
  const pendente = job.status === "aguardando_aprovacao" && !job.descartado_em;

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/aprovacoes" className="text-sm text-cinza hover:text-navy">
        ← Aprovações
      </Link>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl">{job.titulo ?? job.tipo}</h1>
          <p className="mt-1 text-xs text-cinza">
            Pedido de {job.criado_por} em {dataHora(job.criado_em)}
            {job.aprovado_por && job.aprovado_em
              ? ` · aprovado por ${job.aprovado_por} em ${dataHora(job.aprovado_em)}`
              : ""}
            {job.descartado_em ? ` · descartado em ${dataHora(job.descartado_em)}` : ""}
          </p>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${s.cor}`}>
          {job.descartado_em ? "Descartado" : s.texto}
        </span>
      </section>

      {passos.length > 0 && (
        <Caixa titulo="O que vai acontecer na Meta">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {passos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          {gasta && (
            <p className="mt-4 rounded-md bg-alerta/10 p-3 text-sm font-semibold text-alerta">
              Este pedido faz a conta gastar mais a partir do momento em que for aprovado.
            </p>
          )}
        </Caixa>
      )}

      {estrategia && (
        <Caixa titulo="Estrategista de Performance">
          <p className="text-sm">{estrategia.leitura}</p>
          <p className="mt-3 text-sm">
            <strong>Sugestão:</strong> {moeda(estrategia.orcamento_diario_sugerido)} por dia
            {estrategia.raio_km_sugerido ? `, raio de ${estrategia.raio_km_sugerido} km` : ""}.{" "}
            {estrategia.justificativa}
          </p>
          {estrategia.riscos.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-cinza">
              {estrategia.riscos.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-cinza">
            A sugestão é só leitura. O pedido usa o orçamento que você digitou; para mudar, descarte
            e crie outro.
          </p>
        </Caixa>
      )}

      {copy && (
        <Caixa titulo="Copywriter (revisado pelo Auditor de Compliance)">
          <p className="mb-3 text-xs text-cinza">
            {copy.auditor} Os textos não entram na campanha sozinhos: a cópia usa os anúncios do
            modelo. Use estes textos quando trocar o criativo.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {copy.variacoes.map((v, i) => (
              <div key={i} className="rounded-md border border-navy/10 p-4 text-sm">
                <p className="font-semibold text-navy">{v.titulo}</p>
                <p className="mt-2 whitespace-pre-line">{v.texto_principal}</p>
                <p className="mt-2 text-xs text-cinza">{v.descricao}</p>
                {v.temPreco && (
                  <p className="mt-3 text-xs font-semibold text-alerta">
                    Cita valor: confira com a tabela oficial do empreendimento e a data dela antes
                    de usar.
                  </p>
                )}
                {v.problemas.map((p) => (
                  <p key={p.regra + p.trecho} className="mt-2 text-xs text-alerta">
                    {p.regra}: “{p.trecho}”
                  </p>
                ))}
              </div>
            ))}
          </div>
        </Caixa>
      )}

      {(aplicado.length > 0 || job.erro) && (
        <Caixa titulo="O que já foi aplicado">
          {aplicado.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 font-mono text-xs">
              {aplicado.map((a, i) => (
                <li key={i}>
                  {a.acao} · {a.id}
                </li>
              ))}
            </ul>
          )}
          {job.erro && (
            <p className="mt-3 rounded-md bg-alerta/10 p-3 text-sm text-alerta">{job.erro}</p>
          )}
          {job.erro && (
            <p className="mt-2 text-xs text-cinza">
              O Painel não tenta de novo sozinho, porque a Meta pode ter aplicado parte da mudança.
              Confira no Gerenciador e, se precisar, use Reverter.
            </p>
          )}
        </Caixa>
      )}

      {ehReversao && rev && (
        <Caixa titulo="Reversão">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {[...(rev.desfeito ?? []), ...(rev.mantido ?? [])].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {job.reverte_job_id && (
            <Link
              href={`/aprovacoes/${job.reverte_job_id}`}
              className="mt-3 inline-block text-sm underline"
            >
              Ver o pedido original
            </Link>
          )}
        </Caixa>
      )}

      {pendente && (
        <Caixa titulo="Sua decisão">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Aprovar id={job.id} gasta={gasta} />
            <Descartar id={job.id} />
          </div>
        </Caixa>
      )}

      {!ehReversao && (job.status === "concluido" || job.status === "erro") && (
        <Caixa titulo="Desfazer">
          <Reverter id={job.id} />
        </Caixa>
      )}
    </div>
  );
}
