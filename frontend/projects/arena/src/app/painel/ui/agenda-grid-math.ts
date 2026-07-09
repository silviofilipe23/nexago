export const AGENDA_GRID_START_MIN = 7 * 60;
export const AGENDA_GRID_END_MIN = 22 * 60;
export const AGENDA_SLOT_MIN = 30;
export const AGENDA_ROW_HEIGHT = 34;

export function minutesToRowOffset(minutes: number): number {
  return ((minutes - AGENDA_GRID_START_MIN) / AGENDA_SLOT_MIN) * AGENDA_ROW_HEIGHT;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isWithinGrid(minutes: number): boolean {
  return minutes >= AGENDA_GRID_START_MIN && minutes <= AGENDA_GRID_END_MIN;
}

export function nowInMinutes(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}
