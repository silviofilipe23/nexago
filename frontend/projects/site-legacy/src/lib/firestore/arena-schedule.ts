/**
 * Forma do horário semanal da arena — sem nenhum import do Firebase.
 *
 * Mora fora de `arena-site-data.ts` porque `WEEKDAYS` é usado por client components
 * (`ArenaSchedule.tsx`): importar um valor daquele módulo traria o SDK completo do
 * Firestore junto para o bundle do navegador. Só tipos podem cruzar essa fronteira —
 * eles somem na compilação; valores, não.
 */

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DaySchedule {
  closed: boolean;
  open: string;
  close: string;
}

export type WeekSchedule = Record<Weekday, DaySchedule>;
