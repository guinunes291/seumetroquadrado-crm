import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MAX_BYTES = 5 * 1024 * 1024;
// URL assinada de longa duração: o bucket é privado, então guardamos no perfil
// um link assinado que continua válido para exibição em rankings e listas.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

type Props = {
  avatarUrl: string | null;
  nome: string | null;
};

export function AvatarUploadCard({ avatarUrl, nome }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Sessão expirada. Entre novamente.");
      if (!file.type.startsWith("image/")) throw new Error("Envie um arquivo de imagem.");
      if (file.size > MAX_BYTES) throw new Error("A imagem deve ter no máximo 5 MB.");

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
      const path = `${user.id}/perfil-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (signErr) throw signErr;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: signed.signedUrl })
        .eq("id", user.id);
      if (updErr) throw updErr;

      return signed.signedUrl;
    },
    onSuccess: (url) => {
      setPreview(url);
      toast.success("Foto de perfil atualizada!");
      qc.invalidateQueries({ queryKey: ["meu-perfil"] });
      qc.invalidateQueries({ queryKey: ["avatar-obrigatorio"] });
      qc.invalidateQueries({ queryKey: ["corretores"] });
    },
    onError: (e: Error) =>
      toast.error("Não foi possível enviar a foto", { description: e.message }),
  });

  const atual = preview ?? avatarUrl;
  const pendente = !atual;

  return (
    <Card className={pendente ? "border-destructive/50" : undefined}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Foto de perfil
          <span className="text-destructive text-sm">*</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          {atual && <AvatarImage src={atual} alt={`Foto de ${nome ?? "perfil"}`} />}
          <AvatarFallback className="text-lg">
            {(nome ?? "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">
            {pendente ? (
              <span className="flex items-center gap-1.5 text-destructive">
                <Warning className="h-4 w-4 shrink-0" />
                Obrigatório: envie uma foto sua, de rosto e recente.
              </span>
            ) : (
              "Sua foto aparece no ranking, na vitrine e para a gestão."
            )}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload.mutate(file);
            }}
          />
          <Button
            size="sm"
            variant={pendente ? "default" : "outline"}
            loading={upload.isPending}
            onClick={() => inputRef.current?.click()}
            className="gap-2"
          >
            <Camera className="h-4 w-4" />
            {pendente ? "Enviar foto" : "Trocar foto"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
