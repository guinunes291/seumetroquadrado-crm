// Núcleo PURO das AÇÕES de escrita da Sami (Onda S2 → v8 "CRM no WhatsApp").
//
// Doutrina (S2): o modelo nunca grava sozinho. Cada ferramenta de escrita
// produz uma ação tipada (zod); a execução acontece em
// samiq-executar.server.ts com a SESSÃO DO CORRETOR (RLS, triggers e autor
// iguais aos da tela) e fica registrada em samiq_propostas com o resultado
// (ids gravados + snapshot) para o desfazer de 24 h.
//
// v8 (24/10/2026, decisão do Guilherme): autonomia POR RISCO no WhatsApp.
//  * "direto": o que a tela faz num clique e se desfaz (contato, nota,
//    tarefa, qualificação, confirmar/remarcar visita, documento, check-in)
//    grava na hora; o corretor pode responder DESFAZER.
//  * "confirmar": o que muda a etapa do funil, mexe com outra pessoa ou não
//    tem volta (perda, retorno, visita, análise, venda, cadastro, lote) espera
//    o CONFIRMAR do corretor.
// No painel do CRM tudo continua pelo card (um toque já é o atalho).
//
// Aqui vivem os contratos, os rótulos, a descrição humana de cada ação e as
// regras de desfazer — sem rede.
//
// Desde a quebra em módulos (2026-10), este arquivo só reexporta: tipos e risco
// em samiq-propostas-tipos.ts, vocabulários em samiq-propostas-catalogos.ts,
// contratos em samiq-propostas-contratos.ts e samiq-propostas-contratos-v8.ts,
// descrição em samiq-propostas-descricao.ts e regras em samiq-propostas-regras.ts.

export {
  SAMIQ_PROPOSTA_TIPOS,
  type SamiQPropostaTipo,
  SAMIQ_PROPOSTA_LABEL,
  SAMIQ_FERRAMENTAS_PROPOSTA,
  type SamiQFerramentaProposta,
  type NivelAcao,
  SAMIQ_NIVEL_ACAO,
  type ModoEscritaSamiQ,
  nivelDaAcao,
  SAMIQ_TIPOS_DESFAZIVEIS,
  podeDesfazerProposta,
  SAMIQ_TIPOS_SO_COM_CONFIRMAR,
  type MotivoSemDesfazer,
  motivoSemDesfazer,
  MOTIVO_SEM_DESFAZER_LABEL,
} from "./samiq-propostas-tipos";
export {
  CANAIS_CONTATO,
  CANAL_LABEL,
  RESULTADOS_CONTATO,
  type ResultadoContato,
  RESULTADO_CONTATO_LABEL,
  TAREFA_TIPOS_PROPOSTA,
  TAREFA_PRIORIDADES_PROPOSTA,
  ETAPAS_PROPONIVEIS,
  MOTIVOS_PERDA_PROPOSTA,
  FAIXAS_MCMV,
  PRIORIDADES_CLIENTE,
  INTERESSES_VISITA,
  OBJECOES_VISITA,
  ETAPAS_APOS_VISITA,
  DOCUMENTOS_TIPOS,
  ORIGENS_CAPTACAO,
  ORIGEM_CAPTACAO_LABEL,
  ZONAS_LOTE,
  MODALIDADES_CREDITO,
} from "./samiq-propostas-catalogos";
export {
  RegistrarContatoPayload,
  AnotarPayload,
  CriarTarefaPayload,
  AtualizarQualificacaoBase,
  qualificacaoTemCampo,
  MSG_QUALIFICACAO_VAZIA,
  AtualizarQualificacaoPayload,
  AgendarVisitaPayload,
  MudarEtapaBase,
  MudarEtapaFerramentaBase,
  etapaPerdidoTemMotivo,
  MSG_ETAPA_PERDIDO,
  etapaRetornoTemFollowup,
  MSG_ETAPA_RETORNO,
  MudarEtapaPayload,
} from "./samiq-propostas-contratos";
export {
  RegistrarRetornoPayload,
  MarcarPerdidoBase,
  perdaOutroTemDetalhe,
  MSG_PERDA_OUTRO,
  MarcarPerdidoPayload,
  TrocarVagaBase,
  trocaTemDados,
  MSG_TROCA,
  TrocarVagaPayload,
  ConcluirTarefaPayload,
  ReagendarTarefaPayload,
  CancelarTarefaPayload,
  ConfirmarVisitaPayload,
  RemarcarVisitaPayload,
  CancelarVisitaPayload,
  RegistrarVisitaBase,
  visitaSemComparecimentoSemInteresse,
  MSG_VISITA_SEM_COMPARECIMENTO,
  RegistrarVisitaPayload,
  DocumentosChecklistPayload,
  AtualizarDocumentoPayload,
  AnexarDocumentoPayload,
  EnviarAnaliseCreditoPayload,
  RegistrarResultadoCreditoBase,
  creditoCoerente,
  MSG_CREDITO,
  RegistrarResultadoCreditoPayload,
  RegistrarVendaBase,
  vendaTemProjeto,
  MSG_VENDA_PROJETO,
  RegistrarVendaPayload,
  FazerCheckinBase,
  checkinTemFilial,
  MSG_CHECKIN_FILIAL,
  FazerCheckinPayload,
  CriarLeadPayload,
  CriarLeadFerramentaInput,
  normalizarTelefoneCadastro,
  PedirLotePayload,
  PropostaPayloadSchema,
  type PropostaPayload,
} from "./samiq-propostas-contratos-v8";
export {
  type PropostaSamiQ,
  SAMIQ_DESFAZER_JANELA_HORAS,
  conteudoContato,
  fimDaVisita,
  tituloVisita,
  telefoneMascarado,
  type DescricaoProposta,
  descreverProposta,
} from "./samiq-propostas-descricao";
export {
  tituloDoPacote,
  SAMIQ_ORIGEM,
  metadataViaSami,
  foiViaSami,
  mensagemEtapaNaoAplicada,
  etapaBloqueadaSemDono,
  SAMIQ_JANELA_MESMA_TAREFA_MS,
  type TarefaAbertaResumo,
  tarefaNoMesmoHorario,
  normalizarDatasDoPayload,
  datasQueDevemSerFuturas,
  leadIdDaProposta,
} from "./samiq-propostas-regras";
