// Sami — o catálogo das ferramentas de escrita: uma por tipo de ação, com a
// descrição (o manual que chega ao modelo) e o schema de entrada; todas
// passam pelo mesmo `executar` de samiq-propostas.server.ts.
// Recortado de samiq-propostas.server.ts sem mudança de comportamento.

import { tool, type ToolSet } from "ai";
import {
  AgendarVisitaPayload,
  AnexarDocumentoPayload,
  AnotarPayload,
  AtualizarDocumentoPayload,
  AtualizarQualificacaoBase,
  CancelarTarefaPayload,
  CancelarVisitaPayload,
  ConcluirTarefaPayload,
  ConfirmarVisitaPayload,
  CriarLeadFerramentaInput,
  CriarTarefaPayload,
  DocumentosChecklistPayload,
  EnviarAnaliseCreditoPayload,
  FazerCheckinBase,
  MSG_CHECKIN_FILIAL,
  MSG_CREDITO,
  MSG_PERDA_OUTRO,
  MSG_QUALIFICACAO_VAZIA,
  MSG_TROCA,
  MSG_VENDA_PROJETO,
  MSG_VISITA_SEM_COMPARECIMENTO,
  MarcarPerdidoBase,
  MudarEtapaFerramentaBase,
  PedirLotePayload,
  ReagendarTarefaPayload,
  RegistrarContatoPayload,
  RegistrarResultadoCreditoBase,
  RegistrarRetornoPayload,
  RegistrarVendaBase,
  RegistrarVisitaBase,
  RemarcarVisitaPayload,
  TrocarVagaBase,
  checkinTemFilial,
  creditoCoerente,
  perdaOutroTemDetalhe,
  qualificacaoTemCampo,
  trocaTemDados,
  vendaTemProjeto,
  visitaSemComparecimentoSemInteresse,
  type PropostaPayload,
  type SamiQPropostaTipo,
} from "@/lib/samiq-propostas";

