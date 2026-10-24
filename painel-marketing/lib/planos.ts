// O que cada pedido da Fase 2 faz na Meta, descrito em português antes de
// qualquer chamada. É este texto que o Guilherme lê e aprova.
// Funções puras (sem banco e sem rede) para poder testar isoladas.

export type Local = { lat: number; lng: number; raioKm: number };

export type NovaCampanha = {
  tipo: "nova_campanha";
  modelo: { id: string; nome: string; orcamentoNa: "campanha" | "conjuntos" };
  conjuntos: { id: string; nome: string }[];
  nome: string;
  empreendimentoId: number | null;
  orcamentoDiario: number; // reais
  local: Local | null;
};

export type Nivel = "campaign" | "adset";

export type Ajuste = {
  tipo: "ajustar";
  alvo: { nivel: Nivel; id: string; nome: string; campanhaNome?: string };
  antes: { status: string; orcamentoDiario: number | null; nome: string };
  depois: { status?: "ACTIVE" | "PAUSED"; orcamentoDiario?: number; nome?: string };
};

export type PublicoLista = {
  tipo: "publico_lista";
  nome: string;
  fonte: "lead" | "comprador" | "todos";
  empreendimentoId: number | null;
  empreendimentoNome: string | null;
  quantidade: number;
};

export type PublicoSemelhante = {
  tipo: "publico_semelhante";
  nome: string;
  origem: { id: string; nome: string };
  percentual: number; // 1 a 10
};

export type Pedido = NovaCampanha | Ajuste | PublicoLista | PublicoSemelhante;

// Teto de segurança por pedido. Acima disso o Painel recusa; muda-se aqui, com PR.
export const ORCAMENTO_DIARIO_MAXIMO = 1000;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function centavos(reais: number): string {
  return String(Math.round(reais * 100));
}

export function problemasDoPedido(p: Pedido): string[] {
  const erros: string[] = [];
  if (p.tipo === "nova_campanha") {
    if (!p.nome.trim()) erros.push("Dê um nome para a campanha.");
    if (!(p.orcamentoDiario >= 10)) erros.push("O orçamento diário mínimo aqui é R$ 10.");
    if (p.orcamentoDiario > ORCAMENTO_DIARIO_MAXIMO)
      erros.push(
        `O orçamento diário passa do teto do Painel (${brl.format(ORCAMENTO_DIARIO_MAXIMO)}).`,
      );
    if (p.conjuntos.length === 0) erros.push("A campanha modelo não tem conjuntos para copiar.");
    if (p.local) {
      const { lat, lng, raioKm } = p.local;
      if (!(lat >= -34 && lat <= 6 && lng >= -74 && lng <= -34))
        erros.push("A localização não parece estar no Brasil. Confira latitude e longitude.");
      if (!(raioKm >= 1 && raioKm <= 80)) erros.push("O raio precisa ficar entre 1 e 80 km.");
    }
  }
  if (p.tipo === "ajustar") {
    const d = p.depois;
    if (d.status === undefined && d.orcamentoDiario === undefined && !d.nome)
      erros.push("Nada para mudar: escolha status, orçamento ou nome.");
    if (d.orcamentoDiario !== undefined) {
      if (p.antes.orcamentoDiario === null)
        erros.push("O orçamento deste item fica em outro nível (campanha ou conjunto). Ajuste lá.");
      if (!(d.orcamentoDiario >= 10)) erros.push("O orçamento diário mínimo aqui é R$ 10.");
      if (d.orcamentoDiario > ORCAMENTO_DIARIO_MAXIMO)
        erros.push(
          `O orçamento diário passa do teto do Painel (${brl.format(ORCAMENTO_DIARIO_MAXIMO)}).`,
        );
    }
  }
  if (p.tipo === "publico_lista") {
    if (p.quantidade < 100)
      erros.push(
        `A lista tem ${p.quantidade} contatos. A Meta precisa de pelo menos 100 para usar o público.`,
      );
  }
  if (p.tipo === "publico_semelhante") {
    if (!(p.percentual >= 1 && p.percentual <= 10)) erros.push("O percentual vai de 1% a 10%.");
  }
  return erros;
}

