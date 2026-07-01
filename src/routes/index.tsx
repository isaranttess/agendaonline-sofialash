import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sofia Emanoela — Espaço Estética Lash" },
      { name: "description", content: "Agende online sua extensão de cílios com Sofia Emanoela. Volumes brasileiro, russo, egípcio, efeitos fox, coreano e mais." },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: services, isLoading } = useQuery({
    queryKey: ["services", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-5xl px-5 pt-14 pb-20 text-center sm:pt-20 sm:pb-28">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-1.5 text-xs font-medium text-foreground/80 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Espaço Estética Lash
          </div>
          <h1 className="font-display mt-6 text-4xl leading-tight text-foreground sm:text-6xl">
            Sofia Emanoela
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-foreground/70 sm:text-lg">
            Olhar marcante, cílios impecáveis. Escolha seu serviço favorito e agende em poucos toques.
          </p>
          <a href="#servicos" className="mt-8 inline-block">
            <Button size="lg" className="rounded-full px-8">
              Ver serviços
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </a>
        </div>
      </header>

      {/* Services */}
      <section id="servicos" className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <h2 className="font-display text-3xl text-foreground sm:text-4xl">Nossos serviços</h2>
        <p className="mt-2 text-sm text-muted-foreground">Toque em um serviço para agendar.</p>

        <div className="mt-8 space-y-3">
          {isLoading && (
            <div className="text-sm text-muted-foreground">Carregando serviços…</div>
          )}
          {services?.map((s) => (
            <Link
              key={s.id}
              to="/agendar/$serviceId"
              params={{ serviceId: s.id }}
              className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg text-foreground">{s.name}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {s.duration_minutes} min
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-primary">
                  R$ {Number(s.price).toFixed(0)}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-primary/80 transition-transform group-hover:translate-x-0.5">
                  Agendar <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © Sofia Emanoela — Espaço Estética Lash
      </footer>
    </div>
  );
}