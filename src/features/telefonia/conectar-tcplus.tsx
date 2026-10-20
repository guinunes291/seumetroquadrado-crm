// "Conectar meu 3C Plus": o self-service do token do agente. No 3C Plus, toda
// ação de agente (login, discagem manual, qualificação) exige o token do
// PRÓPRIO agente — o gestor não consegue pegá-lo pela API (GET /users não
// devolve api_token). Então quem cola o token é o corretor, aqui, uma vez.
// A edge function tcplus-config confere o token no 3C Plus (GET /me) ANTES
// de gravar e preenche o ID do agente sozinha — token errado é recusado na
// hora, não na primeira ligação. O token fica em telefonia_agentes.api_token,
// coluna que o app não consegue ler de volta (privilégio por coluna): a tela
// mostra só "atualizado há X". A campanha é a única do time (gestão).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Headset, LinkSimple } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { formatRelativeTime } from "@/lib/interacoes";
import { buscarMeuAgenteTcplus } from "./telefonia-3cplus-client";
import { conectarTcplus } from "./tcplus-config-client";

export const QUERY_MEU_AGENTE_TCPLUS = "meu-agente-tcplus";

export function ConectarTcplus() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [trocando, setTrocando] = useState(false);

  const agenteQ = useQuery({
    queryKey: [QUERY_MEU_AGENTE_TCPLUS, user?.id],
    enabled: !!user,
    queryFn: () => buscarMeuAgenteTcplus(user!.id),
  });
  const agente = agenteQ.data ?? null;
  const conectado = !!agente?.token_atualizado_em;

  const salvar = useMutation({
    mutationFn: async () => {
      const valor = token.trim();
      // Tokens do 3C Plus têm 60 caracteres; um JWT de 12h é bem maior. Um
      // valor curto é quase certamente um paste errado (id, nome…).
      if (valor.length < 20)
        throw new Error("Esse não parece um token do 3C Plus. Copie o token de API completo.");
      return conectarTcplus(valor);
    },
    onSuccess: (r) => {
      setToken("");
      setTrocando(false);
      const quem = r.agente.nome ?? r.agente.email ?? "seu agente";
      toast.success(`3C Plus conectado como ${quem} — o botão Ligar já disca pelo seu agente.`);
      if (!r.email_confere) {
        toast.warning(
          `O e-mail desse usuário no 3C Plus (${r.agente.email ?? "sem e-mail"}) é diferente do seu no CRM. Se o token não for seu, troque agora.`,
        );
      }
      qc.invalidateQueries({ queryKey: [QUERY_MEU_AGENTE_TCPLUS] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;

  return (
    <Card className={conectado ? "" : "border-warning/40 bg-warning/5"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <Headset className="h-4 w-4 text-primary" /> Meu 3C Plus
          {conectado ? (
            <Badge variant="secondary" className="gap-1">
              <Check className="h-3 w-3" /> conectado
            </Badge>
          ) : (
            <Badge variant="destructive">não conectado</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Agente:{" "}
            <strong className="text-foreground">
              {agente?.agent_id ? `#${agente.agent_id}` : "—"}
            </strong>
          </span>
          <span>
            Campanha do discador:{" "}
            <strong className="text-foreground">
              {agente?.campaign_id ? `#${agente.campaign_id}` : "a do time"}
            </strong>
          </span>
          <span>
            Token:{" "}
            <strong className="text-foreground">
              {agente?.token_atualizado_em
                ? `atualizado ${formatRelativeTime(agente.token_atualizado_em)}`
                : "—"}
            </strong>
          </span>
        </div>
        {conectado && (
          <p className="text-xs text-muted-foreground">
            Para falar com o cliente, deixe a <strong>tela de agente do 3C Plus aberta</strong> numa
            aba (com o fone/headset e o webphone ativos) — é nela que a ligação toca.
          </p>
        )}
        {conectado && !trocando ? (
          <Button size="sm" variant="outline" onClick={() => setTrocando(true)}>
            <LinkSimple className="h-3.5 w-3.5 mr-1.5" /> Trocar meu token
          </Button>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="tcplus-token" className="text-xs">
              {conectado ? "Novo token de agente" : "Cole seu token de agente do 3C Plus"}
            </Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="tcplus-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Token de API (Perfil → API no 3C Plus)"
                className="h-8 min-w-[240px] flex-1"
              />
              <Button
                size="sm"
                disabled={!token.trim() || salvar.isPending}
                onClick={() => salvar.mutate()}
              >
                <LinkSimple className="h-3.5 w-3.5 mr-1.5" />
                {salvar.isPending ? "Conferindo no 3C Plus…" : conectado ? "Trocar" : "Conectar"}
              </Button>
              {conectado && (
                <Button size="sm" variant="ghost" onClick={() => setTrocando(false)}>
                  Cancelar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              O token é do <strong>seu</strong> usuário no 3C Plus (não do gestor) e fica guardado
              sem poder ser lido de volta pelo CRM — só o discador o usa, em seu nome.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
