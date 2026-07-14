import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut, Sparkles } from "lucide-react";
import AppointmentsTab from "./AppointmentsTab";
import ServicesTab from "./ServicesTab";
import SlotsTab from "./SlotsTab";
import BlockedDatesTab from "./BlockedDatesTab";

export default function AdminDashboard({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [tab, setTab] = useState("appointments");
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Painel admin</div>
              <div className="font-display text-lg">Sofia Emanoela</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onSignOut}><LogOut className="mr-1 h-4 w-4" />Sair</Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="appointments">Agendamentos</TabsTrigger>
            <TabsTrigger value="services">Serviços</TabsTrigger>
            <TabsTrigger value="slots">Horários</TabsTrigger>
            <TabsTrigger value="blocked">Folgas</TabsTrigger>
          </TabsList>
          <TabsContent value="appointments" className="mt-6"><AppointmentsTab /></TabsContent>
          <TabsContent value="services" className="mt-6"><ServicesTab /></TabsContent>
          <TabsContent value="slots" className="mt-6"><SlotsTab /></TabsContent>
          <TabsContent value="blocked" className="mt-6"><BlockedDatesTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}