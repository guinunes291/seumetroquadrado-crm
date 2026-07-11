import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("regressões críticas do fechamento", () => {
  it("não oferece purge destrutivo de documentação no CRM", () => {
    const route = read("src/routes/api/documentacao.ts");
    const client = read("src/lib/documentacao.ts");
    const page = read("src/components/documentacao-tab.tsx");

    expect(route).toContain('error: "purge_not_supported"');
    expect(route).not.toMatch(/from\("documentacoes"\)[\s\S]{0,120}\.delete\(\)/);
    expect(client).not.toContain("purge=true");
    expect(page).not.toContain("onRemove");
    expect(page).toContain('useEffect(() => setUrl(doc.url ?? ""), [doc.url])');
    expect(page).toContain("min-h-11");
    expect(page).toContain("aria-label={`Remover arquivo de");
  });

  it("expõe somente sinais estruturados da timeline para leads:read", () => {
    const route = read("src/routes/api/public/leads/$id.ts");
    const getHandler = route.slice(route.indexOf("GET: async"), route.indexOf("PATCH: async"));
    const timelineSelect = getHandler.match(
      /from\("interacoes"\)[\s\S]*?\.select\("([^"]+)"\)/,
    )?.[1];

    expect(timelineSelect).toBe("id,tipo,direcao,ocorreu_em,created_at");
    expect(timelineSelect).not.toMatch(/titulo|conteudo|metadata|autor_id/);
    expect(getHandler).toContain("if (leadRes.error || interRes.error)");
    expect(getHandler).toContain(".limit(50)");
  });

  it("não transforma falha de contagens ou follow-up em lista vazia", () => {
    const leads = read("src/routes/_authenticated/leads.index.tsx");

    expect(leads).toContain("isError: followupError");
    expect(leads).toContain("isError: statusCountsError");
    expect(leads).toContain(
      "const listError = leadsError || statusCountsError || followupFilterFailed",
    );
    expect(leads).toContain("statusCountsData?.total ?? leadQueryTotal");
    expect(leads).not.toContain("statusCountsData?.total ?? 0");
    expect(leads).toContain("Não foi possível carregar os leads ou seus filtros");
  });

  it("mantém a ação principal do card Kanban com alvo de 44 px", () => {
    const kanban = read("src/components/leads-kanban-board.tsx");
    expect(kanban).toContain('className="mt-2 min-h-11 w-full text-xs"');
    expect(kanban).not.toContain('className="mt-2 h-6 w-full text-[11px]"');
  });
});
