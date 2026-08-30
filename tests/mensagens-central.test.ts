// Guarda da Fase 7b (estrategia-2026-08, Onda C): Central de Mensagens em
// modo simulado — agrupamento puro testado em runtime; fiação por fonte.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agruparConversas,
  ordenarThread,
  previewConversa,
  type Mensagem,
} from "@/features/mensagens/derive";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const central = read("src/features/mensagens/central-mensagens.tsx");
const client = read("src/features/mensagens/mensagens-client.ts");
const rota = read("src/routes/_authenticated/mensagens.tsx");
// O menu vem do registro SISTEMAS desde a reorganização em sistemas.
const sistemas = read("src/features/nav/sistemas.ts");

function msg(parcial: Partial<Mensagem> & { id: string; lead_id: string }): Mensagem {
  return {
    corretor_id: "c1",
    direcao: "entrada",
    canal: "whatsapp",
    provider: "zapi",
    provider_message_id: null,
    status: "recebida",
    conteudo: "oi",
    midia_url: null,
    criado_em: "2026-08-09T12:00:00Z",
    ...parcial,
  };
}

describe("agruparConversas (derive puro)", () => {
  it("1 conversa por lead, mais recente primeiro, com contagem de aguardando", () => {
    const rows = [
      msg({ id: "a1", lead_id: "A", criado_em: "2026-08-09T10:00:00Z", direcao: "saida" }),
      msg({ id: "a2", lead_id: "A", criado_em: "2026-08-09T11:00:00Z" }),
      msg({ id: "a3", lead_id: "A", criado_em: "2026-08-09T11:30:00Z" }),
      msg({ id: "b1", lead_id: "B", criado_em: "2026-08-09T09:00:00Z" }),
    ];
    const conversas = agruparConversas(rows);
    expect(conversas.map((c) => c.leadId)).toEqual(["A", "B"]);
    // Duas entradas DEPOIS da última saída → 2 aguardando resposta.
    expect(conversas[0].aguardandoResposta).toBe(2);
    expect(conversas[0].total).toBe(3);
    expect(conversas[0].ultima.id).toBe("a3");
  });

  it("conversa que termina com saída não aguarda resposta", () => {
    const conversas = agruparConversas([
      msg({ id: "1", lead_id: "A", criado_em: "2026-08-09T10:00:00Z" }),
      msg({ id: "2", lead_id: "A", criado_em: "2026-08-09T11:00:00Z", direcao: "saida" }),
    ]);
    expect(conversas[0].aguardandoResposta).toBe(0);
  });

  it("marca 'tratada' desconta as entradas até a marca; entrada nova reabre (Lote 3)", () => {
    const rows = [
      msg({ id: "1", lead_id: "A", criado_em: "2026-08-09T10:00:00Z" }),
      msg({ id: "2", lead_id: "A", criado_em: "2026-08-09T11:00:00Z" }),
    ];
    // Marca DEPOIS das duas entradas: conversa em dia.
    const tratadaDepois = new Map([["A", "2026-08-09T12:00:00Z"]]);
    expect(agruparConversas(rows, tratadaDepois)[0].aguardandoResposta).toBe(0);
    // Marca ENTRE as duas: só a entrada posterior à marca conta.
    const tratadaNoMeio = new Map([["A", "2026-08-09T10:30:00Z"]]);
    expect(agruparConversas(rows, tratadaNoMeio)[0].aguardandoResposta).toBe(1);
    // Sem marca do lead, nada muda em relação ao derive puro.
    expect(agruparConversas(rows, new Map())[0].aguardandoResposta).toBe(2);
  });

  it("ordenarThread é cronológico e estável mesmo com entrada fora de ordem", () => {
    const thread = ordenarThread([
      msg({ id: "2", lead_id: "A", criado_em: "2026-08-09T11:00:00Z" }),
      msg({ id: "1", lead_id: "A", criado_em: "2026-08-09T10:00:00Z" }),
    ]);
    expect(thread.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("previewConversa marca as suas mensagens e resume mídia", () => {
    expect(previewConversa(msg({ id: "1", lead_id: "A", direcao: "saida" }))).toBe("Você: oi");
    expect(
      previewConversa(msg({ id: "1", lead_id: "A", conteudo: null, midia_url: "https://x/a.jpg" })),
    ).toBe("[mídia]");
  });
});

describe("fiação da Central (7b)", () => {
  it("a rota /mensagens existe e o menu aponta para ela em Comunicações, com o badge", () => {
    expect(rota).toContain('createFileRoute("/_authenticated/mensagens")');
    expect(sistemas).toMatch(
      /label: "Mensagens",\s*icon: MessageCircle,\s*to: "\/mensagens",\s*badge: \(b\) => b\.mensagensAguardando/,
    );
  });

  it("modo simulado: envio registra na conversa E abre o wa.me com o texto", () => {
    expect(client).toContain('provider: "simulado"');
    expect(client).toContain('direcao: "saida"');
    expect(central).toContain("registrarEnvioSimulado(");
    expect(central).toContain("abrirWhatsApp(");
    expect(central).toContain('titulo: "WhatsApp — Central de Mensagens"');
  });

  it("sem a migration da 7a a Central explica em vez de quebrar; realtime ligado", () => {
    expect(client).toMatch(/PGRST205.*42P01|\["PGRST205", "PGRST202", "42P01"\]/);
    expect(client).toContain("tabelaAusente: true");
    expect(central).toContain("tabelaAusente");
    expect(central).toContain('useRealtimeInvalidate("mensagens"');
    expect(central).toContain('useRealtimeInvalidate("conversas_tratadas"');
  });

  it("Lote 3: marcar tratada liga na RPC e invalida quem lê a fonte única", () => {
    // A Central desconta as marcas na lista e oferece o botão de tratar —
    // gated pelo ESTADO da fonte única (RPC ausente → botão some, nunca
    // clique que quebra num banco sem a migration).
    expect(central).toContain("listarConversasTratadas(");
    expect(central).toContain("conversaEstado(");
    expect(central).toContain("marcarConversaTratada(");
    // …e qualquer ação que muda a pendência avisa badge e fila Responder.
    expect(central).toContain('queryKey: ["nav-badges"]');
    expect(central).toContain('queryKey: ["atendimento:inbox"]');
    // A ficha do lead embute a MESMA conversa (aba WhatsApp do dossiê).
    const aba = read("src/features/leads/dossie/whatsapp-tab.tsx");
    expect(aba).toContain("listarMensagensDoLead(");
    expect(aba).toContain("conversaEstado(");
    expect(aba).toContain("marcarConversaTratada(");
    expect(aba).toContain('queryKey: ["nav-badges"]');
    const ficha = read("src/routes/_authenticated/leads.$leadId.tsx");
    expect(ficha).toContain('value: "whatsapp", label: "WhatsApp"');
  });
});
