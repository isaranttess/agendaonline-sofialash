import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Ban, Check, Calendar as CalIcon } from "lucide-react";
import { toast } from "sonner";
import { formatDateBR, toDateString } from "@/lib/booking-utils";

type Weekly = { id: string; day_of_week: number; slot_time: string };
type Override = { id: string; slot_date: string; slot_time: string; is_disabled: boolean };
type Appt = { appointment_date: string; start_time: string; end_time: string; client_name: string; status: string };

const RANGE_DAYS = 30;

export default function SlotsTab() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const rangeEnd = useMemo(() => { const d = new Date(today); d.setDate(today.getDate() + RANGE_DAYS); return d; }, [today]);
  const todayStr = toDateString(today);
  const endStr = toDateString(rangeEnd);

  const { data: weekly } = useQuery({
    queryKey: ["admin_weekly_slots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("weekly_slots").select("*").order("day_of_week").order("slot_time");
      if (error) throw error;
      return data as Weekly[];
    },
  });

  const { data: overrides } = useQuery({
    queryKey: ["admin_slot_overrides", todayStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_overrides").select("*")
        .gte("slot_date", todayStr).lte("slot_date", endStr);
      if (error) throw error;
      return data as Override[];
    },
  });

  const { data: appts } = useQuery({
    queryKey: ["admin_slot_appointments", todayStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("appointment_date, start_time, end_time, client_name, status")
        .eq("status", "confirmed")
        .gte("appointment_date", todayStr).lte("appointment_date", endStr);
      if (error) throw error;
      return data as Appt[];
    },
  });

  const days = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const overridesByKey = new Map((overrides ?? []).map((o) => [`${o.slot_date}_${o.slot_time.slice(0,5)}`, o]));
    const apptsByDate = new Map<string, Appt[]>();
    (appts ?? []).forEach((a) => {
      const list = apptsByDate.get(a.appointment_date) ?? [];
      list.push(a); apptsByDate.set(a.appointment_date, list);
    });
    const arr: {
      dateStr: string; dow: number;
      slots: { time: string; status: "available"|"booked"|"disabled"|"past"; overrideId?: string; client?: string }[];
    }[] = [];
    for (let i = 0; i < RANGE_DAYS; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const dateStr = toDateString(d); const dow = d.getDay();
      const isToday = i === 0;
      const template = (weekly ?? []).filter((w) => w.day_of_week === dow);
      if (template.length === 0) continue;
      const dayAppts = apptsByDate.get(dateStr) ?? [];
      const slots = template.map((w) => {
        const time = w.slot_time.slice(0,5);
        const [h,m] = time.split(":").map(Number);
        const startMin = h*60+m;
        const ov = overridesByKey.get(`${dateStr}_${time}`);
        const booked = dayAppts.find((a) => a.start_time.slice(0,5) === time);
        let status: "available"|"booked"|"disabled"|"past" = "available";
        if (isToday && startMin <= nowMin) status = "past";
        else if (booked) status = "booked";
        else if (ov?.is_disabled) status = "disabled";
        return { time, status, overrideId: ov?.id, client: booked?.client_name };
      });
      arr.push({ dateStr, dow, slots });
    }
    return arr;
  }, [weekly, overrides, appts, today]);

  async function toggleDisable(dateStr: string, time: string, overrideId?: string, currentlyDisabled?: boolean) {
    setBusyId(`${dateStr}_${time}`);
    try {
      if (currentlyDisabled && overrideId) {
        const { error } = await supabase.from("slot_overrides").delete().eq("id", overrideId);
        if (error) throw error;
        toast.success("Horário reativado");
      } else {
        const { error } = await supabase.from("slot_overrides")
          .upsert({ slot_date: dateStr, slot_time: time, is_disabled: true }, { onConflict: "slot_date,slot_time" });
        if (error) throw error;
        toast.success("Horário desativado");
      }
      qc.invalidateQueries({ queryKey: ["admin_slot_overrides"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusyId(null); }
  }

  if (!weekly) return <Loader2 className="h-4 w-4 animate-spin" />;

  const legend = [
    { label: "Disponível", cls: "bg-primary/10 text-primary border-primary/30" },
    { label: "Ocupado", cls: "bg-muted text-foreground/60 border-border" },
    { label: "Desativado", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    { label: "Passado", cls: "bg-muted/40 text-muted-foreground border-transparent" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {legend.map((l) => (
          <span key={l.label} className={`rounded-full border px-2 py-0.5 ${l.cls}`}>{l.label}</span>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Toque em um horário disponível para desativá-lo, ou em um horário desativado para reativá-lo. Próximos {RANGE_DAYS} dias.</p>

      <div className="space-y-3">
        {days.map((d) => (
          <div key={d.dateStr} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm">
              <CalIcon className="h-4 w-4 text-primary" />
              <span className="font-medium capitalize">{formatDateBR(d.dateStr)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {d.slots.map((s) => {
                const k = `${d.dateStr}_${s.time}`;
                const isBusy = busyId === k;
                const canToggle = s.status === "available" || s.status === "disabled";
                const cls =
                  s.status === "available" ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20" :
                  s.status === "booked" ? "bg-muted text-foreground/60 border-border cursor-default" :
                  s.status === "disabled" ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20" :
                  "bg-muted/40 text-muted-foreground border-transparent cursor-default";
                return (
                  <button
                    key={k}
                    disabled={!canToggle || isBusy}
                    onClick={() => canToggle && toggleDisable(d.dateStr, s.time, s.overrideId, s.status === "disabled")}
                    className={`inline-flex min-w-[92px] items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${cls}`}
                    title={s.client ? `Reservado: ${s.client}` : undefined}
                  >
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> :
                      s.status === "disabled" ? <Ban className="h-3 w-3" /> :
                      s.status === "booked" ? <Check className="h-3 w-3" /> : null}
                    {s.time}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}