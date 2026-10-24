import { campanhasDaConta, type CampanhaMeta } from "@/lib/jobs";
import { listar } from "@/lib/empreendimentos";
import { ErroMeta } from "@/lib/meta";
import { agentesDisponiveis } from "@/lib/agentes";
import { ORCAMENTO_DIARIO_MAXIMO } from "@/lib/planos";
import { moeda } from "@/lib/formato";
import { Campo, FormPedido, estiloEntrada } from "@/components/form-pedido";
import { AvisoMeta } from "@/components/sem-token";
import { acaoNovaCampanha } from "../../pedidos/actions";

export const dynamic = "force-dynamic";

export default async function NovaCampanha() {
  let campanhas: CampanhaMeta[] = [];
  let erro: string | null = null;
  try {
    campanhas = (await campanhasDaConta()).filter((c) => c.objective === "OUTCOME_LEADS");
  } catch (e) {
    erro = e instanceof ErroMeta ? e.traduzido : "Erro inesperado ao ler a Meta.";
  }
  const emps = await listar();

  return (
    <div className="max-w-3xl space-y-6">
      <section>
        <h1 className="text-2xl">Nova campanha</h1>
        <p className="mt-1 text-sm text-cinza">
          A campanha nova nasce copiando uma que já existe: mesmos anúncios, mesmo formulário ou
          WhatsApp, mesma segmentação. Você troca nome, orçamento e, se quiser, a localização. Ela
          sobe <strong>pausada</strong> e sem categoria especial.
        </p>
      </section>
      {erro ? (
        <AvisoMeta mensagem={erro} />
      ) : (
        <div className="rounded-lg bg-white p-6 ring-1 ring-navy/10">
          <FormPedido
            acao={acaoNovaCampanha}
            rotulo="Criar pedido"
            enviandoRotulo="Lendo a Meta e consultando os agentes..."
          >
            <Campo
              rotulo="Campanha modelo"
              dica="Só campanhas de cadastro (leads), ativas ou pausadas."
            >
              <select name="modelo" required className={estiloEntrada} defaultValue="">
                <option value="" disabled>
                  Escolha...
                </option>
                {campanhas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.effective_status === "ACTIVE" ? "(no ar)" : "(pausada)"}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Nome da campanha nova">
                <input
                  name="nome"
                  required
                  className={estiloEntrada}
                  placeholder="Ex.: Elev Saúde | Leads | Nov"
                />
              </Campo>
              <Campo rotulo="Empreendimento">
                <select name="empreendimento" className={estiloEntrada} defaultValue="">
                  <option value="">Não ligar agora</option>
                  {emps.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo
              rotulo="Orçamento diário total (R$)"
              dica={`Mínimo R$ 10, teto do Painel ${moeda(ORCAMENTO_DIARIO_MAXIMO)} por dia.`}
            >
              <input
                name="orcamento"
                required
                inputMode="decimal"
                className={estiloEntrada}
                placeholder="50"
              />
            </Campo>
            <fieldset className="rounded-md border border-navy/10 p-4">
              <legend className="px-1 text-sm font-semibold text-navy">
                Localização (opcional)
              </legend>
              <p className="mb-3 text-xs text-cinza">
                Deixe em branco para manter a do modelo. Para trocar, no Google Maps clique com o
                botão direito no endereço do empreendimento e copie os números (ex.: -23.6123,
                -46.6350).
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <Campo rotulo="Latitude, longitude">
                  <input
                    name="coordenadas"
                    className={estiloEntrada}
                    placeholder="-23.6123, -46.6350"
                  />
                </Campo>
                <Campo rotulo="Raio (km)">
                  <input
                    name="raio"
                    inputMode="decimal"
                    className={estiloEntrada}
                    placeholder="5"
                  />
                </Campo>
              </div>
            </fieldset>
            <fieldset className="rounded-md border border-navy/10 p-4">
              <legend className="px-1 text-sm font-semibold text-navy">Agentes</legend>
              {agentesDisponiveis() ? (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="agentes" value="sim" defaultChecked />
                    Pedir a leitura do Estrategista e 3 textos do Copywriter (revisados pelo
                    Auditor)
                  </label>
                  <Campo
                    rotulo="Briefing para os agentes"
                    dica="O que você quer desta campanha, público, diferencial do empreendimento."
                  >
                    <textarea name="briefing" rows={3} className={estiloEntrada} />
                  </Campo>
                </>
              ) : (
                <p className="text-sm text-cinza">
                  Os agentes ainda não têm a chave da Claude configurada.
                </p>
              )}
            </fieldset>
          </FormPedido>
        </div>
      )}
    </div>
  );
}