// Descrições: são o MANUAL de cada ferramenta (só chegam ao modelo quando o
// grupo dela está aberto). Diretas e sem travessão.
const D = {
  registrar_contato:
    "Registra um contato feito com o cliente (ligação, WhatsApp, visita...) com o resultado, resumo, objeções e o próximo follow-up. É o MESMO registrar contato da tela: se o cliente respondeu (atendeu, interessado, pediu retorno) e estava em prospecção, ele entra em Em atendimento sozinho; se não atendeu e estava em Novo/Aguardando atendimento, vai para Aguardando retorno. Se o Em atendimento estiver lotado, o contato fica gravado e o retorno diz 'lotado': ofereça trocar_vaga.",
  anotar: "Grava uma anotação interna sobre o cliente (algo para lembrar).",
  criar_tarefa:
    "Cria uma tarefa ou lembrete com data e hora para o corretor (ligar, mandar WhatsApp, cobrar documento). Use para 'me lembra de...'. Tarefa aberta do mesmo cliente no mesmo horário (até 2 h) é reaproveitada.",
  atualizar_qualificacao:
    "Atualiza a ficha do cliente só com os campos informados: renda, entrada, FGTS (e saldo), tipo de renda, faixa (F1 a F4), temperatura, decisor, região (zona/bairro), dormitórios, vaga, prioridades, nota de perfil, empreendimento de interesse (de preferência pelo projetoId de catalogo_projetos), objeções, parecer.",
  agendar_visita:
    "Agenda uma visita (data e hora de SP, local) e move o cliente para Agendado. Precisa do CONFIRMAR do corretor. Só agenda para cliente em Em atendimento ou etapa posterior: se ele ainda está em prospecção, registre ANTES o contato em que ele topou a visita (não em paralelo). Lembre o corretor de pedir ao cliente que confirme data e horário.",
  mudar_etapa:
    "Move o cliente para Qualificação Corretor (única etapa sem formulário). Para as outras etapas use a ferramenta do desfecho: registrar_contato (Em atendimento é consequência), registrar_retorno, agendar_visita, registrar_visita, enviar_analise_credito, marcar_perdido. Precisa do CONFIRMAR.",
  registrar_retorno:
    "Desfecho 'pediu retorno' ou 'esfriou': registra o contato e leva o cliente para Aguardando retorno com a data combinada (vira tarefa). 'Esfriou' deixa o cliente frio. Retorno a mais de 30 dias vira perda 'retorno futuro' (menos lead próprio) e volta pela reativação. Precisa do CONFIRMAR.",
  marcar_perdido:
    "Marca o cliente como perdido com a categoria oficial. Atenção: igual à tela, o cliente SAI da carteira do corretor (vai para outro corretor ou para a base). Precisa do CONFIRMAR. Na dúvida entre perder e retorno, pergunte.",
  trocar_vaga:
    "Entra um, sai um, quando o Em atendimento está lotado: o cliente que respondeu entra e outro do Em atendimento sai como pediu retorno, esfriou (com data) ou perdido (com categoria). Use listar_clientes etapa em_atendimento ordem mais_parados para sugerir quem sai. Precisa do CONFIRMAR.",
  concluir_tarefa:
    "Marca uma tarefa como feita (id de minhas_tarefas ou detalhe_cliente), com o resultado.",
  reagendar_tarefa: "Muda a data e hora de uma tarefa aberta.",
  cancelar_tarefa: "Cancela uma tarefa aberta que não faz mais sentido.",
  confirmar_visita:
    "Marca a visita como confirmada pelo cliente (id de minha_agenda ou detalhe_cliente) e conclui a tarefa 'Confirmar visita'.",
  remarcar_visita:
    "Remarca uma visita para nova data e hora: cria a nova, marca a antiga como remarcada e agenda a confirmação na véspera.",
  cancelar_visita: "Cancela uma visita com o motivo. Precisa do CONFIRMAR.",
  registrar_visita:
    "Resultado da visita (igual ao Modo Visita): foi ou não foi, interesse, objeção principal, observações e a próxima etapa (visita realizada, aguardando retorno ou análise de crédito). Não compareceu exige data do próximo passo ou nova visita (reagendarPara). Precisa do CONFIRMAR.",
  documentos_checklist:
    "Monta o checklist de documentos do cliente pelo perfil de renda (CLT, autônomo, empresário, aposentado), casado, usa FGTS e declara IR. Só cria os itens que faltam.",
  atualizar_documento:
    "Muda o status de um documento do checklist (pendente, recebido, aprovado, reprovado). Com 3 documentos recebidos a pasta se monta e o cliente pode ir sozinho para Análise de crédito.",
  anexar_documento:
    "Anexa na ficha do cliente o arquivo que o corretor mandou no WhatsApp (anexoId do cabeçalho), no tipo de documento certo. Se não souber de quem é ou qual documento é, pergunte antes.",
  enviar_analise_credito:
    "Envia o cliente para análise de crédito (abre o registro da análise, nota na timeline, etapa Análise de crédito e tarefa de cobrança em 3 dias). Precisa do CONFIRMAR.",
  registrar_resultado_credito:
    "Registra o resultado da análise: aprovada, aprovada com condição ou reprovada, com os valores da carta (financiamento, parcela, prazo, taxa, FGTS, subsídio, validade). Não muda a etapa. Precisa do CONFIRMAR.",
  registrar_venda:
    "Registra a venda para aprovação da gestão (empreendimento, unidade, valor, data da assinatura, mês previsto de recebimento e marcos: contrato assinado, ato pago, apto para repasse). A comissão segue o tier do corretor. Precisa do CONFIRMAR.",
  fazer_checkin:
    "Check-in do dia: na filial (barra-funda, liberdade, belem; usa a localização que o corretor mandou no WhatsApp), em casa (só libera a roleta com o mínimo de vendas do mês anterior) ou sair (encerra a presença).",
  criar_lead:
    "Cadastra um cliente novo do corretor (captação própria, indicação, plantão...). Use o marcador [TELEFONE_n] da mensagem no campo telefone. Se o telefone já existir no CRM, não duplica e avisa. Precisa do CONFIRMAR.",
  pedir_lote:
    "Pede o lote de prospecção (até 30 leads da base) de uma zona. Só funciona com vaga na carteira e sem lote em andamento (veja minha_situacao). Precisa do CONFIRMAR.",
} satisfies Record<SamiQPropostaTipo, string>;

