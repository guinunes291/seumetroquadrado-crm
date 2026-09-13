// Guarda do item 2.7 (estrategia-2026-08), atualizada pela Fatia 3 da carteira
// ativa (2026-09-13): Atender reunia TRÊS modos numa porta só; o Prioridade
// foi aposentado porque suas seis filas são os baldes que a Fila Única
// absorveu — com o teto da carteira valendo no banco, as duas telas dariam números
// diferentes para a mesma pergunta. Restam Volume (o antigo Blitz, destino do
// redirect de /blitz) e Consulta (busca e filtros), que não têm equivalente na
// Fila Única e por isso NÃO foram retirados junto.
// /leads continua rota viva (kanban, ações em massa, importação) fora do nível
// primário do menu. Fonte lida como texto.
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

describe("item 2.7a — os modos que sobraram, uma porta", () => {
  it("o modo viaja na URL com whitelist", () => {
    expect(atendimento).toContain(
      'search.modo === "volume" || search.modo === "consulta" ? search.modo : undefined',
    );
  });

  it("Volume e Consulta montam dentro de Atender", () => {
    expect(atendimento).toContain('{modo === "volume" && <VolumeView />}');
    expect(atendimento).toContain('{modo === "consulta" && <ConsultaView />}');
  });

  it("o modo Prioridade foi aposentado: /atendimento sem modo válido cai na Fila Única", () => {
    // A razão está no cabeçalho do arquivo: duas telas com o mesmo escopo e
    // réguas diferentes (uma com o teto da carteira, outra sem) divergem.
    expect(atendimento).toMatch(/beforeLoad:[\s\S]*redirect\(\{ to: "\/fila" \}\)/);
    expect(atendimento).not.toContain('modo === "prioridade"');
    // E a inbox das seis filas não é mais consumida aqui.
    expect(atendimento).not.toContain("atendimento:inbox");
  });

  it("URL nenhuma morre: /blitz redireciona para Atender em modo Volume (PR c)", () => {
    expect(blitz).toContain('createFileRoute("/_authenticated/blitz")');
    expect(blitz).toMatch(/redirect\(\{ to: "\/atendimento", search: \{ modo: "volume" \} \}\)/);
    // O Volume preserva as chaves de cache e os atalhos do Blitz — mudança
    // de lugar, não de comportamento.
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
