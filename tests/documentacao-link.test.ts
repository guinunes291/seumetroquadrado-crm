// @vitest-environment node
// Link de documentação do cliente: regras puras (lib), a ponte do servidor
// (banco e storage mockados) e o contrato da migration. O comportamento no
// banco de verdade está em tests/db/link-documentacao.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc, storage: { from: () => ({ upload, remove }) } },
}));

import { checklistPorPerfil } from "@/lib/documentacao-checklist";
import {
  TIPOS_DO_CLIENTE,
  agruparItens,
  gruposPendentes,
  iniciarDocumentacaoSchema,
  mensagemConviteDocumentos,
  mensagemConvitePasta,
  mensagemErroDocumentacao,
  mimePelaAssinatura,
  nomeDeArquivoSeguro,
  pastaPublicaSchema,
  tiposDoPerfil,
  type ItemPasta,
} from "@/lib/documentacao-link";
import { DocumentacaoLinkError, enviarArquivo, iniciar } from "@/lib/documentacao-link.server";
import { preparoDoArquivo, trocarExtensao } from "@/features/documentacao-publica/preparar-arquivo";

const SLUG = "Ab3_-xYz09QWerty";
const TOKEN = "Tk3_-xYz09QWertyAb3_-xYz09QWerty";
const LEAD = "44444444-4444-4444-8444-444444444444";
const DOC = "55555555-5555-4555-8555-555555555555";
const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const migration = ler("supabase/migrations/20261024120000_link_documentacao_cliente.sql");
const migrationOrigem = ler("supabase/migrations/20261024115900_lead_origem_documentacao.sql");

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const HEIC = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);

function entrada(over: Record<string, unknown> = {}) {
  return {
    slug: SLUG,
    nome: "  Marina   Souza Lima ",
    telefone: "+55 (11) 98765-4321",
    email: " Marina@Exemplo.com ",
    cpf: "529.982.247-25",
    perfil: "clt",
    casado: true,
    usa_fgts: false,
    declara_ir: false,
    consentimento: true,
    ...over,
  };
}

const item = (over: Partial<ItemPasta>): ItemPasta => ({
  id: crypto.randomUUID(),
  tipo: "cpf",
  status: "pendente",
  tem_arquivo: false,
  atualizado_em: "2026-10-15T12:00:00Z",
  ...over,
});

