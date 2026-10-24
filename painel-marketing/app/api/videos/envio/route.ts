import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { sessaoAtual } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

// Envio direto do navegador para o Blob (vídeo para editar ou imagem de partida).
// Esta rota só entrega uma autorização curta, e só para quem está logado no
// Painel; o arquivo não passa pelo servidor. O token do Blob nunca sai daqui.
export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return Response.json({ error: "Entre no Painel de novo." }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const r = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (caminho) => {
        if (!caminho.startsWith("entradas/")) throw new Error("caminho inválido");
        await registrar(s.email, "arquivo_enviado", caminho, {});
        return {
          allowedContentTypes: ["video/mp4", "image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(r);
  } catch {
    return Response.json({ error: "Não consegui autorizar o envio." }, { status: 400 });
  }
}
