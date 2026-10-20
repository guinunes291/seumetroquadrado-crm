# Integração 3C Plus
- [x] Criar roleta dedicada 3C Plus, pausada, sem alterar as demais.
- [x] Configurar os dois tokens e credencial exclusiva com leads:read, leads:write e events:write; leitura HTTP 200 no preview e no site publicado.
- [x] Destravar a migration 0100: o `when` da 0099/0100 no journal era menor que o da 0098 (datas futuras nas 0091–0098) e o migrator as pulava. Journal reordenado e 0100 idempotente; ela entra no próximo deploy (gatilhos instalados, roleta segue pausada).
- [ ] Ativar roleta para todos os corretores com check-in apto na filial (depois do deploy da 0100: despausar a roleta 3c-plus). Fora do foco atual (prioridade é o discador).
- [ ] Ativar avisos reais exclusivos da roleta, preservando os avisos existentes (instalados pela 0100; só disparam para lead da roleta 3c-plus).

# Discador 3C Plus (Bolsão)
- [x] Autenticação automática (Bearer → ?api_token= no 401) e TCPLUS_BASE_URL aceitando o domínio da empresa.
- [x] Campanha única do time (gestao_config.telefonia_3cplus) no lugar de uma por corretor; higiene de listas órfãs.
- [x] Corretor conecta o token e o CRM confere no 3C Plus antes de gravar (preenche o ID do agente).
- [x] Painel "Integração 3C Plus" na aba Discador: semáforo de token do gestor, campanha, corretores e webhook.
- [ ] Configurar secrets TCPLUS_API_TOKEN e TCPLUS_WEBHOOK_SECRET, escolher a campanha, registrar o webhook no 3C Plus e conectar os corretores do piloto.
- [ ] Teste real: click-to-call, "Iniciar agora" no Bolsão, qualificação voltando ao lead.
- [x] Enviar evento fictício de teste: HTTP 200, workflow iniciado; sem dados de clientes.