export function ferramentasDeProposta(
  executar: (entrada: PropostaPayload) => Promise<unknown>,
): ToolSet {
  return {
    registrar_contato: tool({
      description: D.registrar_contato,
      inputSchema: RegistrarContatoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "registrar_contato", ...input }),
    }),
    anotar: tool({
      description: D.anotar,
      inputSchema: AnotarPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "anotar", ...input }),
    }),
    criar_tarefa: tool({
      description: D.criar_tarefa,
      inputSchema: CriarTarefaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "criar_tarefa", ...input }),
    }),
    atualizar_qualificacao: tool({
      description: D.atualizar_qualificacao,
      inputSchema: AtualizarQualificacaoBase.omit({ tipo: true }).refine(
        qualificacaoTemCampo,
        MSG_QUALIFICACAO_VAZIA,
      ),
      execute: (input) => executar({ tipo: "atualizar_qualificacao", ...input }),
    }),
    agendar_visita: tool({
      description: D.agendar_visita,
      inputSchema: AgendarVisitaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "agendar_visita", ...input }),
    }),
    mudar_etapa: tool({
      description: D.mudar_etapa,
      inputSchema: MudarEtapaFerramentaBase.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "mudar_etapa", ...input }),
    }),
    registrar_retorno: tool({
      description: D.registrar_retorno,
      inputSchema: RegistrarRetornoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "registrar_retorno", ...input }),
    }),
    marcar_perdido: tool({
      description: D.marcar_perdido,
      inputSchema: MarcarPerdidoBase.omit({ tipo: true }).refine(
        perdaOutroTemDetalhe,
        MSG_PERDA_OUTRO,
      ),
      execute: (input) => executar({ tipo: "marcar_perdido", ...input }),
    }),
    trocar_vaga: tool({
      description: D.trocar_vaga,
      inputSchema: TrocarVagaBase.omit({ tipo: true }).refine(trocaTemDados, MSG_TROCA),
      execute: (input) => executar({ tipo: "trocar_vaga", ...input }),
    }),
    concluir_tarefa: tool({
      description: D.concluir_tarefa,
      inputSchema: ConcluirTarefaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "concluir_tarefa", ...input }),
    }),
    reagendar_tarefa: tool({
      description: D.reagendar_tarefa,
      inputSchema: ReagendarTarefaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "reagendar_tarefa", ...input }),
    }),
    cancelar_tarefa: tool({
      description: D.cancelar_tarefa,
      inputSchema: CancelarTarefaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "cancelar_tarefa", ...input }),
    }),
    confirmar_visita: tool({
      description: D.confirmar_visita,
      inputSchema: ConfirmarVisitaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "confirmar_visita", ...input }),
    }),
    remarcar_visita: tool({
      description: D.remarcar_visita,
      inputSchema: RemarcarVisitaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "remarcar_visita", ...input }),
    }),
    cancelar_visita: tool({
      description: D.cancelar_visita,
      inputSchema: CancelarVisitaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "cancelar_visita", ...input }),
    }),
    registrar_visita: tool({
      description: D.registrar_visita,
      inputSchema: RegistrarVisitaBase.omit({ tipo: true }).refine(
        visitaSemComparecimentoSemInteresse,
        MSG_VISITA_SEM_COMPARECIMENTO,
      ),
      execute: (input) => executar({ tipo: "registrar_visita", ...input }),
    }),
    documentos_checklist: tool({
      description: D.documentos_checklist,
      inputSchema: DocumentosChecklistPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "documentos_checklist", ...input }),
    }),
    atualizar_documento: tool({
      description: D.atualizar_documento,
      inputSchema: AtualizarDocumentoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "atualizar_documento", ...input }),
    }),
    anexar_documento: tool({
      description: D.anexar_documento,
      inputSchema: AnexarDocumentoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "anexar_documento", ...input }),
    }),
    enviar_analise_credito: tool({
      description: D.enviar_analise_credito,
      inputSchema: EnviarAnaliseCreditoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "enviar_analise_credito", ...input }),
    }),
    registrar_resultado_credito: tool({
      description: D.registrar_resultado_credito,
      inputSchema: RegistrarResultadoCreditoBase.omit({ tipo: true }).refine(
        creditoCoerente,
        MSG_CREDITO,
      ),
      execute: (input) => executar({ tipo: "registrar_resultado_credito", ...input }),
    }),
    registrar_venda: tool({
      description: D.registrar_venda,
      inputSchema: RegistrarVendaBase.omit({ tipo: true }).refine(
        vendaTemProjeto,
        MSG_VENDA_PROJETO,
      ),
      execute: (input) => executar({ tipo: "registrar_venda", ...input }),
    }),
    fazer_checkin: tool({
      description: D.fazer_checkin,
      inputSchema: FazerCheckinBase.omit({ tipo: true }).refine(
        checkinTemFilial,
        MSG_CHECKIN_FILIAL,
      ),
      execute: (input) => executar({ tipo: "fazer_checkin", ...input }),
    }),
    criar_lead: tool({
      description: D.criar_lead,
      inputSchema: CriarLeadFerramentaInput,
      execute: (input) => executar({ tipo: "criar_lead", ...input }),
    }),
    pedir_lote: tool({
      description: D.pedir_lote,
      inputSchema: PedirLotePayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "pedir_lote", ...input }),
    }),
  };
}
