import { listar } from "@/lib/empreendimentos";
import { agentesDisponiveis } from "@/lib/agentes";
import { FORMATOS, VIDEO_CUSTO_MAXIMO_USD, VIDEO_DURACAO_MAXIMA } from "@/lib/video";
import { Campo, FormPedido, estiloEntrada } from "@/components/form-pedido";
import { EnviarArquivo } from "@/components/enviar-arquivo";
import { acaoGerarVideo } from "../actions";
import { AvisoConfig, faltaConfigurar } from "../aviso-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function GerarVideo() {
  const emps = await listar();
  const falta = faltaConfigurar();
  return (
    <div className="max-w-3xl space-y-6">
      <section>
        <h1 className="text-2xl">Gerar vídeo por prompt</h1>
        <p className="mt-1 text-sm text-cinza">
          Descreva o vídeo em português. O Roteirista transforma em prompt para o Higgsfield
          (Seedance 2.5), o Painel confere as regras da SMQ e pede o custo ao Higgsfield. O vídeo só
          é gerado quando você aprovar o pedido, vendo o valor.
        </p>
      </section>
      {falta.length > 0 && <AvisoConfig falta={falta} />}
      <div className="rounded-lg bg-white p-6 ring-1 ring-navy/10">
        <FormPedido
          acao={acaoGerarVideo}
          rotulo="Ver custo e criar pedido"
          enviandoRotulo="Consultando o Roteirista e o custo no Higgsfield..."
          destino="ao Higgsfield"
        >
          <Campo rotulo="Empreendimento">
            <select name="empreendimento" className={estiloEntrada} defaultValue="">
              <option value="">Nenhum em especial</option>
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            rotulo="O que o vídeo deve mostrar"
            dica="Ex.: câmera subindo pela fachada no fim de tarde, depois a piscina com uma família. Sem preço, sem promessa de crédito: o Painel barra."
          >
            <textarea name="ideia" rows={4} required className={estiloEntrada} />
          </Campo>
          <Campo
            rotulo="Imagem de partida (opcional)"
            dica="Render ou foto do empreendimento. Com imagem, o vídeo anima a partir dela e segue o enquadramento dela."
          >
            <EnviarArquivo nome="imagem_url" aceita="image/jpeg,image/png,image/webp" />
          </Campo>
          <div className="grid gap-4 md:grid-cols-3">
            <Campo rotulo="Formato" dica="Sem efeito quando há imagem de partida.">
              <select name="formato" className={estiloEntrada} defaultValue="9:16">
                {FORMATOS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Duração (segundos)" dica={`De 4 a ${VIDEO_DURACAO_MAXIMA}.`}>
              <input
                name="duracao"
                type="number"
                min={4}
                max={VIDEO_DURACAO_MAXIMA}
                defaultValue={5}
                className={estiloEntrada}
              />
            </Campo>
            <Campo rotulo="Resolução" dica="1080p custa mais.">
              <select name="resolucao" className={estiloEntrada} defaultValue="720p">
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="audio" value="sim" defaultChecked />
            Com som ambiente (sem fala nem narração)
          </label>
          <fieldset className="rounded-md border border-navy/10 p-4">
            <legend className="px-1 text-sm font-semibold text-navy">Roteirista de vídeo</legend>
            {agentesDisponiveis() ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roteirista" value="sim" defaultChecked />
                Transformar minha ideia em prompt para o Higgsfield (recomendado)
              </label>
            ) : (
              <p className="text-sm text-cinza">
                O Roteirista ainda não tem a chave da Claude configurada; sua ideia vai como está.
              </p>
            )}
          </fieldset>
          <p className="text-xs text-cinza">
            Teto do Painel: US$ {VIDEO_CUSTO_MAXIMO_USD} por vídeo. Acima disso o pedido é recusado.
          </p>
        </FormPedido>
      </div>
    </div>
  );
}
