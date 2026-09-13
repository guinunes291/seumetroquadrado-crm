/**
 * Materiais de venda do empreendimento (projeto_materiais) — RLS e CHECKs num
 * Postgres real (migration 20260913190000, docs/portal-empreendimento.md).
 *
 * Regras guardadas:
 * - corretor lê materiais ATIVOS de qualquer projeto (munição é do time),
 *   não vê inativos e não escreve (INSERT 42501; UPDATE/DELETE afetam 0 linhas);
 * - gestor e admin inserem, ocultam, reordenam e removem; veem inativos;
 * - CHECKs: só http(s), tipo fechado, título obrigatório;
 * - projeto_eventos aceita o gesto novo `material_abrir` e recusa tipo inventado;
 * - remover o projeto remove os materiais (ON DELETE CASCADE).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarProjeto,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let corretor: UsuarioTeste;
let gestor: UsuarioTeste;
let admin: UsuarioTeste;
let projetoId: string;
let materialId: string;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  corretor = await criarUsuario(c, { nome: "Corretor M", papel: "corretor" });
  gestor = await criarUsuario(c, { nome: "Gestor M", papel: "gestor" });
  admin = await criarUsuario(c, { nome: "Admin M", papel: "admin" });
  projetoId = await criarProjeto(c, { nome: "Residencial Materiais" });
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.projetos WHERE id = $1`, [projetoId]);
  await c.end();
});

describe("escrita é da gestão", () => {
  it("corretor não insere material (42501)", async () => {
    await comoUsuario(c, corretor.id);
    const code = await errCode(
      c.query(
        `INSERT INTO public.projeto_materiais (projeto_id, tipo, titulo, url)
         VALUES ($1, 'planta', 'Planta 2 dorms', 'https://drive.google.com/p')`,
        [projetoId],
      ),
    );
    expect(code).toBe("42501");
  });

  it("gestor insere; o material nasce ativo, com ordem 0 e criado_por", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `INSERT INTO public.projeto_materiais (projeto_id, tipo, titulo, url, descricao, criado_por)
       VALUES ($1, 'planta', 'Planta 2 dorms', 'https://drive.google.com/p', 'final 1 e 2', $2)
       RETURNING id, ativo, ordem, criado_por`,
      [projetoId, gestor.id],
    );
    materialId = r.rows[0].id;
    expect(r.rows[0]).toMatchObject({ ativo: true, ordem: 0, criado_por: gestor.id });
  });

  it("admin também insere e reordena", async () => {
    await comoUsuario(c, admin.id);
    const ins = await c.query(
      `INSERT INTO public.projeto_materiais (projeto_id, tipo, titulo, url, ordem)
       VALUES ($1, 'video', 'Tour do decorado', 'https://youtu.be/x', 20) RETURNING id`,
      [projetoId],
    );
    const upd = await c.query(`UPDATE public.projeto_materiais SET ordem = 30 WHERE id = $1`, [
      ins.rows[0].id,
    ]);
    expect(upd.rowCount).toBe(1);
  });
});

describe("leitura é do time", () => {
  it("corretor lê os ativos do projeto", async () => {
    await comoUsuario(c, corretor.id);
    const r = await c.query(
      `SELECT titulo, tipo FROM public.projeto_materiais WHERE projeto_id = $1 ORDER BY ordem`,
      [projetoId],
    );
    expect(r.rows.map((x) => x.titulo)).toEqual(["Planta 2 dorms", "Tour do decorado"]);
  });

  it("corretor não altera nem apaga (0 linhas, sem erro)", async () => {
    await comoUsuario(c, corretor.id);
    const upd = await c.query(
      `UPDATE public.projeto_materiais SET titulo = 'hackeado' WHERE id = $1`,
      [materialId],
    );
    expect(upd.rowCount).toBe(0);
    const del = await c.query(`DELETE FROM public.projeto_materiais WHERE id = $1`, [materialId]);
    expect(del.rowCount).toBe(0);
  });

  it("material ocultado pela gestão some para o corretor e segue visível para o gestor", async () => {
    await comoUsuario(c, gestor.id);
    const upd = await c.query(
      `UPDATE public.projeto_materiais SET ativo = false WHERE id = $1 RETURNING updated_at > created_at AS carimbou`,
      [materialId],
    );
    expect(upd.rowCount).toBe(1);
    expect(upd.rows[0].carimbou).toBe(true); // trigger de updated_at

    await comoUsuario(c, corretor.id);
    const doCorretor = await c.query(
      `SELECT id FROM public.projeto_materiais WHERE projeto_id = $1`,
      [projetoId],
    );
    expect(doCorretor.rows.map((x) => x.id)).not.toContain(materialId);

    await comoUsuario(c, gestor.id);
    const doGestor = await c.query(
      `SELECT id FROM public.projeto_materiais WHERE projeto_id = $1`,
      [projetoId],
    );
    expect(doGestor.rows.map((x) => x.id)).toContain(materialId);
  });
});

describe("CHECKs espelham o formulário", () => {
  it("recusa link sem http(s), tipo fora da lista e título em branco (23514)", async () => {
    await comoUsuario(c, gestor.id);
    const semHttp = await errCode(
      c.query(
        `INSERT INTO public.projeto_materiais (projeto_id, tipo, titulo, url)
         VALUES ($1, 'book', 'Book', 'ftp://x/book.pdf')`,
        [projetoId],
      ),
    );
    const tipoRuim = await errCode(
      c.query(
        `INSERT INTO public.projeto_materiais (projeto_id, tipo, titulo, url)
         VALUES ($1, 'pdf', 'Book', 'https://x/book.pdf')`,
        [projetoId],
      ),
    );
    const semTitulo = await errCode(
      c.query(
        `INSERT INTO public.projeto_materiais (projeto_id, tipo, titulo, url)
         VALUES ($1, 'book', '   ', 'https://x/book.pdf')`,
        [projetoId],
      ),
    );
    expect([semHttp, tipoRuim, semTitulo]).toEqual(["23514", "23514", "23514"]);
  });
});

describe("projeto_eventos: gesto material_abrir", () => {
  it("corretor registra o próprio gesto com o tipo novo; tipo inventado é recusado", async () => {
    await comoUsuario(c, corretor.id);
    const ok = await c.query(
      `INSERT INTO public.projeto_eventos (projeto_id, user_id, tipo, origem, detalhe)
       VALUES ($1, $2, 'material_abrir', 'ficha', 'Planta 2 dorms') RETURNING id`,
      [projetoId, corretor.id],
    );
    expect(ok.rowCount).toBe(1);
    const ruim = await errCode(
      c.query(
        `INSERT INTO public.projeto_eventos (projeto_id, user_id, tipo)
         VALUES ($1, $2, 'galeria_abrir')`,
        [projetoId, corretor.id],
      ),
    );
    expect(ruim).toBe("23514");
    // Os tipos antigos continuam válidos.
    const antigo = await c.query(
      `INSERT INTO public.projeto_eventos (projeto_id, user_id, tipo) VALUES ($1, $2, 'book_abrir') RETURNING id`,
      [projetoId, corretor.id],
    );
    expect(antigo.rowCount).toBe(1);
  });
});

describe("ciclo de vida", () => {
  it("gestor remove; apagar o projeto leva os materiais junto", async () => {
    await comoUsuario(c, gestor.id);
    const del = await c.query(`DELETE FROM public.projeto_materiais WHERE id = $1`, [materialId]);
    expect(del.rowCount).toBe(1);

    await comoSuperuser(c);
    const outro = await criarProjeto(c, { nome: "Projeto efêmero" });
    await c.query(
      `INSERT INTO public.projeto_materiais (projeto_id, tipo, titulo, url)
       VALUES ($1, 'arte', 'Story lançamento', 'https://canva.com/x')`,
      [outro],
    );
    await c.query(`DELETE FROM public.projetos WHERE id = $1`, [outro]);
    const sobra = await c.query(
      `SELECT count(*)::int AS n FROM public.projeto_materiais WHERE projeto_id = $1`,
      [outro],
    );
    expect(sobra.rows[0].n).toBe(0);
  });
});
