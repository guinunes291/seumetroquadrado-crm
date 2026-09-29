#!/usr/bin/env node
// Conversor da Academia SMQ: formato canônico (seção 8.2 do super prompt) →
// seed SQL no schema do CRM (Fatia 1 + 20261005120000_academia_lote1_estrutura).
//
// Converte o FORMATO, não o texto: todo campo de texto do JSON chega ao banco
// igual, com uma única exceção declarada em SUBSTITUICOES (nomes de tela
// conferidos no repositório, aprovados pelo Guilherme em 29/09/2026). O
// validador (validar-lote.mjs) prova as duas coisas.
//
// Uso:
//   node scripts/academia/converter-lote.mjs [--entrada <json>] [--espelhar]
//
//   --entrada   JSON canônico do lote (padrão: docs/academia/lote-1/academia-smq-lote-1.json,
//               que fica fora do git)
//   --espelhar  também copia as migrations para drizzle/migrations (byte a byte),
//               com entrada no _journal.json e snapshot encadeado
//
// Cada módulo vira UMA migration de seed, idempotente: upsert pelo código do
// módulo, da aula (M15-A1), da questão (M15-Q01) e do flashcard (M15-F01), e
// só enquanto o módulo está em 'rascunho' (módulo publicado nunca é tocado).
// Conteúdo antigo sem código (o seed da Fatia 1) é arquivado, nunca apagado.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRADA_PADRAO = "docs/academia/lote-1/academia-smq-lote-1.json";

// ---------------------------------------------------------------------------
// Lotes: nome de cada migration e posição no journal do drizzle.
// O timestamp precisa ser maior que o de todas as migrations já aplicadas
// (scripts/db-harness/README.md, "Numeração"); o "when" do journal também.
// ---------------------------------------------------------------------------
export const LOTES = {
  1: {
    estrutura: { migration: "20261006120000_academia_lote1_estrutura", idx: 24 },
    modulos: {
      M00: { migration: "20261006120100_academia_lote1_m00", idx: 25 },
      M25: { migration: "20261006120200_academia_lote1_m25", idx: 26 },
      M26: { migration: "20261006120300_academia_lote1_m26", idx: 27 },
      M27: { migration: "20261006120400_academia_lote1_m27", idx: 28 },
      M15: { migration: "20261006120500_academia_lote1_m15", idx: 29 },
    },
    // 2026-10-06 15:00 UTC (12:00 de Brasília), 1 minuto por migration,
    // mesmo padrão das entradas 0016 a 0021.
    journalBase: Date.UTC(2026, 9, 6, 15, 0, 0),
  },
};

// Trilha do super prompt → fase do CRM (academia_fases.numero).
const FASE_DA_TRILHA = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };

// Nível-alvo do texto → enum academia_nivel. O texto mantém "Apto"
// (decisão de 29/09/2026); o sistema chama o mesmo nível de 'habilitado'.
const NIVEL_DO_SISTEMA = {
  Iniciante: "iniciante",
  Apto: "habilitado",
  Intermediário: "intermediario",
  Especialista: "especialista",
  Mestre: "mestre",
};

// Rubrica padrão SMQ (seção 7.4 do super prompt). A prática de cada módulo
// diz quais critérios usa ("critérios 1 (...), 3 (...)" ou "completa").
const RUBRICA_PADRAO_SMQ = {
  1: "Abertura e conexão: personalização, nome, prova de que leu o cadastro",
  2: "Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez",
  3: "Condução: toda fala termina em pergunta, próximo passo concreto",
  4: "Objeção: validar, investigar, endereçar, ação",
  5: 'Desfecho: dia e hora ou documento; duas opções; nada de "vou pensar" aceito sem horário',
  6: "Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)",
  7: "Registro no CRM: desfecho, próximo passo e data",
};

