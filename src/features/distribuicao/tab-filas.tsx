// Aba "Filas" — TODAS as roletas do banco num lugar só: as 4 zonas, as de
// sistema (Plantão, Marquinhos, Landing e a Base universal do modelo v2) e as
// campanhas (com badge de equipe fixa). Substitui as antigas abas "Roletas
// por Zona" e "Roletas de Origem" e absorve a gestão de roleta que vivia no
// painel de Campanhas — participantes SEMPRE pelo RPC auditado
// (gerenciar_participante_roleta), propriedades SEMPRE por atualizar_roleta.

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ZONA_ROLETAS, roletaLabel } from "@/lib/distribuicao";
import { useCriarRoletaCampanha, useRoletas, type RoletaRow } from "./queries";
import { FilaPropriedades } from "./fila-propriedades";
import { RoletaTab } from "./roleta-tab";

type Grupo = "zonas" | "sistema" | "campanhas";

const GRUPO_LABEL: Record<Grupo, string> = {
  zonas: "Zonas",
  sistema: "Sistema",
  campanhas: "Campanhas",
};

const ORDEM_SISTEMA = ["plantao", "marquinhos", "landing", "base"];

const DESCRICAO_GRUPO: Record<Grupo, string> = {
  zonas:
    "A participação na roleta é o próprio corte geográfico: quem está aqui recebe os leads desta zona. Zona sem corretor ativo não trava lead — ele volta para o fluxo por origem.",
  sistema:
    "Plantão, Marquinhos e Landing são o fallback de quem não tem zona resolvida. A Base é a esteira universal do modelo v2: rodízio puro para todos os aptos.",
  campanhas:
    "Cada campanha tem token de webhook próprio e equipe própria (distribuição ponderada por tier). Equipe fixa: o lead nunca sai do time, seja qual for a zona.",
};

function grupoDe(r: RoletaRow): Grupo {
  if (r.tipo === "zona") return "zonas";
  if (r.tipo === "campanha") return "campanhas";
  return "sistema";
}

export function TabFilas({
  somenteLeitura,
  filaInicial,
}: {
  somenteLeitura: boolean;
  filaInicial?: string;
}) {
  const roletasQ = useRoletas();
  const [novaCampanhaAberta, setNovaCampanhaAberta] = useState(false);

  const grupos = useMemo(() => {
    const todas = roletasQ.data ?? [];
    const zonas = ZONA_ROLETAS.map((slug) => todas.find((r) => r.slug === slug)).filter(
      (r): r is RoletaRow => !!r,
    );
    const sistema = todas
      .filter((r) => grupoDe(r) === "sistema")
      .sort((a, b) => {
        const ia = ORDEM_SISTEMA.indexOf(a.slug);
        const ib = ORDEM_SISTEMA.indexOf(b.slug);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    const campanhas = todas
      .filter((r) => grupoDe(r) === "campanhas")
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { zonas, sistema, campanhas } as Record<Grupo, RoletaRow[]>;
  }, [roletasQ.data]);

  const grupoInicial: Grupo = useMemo(() => {
    if (!filaInicial) return "zonas";
    const alvo = (roletasQ.data ?? []).find((r) => r.slug === filaInicial);
    return alvo ? grupoDe(alvo) : "zonas";
  }, [filaInicial, roletasQ.data]);

  const [grupo, setGrupo] = useState<Grupo>(grupoInicial);
  const [filaPorGrupo, setFilaPorGrupo] = useState<Partial<Record<Grupo, string>>>(
    filaInicial ? { [grupoInicial]: filaInicial } : {},
  );

  const filas = grupos[grupo];
  const slugSelecionado = filaPorGrupo[grupo] ?? filas[0]?.slug;
  const fila = filas.find((r) => r.slug === slugSelecionado) ?? filas[0];

  if (roletasQ.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={grupo} onValueChange={(v) => setGrupo(v as Grupo)}>
          <TabsList>
            {(Object.keys(GRUPO_LABEL) as Grupo[]).map((g) => (
              <TabsTrigger key={g} value={g}>
                {GRUPO_LABEL[g]}
                <span className="ml-1.5 text-[11px] text-muted-foreground tabular-nums">
                  {grupos[g].length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {grupo === "campanhas" && !somenteLeitura && (
          <Button size="sm" onClick={() => setNovaCampanhaAberta(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova campanha
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{DESCRICAO_GRUPO[grupo]}</p>

      {filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma fila neste grupo ainda.
        </p>
      ) : (
        <>
          <Tabs
            value={fila?.slug}
            onValueChange={(v) => setFilaPorGrupo((s) => ({ ...s, [grupo]: v }))}
          >
            <TabsList className="h-auto flex-wrap justify-start">
              {filas.map((r) => (
                <TabsTrigger key={r.slug} value={r.slug}>
                  {roletaLabel(r.slug, r.nome)}
                  {!r.ativo && (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      inativa
                    </Badge>
                  )}
                  {r.equipe_fixa && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px]">
                      equipe fixa
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {fila && (
            <>
              <FilaPropriedades roleta={fila} somenteLeitura={somenteLeitura} />
              <RoletaTab slug={fila.slug} nome={fila.nome} somenteLeitura={somenteLeitura} />
            </>
          )}
        </>
      )}

      {novaCampanhaAberta && <NovaCampanhaDialog onClose={() => setNovaCampanhaAberta(false)} />}
    </div>
  );
}

/** Criação de campanha — a roleta nasce no SERVIDOR (slug único + token via
 *  gen_random_bytes) pela RPC criar_roleta_campanha, auditada. */
function NovaCampanhaDialog({ onClose }: { onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [equipeFixa, setEquipeFixa] = useState(false);
  const criar = useCriarRoletaCampanha();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Cria a fila da campanha com token de webhook gerado no servidor. Depois, monte a equipe
            na própria fila e aponte a fonte (Zap/n8n) para a URL do token.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nova-campanha-nome">Nome da campanha</Label>
            <Input
              id="nova-campanha-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Equipe Bruno"
              autoFocus
            />
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Switch checked={equipeFixa} onCheckedChange={setEquipeFixa} id="nova-campanha-fixa" />
            <div className="space-y-0.5">
              <Label htmlFor="nova-campanha-fixa">Equipe fixa</Label>
              <p className="text-xs text-muted-foreground">
                Os leads desta campanha caem sempre neste time — não vão para as roletas de zona,
                seja qual for a zona do lead.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              criar.mutate({ nome: nome.trim(), equipeFixa }, { onSuccess: () => onClose() })
            }
            disabled={!nome.trim() || criar.isPending}
          >
            {criar.isPending ? "Criando…" : "Criar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
