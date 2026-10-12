// Aba "Filas" — TODAS as roletas do banco num lugar só: as roletas por
// filial, as de sistema (Plantão, Marquinhos, Landing e a Base universal do
// modelo v2), as campanhas (agrupadas pela filial dona, com badge de equipe
// fixa) e a do SDR. Substitui as antigas abas "Roletas por Zona" e "Roletas
// de Origem" e absorve a gestão de roleta que vivia no painel de Campanhas —
// participantes SEMPRE pelo RPC auditado (gerenciar_participante_roleta),
// propriedades SEMPRE por atualizar_roleta.
//
// Roletas por filial (decisão do dono, 12/10/2026): a lista das filiais vem
// do banco (roletas tipo 'zona' com filial, na ordem de filiais.ordem) —
// nunca de uma constante, para a gestão abrir loja sem deploy. As seis
// roletas zona-* antigas estão inativas e sem filial: não aparecem aqui.

import { lazy, Suspense, useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFiliais, type FilialRow } from "@/features/presenca/presenca-client";
import {
  agruparFiliais,
  frasesAlternancia,
  roletaLabel,
  secoesDeCampanhas,
} from "@/lib/distribuicao";
import { useCriarRoletaCampanha, useRoletas, useZonasRoletas, type RoletaRow } from "./queries";
import { FilaPropriedades } from "./fila-propriedades";
import { RoletaTab } from "./roleta-tab";

// Placar da permanência semanal (só admin, só na fila do SDR): lazy para não
// pesar no chunk principal de quem nunca abre a fila.
const PlacarRoletaSdrCard = lazy(() =>
  import("./placar-roleta-sdr").then(({ PlacarRoletaSdrCard }) => ({
    default: PlacarRoletaSdrCard,
  })),
);

type Grupo = "filiais" | "sistema" | "campanhas" | "sdr";

const GRUPO_LABEL: Record<Grupo, string> = {
  filiais: "Roletas por filial",
  sistema: "Sistema",
  campanhas: "Campanhas",
  sdr: "SDR",
};

const ORDEM_SISTEMA = ["plantao", "marquinhos", "landing", "base"];

const DESCRICAO_GRUPO: Record<Grupo, string> = {
  filiais:
    "Time fixo da filial; recebe os leads das zonas que ela atende, de qualquer origem. Filial sem corretor apto não trava lead: ele espera lá (nunca vai para outra zona).",
  sistema:
    "Plantão, Marquinhos e Landing são o fallback de quem não tem zona resolvida. A Base é a esteira universal do modelo v2: rodízio puro para todos os aptos.",
  campanhas:
    "Cada campanha tem token de webhook próprio e equipe própria (distribuição ponderada por tier) e pertence a uma filial — rótulo e agrupamento; qualquer corretor entra, de qualquer filial. Equipe fixa: a campanha manda — quem está na equipe recebe, de qualquer zona. Sem equipe fixa, o lead com zona vai para a roleta da filial da zona.",
  sdr: "Roleta de agendados do SDR: recebe o lead que o SDR agendou ou entregou com motivo. Aptidão própria — perfil ativo, telefone, teto de carteira e agenda livre no horário da visita; sem presença do dia nem cota diária. O corretor original de um lead reaquecido tem prioridade e nem passa por aqui. Com a regra semanal ligada, o time é montado pela produção: quem faz 3 pontos na semana (visita 1, pasta 1,5) fica para a seguinte.",
};

function grupoDe(r: RoletaRow): Grupo {
  if (r.tipo === "zona") return "filiais";
  if (r.tipo === "campanha") return "campanhas";
  if (r.tipo === "sdr") return "sdr";
  return "sistema";
}

/** A roleta de filial que a aba mostra: ativa, ou desligada mas com filial
 *  (para a gestão poder religar). As zona-* antigas (inativas, sem filial)
 *  ficam só no histórico. */
function ehRoletaDeFilialVisivel(r: RoletaRow): boolean {
  return r.tipo === "zona" && (r.ativo || r.filial_id !== null);
}

const SEM_FILIAL = "__sem_filial__";

