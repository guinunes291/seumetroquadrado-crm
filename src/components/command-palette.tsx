import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_BADGE_TONE, leadStatusLabel, type LeadStatus } from "@/lib/leads";
import {
  Gauge,
  Users,
  Trello,
  CalendarClock,
  ListTodo,
  LayoutDashboard,
  Building2,
  Headset,
  Sparkles,
  Zap,
} from "lucide-react";

type LeadHit = { id: string; nome: string; telefone: string | null; status: string };

/**
 * Paleta de comandos global (⌘K / Ctrl+K): busca leads no servidor e navega
 * para as telas principais sem tirar a mão do teclado. Montada no layout
 * autenticado, fica disponível em qualquer tela.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  // Atalho global de teclado para abrir/fechar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  // Debounce da busca para não consultar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data: leads = [], isFetching } = useQuery({
    queryKey: ["cmdk:leads", debounced],
    enabled: open && debounced.length >= 2,
    queryFn: async (): Promise<LeadHit[]> => {
      const { normalizeSearch, onlyDigits } = await import("@/lib/validators");
      const s = normalizeSearch(debounced).replace(/[%,]/g, "");
      const digits = onlyDigits(debounced);
      let q = supabase.from("leads").select("id, nome, telefone, status").eq("na_lixeira", false);
      if (digits.length >= 3) {
        q = q.or(`search_text.ilike.%${s}%,search_text.ilike.%${digits}%`);
      } else {
        const termos = s.split(" ").filter((t) => t.length >= 2);
        if (termos.length > 1) {
          for (const t of termos) q = q.ilike("search_text", `%${t}%`);
        } else {
          q = q.ilike("search_text", `%${s}%`);
        }
      }
      const { data, error } = await q.limit(8);
      if (error) throw error;
      return (data ?? []) as LeadHit[];
    },
  });

  const run = (fn: () => void) => {
    setOpen(false);
    setQ("");
    setDebounced("");
    fn();
  };

  const navItems = [
    { label: "Central de Comando", icon: Gauge, go: () => navigate({ to: "/hoje" }) },
    { label: "Leads", icon: Users, go: () => navigate({ to: "/leads" }) },
    { label: "Atendimento", icon: Headset, go: () => navigate({ to: "/atendimento" }) },
    { label: "Pipeline (Funil)", icon: Trello, go: () => navigate({ to: "/pipeline" }) },
    {
      label: "Modo Fechamento",
      icon: Trello,
      go: () => navigate({ to: "/pipeline", search: { tab: "fechamento" } }),
    },
    { label: "Agendamentos", icon: CalendarClock, go: () => navigate({ to: "/agendamentos" }) },
    { label: "Tarefas", icon: ListTodo, go: () => navigate({ to: "/tarefas" }) },
    {
      label: "Inteligência (Relatórios)",
      icon: LayoutDashboard,
      go: () => navigate({ to: "/inteligencia" }),
    },
    {
      label: "Projetos / Empreendimentos",
      icon: Building2,
      go: () => navigate({ to: "/projetos" }),
    },
  ];

  const buscando = debounced.length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Buscar e navegar</DialogTitle>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5"
        >
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Buscar lead por nome/telefone ou ir para uma tela…"
          />
          <CommandList>
            {buscando && (
              <CommandGroup heading="Leads">
                {leads.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    {isFetching ? "Buscando…" : "Nenhum lead encontrado."}
                  </div>
                ) : (
                  leads.map((l) => (
                    <CommandItem
                      key={l.id}
                      value={l.id}
                      onSelect={() =>
                        run(() => navigate({ to: "/leads/$leadId", params: { leadId: l.id } }))
                      }
                    >
                      <Users className="text-muted-foreground" />
                      <span className="flex-1 truncate">{l.nome}</span>
                      {l.telefone && (
                        <span className="text-xs text-muted-foreground">{l.telefone}</span>
                      )}
                      <Badge
                        variant="secondary"
                        className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]}
                      >
                        {leadStatusLabel(l.status)}
                      </Badge>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            )}

            <CommandGroup heading="Ações">
              <CommandItem
                value="Abrir SamiQ copiloto"
                onSelect={() => run(() => window.dispatchEvent(new Event("open-samiq")))}
              >
                <Sparkles className="text-primary" />
                Abrir SamiQ (⌘J)
              </CommandItem>
              <CommandItem
                value="Iniciar Sprint prospecção"
                onSelect={() => run(() => window.dispatchEvent(new Event("open-sprint")))}
              >
                <Zap className="text-primary" />
                Iniciar Sprint
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Ir para">
              {navItems.map((n) => {
                const Icon = n.icon;
                return (
                  <CommandItem key={n.label} value={n.label} onSelect={() => run(n.go)}>
                    <Icon className="text-muted-foreground" />
                    {n.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