// ---------------------------------------------------------------------------
// As ÚNICAS alterações de texto. Cada uma falha alto se o trecho de origem não
// for encontrado (o JSON mudou e a troca precisa ser revista).
// ---------------------------------------------------------------------------
const TELA_1A_RESPOSTA_GERENTE = 'Operação › Relatórios › Time › "Tempo de 1ª resposta"';
export const SUBSTITUICOES = [
  {
    modulo: "M00",
    caminho: ["aulas", 3, "no_crm", "tela"],
    de: "Módulo Academia no portal de módulos",
    para: "Academia › Minha trilha",
  },
  {
    modulo: "M25",
    caminho: ["desafio_campo", "como_o_gestor_confere"],
    de: "Painel do Gestor › Dia",
    para: "Operação › Dia",
  },
  {
    modulo: "M26",
    caminho: ["indicador_crm", "onde_ler"],
    de: "Meu Raio-X (atendimento) e, para o gerente, Painel do Gestor › Dia e aba Histórico da Distribuição (repasses por SLA) [CONFIRMAR a tela exata]",
    para: `Meu Raio-X › tabela mensal, coluna "1ª resp." (em horas e minutos) e, para o gerente, ${TELA_1A_RESPOSTA_GERENTE} e Distribuição › aba Histórico (repasses por SLA)`,
  },
  {
    modulo: "M26",
    caminho: ["desafio_campo", "como_o_gestor_confere"],
    de: "Abre o Meu Raio-X do corretor (atendimento) e o histórico da Distribuição, conferindo os repasses por SLA nas 48 horas. [CONFIRMAR a tela exata]",
    para: `Abre ${TELA_1A_RESPOSTA_GERENTE} e Distribuição › aba Histórico, conferindo a 1ª resposta do corretor e os repasses por SLA nas 48 horas.`,
  },
  {
    modulo: "M27",
    caminho: ["indicador_crm", "onde_ler"],
    de: "Painel do Gestor para o time [CONFIRMAR filtro]",
    para: `${TELA_1A_RESPOSTA_GERENTE} para o time`,
  },
  {
    modulo: "M15",
    caminho: ["indicador_crm", "onde_ler"],
    de: "Painel do Gestor › Funil",
    para: "Operação › Funil",
  },
];

// Pendências resolvidas no Passo 0 (saem da lista) e a que entrou no lugar.
export const PENDENCIAS = [
  {
    modulo: "M00",
    remover: "[CONFIRMAR] Nome exato do módulo Academia no portal de módulos do CRM.",
  },
  {
    modulo: "M26",
    remover:
      "[CONFIRMAR] Tela exata onde o corretor e o gerente leem o tempo até o primeiro contato e os repasses por SLA.",
    incluir:
      "[GAP DE CRM] O Meu Raio-X e a Operação mostram a 1ª resposta em minutos corridos desde a chegada do lead; o tempo em minutos úteis (o limite de 15 minutos) só aparece na Gestão da Academia. Proposta: indicador em horas e minutos no topo do Meu Raio-X.",
  },
  {
    modulo: "M27",
    remover:
      "[CONFIRMAR] Filtro exato da base de leads para o gerente conferir os handoffs por corretor.",
  },
];

// ---------------------------------------------------------------------------
// Transformação do lote (puro: não lê nem escreve disco)
// ---------------------------------------------------------------------------
export function aplicarAjustes(lote) {
  const copia = structuredClone(lote);
  const aplicadas = [];
  const porCodigo = new Map(copia.modulos.map((m) => [m.codigo, m]));

  for (const s of SUBSTITUICOES) {
    const mod = porCodigo.get(s.modulo);
    if (!mod) continue;
    const pai = s.caminho.slice(0, -1).reduce((o, k) => o?.[k], mod);
    const chave = s.caminho.at(-1);
    const atual = pai?.[chave];
    if (typeof atual !== "string" || !atual.includes(s.de)) {
      throw new Error(
        `substituição não encontrada em ${s.modulo}.${s.caminho.join(".")}: "${s.de}"`,
      );
    }
    pai[chave] = atual.replace(s.de, s.para);
    aplicadas.push({ ...s, antes: atual, depois: pai[chave] });
  }

  for (const p of PENDENCIAS) {
    const mod = porCodigo.get(p.modulo);
    if (!mod) continue;
    const i = mod.pendencias.indexOf(p.remover);
    if (i < 0) throw new Error(`pendência não encontrada em ${p.modulo}: "${p.remover}"`);
    if (p.incluir) mod.pendencias.splice(i, 1, p.incluir);
    else mod.pendencias.splice(i, 1);
    aplicadas.push(p);
  }
  return { lote: copia, aplicadas };
}

