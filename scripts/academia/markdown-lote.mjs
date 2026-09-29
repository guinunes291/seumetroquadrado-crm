#!/usr/bin/env node
// Versão em Markdown de um lote da Academia SMQ, para leitura e revisão humana
// (seção 8.2 do super prompt: "a mesma ordem da anatomia"). Gera só os
// módulos; o resumo do lote (seção 8.3) é escrito à parte, no topo do arquivo.
//
// Uso:
//   node scripts/academia/markdown-lote.mjs --entrada <json> [--saida <md>]
//
// Sem --saida, imprime no stdout.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { RAIZ, aulaParaMarkdown, carregarLote, praticaParaMarkdown } from "./converter-lote.mjs";

const lista = (itens) => itens.map((t) => `- ${t}`).join("\n");

export function moduloParaMarkdown(m) {
  const s = [];
  s.push(`## ${m.codigo} · ${m.titulo}`);
  s.push(`*${m.subtitulo}*`);
  s.push(
    `Trilha ${m.trilha} · nível-alvo ${m.nivel_alvo} · ordem ${m.ordem} · ${m.duracao_min} min · pré-requisitos: ${m.pre_requisitos.join(", ") || "nenhum"} · origem: ${m.origem}`,
  );
  s.push(`### Capa\n\n**Objetivo de desempenho:** ${m.objetivo_desempenho}`);
  const v = m.por_que_vale_dinheiro;
  s.push(`**Por que isso vale dinheiro:** ${v.texto}\n\n*${v.numero} · ${v.fonte}, ${v.periodo}*`);
  s.push(`**Competências:**\n\n${lista(m.competencias)}`);
  const ind = m.indicador_crm;
  s.push(
    `**Indicador do CRM:** ${ind.nome}\n\n- Onde ler: ${ind.onde_ler}\n- Linha de base: ${ind.linha_de_base}\n- Meta sugerida: ${ind.meta_sugerida}\n- Fonte: ${ind.fonte}${ind.gap_de_crm ? "\n- [GAP DE CRM]" : ""}`,
  );

  for (const a of m.aulas) {
    s.push(`### ${a.codigo} · ${a.titulo} (${a.duracao_min} min)`);
    // Um nível abaixo do título da aula.
    s.push(
      aulaParaMarkdown(a)
        .replace(/^### /gm, "#### ")
        .replace(/^#### (?=\S+ · )/gm, "##### "),
    );
  }

  s.push(`### Prática\n\n${praticaParaMarkdown(m.pratica)}`);
  if (m.pratica.gabarito?.length)
    s.push(`**Gabarito (só o gerente):**\n\n${lista(m.pratica.gabarito)}`);

  const d = m.desafio_campo;
  s.push(
    `### Desafio de campo (${d.prazo_horas} horas)\n\n${d.tarefa}\n\n- Evidência no CRM: ${d.evidencia_no_crm}\n- Como o gerente confere: ${d.como_o_gestor_confere}`,
  );

  const letras = ["A", "B", "C", "D"];
  s.push(
    `### Quiz (${m.quiz.questoes.length} questões, sorteio de ${m.quiz.sorteio}, nota mínima ${m.quiz.nota_minima}%)\n\n${m.quiz.questoes
      .map(
        (q) =>
          `**${q.id}** (${q.tipo}) ${q.enunciado}\n\n${q.alternativas
            .map((alt, i) => `- ${letras[i]}) ${alt}${i === q.correta ? " ✓" : ""}`)
            .join("\n")}\n\n*${q.explicacao}* Fonte: ${q.fonte}.`,
      )
      .join("\n\n")}`,
  );

  s.push(
    `### Flashcards\n\n| Frente | Verso |\n|---|---|\n${m.flashcards
      .map((f) => `| ${f.frente.replaceAll("|", "/")} | ${f.verso.replaceAll("|", "/")} |`)
      .join("\n")}`,
  );

  const r = m.roteiro_video;
  s.push(
    `### Roteiro de vídeo (${r.duracao_min} min)\n\nQuem grava: ${r.quem_grava} · Cenário: ${r.cenario}\n\n| Tempo | Fala | Na tela |\n|---|---|---|\n${r.blocos
      .map(
        (b) =>
          `| ${b.tempo} | ${b.fala.replaceAll("|", "/")} | ${b.na_tela.replaceAll("|", "/")} |`,
      )
      .join("\n")}`,
  );

  const g = m.guia_gestor;
  s.push(
    `### Guia do gerente\n\n${g.como_aplicar}\n\n**Sinais de que não absorveu:**\n\n${lista(g.sinais_de_dificuldade)}\n\n**Perguntas de coaching:**\n\n${lista(g.perguntas_de_coaching)}\n\n**Onde celebrar:** ${g.ritual_de_celebracao}`,
  );

  s.push(
    `### Metadados\n\n- Fontes internas: ${m.fontes_internas.join("; ")}\n- Versão ${m.versao} · revisão ${m.data_revisao} · dono: ${m.dono_do_conteudo}\n\n**Pendências:**\n\n${m.pendencias.length ? lista(m.pendencias) : "- nenhuma"}`,
  );
  return s.join("\n\n");
}

function main(argv) {
  const arg = (n) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const lote = carregarLote(arg("--entrada"));
  const md = `${lote.modulos.map(moduloParaMarkdown).join("\n\n---\n\n")}\n`;
  const saida = arg("--saida");
  if (saida) {
    writeFileSync(path.resolve(RAIZ, saida), md);
    console.log(`gerado ${saida}`);
  } else process.stdout.write(md);
}

main(process.argv.slice(2));
