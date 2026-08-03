import { arenaPeakRuleFromFirestore, type ArenaPeakRule } from '@nexago/arena-discovery';
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs,
  serverTimestamp, updateDoc, type Firestore,
} from 'firebase/firestore';

/** CRUD de `arenas/{arenaId}/peakRules/{ruleId}` — regra de reserva mínima em
 *  horário de pico. Criar/editar exige plano Pro/Elite
 *  (`ArenaContextService.hasCapability('horariosPico')` + rules); excluir é livre. */

export interface PeakRuleInput {
  label: string;
  active: boolean;
  /** Vazio = todas as quadras. */
  courtIds: string[];
  /** ISO 1-7 (seg-dom). Vazio = todos os dias. */
  weekdays: number[];
  startTime: string;
  endTime: string;
  minDurationMinutes: number;
  /** null = nunca libera por antecedência. */
  releaseHoursBefore: number | null;
}

export function validatePeakRuleInput(input: PeakRuleInput): string | null {
  if (!input.label.trim()) return 'Informe o nome da regra.';
  if (!input.startTime || !input.endTime) return 'Informe o horário de início e fim.';
  if (input.minDurationMinutes < 60 || input.minDurationMinutes > 360) {
    return 'O mínimo deve ser entre 1h e 6h.';
  }
  if (
    input.releaseHoursBefore != null &&
    (input.releaseHoursBefore < 1 || input.releaseHoursBefore > 48)
  ) {
    return 'A liberação antecipada deve ser entre 1 e 48 horas.';
  }
  return null;
}

function basePayload(input: PeakRuleInput): Record<string, unknown> {
  return {
    active: input.active,
    label: input.label.trim(),
    courtIds: input.courtIds,
    weekdays: input.weekdays,
    startTime: input.startTime,
    endTime: input.endTime,
    minDurationMinutes: input.minDurationMinutes,
  };
}

export async function fetchAllPeakRules(db: Firestore, arenaId: string): Promise<ArenaPeakRule[]> {
  const snap = await getDocs(collection(db, 'arenas', arenaId, 'peakRules'));
  const list = snap.docs.map((d) => arenaPeakRuleFromFirestore(d));
  list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
  });
  return list;
}

export async function fetchPeakRule(
  db: Firestore, arenaId: string, ruleId: string,
): Promise<ArenaPeakRule | null> {
  const snap = await getDoc(doc(db, 'arenas', arenaId, 'peakRules', ruleId));
  return snap.exists() ? arenaPeakRuleFromFirestore(snap) : null;
}

export async function createPeakRule(
  db: Firestore, arenaId: string, input: PeakRuleInput,
): Promise<string> {
  const error = validatePeakRuleInput(input);
  if (error) throw new Error(error);
  const payload: Record<string, unknown> = {
    ...basePayload(input),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.releaseHoursBefore != null) payload['releaseHoursBefore'] = input.releaseHoursBefore;
  const ref = await addDoc(collection(db, 'arenas', arenaId, 'peakRules'), payload);
  return ref.id;
}

export async function updatePeakRule(
  db: Firestore, arenaId: string, ruleId: string, input: PeakRuleInput,
): Promise<void> {
  const error = validatePeakRuleInput(input);
  if (error) throw new Error(error);
  await updateDoc(doc(db, 'arenas', arenaId, 'peakRules', ruleId), {
    ...basePayload(input),
    updatedAt: serverTimestamp(),
    releaseHoursBefore:
      input.releaseHoursBefore != null ? input.releaseHoursBefore : deleteField(),
  });
}

export async function setPeakRuleActive(
  db: Firestore, arenaId: string, ruleId: string, active: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'arenas', arenaId, 'peakRules', ruleId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePeakRule(db: Firestore, arenaId: string, ruleId: string): Promise<void> {
  await deleteDoc(doc(db, 'arenas', arenaId, 'peakRules', ruleId));
}
