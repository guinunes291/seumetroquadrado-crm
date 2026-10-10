// Roleta fechada à noite (migration 20261014120000) nas telas: o aviso para o
// corretor (check-in, Minhas roletas) e para a gestão (Central), e o editor da
// janela em Configurações. A regra mora no banco — aqui só se lê e explica.

import { useState } from "react";
import { FloppyDisk, MoonStars } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { horaCurta, lerJanela, quandoReabre, textoJanela } from "@/lib/roleta-noite";
import { cn } from "@/lib/utils";
import { useAtualizarSetting, useDistribuicaoSettings } from "./queries";

export const ROLETA_NOITE_KEY = ["distribuicao:roleta-noite"] as const;

/** Janela de hoje. Re-lê a cada minuto: o aviso aparece às 22h sem recarregar. */
export function useRoletaJanela() {
  return useQuery({
    queryKey: [...ROLETA_NOITE_KEY],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("roleta_janela_v1");
      if (error) throw error;
      return lerJanela(data);
    },
  });
}

/**
 * Faixa "roleta fechada" — só aparece com a roleta fechada agora.
 * `corretor`: o que muda para quem faz check-in. `gestao`: o que acontece com
 * os leads que chegam.
 */
export function RoletaFechadaAviso({
  publico,
  className,
}: {
  publico: "corretor" | "gestao";
  className?: string;
}) {
  const q = useRoletaJanela();
  const j = q.data;
  if (!j?.ativa || !j.fechada) return null;
  const reabre = quandoReabre(j.reabre_em);

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm",
        className,
      )}
    >
      <MoonStars className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p>
        <strong>Roleta fechada até {reabre}.</strong>{" "}
        {publico === "corretor"
          ? `Nenhum lead é sorteado à noite. O check-in feito agora vale a partir das ${horaCurta(j.fim)}: quem já estiver com check-in entra na primeira rodada da reabertura.`
          : `Os leads do formulário vão para o Marquinhos, e o que chega ao CRM (inclusive o que o Marquinhos qualifica) espera a reabertura — a primeira rodada depois das ${horaCurta(j.fim)} entrega para quem fez check-in. Repasses por SLA e o Escoar estoque também esperam.`}
      </p>
    </div>
  );
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Editor da janela (Central → Configurações). Liga, início e fim salvam juntos. */
export function RoletaNoiteConfig() {
  const settingsQ = useDistribuicaoSettings();
  const salvar = useAtualizarSetting();
  const valor = settingsQ.data?.roleta_noite?.valor as
    { ativa?: unknown; inicio?: unknown; fim?: unknown } | undefined;
  // Mesma leitura tolerante do banco: ausente/ilegível = ligada, 22:00–09:00.
  const atual = {
    ativa: typeof valor?.ativa === "boolean" ? valor.ativa : true,
    inicio: typeof valor?.inicio === "string" && HHMM.test(valor.inicio) ? valor.inicio : "22:00",
    fim: typeof valor?.fim === "string" && HHMM.test(valor.fim) ? valor.fim : "09:00",
  };
  const [inicio, setInicio] = useState<string | null>(null);
  const [fim, setFim] = useState<string | null>(null);
  const vInicio = inicio ?? atual.inicio;
  const vFim = fim ?? atual.fim;
  const mudou = vInicio !== atual.inicio || vFim !== atual.fim;
  const valido = HHMM.test(vInicio) && HHMM.test(vFim) && vInicio !== vFim;

  const gravar = (patch: Partial<typeof atual>, onSuccess?: () => void) =>
    salvar.mutate({ chave: "roleta_noite", valor: { ...atual, ...patch } }, { onSuccess });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label className="flex items-center gap-1.5">
            <MoonStars className="h-4 w-4 text-primary" /> Roleta fechada à noite
          </Label>
          <p className="text-xs text-muted-foreground">
            {textoJanela({ inicio: atual.inicio, fim: atual.fim })} Nesse intervalo nenhum lead é
            sorteado, para ninguém — nem com &quot;liberado pela gestão&quot;. O que chega espera a
            reabertura; atribuir direto a um corretor escolhido continua valendo.
          </p>
        </div>
        <Switch
          checked={atual.ativa}
          onCheckedChange={(v) => gravar({ ativa: v })}
          disabled={settingsQ.isLoading || salvar.isPending}
          aria-label="Roleta fechada à noite"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Fecha às</span>
        <Input
          type="time"
          className="w-28"
          value={vInicio}
          onChange={(e) => setInicio(e.target.value)}
          aria-label="Fecha às"
        />
        <span className="text-muted-foreground">e reabre às</span>
        <Input
          type="time"
          className="w-28"
          value={vFim}
          onChange={(e) => setFim(e.target.value)}
          aria-label="Reabre às"
        />
        {mudou && (
          <Button
            size="sm"
            variant="outline"
            disabled={!valido || salvar.isPending}
            title={valido ? undefined : "Início e fim diferentes, no formato HH:MM"}
            onClick={() =>
              gravar({ inicio: vInicio, fim: vFim }, () => {
                setInicio(null);
                setFim(null);
              })
            }
          >
            <FloppyDisk className="mr-1 h-3.5 w-3.5" /> Salvar
          </Button>
        )}
      </div>
      <p className="text-xs text-warning">
        A virada do robô (rota direta → Marquinhos às {horaCurta(atual.inicio)}, de volta às{" "}
        {horaCurta(atual.fim)}) está agendada no banco do robô. Mudar o horário aqui não muda lá —
        peça o ajuste junto.
      </p>
    </div>
  );
}
