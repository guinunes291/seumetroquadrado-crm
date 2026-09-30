-- 2026-10-02 — Token NEUTRO do webhook de lead (fim do "lead Sabara").
--
-- Os bots do n8n (Marquinhos e a cadência de follow-up) entregavam lead SEM
-- empreendimento definido pelo webhook_token do projeto Sabara, usado como
-- "token geral". O endpoint /api/public/webhooks/lead/:token preenche o
-- projeto com o dono do token quando o payload não traz empreendimento — então
-- todo lead sem interesse definido nascia com projeto_id/projeto_nome =
-- Sabara. Efeitos: nome errado no CRM e no aviso de redistribuição por SLA
-- ("Jaqueline · Sabara" para lead do Elev Saúde) e zona errada — zona_do_lead
-- cai na zona do projeto (Zona Sul) e desviava a roleta.
--
-- O token neutro autentica sem amarrar projeto (ver
-- src/lib/webhook-token-neutro.ts). Aqui só se guarda o SHA-256 dele: o valor
-- vive no n8n, nunca no repositório nem no banco. Para trocar o token, grave o
-- novo hash nesta chave (aba Distribuição → Política → Outras chaves) e o novo
-- valor no n8n.
--
-- ON CONFLICT DO NOTHING: replay nunca desfaz uma rotação feita pela tela.

INSERT INTO public.distribuicao_settings (chave, valor, descricao)
VALUES (
  'webhook_token_neutro_sha256',
  to_jsonb('70aea3b57f8b989d0b246711ca0c4d9c7a2899b92b4524adbcbaf77964014aef'::text),
  'SHA-256 (hex) do token NEUTRO do webhook de lead: autentica os bots do n8n '
  || 'sem amarrar projeto ao lead (lead sem empreendimento fica sem projeto). '
  || 'Trocar = gravar aqui o hash do novo token e atualizar o token no n8n.'
)
ON CONFLICT (chave) DO NOTHING;
