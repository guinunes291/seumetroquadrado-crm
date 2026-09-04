// Cartão "Pré-venda (SDR)" na ficha do lead. Aparece quando o lead tem SDR
// (para o SDR dono, para o corretor que recebeu e para a gestão) e, para um
// SDR, quando o lead é de corretor e está parado (Reaquecer → Pegar).
//
// Toda mudança de posse passa por RPC (sdr-motor); aqui só a régua pura de
// lib/sdr.ts explica o que falta antes de bater no banco.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle, Fire, Handshake, HandGrabbing } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { transicionarLead } from "@/lib/lead-transitions";
import { formatRelativeTime } from "@/lib/interacoes";
import {
  SITUACAO_SDR_LABEL,
  podeAgendarSdr,
  podeEntregarSdr,
  requisitosQualificado,
  situacaoSdr,
} from "@/lib/sdr";
import { AgendarVisitaSdrDialog } from "./agendar-visita-sdr-dialog";
import { EntregarLeadSdrDialog } from "./entregar-lead-sdr-dialog";
import { useInvalidarSdr, useLeadReaquecivel, useMarcarInteresse, usePegarLead } from "./client";

export type LeadSdrFicha = {
  id: string;
  nome: string;
  status: string;
  corretor_id: string | null;
  projeto_nome?: string | null;
  renda_informada?: string | null;
  renda_estimada?: number | null;
  tipo_renda?: string | null;
  decisor?: string | null;
  sdr_id?: string | null;
  sdr_entregue_em?: string | null;
  sdr_devolvido_em?: string | null;
  sdr_interesse_confirmado?: boolean | null;
};

function useNomes(ids: Array<string | null | undefined>) {
  const alvo = Array.from(new Set(ids.filter((x): x is string => !!x)));
  return useQuery({
    queryKey: ["profiles-nomes", alvo.join(",")],
    enabled: alvo.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").in("id", alvo);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.nome])) as Record<string, string>;
    },
  });
}

