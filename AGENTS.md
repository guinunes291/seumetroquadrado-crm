
- Onboarding do corretor é o treino prático em telas de treino (clientes fictícios, sem gravar nada além da conclusão em user_preferences com chave versionada); trocar a versão da chave reabre para todos — por que: treinar cliques reais sem mexer em carteira.
- Importação de leads por CSV usa a função de banco importar_leads_csv_lote chamada via server function com service role (só admin) — por que: inserir linha a linha passando pelos gatilhos de zona sem roleta e com dedupe idempotente.
- Generate sale receipt forecast options with the shared period helpers and use them in the shared sale dialog — keeps both sale entry points consistent with the operational calendar.
- Keep 3C Plus credentials separate from the dialer and existing global credentials; outbound integration events must remain roulette-scoped and additive to existing notifications to prevent unrelated customer data delivery.
- New approvals snapshot commission beneficiaries on the sale and generate separate partner ledger rows; preserve legacy approved rows and cancellation handling for financial auditability.
- Broker-phone validation runs server-side against global role/profile records without returning personal data; a database trigger guards all insert/edit/restore paths once its pending migration is applied.
- Sami learned directives use a pure validation module and a server-only cached reader; channel-key authenticated publication upserts by origin ID so both channels share approved guidance.