export function TabFilas({
  somenteLeitura,
  filaInicial,
  escopoEquipe = false,
}: {
  somenteLeitura: boolean;
  filaInicial?: string;
  /** Gestor: monta a equipe das filas, mas só com corretores do próprio time. */
  escopoEquipe?: boolean;
}) {
  const roletasQ = useRoletas();
  const filiaisQ = useFiliais();
  const mapaQ = useZonasRoletas();
  const [novaCampanhaAberta, setNovaCampanhaAberta] = useState(false);

  const grupos = useMemo(() => {
    const todas = roletasQ.data ?? [];
    const ordemFilial = new Map((filiaisQ.data ?? []).map((f) => [f.id, f.ordem]));
    const filiais = todas
      .filter(ehRoletaDeFilialVisivel)
      .sort(
        (a, b) =>
          (a.filial_id ? (ordemFilial.get(a.filial_id) ?? 99) : 99) -
            (b.filial_id ? (ordemFilial.get(b.filial_id) ?? 99) : 99) ||
          a.nome.localeCompare(b.nome, "pt-BR"),
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
    const sdr = todas.filter((r) => grupoDe(r) === "sdr");
    return { filiais, sistema, campanhas, sdr } as Record<Grupo, RoletaRow[]>;
  }, [roletasQ.data, filiaisQ.data]);

  const secoesCampanhas = useMemo(
    () => secoesDeCampanhas(grupos.campanhas, filiaisQ.data ?? []),
    [grupos.campanhas, filiaisQ.data],
  );

  // "A Leste alterna entre Liberdade e Belém" — do mapa, não de texto fixo.
  const alternancia = useMemo(
    () => frasesAlternancia(agruparFiliais(mapaQ.data ?? [])).join(" "),
    [mapaQ.data],
  );

  const grupoInicial: Grupo = useMemo(() => {
    if (!filaInicial) return "filiais";
    const alvo = (roletasQ.data ?? []).find((r) => r.slug === filaInicial);
    return alvo ? grupoDe(alvo) : "filiais";
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

  const gatilho = (r: RoletaRow) => (
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
  );

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

      <p className="text-xs text-muted-foreground">
        {DESCRICAO_GRUPO[grupo]}
        {grupo === "filiais" && alternancia ? ` ${alternancia}` : ""}
      </p>

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
            {grupo === "campanhas" ? (
              <div className="space-y-2">
                {secoesCampanhas.map((sec) => (
                  <div key={sec.chave} className="space-y-1" data-testid="secao-campanhas">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {sec.titulo}
                    </p>
                    <TabsList className="h-auto flex-wrap justify-start">
                      {sec.filas.map(gatilho)}
                    </TabsList>
                  </div>
                ))}
              </div>
            ) : (
              <TabsList className="h-auto flex-wrap justify-start">{filas.map(gatilho)}</TabsList>
            )}
          </Tabs>

          {fila && (
            <>
              <FilaPropriedades roleta={fila} somenteLeitura={somenteLeitura} />
              {/* Placar de todos os corretores: leitura de admin (o banco recorta o resto). */}
              {fila.slug === "agendados-sdr" && !somenteLeitura && (
                <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                  <PlacarRoletaSdrCard />
                </Suspense>
              )}
              <RoletaTab
                slug={fila.slug}
                nome={fila.nome}
                somenteLeitura={somenteLeitura && !escopoEquipe}
                escopoEquipe={escopoEquipe}
              />
            </>
          )}
        </>
      )}

      {novaCampanhaAberta && (
        <NovaCampanhaDialog
          filiais={filiaisQ.data ?? []}
          onClose={() => setNovaCampanhaAberta(false)}
        />
      )}
    </div>
  );
}

/** Criação de campanha — a roleta nasce no SERVIDOR (slug único + token via
 *  gen_random_bytes) pela RPC criar_roleta_campanha, auditada. A filial dona
 *  (12/10/2026) é escolhida aqui e pode mudar depois nas propriedades da fila. */
function NovaCampanhaDialog({ filiais, onClose }: { filiais: FilialRow[]; onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [equipeFixa, setEquipeFixa] = useState(false);
  const [filialSlug, setFilialSlug] = useState<string>(SEM_FILIAL);
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
          <div className="space-y-1.5">
            <Label htmlFor="nova-campanha-filial">Filial</Label>
            <Select value={filialSlug} onValueChange={setFilialSlug}>
              <SelectTrigger id="nova-campanha-filial">
                <SelectValue placeholder="Sem filial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_FILIAL}>Nenhuma</SelectItem>
                {filiais
                  .filter((f) => f.ativa)
                  .map((f) => (
                    <SelectItem key={f.id} value={f.slug}>
                      {f.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A filial dona da campanha: rótulo e agrupamento na aba Filas. A equipe pode ter
              corretor de qualquer filial.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Switch checked={equipeFixa} onCheckedChange={setEquipeFixa} id="nova-campanha-fixa" />
            <div className="space-y-0.5">
              <Label htmlFor="nova-campanha-fixa">Equipe fixa</Label>
              <p className="text-xs text-muted-foreground">
                A campanha manda: quem está na equipe recebe, de qualquer zona — o lead não vai para
                a roleta da filial da zona dele.
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
              criar.mutate(
                {
                  nome: nome.trim(),
                  equipeFixa,
                  filialSlug: filialSlug === SEM_FILIAL ? null : filialSlug,
                },
                { onSuccess: () => onClose() },
              )
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
