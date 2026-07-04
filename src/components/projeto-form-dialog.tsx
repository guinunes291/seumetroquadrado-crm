import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { slugify } from "@/lib/projetos";
import type { ProjetoRow } from "@/components/projeto-card";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projeto sendo editado, ou null para criar um novo. */
  editing: ProjetoRow | null;
  onSubmit: (payload: Record<string, unknown>) => void;
  isPending: boolean;
};

const numOrNull = (v: FormDataEntryValue | null): number | null => {
  const s = v == null ? "" : String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const strOrNull = (v: FormDataEntryValue | null): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s || null;
};

/**
 * Formulário completo de cadastro/edição de empreendimento. Cobre todos os
 * campos que alimentam o card e os filtros do catálogo (localização, specs,
 * preço, entrega), para que projetos criados na mão fiquem completos sem depender
 * da importação. A munição comercial (renda, perfil, diferenciais, argumentos)
 * continua na aba "Comercial" do detalhe do projeto.
 */
export function ProjetoFormDialog({ open, onOpenChange, editing, onSubmit, isPending }: Props) {
  const [ativo, setAtivo] = useState(editing?.ativo ?? true);
  const [sobConsulta, setSobConsulta] = useState(editing?.sob_consulta ?? false);

  // Os campos de texto/número resetam via remount (key abaixo); os toggles são
  // controlados, então ressincronizamos ao abrir para criar/editar.
  useEffect(() => {
    if (open) {
      setAtivo(editing?.ativo ?? true);
      setSobConsulta(editing?.sob_consulta ?? false);
    }
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get("nome") ?? "").trim();
    onSubmit({
      // Identificação
      nome,
      slug: strOrNull(fd.get("slug")) ?? slugify(nome),
      construtora: strOrNull(fd.get("construtora")),
      fonte: strOrNull(fd.get("fonte")),
      tipologia: strOrNull(fd.get("tipologia")),
      tipo_extra: strOrNull(fd.get("tipo_extra")),
      ativo,
      // Localização
      cidade: strOrNull(fd.get("cidade")),
      regiao: strOrNull(fd.get("regiao")),
      bairro: strOrNull(fd.get("bairro")),
      zona_smq: strOrNull(fd.get("zona_smq")),
      logradouro: strOrNull(fd.get("logradouro")),
      numero: strOrNull(fd.get("numero")),
      // Specs
      dorms_min: numOrNull(fd.get("dorms_min")),
      dorms_max: numOrNull(fd.get("dorms_max")),
      suites: numOrNull(fd.get("suites")),
      vagas_min: numOrNull(fd.get("vagas_min")),
      vagas_max: numOrNull(fd.get("vagas_max")),
      vagas_observacao: strOrNull(fd.get("vagas_observacao")),
      metragem_min: numOrNull(fd.get("metragem_min")),
      metragem_max: numOrNull(fd.get("metragem_max")),
      // Preço
      preco_a_partir: sobConsulta ? null : numOrNull(fd.get("preco_a_partir")),
      sob_consulta: sobConsulta,
      // Entrega
      status_entrega: strOrNull(fd.get("status_entrega")),
      mes_entrega: numOrNull(fd.get("mes_entrega")),
      ano_entrega: numOrNull(fd.get("ano_entrega")),
      // Material comercial (Vitrine)
      book_url: strOrNull(fd.get("book_url")),
      tabela_precos_url: strOrNull(fd.get("tabela_precos_url")),
      // Outros
      observacoes: strOrNull(fd.get("observacoes")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle>
        </DialogHeader>

        {/* key remonta o form ao trocar entre criar/editar, resetando os defaults */}
        <form key={editing?.id ?? "novo"} onSubmit={handleSubmit} className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-muted-foreground">Identificação</h3>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={ativo} onCheckedChange={setAtivo} aria-label="Projeto ativo" />
                {ativo ? "Ativo" : "Inativo"}
              </label>
            </div>
            <div>
              <Label htmlFor="nome">Nome do empreendimento *</Label>
              <Input id="nome" name="nome" required defaultValue={editing?.nome ?? ""} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="auto"
                  defaultValue={editing?.slug ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="construtora">Construtora</Label>
                <Input
                  id="construtora"
                  name="construtora"
                  defaultValue={editing?.construtora ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="tipologia">Tipologia</Label>
                <Input
                  id="tipologia"
                  name="tipologia"
                  placeholder="ex.: Apartamento, Studio"
                  defaultValue={editing?.tipologia ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="tipo_extra">Tipo / tags (separados por vírgula)</Label>
                <Input
                  id="tipo_extra"
                  name="tipo_extra"
                  placeholder="ex.: MCMV, Lançamento"
                  defaultValue={editing?.tipo_extra ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="fonte">Fonte</Label>
                <Input id="fonte" name="fonte" defaultValue={editing?.fonte ?? ""} />
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Localização</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cidade">Cidade</Label>
                <Input id="cidade" name="cidade" defaultValue={editing?.cidade ?? ""} />
              </div>
              <div>
                <Label htmlFor="regiao">Região</Label>
                <Input id="regiao" name="regiao" defaultValue={editing?.regiao ?? ""} />
              </div>
              <div>
                <Label htmlFor="bairro">Bairro</Label>
                <Input id="bairro" name="bairro" defaultValue={editing?.bairro ?? ""} />
              </div>
              <div>
                <Label htmlFor="zona_smq">Zona SMQ</Label>
                <Input id="zona_smq" name="zona_smq" defaultValue={editing?.zona_smq ?? ""} />
              </div>
              <div className="sm:col-span-2 grid grid-cols-[1fr_120px] gap-3">
                <div>
                  <Label htmlFor="logradouro">Logradouro</Label>
                  <Input
                    id="logradouro"
                    name="logradouro"
                    defaultValue={editing?.logradouro ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="numero">Número</Label>
                  <Input id="numero" name="numero" defaultValue={editing?.numero ?? ""} />
                </div>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Características</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label htmlFor="dorms_min">Dorms (mín)</Label>
                <Input
                  id="dorms_min"
                  name="dorms_min"
                  type="number"
                  min="0"
                  defaultValue={editing?.dorms_min ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="dorms_max">Dorms (máx)</Label>
                <Input
                  id="dorms_max"
                  name="dorms_max"
                  type="number"
                  min="0"
                  defaultValue={editing?.dorms_max ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="suites">Suítes</Label>
                <Input
                  id="suites"
                  name="suites"
                  type="number"
                  min="0"
                  defaultValue={editing?.suites ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="vagas_min">Vagas (mín)</Label>
                <Input
                  id="vagas_min"
                  name="vagas_min"
                  type="number"
                  min="0"
                  defaultValue={editing?.vagas_min ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="vagas_max">Vagas (máx)</Label>
                <Input
                  id="vagas_max"
                  name="vagas_max"
                  type="number"
                  min="0"
                  defaultValue={editing?.vagas_max ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="metragem_min">Área mín (m²)</Label>
                <Input
                  id="metragem_min"
                  name="metragem_min"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editing?.metragem_min ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="metragem_max">Área máx (m²)</Label>
                <Input
                  id="metragem_max"
                  name="metragem_max"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editing?.metragem_max ?? ""}
                />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <Label htmlFor="vagas_observacao">Observação de vagas</Label>
                <Input
                  id="vagas_observacao"
                  name="vagas_observacao"
                  placeholder="ex.: 1 a 2 vagas, a consultar"
                  defaultValue={editing?.vagas_observacao ?? ""}
                />
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Preço</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <Label htmlFor="preco_a_partir">Preço a partir de (R$)</Label>
                <Input
                  id="preco_a_partir"
                  name="preco_a_partir"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={sobConsulta}
                  defaultValue={editing?.preco_a_partir ?? ""}
                />
              </div>
              <label className="flex items-center gap-2 text-sm pb-2">
                <Switch
                  checked={sobConsulta}
                  onCheckedChange={setSobConsulta}
                  aria-label="Sob consulta"
                />
                Preço sob consulta
              </label>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Entrega</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="status_entrega">Status da obra</Label>
                <Input
                  id="status_entrega"
                  name="status_entrega"
                  placeholder="ex.: Em obras, Pronto"
                  defaultValue={editing?.status_entrega ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="mes_entrega">Mês de entrega</Label>
                <Input
                  id="mes_entrega"
                  name="mes_entrega"
                  type="number"
                  min="1"
                  max="12"
                  defaultValue={editing?.mes_entrega ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="ano_entrega">Ano de entrega</Label>
                <Input
                  id="ano_entrega"
                  name="ano_entrega"
                  type="number"
                  min="2000"
                  max="2100"
                  defaultValue={editing?.ano_entrega ?? ""}
                />
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Material comercial (Vitrine)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="book_url">Link do Book (PDF/Drive)</Label>
                <Input
                  id="book_url"
                  name="book_url"
                  type="url"
                  placeholder="https://…"
                  defaultValue={editing?.book_url ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="tabela_precos_url">Link da Tabela de preços</Label>
                <Input
                  id="tabela_precos_url"
                  name="tabela_precos_url"
                  type="url"
                  placeholder="https://…"
                  defaultValue={editing?.tabela_precos_url ?? ""}
                />
              </div>
            </div>
          </section>

          <Separator />

          <div>
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              rows={3}
              defaultValue={editing?.observacoes ?? ""}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
