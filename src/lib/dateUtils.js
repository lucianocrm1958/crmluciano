// Utility per la vista settimanale del calendario

export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = domenica
  const diff = day === 0 ? -6 : 1 - day; // lunedì come primo giorno
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function formatDayLabel(date) {
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

export function formatWeekRangeLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const startStr = weekStart.toLocaleDateString("it-IT", { day: "2-digit", month: sameMonth ? undefined : "short" });
  const endStr = weekEnd.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  return `${startStr} – ${endStr}`;
}
