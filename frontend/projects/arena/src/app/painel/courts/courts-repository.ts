import { fetchCourts } from '@nexago/arena-discovery';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import type { ArenaCourt, ArenaCourtStatus } from './court.model';

/** Espelha `CourtService` (Flutter) — CRUD de `arenas/{arenaId}/courts/{courtId}` + o
 *  reflexo em `arenas/{arenaId}` (`courtTypes`/`pricePerHourReais`, lido pela tela Perfil e
 *  pela busca do atleta), que `ArenaSearchMetadataService.syncFromCourts` mantém em dia lá. */

function courtFromRaw(id: string, data: Record<string, unknown>): ArenaCourt {
  const types = Array.isArray(data['types']) ? (data['types'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const legacyType = typeof data['type'] === 'string' ? data['type'] : null;
  const resolvedTypes = types.length > 0 ? types : legacyType ? [legacyType] : [];
  const status: ArenaCourtStatus = data['status'] === 'maintenance' || data['maintenance'] === true ? 'maintenance' : 'active';
  const price =
    (typeof data['basePricePerHourReais'] === 'number' ? data['basePricePerHourReais'] : null) ??
    (typeof data['basePriceReais'] === 'number' ? data['basePriceReais'] : null);
  return {
    id,
    name: typeof data['name'] === 'string' && data['name'].trim() ? data['name'] : 'Quadra',
    types: resolvedTypes,
    status,
    basePricePerHourReais: price,
  };
}

export async function fetchCourtsList(db: Firestore, arenaId: string): Promise<ArenaCourt[]> {
  const courts = await fetchCourts(db, arenaId);
  return courts.map((c) => courtFromRaw(c.id, c.data));
}

export async function fetchCourt(db: Firestore, arenaId: string, courtId: string): Promise<ArenaCourt | null> {
  const snap = await getDoc(doc(db, 'arenas', arenaId, 'courts', courtId));
  if (!snap.exists()) return null;
  return courtFromRaw(snap.id, snap.data() as Record<string, unknown>);
}

export interface CourtInput {
  name: string;
  types: string[];
  status: ArenaCourtStatus;
  basePricePerHourReais: number | null;
}

function validateCourtInput(input: CourtInput): string | null {
  if (!input.name.trim()) return 'Informe o nome da quadra.';
  if (input.types.length === 0) return 'Selecione ao menos um esporte.';
  return null;
}

/** Recalcula `courtTypes`/`pricePerHourReais`/`basePriceReais` de `arenas/{arenaId}` a partir
 *  de todas as quadras (une com os esportes já escolhidos no Perfil) — espelha
 *  `ArenaSearchMetadataService.syncFromCourts`. Chamado após todo create/update/delete. */
async function syncArenaSearchMetadata(db: Firestore, arenaId: string): Promise<void> {
  const [arenaSnap, courts] = await Promise.all([getDoc(doc(db, 'arenas', arenaId)), fetchCourts(db, arenaId)]);
  const arenaData = (arenaSnap.data() ?? {}) as Record<string, unknown>;
  const profileSports = Array.isArray(arenaData['courtTypes'])
    ? (arenaData['courtTypes'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  const fromCourts = new Set<string>();
  let minPrice: number | null = null;
  for (const court of courts) {
    const types = Array.isArray(court.data['types']) ? (court.data['types'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    for (const t of types) fromCourts.add(t);
    const legacyType = court.data['type'];
    if (typeof legacyType === 'string' && legacyType) fromCourts.add(legacyType);
    const price =
      (typeof court.data['basePricePerHourReais'] === 'number' ? court.data['basePricePerHourReais'] : null) ??
      (typeof court.data['basePriceReais'] === 'number' ? court.data['basePriceReais'] : null);
    if (price != null && price > 0 && (minPrice == null || price < minPrice)) minPrice = price;
  }

  const merged = [...new Set([...profileSports, ...fromCourts])];
  const patch: Record<string, unknown> = { courtTypes: merged, searchMetadataUpdatedAt: serverTimestamp() };
  if (minPrice != null) {
    patch['pricePerHourReais'] = minPrice;
    patch['basePriceReais'] = minPrice;
  }
  await setDoc(doc(db, 'arenas', arenaId), patch, { merge: true });
}

function courtPayload(input: CourtInput): Record<string, unknown> {
  const uniqueTypes = [...new Set(input.types.map((t) => t.trim()).filter(Boolean))];
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    types: uniqueTypes,
    type: uniqueTypes[0],
    status: input.status,
  };
  if (input.basePricePerHourReais != null && input.basePricePerHourReais > 0) {
    payload['basePricePerHourReais'] = input.basePricePerHourReais;
    payload['basePriceReais'] = input.basePricePerHourReais;
  }
  return payload;
}

export async function createCourt(db: Firestore, arenaId: string, input: CourtInput): Promise<string> {
  const error = validateCourtInput(input);
  if (error) throw new Error(error);
  const ref = await addDoc(collection(db, 'arenas', arenaId, 'courts'), {
    ...courtPayload(input),
    createdAt: serverTimestamp(),
  });
  await syncArenaSearchMetadata(db, arenaId);
  return ref.id;
}

export async function updateCourt(db: Firestore, arenaId: string, courtId: string, input: CourtInput): Promise<void> {
  const error = validateCourtInput(input);
  if (error) throw new Error(error);
  await updateDoc(doc(db, 'arenas', arenaId, 'courts', courtId), {
    ...courtPayload(input),
    updatedAt: serverTimestamp(),
  });
  await syncArenaSearchMetadata(db, arenaId);
}

export async function deleteCourt(db: Firestore, arenaId: string, courtId: string): Promise<void> {
  await deleteDoc(doc(db, 'arenas', arenaId, 'courts', courtId));
  await syncArenaSearchMetadata(db, arenaId);
}
