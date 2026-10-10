// Primeira tela do Novo lead do corretor: "Buscar oportunidade". Antes de
// cadastrar, o corretor procura o cliente pelo telefone, pelo e-mail ou pelo
// CPF (pelo menos um). Se ele já existe no CRM, cria o SEU registro com os
// dados já preenchidos; se é dele, abre; se outro corretor já está em visita
// realizada em diante, não cria. Não achou: o diálogo segue para o cadastro,
// que vira o cadastro mãe. Desenho: docs/ops/registro-mae.md.
//
// Os valores e o resultado moram no diálogo: o que o corretor digitou aqui
// desce pronto para o cadastro, e a conferência final do cadastro volta para
// cá quando acha alguém.

import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskCPF, maskPhoneBR } from "@/lib/masks";
import {
  criarRegistroFilho,
  rotuloMatch,
  rotulosHerdados,
  type BuscaCliente,
  type ErrosBusca,
  type Oportunidade,
} from "@/features/leads/oportunidade";

export type ClienteEncontrado = Extract<Oportunidade, { encontrado: true }>;

const CAMPOS: {
  campo: keyof BuscaCliente;
  rotulo: string;
  placeholder: string;
  inputMode: "tel" | "email" | "numeric";
  mascara: (v: string) => string;
}[] = [
  {
    campo: "telefone",
    rotulo: "Telefone",
    placeholder: "(11) 98765-4321",
    inputMode: "tel",
    mascara: maskPhoneBR,
  },
  {
    campo: "email",
    rotulo: "E-mail",
    placeholder: "cliente@email.com",
    inputMode: "email",
    mascara: (v) => v,
  },
  {
    campo: "cpf",
    rotulo: "CPF",
    placeholder: "000.000.000-00",
    inputMode: "numeric",
    mascara: maskCPF,
  },
];

export function BuscarOportunidade({
  valores,
  onChange,
  onBuscar,
  erros,
  resultado,
  onCriado,
}: {
  valores: BuscaCliente;
  onChange: (campo: keyof BuscaCliente, valor: string) => void;
  onBuscar: () => void;
  /** Só depois da primeira tentativa: não grita enquanto o corretor digita. */
  erros: ErrosBusca;
  resultado: ClienteEncontrado | null;
  onCriado: () => void;
}) {
  const qc = useQueryClient();

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

  return (
    <section aria-label="Buscar oportunidade" className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Preencha <b className="text-foreground">pelo menos um</b>: telefone, e-mail ou CPF.
      </p>

      {CAMPOS.map((c) => (
        <div key={c.campo}>
          <Label htmlFor={`buscar-${c.campo}`}>{c.rotulo}</Label>
          <Input
            id={`buscar-${c.campo}`}
            type={c.campo === "email" ? "email" : "text"}
            inputMode={c.inputMode}
            placeholder={c.placeholder}
            value={valores[c.campo]}
            aria-invalid={erros[c.campo] ? true : undefined}
            onChange={(e) => onChange(c.campo, c.mascara(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") onBuscar();
            }}
          />
          {erros[c.campo] && <p className="mt-1 text-xs text-destructive">{erros[c.campo]}</p>}
        </div>
      ))}

      {erros.geral && (
        <p className="text-sm text-destructive" data-testid="oportunidade-erro">
          {erros.geral}
        </p>
      )}

      {resultado && resultado.ja_na_carteira && resultado.meu_lead_id && (
        <p
          className="rounded-lg border border-border-subtle bg-muted/30 p-3 text-sm"
          data-testid="oportunidade-ja-sua"
        >
          <b>{resultado.nome ?? "Este cliente"}</b> já está na sua carteira (encontrado{" "}
          {rotuloMatch(resultado.match_por)}).{" "}
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

      {resultado && !resultado.ja_na_carteira && resultado.bloqueado && (
        <p
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid="oportunidade-bloqueada"
        >
          <b>{resultado.nome ?? "Este cliente"}</b> já tem cadastro e está em negociação avançada
          com outro corretor (visita realizada em diante). Não é possível criar o seu registro.
        </p>
      )}

      {resultado && !resultado.ja_na_carteira && !resultado.bloqueado && (
        <div
          className="space-y-2 rounded-lg border border-border-subtle bg-muted/30 p-3 text-sm"
          data-testid="oportunidade-disponivel"
        >
          <p>
            <b>{resultado.nome ?? "Este cliente"}</b> já tem cadastro no CRM (encontrado{" "}
            {rotuloMatch(resultado.match_por)}). Você pode criar o seu registro
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
