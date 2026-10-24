// Registro ÚNICO dos sistemas do CRM — fonte de verdade da navegação.
// Cada card do hub /inicio é um sistema completo (estilo Dommus): tem home,
// seções (a sidebar contextual mostra só as do sistema ativo) e regra de
// papel. Consomem este registro: o hub (inicio-page), a sidebar (app-sidebar),
// o command palette e os testes (tests/sistemas.test.ts).
//
// Regra dos 2 menus (decisão do dono, 2026-09-11): dentro de um módulo há no
// máximo DOIS níveis de menu — (1) a sidebar do módulo, que lista só PÁGINAS,
// curta e plana, e (2) no máximo uma linha de abas internas da página. Nada de
// seção de sidebar que só repete uma aba da mesma tela, nem de hub "vitrine"
// que só reagrupa telas de outro módulo. Efeitos: o hub Comunicações saiu
// (Discador e Oferta Ativa foram para a Prospecção; Mensagens segue viva pelo
// ⌘K), a Gestão de Carteira ficou com Base de leads · Kanban · Agenda ·
// Tarefas, e o Modo Visita virou módulo próprio. Para o corretor, nenhum
// módulo do dia passa de 4 seções.
//
// Este desenho SUPERSEDE a IA da auditoria ux-ia-2026-08 ("teto de 7 botões"
// num menu global): o teto agora vale por sistema — cada sistema tem ≤6
// seções planas, e o nível de cima virou o hub de módulos.
//
// Arquivo puro (sem React) de propósito: os filtros e o resolvedor de sistema
// ativo são funções puras testáveis.
//
// Desde a quebra em módulos (2026-10), este arquivo só reexporta: o registro
// mora em sistemas-registro.ts (e nos arquivos por grupo), as regras em
// sistemas-visibilidade.ts e sistema-ativo.ts.

export type { Destino, PapelCtx, Secao, Sistema, SistemaId } from "@/features/nav/sistemas-tipos";
export { SISTEMAS, SISTEMA_ACADEMIA, SISTEMAS_NAV } from "@/features/nav/sistemas-registro";
export { ATALHOS_EXTRAS, type AtalhoExtra } from "@/features/nav/sistemas-atalhos";
export {
  badgeDaSecao,
  badgeDoSistema,
  homeDoSistema,
  numeroDoModulo,
  secoesVisiveis,
  sistemasVisiveis,
  sistemaVisivel,
} from "@/features/nav/sistemas-visibilidade";
export { temPapel } from "@/features/nav/sistemas-papeis";
export {
  faseDoStatus,
  secaoAtiva,
  sistemaAtivo,
  sistemaAtivoContextual,
  telaTransversalDeLead,
  type Loc,
} from "@/features/nav/sistema-ativo";
