import { fetchCourts } from '@nexago/arena-discovery';
import { addDoc, collection, deleteField, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { arenaSlotFromDoc, type ArenaSlot, type ArenaSlotBlockReason } from './arena-slot.model';
import { buildVirtualSlots, mergeSlots } from './virtual-slot-generator';

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

/** Bloqueia um slot já persistido em `arenaSlots/{slotId}`. */
export async function blockSlot(db: Firestore, slotId: string, reason?: ArenaSlotBlockReason, note?: string): Promise<void> {
  if (slotId.startsWith('v_')) {
    throw new ScheduleRepositoryError('Este horário ainda não existe no Firestore. Bloqueie a partir do slot completo.');
  }
  const ref = doc(db, 'arenaSlots', slotId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new ScheduleRepositoryError('Horário não encontrado.');
  const status = (snap.data()['status'] as string | undefined)?.trim().toLowerCase() ?? '';
  if (status === 'booked' || status === 'occupied' || status === 'reservado' || status === 'ocupado') {
    throw new ScheduleRepositoryError('Este horário está reservado e não pode ser bloqueado.');
  }
  if (status === 'blocked' || status === 'bloqueado') return;
  await updateDoc(ref, blockPayload(reason, note));
}

/** Cria o doc de `arenaSlots` pra bloquear um slot virtual (sem doc ainda no Firestore). */
export async function blockVirtualSlot(db: Firestore, slot: ArenaSlot, reason?: ArenaSlotBlockReason, note?: string): Promise<void> {
  if (!slot.isVirtual) throw new ScheduleRepositoryError('Use blockSlot(slotId) para horários já salvos.');
  if (slot.status === 'booked') throw new ScheduleRepositoryError('Este horário está reservado e não pode ser bloqueado.');
  if (slot.status === 'blocked') return;

  await addDoc(collection(db, 'arenaSlots'), {
    arenaId: slot.arenaId,
    courtId: slot.courtId,
    date: slot.dateKey,
    startTime: slot.startTime,
    endTime: slot.endTime,
    ...blockPayload(reason, note),
  });
}

/** Libera um horário bloqueado (`status: available`). */
export async function unblockSlot(db: Firestore, slotId: string): Promise<void> {
  if (slotId.startsWith('v_')) {
    throw new ScheduleRepositoryError('Este horário ainda não existe no Firestore. Não é possível desbloquear.');
  }
  const ref = doc(db, 'arenaSlots', slotId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new ScheduleRepositoryError('Horário não encontrado.');
  const status = (snap.data()['status'] as string | undefined)?.trim().toLowerCase() ?? '';
  if (status === 'booked' || status === 'occupied' || status === 'reservado' || status === 'ocupado') {
    throw new ScheduleRepositoryError('Este horário está reservado; não pode ser desbloqueado.');
  }
  if (status !== 'blocked' && status !== 'bloqueado') return;
  await updateDoc(ref, {
    status: 'available',
    blockedAt: deleteField(),
    blockReason: deleteField(),
    blockNote: deleteField(),
  });
}
