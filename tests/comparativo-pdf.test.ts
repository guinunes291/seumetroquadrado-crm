// Comparativo em PDF para o CLIENTE: modelo (o que entra) e HTML (como sai).
// O que mais importa aqui é o que NÃO pode sair: telefone do lead, comissão,
// dado interno e HTML injetado pelo banco ou pelo corretor.
import { describe, expect, it } from "vitest";
import {
  montarComparativo,
  primeiroNome,
  urlImagemSegura,
  type EntradaComparativo,
} from "@/features/comparativo/comparativo";
import { montarHtmlComparativo } from "@/features/comparativo/comparativo-pdf";
import type { PerfilComparativo } from "@/features/comparativo/encaixe";
import { mkProjeto } from "./helpers/projeto";

const perfil: PerfilComparativo = {
  renda: null,
  fgts: 0,
  entrada: 0,
  temDependente: false,
  carteira3anos: false,
  zona: "Leste",
  bairro: null,
  dormsDesejados: 2,
  precisaVaga: null,
  prioridades: ["pet"],
};

function entrada(over: Partial<EntradaComparativo> = {}): EntradaComparativo {
  return {
    clienteNome: "maria aparecida da silva",
    corretor: { nome: "João Corretor", telefone: "(11) 91234-5678", creci: "123456-F" },
    perfil,
    projetos: [
      {
        ...mkProjeto({
          id: "a",
          nome: "Vibra Itaquera",
          construtora: "Vibra",
          bairro: "Itaquera",
          zona_smq: "Leste",
          dorms_min: 2,
          dorms_max: 2,
          preco_a_partir: 239000,
          vagas_min: 0,
          vagas_max: 1,
        }),
        capa_url: "https://drive.google.com/file/d/1CapaCapaCapaCapa/view",
        galeria_urls: ["https://cdn.exemplo.com/1.jpg", "javascript:alert(1)"],
        diferenciais: ["Pet place", "Piscina"],
        percentual_comissao: 4.5,
        disponibilidade_resumo: "Restam 3 unidades no 2º andar",
        argumentos_venda: ["Construtora aceita 30% na obra"],
        perfil_ideal: "Casal jovem",
        plantas: [
          {
            url: "https://x.supabase.co/storage/v1/object/public/projetos-plantas/a/p12.jpg",
            legenda: "2 dorms · 40 m²",
            pagina: 12,
          },
        ],
      },
      {
        ...mkProjeto({
          id: "b",
          nome: "Conx Penha <script>alert(1)</script>",
          bairro: "Penha",
          zona_smq: "Leste",
          sob_consulta: true,
        }),
        diferenciais: ['<img src=x onerror="alert(1)">'],
      },
    ],
    mensagem: "Separei estas opções <b>pra você</b>.\nQualquer dúvida me chama.",
    notasPorProjeto: { a: "Melhor prazo de entrega", b: "" },
    geradoEm: new Date("2026-09-24T15:00:00Z"),
    ...over,
  };
}

describe("montarComparativo", () => {
  it("cliente só pelo primeiro nome e título vira nome do arquivo", () => {
    const c = montarComparativo(entrada());
    expect(c.clientePrimeiroNome).toBe("Maria");
    expect(c.titulo).toBe("Comparativo de empreendimentos – Maria – 2026-09-24");
    expect(primeiroNome("  ")).toBeNull();
  });

  it("imagens: Drive vira miniatura, só https entra, capa não repete na galeria", () => {
    const [a] = montarComparativo(entrada()).projetos;
    expect(a.capa).toBe("https://drive.google.com/thumbnail?id=1CapaCapaCapaCapa&sz=w1600");
    expect(a.fotos).toEqual(["https://cdn.exemplo.com/1.jpg"]);
    expect(a.plantas).toEqual([
      {
        url: "https://x.supabase.co/storage/v1/object/public/projetos-plantas/a/p12.jpg",
        legenda: "2 dorms · 40 m²",
      },
    ]);
    expect(urlImagemSegura('https://x.com/a.jpg" onerror="x')).toBeNull();
  });

  it("encaixe calculado por projeto e nota vazia vira null", () => {
    const [a, b] = montarComparativo(entrada()).projetos;
    expect(a.encaixe?.pontos).toContain("Tem opção de 2 dormitórios");
    expect(a.encaixe?.pontos).toContain("Tem o que você valoriza: Pet place");
    expect(a.nota).toBe("Melhor prazo de entrega");
    expect(b.nota).toBeNull();
    expect(b.preco).toBe("Sob consulta");
  });

  it("sem perfil: sem encaixe e sem resumo", () => {
    const c = montarComparativo(entrada({ perfil: null }));
    expect(c.temPerfil).toBe(false);
    expect(c.resumoPerfil).toEqual([]);
    expect(c.projetos.every((p) => p.encaixe === null)).toBe(true);
  });
});

describe("montarHtmlComparativo", () => {
  const html = montarHtmlComparativo(montarComparativo(entrada()));

  it("tem capa, tabela lado a lado, uma página por projeto, plantas e rodapé", () => {
    expect(html).toContain("<title>Comparativo de empreendimentos – Maria – 2026-09-24</title>");
    expect(html).toContain("Seleção para Maria");
    expect(html).toContain("Comparativo lado a lado");
    expect(html).toContain("Encaixe no seu perfil");
    expect(html).toContain("O que você procura");
    expect(html).toContain("Por que combina com você, Maria");
    expect(html).toContain("Lazer e facilidades");
    expect(html).toContain("<h3>Plantas</h3>");
    expect(html).toContain("2 dorms · 40 m²");
    expect(html.match(/class="projeto quebra"/g)).toHaveLength(2);
    expect(html).toContain("sujeitos a alteração");
    expect(html).toContain("CRECI 123456-F");
  });

  it("nada interno nem dado do lead além do primeiro nome", () => {
    expect(html).not.toContain("4.5");
    expect(html).not.toContain("Restam 3 unidades");
    expect(html).not.toContain("30% na obra");
    expect(html).not.toContain("Casal jovem");
    expect(html).not.toContain("Aparecida");
    expect(html).not.toContain("javascript:");
  });

  it("escapa texto do banco e do corretor; quebra de linha da mensagem vira <br>", () => {
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Conx Penha &lt;script&gt;");
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;b&gt;pra você&lt;/b&gt;.<br>Qualquer dúvida");
  });

  it("sem lead/perfil: capa genérica e sem seção de encaixe", () => {
    const semLead = montarHtmlComparativo(
      montarComparativo(entrada({ clienteNome: null, perfil: null, mensagem: "" })),
    );
    expect(semLead).toContain("Seleção de empreendimentos");
    expect(semLead).not.toContain("Encaixe no seu perfil");
    expect(semLead).not.toContain("O que você procura");
    expect(semLead).not.toContain("estimativa comercial");
    // A nota do corretor ainda aparece, com título neutro.
    expect(semLead).toContain("Por que indicamos");
  });
});
