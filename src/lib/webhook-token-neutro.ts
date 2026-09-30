// Token NEUTRO do webhook de lead (POST /api/public/webhooks/lead/:token).
//
// Por que existe (2026-09-28): os bots do n8n (Marquinhos, cadência de
// follow-up) entregavam leads SEM empreendimento definido usando, como "token
// geral", o webhook_token do projeto Sabara — herança de quando cada projeto
// tinha o seu token. O endpoint preenche o projeto do lead com o dono do
// token quando o payload não traz empreendimento, então todo lead sem
// interesse definido nascia "Sabara": nome errado no CRM e no aviso de
// redistribuição, e zona errada (zona_do_lead cai na zona do projeto — Zona
// Sul), o que desviava a roleta.
//
// O token neutro autentica a entrada SEM amarrar projeto: o lead nasce com o
// empreendimento que o payload informar (o trigger _leads_autolink_projeto
// vincula o projeto_id pelo nome) ou sem projeto nenhum. A triagem segue a
// normal (origem → roleta), igual ao token de projeto.
//
// O banco guarda só o SHA-256 do token (distribuicao_settings), nunca o valor:
// o segredo vive apenas no n8n.

import { createHash, timingSafeEqual } from "crypto";

/** Chave em distribuicao_settings com o SHA-256 (hex) do token neutro. */
export const CHAVE_TOKEN_NEUTRO = "webhook_token_neutro_sha256";

export function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor, "utf8").digest("hex");
}

/** true quando `token` bate com o hash guardado. Hash ausente/malformado → false. */
export function tokenBateComHash(token: string, hashGuardado: unknown): boolean {
  if (typeof hashGuardado !== "string" || !/^[0-9a-f]{64}$/i.test(hashGuardado)) return false;
  const a = Buffer.from(sha256Hex(token), "hex");
  const b = Buffer.from(hashGuardado.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Nome do empreendimento que o lead recebe. Campo "empreendimento" (novo) tem
 * prioridade, depois "empreendimentoInteresse" (legado); sem os dois, o nome
 * do projeto/campanha do token — que é `null` no token neutro: lead sem
 * interesse definido fica sem projeto, nunca herda um projeto arbitrário.
 * `?.trim() || null` de propósito: o n8n manda campo vazio como "".
 */
export function nomeProjetoDoLead(
  payload: { empreendimento?: string | null; empreendimentoInteresse?: string | null },
  nomeDoToken: string | null,
): string | null {
  return (
    (payload.empreendimento?.trim() || null) ??
    (payload.empreendimentoInteresse?.trim() || null) ??
    nomeDoToken
  );
}