describe("regras puras", () => {
  it("o cadastro normaliza os dados e exige perfil, respostas e consentimento", () => {
    const ok = iniciarDocumentacaoSchema.parse(entrada());
    expect(ok).toMatchObject({
      nome: "Marina Souza Lima",
      telefone: "11987654321",
      email: "marina@exemplo.com",
      cpf: "52998224725",
    });
    for (const over of [
      { perfil: "estagiario" },
      { casado: undefined },
      { consentimento: false },
      { cpf: "123.456.789-00" },
      { nome: "Marina" },
    ]) {
      expect(iniciarDocumentacaoSchema.safeParse(entrada(over)).success).toBe(false);
    }
  });

  it("a lista vem da mesma função do CRM", () => {
    const r = iniciarDocumentacaoSchema.parse(entrada());
    expect(tiposDoPerfil(r)).toEqual(
      checklistPorPerfil("clt", { casado: true }).map((i) => i.tipo),
    );
    expect(tiposDoPerfil(r)).toContain("conjuge_renda");
  });

  it("o cliente não vê a carta de crédito nem a fila de revisão", () => {
    expect(TIPOS_DO_CLIENTE).toContain("outro");
    expect(TIPOS_DO_CLIENTE).toContain("holerites");
    for (const fechado of ["aprovacao_credito", "nao_classificado", "extrato_bancario"]) {
      expect(TIPOS_DO_CLIENTE).not.toContain(fechado);
    }
  });

  it("o tipo do arquivo sai da assinatura, não da extensão", () => {
    expect(mimePelaAssinatura(PDF)).toBe("application/pdf");
    expect(mimePelaAssinatura(JPEG)).toBe("image/jpeg");
    expect(mimePelaAssinatura(PNG)).toBe("image/png");
    expect(mimePelaAssinatura(WEBP)).toBe("image/webp");
    expect(mimePelaAssinatura(EXE)).toBeNull();
    expect(mimePelaAssinatura(HEIC)).toBeNull();
    expect(mimePelaAssinatura(new Uint8Array())).toBeNull();
  });

  it("nome de arquivo sem pasta, sem controle e com teto", () => {
    expect(nomeDeArquivoSeguro("C:\\fotos\\RG frente.jpg", "jpg")).toBe("RG frente.jpg");
    expect(nomeDeArquivoSeguro("../../etc/passwd", "pdf")).toBe("passwd");
    expect(nomeDeArquivoSeguro("a\u0000b\u001fc.pdf", "pdf")).toBe("abc.pdf");
    expect(nomeDeArquivoSeguro("   ", "pdf")).toBe("documento.pdf");
    expect(nomeDeArquivoSeguro("x".repeat(300), "pdf")).toHaveLength(255);
  });

  it("agrupa por documento: reenviar > falta > enviado > aprovado", () => {
    const rg = item({ tipo: "documento_identidade", status: "recebido", tem_arquivo: true });
    const rgVerso = item({ tipo: "documento_identidade", status: "recebido", tem_arquivo: true });
    const hol = item({ tipo: "holerites", status: "pendente" });
    const holOk = item({ tipo: "holerites", status: "recebido", tem_arquivo: true });
    const res = item({ tipo: "comprovante_residencia", status: "reprovado", tem_arquivo: true });
    const cpf = item({ tipo: "cpf", status: "aprovado", tem_arquivo: true });
    const grupos = agruparItens([rg, hol, res, rgVerso, holOk, cpf]);
    expect(grupos.map((g) => [g.tipo, g.estado])).toEqual([
      ["documento_identidade", "enviado"],
      ["holerites", "falta"],
      ["comprovante_residencia", "reenviar"],
      ["cpf", "aprovado"],
    ]);
    expect(grupos[0]).toMatchObject({
      label: "RG ou CNH",
      arquivos: 2,
      alvo: null,
      trocavel: rgVerso.id,
    });
    expect(grupos[1]).toMatchObject({ alvo: hol.id, arquivos: 1 });
    expect(grupos[2]).toMatchObject({ alvo: res.id });
    expect(gruposPendentes(grupos)).toBe(2);
  });

  it("convites e erros", () => {
    const url = "https://crm.exemplo/pasta/x";
    expect(mensagemConvitePasta(url, "Marina Souza", "Ana Paula")).toBe(
      `Olá, Marina! Aqui é Ana, da Seu Metro Quadrado. Este é o link da sua pasta de documentos: é só abrir, tirar foto ou anexar o PDF de cada item. Pode mandar aos poucos — o link fica valendo por 30 dias: ${url}`,
    );
    expect(mensagemConviteDocumentos(url, null)).toContain(url);
    expect(mensagemErroDocumentacao("nao_permitido")).toContain("Fale direto com o seu corretor");
    expect(mensagemErroDocumentacao("xyz")).toBe(
      "Não foi possível concluir agora. Tente novamente.",
    );
  });

  it("a pasta pública aceita só o formato fechado", () => {
    const ok = pastaPublicaSchema.safeParse({
      corretor_nome: "Ana",
      corretor_whatsapp: "5511912345678",
      expira_em: "2026-11-14T00:00:00Z",
      itens: [item({})],
    });
    expect(ok.success).toBe(true);
    expect(
      pastaPublicaSchema.safeParse({
        corretor_nome: "Ana",
        corretor_whatsapp: "abc",
        expira_em: "",
        itens: [],
      }).success,
    ).toBe(false);
  });

  it("o navegador reduz foto grande, converte HEIC e recusa o resto", () => {
    expect(preparoDoArquivo("application/pdf", "a.pdf", 14e6)).toBe("enviar");
    expect(preparoDoArquivo("image/jpeg", "a.jpg", 1e6)).toBe("enviar");
    expect(preparoDoArquivo("image/jpeg", "a.jpg", 6e6)).toBe("reduzir");
    expect(preparoDoArquivo("image/heic", "a.heic", 1e6)).toBe("converter");
    expect(preparoDoArquivo("", "IMG_0001.HEIC", 1e6)).toBe("converter");
    expect(preparoDoArquivo("application/zip", "a.zip", 1e3)).toBe("recusar");
    expect(trocarExtensao("IMG_0001.HEIC", "jpg")).toBe("IMG_0001.jpg");
    expect(trocarExtensao(".heic", "jpg")).toBe("foto.jpg");
  });
});

