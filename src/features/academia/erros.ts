// Tradução das mensagens das RPCs da Academia para texto de tela.
//
// As RPCs da migration 20261002120000 usam RAISE EXCEPTION com mensagem em
// texto corrido, sem acento e sem código próprio. Aqui elas viram um par
// título/detalhe em português de gente. Regra da Fatia 2: erro de regra de
// negócio (intervalo, limite diário, tempo esgotado) é CONTEÚDO DA TELA, não
// toast vermelho: o corretor precisa entender o que fazer, não levar um susto.
//
// Função pura de propósito: a tabela abaixo é testada sem montar componente.

export type ErroAmigavel = {
  titulo: string;
  detalhe: string;
  /** `true` quando insistir agora resolve (falha de rede, por exemplo). */
  podeTentarDeNovo: boolean;
};

function textoDoErro(erro: unknown): string {
  if (!erro) return "";
  if (typeof erro === "string") return erro;
  if (typeof erro === "object") {
    const e = erro as { message?: string; details?: string; hint?: string };
    return `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  }
  return "";
}

/** Minutos citados na mensagem do banco ("aguarde 60 minutos entre..."). */
function primeiroNumero(texto: string): string | null {
  const m = texto.match(/\d+/);
  return m ? m[0] : null;
}

const GENERICO: ErroAmigavel = {
  titulo: "Não deu para completar a ação.",
  detalhe: "Tente de novo em instantes. Se continuar, avise seu gestor.",
  podeTentarDeNovo: true,
};

export function erroAmigavel(erro: unknown): ErroAmigavel {
  const bruto = textoDoErro(erro).toLowerCase();
  if (!bruto.trim()) return GENERICO;

  if (bruto.includes("aguarde") && bruto.includes("tentativas")) {
    const min = primeiroNumero(bruto);
    return {
      titulo: "Ainda não dá para tentar de novo.",
      detalhe: min
        ? `Espere ${min} minutos entre uma tentativa e outra. Use esse tempo para revisar as aulas do módulo.`
        : "Espere o intervalo entre tentativas. Use esse tempo para revisar as aulas do módulo.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("limite de") && bruto.includes("por dia")) {
    const n = primeiroNumero(bruto);
    return {
      titulo: "Você já usou as tentativas de hoje.",
      detalhe: n
        ? `São ${n} tentativas por dia neste módulo. Volte amanhã, com as aulas revisadas.`
        : "Volte amanhã, com as aulas revisadas.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("tempo esgotado")) {
    return {
      titulo: "O tempo desta tentativa acabou.",
      detalhe: "Comece uma tentativa nova quando estiver pronto.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("tentativa ja enviada")) {
    return {
      titulo: "Esta tentativa já foi enviada.",
      detalhe: "Veja o resultado dela na tela do módulo.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("tentativa invalida")) {
    return {
      titulo: "Esta tentativa não é sua ou não existe mais.",
      detalhe: "Volte ao módulo e comece de novo.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("conclua todas as aulas")) {
    return {
      titulo: "Faltam aulas para liberar o quiz.",
      detalhe: "Marque todas as aulas do módulo como concluídas e o quiz abre.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("quiz sem questoes suficientes")) {
    return {
      titulo: "Este quiz ainda não está pronto.",
      detalhe: "O módulo precisa de mais questões. Avise seu gestor.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("ja existe uma pratica aguardando")) {
    return {
      titulo: "Você já enviou uma prática neste módulo.",
      detalhe: "Ela está na fila do seu gestor. Assim que for avaliada, aparece aqui.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("descreva a pratica")) {
    return {
      titulo: "Faltou a evidência.",
      detalhe: "Escreva o que você fez ou cole um link antes de enviar.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("este modulo nao pede pratica")) {
    return {
      titulo: "Este módulo não pede prática.",
      detalhe: "Basta concluir as aulas e passar no quiz.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("modulo indisponivel") || bruto.includes("aula indisponivel")) {
    return {
      titulo: "Este conteúdo não está disponível.",
      detalhe: "Ele pode ter saído do ar para revisão. Volte à sua trilha.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("nao esta inscrito na academia")) {
    return {
      titulo: "Você ainda não está na Academia.",
      detalhe: "Fale com seu gestor para entrar na trilha.",
      podeTentarDeNovo: false,
    };
  }

  if (bruto.includes("forbidden") || bruto.includes("42501")) {
    return {
      titulo: "Você não tem acesso a esta ação.",
      detalhe: "Se acha que deveria ter, fale com seu gestor.",
      podeTentarDeNovo: false,
    };
  }

  return GENERICO;
}
