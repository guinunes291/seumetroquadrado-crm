import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { INTENT_BADGE } from "@/lib/status-tones";
import {
  getGoogleCalendarStatus,
  disconnectGoogleCalendar,
  setEspelhoGlobal,
} from "@/lib/google-calendar.functions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CalendarClock, Unplug } from "lucide-react";

/**
 * Card "Google Agenda": mostra o estado da conexão do usuário atual e permite
 * conectar/desconectar. Usado em /meu-perfil (todos) e /configuracoes (admin).
 */
export function GoogleCalendarCard() {
  const qc = useQueryClient();
  const statusQ = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => getGoogleCalendarStatus(),
    staleTime: 60_000,
  });

  // Feedback pós-callback (?google=conectado|erro na URL).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("google");
    if (!r) return;
    if (r === "conectado") toast.success("Google Agenda conectado! Novos agendamentos serão sincronizados.");
    else toast.error("Não foi possível conectar o Google Agenda", { description: params.get("motivo") ?? undefined });
    params.delete("google");
    params.delete("motivo");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
  }, [qc]);

  const disconnect = useMutation({
    mutationFn: () => disconnectGoogleCalendar(),
    onSuccess: () => {
      toast.success("Google Agenda desconectado");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const espelho = useMutation({
    mutationFn: (ativo: boolean) => setEspelhoGlobal({ data: { ativo } }),
    onSuccess: (r, ativo) => {
      toast.success(
        ativo
          ? `Espelho ligado — ${r.processados} agendamento(s) futuros enviados para sua agenda`
          : "Espelho desligado — novos agendamentos da equipe não entram mais na sua agenda",
      );
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = statusQ.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-info" /> Google Agenda
          {s?.connected && <Badge className={INTENT_BADGE.success}>Conectado</Badge>}
          {s && !s.connected && s.configured && (
            <Badge className={INTENT_BADGE.warning}>Não conectado</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {s?.connected
            ? `Visitas e reuniões criadas no CRM aparecem automaticamente na agenda de ${s.email ?? "sua conta Google"}. Cancelamentos também sincronizam.`
            : "Conecte sua conta Google para que visitas e reuniões do CRM entrem sozinhas na sua agenda."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {statusQ.isLoading ? (
          <Skeleton className="h-9 w-44" />
        ) : !s?.configured ? (
          <p className="text-xs text-muted-foreground">
            Integração ainda não habilitada pelo administrador (requer credenciais do Google
            Cloud no servidor).
          </p>
        ) : s.connected ? (
          <div className="space-y-4">
            {s.podeEspelhoGlobal && (
              <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/40 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="espelho-global" className="text-sm font-medium">
                    Agenda completa da equipe
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Receber TODOS os agendamentos dos corretores na minha agenda Google
                    (visão do dono/gestor).
                  </p>
                </div>
                <Switch
                  id="espelho-global"
                  checked={s.espelhoGlobal}
                  disabled={espelho.isPending}
                  onCheckedChange={(v) => espelho.mutate(v)}
                />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              <Unplug className="mr-1 h-4 w-4" /> Desconectar
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => s.authUrl && (window.location.href = s.authUrl)}>
            Conectar conta Google
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
