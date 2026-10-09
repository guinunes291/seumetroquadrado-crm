// Cadastro das filiais (admin e gestor): endereço, coordenadas e raio do
// plantão. Sem coordenadas o check-in na filial é só declarado; com elas, o
// banco calcula a distância do celular até a loja e a gestão vê no quadro
// (e pode exigir, em Central de Distribuição → Configurações).
//
// "Buscar pelo endereço" consulta o OpenStreetMap no navegador (o mesmo do
// Mapa de Lojas) e só PREENCHE o campo: quem salva é a gestão, depois de
// conferir o ponto no mapa — com raio de 300 m, ponto errado faz check-in
// legítimo parecer "fora do raio".

import { useState } from "react";
import {
  ArrowSquareOut,
  CircleNotch,
  FloppyDisk,
  MagnifyingGlass,
  MapPin,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useFiliais, useSalvarFilial, type FilialRow } from "./presenca-client";
import { coordenadasTexto, parseCoordenadas } from "./presenca-derive";
import { lerGeocodificacao, linkMapa, urlGeocodificacaoFilial } from "./filiais-geo";

export function FiliaisConfig() {
  const q = useFiliais();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <MapPin className="h-4 w-4 text-primary" /> Filiais
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Coordenadas: use “Buscar pelo endereço” e confira em “Ver no mapa” — ou, no Google Maps,
          clique com o botão direito na porta da loja, clique nos números para copiar e cole aqui. O
          raio é a distância máxima do celular até a loja para o check-in contar como confirmado.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          (q.data ?? []).map((f) => (
            <LinhaFilial key={`${f.id}:${f.raio_metros}:${f.latitude}`} f={f} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function LinhaFilial({ f }: { f: FilialRow }) {
  const salvar = useSalvarFilial();
  const [endereco, setEndereco] = useState(f.endereco ?? "");
  const [coords, setCoords] = useState(coordenadasTexto(f.latitude, f.longitude));
  const [raio, setRaio] = useState(String(f.raio_metros));
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

  const buscarPeloEndereco = async () => {
    setBuscando(true);
    setAviso(null);
    try {
      const r = await fetch(urlGeocodificacaoFilial(endereco), {
        headers: { accept: "application/json" },
      });
      const achado = r.ok ? lerGeocodificacao(await r.json()) : null;
      if (!achado) {
        setAviso({
          texto: "Não achei esse endereço. Cole as coordenadas do Google Maps.",
          ok: false,
        });
        return;
      }
      setCoords(coordenadasTexto(achado.lat, achado.lng));
      setAviso(
        achado.exato
          ? { texto: "Achei o número. Confira em “Ver no mapa” e salve.", ok: true }
          : {
              texto:
                "Achei só a avenida, não o número: o ponto pode estar longe da loja. Confira em “Ver no mapa” (ou cole do Google Maps) antes de salvar.",
              ok: false,
            },
      );
    } catch {
      setAviso({ texto: "A busca falhou. Cole as coordenadas do Google Maps.", ok: false });
    } finally {
      setBuscando(false);
    }
  };

  const coordsVazias = coords.trim() === "";
  const ponto = coordsVazias ? null : parseCoordenadas(coords);
  const raioN = Number(raio);
  const raioOk = Number.isInteger(raioN) && raioN >= 50 && raioN <= 5000;
  const valido = (coordsVazias || ponto !== null) && raioOk;
  const mudou =
    endereco !== (f.endereco ?? "") ||
    coords !== coordenadasTexto(f.latitude, f.longitude) ||
    raio !== String(f.raio_metros);

  const id = (campo: string) => `filial-${f.slug}-${campo}`;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">{f.nome}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Label htmlFor={id("ativa")}>{f.ativa ? "Ativa" : "Inativa"}</Label>
          <Switch
            id={id("ativa")}
            checked={f.ativa}
            disabled={salvar.isPending}
            onCheckedChange={(v) => salvar.mutate({ id: f.id, ativa: v })}
          />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-[2fr_1.4fr_0.8fr_auto] md:items-end">
        <div className="space-y-1">
          <Label htmlFor={id("endereco")} className="text-xs">
            Endereço
          </Label>
          <Input
            id={id("endereco")}
            value={endereco}
            placeholder="Rua, número"
            onChange={(e) => setEndereco(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("coords")} className="text-xs">
            Coordenadas (lat, lng)
          </Label>
          <Input
            id={id("coords")}
            value={coords}
            placeholder="-23.5260, -46.6660"
            aria-invalid={!coordsVazias && !ponto}
            onChange={(e) => {
              setCoords(e.target.value);
              setAviso(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
              disabled={!endereco.trim() || buscando}
              onClick={buscarPeloEndereco}
            >
              {buscando ? (
                <CircleNotch className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MagnifyingGlass className="h-3.5 w-3.5" />
              )}
              Buscar pelo endereço
            </button>
            {ponto && (
              <a
                href={linkMapa(ponto.lat, ponto.lng)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ArrowSquareOut className="h-3.5 w-3.5" /> Ver no mapa
              </a>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("raio")} className="text-xs">
            Raio (m)
          </Label>
          <Input
            id={id("raio")}
            type="number"
            min={50}
            max={5000}
            value={raio}
            aria-invalid={!raioOk}
            onChange={(e) => setRaio(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          disabled={!mudou || !valido || salvar.isPending}
          onClick={() =>
            salvar.mutate({
              id: f.id,
              endereco: endereco.trim() || null,
              latitude: ponto?.lat ?? null,
              longitude: ponto?.lng ?? null,
              raio_metros: raioN,
            })
          }
        >
          <FloppyDisk className="mr-1 h-3.5 w-3.5" /> Salvar
        </Button>
      </div>
      {!coordsVazias && !ponto && (
        <p className="mt-1 text-xs text-destructive">
          Coordenadas inválidas — use dois números, como -23.5260, -46.6660.
        </p>
      )}
      {!raioOk && <p className="mt-1 text-xs text-destructive">Raio entre 50 e 5000 metros.</p>}
      {aviso && (
        <p className={`mt-1 text-xs ${aviso.ok ? "text-success" : "text-warning"}`} role="status">
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
