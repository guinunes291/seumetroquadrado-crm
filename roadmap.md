# Aprovação e comissão dos sócios
- [x] Abrir seleção dos beneficiários na aprovação, com bloqueio seguro enquanto configuração não existe.
- [ ] Aplicar comissão de 0,3% por sócio no banco: 0101 foi pulada pelo mesmo histórico de datas futuras; depende de correção do histórico gerenciado.
- [x] Testar cálculo: 41 testes passaram.
- [ ] Validar aprovação real: depende da configuração no banco e de sessão autorizada; existem dois Fábios, seleção explícita na tela.

# Integração 3C Plus
- [x] Criar roleta dedicada 3C Plus, pausada, sem alterar as demais.
- [x] Configurar os dois tokens e credencial exclusiva com leads:read, leads:write e events:write; leitura HTTP 200 no preview e no site publicado.
- [ ] Ativar roleta para todos os corretores com check-in apto na filial. Bloqueado: histórico gerenciado de migrations tem datas futuras; 0100 foi pulada e o journal é somente leitura. Requer correção do histórico pela plataforma antes de aplicar 0100; roleta permanece pausada.
- [ ] Ativar avisos reais exclusivos da roleta, preservando os avisos existentes. Destino autorizado; mesmo bloqueio da migration 0100. Avisos ainda não estão ativos.
- [x] Enviar evento fictício de teste: HTTP 200, workflow iniciado; sem dados de clientes.