import { campanhas, listar, pendentes, type Empreendimento } from "@/lib/empreendimentos";
import { dataCurta, moeda, numero } from "@/lib/formato";
import { acaoDesligarApelido, acaoLigarApelido, acaoLigarCampanha } from "./actions";

export const dynamic = "force-dynamic";

function Escolha({
  lista,
  atual,
  comFora,
}: {
  lista: Empreendimento[];
  atual?: number | null;
  comFora?: boolean;
}) {
  return (
    <select
      name="escolha"
      defaultValue={atual ? String(atual) : ""}
      required
      className="rounded border border-navy/20 bg-white px-2 py-1 text-sm"
    >
      <option value="" disabled>
        Escolha...
      </option>
      {lista.map((e) => (
        <option key={e.id} value={e.id}>
          {e.nome}
        </option>
      ))}
      <option value="novo">+ Novo empreendimento</option>
      {comFora && <option value="fora">Não é de empreendimento</option>}
    </select>
  );
}

export default async function Empreendimentos() {
  const [lista, soltos, camps] = await Promise.all([listar(), pendentes(), campanhas()]);
  const fonte: Record<string, string> = {
    leads: "ficha do lead",
    visitas: "visita",
    vendas: "venda",
  };
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl">Empreendimentos e nomes</h1>
        <p className="mt-1 max-w-3xl text-sm text-cinza">
          O mesmo empreendimento aparece escrito de vários jeitos na ficha do lead, na visita e na
          venda. Ligue cada nome a um empreendimento para o Diagnóstico somar certo. Toda mudança
          fica registrada e pode ser desfeita.
        </p>
      </section>

      <section>
        <h2 className="text-lg">Campanhas da Meta</h2>
        <div className="mt-3 overflow-x-auto rounded-lg bg-white ring-1 ring-navy/10">
          <table className="w-full text-sm">
            <tbody>
              {camps.map((c) => (
                <tr key={c.campaign_id} className="border-t border-navy/10 first:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-cinza">
                      {c.status === "ACTIVE" ? "no ar" : "pausada"} · {moeda(Number(c.gasto ?? 0))}{" "}
                      no período
                      {c.vinculo === "fora" && " · fora do Diagnóstico"}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <form
                      action={acaoLigarCampanha}
                      className="flex flex-wrap items-center justify-end gap-2"
                    >
                      <input type="hidden" name="campanha" value={c.campaign_id} />
                      <Escolha lista={lista} atual={c.empreendimento_id} comFora />
                      <input
                        name="novo"
                        placeholder="nome, se for novo"
                        className="w-40 rounded border border-navy/20 px-2 py-1 text-sm"
                      />
                      <button className="rounded bg-navy px-3 py-1 text-sm text-creme">
                        Salvar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg">Nomes ainda sem empreendimento</h2>
        <p className="mt-1 text-sm text-cinza">
          Os mais frequentes primeiro. Endereço, bairro ou mais de um empreendimento juntos podem
          ficar como estão.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg bg-white ring-1 ring-navy/10">
          <table className="w-full text-sm">
            <tbody>
              {soltos.map((n) => (
                <tr
                  key={`${n.fonte}-${n.nome_bruto}`}
                  className="border-t border-navy/10 first:border-0"
                >
                  <td className="px-4 py-2">
                    <div className="font-medium">{n.nome_bruto}</div>
                    <div className="text-xs text-cinza">
                      {numero(n.ocorrencias)} na {fonte[n.fonte] ?? n.fonte} · último em{" "}
                      {dataCurta(n.ultimo_dia)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <form
                      action={acaoLigarApelido}
                      className="flex flex-wrap items-center justify-end gap-2"
                    >
                      <input type="hidden" name="nome" value={n.nome_bruto} />
                      <Escolha lista={lista} />
                      <input
                        name="novo"
                        placeholder="nome, se for novo"
                        className="w-40 rounded border border-navy/20 px-2 py-1 text-sm"
                      />
                      <button className="rounded bg-navy px-3 py-1 text-sm text-creme">
                        Ligar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg">Grafias já ligadas</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {lista.map((e) => (
            <div key={e.id} className="rounded-lg bg-white p-4 ring-1 ring-navy/10">
              <p className="font-semibold text-navy">{e.nome}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {e.apelidos.map((a) => (
                  <li key={a}>
                    <form
                      action={acaoDesligarApelido}
                      className="flex items-center gap-1 rounded bg-creme px-2 py-0.5 text-xs"
                    >
                      <input type="hidden" name="apelido" value={a} />
                      {a}
                      <button title="Desligar este nome" className="text-cinza hover:text-alerta">
                        ×
                      </button>
                    </form>
                  </li>
                ))}
                {e.apelidos.length === 0 && <li className="text-xs text-cinza">nenhuma ainda</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
