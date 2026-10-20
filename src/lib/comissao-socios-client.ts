import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Typed additive boundary until the pending migration reaches the managed schema.
type Venda = Database["public"]["Tables"]["vendas"];
type Beneficiarios = { gerente_beneficiario_id: string | null; socio_guilherme_id: string | null; socio_fabio_id: string | null };
type Schema = Omit<Database, "public"> & { public: Omit<Database["public"], "Tables"> & { Tables: Omit<Database["public"]["Tables"], "vendas"> & { vendas: Omit<Venda, "Row" | "Insert" | "Update"> & { Row: Venda["Row"] & Beneficiarios; Insert: Venda["Insert"] & Partial<Beneficiarios>; Update: Venda["Update"] & Partial<Beneficiarios> } } } };
export const supabaseSocios = supabase as unknown as SupabaseClient<Schema>;