import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildWhatsAppUrl } from "@/lib/templates";
import { mensagemPrimeiroContato, WHATSAPP_TITULO_PADRAO } from "@/lib/whatsapp";

type WhatsAppLead = {
  id: string;
  nome: string;
  telefone: string;
  projeto_nome?: string | null;
};

type AbrirWhatsAppOpts = {
  /** Mensagem pronta; se omitida usa a mensagem padrão de primeiro contato. */
  mensagem?: string;
  /** Título da interação registrada na timeline. */
  titulo?: string;
  /** Passe false para abrir sem registrar interação. */
  registrar?: boolean;
};

/**
 * Ação única de "abrir WhatsApp com o lead": monta a mensagem, abre o wa.me e
 * registra a interação na timeline (padrão). Centraliza o comportamento que
 * antes era reimplementado em cada botão — a maioria sem registrar nada.
 */
export function useWhatsAppLead() {
  const qc = useQueryClient();

  const registrarInteracao = useMutation({
    mutationFn: async (p: { leadId: string; titulo: string; conteudo: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("interacoes").insert({
        lead_id: p.leadId,
        autor_id: u.user?.id ?? null,
        tipo: "whatsapp",
        direcao: "saida",
        titulo: p.titulo,
        conteudo: p.conteudo,
      });
      if (error) throw error;
      return p.leadId;
    },
    onSuccess: (leadId) => {
      qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) =>
      toast.error(`WhatsApp aberto, mas a interação não foi registrada: ${e.message}`),
  });

  return (lead: WhatsAppLead, opts?: AbrirWhatsAppOpts) => {
    const msg = opts?.mensagem ?? mensagemPrimeiroContato(lead.nome, lead.projeto_nome);
    // window.open precisa ser síncrono no clique — dentro da mutation o Safari
    // bloquearia o popup. O registro da interação segue em paralelo.
    window.open(buildWhatsAppUrl(lead.telefone, msg), "_blank", "noopener,noreferrer");
    if (opts?.registrar !== false) {
      registrarInteracao.mutate({
        leadId: lead.id,
        titulo: opts?.titulo ?? WHATSAPP_TITULO_PADRAO,
        conteudo: msg,
      });
    }
  };
}
