import Link from "next/link";
import {
  campanhasDaConta,
  conjuntosDaCampanha,
  type CampanhaMeta,
  type ConjuntoMeta,
} from "@/lib/jobs";
import { ErroMeta } from "@/lib/meta";
import { moeda } from "@/lib/formato";
import { Campo, FormPedido, estiloEntrada } from "@/components/form-pedido";
import { AvisoMeta } from "@/components/sem-token";
import { acaoAjustar } from "../../pedidos/actions";

export const dynamic = "force-dynamic";

function orc(v?: string) {
  return v ? `${moeda(Number(v) / 100)}/dia` : "orçamento nos conjuntos";
}

export default async function Ajustar({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  let campanhas: CampanhaMeta[] = [];
  let conjuntos: ConjuntoMeta[] = [];
  let erro: string | null = null;
  try {
    campanhas = await campanhasDaConta();
    if (c && /^\d+$/.test(c)) conjuntos = await conjuntosDaCampanha(c);
  } catch (e) {
    erro = e instanceof ErroMeta ? e.traduzido : "Erro inesperado ao ler a Meta.";
  }
  const escolhida = campanhas.find((x) => x.id === c);

  return (
    <div className="max-w-4xl space-y-6">
      <section>
        <h1 className="text-2xl">Ajustar campanha</h1>
        <p className="mt-1 text-sm text-cinza">
          Pausar, ativar, mudar orçamento ou renomear. Nada é apagado. Antes de aplicar, o Painel
          confere se a campanha continua como estava quando você pediu.
        </p>
      </section>
      {erro && <AvisoMeta mensagem={erro} />}
      {!erro && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
          <section className="rounded-lg bg-white ring-1 ring-navy/10">
            <ul className="divide-y divide-navy/10 text-sm">
              {campanhas.map((x) => (
                <li key={x.id}>
                  <Link
                    href={`/campanhas/ajustar?c=${x.id}`}
                    className={`block px-4 py-3 hover:bg-creme ${x.id === c ? "bg-creme" : ""}`}
                  >
                    <span className="font-medium text-navy">{x.name}</span>
                    <span className="block text-xs text-cinza">
                      {x.effective_status === "ACTIVE" ? "no ar" : "pausada"} ·{" "}
                      {orc(x.daily_budget)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg bg-white p-6 ring-1 ring-navy/10">
            {!escolhida ? (
              <p className="text-sm text-cinza">Escolha uma campanha na lista.</p>
            ) : (
              <FormPedido acao={acaoAjustar} rotulo="Criar pedido de ajuste">
                <Campo rotulo="O que ajustar">
                  <select
                    name="alvo"
                    className={estiloEntrada}
                    defaultValue={`campaign:${escolhida.id}`}
                  >
                    <option value={`campaign:${escolhida.id}`}>
                      Campanha: {escolhida.name} (
                      {escolhida.status === "ACTIVE" ? "ativa" : "pausada"},{" "}
                      {orc(escolhida.daily_budget)})
                    </option>
                    {conjuntos.map((j) => (
                      <option key={j.id} value={`adset:${j.id}`}>
                        Conjunto: {j.name} ({j.status === "ACTIVE" ? "ativo" : "pausado"}
                        {j.daily_budget ? `, ${moeda(Number(j.daily_budget) / 100)}/dia` : ""})
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Status">
                  <select name="status" className={estiloEntrada} defaultValue="">
                    <option value="">Manter</option>
                    <option value="PAUSED">Pausar</option>
                    <option value="ACTIVE">Ativar (passa a gastar)</option>
                  </select>
                </Campo>
                <Campo
                  rotulo="Novo orçamento diário (R$)"
                  dica="Em branco mantém. Só vale onde o orçamento mora: na campanha ou em cada conjunto."
                >
                  <input name="orcamento" inputMode="decimal" className={estiloEntrada} />
                </Campo>
                <Campo rotulo="Novo nome" dica="Em branco mantém.">
                  <input name="novo_nome" className={estiloEntrada} />
                </Campo>
              </FormPedido>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
