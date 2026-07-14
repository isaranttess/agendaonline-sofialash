import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateBR, toDateString } from "@/lib/booking-utils";
import { Loader2, Phone, X } from "lucide-react";
import { toast } from "sonner";

type Filter = "today" | "week" | "all";

export default function AppointmentsTab() {
  const [filter, setFilter] = useState<Filter>("week");
  const qc = useQueryClient();

  const { fromDate, toDateStr } = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    if (filter === "today") return { fromDate: toDateString(today), toDateStr: toDateString(today) };
    if (filter === "week") {
      const end = new Date(today); end.setDate(today.getDate() + 7);
      return { fromDate: toDateString(today), toDateStr: toDateString(end) };
    }
    return { fromDate: null as string | null, toDateStr: null as string | null };
  }, [filter]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_appointments", filter],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("*, services(name, price)")
        .eq("status", "confirmed")
        .order("appointment_date")
        .order("start_time");
      if (fromDate) q = q.gte("appointment_date", fromDate);
      if (toDateStr) q = q.lte("appointment_date", toDateStr);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  async function cancel(id: string) {
    if (!confirm("Cancelar este agendamento?")) return;
    const { error } = await supabase.from("appointments").update({
      status: "cancelled",
      cancelled_by: "admin",
      cancelled_at: new Date().toISOString(),
      cancellation_notified: false,
    }).eq("id", id);
    if (error) toast.error("Erro ao cancelar");
    else {
      toast.success("Agendamento cancelado — horário liberado");
      qc.invalidateQueries({ queryKey: ["admin_appointments"] });
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["today","week","all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="rounded-full">
            {f === "today" ? "Hoje" : f === "week" ? "Próximos 7 dias" : "Todos"}
          </Button>
        ))}
      </div>

      {isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
      {data && data.length === 0 && <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Nenhum agendamento no período.</div>}

      <div className="space-y-3">
        {data?.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="font-display text-base">{a.services?.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatDateBR(a.appointment_date)} • {a.start_time.slice(0,5)} – {a.end_time.slice(0,5)}
              </div>
              <div className="mt-2 text-sm">
                <span className="font-medium">{a.client_name}</span>
                <a href={`https://wa.me/${a.client_phone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-primary hover:underline">
                  <Phone className="h-3 w-3" />{a.client_phone}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right text-sm font-semibold text-primary">R$ {Number(a.services?.price ?? 0).toFixed(0)}</div>
              <Button size="sm" variant="ghost" onClick={() => cancel(a.id)}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}