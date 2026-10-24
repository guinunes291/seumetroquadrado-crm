import { listar } from "@/lib/empreendimentos";
import { agentesDisponiveis } from "@/lib/agentes";
import { VIDEO_CUSTO_MAXIMO_USD } from "@/lib/video";
import { Campo, FormPedido, estiloEntrada } from "@/components/form-pedido";
import { EnviarArquivo } from "@/components/enviar-arquivo";
import { acaoEditarVideo } from "../actions";
import { AvisoConfig, faltaConfigurar } from "../aviso-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function EditarVideo() {
  const emps = await listar();
  const falta = faltaConfigurar();
  return (
    <div className="max-w-3xl space-y-6">
      <section>
        <h1 className="text-2xl">Editar vídeo</h1>
        <p className="mt-1 text-sm text-cinza">
          Envie um vídeo seu (MP4, até 30 segundos) e diga o que mudar: luz do dia, céu, estação,
          estilo, um elemento da cena. O Higgsfield (Seedance 2.5) refaz o vídeo mantendo o
          enquadramento. Corte, legenda e trilha continuam no editor de Reels; aqui é a edição com
          IA. Só é gerado quando você aprovar o pedido, vendo o custo.
        </p>
      </section>
      {falta.length > 0 && <AvisoConfig falta={falta} />}
      <div className="rounded-lg bg-white p-6 ring-1 ring-navy/10">
        <FormPedido
          acao={acaoEditarVideo}
          rotulo="Ver custo e criar pedido"
          enviandoRotulo="Consultando o Roteirista e o custo no Higgsfield..."
        >
          <Campo rotulo="Vídeo para editar" dica="MP4. Acima de 30 segundos, o Higgsfield corta.">
            <EnviarArquivo nome="video_url" aceita="video/mp4" />
          </Campo>
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
            rotulo="O que mudar"
            dica="Ex.: deixar o céu azul com sol de fim de tarde e as luzes da fachada acesas."
          >
            <textarea name="ideia" rows={3} required className={estiloEntrada} />
          </Campo>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo rotulo="Resolução" dica="1080p custa mais.">
              <select name="resolucao" className={estiloEntrada} defaultValue="720p">
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </Campo>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="audio" value="sim" />
              Gerar som novo (sem marcar, o vídeo sai sem som)
            </label>
          </div>
          <fieldset className="rounded-md border border-navy/10 p-4">
            <legend className="px-1 text-sm font-semibold text-navy">Roteirista de vídeo</legend>
            {agentesDisponiveis() ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roteirista" value="sim" defaultChecked />
                Transformar meu pedido em instrução para o Higgsfield (recomendado)
              </label>
            ) : (
              <p className="text-sm text-cinza">
                O Roteirista ainda não tem a chave da Claude configurada; seu pedido vai como está.
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
