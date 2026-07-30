import { dateKeyOf } from '../bookings/arena-booking.model';

export interface WeekDay {
  date: Date;
  dateKey: string;
  isToday: boolean;
}

/** Segunda a domingo (convenção ISO, mesma de ARENA_WEEKDAYS) contendo `date`. Tudo em
 *  componentes locais de Date — nunca UTC (ver Global Constraints). */
export function weekDatesFor(date: Date): WeekDay[] {
  const jsDay = date.getDay(); // 0=domingo…6=sábado
  const isoWeekday = jsDay === 0 ? 7 : jsDay; // 1=segunda…7=domingo
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (isoWeekday - 1));
  const todayKey = dateKeyOf(new Date());

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateKey = dateKeyOf(d);
    return { date: d, dateKey, isToday: dateKey === todayKey };
  });
}
