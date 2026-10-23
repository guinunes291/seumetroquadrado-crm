// Vocabulário do registro de sistemas: destino, seção, sistema e o contexto
// de papel que os filtros de visibilidade recebem.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import { type Icon as IconComponent } from "@phosphor-icons/react";
import type { AppRole } from "@/hooks/use-auth";
import type { CorModulo } from "@/features/nav/cores-modulo";
import type { NavBadges } from "@/features/nav/use-nav-badges";

export type Destino = { to: string; search?: Record<string, string> };

export type Secao = {
  id: string;
  label: string;
  icon: IconComponent;
  to: string;
  /** Match ESTRITO na ativação: a seção só acende com o param presente. */
  search?: Record<string, string>;
  /** Ausente = todos os papéis. Sem papel, a seção some do menu. */
  roles?: AppRole[];
  badge?: (b: NavBadges) => number;
  badgeRoles?: AppRole[];
  /** Chave em `flagsLigadas` que liga ESTA seção. Mesma regra do `flag` de
   *  Sistema: ausente no conjunto = seção invisível. */
  flag?: string;
};

export type SistemaId =
  | "academia"
  | "central-comando"
  | "prospeccao"
  | "carteira"
  | "visita"
  | "follow-up"
  | "financeiro"
  | "docs-projetos"
  | "bi"
  | "configuracoes"
  | "sdr";

export type Sistema = {
  id: SistemaId;
  titulo: string;
  /** Uma frase curta (texto do vídeo de lançamento, 2026-10) — o card do hub
   *  corta em três linhas (line-clamp-3). */
  descricao: string;
  icon: IconComponent;
  /** Destino do card no hub (padrão). */
  home: Destino;
  /** Home dependente do papel — só o BI usa (gestão cai no painel). */
  homePorPapel?: (ctx: PapelCtx) => Destino;
  /** Gate explícito do sistema inteiro (só Configurações usa; nos demais a
   *  visibilidade deriva das seções). */
  roles?: AppRole[];
  badge?: (b: NavBadges) => number;
  badgeRoles?: AppRole[];
  /** Cor fixa do módulo (identidade v3): tile no portal, cabeçalho da sidebar,
   *  header da página e badge de pendência leem daqui. Ver cores-modulo.ts. */
  cor: CorModulo;
  /** Frequência de uso no portal (decisão 2026-08-30): "operacao" é o dia do
   *  corretor (primeira dobra, na ordem do fluxo), "consulta" é referência
   *  ocasional (Docs, Financeiro, BI) e "gestao" é só admin. */
  grupo: "operacao" | "consulta" | "gestao";
  /** Card com acento dourado no grid (mesmo tamanho dos demais). */
  destaque?: boolean;
  /** Prefixos de rota reivindicados sem seção própria (ex.: /atendimento e
   *  /mensagens, que saíram do menu mas pertencem à Carteira). */
  dominioExtra?: string[];
  /** Chave em app_flags que liga este sistema. Sistema COM flag só aparece se
   *  o contexto trouxer a chave em `flagsLigadas` — ausência é "desligada",
   *  nunca "ainda não sei". Quem monta o ctx decide o que entra no conjunto
   *  (a Academia, por exemplo, exige flag ligada E participação ativa). */
  flag?: string;
  secoes: Secao[];
};

export type PapelCtx = {
  roles: AppRole[];
  isAdmin: boolean;
  /** Flags de sistema já resolvidas pelo consumidor. Ausente = nenhuma flag
   *  ligada, então todo sistema COM flag fica invisível. */
  flagsLigadas?: Set<string>;
};
