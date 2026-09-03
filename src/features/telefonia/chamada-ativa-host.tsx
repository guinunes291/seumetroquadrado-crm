// Pop-up global de CHAMADA ATIVA (screen pop do discador): montado no layout
// autenticado, observa `chamadas` do próprio corretor via realtime e, quando
// o PABX conecta um cliente (webhook marca atendida/falando), abre um card
// fixo com a ficha do lead + som de campainha — em QUALQUER tela do CRM.
//
// O áudio da ligação vive no ramal do corretor (fone/softphone) — o PABX
// entrega a voz lá; o CRM entrega o contexto: quem é o cliente, etapa,
// projeto, último contato, atalho para o dossiê e registro do resultado.
// Quando a chamada encerra, o card vira "registrar resultado".
//
// Som: campainha sintetizada via Web Audio (sem asset externo), com toggle
// persistido em localStorage. Navegador pode bloquear áudio antes da primeira
// interação do usuário — o try/catch degrada em silêncio.

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall, PhoneSlash, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { supabase } from "@/integrations/supabase/client";
import { formatRelativeTime } from "@/lib/interacoes";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";
import { formatPhoneBR } from "@/lib/masks";
import { buscarChamadaRecente, STATUS_EM_ANDAMENTO } from "./chamadas-client";

const SOM_STORAGE_KEY = "telefonia:som-chamada";

function somLigado(): boolean {
  try {
    return localStorage.getItem(SOM_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function salvarSom(ligado: boolean): void {
  try {
    localStorage.setItem(SOM_STORAGE_KEY, ligado ? "on" : "off");
  } catch {
    // sem storage (modo privado) — preferência só desta aba
  }
}

/** Campainha dupla sintetizada (dó-mi curtos, 2x) — nada de asset externo. */
function tocarCampainha(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const inicio = ctx.currentTime + 0.02;
    for (let toque = 0; toque < 2; toque++) {
      const t0 = inicio + toque * 0.7;
      for (const [freq, off] of [
        [880, 0],
        [1108.73, 0.2],
      ] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + off);
        gain.gain.linearRampToValueAtTime(0.22, t0 + off + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + off);
        osc.stop(t0 + off + 0.45);
      }
    }
    window.setTimeout(() => void ctx.close(), 2500);
  } catch {
    // autoplay bloqueado / sem áudio — o pop-up visual continua valendo
  }
}

const TERMINAIS = new Set(["concluida", "nao_atendida", "falha"]);

type LeadFicha = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  projeto_nome: string | null;
  ultima_interacao: string | null;
  proximo_followup: string | null;
  corretor_id: string | null;
};

