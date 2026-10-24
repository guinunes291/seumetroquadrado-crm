import Link from "next/link";
import { diagnostico, periodos, type LinhaDiagnostico } from "@/lib/diagnostico";
import { custoPor, dataCurta, dataHora, moeda, numero } from "@/lib/formato";
import { BotaoSincronizar } from "@/components/botao-sincronizar";

export const dynamic = "force-dynamic";

function alertas(l: LinhaDiagnostico): string[] {
  const a: string[] = [];
  if (l.leadsMeta >= 10 && l.leadsFunil < l.leadsMeta * 0.5) {
    a.push(
      `A Meta contou ${numero(l.leadsMeta)} leads, mas só ${numero(l.leadsFunil)} chegaram ao funil operacional. Os outros provavelmente vão direto para a roleta do CRM e não passam pelo Marquinhos.`,
    );
  }
  if (l.gasto > 0 && l.leadsMeta === 0)
    a.push("Teve gasto e nenhum resultado contado pela Meta no período.");
  if (l.leadsFunil >= 30 && l.visitas === 0)
    a.push(`${numero(l.leadsFunil)} leads no funil e nenhuma visita agendada no período.`);
  return a;
}

export default async function Diagnostico({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const lista = await periodos();
  const periodo = lista.find((x) => `${x.inicio}_${x.fim}` === p) ?? lista[0] ?? null;
  const d = await diagnostico(periodo);
  const tot = d.linhas.reduce(
    (t, l) => ({
      gasto: t.gasto + l.gasto,
      leadsMeta: t.leadsMeta + l.leadsMeta,
      leadsFunil: t.leadsFunil + l.leadsFunil,
      visitas: t.visitas + l.visitas,
      vendas: t.vendas + l.vendas,
    }),
    { gasto: 0, leadsMeta: 0, leadsFunil: 0, visitas: 0, vendas: 0 },
  );
  const gastoSem = d.campanhasSemEmpreendimento.reduce((s, c) => s + c.gasto, 0);
  const temToken = Boolean(process.env.META_ACCESS_TOKEN);

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Diagnóstico por empreendimento</h1>
          {periodo ? (
            <p className="mt-1 text-sm text-cinza">
              Período {dataCurta(periodo.inicio)} a {dataCurta(periodo.fim)}. Gasto lido da Meta em{" "}
              {dataHora(periodo.capturadoEm)}
              {periodo.fonte === "conector" ? " (retrato inicial, carregado à mão)" : ""}.
            </p>
          ) : (
            <p className="mt-1 text-sm text-cinza">Ainda não há gasto da Meta carregado.</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lista.length > 1 && (
            <form className="text-sm">
              <select
                name="p"
                defaultValue={periodo ? `${periodo.inicio}_${periodo.fim}` : ""}
                className="rounded border border-navy/20 bg-white px-2 py-1"
              >
                {lista.map((x) => (
                  <option key={`${x.inicio}_${x.fim}`} value={`${x.inicio}_${x.fim}`}>
                    {dataCurta(x.inicio)} a {dataCurta(x.fim)}
                  </option>
                ))}
              </select>
              <button className="ml-2 rounded border border-navy/20 px-2 py-1">Ver</button>
            </form>
          )}
          <BotaoSincronizar habilitado={temToken} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          ["Gasto na Meta", moeda(tot.gasto + gastoSem)],
          ["Leads (Meta)", numero(tot.leadsMeta)],
          ["Leads no funil", numero(tot.leadsFunil)],
          ["Visitas agendadas", numero(tot.visitas)],
          ["Vendas", numero(tot.vendas)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg bg-white p-4 ring-1 ring-navy/10">
            <p className="text-xs text-cinza">{rotulo}</p>
            <p className="tabela-num mt-1 font-titulo text-xl font-bold text-navy">{valor}</p>
          </div>
        ))}
      </section>

      <section className="overflow-x-auto rounded-lg bg-white ring-1 ring-navy/10">
        <table className="tabela-num w-full text-sm">
          <thead className="bg-navy/5 text-left text-xs text-cinza">
            <tr>
              <th className="px-4 py-3">Empreendimento</th>
              <th className="px-3 py-3 text-right">Gasto</th>
              <th className="px-3 py-3 text-right">Leads Meta</th>
              <th className="px-3 py-3 text-right">Custo por lead</th>
              <th className="px-3 py-3 text-right">No funil</th>
              <th className="px-3 py-3 text-right">Visitas</th>
              <th className="px-3 py-3 text-right">Custo por visita</th>
              <th className="px-3 py-3 text-right">Vendas</th>
              <th className="px-3 py-3 text-right">Custo por venda</th>
            </tr>
          </thead>
          <tbody>
            {d.linhas.map((l) => {
              const avisos = alertas(l);
              return (
                <tr key={l.empreendimentoId} className="border-t border-navy/10 align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-navy">{l.nome}</div>
                    <div className="text-xs text-cinza">
                      {l.campanhas} campanha{l.campanhas === 1 ? "" : "s"}
                      {l.temAtiva && (
                        <span className="ml-2 rounded bg-ok/10 px-1.5 text-ok">no ar</span>
                      )}
                    </div>
                    {avisos.map((a) => (
                      <p key={a} className="mt-1 max-w-md text-xs text-alerta">
                        {a}
                      </p>
                    ))}
                  </td>
                  <td className="px-3 py-3 text-right">{moeda(l.gasto)}</td>
                  <td className="px-3 py-3 text-right">{numero(l.leadsMeta)}</td>
                  <td className="px-3 py-3 text-right">{custoPor(l.gasto, l.leadsMeta)}</td>
                  <td className="px-3 py-3 text-right">{numero(l.leadsFunil)}</td>
                  <td className="px-3 py-3 text-right">{numero(l.visitas)}</td>
                  <td className="px-3 py-3 text-right">{custoPor(l.gasto, l.visitas)}</td>
                  <td className="px-3 py-3 text-right">{numero(l.vendas)}</td>
                  <td className="px-3 py-3 text-right">{custoPor(l.gasto, l.vendas)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-5 ring-1 ring-navy/10">
          <h2 className="text-base">O que ficou sem empreendimento</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>{numero(d.semVinculo.leads)} leads de anúncio sem empreendimento na ficha</li>
            <li>{numero(d.semVinculo.visitas)} visitas sem empreendimento</li>
            <li>{numero(d.semVinculo.vendas)} vendas sem empreendimento</li>
            <li>
              {moeda(gastoSem)} em {d.campanhasSemEmpreendimento.length} campanha
              {d.campanhasSemEmpreendimento.length === 1 ? "" : "s"} sem empreendimento
            </li>
          </ul>
          <Link
            href="/empreendimentos"
            className="mt-4 inline-block text-sm font-semibold text-aurum-escuro underline"
          >
            Ligar nomes a empreendimentos
          </Link>
        </div>
        <div className="rounded-lg bg-white p-5 text-sm ring-1 ring-navy/10">
          <h2 className="text-base">Como ler estes números</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-cinza">
            <li>
              Leads Meta é o que a Meta contou: formulário ou, em campanha de WhatsApp, conversa
              iniciada.
            </li>
            <li>
              No funil é quem tem ficha no banco operacional vinda de formulário ou WhatsApp, no
              mesmo período.
            </li>
            <li>
              Custo por visita e por venda é uma aproximação por empreendimento: hoje nenhum lead
              guarda a campanha que o trouxe.
            </li>
            <li>Telefones de teste (551195555...) ficam fora de tudo.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
