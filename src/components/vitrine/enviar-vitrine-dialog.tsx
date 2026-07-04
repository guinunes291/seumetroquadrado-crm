import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { mensagemEmpreendimento, WHATSAPP_TITULO_EMPREENDIMENTO } from "@/lib/whatsapp";
import { formatBRL } from "@/lib/projetos";
import type { ProjetoRow } from "@/components/projeto-card";

type LeadHit = { id: string; nome: string; telefone: string | null; status: string };

type Props = {
  /** Empreendimento a enviar; quando não-nulo, o diálogo abre. */
  projeto: ProjetoRow | null;
  onClose: () => void;
};

/**
 * Seletor de lead para disparar o empreendimento no WhatsApp quando a Vitrine é
 * aberta sem um lead em contexto. Reusa a busca por `search_text` da paleta de
 * comandos e o envio+registro de interação do useWhatsAppLead.
 */
export function EnviarVitrineDialog({ projeto, onClose }: Props) {
  const abrirWhatsApp = useWhatsAppLead();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Zera a busca ao trocar de empreendimento / fechar.
  useEffect(() => {
    if (!projeto) {
      setQ("");
      setDebounced("");
    }
  }, [projeto]);

  const { data: leads = [], isFetching } = useQuery({
    queryKey: ["vitrine:leads", debounced],
    enabled: !!projeto && debounced.length >= 2,
    queryFn: async (): Promise<LeadHit[]> => {
      const { normalizeSearch, onlyDigits } = await import("@/lib/validators");
      const s = normalizeSearch(debounced).replace(/[%,]/g, "");
      const digits = onlyDigits(debounced);
      let query = supabase
        .from("leads")
        .select("id, nome, telefone, status")
        .eq("na_lixeira", false);
      if (digits.length >= 3) {
        query = query.or(`search_text.ilike.%${s}%,search_text.ilike.%${digits}%`);
      } else {
        const termos = s.split(" ").filter((t) => t.length >= 2);
        if (termos.length > 1) {
          for (const t of termos) query = query.ilike("search_text", `%${t}%`);
        } else {
          query = query.ilike("search_text", `%${s}%`);
        }
      }
      const { data, error } = await query.limit(8);
      if (error) throw error;
      return (data ?? []) as LeadHit[];
    },
  });

  const precoLabel = useMemo(
    () =>
      projeto
        ? projeto.sob_consulta || projeto.preco_a_partir == null
          ? "Sob consulta"
          : formatBRL(projeto.preco_a_partir)
        : "",
    [projeto],
  );

  const enviar = (lead: LeadHit) => {
    if (!projeto) return;
    if (!lead.telefone) return;
    const msg = mensagemEmpreendimento(lead.nome, {
      nome: projeto.nome,
      bairro: projeto.bairro,
      zona: projeto.zona_smq,
      precoLabel,
      bookUrl: projeto.book_url,
    });
    abrirWhatsApp(
      { id: lead.id, nome: lead.nome, telefone: lead.telefone },
      { mensagem: msg, titulo: `${WHATSAPP_TITULO_EMPREENDIMENTO}: ${projeto.nome}` },
    );
    onClose();
  };

  return (
    <Dialog open={!!projeto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar empreendimento</DialogTitle>
          <DialogDescription>
            {projeto ? `Escolha o lead que vai receber "${projeto.nome}" no WhatsApp.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar lead por nome ou telefone…"
            className="pl-9"
          />
        </div>

        <div className="min-h-[120px] max-h-72 overflow-auto">
          {debounced.length < 2 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Digite ao menos 2 letras para buscar.
            </p>
          ) : isFetching ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </p>
          ) : leads.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lead encontrado.</p>
          ) : (
            <ul className="divide-y">
              {leads.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    disabled={!l.telefone}
                    onClick={() => enviar(l)}
                    className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {l.telefone || "sem telefone"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
