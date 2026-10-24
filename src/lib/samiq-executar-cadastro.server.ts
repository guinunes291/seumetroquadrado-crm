// Executor da Sami — check-in, cadastro de cliente novo e lote de prospecção.
// Recortado de samiq-executar.server.ts sem mudança de comportamento.

import type { Json } from "@/integrations/supabase/types";
import {
  type ResultadoExecucao,
  erroDb,
  type AcaoCtx,
  type PayloadDe,
} from "./samiq-executar-base.server";

export async function executarCheckin(
  c: AcaoCtx,
  payload: PayloadDe<"fazer_checkin">,
): Promise<ResultadoExecucao> {
  const { supabase, args } = c;
  if (payload.modo === "sair") {
    const { error } = await supabase.rpc("marcar_presenca", { _presente: false });
    if (error) erroDb("Não foi possível encerrar a presença", error);
    return { efeito: "presença de hoje encerrada; você sai da roleta" };
  }
  const loc = args.contexto?.localizacao ?? null;
  const { data, error } = await supabase.rpc("presenca_checkin", {
    _modo: payload.modo,
    ...(payload.modo === "loja" ? { _filial: payload.filial } : {}),
    ...(payload.modo === "loja" && loc
      ? {
          _latitude: loc.latitude,
          _longitude: loc.longitude,
          ...(loc.precisao != null ? { _precisao_m: loc.precisao } : {}),
        }
      : {}),
    ...(payload.modo === "loja" && !loc ? { _falha_localizacao: "indisponivel" } : {}),
  });
  if (error) erroDb("O CRM recusou o check-in", error);
  const st = (data ?? {}) as {
    checkin?: { apto_roleta?: boolean; motivo?: string | null } | null;
  };
  const apto = st.checkin?.apto_roleta === true;
  const motivo = st.checkin?.motivo ?? null;
  const explicacao =
    motivo === "sem_localizacao"
      ? "sem localização: mande sua localização pelo WhatsApp (clipe, Localização) e peça o check-in de novo"
      : motivo === "fora_da_filial"
        ? "a localização ficou fora do raio da filial"
        : motivo === "casa_abaixo_minimo_vendas"
          ? "em casa só libera a roleta com o mínimo de vendas aprovadas no mês anterior"
          : null;
  return {
    checkin: (st.checkin ?? null) as Json,
    efeito: `check-in ${payload.modo === "casa" ? "em casa" : `na filial ${payload.filial}`}: ${
      apto
        ? "apto para receber leads"
        : `não apto para a roleta${explicacao ? ` (${explicacao})` : ""}`
    }`,
  };
}

export async function executarCriarLead(
  c: AcaoCtx,
  payload: PayloadDe<"criar_lead">,
): Promise<ResultadoExecucao> {
  const { supabase, userId } = c;
  const { data, error } = await supabase.rpc("criar_lead_dedup", {
    _payload: {
      nome: payload.nome.trim(),
      telefone: payload.telefone.trim(),
      email: payload.email?.trim() || null,
      origem: payload.origem ?? "captacao_corretor",
      projeto_id: payload.projetoId ?? null,
      projeto_nome: payload.projetoNome?.trim() || null,
      bairro: payload.bairro?.trim() || null,
      zona: payload.zona?.trim() || null,
      observacoes: [payload.observacoes?.trim(), "Cadastrado via Sami"].filter(Boolean).join("\n"),
      corretor_id: userId,
      status: "aguardando_atendimento",
    },
  });
  if (error) erroDb("O CRM recusou o cadastro", error);
  const out = (data ?? {}) as {
    duplicado?: boolean;
    lead_id?: string;
    na_carteira?: boolean;
    nome?: string | null;
  };
  if (out.duplicado) {
    throw new Error(
      out.na_carteira
        ? `Esse telefone já é do cliente ${out.nome ?? ""} na sua carteira; nada foi criado. Registre o contato nele.`.replace(
            "  ",
            " ",
          )
        : "Esse telefone já existe no CRM em outra carteira; nada foi criado. Fale com o gestor da sua equipe para transferir.",
    );
  }
  if (!out.lead_id) throw new Error("O CRM não devolveu o cliente criado. Tente de novo.");
  return {
    lead_id: out.lead_id,
    // O desfazer (24 h) manda o cadastro para a lixeira (migration 0108).
    lead_criado_id: out.lead_id,
    efeito: "cliente cadastrado na sua carteira (Aguardando atendimento, entra na cadência)",
  };
}

export async function executarPedirLote(
  c: AcaoCtx,
  payload: PayloadDe<"pedir_lote">,
): Promise<ResultadoExecucao> {
  const { supabase, agora } = c;
  const { data, error } = await supabase.rpc("prospeccao_pedir_lote", { _zona: payload.zona });
  if (error) erroDb("O CRM recusou o lote", error);
  const out = (data ?? {}) as {
    ok?: boolean;
    motivo?: string;
    quantidade?: number;
    total?: number;
  };
  if (out.ok === false) {
    const motivos: Record<string, string> = {
      so_corretor: "só corretor pede lote",
      lote_em_andamento: "você já tem um lote em andamento",
      carteira_cheia: "sua carteira está sem vaga",
      sem_regiao: "seu cadastro está sem região",
      zona_fora_da_regiao: "essa zona é fora da sua região",
      zona_vazia: "não há leads disponíveis nessa zona agora",
    };
    throw new Error(
      `Lote não liberado: ${motivos[out.motivo ?? ""] ?? out.motivo ?? "motivo não informado"}.`,
    );
  }
  const n = out.quantidade ?? out.total ?? null;
  return {
    lote: (data ?? null) as Json,
    efeito: `lote liberado${n ? `: ${n} leads` : ""} na zona ${payload.zona}`,
  };
}
