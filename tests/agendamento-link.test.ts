// Link de agendamento do corretor: regras puras (lib), a ponte do servidor
// (com o banco mockado) e o contrato da migration. O comportamento no banco
// de verdade está em tests/db/link-agendamento.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

import {
  COMPROVANTE_RE,
  agendarPeloLinkSchema,
  chipDia,
  configurarAgendamentoLinkSchema,
  descricaoEventoCliente,
  isNomeCompleto,
  mensagemConviteAgendamento,
  mensagemErroAgendamento,
  parseAgendamentoLinkResumo,
  parseAgendamentoLinks,
  parseLinkCriado,
  resumoAgendaDoLink,
  rotuloDia,
  rotuloInstante,
  telefoneSemDdi,
  tituloDoLink,
} from "@/lib/agendamento-link";
import {
  AgendamentoLinkError,
  agendarPeloLink,
  hashComprovante,
  novoComprovante,
  obterComprovante,
} from "@/lib/agendamento-link.server";

const SLUG = "Ab3_-xYz09QWerty";
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261022120000_link_agendamento_cliente.sql"),
  "utf8",
);
const migrationPorLocal = readFileSync(
  join(process.cwd(), "supabase/migrations/20261023120000_link_agendamento_por_local.sql"),
  "utf8",
);
const rotaPublica = readFileSync(
  join(process.cwd(), "src/routes/api/public/agendamento.ts"),
  "utf8",
);

function entrada(over: Record<string, unknown> = {}) {
  return {
    slug: SLUG,
    idempotency_key: "11111111-1111-4111-8111-111111111111",
    nome: "  Marina   Souza Lima ",
    telefone: "+55 (11) 98765-4321",
    email: " Marina@Exemplo.com ",
    cpf: "529.982.247-25",
    data: "2026-11-21",
    horario: "10:00",
    consentimento: true,
    ...over,
  };
}

describe("validação do formulário público", () => {
  it("normaliza nome, telefone (sem o 55), e-mail e CPF", () => {
    const r = agendarPeloLinkSchema.parse(entrada());
    expect(r.nome).toBe("Marina Souza Lima");
    expect(r.telefone).toBe("11987654321");
    expect(r.email).toBe("marina@exemplo.com");
    expect(r.cpf).toBe("52998224725");
  });

  it("exige nome e sobrenome, CPF válido, horário em meia hora e consentimento", () => {
    expect(agendarPeloLinkSchema.safeParse(entrada({ nome: "Marina" })).success).toBe(false);
    expect(agendarPeloLinkSchema.safeParse(entrada({ cpf: "123.456.789-00" })).success).toBe(false);
    expect(agendarPeloLinkSchema.safeParse(entrada({ horario: "10:15" })).success).toBe(false);
    expect(agendarPeloLinkSchema.safeParse(entrada({ consentimento: false })).success).toBe(false);
    expect(agendarPeloLinkSchema.safeParse(entrada({ telefone: "98765-4321" })).success).toBe(
      false,
    );
  });

  it("nome completo ignora iniciais e espaços sobrando", () => {
    expect(isNomeCompleto("Ana Souza")).toBe(true);
    expect(isNomeCompleto("Ana S.")).toBe(false);
    expect(isNomeCompleto("   ")).toBe(false);
    expect(telefoneSemDdi("5511987654321")).toBe("11987654321");
    expect(telefoneSemDdi("1132654321")).toBe("1132654321");
  });
});

const RESUMO = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: SLUG,
  endereco: "Rua Tuiuti, 2000, Tatuapé, São Paulo, SP",
  local_id: "cury-rua-tuiuti-2000",
  local_nome: "Cury · Stand Tatuapé",
  hora_inicio: "09:00",
  hora_fim: "18:00",
  dias_semana: [1, 2, 3, 4, 5, 6],
  duracao_minutos: 60,
  created_at: "2026-10-14T12:00:00Z",
  total_agendamentos: 0,
  ultimo_agendamento_em: null,
};

