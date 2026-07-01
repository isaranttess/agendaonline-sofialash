import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Service = { id: string; name: string; price: number; duration_minutes: number; is_active: boolean; sort_order: number };

export default function ServicesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin_services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("sort_order");
      if (error) throw error;
      return data as Service[];
    },
  });

  const [editing, setEditing] = useState<Partial<Service> | null>(null);

  async function save() {
    if (!editing?.name || editing.price == null) { toast.error("Preencha nome e preço"); return; }
    const payload = {
      name: editing.name,
      price: Number(editing.price),
      duration_minutes: Number(editing.duration_minutes ?? 120),
      is_active: editing.is_active ?? true,
      sort_order: Number(editing.sort_order ?? 999),
    };
    const { error } = editing.id
      ? await supabase.from("services").update(payload).eq("id", editing.id)
      : await supabase.from("services").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Salvo"); setEditing(null); qc.invalidateQueries({ queryKey: ["admin_services"] }); qc.invalidateQueries({ queryKey: ["services","active"] }); }
  }

  async function toggleActive(s: Service) {
    const { error } = await supabase.from("services").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin_services"] });
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing({ is_active: true, duration_minutes: 120, sort_order: (data?.length ?? 0) + 1 })}>
              <Plus className="mr-1 h-4 w-4" />Novo serviço
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Novo"} serviço</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={editing?.price ?? ""} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></div>
                <div><Label>Duração (min)</Label><Input type="number" value={editing?.duration_minutes ?? 120} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Ativo</Label>
                <Switch checked={editing?.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
            <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      <div className="space-y-2">
        {data?.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">R$ {Number(s.price).toFixed(0)} • {s.duration_minutes} min</div>
            </div>
            <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
            <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}