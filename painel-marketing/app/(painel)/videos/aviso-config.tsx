import { higgsfieldConfigurado } from "@/lib/higgsfield";
import { armazenamentoConfigurado } from "@/lib/videos";

// O que falta configurar na Vercel para os vídeos funcionarem. Só diz o nome
// das variáveis; nenhum valor aparece na tela.
export function faltaConfigurar(): string[] {
  const falta: string[] = [];
  if (!higgsfieldConfigurado())
    falta.push(
      "Chave da API do Higgsfield (HIGGSFIELD_API_KEY_ID e HIGGSFIELD_API_KEY_SECRET). Ela é criada em console.higgsfield.ai, e a API usa um saldo próprio, separado do plano do site.",
    );
  if (!armazenamentoConfigurado())
    falta.push(
      "Armazenamento dos vídeos (Vercel Blob ligado ao projeto, que cria BLOB_READ_WRITE_TOKEN sozinho).",
    );
  return falta;
}

export function AvisoConfig({ falta }: { falta: string[] }) {
  return (
    <div className="rounded-lg bg-white p-5 text-sm ring-1 ring-alerta/30">
      <p className="font-semibold text-alerta">Os vídeos ainda não podem ser gerados.</p>
      <p className="mt-1 text-cinza">Falta configurar na Vercel:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-cinza">
        {falta.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