const lista = (itens) => itens.map((t) => `- ${t}`).join("\n");

// Os 10 blocos da aula (seção 7.2), na ordem da anatomia, em markdown para
// academia_aulas.conteudo_md (a tela renderiza com react-markdown + GFM).
export function aulaParaMarkdown(a) {
  const partes = [a.gancho];
  partes.push(`### Por que importa\n\n${a.por_que_importa}`);
  partes.push(`### O conceito\n\n${a.conceito}`);
  partes.push(
    `### O método SMQ, passo a passo\n\n${a.metodo.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
  );
  const v = a.na_vida_real;
  partes.push(
    `### Na vida real\n\n**O caso:** ${v.caso}\n\n**O que foi dito:** ${v.o_que_foi_dito}\n\n**O que aconteceu:** ${v.resultado}`,
  );
  partes.push(
    `### Scripts prontos\n\n${a.scripts
      .map(
        (s) =>
          `#### ${s.canal} · ${s.situacao}\n\n> ${s.texto}\n\n**Por que funciona:** ${s.por_que_funciona}`,
      )
      .join("\n\n")}`,
  );
  partes.push(
    `### Erros que matam a venda\n\n${a.erros_que_matam
      .map((e) => `- **${e.erro}**  \n  Quanto custa: ${e.custo}  \n  Correção: ${e.correcao}`)
      .join("\n")}`,
  );
  const c = a.no_crm;
  partes.push(
    `### No CRM\n\n- **Tela:** ${c.tela}\n- **Ação:** ${c.acao}\n- **Campo:** ${c.campo}\n- **Regra:** ${c.regra}`,
  );
  partes.push(`### Frase-âncora\n\n> **${a.frase_ancora}**`);
  partes.push(
    `### Checagem rápida\n\n${a.checagem_rapida
      .map((q, i) => `${i + 1}. ${q.pergunta}  \n   Resposta: ${q.resposta}`)
      .join("\n")}`,
  );
  return partes.join("\n\n");
}

// Prática para academia_modulos.pratica_descricao. O gabarito NÃO entra: ele
// vai para academia_conteudo_gerente, que o aluno não lê.
export function praticaParaMarkdown(p) {
  const partes = [`**${p.tipo}** · ${p.duracao_min} min`];
  if (p.papeis) partes.push(`**Papéis:** ${p.papeis}`);
  if (p.persona) partes.push(`**Persona:** ${p.persona}`);
  partes.push(`**Roteiro:** ${p.roteiro}`);
  if (p.roteiro_cliente?.length)
    partes.push(`**Roteiro do cliente:**\n\n${lista(p.roteiro_cliente)}`);
  if (p.observador_procura?.length)
    partes.push(`**O que o observador procura:**\n\n${lista(p.observador_procura)}`);
  partes.push(
    `**Rubrica:** ${p.rubrica}. Aprovação: média ${String(p.nota_minima).replace(".", ",")} ou mais.`,
  );
  return partes.join("\n\n");
}