describe("servidor", () => {
  beforeEach(() => {
    rpc.mockReset();
    upload.mockReset();
    remove.mockReset();
    upload.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: null });
  });

  it("honeypot preenchido recusa sem tocar no banco", async () => {
    const input = iniciarDocumentacaoSchema.parse(entrada({ website: "http://spam" }));
    await expect(iniciar(input)).rejects.toMatchObject({ status: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cadastro: telefone formatado e a lista do perfil; devolve o token da pasta", async () => {
    rpc.mockResolvedValue({ data: { ok: true, token: TOKEN }, error: null });
    const r = await iniciar(iniciarDocumentacaoSchema.parse(entrada()));
    expect(r).toEqual({ token: TOKEN });
    const [nome, args] = rpc.mock.calls[0];
    expect(nome).toBe("iniciar_documentacao_pelo_link");
    expect(args._telefone).toBe("(11) 98765-4321");
    expect(args._tipos).toEqual(checklistPorPerfil("clt", { casado: true }).map((i) => i.tipo));

    rpc.mockResolvedValue({ data: { ok: false, motivo: "nao_permitido" }, error: null });
    await expect(iniciar(iniciarDocumentacaoSchema.parse(entrada()))).rejects.toEqual(
      new DocumentacaoLinkError(409, "nao_permitido"),
    );
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(iniciar(iniciarDocumentacaoSchema.parse(entrada()))).rejects.toMatchObject({
      status: 503,
    });
  });

  it("arquivo: assinatura manda no tipo, caminho aleatório na pasta do lead", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "validar_upload_pasta"
        ? { data: { ok: true, lead_id: LEAD }, error: null }
        : { data: { ok: true, documentacao_id: DOC, versao: 1 }, error: null },
    );
    // Declarado como PNG, mas é PDF: vale o conteúdo.
    const arquivo = new File([PDF], "holerite.png", { type: "image/png" });
    const r = await enviarArquivo(TOKEN, { documentacaoId: DOC }, arquivo);
    expect(r).toEqual({ documentacao_id: DOC, versao: 1 });

    const [caminho, , opcoes] = upload.mock.calls[0];
    expect(caminho).toMatch(new RegExp(`^${LEAD}/${DOC}/[0-9a-f-]{36}\\.pdf$`));
    expect(opcoes).toMatchObject({ contentType: "application/pdf", upsert: false });
    const reg = rpc.mock.calls.find(([fn]) => fn === "registrar_upload_pasta")![1];
    expect(reg).toMatchObject({
      _token: TOKEN,
      _object_path: caminho,
      _mime_type: "application/pdf",
      _nome_original: "holerite.png",
      _documentacao_id: DOC,
      _novo_documentacao_id: undefined,
    });
  });

  it("arquivo a mais: o servidor cria o id do item novo e usa no caminho", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "validar_upload_pasta"
        ? { data: { ok: true, lead_id: LEAD }, error: null }
        : { data: { ok: true, documentacao_id: DOC, versao: 1 }, error: null },
    );
    await enviarArquivo(TOKEN, { tipo: "holerites" }, new File([JPEG], "h2.jpg"));
    const reg = rpc.mock.calls.find(([fn]) => fn === "registrar_upload_pasta")![1];
    expect(reg._tipo).toBe("holerites");
    expect(reg._documentacao_id).toBeUndefined();
    expect(reg._object_path.split("/")[1]).toBe(reg._novo_documentacao_id);
  });

  it("recusas antes do banco: conteúdo, tamanho e tipo fechado", async () => {
    await expect(
      enviarArquivo(
        TOKEN,
        { documentacaoId: DOC },
        new File([EXE], "rg.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toEqual(new DocumentacaoLinkError(415, "arquivo_invalido"));
    await expect(
      enviarArquivo(
        TOKEN,
        { documentacaoId: DOC },
        new File([new Uint8Array(15 * 1024 * 1024 + 1)], "x.pdf"),
      ),
    ).rejects.toMatchObject({ status: 413, code: "arquivo_grande" });
    await expect(
      enviarArquivo(TOKEN, { tipo: "aprovacao_credito" }, new File([PDF], "carta.pdf")),
    ).rejects.toMatchObject({ status: 409, code: "item_invalido" });
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("registro recusado: o objeto sai do bucket", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "validar_upload_pasta"
        ? { data: { ok: true, lead_id: LEAD }, error: null }
        : { data: { ok: false, motivo: "item_invalido" }, error: null },
    );
    await expect(
      enviarArquivo(TOKEN, { documentacaoId: DOC }, new File([PDF], "a.pdf")),
    ).rejects.toEqual(new DocumentacaoLinkError(409, "item_invalido"));
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });

  it("pasta recusada na validação não sobe nada", async () => {
    rpc.mockResolvedValue({ data: { ok: false, motivo: "limite_pasta" }, error: null });
    await expect(
      enviarArquivo(TOKEN, { documentacaoId: DOC }, new File([PDF], "a.pdf")),
    ).rejects.toMatchObject({ status: 429, code: "limite_pasta" });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("contrato da migration e das rotas públicas", () => {
  it("tabelas fechadas; funções públicas só do service_role; as do corretor, authenticated", () => {
    for (const t of ["documentacao_links", "documentacao_pastas"]) {
      expect(migration).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`);
      expect(migration).toContain(`ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY;`);
    }
    for (const fn of [
      "consumir_documentacao_link_requisicao(text)",
      "consumir_documentacao_pasta_requisicao(text)",
      "obter_documentacao_link_publico(text)",
      "obter_pasta_publica(text)",
      "validar_upload_pasta(text, uuid, text)",
    ]) {
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
      expect(migration).not.toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated`);
    }
    for (const fn of [
      "meu_documentacao_link()",
      "criar_meu_documentacao_link()",
      "trocar_meu_documentacao_link()",
      "desativar_meu_documentacao_link()",
      "consultar_pasta_do_lead(uuid)",
      "link_pasta_do_lead(uuid)",
      "trocar_link_pasta_do_lead(uuid)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated;`);
    }
  });

  it("a versão do cliente não tem usuário, e o caminho velho do WhatsApp sai do item", () => {
    expect(migration).toContain("CHECK (enviado_por IS NOT NULL OR pelo_cliente)");
    const registrar = migration.slice(migration.indexOf("FUNCTION public.registrar_upload_pasta("));
    expect(registrar).toContain("arquivo_path = NULL");
    expect(registrar).toContain("origem = 'link_cliente'");
  });

  it("a origem nova vem em migration própria, antes da que a usa", () => {
    expect(migrationOrigem).toContain(
      "ALTER TYPE public.lead_origem ADD VALUE IF NOT EXISTS 'documentacao_self_service';",
    );
    expect(migration).not.toContain("ADD VALUE");
  });

  it("as rotas nunca registram o corpo nem o arquivo (PII)", () => {
    for (const rota of [
      "src/routes/api/public/documentacao.ts",
      "src/routes/api/public/documentacao-arquivo.ts",
      "src/lib/documentacao-link.server.ts",
    ]) {
      for (const linha of ler(rota)
        .split("\n")
        .filter((l) => l.includes("console."))) {
        expect(linha).toMatch(/console\.error\("\[[a-z-]+\] [^"$]+"\);/);
      }
    }
  });
});
