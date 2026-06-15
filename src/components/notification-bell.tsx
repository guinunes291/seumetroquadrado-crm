import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/interacoes";

type Alerta = {
  id: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lida: boolean;
  tipo: string;
  created_at: string;
};

export function NotificationBell() {
  const qc = useQueryClient();

  const { data: alertas = [] } = useQuery({
    queryKey: ["alertas"],
    queryFn: async (): Promise<Alerta[]> => {
      const { data, error } = await supabase
        .from("alertas")
        .select("id, titulo, mensagem, link, lida, tipo, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Alerta[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("alertas-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alertas" },
        () => qc.invalidateQueries({ queryKey: ["alertas"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alertas").update({ lida: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const ids = alertas.filter((a) => !a.lida).map((a) => a.id);
      if (ids.length === 0) return;
      const { error } = await supabase.from("alertas").update({ lida: true }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  const unread = alertas.filter((a) => !a.lida).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-sm">Notificações</div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {alertas.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação por enquanto.
            </div>
          ) : (
            <ul className="divide-y">
              {alertas.map((a) => {
                const content = (
                  <div className="flex gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer">
                    <div
                      className={`mt-1 h-2 w-2 rounded-full shrink-0 ${a.lida ? "bg-transparent" : "bg-primary"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.titulo}</div>
                      {a.mensagem && (
                        <div className="text-xs text-muted-foreground line-clamp-2">{a.mensagem}</div>
                      )}
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {a.tipo}
                        </Badge>
                        <span>{formatRelativeTime(a.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li key={a.id} onClick={() => !a.lida && markRead.mutate(a.id)}>
                    {a.link ? <Link to={a.link}>{content}</Link> : content}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