// true quando aprovar pode fazer a conta gastar dinheiro a partir de agora.
export function gastaDinheiro(p: Pedido): boolean {
  if (p.tipo !== "ajustar") return false;
  const ativa = p.depois.status === "ACTIVE" && p.antes.status !== "ACTIVE";
  const sobe =
    p.depois.orcamentoDiario !== undefined &&
    p.antes.orcamentoDiario !== null &&
    p.depois.orcamentoDiario > p.antes.orcamentoDiario &&
    (p.depois.status ?? p.antes.status) === "ACTIVE";
  return ativa || sobe;
}

export function tituloDoPedido(p: Pedido): string {
  switch (p.tipo) {
    case "nova_campanha":
      return `Nova campanha: ${p.nome}`;
    case "ajustar":
      return `Ajustar ${p.alvo.nivel === "campaign" ? "campanha" : "conjunto"}: ${p.alvo.nome}`;
    case "publico_lista":
      return `Novo público (lista): ${p.nome}`;
    case "publico_semelhante":
      return `Novo público semelhante: ${p.nome}`;
  }
}

export function passosDoPedido(p: Pedido): string[] {
  switch (p.tipo) {
    case "nova_campanha": {
      const s = [
        `Criar a campanha "${p.nome}" copiando a estrutura de "${p.modelo.nome}", PAUSADA e sem categoria especial.`,
        `Copiar ${p.conjuntos.length} conjunto${p.conjuntos.length === 1 ? "" : "s"} com seus anúncios (mesmos criativos, formulário ou WhatsApp), todos PAUSADOS.`,
      ];
      if (p.modelo.orcamentoNa === "campanha")
        s.push(`Definir orçamento diário da campanha em ${brl.format(p.orcamentoDiario)}.`);
      else
        s.push(
          `Definir orçamento diário de ${brl.format(p.orcamentoDiario / p.conjuntos.length)} em cada conjunto (total ${brl.format(p.orcamentoDiario)} por dia).`,
        );
      if (p.local)
        s.push(
          `Trocar a localização dos conjuntos para um raio de ${p.local.raioKm} km em volta de ${p.local.lat.toFixed(5)}, ${p.local.lng.toFixed(5)}.`,
        );
      s.push(
        "Nada entra no ar. Para ativar, use Ajustar campanha depois de conferir no Gerenciador.",
      );
      return s;
    }
    case "ajustar": {
      const s: string[] = [];
      const d = p.depois;
      if (d.status && d.status !== p.antes.status)
        s.push(d.status === "ACTIVE" ? "ATIVAR (passa a gastar)." : "PAUSAR (para de gastar).");
      if (d.orcamentoDiario !== undefined)
        s.push(
          `Orçamento diário de ${p.antes.orcamentoDiario === null ? "sem dado" : brl.format(p.antes.orcamentoDiario)} para ${brl.format(d.orcamentoDiario)}.`,
        );
      if (d.nome && d.nome !== p.antes.nome) s.push(`Renomear para "${d.nome}".`);
      s.push("Antes de aplicar, o Painel confere se nada mudou na Meta desde este pedido.");
      return s;
    }
    case "publico_lista":
      return [
        `Criar o público personalizado "${p.nome}" na conta de anúncios.`,
        `Enviar ${p.quantidade} telefones de ${p.fonte === "comprador" ? "compradores" : p.fonte === "lead" ? "leads" : "leads e compradores"}${p.empreendimentoNome ? ` de ${p.empreendimentoNome}` : ""}, já embaralhados (sha256). Telefones de teste ficam de fora.`,
        "Não gasta nada sozinho: o público só é usado quando alguém escolhe ele num conjunto.",
      ];
    case "publico_semelhante":
      return [
        `Criar o público semelhante "${p.nome}" a partir de "${p.origem.nome}", ${p.percentual}% do Brasil.`,
        "Não gasta nada sozinho: o público só é usado quando alguém escolhe ele num conjunto.",
      ];
  }
}
