import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { BookingRaw } from './agenda-logic';

/** Espelha `BookingService.watchMyBookings` (Flutter) — duas queries de igualdade simples em
 *  `arenaBookings` (`athleteId`/`bookingAthleteId`, cobre convidado de reserva), sem índice
 *  novo (nenhum `orderBy` na própria query — ordenação acontece em memória). */

function stringOf(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

export async function fetchMyBookings(db: Firestore, uid: string): Promise<BookingRaw[]> {
  const col = collection(db, 'arenaBookings');
  const [snapA, snapB] = await Promise.all([
    getDocs(query(col, where('athleteId', '==', uid))),
    getDocs(query(col, where('bookingAthleteId', '==', uid))),
  ]);
  const byId = new Map<string, BookingRaw>();
  for (const d of [...snapA.docs, ...snapB.docs]) {
    const data = d.data() as Record<string, unknown>;
    byId.set(d.id, {
      id: d.id,
      arenaName: stringOf(data, 'arenaName'),
      courtName: stringOf(data, 'courtName'),
      dateKey: stringOf(data, 'date') ?? '',
      startTime: stringOf(data, 'startTime') ?? '00:00',
      endTime: stringOf(data, 'endTime') ?? '00:00',
      status: stringOf(data, 'status') ?? 'active',
      paymentStatus: stringOf(data, 'paymentStatus') ?? 'paid',
      amountReais: typeof data['amountReais'] === 'number' ? (data['amountReais'] as number) : 0,
    });
  }
  return [...byId.values()];
}
