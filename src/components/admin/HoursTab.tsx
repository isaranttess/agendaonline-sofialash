import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const DAYS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

type Hour = { id: string; day_of_week: number; open_time: string; close_time: string; is_open: boolean };

export default function HoursTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin_hours"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_hours").select("*").order("day_of_week");
      if (error) throw error;
      return data as Hour[];
    },
  });

  async function update(h: Hour, patch: Partial<Hour>) {
    const { error } = await supabase.from("business_hours").update(patch).eq("id", h.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin_hours"] });
  }

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-2">
      {data?.map((h) => (
        <div key={h.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="w-24 font-medium">{DAYS[h.day_of_week]}</div>
          <div className="flex flex-1 items-center gap-2">
            <Input type="time" value={h.open_time.slice(0,5)} onChange={(e) => update(h, { open_time: e.target.value })} disabled={!h.is_open} className="w-32" />
            <span className="text-muted-foreground">até</span>
            <Input type="time" value={h.close_time.slice(0,5)} onChange={(e) => update(h, { close_time: e.target.value })} disabled={!h.is_open} className="w-32" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{h.is_open ? "Aberto" : "Fechado"}</span>
            <Switch checked={h.is_open} onCheckedChange={(v) => update(h, { is_open: v })} />
          </div>
        </div>
      ))}
    </div>
  );
}