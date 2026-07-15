import type { Firestore } from 'firebase/firestore';
import { bookingIsActive, type ArenaBooking } from '../bookings/arena-booking.model';
import { resolveAthleteLabel } from '../bookings/bookings-repository';
import { initialsOf } from '../ui/initials';
import type { ClientBookingStatus, RankedClient } from './ranked-client.model';

/** Sem "cliente" como entidade própria no schema — deriva o ranking agrupando
 *  `arenaBookings` (já real, `bookings-repository.ts`) por `athleteId` (ou por `customerName`
 *  pra reservas de balcão sem conta). Sem "VIP" marcável nem mensagens: nenhum dos dois existe
 *  em lugar nenhum do app (nem Flutter, nem functions, nem rules) — não são cortes de escopo. */

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function monthYearLabel(d: Date): string {
  return `${MONTH_LABELS[d.getMonth()]}/${d.getFullYear()}`;
}

function dateKeyToDisplay(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return d && m ? `${d}/${m}` : dateKey;
}

function historyStatusOf(b: ArenaBooking): ClientBookingStatus {
  if (!bookingIsActive(b)) return 'cancelada';
  if (b.attendanceStatus === 'checked_in') return 'concluida';
  if (b.attendanceStatus === 'no_show') return 'no_show';
  return 'confirmada';
}

function groupKeyOf(b: ArenaBooking): string {
  return b.athleteId.trim() || (b.customerName ? `name:${b.customerName.trim()}` : `booking:${b.id}`);
}

export async function fetchRankedClients(db: Firestore, bookings: readonly ArenaBooking[]): Promise<RankedClient[]> {
  const groups = new Map<string, ArenaBooking[]>();
  for (const b of bookings) {
    const key = groupKeyOf(b);
    const list = groups.get(key);
    if (list) list.push(b);
    else groups.set(key, [b]);
  }

  const entries = await Promise.all(
    [...groups.entries()].map(async ([id, group]): Promise<RankedClient | null> => {
      const active = group.filter((b) => bookingIsActive(b));
      if (active.length === 0) return null;

      const checkedIn = group.filter((b) => b.attendanceStatus === 'checked_in');
      const noShow = group.filter((b) => b.attendanceStatus === 'no_show');
      const resolvedCount = checkedIn.length + noShow.length;
      const spend = active.reduce((sum, b) => sum + (b.amountReais ?? 0), 0);

      const createdDates = group.map((b) => b.createdAt).filter((d): d is Date => d != null);
      const memberSince = createdDates.length > 0 ? new Date(Math.min(...createdDates.map((d) => d.getTime()))) : null;

      const athleteId = group.find((b) => b.athleteId.trim())?.athleteId ?? '';
      const explicitName = group.find((b) => b.customerName)?.customerName ?? null;
      const name = explicitName ?? (athleteId ? await resolveAthleteLabel(db, athleteId) : 'Cliente');

      const history = group
        .slice()
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
        .map((b) => ({
          dateLabel: dateKeyToDisplay(b.dateKey),
          court: b.courtName,
          time: `${b.startTime}–${b.endTime}`,
          status: historyStatusOf(b),
          price: b.amountReais,
          createdAt: b.createdAt,
        }));

      return {
        id,
        name,
        initials: initialsOf(name),
        games: checkedIn.length,
        spend,
        attendance: resolvedCount > 0 ? Math.round((checkedIn.length / resolvedCount) * 100) : null,
        memberSinceLabel: memberSince ? monthYearLabel(memberSince) : '—',
        history,
      };
    }),
  );

  return entries
    .filter((c): c is RankedClient => c != null)
    .sort((a, b) => b.games - a.games || b.spend - a.spend);
}
