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

/**
 * Compute available start times for a day.
 * - openTime/closeTime "HH:MM"
 * - duration in minutes
 * - taken: array of {start_time, end_time} already booked (confirmed)
 * - stepMinutes: increment between candidate slots
 */
export function computeSlots(
  openTime: string,
  closeTime: string,
  duration: number,
  taken: { start_time: string; end_time: string }[],
  stepMinutes = 30,
  now?: Date,
  isToday = false,
): string[] {
  const openMin = timeToMinutes(openTime);
  const closeMin = timeToMinutes(closeTime);
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : 0;

  const busy = taken.map((t) => ({
    start: timeToMinutes(t.start_time.slice(0, 5)),
    end: timeToMinutes(t.end_time.slice(0, 5)),
  }));

  const slots: string[] = [];
  for (let m = openMin; m + duration <= closeMin; m += stepMinutes) {
    if (isToday && m <= nowMin) continue;
    const slotEnd = m + duration;
    const overlap = busy.some((b) => m < b.end && slotEnd > b.start);
    if (!overlap) slots.push(minutesToTime(m));
  }
  return slots;
}