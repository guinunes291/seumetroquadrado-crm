// Bloco "Buscar oportunidade" do diálogo de Novo lead (só para o corretor).
// Antes de cadastrar, o corretor procura o cliente pelo telefone, e-mail ou
// CPF. Se ele já existe no CRM, cria o SEU registro com os dados já
// preenchidos; se é dele, abre; se outro corretor já está em visita realizada
// em diante, não cria. Desenho: docs/ops/registro-mae.md.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buscarOportunidade,
  criarRegistroFilho,
  rotulosHerdados,
  type Oportunidade,
} from "@/features/leads/oportunidade";

export function BuscarOportunidade({
  consultaInicial,
  onCriado,
}: {
  /** Telefone que o cadastro acusou como já existente: busca sozinho. */
  consultaInicial?: string | null;
  onCriado: () => void;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState(consultaInicial ?? "");
  const [resultado, setResultado] = useState<Oportunidade | null>(null);

  const busca = useMutation({
    mutationFn: (t: string) => buscarOportunidade(t),
    onSuccess: setResultado,
    onError: (e: Error) => toast.error(e.message),
  });

  const criar = useMutation({
    mutationFn: (clienteId: string) => criarRegistroFilho(clienteId),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error("Cliente em negociação avançada com outro corretor.");
        return;
      }
      toast.success(
        r.ja_existia
          ? "Este cliente já estava na sua carteira"
          : "Registro criado na sua carteira, com os dados já preenchidos",
      );
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-status-counts"] });
      onCriado();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // O cadastro abaixo acusou duplicado: a busca já vem feita.
  const buscar = busca.mutate;
  useEffect(() => {
    if (consultaInicial) {
      setTexto(consultaInicial);
      buscar(consultaInicial);
    }
  }, [consultaInicial, buscar]);

  return (
    <section
      aria-label="Buscar oportunidade"
      className="space-y-2 rounded-lg border border-border-subtle bg-muted/30 p-3"
    >
      <Label htmlFor="buscar-oportunidade">Buscar oportunidade</Label>
      <div className="flex gap-2">
        <Input
          id="buscar-oportunidade"
          placeholder="Telefone, e-mail ou CPF (000.000.000-00)"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setResultado(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && texto.trim()) busca.mutate(texto);
          }}
        />
        <Button
          variant="outline"
          onClick={() => busca.mutate(texto)}
          loading={busca.isPending}
          disabled={!texto.trim()}
        >
          Buscar
        </Button>
      </div>

      {resultado && !resultado.encontrado && (
        <p className="text-xs text-muted-foreground" data-testid="oportunidade-nao-encontrada">
          Nenhum cliente com esse dado no CRM. Cadastre abaixo.
        </p>
      )}

      {resultado?.encontrado && resultado.ja_na_carteira && resultado.meu_lead_id && (
        <p className="text-sm" data-testid="oportunidade-ja-sua">
          <b>{resultado.nome ?? "Este cliente"}</b> já está na sua carteira.{" "}
          <Link
            className="underline"
            to="/leads/$leadId"
            params={{ leadId: resultado.meu_lead_id }}
            onClick={onCriado}
          >
            Abrir o lead
          </Link>
        </p>
      )}

      {resultado?.encontrado && !resultado.ja_na_carteira && resultado.bloqueado && (
        <p className="text-sm text-destructive" data-testid="oportunidade-bloqueada">
          <b>{resultado.nome ?? "Este cliente"}</b> está em negociação avançada com outro corretor
          (visita realizada em diante). Não é possível criar o seu registro.
        </p>
      )}

      {resultado?.encontrado && !resultado.ja_na_carteira && !resultado.bloqueado && (
        <div className="space-y-2 text-sm" data-testid="oportunidade-disponivel">
          <p>
            <b>{resultado.nome ?? "Este cliente"}</b> já existe no CRM. Você pode criar o seu
            registro dele
            {rotulosHerdados(resultado.campos_herdados).length > 0 ? (
              <>
                , já com: <b>{rotulosHerdados(resultado.campos_herdados).join(", ")}</b>.
              </>
            ) : (
              "."
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            O histórico e as notas de outros corretores não vêm junto.
          </p>
          <Button onClick={() => criar.mutate(resultado.cliente_id)} loading={criar.isPending}>
            Criar meu registro
          </Button>
        </div>
      )}
    </section>
  );
}
