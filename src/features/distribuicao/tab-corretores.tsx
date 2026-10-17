// Aba Corretores — desde as roletas simples (decisão do dono, 13/10/2026:
// "precisamos deixar as roletas mais simples de entender quem está em qual
// roleta") é o quadro "Quem está em qual roleta": uma linha por corretor e uma
// coluna por roleta (Filial · Campanhas · SDR · Marquinhos), com presença,
// carteira e o cadastro do modelo v2. O valor da aba continua `corretores`
// (links de Pessoas e da Pré-venda apontam para ela).

import { QuadroRoletas } from "./quadro-roletas";

export function TabCorretores({
  somenteLeitura,
  escopoEquipe = false,
}: {
  somenteLeitura: boolean;
  escopoEquipe?: boolean;
}) {
  return <QuadroRoletas somenteLeitura={somenteLeitura} escopoEquipe={escopoEquipe} />;
}