describe("configuração do link", () => {
  it("ordena e deduplica os dias; o último horário não vem antes do primeiro", () => {
    const ok = configurarAgendamentoLinkSchema.parse({
      endereco: "  Av. Paulista,   1000 ",
      local_id: "cury-av-paulista-1000",
      local_nome: " Cury ·  Stand Paulista ",
      hora_inicio: "09:00",
      hora_fim: "18:00",
      dias_semana: [6, 1, 1, 3],
      duracao_minutos: 60,
    });
    expect(ok.dias_semana).toEqual([1, 3, 6]);
    expect(ok.endereco).toBe("Av. Paulista, 1000");
    expect(ok.local_nome).toBe("Cury · Stand Paulista");
    expect(
      configurarAgendamentoLinkSchema.safeParse({ ...ok, hora_inicio: "18:00", hora_fim: "09:00" })
        .success,
    ).toBe(false);
    expect(configurarAgendamentoLinkSchema.safeParse({ ...ok, dias_semana: [] }).success).toBe(
      false,
    );
    // Endereço digitado: sem stand.
    expect(
      configurarAgendamentoLinkSchema.safeParse({ ...ok, local_id: null, local_nome: "" }).success,
    ).toBe(true);
  });

  it("lista de links, link criado (ja_existia) e o caminho público", () => {
    expect(parseAgendamentoLinks(null)).toEqual([]);
    const [r] = parseAgendamentoLinks([RESUMO]);
    expect(r.path).toBe(`/agendar/${SLUG}`);
    expect(parseLinkCriado({ ...RESUMO, ja_existia: true })).toMatchObject({
      jaExistia: true,
      link: { id: RESUMO.id, local_nome: "Cury · Stand Tatuapé" },
    });
    expect(() => parseAgendamentoLinkResumo({ ...RESUMO, slug: "curto" })).toThrow();
  });

  it("título e resumo da agenda do link", () => {
    expect(tituloDoLink(RESUMO)).toBe("Cury · Stand Tatuapé");
    expect(tituloDoLink({ local_nome: "", endereco: "Rua A, 1" })).toBe("Rua A, 1");
    expect(tituloDoLink({ local_nome: "", endereco: "" })).toBe("Endereço informado pelo cliente");
    expect(resumoAgendaDoLink(RESUMO)).toBe("Seg a Sáb · 09:00–18:00 · 1 h");
    expect(resumoAgendaDoLink({ ...RESUMO, dias_semana: [0, 6], duracao_minutos: 90 })).toBe(
      "Dom, Sáb · 09:00–18:00 · 1h30",
    );
    expect(resumoAgendaDoLink({ ...RESUMO, dias_semana: [0, 1, 2, 3, 4, 5, 6] })).toMatch(
      /^Todos os dias/,
    );
  });
});

describe("textos", () => {
  it("datas no fuso de São Paulo, independente do aparelho", () => {
    expect(rotuloDia("2026-11-21")).toBe("sábado, 21 de novembro");
    expect(chipDia("2026-11-21")).toEqual({ semana: "Sáb", dia: "21/11" });
    expect(rotuloInstante("2026-11-21T13:00:00.000Z")).toBe("sábado, 21 de novembro às 10:00");
  });

  it("convite, evento e erros", () => {
    expect(mensagemConviteAgendamento("https://x/agendar/a", "Ana Corretora")).toContain(
      "Aqui é Ana, da Seu Metro Quadrado.",
    );
    expect(
      mensagemConviteAgendamento("https://x/agendar/a", "Ana", "Cury · Stand Tatuapé"),
    ).toContain("sua visita no Cury · Stand Tatuapé por este link");
    const desc = descricaoEventoCliente({
      corretor_nome: "Ana",
      corretor_whatsapp: "5511987654321",
    });
    expect(desc).toContain("https://wa.me/5511987654321");
    expect(mensagemErroAgendamento("horario_indisponivel")).toMatch(/ocupado/);
    expect(mensagemErroAgendamento("qualquer_coisa")).toMatch(/Tente novamente/);
  });
});

