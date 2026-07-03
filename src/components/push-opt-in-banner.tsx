import { Bell, BellOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePushSubscription } from "@/lib/push/use-push-subscription";
import { toast } from "sonner";

export function PushOptInCard() {
  const { supported, permission, subscribed, loading, subscribe, unsubscribe, isIosNotInstalled } =
    usePushSubscription();

  const handleSubscribe = async () => {
    try {
      await subscribe();
      toast.success("Notificações ativadas", {
        description: "Você receberá alertas em tempo real.",
      });
    } catch (e) {
      toast.error("Não foi possível ativar", { description: (e as Error).message });
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await unsubscribe();
      toast.success("Notificações desativadas");
    } catch (e) {
      toast.error("Erro", { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Notificações push
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!supported ? (
          <div className="text-sm text-muted-foreground">
            Seu navegador não suporta notificações push. Use Chrome/Edge no Android ou Safari 16.4+ no iOS.
          </div>
        ) : isIosNotInstalled ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 text-amber-700" />
              <div className="space-y-1">
                <div className="font-medium text-amber-900">
                  Para receber notificações no iPhone
                </div>
                <ol className="ml-4 list-decimal space-y-0.5 text-amber-900/80">
                  <li>Toque em <strong>Compartilhar</strong> no Safari</li>
                  <li>Escolha <strong>Adicionar à Tela de Início</strong></li>
                  <li>Abra o app pelo ícone e ative aqui</li>
                </ol>
              </div>
            </div>
          </div>
        ) : permission === "denied" ? (
          <div className="text-sm text-muted-foreground">
            Você bloqueou as notificações. Para reativar, vá nas configurações do navegador para este site e
            permita notificações.
          </div>
        ) : subscribed ? (
          <>
            <div className="text-sm text-muted-foreground">
              Notificações ativas neste aparelho. Você recebe push de novos leads, agendamentos e tarefas.
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" disabled={loading} onClick={handleUnsubscribe}>
                <BellOff className="mr-2 h-4 w-4" /> Desativar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              Receba alertas em tempo real de novos leads atribuídos, tarefas e agendamentos próximos —
              mesmo com o app fechado.
            </div>
            <div className="flex justify-end">
              <Button size="sm" disabled={loading} onClick={handleSubscribe}>
                <Bell className="mr-2 h-4 w-4" /> Ativar notificações
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
