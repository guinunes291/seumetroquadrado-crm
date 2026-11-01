// Venda por contrato — o formulário do comprador e a tabela "atual → novo".
// Só apresentação: o estado mora no diálogo.

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatPhoneBR,
  maskCPF,
  maskCurrencyBRL,
  maskPhoneBR,
  parseCurrencyBRL,
} from "@/lib/masks";
import { onlyDigits } from "@/lib/validators";
import {
  brlDeNumero,
  exibir,
  maskCEP,
  ROTULO_CAMPO,
  type CampoCliente,
  type DadosClienteContrato,
  type DiferencaCampo,
  type LeituraContrato,
} from "./contrato-venda";

export function FormularioComprador({
  dados,
  setDados,
  leitura,
  acao,
}: {
  dados: DadosClienteContrato;
  setDados: Dispatch<SetStateAction<DadosClienteContrato>>;
  leitura: LeituraContrato | null;
  /** Botão no cabeçalho da seção (ex.: "Buscar de novo"). */
  acao?: ReactNode;
}) {
  const conferir = (campo: CampoCliente) =>
    !!leitura && !leitura.camposLidos.includes(campo) && !dados[campo];

  const campo = (
    c: CampoCliente,
    opts: { tipo?: string; mascara?: (v: string) => string; limpar?: (v: string) => string } = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`contrato-${c}`} className="flex items-center gap-1.5 text-xs">
        {ROTULO_CAMPO[c]}
        {conferir(c) && (
          <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            conferir
          </span>
        )}
      </Label>
      <Input
        id={`contrato-${c}`}
        type={opts.tipo ?? "text"}
        value={opts.mascara ? opts.mascara(dados[c]) : dados[c]}
        onChange={(e) => {
          const v = opts.limpar ? opts.limpar(e.target.value) : e.target.value;
          setDados((d) => ({ ...d, [c]: v }));
        }}
        className={conferir(c) ? "border-amber-400 focus-visible:ring-amber-400" : undefined}
      />
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Dados do comprador</h3>
        {acao}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{campo("nome")}</div>
        {campo("cpf", { mascara: maskCPF, limpar: (v) => onlyDigits(v).slice(0, 11) })}
        {campo("telefone", {
          mascara: (v) => maskPhoneBR(v),
          limpar: (v) => onlyDigits(v).slice(0, 11),
        })}
        {campo("email", { tipo: "email" })}
        {campo("data_nascimento", { tipo: "date" })}
        {campo("rg")}
        {campo("rg_orgao_emissor")}
        {campo("estado_civil")}
        {campo("regime_casamento")}
        {campo("profissao")}
        {campo("nacionalidade")}
        {campo("renda_estimada", {
          mascara: brlDeNumero,
          limpar: (v) => {
            const n = parseCurrencyBRL(v);
            return n == null ? "" : String(n);
          },
        })}
      </div>

      <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Endereço residencial
      </h4>
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-4">{campo("endereco_logradouro")}</div>
        <div className="sm:col-span-2">{campo("endereco_numero")}</div>
        <div className="sm:col-span-3">{campo("endereco_complemento")}</div>
        <div className="sm:col-span-3">{campo("endereco_bairro")}</div>
        <div className="sm:col-span-3">{campo("endereco_cidade")}</div>
        <div className="sm:col-span-1">
          {campo("endereco_uf", {
            limpar: (v) =>
              v
                .toUpperCase()
                .replace(/[^A-Z]/g, "")
                .slice(0, 2),
          })}
        </div>
        <div className="sm:col-span-2">
          {campo("endereco_cep", {
            mascara: maskCEP,
            limpar: (v) => onlyDigits(v).slice(0, 8),
          })}
        </div>
      </div>

      <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Cônjuge / 2º comprador
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("conjuge_nome")}
        {campo("conjuge_cpf", {
          mascara: maskCPF,
          limpar: (v) => onlyDigits(v).slice(0, 11),
        })}
      </div>
    </section>
  );
}

export function DiferencasCliente({
  diferencas,
  marcado,
  alternar,
  registroFilho,
}: {
  diferencas: DiferencaCampo[];
  marcado: (campo: CampoCliente, padrao: boolean) => boolean;
  alternar: (campo: CampoCliente) => void;
  registroFilho: boolean;
}) {
  if (diferencas.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">
        {registroFilho
          ? "Dados do contrato que entram no seu registro"
          : "O que o contrato atualiza no cadastro"}
      </h3>
      <p className="text-xs text-muted-foreground">
        Marcado = grava o valor do contrato. Campos que o cliente não tinha já vêm marcados; os que
        mudam um valor existente você decide.
      </p>
      <div className="divide-y rounded-md border">
        {diferencas.map((d) => (
          <label key={d.campo} className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm">
            <Checkbox
              checked={marcado(d.campo, d.marcado)}
              onCheckedChange={() => alternar(d.campo)}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">{ROTULO_CAMPO[d.campo]}</span>
              {d.atual && (
                <>
                  <span className="text-muted-foreground line-through">
                    {exibir(d.campo, d.atual)}
                  </span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                </>
              )}
              <span className="font-medium">{exibir(d.campo, d.novo)}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