export function ChamadaAtivaHost() {
  const { user } = useAuth();

  const chamadaQ = useQuery({
    queryKey: ["chamada-ativa", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: () => buscarChamadaRecente(user!.id),
  });
  useRealtimeInvalidate("chamadas", [["chamada-ativa"]], {
    enabled: !!user,
    filter: user ? `corretor_id=eq.${user.id}` : undefined,
    debounceMs: 250,
  });

  const chamada = chamadaQ.data ?? null;
  const emAndamento = !!chamada && STATUS_EM_ANDAMENTO.includes(chamada.status);

  // Memória da sessão: quais chamadas já tocaram a campainha e quais já
  // apareceram como ativas (só essas viram "encerrada" — chamada que morreu
  // sem nunca conectar, ex.: caixa postal descartada, não vira pop-up).
  const avisadasRef = useRef(new Set<string>());
  const vistasAtivasRef = useRef(new Set<string>());
  const [dispensadaId, setDispensadaId] = useState<string | null>(null);
  const [som, setSom] = useState(somLigado);
  const [registrarAberto, setRegistrarAberto] = useState(false);

  useEffect(() => {
    if (!chamada || !emAndamento) return;
    vistasAtivasRef.current.add(chamada.id);
    if (!avisadasRef.current.has(chamada.id)) {
      avisadasRef.current.add(chamada.id);
      if (somLigado()) tocarCampainha();
    }
  }, [chamada, emAndamento]);

  const encerradaVista =
    !!chamada && TERMINAIS.has(chamada.status) && vistasAtivasRef.current.has(chamada.id);
  const visivel = !!chamada && chamada.id !== dispensadaId && (emAndamento || encerradaVista);

  // Ficha do cliente: quem é, em que etapa está, último contato, follow-up.
  const leadQ = useQuery({
    queryKey: ["chamada-ativa:lead", chamada?.lead_id],
    enabled: visivel && !!chamada?.lead_id,
    queryFn: async (): Promise<LeadFicha | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, nome, telefone, status, projeto_nome, ultima_interacao, proximo_followup, corretor_id",
        )
        .eq("id", chamada!.lead_id!)
        .maybeSingle();
      if (error) throw error;
      return (data as LeadFicha | null) ?? null;
    },
  });
  const lead = leadQ.data ?? null;

  // Cronômetro "em linha há…" enquanto a chamada está viva.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!visivel || !emAndamento) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [visivel, emAndamento]);

  if (!user || !visivel || !chamada) return null;

  const inicioMs = new Date(chamada.criado_em).getTime();
  const emLinhaSeg = Math.max(0, Math.floor((Date.now() - inicioMs) / 1000));
  const emLinha = `${Math.floor(emLinhaSeg / 60)}:${String(emLinhaSeg % 60).padStart(2, "0")}`;
  const followupVencido = !!lead?.proximo_followup && new Date(lead.proximo_followup) < new Date();
  const numeroFmt = formatPhoneBR(chamada.numero);

  const alternarSom = () => {
    const novo = !som;
    setSom(novo);
    salvarSom(novo);
    if (novo) tocarCampainha();
  };

  return (
    <div
      role="dialog"
      aria-label={emAndamento ? "Chamada em andamento" : "Chamada encerrada"}
      aria-live="polite"
      className="fixed bottom-20 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm md:bottom-4"
    >
      <Card className={emAndamento ? "border-success/60 shadow-xl" : "border-border shadow-xl"}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {emAndamento ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                  </span>
                  <PhoneCall className="h-4 w-4 text-success" />
                  {chamada.direcao === "entrada" ? "Ligação recebida" : "Cliente na linha"}
                  <span className="tabular-nums text-muted-foreground">{emLinha}</span>
                </>
              ) : (
                <>
                  <PhoneSlash className="h-4 w-4 text-muted-foreground" />
                  Chamada encerrada
                </>
              )}
            </span>
            <span className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={som ? "Silenciar aviso de chamada" : "Ativar som de chamada"}
                title={som ? "Silenciar aviso de chamada" : "Ativar som de chamada"}
                onClick={alternarSom}
              >
                {som ? <SpeakerHigh className="h-4 w-4" /> : <SpeakerSlash className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Fechar aviso de chamada"
                onClick={() => setDispensadaId(chamada.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            {lead ? (
              <Link
                to="/leads/$leadId"
                params={{ leadId: lead.id }}
                className="block truncate font-display text-lg font-semibold text-primary hover:underline"
              >
                {lead.nome}
              </Link>
            ) : (
              <div className="font-display text-lg font-semibold">
                {chamada.lead_id ? "Carregando ficha…" : "Número não identificado"}
              </div>
            )}
            <div className="tabular-nums text-sm text-muted-foreground">{numeroFmt}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {lead && (
                <Badge variant="secondary">
                  {LEAD_STATUS_LABEL[lead.status as LeadStatus] ?? lead.status}
                </Badge>
              )}
              {followupVencido && <Badge variant="destructive">Follow-up vencido</Badge>}
              {lead?.projeto_nome && (
                <span className="truncate text-xs text-muted-foreground">{lead.projeto_nome}</span>
              )}
            </div>
            {lead && (
              <div className="text-xs text-muted-foreground">
                {lead.ultima_interacao
                  ? `Último contato ${formatRelativeTime(lead.ultima_interacao)}`
                  : "Nunca contatado"}
              </div>
            )}
          </div>

          {emAndamento && (
            <p className="text-xs text-muted-foreground">
              O áudio está no seu ramal — atenda por lá. Aqui fica a ficha do cliente.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {lead &&
              (emAndamento ? (
                <>
                  <Button size="sm" asChild>
                    <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                      <PhoneCall className="h-3.5 w-3.5 mr-1.5" /> Atender no CRM
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRegistrarAberto(true)}>
                    Registrar resultado
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => setRegistrarAberto(true)}>
                    Registrar resultado
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                      Abrir dossiê
                    </Link>
                  </Button>
                </>
              ))}
          </div>
        </CardContent>
      </Card>

      {lead && (
        <RegistrarContatoDialog
          open={registrarAberto}
          onOpenChange={setRegistrarAberto}
          lead={{ id: lead.id, nome: lead.nome, corretor_id: lead.corretor_id }}
          defaultTipo="ligacao"
          onDone={() => setDispensadaId(chamada.id)}
        />
      )}
    </div>
  );
}
