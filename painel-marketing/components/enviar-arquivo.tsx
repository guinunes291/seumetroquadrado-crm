"use client";
import { useState } from "react";
import { upload } from "@vercel/blob/client";

// Envia o arquivo direto do navegador para o armazenamento do Painel e guarda o
// endereço num campo escondido do formulário. Nada vai para o Higgsfield aqui.
export function EnviarArquivo({ nome, aceita }: { nome: string; aceita: string }) {
  const [url, setUrl] = useState("");
  const [estado, setEstado] = useState<string | null>(null);

  async function escolher(arquivo: File | undefined) {
    setUrl("");
    if (!arquivo) return setEstado(null);
    if (arquivo.size > 200 * 1024 * 1024) return setEstado("O arquivo passa de 200 MB.");
    setEstado("Enviando... 0%");
    try {
      const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "bin";
      const r = await upload(`entradas/arquivo.${extensao}`, arquivo, {
        access: "public",
        handleUploadUrl: "/api/videos/envio",
        contentType: arquivo.type,
        multipart: arquivo.size > 20 * 1024 * 1024,
        onUploadProgress: (p) => setEstado(`Enviando... ${Math.round(p.percentage)}%`),
      });
      setUrl(r.url);
      setEstado("Arquivo enviado.");
    } catch {
      setEstado("Não consegui enviar. Confira o formato (MP4, JPG, PNG ou WEBP) e tente de novo.");
    }
  }

  return (
    <div className="space-y-1">
      <input
        type="file"
        accept={aceita}
        onChange={(e) => escolher(e.target.files?.[0])}
        className="block w-full text-sm"
      />
      <input type="hidden" name={nome} value={url} />
      {estado && <p className="text-xs text-cinza">{estado}</p>}
    </div>
  );
}
