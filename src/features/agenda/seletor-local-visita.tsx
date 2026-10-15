// Seletor do local da visita no link de agendamento — o Mapa de Lojas em
// formato compacto, dentro do formulário do link.
//
// O corretor busca o stand (construtora, bairro ou endereço), toca no pino ou
// na linha da lista, e o link nasce para aquele endereço. Os mesmos dados do
// /mapa-lojas: a base salva abre na hora e a planilha (fonte viva) entra assim
// que chega; o navegador refina a posição dos stands sem coordenada.
//
// Carregado sob demanda (React.lazy) pelo diálogo do link: Leaflet e a base de
// stands só descem quando o corretor abre o formulário.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, MagnifyingGlass, MapPin, PencilSimple } from "@phosphor-icons/react";
import { LojasMap } from "@/components/lojas/lojas-map";
import { usePosicoesRefinadas } from "@/components/lojas/use-posicoes-refinadas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LOJAS_BASE,
  corDaConstrutora,
  enderecoCompleto,
  filtrarLojas,
  filtrosLojasVazios,
  type Loja,
} from "@/lib/lojas/lojas";
import { buscarPlanilhaLojas } from "@/lib/lojas/lojas-planilha-client";
import { cn } from "@/lib/utils";

export type LocalDaVisita = {
  /** Id estável do stand no Mapa de Lojas; null = endereço digitado. */
  localId: string | null;
  /** "Construtora · Stand"; vazio = endereço digitado. */
  localNome: string;
  endereco: string;
};

/** O que o link guarda de um stand: o nome que o cliente reconhece e o endereço completo. */
export function localDaLoja(loja: Loja): LocalDaVisita {
  return {
    localId: loja.id,
    localNome: `${loja.construtora} · ${loja.nome}`,
    endereco: enderecoCompleto(loja),
  };
}

/** Quantas linhas a lista mostra antes de pedir para refinar a busca. */
const LIMITE_LISTA = 40;

export default function SeletorLocalVisita({
  valor,
  onChange,
}: {
  valor: LocalDaVisita;
  onChange: (local: LocalDaVisita) => void;
}) {
  const [modo, setModo] = useState<"stand" | "manual">(
    valor.endereco && !valor.localId ? "manual" : "stand",
  );
  const [busca, setBusca] = useState("");
  // Clicar de novo no mesmo stand volta a focar o mapa nele.
  const [focarEm, setFocarEm] = useState(0);

  const planilhaQ = useQuery({
    queryKey: ["lojas-planilha"],
    queryFn: buscarPlanilhaLojas,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const lojas = usePosicoesRefinadas(planilhaQ.data ?? LOJAS_BASE);
  const filtradas = useMemo(
    () => filtrarLojas(lojas, { ...filtrosLojasVazios, q: busca }),
    [lojas, busca],
  );

  const escolher = (loja: Loja) => {
    onChange(localDaLoja(loja));
    setFocarEm((n) => n + 1);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Local da visita</Label>
        <div
          role="group"
          aria-label="Como informar o local"
          className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-[3px]"
        >
          {(
            [
              ["stand", "Stand do mapa"],
              ["manual", "Outro endereço"],
            ] as const
          ).map(([m, rotulo]) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => {
                setModo(m);
                // Trocar de modo limpa o que não vale no outro.
                if (m === "manual" && valor.localId)
                  onChange({ localId: null, localNome: "", endereco: "" });
                if (m === "stand" && !valor.localId)
                  onChange({ localId: null, localNome: "", endereco: "" });
              }}
              className={cn(
                "h-[26px] rounded-md px-2.5 text-[12px] font-medium text-muted-foreground transition-colors",
                modo === m && "bg-background text-foreground shadow-sm",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {modo === "manual" ? (
        <div className="space-y-1.5">
          <Input
            aria-label="Endereço da visita"
            value={valor.endereco}
            maxLength={300}
            placeholder="Ex.: Rua Tuiuti, 2000 - Tatuapé, São Paulo"
            onChange={(e) => onChange({ localId: null, localNome: "", endereco: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Em branco, o cliente informa o endereço na hora de agendar.
          </p>
        </div>
      ) : (
        <>
          {valor.localId ? (
            <div className="flex items-start gap-2 rounded-lg border border-exito-300 bg-exito-50 p-2.5 text-sm dark:bg-exito-950/30">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-exito-600" weight="fill" />
              <div className="min-w-0">
                <p className="font-semibold leading-tight">{valor.localNome}</p>
                <p className="text-xs text-muted-foreground">{valor.endereco}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Toque num pino ou num stand da lista. O link fica com o endereço dele.
            </p>
          )}

          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar stand"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar stand: construtora, bairro ou endereço"
              className="pl-8"
            />
          </div>

          <LojasMap
            lojas={filtradas}
            mostrarZonas={false}
            mostrarMetro={false}
            modo="seletor"
            focadaId={valor.localId}
            focarEm={focarEm}
            onSelecionar={(id) => {
              const loja = lojas.find((l) => l.id === id);
              if (loja) onChange(localDaLoja(loja));
            }}
            className="h-44"
          />

          <ul
            aria-label="Stands"
            className="max-h-44 divide-y overflow-y-auto rounded-lg border text-sm"
          >
            {filtradas.slice(0, LIMITE_LISTA).map((loja) => {
              const ativa = loja.id === valor.localId;
              return (
                <li key={loja.id}>
                  <button
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => escolher(loja)}
                    className={cn(
                      "flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-accent",
                      ativa && "bg-primary/10",
                    )}
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: corDaConstrutora(loja.construtora) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-tight">
                        {loja.construtora} · {loja.nome}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {loja.endereco}
                        {loja.bairro ? ` · ${loja.bairro}` : ""}
                      </span>
                    </span>
                    {ativa && (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" weight="fill" />
                    )}
                  </button>
                </li>
              );
            })}
            {filtradas.length === 0 && (
              <li className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
                <MapPin className="h-4 w-4" /> Nenhum stand com “{busca}”.
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    setModo("manual");
                    onChange({ localId: null, localNome: "", endereco: busca });
                  }}
                >
                  <PencilSimple className="h-3.5 w-3.5" /> Digitar o endereço
                </button>
              </li>
            )}
          </ul>
          {filtradas.length > LIMITE_LISTA && (
            <p className="text-xs text-muted-foreground">
              Mostrando {LIMITE_LISTA} de {filtradas.length}. Refine a busca para achar o stand.
            </p>
          )}
        </>
      )}
    </div>
  );
}
