import Link from "next/link";
import { listarJobs } from "@/lib/jobs";
import { dataHora } from "@/lib/formato";
import { ROTULO_STATUS } from "@/components/status-job";

export const dynamic = "force-dynamic";

export default async function Aprovacoes() {
  const jobs = await listarJobs();
  return (
    <div className="max-w-4xl space-y-6">
      <section>
        <h1 className="text-2xl">Aprovações</h1>
        <p className="mt-1 text-sm text-cinza">
          Tudo que os botões pedem cai aqui primeiro. Nada chega à Meta sem o seu clique em Aprovar.
        </p>
      </section>
      {jobs.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-sm text-cinza ring-1 ring-navy/10">
          Nenhum pedido ainda.
        </p>
      ) : (
        <ul className="divide-y divide-navy/10 rounded-lg bg-white ring-1 ring-navy/10">
          {jobs.map((j) => {
            const s = ROTULO_STATUS[j.status] ?? { texto: j.status, cor: "bg-creme" };
            return (
              <li key={j.id}>
                <Link
                  href={`/aprovacoes/${j.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-creme"
                >
                  <span>
                    <span className="font-medium text-navy">{j.titulo ?? j.tipo}</span>
                    <span className="block text-xs text-cinza">
                      {dataHora(j.criado_em)} · {j.criado_por}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${s.cor}`}>
                    {s.texto}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