export function SdrLeadCard({ lead }: { lead: LeadSdrFicha }) {
  const { user } = useAuth();
  const { isSdr, isAdmin } = useUserRoles();
  const invalidar = useInvalidarSdr();
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [entregarAberto, setEntregarAberto] = useState(false);
  const nomes = useNomes([lead.sdr_id, lead.corretor_id]);
  const marcarInteresse = useMarcarInteresse(lead.id);
  const pegar = usePegarLead();

  const souDono = !!user && lead.sdr_id === user.id;
  // Carteira antiga: quem virou SDR vindo de corretor ainda é corretor_id de
  // leads agendados/base. Esses leads vivem em Prospecção; aqui só muda a
  // conversa (a visita vai pela roleta — SDR nunca tem prioridade de corretor).
  const carteiraAntiga = !!user && lead.corretor_id === user.id;
  // "Pegar" só quando a régua do banco (lead_reaquecivel_sdr) deixa: lead de
  // corretor, sem SDR, parado e sem visita futura. Sem isso a RPC falharia.
  const candidatoPegar = isSdr && !lead.sdr_id && !!lead.corretor_id;
  const reaquecivel = useLeadReaquecivel(lead.id, candidatoPegar && !carteiraAntiga);
  // Carteira antiga entra sempre (a RPC deixa); lead de outro corretor só se parado.
  const podePegar = candidatoPegar && (carteiraAntiga || reaquecivel.data === true);
  const entregueEm = lead.sdr_entregue_em ?? null;

  const qualificar = useMutation({
    mutationFn: () =>
      transicionarLead({
        id: lead.id,
        status: "qualificado",
        nome: lead.nome,
        motivo: "Qualificado pelo SDR",
        proximaAcao: "Agendar a visita com o cliente",
      }),
    onSuccess: () => {
      toast.success("Lead qualificado");
      invalidar(lead.id);
    },
    onError: (e: Error) => toast.error("Não foi possível qualificar", { description: e.message }),
  });

  if (!lead.sdr_id && !podePegar) return null;

  const situacao = situacaoSdr({
    corretor_id: lead.corretor_id,
    sdr_entregue_em: entregueEm,
    sdr_devolvido_em: lead.sdr_devolvido_em ?? null,
  });
  const faltam = requisitosQualificado(lead);
  const nomeSdr = lead.sdr_id ? (nomes.data?.[lead.sdr_id] ?? "SDR") : null;
  const nomeCorretor = lead.corretor_id ? (nomes.data?.[lead.corretor_id] ?? "corretor") : null;

  return (
    <Card className="mb-6 border-modulo-sdr/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <Fire className="h-4 w-4 text-modulo-sdr" weight="duotone" /> Pré-venda (SDR)
          {lead.sdr_id && (
            <Badge variant="secondary" className="bg-modulo-sdr/15 text-modulo-sdr">
              {SITUACAO_SDR_LABEL[situacao]}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4 text-sm">
        {/* Lead parado de corretor: SDR pode pegar para reaquecer */}
        {podePegar && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground">
              {carteiraAntiga ? (
                <>
                  Lead da sua carteira de corretor. Traga para a base de pré-venda para trabalhar
                  pelo hub; a visita vai para um corretor apto pela roleta de agendados.
                </>
              ) : (
                <>
                  Lead parado na carteira de <strong>{nomeCorretor}</strong>. Ao pegar, você
                  reaquece; o corretor mantém a posse e tem prioridade na visita.
                </>
              )}
            </p>
            <Button
              size="sm"
              disabled={pegar.isPending}
              onClick={() =>
                pegar.mutate(lead.id, {
                  onSuccess: () =>
                    toast.success(
                      carteiraAntiga
                        ? "Lead na sua base de pré-venda"
                        : "Lead na sua base para reaquecer",
                    ),
                  onError: (e: Error) => toast.error(e.message),
                })
              }
            >
              <HandGrabbing className="mr-1.5 h-4 w-4" />{" "}
              {carteiraAntiga ? "Trazer para minha base" : "Pegar para reaquecer"}
            </Button>
          </div>
        )}

        {/* Visão de quem não é o SDR dono (corretor / gestão) */}
        {lead.sdr_id && !souDono && (
          <p className="text-muted-foreground">
            Pré-atendido por <strong>{nomeSdr}</strong>
            {entregueEm
              ? ` · entregue ${formatRelativeTime(entregueEm)}. O SDR confirma a visita (D-1 e no dia); você atende da visita em diante.`
              : lead.corretor_id
                ? " · reaquecendo o lead da sua carteira. Você mantém a posse e tem prioridade na visita."
                : " · ainda na base do SDR."}
          </p>
        )}

        {/* SDR dono: ações */}
        {souDono && !entregueEm && (
          <>
            {lead.corretor_id && carteiraAntiga && (
              <p className="text-muted-foreground">
                Lead da sua carteira de corretor: como você é SDR, a visita vai para um corretor
                apto pela roleta de agendados (sem prioridade de dono original).
              </p>
            )}
            {lead.corretor_id && !carteiraAntiga && (
              <p className="text-muted-foreground">
                Lead de <strong>{nomeCorretor}</strong>: ele mantém a posse e recebe a visita direto
                (sem roleta) se estiver ativo e com agenda livre.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="font-medium">Interesse confirmado</div>
                <div className="text-xs text-muted-foreground">
                  Cliente disse que quer seguir. Obrigatório para qualificar.
                </div>
              </div>
              <Switch
                checked={!!lead.sdr_interesse_confirmado}
                disabled={marcarInteresse.isPending}
                onCheckedChange={(v) =>
                  marcarInteresse.mutate(v, {
                    onError: (e: Error) => toast.error(e.message),
                  })
                }
              />
            </div>
            {lead.status !== "qualificado" && (
              <p className="text-xs text-muted-foreground">
                {faltam.length === 0
                  ? "Tudo pronto para qualificar."
                  : `Para qualificar ainda falta: ${faltam.join(", ")}. Preencha em "Editar dados".`}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {lead.status !== "qualificado" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={faltam.length > 0 || qualificar.isPending}
                  onClick={() => qualificar.mutate()}
                >
                  <CheckCircle className="mr-1.5 h-4 w-4" /> Qualificar
                </Button>
              )}
              <Button
                size="sm"
                disabled={!podeAgendarSdr(lead.status, entregueEm)}
                onClick={() => setAgendarAberto(true)}
              >
                <CalendarPlus className="mr-1.5 h-4 w-4" /> Agendar visita
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!podeEntregarSdr(lead.status, entregueEm)}
                title={
                  podeEntregarSdr(lead.status, entregueEm)
                    ? undefined
                    : "Entrega manual só depois do primeiro contato"
                }
                onClick={() => setEntregarAberto(true)}
              >
                <Handshake className="mr-1.5 h-4 w-4" /> Entregar com motivo
              </Button>
            </div>
          </>
        )}

        {souDono && entregueEm && (
          <p className="text-muted-foreground">
            Entregue a <strong>{nomeCorretor}</strong> {formatRelativeTime(entregueEm)}. Você
            confirma a visita (tarefas D-1 e no dia); o corretor atende da visita em diante. Se o
            cliente não comparecer ou o corretor parar de registrar, o lead volta para você.
          </p>
        )}

        {(isAdmin || souDono) && lead.sdr_devolvido_em && !entregueEm && (
          <p className="text-xs text-muted-foreground">
            Devolvido ao SDR {formatRelativeTime(lead.sdr_devolvido_em)}.
          </p>
        )}
      </CardContent>

      {agendarAberto && (
        <AgendarVisitaSdrDialog
          lead={{ id: lead.id, nome: lead.nome, projeto_nome: lead.projeto_nome }}
          open={agendarAberto}
          onOpenChange={setAgendarAberto}
        />
      )}
      {entregarAberto && (
        <EntregarLeadSdrDialog
          lead={{ id: lead.id, nome: lead.nome }}
          open={entregarAberto}
          onOpenChange={setEntregarAberto}
        />
      )}
    </Card>
  );
}
