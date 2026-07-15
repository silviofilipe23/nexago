import { arenaPromotionFromFirestore, type ArenaPromotion } from '@nexago/arena-discovery';
import { addDoc, collection, deleteDoc, deleteField, doc, getDocs, serverTimestamp, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';

/** Espelha `PromotionsRepository` (Flutter) — `arenas/{arenaId}/promotions/{promoId}`. Criar/editar
 *  exige plano Pro/Parceiro (`arenaEntitled`, ver `ArenaContextService.hasCapability('promocoes')`);
 *  excluir é livre. O desconto é XOR: só um entre `discountPercent`/`fixedPricePerHourReais`. */

export interface PromotionInput {
  label: string;
  active: boolean;
  /** Vazio = todas as quadras da arena. */
  courtIds: string[];
  /** ISO 1-7 (seg-dom). Vazio = todos os dias. */
  weekdays: number[];
  startTime: string;
  endTime: string;
  discountPercent: number | null;
  fixedPricePerHourReais: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

function validatePromotionInput(input: PromotionInput): string | null {
  if (!input.label.trim()) return 'Informe o nome da promoção.';
  if (input.discountPercent == null && input.fixedPricePerHourReais == null) {
    return 'Informe um desconto (percentual ou valor fixo por hora).';
  }
  if (!input.startTime || !input.endTime) return 'Informe o horário de início e fim.';
  return null;
}

function basePayload(input: PromotionInput): Record<string, unknown> {
  return {
    active: input.active,
    label: input.label.trim(),
    courtIds: input.courtIds,
    weekdays: input.weekdays,
    startTime: input.startTime,
    endTime: input.endTime,
  };
}

export async function fetchAllPromotions(db: Firestore, arenaId: string): Promise<ArenaPromotion[]> {
  const snap = await getDocs(collection(db, 'arenas', arenaId, 'promotions'));
  const list = snap.docs.map((d) => arenaPromotionFromFirestore(d));
  list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
  });
  return list;
}

export async function createPromotion(db: Firestore, arenaId: string, input: PromotionInput): Promise<string> {
  const error = validatePromotionInput(input);
  if (error) throw new Error(error);

  const payload: Record<string, unknown> = {
    ...basePayload(input),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.discountPercent != null) payload['discountPercent'] = input.discountPercent;
  if (input.fixedPricePerHourReais != null) payload['fixedPricePerHourReais'] = input.fixedPricePerHourReais;
  if (input.validFrom) payload['validFrom'] = Timestamp.fromDate(input.validFrom);
  if (input.validUntil) payload['validUntil'] = Timestamp.fromDate(input.validUntil);

  const ref = await addDoc(collection(db, 'arenas', arenaId, 'promotions'), payload);
  return ref.id;
}

export async function updatePromotion(db: Firestore, arenaId: string, promoId: string, input: PromotionInput): Promise<void> {
  const error = validatePromotionInput(input);
  if (error) throw new Error(error);

  await updateDoc(doc(db, 'arenas', arenaId, 'promotions', promoId), {
    ...basePayload(input),
    updatedAt: serverTimestamp(),
    discountPercent: input.discountPercent != null ? input.discountPercent : deleteField(),
    fixedPricePerHourReais: input.fixedPricePerHourReais != null ? input.fixedPricePerHourReais : deleteField(),
    validFrom: input.validFrom ? Timestamp.fromDate(input.validFrom) : deleteField(),
    validUntil: input.validUntil ? Timestamp.fromDate(input.validUntil) : deleteField(),
  });
}

export async function setPromotionActive(db: Firestore, arenaId: string, promoId: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'arenas', arenaId, 'promotions', promoId), { active, updatedAt: serverTimestamp() });
}

export async function deletePromotion(db: Firestore, arenaId: string, promoId: string): Promise<void> {
  await deleteDoc(doc(db, 'arenas', arenaId, 'promotions', promoId));
}
