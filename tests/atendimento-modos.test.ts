// Guarda do item 2.7, PR (a) (estrategia-2026-08): Atender ganha os 3 modos
// (Prioridade/Volume/Consulta) numa porta só, SEM matar as portas antigas —
// /blitz continua montando o mesmo componente e /leads continua inteira até
// os PRs (b) e (c). Fonte lida como texto, padrão da casa.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const atendimento = read("src/routes/_authenticated/atendimento.tsx");
const blitz = read("src/routes/_authenticated/blitz.tsx");
const leadsIndex = read("src/routes/_authenticated/leads.index.tsx");
const leadsQuery = read("src/features/leads/leads-query.ts");
const consulta = read("src/features/atendimento/consulta-view.tsx");
const volume = read("src/features/atendimento/volume-view.tsx");

describe("item 2.7a — três modos, uma porta", () => {
  it("o modo viaja na URL com whitelist — valor desconhecido cai em Prioridade", () => {
    expect(atendimento).toContain(
      'search.modo === "volume" || search.modo === "consulta" ? search.modo : undefined',
    );
    expect(atendimento).toContain('modoParam ?? "prioridade"');
  });

  it("Volume e Consulta montam dentro de Atender; Prioridade segue sendo o padrão", () => {
    expect(atendimento).toContain('{modo === "volume" && <VolumeView header="modo" />}');
    expect(atendimento).toContain('{modo === "consulta" && <ConsultaView />}');
    expect(atendimento).toMatch(/\{modo === "prioridade" && \(\s*<AsyncBoundary/);
    // A inbox só roda no modo que a consome.
    expect(atendimento).toContain('modo === "prioridade"');
  });

  it("URL nenhuma morre: /blitz segue viva montando o MESMO VolumeView (redirect é o PR c)", () => {
    expect(blitz).toContain('createFileRoute("/_authenticated/blitz")');
    expect(blitz).toContain('from "@/features/atendimento/volume-view"');
    expect(blitz).toContain('<VolumeView header="pagina" />');
    expect(blitz).not.toContain("redirect(");
    // O Blitz extraído preserva chaves de cache e atalhos — mudança de lugar,
    // não de comportamento.
    expect(volume).toContain('"blitz-queue"');
    expect(volume).toContain('"blitz-sla"');
    expect(volume).toContain("Atalhos: ← → navegar");
  });

  it("a Consulta lê a MESMA query de /leads — fonte única em leads-query.ts", () => {
    expect(consulta).toContain('from "@/features/leads/leads-query"');
    expect(leadsIndex).toContain('from "@/features/leads/leads-query"');
    expect(consulta).toContain("fetchLeadsFiltered({");
    expect(leadsIndex).toContain("fetchLeadsFiltered({");
    // A cadeia v4 → v3 → v2 → v1 vive UMA vez, no módulo compartilhado.
    expect(leadsQuery).toContain('rpcLeadsFiltered("v4"');
    expect(leadsQuery).toContain('rpcLeadsFiltered("v3"');
    expect(leadsQuery).toContain('rpcLeadsFiltered("v2"');
    expect(leadsQuery).toContain('supabase.rpc("leads_filtered"');
    expect(leadsIndex).not.toContain('rows: await rpcLeadsFiltered("v4"');
  });

  it("a Consulta preserva o caminho para /leads até o PR (c)", () => {
    // Ponte honesta: kanban, sort por coluna, ações em massa e importação
    // continuam em /leads — o link preserva o recorte inteiro (2.7b).
    expect(consulta).toContain('to="/leads"');
    expect(consulta).toContain("Abrir em Meus Leads");
    expect(consulta).toMatch(/status: filtros\.status !== "all" \? filtros\.status : undefined/);
  });

  it("a Consulta age em 1 clique como a lista: peek, WhatsApp e ligar", () => {
    expect(consulta).toContain("<LeadPeekDrawer");
    expect(consulta).toContain("abrirWhatsApp(");
    expect(consulta).toMatch(/href=\{`tel:\$\{lead\.telefone/);
  });
});