export function rubricaDaPratica(texto) {
  const numeros = /completa/i.test(texto)
    ? Object.keys(RUBRICA_PADRAO_SMQ).map(Number)
    : [...texto.matchAll(/(\d)\s*\(/g)].map((m) => Number(m[1]));
  if (!numeros.length || numeros.some((n) => !RUBRICA_PADRAO_SMQ[n])) {
    throw new Error(`rubrica não reconhecida: "${texto}"`);
  }
  return numeros.map((n) => ({ criterio: RUBRICA_PADRAO_SMQ[n], peso: 1 }));
}

const pad2 = (n) => String(n).padStart(2, "0");

export function moduloParaLinhas(m, lote) {
  if (!(m.trilha in FASE_DA_TRILHA))
    throw new Error(`${m.codigo}: trilha desconhecida ${m.trilha}`);
  if (!(m.nivel_alvo in NIVEL_DO_SISTEMA))
    throw new Error(`${m.codigo}: nível desconhecido ${m.nivel_alvo}`);
  const { gabarito, ...praticaSemGabarito } = m.pratica;

  const modulo = {
    codigo: m.codigo,
    numero: Number(m.codigo.replace(/\D/g, "")),
    fase: FASE_DA_TRILHA[m.trilha],
    titulo: m.titulo,
    objetivo_principal: m.objetivo_desempenho,
    objetivos: m.competencias,
    carga_horaria_h: Math.round((m.duracao_min / 60) * 10) / 10,
    carga_horaria_texto: `${m.duracao_min} min`,
    exige_pratica: true,
    pratica_descricao: praticaParaMarkdown(m.pratica),
    pratica_rubrica: rubricaDaPratica(m.pratica.rubrica),
    nota_minima: m.quiz.nota_minima,
    revisao_pendente: [
      `LOTE ${lote.lote} v${lote.versao} importado: revisar no CRM antes de publicar.`,
      ...m.pendencias,
    ].join(" | "),
    extras: {
      formato: "canonico-8.2",
      lote: lote.lote,
      versao_conteudo: m.versao,
      trilha: m.trilha,
      ordem: m.ordem,
      nivel_alvo: m.nivel_alvo,
      nivel_alvo_sistema: NIVEL_DO_SISTEMA[m.nivel_alvo],
      subtitulo: m.subtitulo,
      duracao_min: m.duracao_min,
      por_que_vale_dinheiro: m.por_que_vale_dinheiro,
      pre_requisitos: m.pre_requisitos,
      indicador_crm: m.indicador_crm,
      pratica: praticaSemGabarito,
      desafio_campo: m.desafio_campo,
      quiz: { nota_minima: m.quiz.nota_minima, sorteio: m.quiz.sorteio },
      roteiro_video: m.roteiro_video,
      fontes_internas: m.fontes_internas,
      origem: m.origem,
      pendencias: m.pendencias,
      data_revisao: m.data_revisao,
      dono_do_conteudo: m.dono_do_conteudo,
    },
  };

  const aulas = m.aulas.map((a, i) => {
    const { codigo, titulo, duracao_min, ...blocos } = a;
    return {
      codigo,
      ordem: i + 1,
      titulo,
      duracao_min,
      conteudo_md: aulaParaMarkdown(a),
      extras: { formato: "canonico-8.2", ...blocos },
    };
  });

  const questoes = m.quiz.questoes.map((q, i) => ({
    codigo: q.id,
    ordem: i + 1,
    tipo: q.tipo,
    enunciado: q.enunciado,
    alternativas: q.alternativas,
    correta: q.correta,
    explicacao: q.explicacao,
    fonte: q.fonte,
  }));

  const flashcards = m.flashcards.map((f, i) => ({
    codigo: `${m.codigo}-F${pad2(i + 1)}`,
    ordem: i + 1,
    frente: f.frente,
    verso: f.verso,
  }));

  const gerente = { guia_gestor: m.guia_gestor };
  if (gabarito) gerente.pratica_gabarito = gabarito;

  return { modulo, aulas, questoes, flashcards, gerente };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
export const lit = (v) => (v == null ? "null" : `'${String(v).replaceAll("'", "''")}'`);
const js = (v) => `${lit(JSON.stringify(v))}::jsonb`;
const listaSql = (vs) => vs.map(lit).join(", ");

export function moduloParaSql(linhas, { lote, arquivoFonte }) {
  const { modulo: m, aulas, questoes, flashcards, gerente } = linhas;
  const cod = lit(m.codigo);
  const alvo = `FROM public.academia_modulos m WHERE m.codigo = ${cod} AND m.status = 'rascunho'`;
  const out = [];

  out.push(`-- ===========================================================================
-- ACADEMIA SMQ · LOTE ${lote.lote} (v${lote.versao}) · seed do módulo ${m.codigo}
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de ${arquivoFonte}.
-- Não edite à mão: corrija o JSON (ou o conversor) e gere de novo.
--
-- Idempotente: upsert pelo código do módulo, da aula, da questão e do
-- flashcard, só enquanto o módulo está em 'rascunho'. Conteúdo antigo sem
-- código é arquivado (aula 'arquivado', questão ativa = false), nunca apagado.
-- ${aulas.length} aulas · ${questoes.length} questões · ${flashcards.length} flashcards
-- ===========================================================================
`);

  out.push(`-- 1. Módulo
INSERT INTO public.academia_modulos
  (codigo, numero, fase, titulo, objetivo_principal, objetivos, carga_horaria_h,
   carga_horaria_texto, exige_pratica, pratica_descricao, pratica_rubrica, nota_minima,
   status, revisao_pendente, extras)
VALUES
  (${cod}, ${m.numero}, ${m.fase}, ${lit(m.titulo)}, ${lit(m.objetivo_principal)},
   ${js(m.objetivos)}, ${m.carga_horaria_h}, ${lit(m.carga_horaria_texto)}, ${m.exige_pratica},
   ${lit(m.pratica_descricao)}, ${js(m.pratica_rubrica)}, ${m.nota_minima},
   'rascunho', ${lit(m.revisao_pendente)}, ${js(m.extras)})
ON CONFLICT (codigo) DO UPDATE SET
  numero             = EXCLUDED.numero,
  fase               = EXCLUDED.fase,
  titulo             = EXCLUDED.titulo,
  objetivo_principal = EXCLUDED.objetivo_principal,
  objetivos          = EXCLUDED.objetivos,
  carga_horaria_h    = EXCLUDED.carga_horaria_h,
  carga_horaria_texto = EXCLUDED.carga_horaria_texto,
  exige_pratica      = EXCLUDED.exige_pratica,
  pratica_descricao  = EXCLUDED.pratica_descricao,
  pratica_rubrica    = EXCLUDED.pratica_rubrica,
  nota_minima        = EXCLUDED.nota_minima,
  revisao_pendente   = EXCLUDED.revisao_pendente,
  extras             = EXCLUDED.extras,
  atualizado_em      = now()
WHERE public.academia_modulos.status = 'rascunho';
`);

  // Conteúdo antigo: arquivar tudo que não tem código ou saiu do lote, e
  // tirar da frente as ordens que o conteúdo novo vai ocupar.
  const nA = aulas.length;
  const nQ = questoes.length;
  const nF = flashcards.length;
  out.push(`-- 2. Conteúdo antigo: arquivado, não apagado
UPDATE public.academia_aulas a
   SET status = 'arquivado', atualizado_em = now()
  ${alvo}
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN (${listaSql(aulas.map((a) => a.codigo))}));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  ${alvo}
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= ${nA};

UPDATE public.academia_questoes q
   SET ativa = false
  ${alvo}
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN (${listaSql(questoes.map((q) => q.codigo))}));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  ${alvo}
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= ${nQ};

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  ${alvo}
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN (${listaSql(flashcards.map((f) => f.codigo))});
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  ${alvo}
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= ${nF};
`);

  out.push(`-- 3. Aulas (${nA})`);
  for (const a of aulas) {
    out.push(`INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, ${lit(a.codigo)}, ${a.ordem}, ${lit(a.titulo)}, 'texto',
  ${lit(a.conteudo_md)},
  ${a.duracao_min}, 'publicado',
  ${js(a.extras)}
${alvo}
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();
`);
  }

  out.push(`-- 4. Questões (${nQ}); correta é o índice 0-based da alternativa`);
  for (const q of questoes) {
    out.push(`INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, ${lit(q.codigo)}, ${q.ordem}, ${lit(q.tipo)},
  ${lit(q.enunciado)},
  ${js(q.alternativas)},
  ${q.correta},
  ${lit(q.explicacao)},
  ${lit(q.fonte)}, true
${alvo}
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;
`);
  }

  out.push(`-- 5. Flashcards (${nF})`);
  for (const f of flashcards) {
    out.push(`INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, ${lit(f.codigo)}, ${f.ordem}, ${lit(f.frente)}, ${lit(f.verso)}, true
${alvo}
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();
`);
  }

  out.push(`-- 6. Material do gerente (guia do gerente${gerente.pratica_gabarito ? " e gabarito da prática" : ""})
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, ${js(gerente)}
${alvo}
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
`);

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Drizzle: cópia byte a byte + journal + snapshot vazio encadeado
// ---------------------------------------------------------------------------
const uuidDeterministico = (semente) => {
  const h = createHash("sha256").update(semente).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export function espelhar(migrations, journalBase) {
  const dirD = path.join(RAIZ, "drizzle/migrations");
  const journalPath = path.join(dirD, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));

  migrations.forEach(({ migration, idx }, i) => {
    const nome = migration.replace(/^\d+_/, "");
    const tag = `${String(idx).padStart(4, "0")}_${nome}`;
    copyFileSync(
      path.join(RAIZ, "supabase/migrations", `${migration}.sql`),
      path.join(dirD, `${tag}.sql`),
    );

    const existente = journal.entries.find((e) => e.idx === idx);
    if (existente && existente.tag !== tag) {
      throw new Error(`journal: idx ${idx} já é ${existente.tag}, não ${tag}`);
    }
    if (!existente) {
      journal.entries.push({
        idx,
        version: "7",
        when: journalBase + i * 60_000,
        tag,
        breakpoints: true,
      });
    }

    const anterior = JSON.parse(
      readFileSync(
        path.join(dirD, "meta", `${String(idx - 1).padStart(4, "0")}_snapshot.json`),
        "utf8",
      ),
    );
    const snapshot = {
      id: uuidDeterministico(tag),
      prevId: anterior.id,
      version: "7",
      dialect: "postgresql",
      tables: {},
      enums: {},
      schemas: {},
      views: {},
      sequences: {},
      roles: {},
      policies: {},
      _meta: { columns: {}, schemas: {}, tables: {} },
    };
    writeFileSync(
      path.join(dirD, "meta", `${String(idx).padStart(4, "0")}_snapshot.json`),
      `${JSON.stringify(snapshot, null, 2)}\n`,
    );
  });

  journal.entries.sort((a, b) => a.idx - b.idx);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export function carregarLote(entrada = ENTRADA_PADRAO) {
  const caminho = path.resolve(RAIZ, entrada);
  if (!existsSync(caminho)) throw new Error(`entrada não encontrada: ${caminho}`);
  return JSON.parse(readFileSync(caminho, "utf8"));
}

function main(argv) {
  const i = argv.indexOf("--entrada");
  const entrada = i >= 0 ? argv[i + 1] : ENTRADA_PADRAO;
  const bruto = carregarLote(entrada);
  const cfg = LOTES[bruto.lote];
  if (!cfg) throw new Error(`lote ${bruto.lote} sem configuração em LOTES`);

  const { lote, aplicadas } = aplicarAjustes(bruto);
  const arquivoFonte = path.relative(RAIZ, path.resolve(RAIZ, entrada));
  const geradas = [];
  for (const m of lote.modulos) {
    const alvo = cfg.modulos[m.codigo];
    if (!alvo) throw new Error(`${m.codigo} sem migration configurada no lote ${bruto.lote}`);
    const sql = moduloParaSql(moduloParaLinhas(m, lote), { lote, arquivoFonte });
    writeFileSync(path.join(RAIZ, "supabase/migrations", `${alvo.migration}.sql`), sql);
    geradas.push(alvo);
    console.log(`gerado supabase/migrations/${alvo.migration}.sql`);
  }
  console.log(`${aplicadas.length} ajustes de texto aplicados (SUBSTITUICOES + PENDENCIAS)`);

  if (argv.includes("--espelhar")) {
    espelhar([cfg.estrutura, ...geradas], cfg.journalBase);
    console.log(`espelhadas ${geradas.length + 1} migrations em drizzle/migrations`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
