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
import { useUserRoles } from "@/hooks/use-auth";
import { usePreference } from "@/hooks/use-preference";
import { useTheme } from "@/hooks/use-theme";
import { abrirNovoLead } from "@/features/leads/novo-lead-dialog";
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
  SunMoon,
  UserPlus,
  UserRound,
  DollarSign,
  History,
  Zap,
} from "lucide-react";

type LeadHit = { id: string; nome: string; telefone: string | null; status: string };
type ProjetoHit = { id: string; nome: string; bairro: string | null };
type TarefaHit = { id: string; titulo: string };
type CorretorHit = { id: string; nome: string | null };

/** Item do histórico "Recentes" (persistido por usuário, máx. 8). */
type RecentEntry = { type: "lead" | "projeto"; id: string; label: string };

/**
 * Paleta de comandos global (⌘K / Ctrl+K): busca leads, projetos, tarefas e
 * corretores no servidor, executa ações (novo lead, registrar venda, tema,
 * sprint, SamiQ) e navega para qualquer área — sem tirar a mão do teclado.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const { setPref, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recentes, setRecentes] = usePreference<RecentEntry[]>("palette:recentes", []);

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

  const buscando = debounced.length >= 2;

  const { data: leads = [], isFetching } = useQuery({
    queryKey: ["cmdk:leads", debounced],
    enabled: open && buscando,
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

  // Buscas paralelas secundárias: falha em uma NUNCA derruba a paleta —
  // devolve vazio e loga (a busca de leads continua a principal).
  const { data: projetos = [] } = useQuery({
    queryKey: ["cmdk:projetos", debounced],
    enabled: open && buscando,
    queryFn: async (): Promise<ProjetoHit[]> => {
      const { normalizeSearch } = await import("@/lib/validators");
      const s = normalizeSearch(debounced).replace(/[%,]/g, "");
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, bairro")
        .is("deleted_at", null)
        .ilike("nome", `%${s}%`)
        .limit(5);
      if (error) {
        console.warn("palette: busca de projetos falhou", error.message);
        return [];
      }
      return (data ?? []) as ProjetoHit[];
    },
  });

  const { data: tarefas = [] } = useQuery({
    queryKey: ["cmdk:tarefas", debounced],
    enabled: open && buscando,
    queryFn: async (): Promise<TarefaHit[]> => {
      const { normalizeSearch } = await import("@/lib/validators");
      const s = normalizeSearch(debounced).replace(/[%,]/g, "");
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo")
        .is("deleted_at", null)
        .not("status", "in", "(concluida,cancelada)")
        .ilike("titulo", `%${s}%`)
        .limit(5);
      if (error) {
        console.warn("palette: busca de tarefas falhou", error.message);
        return [];
      }
      return (data ?? []) as TarefaHit[];
    },
  });

  const { data: corretores = [] } = useQuery({
    queryKey: ["cmdk:corretores", debounced],
    enabled: open && buscando && canManage,
    queryFn: async (): Promise<CorretorHit[]> => {
      const { normalizeSearch } = await import("@/lib/validators");
      const s = normalizeSearch(debounced).replace(/[%,]/g, "");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .ilike("nome", `%${s}%`)
        .limit(5);
      if (error) {
        console.warn("palette: busca de corretores falhou", error.message);
        return [];
      }
      return (data ?? []) as CorretorHit[];
    },
  });

  const run = (fn: () => void) => {
    setOpen(false);
    setQ("");
    setDebounced("");
    fn();
  };

  const lembrar = (entry: RecentEntry) => {
    setRecentes((prev) => {
      const rest = prev.filter((r) => !(r.type === entry.type && r.id === entry.id));
      return [entry, ...rest].slice(0, 8);
    });
  };

  const abrirLead = (id: string, label: string) => {
    lembrar({ type: "lead", id, label });
    run(() => navigate({ to: "/leads/$leadId", params: { leadId: id } }));
  };

  const abrirProjeto = (id: string, label: string) => {
    lembrar({ type: "projeto", id, label });
    run(() => navigate({ to: "/projetos/$projetoId", params: { projetoId: id } }));
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
      label: "Projetos / Empreendimentos",
      icon: Building2,
      go: () => navigate({ to: "/projetos" }),
    },
    ...(canManage
      ? [
          {
            label: "Gestão (Painel)",
            icon: Gauge,
            go: () => navigate({ to: "/painel-gestor" }),
          },
          {
            label: "Distribuição (roletas)",
            icon: Users,
            go: () => navigate({ to: "/distribuicao" }),
          },
        ]
      : []),
    ...(canManage || isSuperintendente
      ? [
          {
            label: "Inteligência (Relatórios)",
            icon: LayoutDashboard,
            go: () => navigate({ to: "/inteligencia" }),
          },
        ]
      : []),
  ];

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
            placeholder="Buscar lead, projeto, tarefa… ou executar uma ação"
          />
          <CommandList>
            {!buscando && recentes.length > 0 && (
              <CommandGroup heading="Recentes">
                {recentes.map((r) => (
                  <CommandItem
                    key={`${r.type}-${r.id}`}
                    value={`recent-${r.type}-${r.id}`}
                    onSelect={() =>
                      r.type === "lead" ? abrirLead(r.id, r.label) : abrirProjeto(r.id, r.label)
                    }
                  >
                    <History className="text-muted-foreground" />
                    <span className="flex-1 truncate">{r.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.type === "lead" ? "lead" : "projeto"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {buscando && (
              <CommandGroup heading="Leads">
                {leads.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    {isFetching ? "Buscando…" : "Nenhum lead encontrado."}
                  </div>
                ) : (
                  leads.map((l) => (
                    <CommandItem key={l.id} value={l.id} onSelect={() => abrirLead(l.id, l.nome)}>
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

            {buscando && projetos.length > 0 && (
              <CommandGroup heading="Projetos">
                {projetos.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`projeto-${p.id}`}
                    onSelect={() => abrirProjeto(p.id, p.nome)}
                  >
                    <Building2 className="text-muted-foreground" />
                    <span className="flex-1 truncate">{p.nome}</span>
                    {p.bairro && <span className="text-xs text-muted-foreground">{p.bairro}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {buscando && tarefas.length > 0 && (
              <CommandGroup heading="Tarefas abertas">
                {tarefas.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`tarefa-${t.id}`}
                    onSelect={() =>
                      run(() => navigate({ to: "/agendamentos", search: { tab: "tarefas" } }))
                    }
                  >
                    <ListTodo className="text-muted-foreground" />
                    <span className="flex-1 truncate">{t.titulo}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {buscando && corretores.length > 0 && (
              <CommandGroup heading="Corretores">
                {corretores.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`corretor-${c.id}`}
                    onSelect={() =>
                      run(() => navigate({ to: "/painel-gestor", search: { tab: "pessoas" } }))
                    }
                  >
                    <UserRound className="text-muted-foreground" />
                    <span className="flex-1 truncate">{c.nome ?? "Corretor"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading="Ações">
              <CommandItem
                value="Novo lead criar cadastrar"
                onSelect={() => run(() => abrirNovoLead())}
              >
                <UserPlus className="text-primary" />
                Novo lead
              </CommandItem>
              <CommandItem
                value="Registrar venda"
                onSelect={() => run(() => window.dispatchEvent(new Event("open-registrar-venda")))}
              >
                <DollarSign className="text-primary" />
                Registrar venda
              </CommandItem>
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
              <CommandItem
                value="Alternar tema claro escuro"
                onSelect={() => run(() => setPref(resolved === "dark" ? "light" : "dark"))}
              >
                <SunMoon className="text-primary" />
                Alternar tema ({resolved === "dark" ? "→ claro" : "→ escuro"})
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
