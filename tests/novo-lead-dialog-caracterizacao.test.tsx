// @vitest-environment jsdom
// Caracterização de src/features/leads/novo-lead-dialog.tsx escrita ANTES da
// quebra do arquivo em módulos. O fluxo do corretor (busca → registro filho
// ou cadastro mãe) já está em tests/buscar-oportunidade.test.tsx; aqui fica o
// que não estava travado: a criação pela gestão, pelo admin e pela pré-venda
// — validações, e-mail duplicado, payload do criar_lead_dedup (ação de rua,
// zona, atribuição manual), a roleta do admin, cada resposta da RPC, os
// toasts e as invalidações. O Select do Radix vira <select> nativo só aqui
// (o jsdom não abre o popover). Valores capturados do código original e
// revisados à mão.

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const t = vi.hoisted(() => ({
  respostas: {} as Record<string, unknown>,
  roles: { isAdmin: false, isGestor: true, isCorretor: false, isSdr: false },
  log: [] as string[],
  gravador: null as null | ReturnType<typeof import("./helpers/supabase-gravador").criarGravador>,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { criarGravador } = await import("./helpers/supabase-gravador");
  t.gravador = criarGravador(t.respostas);
  return { supabase: t.gravador.cliente };
});
vi.mock("@/lib/telefone-corretor.functions", () => ({
  validarTelefoneCliente: async ({ data }: { data: { telefone: string } }) => {
    t.log.push(`validarTelefone ${data.telefone}`);
    return { ok: true };
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "eu-1" } }),
  useUserRoles: () => t.roles,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/leads/x">{children}</a>,
}));
vi.mock("sonner", () => ({
  toast: Object.fromEntries(
    ["success", "error", "info", "warning"].map((k) => [
      k,
      (m: string) => t.log.push(`toast.${k} ${m}`),
    ]),
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: ReactNode;
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { abrirNovoLead, NovoLeadDialogHost } from "@/features/leads/novo-lead-dialog";

let invalidadas: string[] = [];
function abrir() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const original = qc.invalidateQueries.bind(qc);
  qc.invalidateQueries = ((f: { queryKey: unknown[] }) => {
    invalidadas.push(JSON.stringify(f.queryKey));
    return original(f);
  }) as typeof qc.invalidateQueries;
  render(
    <QueryClientProvider client={qc}>
      <NovoLeadDialogHost />
    </QueryClientProvider>,
  );
  act(() => abrirNovoLead());
}
const campos = () => screen.getAllByRole("textbox") as HTMLInputElement[];
const selects = () => screen.getAllByRole("combobox") as HTMLSelectElement[];
function preencher(v: { nome?: string; telefone?: string; email?: string }) {
  const [nome, , email] = campos();
  if (v.nome != null) fireEvent.change(nome, { target: { value: v.nome } });
  if (v.telefone != null)
    fireEvent.change(screen.getByPlaceholderText("(11) 98765-4321"), {
      target: { value: v.telefone },
    });
  if (v.email != null) fireEvent.change(email, { target: { value: v.email } });
}
const criar = () => fireEvent.click(screen.getByRole("button", { name: "Criar lead" }));
const fechado = () => waitFor(() => expect(screen.queryByText("Criar lead")).toBeNull());
const ultimoToast = () =>
  waitFor(() => expect(t.log.some((l) => l.startsWith("toast."))).toBe(true));

beforeEach(() => {
  for (const k of Object.keys(t.respostas)) delete t.respostas[k];
  t.respostas.profiles = [
    { id: "c-ana", nome: "Ana Corretora" },
    { id: "c-bia", nome: "Bia Corretora" },
  ];
  t.respostas["rpc:criar_lead_dedup"] = { duplicado: false, lead_id: "L-novo" };
  t.roles = { isAdmin: false, isGestor: true, isCorretor: false, isSdr: false };
  t.log = [];
  invalidadas = [];
  t.gravador?.limpar();
});
afterEach(cleanup);

describe("novo-lead-dialog — caracterização (gestão, admin, pré-venda)", () => {
  it("validações antes de qualquer chamada: obrigatórios, telefone e e-mail", async () => {
    abrir();
    criar();
    await ultimoToast();
    preencher({ nome: "Cliente", telefone: "1199" });
    criar();
    await waitFor(() => expect(t.log.length).toBe(2));
    preencher({ telefone: "11987654321", email: "sem-arroba" });
    criar();
    await waitFor(() => expect(t.log.length).toBe(4));
    expect(t.log).toMatchInlineSnapshot(`
      [
        "toast.error Nome e telefone são obrigatórios",
        "toast.error Telefone inválido. Informe DDD + número (ex.: 11 91234-5678).",
        "validarTelefone (11) 98765-4321",
        "toast.error E-mail inválido.",
      ]
    `);
    expect(t.gravador!.chamadas).toMatchInlineSnapshot(`
      [
        "supabase.from(profiles).select("id, nome").eq("ativo",true).neq("nome","docs-bot").order("nome")",
      ]
    `);
  });

  it("gestor atribui a um corretor: lista sem docs-bot, payload completo, toast com o nome, invalida e fecha", async () => {
    abrir();
    await waitFor(() => expect(selects()[2].options.length).toBe(3));
    expect(screen.getByText(/O lead ficará sem corretor até você atribuir/)).toBeTruthy();
    preencher({ nome: "  Carla Cliente ", telefone: "11987654321", email: " Carla@Ex.com " });
    const [, , , projeto, bairro, observacoes] = campos();
    fireEvent.change(projeto, { target: { value: " Vibra " } });
    fireEvent.change(bairro, { target: { value: " Tucuruvi " } });
    fireEvent.change(observacoes, { target: { value: " ligar à tarde " } });
    fireEvent.change(selects()[1], { target: { value: "Norte" } });
    fireEvent.change(selects()[2], { target: { value: "c-bia" } });
    expect(screen.getByText(/entra direto na carteira do corretor escolhido/)).toBeTruthy();
    criar();
    await fechado();
    expect(t.gravador!.chamadas).toMatchInlineSnapshot(`
      [
        "supabase.from(profiles).select("id, nome").eq("ativo",true).neq("nome","docs-bot").order("nome")",
        "supabase.from(leads).select("id, nome, email").ilike("email","carla@ex.com").limit(1)",
        "supabase.rpc(criar_lead_dedup,{"_payload":{"nome":"Carla Cliente","telefone":"(11) 98765-4321","email":"carla@ex.com","origem":"outro","projeto_nome":"Vibra","bairro":"Tucuruvi","zona":"Norte","observacoes":"ligar à tarde","corretor_id":"c-bia","status":"aguardando_atendimento"}})",
      ]
    `);
    expect(t.log).toMatchInlineSnapshot(`
      [
        "validarTelefone (11) 98765-4321",
        "toast.success Lead criado e atribuído a Bia Corretora",
      ]
    `);
    expect(invalidadas).toMatchInlineSnapshot(`
      [
        "["leads"]",
        "["leads-status-counts"]",
        "["pipeline-stage-v2"]",
        "["pipeline-snapshot-v2"]",
      ]
    `);
  });

  it("ação de rua: a descrição entra no topo das observações; sem corretor escolhido, 'Lead criado'", async () => {
    abrir();
    preencher({ nome: "Rua", telefone: "11987654321" });
    fireEvent.change(selects()[0], { target: { value: "acao_rua" } });
    fireEvent.change(screen.getByPlaceholderText("Ex.: Motoboy"), {
      target: { value: " Motoboy " },
    });
    fireEvent.change(campos()[6], { target: { value: "quer 2 dorms" } });
    criar();
    await fechado();
    expect(t.gravador!.chamadas.filter((c) => c.includes("rpc"))).toMatchInlineSnapshot(`
      [
        "supabase.rpc(criar_lead_dedup,{"_payload":{"nome":"Rua","telefone":"(11) 98765-4321","email":null,"origem":"acao_rua","projeto_nome":null,"bairro":null,"zona":null,"observacoes":"Ação de rua: Motoboy\\nquer 2 dorms"}})",
      ]
    `);
    expect(t.log.at(-1)).toMatchInlineSnapshot(`"toast.success Lead criado"`);
  });

  it("e-mail já cadastrado barra antes da RPC", async () => {
    t.respostas.leads = [{ id: "L-velho", nome: "Carla Antiga", email: "carla@ex.com" }];
    abrir();
    preencher({ nome: "Carla", telefone: "11987654321", email: "CARLA@ex.com" });
    criar();
    await ultimoToast();
    expect(t.log.filter((l) => l.startsWith("toast"))).toMatchInlineSnapshot(`
      [
        "toast.error Lead duplicado: já existe "Carla Antiga" com este e-mail.",
      ]
    `);
    expect(t.gravador!.chamadas.some((c) => c.includes("criar_lead_dedup"))).toBe(false);
  });

  it("cada duplicado da RPC vira a mensagem certa (na carteira, outra carteira, etapa avançada)", async () => {
    const mensagens: string[] = [];
    for (const r of [
      { duplicado: true, lead_id: "L1", nome: "Carla", na_carteira: true },
      { duplicado: true, lead_id: "L1", na_carteira: false },
      { duplicado: true, lead_id: "L1", nome: "Carla", bloqueado_etapa: true },
      { duplicado: false, lead_id: null },
    ]) {
      t.respostas["rpc:criar_lead_dedup"] = r;
      t.log = [];
      abrir();
      preencher({ nome: "Carla", telefone: "11987654321" });
      criar();
      await ultimoToast();
      mensagens.push(t.log.find((l) => l.startsWith("toast"))!);
      cleanup();
    }
    expect(mensagens).toMatchInlineSnapshot(`
      [
        "toast.error Lead duplicado: já existe "Carla" com este telefone.",
        "toast.error Lead duplicado: já existe um lead com este telefone em outra carteira.",
        "toast.error "Carla" já existe e está em etapa avançada (agendamento em diante, venda ou perdido). Só a gestão pode mover — peça ao seu gestor.",
        "toast.error Falha ao criar o lead. Tente novamente.",
      ]
    `);
  });

  it("admin com roleta: sem 'Atribuir a', tria depois de criar; com e sem corretor apto", async () => {
    t.roles = { isAdmin: true, isGestor: false, isCorretor: false, isSdr: false };
    const resultados: string[] = [];
    for (const triagem of [
      { ok: true, corretor_id: "c-ana" },
      { ok: false },
      { ok: false, corretor_id: "c-ana" },
    ]) {
      t.respostas["rpc:triar_e_distribuir_lead"] = triagem;
      t.log = [];
      t.gravador!.limpar();
      abrir();
      expect(screen.queryByText("Atribuir a")).toBeNull();
      expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
      preencher({ nome: "Lead Roleta", telefone: "11987654321" });
      criar();
      await fechado();
      resultados.push(t.log.at(-1)!);
      cleanup();
    }
    expect(t.gravador!.chamadas).toMatchInlineSnapshot(`
      [
        "supabase.rpc(criar_lead_dedup,{"_payload":{"nome":"Lead Roleta","telefone":"(11) 98765-4321","email":null,"origem":"outro","projeto_nome":null,"bairro":null,"zona":null,"observacoes":null}})",
        "supabase.rpc(triar_e_distribuir_lead,{"_lead_id":"L-novo","_gatilho":"manual_criacao"})",
      ]
    `);
    expect(resultados).toMatchInlineSnapshot(`
      [
        "toast.success Lead criado e atribuído",
        "toast.success Lead criado (nenhum corretor disponível na fila)",
        "toast.success Lead criado (nenhum corretor disponível na fila)",
      ]
    `);
  });

  it("admin desmarca a roleta: aparece 'Atribuir a' e a atribuição manual vale", async () => {
    t.roles = { isAdmin: true, isGestor: false, isCorretor: false, isSdr: false };
    abrir();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(selects()[2].options.length).toBe(3));
    preencher({ nome: "Manual", telefone: "11987654321" });
    fireEvent.change(selects()[2], { target: { value: "c-ana" } });
    criar();
    await fechado();
    expect(t.gravador!.chamadas.filter((c) => c.includes("rpc"))).toMatchInlineSnapshot(`
      [
        "supabase.rpc(criar_lead_dedup,{"_payload":{"nome":"Manual","telefone":"(11) 98765-4321","email":null,"origem":"outro","projeto_nome":null,"bairro":null,"zona":null,"observacoes":null,"corretor_id":"c-ana","status":"aguardando_atendimento"}})",
      ]
    `);
    expect(t.log.at(-1)).toMatchInlineSnapshot(
      `"toast.success Lead criado e atribuído a Ana Corretora"`,
    );
  });

  it("pré-venda: auto-atribuição, e o cliente que já existia entra na base dela", async () => {
    t.roles = { isAdmin: false, isGestor: false, isCorretor: false, isSdr: true };
    t.respostas["rpc:criar_lead_dedup"] = {
      duplicado: true,
      lead_id: "L-velho",
      nome: "Carla",
      sdr_pegou: true,
    };
    abrir();
    expect(screen.getByText("Este lead será atribuído automaticamente a você.")).toBeTruthy();
    expect(screen.queryByText("Buscar cliente")).toBeNull();
    preencher({ nome: "Carla", telefone: "11987654321" });
    criar();
    await fechado();
    expect(t.gravador!.chamadas).toMatchInlineSnapshot(`
      [
        "supabase.rpc(criar_lead_dedup,{"_payload":{"nome":"Carla","telefone":"(11) 98765-4321","email":null,"origem":"captacao_corretor","projeto_nome":null,"bairro":null,"zona":null,"observacoes":null,"corretor_id":"eu-1","status":"aguardando_atendimento"}})",
      ]
    `);
    expect(t.log.at(-1)).toMatchInlineSnapshot(
      `"toast.success Este cliente já existia no CRM ("Carla"): entrou na sua base de pré-venda"`,
    );
    expect(invalidadas[0]).toBe('["sdr:base"]');
  });
});