describe("servidor", () => {
  beforeEach(() => rpc.mockReset());

  it("o comprovante é 256 bits e só o SHA-256 vai ao banco", () => {
    const { token, hash } = novoComprovante();
    expect(token).toMatch(COMPROVANTE_RE);
    expect(hash).toBe(hashComprovante(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honeypot preenchido recusa sem tocar no banco", async () => {
    const input = agendarPeloLinkSchema.parse(entrada({ website: "http://spam" }));
    await expect(agendarPeloLink(input)).rejects.toMatchObject({ status: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("manda telefone formatado e o hash; devolve o token do comprovante", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        agendamento_id: "33333333-3333-4333-8333-333333333333",
        inicio: "2026-11-21T13:00:00+00:00",
        fim: "2026-11-21T14:00:00+00:00",
        endereco: "Av. Paulista, 1000",
        corretor_nome: "Ana Corretora",
        corretor_whatsapp: "5511912345678",
      },
      error: null,
    });
    const r = await agendarPeloLink(agendarPeloLinkSchema.parse(entrada()));
    const [nome, args] = rpc.mock.calls[0];
    expect(nome).toBe("agendar_pelo_link");
    expect(args._telefone).toBe("(11) 98765-4321");
    expect(args._comprovante_hash).toBe(hashComprovante(r.comprovante));
    expect(r).not.toHaveProperty("ok");
  });

  it("recusa de negócio vira código estável; falha do banco vira 503", async () => {
    rpc.mockResolvedValue({ data: { ok: false, motivo: "horario_indisponivel" }, error: null });
    await expect(agendarPeloLink(agendarPeloLinkSchema.parse(entrada()))).rejects.toEqual(
      new AgendamentoLinkError(409, "horario_indisponivel"),
    );
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(agendarPeloLink(agendarPeloLinkSchema.parse(entrada()))).rejects.toMatchObject({
      status: 503,
    });
  });

  it("comprovante com formato errado nem consulta o banco", async () => {
    await expect(obterComprovante("curto")).rejects.toMatchObject({ status: 404 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("contrato da migration e da rota pública", () => {
  it("tabelas fechadas e funções públicas só para o service_role", () => {
    expect(migration).toContain(
      "REVOKE ALL ON public.agendamento_links FROM PUBLIC, anon, authenticated;",
    );
    for (const fn of [
      "consumir_agendamento_link_requisicao(text)",
      "obter_agendamento_link_publico(text)",
      "obter_agendamento_comprovante(text)",
    ]) {
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
      expect(migration).not.toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated`);
    }
  });

  it("a visita é produção do corretor e a zona volta ao normal depois do insert", () => {
    const agendar = migration.slice(migration.indexOf("FUNCTION public.agendar_pelo_link("));
    expect(agendar).toContain("_lead.id, _l.corretor_id, _l.corretor_id,");
    expect(agendar).toContain("PERFORM set_config('app.zona_override', _prev_zona, true);");
    expect(agendar).toContain("'agendamento_self_service'::public.lead_origem");
  });

  it("link por local: RPCs do corretor só para authenticated e as antigas saem", () => {
    for (const fn of [
      "meus_agendamento_links()",
      "trocar_agendamento_link(uuid)",
      "desativar_agendamento_link(uuid)",
    ]) {
      expect(migrationPorLocal).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon;`);
      expect(migrationPorLocal).toContain(
        `GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated;`,
      );
    }
    for (const antiga of [
      "meu_agendamento_link()",
      "gerar_novo_agendamento_link()",
      "desativar_meu_agendamento_link()",
    ]) {
      expect(migrationPorLocal).toContain(`DROP FUNCTION IF EXISTS public.${antiga};`);
    }
    // Um link por endereço ativo, por corretor.
    expect(migrationPorLocal).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_links_corretor_endereco_ativo[\s\S]*\(corretor_id, endereco_chave\)[\s\S]*WHERE revogado_em IS NULL/,
    );
  });

  it("a rota nunca registra o corpo (PII)", () => {
    expect(rotaPublica).not.toMatch(/console\.(log|error|warn)\([^)]*(request|body|text|input)/);
  });
});
