import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LigarLeadInput = { id: string; nome: string; telefone: string | null };

function telHref(telefone: string | null): string | null {
  const d = (telefone ?? "").replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

// A edge function responde erros como { error: "snake_case" }; o invoke embala
// o Response em error.context. Exportado: a Sessão de Discagem usa o mesmo
// contrato ao falar com sonax-campanha.
export async function codigoDoErro(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.clone().json()) as { error?: string };
      return body?.error ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

const MENSAGENS: Record<string, string> = {
  ramal_nao_configurado:
    "Seu ramal do discador não está cadastrado (peça ao admin em Gestão → Corretores).",
  sonax_nao_configurado: "A integração com o discador ainda não foi configurada.",
  sonax_recusou: "O discador recusou a chamada.",
  sonax_indisponivel: "O discador não respondeu.",
  lead_opt_out: "Este lead pediu para não ser contatado (opt-out).",
  lead_sem_telefone: "O lead não tem um telefone válido.",
  lead_not_found: "Lead não encontrado na sua carteira.",
  account_inactive: "Sua conta está inativa.",
};

// Erros em que abrir o discador do próprio aparelho (tel:) resolve na hora.
// Código null = função indisponível (não publicada / rede) — também cai no tel:.
const COM_FALLBACK_TEL = new Set([
  "ramal_nao_configurado",
  "sonax_nao_configurado",
  "sonax_recusou",
  "sonax_indisponivel",
]);

/**
 * Ação única de "ligar para o lead": dispara o click-to-call do Sonax (o PABX
 * toca no ramal do corretor e depois disca o lead) e registra a ligação na
 * timeline — o registro é feito pela edge function sonax-discar, junto com a
 * linha em `chamadas`. Quando a telefonia não está disponível para este
 * corretor, degrada para o `tel:` que os botões usavam antes.
 */
export function useLigarLead() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (lead: LigarLeadInput) => {
      const { data, error } = await supabase.functions.invoke("sonax-discar", {
        body: { lead_id: lead.id },
      });
      if (error) {
        const codigo = await codigoDoErro(error);
        throw Object.assign(new Error(codigo ?? error.message), { codigo });
      }
      return { lead, protocolo: (data as { protocolo?: string | null })?.protocolo ?? null };
    },
    onSuccess: ({ lead }) => {
      toast.success(`Ligação enviada para seu ramal — atenda para falar com ${lead.nome}.`);
      qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const ligar = (lead: LigarLeadInput) => {
    mutation.mutate(lead, {
      onError: (e) => {
        const codigo = (e as { codigo?: string | null }).codigo ?? null;
        const msg =
          (codigo && MENSAGENS[codigo]) || `Não foi possível ligar pelo discador (${e.message}).`;
        const href = telHref(lead.telefone);
        if (href && (codigo === null || COM_FALLBACK_TEL.has(codigo))) {
          toast.warning(`${msg} Abrindo o discador do aparelho…`);
          window.location.href = href;
        } else {
          toast.error(msg);
        }
      },
    });
  };

  return { ligar, discando: mutation.isPending };
}
