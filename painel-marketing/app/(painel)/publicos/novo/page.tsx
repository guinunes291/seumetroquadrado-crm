import { publicosDaConta, type PublicoMeta } from "@/lib/jobs";
import { listar } from "@/lib/empreendimentos";
import { ErroMeta } from "@/lib/meta";
import { sql } from "@/lib/db";
import { numero } from "@/lib/formato";
import { Campo, FormPedido, estiloEntrada } from "@/components/form-pedido";
import { AvisoMeta } from "@/components/sem-token";
import { acaoPublico } from "../../pedidos/actions";

export const dynamic = "force-dynamic";

export default async function NovoPublico() {
  let publicos: PublicoMeta[] = [];
  let erro: string | null = null;
  try {
    publicos = await publicosDaConta();
  } catch (e) {
    erro = e instanceof ErroMeta ? e.traduzido : "Erro inesperado ao ler a Meta.";
  }
  const emps = await listar();
  const contagem = await sql()<{ fonte: string; n: number }[]>`
    select fonte, count(distinct hash_telefone)::int n from v_publico_telefones group by 1`;
  const n = (f: string) => contagem.find((x) => x.fonte === f)?.n ?? 0;

  return (
    <div className="max-w-4xl space-y-6">
      <section>
        <h1 className="text-2xl">Criar público</h1>
        <p className="mt-1 text-sm text-cinza">
          Públicos não gastam nada sozinhos e nunca são apagados pelo Painel. Telefones de teste
          (551195555...) ficam fora, e os telefones saem daqui já embaralhados (sha256), como a Meta
          pede.
        </p>
      </section>
      {erro && <AvisoMeta mensagem={erro} />}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg bg-white p-6 ring-1 ring-navy/10">
          <h2 className="text-base">Lista de clientes do CRM</h2>
          <p className="mb-4 mt-1 text-xs text-cinza">
            Hoje: {numero(n("lead"))} leads com telefone válido e {numero(n("comprador"))}{" "}
            compradores ligados a um lead.
          </p>
          <FormPedido acao={acaoPublico} rotulo="Criar pedido">
            <input type="hidden" name="tipo" value="lista" />
            <Campo rotulo="Nome do público">
              <input
                name="nome"
                required
                className={estiloEntrada}
                placeholder="CRM | Leads Elev Saúde | out/26"
              />
            </Campo>
            <Campo rotulo="Quem entra">
              <select name="fonte" className={estiloEntrada} defaultValue="lead">
                <option value="lead">Leads</option>
                <option value="comprador">Compradores</option>
                <option value="todos">Leads e compradores</option>
              </select>
            </Campo>
            <Campo rotulo="Empreendimento" dica="Todos usa a base inteira.">
              <select name="empreendimento" className={estiloEntrada} defaultValue="">
                <option value="">Todos</option>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </FormPedido>
        </section>
        <section className="rounded-lg bg-white p-6 ring-1 ring-navy/10">
          <h2 className="text-base">Semelhante (lookalike)</h2>
          <p className="mb-4 mt-1 text-xs text-cinza">
            Pessoas parecidas com um público que já existe. 1% é o mais parecido; 10% é o mais
            amplo.
          </p>
          <FormPedido acao={acaoPublico} rotulo="Criar pedido">
            <input type="hidden" name="tipo" value="semelhante" />
            <Campo rotulo="Público de origem">
              <select name="origem" required className={estiloEntrada} defaultValue="">
                <option value="" disabled>
                  Escolha...
                </option>
                {publicos
                  .filter((p) => p.subtype !== "LOOKALIKE")
                  .map((p) => (
                    <option key={p.id} value={`${p.id}|${p.name}`}>
                      {p.name}
                      {p.approximate_count_lower_bound && p.approximate_count_lower_bound > 0
                        ? ` (${numero(p.approximate_count_lower_bound)}+)`
                        : ""}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo rotulo="Nome do público">
              <input
                name="nome"
                required
                className={estiloEntrada}
                placeholder="Semelhante 1% | Compradores"
              />
            </Campo>
            <Campo rotulo="Percentual do Brasil">
              <select name="percentual" className={estiloEntrada} defaultValue="1">
                {[1, 2, 3, 5, 10].map((x) => (
                  <option key={x} value={x}>
                    {x}%
                  </option>
                ))}
              </select>
            </Campo>
          </FormPedido>
        </section>
      </div>
    </div>
  );
}
