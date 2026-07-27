import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { onlyDigits } from "@/lib/validators";

export type ImportRow = {
  nome: string;
  telefone: string;
  email?: string | null;
  projeto_nome?: string | null;
};

export type ImportResult = {
  total: number;
  inseridos: number;
  duplicados: number;
  invalidos: number;
  erros: number;
  /** Presente apenas quando a importação rodou com `distribuirRoleta`. */
  distribuidos?: number;
  /** Lote desta execução — carimbado em `leads.import_batch_id` de cada linha inserida. */
  batchId: string;
  detalhes: Array<{ linha: number; motivo: string; nome?: string; telefone?: string }>;
};

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

// Tamanho do chunk do insert em lote: grande o bastante para poucos round-trips,
// pequeno o bastante para o retry linha a linha ser barato quando um chunk falha.
const CHUNK_SIZE = 200;

export const importarLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      rows: ImportRow[];
      projeto_id?: string | null;
      corretorId?: string | null;
      distribuirRoleta?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<ImportResult> => {
    const { supabase, userId } = context;

    // verifica role admin/gestor
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const isAllowed = isAdmin || (roles ?? []).some((r) => r.role === "gestor");
    if (!isAllowed) throw new Error("Apenas admin ou gestor podem importar leads.");

    const corretorId = data.corretorId ?? null;
    const distribuirRoleta = data.distribuirRoleta === true;
    if (corretorId && distribuirRoleta) {
      throw new Error(
        "Escolha apenas um destino: atribuir a um corretor OU distribuir pela roleta.",
      );
    }
    // Roleta em massa é decisão de operação — mesmo gate admin-only da RPC de triagem.
    if (distribuirRoleta && !isAdmin) {
      throw new Error("Apenas admin pode distribuir a importação pela roleta.");
    }

    // um lote por execução — permite auditar ("de onde veio este lead?") e
    // reverter a importação inteira no futuro
    const batchId = crypto.randomUUID();

    const result: ImportResult = {
      total: data.rows.length,
      inseridos: 0,
      duplicados: 0,
      invalidos: 0,
      erros: 0,
      batchId,
      detalhes: [],
    };

    // mapa de projetos (para auto-match por nome)
    const { data: projetos } = await supabase.from("projetos").select("id, nome");
    const projetosMap = new Map<string, string>();
    (projetos ?? []).forEach((p) => projetosMap.set(p.nome.trim().toLowerCase(), p.id));

    // dedupe interno por telefone normalizado
    const vistosNoArquivo = new Set<string>();

    // linhas válidas acumuladas para o insert em lote — guarda linha/nome/telefone
    // crus para atribuir o erro à linha certa se um chunk falhar
    type Pendente = { linha: number; nome: string; telefone: string; payload: LeadInsert };
    const pendentes: Pendente[] = [];

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const linha = i + 2; // +2 = considera header como linha 1
      const nome = (r.nome ?? "").trim();
      const telefoneRaw = (r.telefone ?? "").trim();
      const telefoneDigits = onlyDigits(telefoneRaw);

      if (!nome || telefoneDigits.length < 8) {
        result.invalidos++;
        result.detalhes.push({
          linha,
          motivo: !nome ? "nome vazio" : "telefone inválido",
          nome,
          telefone: telefoneRaw,
        });
        continue;
      }

      if (vistosNoArquivo.has(telefoneDigits)) {
        result.duplicados++;
        result.detalhes.push({
          linha,
          motivo: "duplicado dentro do arquivo",
          nome,
          telefone: telefoneRaw,
        });
        continue;
      }
      vistosNoArquivo.add(telefoneDigits);

      // checa duplicata no banco (por telefone normalizado)
      const { data: existentes } = await supabase
        .from("leads")
        .select("id, telefone")
        .ilike("telefone", `%${telefoneDigits.slice(-8)}%`)
        .limit(20);

      const jaExiste = (existentes ?? []).some((e) => onlyDigits(e.telefone) === telefoneDigits);
      if (jaExiste) {
        result.duplicados++;
        result.detalhes.push({
          linha,
          motivo: "telefone já existe na base",
          nome,
          telefone: telefoneRaw,
        });
        continue;
      }

      // projeto
      const projetoNomeRaw = (r.projeto_nome ?? "").trim();
      let projetoId: string | null = data.projeto_id ?? null;
      if (!projetoId && projetoNomeRaw) {
        projetoId = projetosMap.get(projetoNomeRaw.toLowerCase()) ?? null;
      }

      const emailLimpo = (r.email ?? "").trim().toLowerCase() || null;

      pendentes.push({
        linha,
        nome,
        telefone: telefoneRaw,
        payload: {
          nome,
          // persiste normalizado (só dígitos) — buscas e dedup ficam estáveis
          telefone: telefoneDigits,
          email: emailLimpo,
          projeto_id: projetoId,
          projeto_nome: projetoNomeRaw || null,
          origem: "importacao",
          // com corretor definido o lead já nasce na carteira dele
          corretor_id: corretorId,
          status: corretorId ? "aguardando_atendimento" : "novo",
          import_batch_id: batchId,
        },
      });
    }

    // insert em lote: 1 round-trip por chunk; se o chunk falhar, refaz AQUELE
    // chunk linha a linha para atribuir o erro do banco à linha certa
    const inseridosIds: string[] = [];
    for (let inicio = 0; inicio < pendentes.length; inicio += CHUNK_SIZE) {
      const chunk = pendentes.slice(inicio, inicio + CHUNK_SIZE);
      const { data: inseridos, error: chunkErr } = await supabase
        .from("leads")
        .insert(chunk.map((p) => p.payload))
        .select("id");

      if (!chunkErr) {
        result.inseridos += chunk.length;
        (inseridos ?? []).forEach((l) => inseridosIds.push(l.id));
        continue;
      }

      for (const p of chunk) {
        const { data: inserido, error: insErr } = await supabase
          .from("leads")
          .insert(p.payload)
          .select("id")
          .single();

        if (insErr) {
          result.erros++;
          result.detalhes.push({
            linha: p.linha,
            motivo: insErr.message,
            nome: p.nome,
            telefone: p.telefone,
          });
        } else {
          result.inseridos++;
          if (inserido) inseridosIds.push(inserido.id);
        }
      }
    }

    // distribuição pela roleta: sequencial, com try/catch individual — falha na
    // triagem NÃO desfaz o insert (o lead fica no lote, sem corretor)
    if (distribuirRoleta) {
      let distribuidos = 0;
      for (const leadId of inseridosIds) {
        try {
          const { data: triagem, error: rpcErr } = await supabase.rpc("triar_e_distribuir_lead", {
            _lead_id: leadId,
            _gatilho: "manual_criacao",
          });
          const res = triagem as { ok?: boolean } | null;
          if (!rpcErr && res?.ok) distribuidos++;
        } catch {
          // segue para o próximo lead — o insert permanece válido
        }
      }
      result.distribuidos = distribuidos;
    }

    return result;
  });
