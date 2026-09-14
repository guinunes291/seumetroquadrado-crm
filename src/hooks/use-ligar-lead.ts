import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LigarLeadInput = { id: string; nome: string; telefone: string | null };

function telHref(telefone: string | null): string | null {
  const d = (telefone ?? "").replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

// As edge functions respondem erros como { error: "snake_case", detail? }; o
// invoke embala o Response em error.context. Exportado: a Sessão de Discagem
// usa o mesmo contrato ao falar com tcplus-campanha.
export async function erroDaFunction(
  error: unknown,
): Promise<{ codigo: string | null; detalhe: string | null }> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.clone().json()) as { error?: string; detail?: string };
      return { codigo: body?.error ?? null, detalhe: body?.detail ?? null };
    } catch {
      return { codigo: null, detalhe: null };
    }
  }
  return { codigo: null, detalhe: null };
}

export async function codigoDoErro(error: unknown): Promise<string | null> {
  return (await erroDaFunction(error)).codigo;
}

const MENSAGENS: Record<string, string> = {
  token_nao_configurado:
    "Seu 3C Plus ainda não está conectado ao CRM — cole seu token de agente na aba Discador.",
  campanha_nao_configurada:
    "Sua campanha do 3C Plus não está cadastrada (peça ao admin em Gestão → Corretores → Discador).",
  tcplus_token_invalido:
    "O 3C Plus recusou seu token de agente — gere um novo no 3C Plus e cole na aba Discador.",
  tcplus_nao_configurado: "A integração com o discador ainda não foi configurada.",
  tcplus_recusou: "O 3C Plus recusou a chamada.",
  tcplus_indisponivel: "O 3C Plus não respondeu.",
  lead_opt_out: "Este lead pediu para não ser contatado (opt-out).",
  lead_sem_telefone: "O lead não tem um telefone válido.",
  lead_not_found: "Lead não encontrado na sua carteira nem na sua fila do Bolsão.",
  account_inactive: "Sua conta está inativa.",
};

// Erros em que abrir o discador do próprio aparelho (tel:) resolve na hora.
// Código null = função indisponível (não publicada / rede) — também cai no tel:.
const COM_FALLBACK_TEL = new Set([
  "token_nao_configurado",
  "campanha_nao_configurada",
  "tcplus_token_invalido",
  "tcplus_nao_configurado",
  "tcplus_recusou",
  "tcplus_indisponivel",
]);

/**
 * Ação única de "ligar para o lead": manda o agente do corretor no 3C Plus
 * discar para o lead (chamada manual — a voz toca no webphone/ramal do 3C
 * Plus) e registra a ligação na timeline — o registro é feito pela edge
 * function tcplus-discar, junto com a linha em `chamadas`. Quando a telefonia
 * não está disponível para este corretor, degrada para o `tel:` que os botões
 * usavam antes.
 */
export function useLigarLead() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (lead: LigarLeadInput) => {
      const { data, error } = await supabase.functions.invoke("tcplus-discar", {
        body: { lead_id: lead.id },
      });
      if (error) {
        const { codigo, detalhe } = await erroDaFunction(error);
        throw Object.assign(new Error(codigo ?? error.message), { codigo, detalhe });
      }
      return { lead, chamadaId: (data as { chamada_id?: string | null })?.chamada_id ?? null };
    },
    onSuccess: ({ lead }) => {
      toast.success(`Discando no seu 3C Plus — atenda pelo webphone para falar com ${lead.nome}.`);
      qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const ligar = (lead: LigarLeadInput) => {
    mutation.mutate(lead, {
      onError: (e) => {
        const { codigo = null, detalhe = null } = e as {
          codigo?: string | null;
          detalhe?: string | null;
        };
        const base =
          (codigo && MENSAGENS[codigo]) || `Não foi possível ligar pelo discador (${e.message}).`;
        const msg = detalhe ? `${base} (${detalhe})` : base;
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
