import { fetchCourts } from '@nexago/arena-discovery';
import { collection, deleteField, doc, onSnapshot, query, runTransaction, serverTimestamp, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { arenaSlotFromDoc, type ArenaSlot, type ArenaSlotBlockReason } from './arena-slot.model';
import { buildVirtualSlots, mergeSlots } from './virtual-slot-generator';
import type { WeekDay } from './agenda-week-math';

/** Espelha `SlotsRepository.watchArenaDaySlotsMerged` + `SlotService` (Flutter): um único
 *  listener em `arenaSlots` (por `arenaId`, sem filtro de dia — evita índice composto),
 *  mesclado em memória com os slots virtuais de cada quadra pro dia selecionado. */

export class ScheduleRepositoryError extends Error {}

export function watchArenaDaySlots(
  db: Firestore,
  arenaId: string,
  date: Date,
  dateKey: string,
  courts: readonly { id: string; data: Record<string, unknown> }[],
  onChange: (slots: ArenaSlot[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaSlots'), where('arenaId', '==', arenaId)),
    (snap) => {
      const allPersisted = snap.docs.map(arenaSlotFromDoc);
      const merged: ArenaSlot[] = [];
      for (const court of courts) {
        const persisted = allPersisted.filter((s) => s.dateKey === dateKey && s.courtId.toLowerCase() === court.id.toLowerCase());
        const virtual = buildVirtualSlots(arenaId, court.id, court.data, date, dateKey);
        merged.push(...mergeSlots(persisted, virtual));
      }
      merged.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId));
      onChange(merged);
    },
    () => onChange([]),
  );
}

/** Mesma ideia de `watchArenaDaySlots`, para os 7 dias de uma semana de uma vez — sem
 *  leitura extra do Firestore (o listener já busca todos os slots da arena, sem filtro
 *  de data); só mais filtragem/geração de slots virtuais em memória. */
export function watchArenaWeekSlots(
  db: Firestore,
  arenaId: string,
  weekDates: readonly WeekDay[],
  courts: readonly { id: string; data: Record<string, unknown> }[],
  onChange: (slots: ArenaSlot[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaSlots'), where('arenaId', '==', arenaId)),
    (snap) => {
      const allPersisted = snap.docs.map(arenaSlotFromDoc);
      const merged: ArenaSlot[] = [];
      for (const { date, dateKey } of weekDates) {
        for (const court of courts) {
          const persisted = allPersisted.filter((s) => s.dateKey === dateKey && s.courtId.toLowerCase() === court.id.toLowerCase());
          const virtual = buildVirtualSlots(arenaId, court.id, court.data, date, dateKey);
          merged.push(...mergeSlots(persisted, virtual));
        }
      }
      merged.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId));
      onChange(merged);
    },
    () => onChange([]),
  );
}

/** Quadras + dados crus (`availabilitySchedule`/`slotDurationMinutes`) — não dá pra usar
 *  `fetchCourtsList` aqui porque ele descarta esses campos ao parsear pro modelo simplificado. */
export async function fetchCourtsRaw(db: Firestore, arenaId: string): Promise<{ id: string; data: Record<string, unknown> }[]> {
  return fetchCourts(db, arenaId);
}

function blockPayload(reason?: ArenaSlotBlockReason, note?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { status: 'blocked', blockedAt: serverTimestamp() };
  if (reason) payload['blockReason'] = reason;
  const trimmed = note?.trim();
  if (trimmed) payload['blockNote'] = trimmed;
  return payload;
}

function isBookedStatus(raw: unknown): boolean {
  const status = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return status === 'booked' || status === 'occupied' || status === 'reservado' || status === 'ocupado';
}

/** Bloqueia vários horários de uma vez (ex.: 08:00–12:00 seguidos), tudo ou nada: numa
 *  transação, relê cada slot já salvo e, se algum virou reserva no meio do caminho, não
 *  bloqueia nenhum. Slot virtual (sem doc) ganha o doc já bloqueado; já bloqueado é pulado. */
export async function blockSlots(db: Firestore, slots: readonly ArenaSlot[], reason?: ArenaSlotBlockReason, note?: string): Promise<void> {
  const pending = slots.filter((s) => s.status !== 'blocked');
  if (pending.some((s) => s.status === 'booked')) {
    throw new ScheduleRepositoryError('Um dos horários está reservado e não pode ser bloqueado.');
  }
  const payload = blockPayload(reason, note);

  await runTransaction(db, async (tx) => {
    const persisted = pending.filter((s) => !s.isVirtual);
    const snaps = await Promise.all(persisted.map((s) => tx.get(doc(db, 'arenaSlots', s.id))));
    snaps.forEach((snap, i) => {
      if (!snap.exists()) throw new ScheduleRepositoryError('Horário não encontrado.');
      if (isBookedStatus(snap.data()['status'])) {
        const s = persisted[i];
        throw new ScheduleRepositoryError(`${s.startTime}–${s.endTime} foi reservado agora há pouco. Nada foi bloqueado.`);
      }
    });

    snaps.forEach((snap) => tx.update(snap.ref, payload));
    for (const s of pending.filter((p) => p.isVirtual)) {
      tx.set(doc(collection(db, 'arenaSlots')), {
        arenaId: s.arenaId,
        courtId: s.courtId,
        date: s.dateKey,
        startTime: s.startTime,
        endTime: s.endTime,
        ...payload,
      });
    }
  });
}

/** Libera vários horários bloqueados de uma vez (`status: available`), tudo ou nada: numa
 *  transação, relê cada um e, se algum virou reserva no meio do caminho, não libera nenhum.
 *  Quem já foi desbloqueado por outra pessoa é pulado. */
export async function unblockSlots(db: Firestore, slots: readonly ArenaSlot[]): Promise<void> {
  if (slots.some((s) => s.isVirtual || s.id.startsWith('v_'))) {
    throw new ScheduleRepositoryError('Este horário ainda não existe no Firestore. Não é possível desbloquear.');
  }
  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(slots.map((s) => tx.get(doc(db, 'arenaSlots', s.id))));
    const toRelease = snaps.filter((snap, i) => {
      if (!snap.exists()) throw new ScheduleRepositoryError('Horário não encontrado.');
      const status = String(snap.data()['status'] ?? '').trim().toLowerCase();
      if (isBookedStatus(status)) {
        const s = slots[i];
        throw new ScheduleRepositoryError(`${s.startTime}–${s.endTime} está reservado e não pode ser desbloqueado. Nada foi desbloqueado.`);
      }
      return status === 'blocked' || status === 'bloqueado';
    });
    for (const snap of toRelease) {
      tx.update(snap.ref, {
        status: 'available',
        blockedAt: deleteField(),
        blockReason: deleteField(),
        blockNote: deleteField(),
      });
    }
  });
}
