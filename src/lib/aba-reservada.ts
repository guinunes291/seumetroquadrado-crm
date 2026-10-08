// Abrir uma aba externa (o wa.me) SÓ depois de gravar o que ela representa —
// sem cair no bloqueador de pop-up.
//
// O bloqueador só deixa `window.open` passar dentro do gesto do clique, e a
// gravação é assíncrona: termina fora dele. Por isso a aba é RESERVADA em
// branco no clique e só vai para o destino quando o registro confirma; se o
// registro falhar, a aba reservada é fechada. Aba aberta ⇔ registro gravado.
// É o mesmo desenho do diálogo de WhatsApp do dossiê
// (features/leads/dossie/whatsapp-dialog.tsx).
//
// Sem "noopener" de propósito. Com ele, o spec do HTML manda `window.open`
// devolver null MESMO quando a aba abre — não dá para distinguir bloqueio de
// sucesso nem para navegar a aba depois. Foi assim que a Fila do Dia da
// cadência passou a achar que todo clique era pop-up bloqueado e nunca
// gravou um WhatsApp. A proteção que o noopener dava (a página de destino não
// alcançar o CRM por `window.opener`) é refeita à mão: o opener da aba
// reservada é zerado antes de ela sair do about:blank.

/**
 * Reserva a aba no gesto do clique, espera `registrar` e só então navega.
 *
 * Retorna `null`, SEM chamar `registrar`, quando o navegador bloqueou a aba:
 * nada abriu, então nada se grava. Senão, a promessa do desfecho — `true` se
 * gravou e a aba foi para `url`, `false` se a aba não chegou lá (o registro
 * falhou e a aba reservada foi fechada, ou a aba já não aceitava navegar).
 * Ela nunca rejeita: o erro do registro é de quem
 * registra (o toast da mutação); aqui só se decide o destino da aba.
 *
 * Chame direto no handler do clique, sem nenhum `await` antes — é o que mantém
 * o `window.open` dentro do gesto.
 */
export function abrirDepoisDeRegistrar(
  url: string,
  registrar: () => Promise<unknown>,
): Promise<boolean> | null {
  const aba = window.open("about:blank", "_blank");
  if (!aba) return null;
  try {
    aba.opener = null;
  } catch {
    // about:blank tem a origem do CRM, então isto não falha na prática; se um
    // navegador recusar, a aba segue — o destino é o wa.me, não um link livre.
  }

  return (async () => {
    try {
      await registrar();
    } catch {
      aba.close();
      return false;
    }
    try {
      aba.location.href = url;
    } catch {
      // O corretor fechou a aba reservada antes de a gravação voltar e o
      // navegador recusou navegar a janela morta. A tentativa já está gravada
      // (a mutação mostrou o toast); aqui só não se pode rejeitar.
      return false;
    }
    return true;
  })();
}
