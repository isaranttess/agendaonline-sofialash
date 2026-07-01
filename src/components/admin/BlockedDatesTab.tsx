import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { formatDateBR } from "@/lib/booking-utils";

type Blocked = { id: string; blocked_date: string; reason: string | null };

export default function BlockedDatesTab() {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin_blocked"],
    queryFn: async () => {
      const { data, error } = await supabase.from("blocked_dates").select("*").order("blocked_date");
      if (error) throw error;
      return data as Blocked[];
    },
  });

  async function add() {
    if (!date) { toast.error("Escolha uma data"); return; }
    const { error } = await supabase.from("blocked_dates").insert({ blocked_date: date, reason: reason || null });
    if (error) toast.error(error.message);
    else { setDate(""); setReason(""); qc.invalidateQueries({ queryKey: ["admin_blocked"] }); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("blocked_dates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin_blocked"] });
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-48" />
        <Input placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1" />
        <Button onClick={add}>Bloquear data</Button>
      </div>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      <div className="space-y-2">
        {data?.length === 0 && <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nenhuma data bloqueada.</div>}
        {data?.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
            <div>
              <div className="font-medium">{formatDateBR(b.blocked_date)}</div>
              {b.reason && <div className="text-xs text-muted-foreground">{b.reason}</div>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}