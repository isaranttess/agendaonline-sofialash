import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Calendar as CalIcon, Check, Clock, Loader2, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { computeSlots, formatDateBR, toDateString, minutesToTime, timeToMinutes } from "@/lib/booking-utils";
import { z } from "zod";

export const Route = createFileRoute("/agendar/$serviceId")({
  head: () => ({ meta: [{ title: "Agendar — Sofia Emanoela" }] }),
  component: BookingPage,
});

const formSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(80),
  phone: z.string().trim().min(8, "Telefone inválido").max(20),
});

type Step = "date" | "time" | "form" | "done";

function BookingPage() {
  const { serviceId } = Route.useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ id: string } | null>(null);

  const { data: service, isLoading: loadingService } = useQuery({
    queryKey: ["service", serviceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").eq("id", serviceId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: hours } = useQuery({
    queryKey: ["business_hours"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_hours").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: blocked } = useQuery({
    queryKey: ["blocked_dates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("blocked_dates").select("blocked_date");
      if (error) throw error;
      return data;
    },
  });

  // Build calendar days (next 45 days)
  const days = useMemo(() => {
    const arr: { date: Date; dateStr: string; available: boolean }[] = [];
    const blockedSet = new Set((blocked ?? []).map((b) => b.blocked_date as string));
    const hoursByDow = new Map((hours ?? []).map((h) => [h.day_of_week, h]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 45; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = toDateString(d);
      const hh = hoursByDow.get(d.getDay());
      const available = !!hh && hh.is_open && !blockedSet.has(dateStr);
      arr.push({ date: d, dateStr, available });
    }
    return arr;
  }, [hours, blocked]);

  // Load booked slots for selected date
  const { data: takenSlots, isLoading: loadingSlots } = useQuery({
    queryKey: ["appointments", selectedDate],
    enabled: !!selectedDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("appointment_date", selectedDate!)
        .eq("status", "confirmed");
      if (error) throw error;
      return data;
    },
  });

  const availableTimes = useMemo(() => {
    if (!selectedDate || !service || !hours) return [];
    const d = new Date(selectedDate + "T00:00:00");
    const hh = hours.find((h) => h.day_of_week === d.getDay());
    if (!hh || !hh.is_open) return [];
    const isToday = toDateString(new Date()) === selectedDate;
    return computeSlots(
      hh.open_time.slice(0, 5),
      hh.close_time.slice(0, 5),
      service.duration_minutes,
      takenSlots ?? [],
      30,
      new Date(),
      isToday,
    );
  }, [selectedDate, service, hours, takenSlots]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = formSchema.safeParse({ name, phone });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (!service || !selectedDate || !selectedTime) return;
    setSubmitting(true);

    const startMin = timeToMinutes(selectedTime);
    const endTime = minutesToTime(startMin + service.duration_minutes);

    // Re-check availability
    const { data: conflict } = await supabase
      .from("appointments")
      .select("id")
      .eq("appointment_date", selectedDate)
      .eq("status", "confirmed")
      .lt("start_time", endTime)
      .gt("end_time", selectedTime);

    if (conflict && conflict.length > 0) {
      toast.error("Ops! Esse horário acabou de ser reservado. Escolha outro.");
      setSubmitting(false);
      setStep("time");
      return;
    }

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        service_id: service.id,
        client_name: parsed.data.name,
        client_phone: parsed.data.phone,
        appointment_date: selectedDate,
        start_time: selectedTime,
        end_time: endTime,
      })
      .select("id")
      .single();

    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível confirmar. Tente novamente.");
      return;
    }
    setConfirmation({ id: data.id });
    setStep("done");
  }

  if (loadingService) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!service) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-muted-foreground">Serviço não encontrado.</p>
        <Link to="/" className="mt-4 inline-block text-primary underline">Voltar</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <button
            onClick={() => {
              if (step === "done") { navigate({ to: "/" }); return; }
              if (step === "form") setStep("time");
              else if (step === "time") setStep("date");
              else navigate({ to: "/" });
            }}
            className="rounded-full p-2 hover:bg-muted"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">Agendamento</div>
            <div className="truncate font-display text-lg text-foreground">{service.name}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-primary">R$ {Number(service.price).toFixed(0)}</div>
            <div className="text-xs text-muted-foreground">{service.duration_minutes} min</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        {step === "date" && (
          <section>
            <h2 className="font-display text-2xl">Escolha uma data</h2>
            <p className="mt-1 text-sm text-muted-foreground">Dias em cinza estão indisponíveis.</p>
            <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {days.map((d) => {
                const label = d.date.toLocaleDateString("pt-BR", { day: "2-digit" });
                const weekday = d.date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
                const month = d.date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                return (
                  <button
                    key={d.dateStr}
                    disabled={!d.available}
                    onClick={() => { setSelectedDate(d.dateStr); setSelectedTime(null); setStep("time"); }}
                    className={
                      "flex flex-col items-center rounded-xl border p-2 text-center transition " +
                      (d.available
                        ? "border-border bg-card hover:border-primary hover:bg-primary/5"
                        : "cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground/50")
                    }
                  >
                    <span className="text-[10px] uppercase">{weekday}</span>
                    <span className="text-lg font-semibold">{label}</span>
                    <span className="text-[10px] uppercase">{month}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === "time" && selectedDate && (
          <section>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalIcon className="h-4 w-4" />
              {formatDateBR(selectedDate)}
            </div>
            <h2 className="mt-2 font-display text-2xl">Escolha um horário</h2>
            {loadingSlots ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando horários…
              </div>
            ) : availableTimes.length === 0 ? (
              <div className="mt-6 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nenhum horário disponível neste dia. Escolha outra data.
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {availableTimes.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setSelectedTime(t); setStep("form"); }}
                    className="rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium transition hover:border-primary hover:bg-primary/5"
                  >
                    <Clock className="mr-1 inline h-3 w-3" />
                    {t}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {step === "form" && selectedDate && selectedTime && (
          <section>
            <h2 className="font-display text-2xl">Seus dados</h2>
            <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Serviço</span><span>{service.name}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Data</span><span>{formatDateBR(selectedDate)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Horário</span><span>{selectedTime}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Valor</span><span className="font-semibold text-primary">R$ {Number(service.price).toFixed(0)}</span></div>
            </div>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="name">Nome completo</Label>
                <div className="relative mt-1">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="pl-9" placeholder="Seu nome" />
                </div>
              </div>
              <div>
                <Label htmlFor="phone">WhatsApp / Telefone</Label>
                <div className="relative mt-1">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="phone" required maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9" placeholder="(11) 99999-9999" inputMode="tel" />
                </div>
              </div>
              <Button type="submit" size="lg" className="w-full rounded-full" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar agendamento
              </Button>
            </form>
          </section>
        )}

        {step === "done" && confirmation && selectedDate && selectedTime && (
          <section className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mt-4 font-display text-3xl">Agendamento confirmado!</h2>
            <p className="mt-2 text-sm text-muted-foreground">Te esperamos no dia marcado 💕</p>

            <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-border bg-card p-5 text-left text-sm shadow-[var(--shadow-soft)]">
              <div className="font-display text-lg text-foreground">{service.name}</div>
              <div className="mt-3 space-y-1.5 text-muted-foreground">
                <div className="flex justify-between"><span>Data</span><span className="text-foreground">{formatDateBR(selectedDate)}</span></div>
                <div className="flex justify-between"><span>Horário</span><span className="text-foreground">{selectedTime}</span></div>
                <div className="flex justify-between"><span>Duração</span><span className="text-foreground">{service.duration_minutes} min</span></div>
                <div className="flex justify-between"><span>Cliente</span><span className="text-foreground">{name}</span></div>
                <div className="flex justify-between"><span>Valor</span><span className="font-semibold text-primary">R$ {Number(service.price).toFixed(0)}</span></div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Olá Sofia! Acabei de agendar ${service.name} para ${formatDateBR(selectedDate)} às ${selectedTime}. — ${name}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button size="lg" variant="outline" className="w-full rounded-full sm:w-auto">Avisar Sofia no WhatsApp</Button>
              </a>
              <Link to="/"><Button size="lg" className="w-full rounded-full sm:w-auto">Voltar ao início</Button></Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}