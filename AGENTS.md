
- Onboarding do corretor é o treino prático em telas de treino (clientes fictícios, sem gravar nada além da conclusão em user_preferences com chave versionada); trocar a versão da chave reabre para todos — por que: treinar cliques reais sem mexer em carteira.
- Importação de leads por CSV usa a função de banco importar_leads_csv_lote chamada via server function com service role (só admin) — por que: inserir linha a linha passando pelos gatilhos de zona sem roleta e com dedupe idempotente.
- Generate sale receipt forecast options with the shared period helpers and use them in the shared sale dialog — keeps both sale entry points consistent with the operational calendar.
