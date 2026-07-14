export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type SlotStatus = "available" | "booked" | "disabled" | "past" | "conflict";

/**
 * Compute slot statuses for a specific date from a fixed template of slot times.
 * - templateTimes: "HH:MM" strings (that day's weekly template)
 * - duration: minutes the candidate service takes
 * - taken: confirmed appointments on that date
 * - disabled: slot times manually disabled by admin
 * - conflict = another confirmed booking overlaps this slot (so not offerable)
 */
export function computeSlotStatuses(
  templateTimes: string[],
  duration: number,
  taken: { start_time: string; end_time: string }[],
  disabled: string[],
  isToday = false,
  now: Date = new Date(),
): { time: string; status: SlotStatus }[] {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const busy = taken.map((t) => ({
    start: timeToMinutes(t.start_time.slice(0, 5)),
    end: timeToMinutes(t.end_time.slice(0, 5)),
  }));
  const disabledSet = new Set(disabled.map((d) => d.slice(0, 5)));

  return templateTimes.map((t) => {
    const time = t.slice(0, 5);
    const start = timeToMinutes(time);
    const end = start + duration;
    let status: SlotStatus = "available";
    if (isToday && start <= nowMin) status = "past";
    else if (disabledSet.has(time)) status = "disabled";
    else if (busy.some((b) => start === b.start)) status = "booked";
    else if (busy.some((b) => start < b.end && end > b.start)) status = "conflict";
    return { time, status };
  });
}