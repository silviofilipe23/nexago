import { Injectable } from '@angular/core';
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { backofficeDb } from '../../data/firebase';
import { isCrmStatus, type ArenaCrmEntry, type ArenaCrmStatus } from './arena-crm';

export type ArenaPlanTier = 'starter' | 'pro' | 'elite';

export interface ArenaRow {
  id: string;
  name: string;
  city: string | null;
  /** "starter" | "pro" | "elite" — ausente quando a arena não assinou plano. */
  planTier: ArenaPlanTier | null;
  planStatus: string | null;
  courtsCount: number;
  ratingAverage: number;
  reviewsCount: number;
  onlinePaymentEnabled: boolean;
  managerUserId: string | null;
  /** Pré-cadastro do comercial: a arena ainda não tem conta na plataforma. */
  unclaimed: boolean;
}

const TIERS: readonly ArenaPlanTier[] = ['starter', 'pro', 'elite'];

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function planTier(value: unknown): ArenaPlanTier | null {
  const raw = str(value)?.toLowerCase();
  return raw && (TIERS as readonly string[]).includes(raw) ? (raw as ArenaPlanTier) : null;
}

function toRow(snap: QueryDocumentSnapshot<DocumentData>): ArenaRow {
  const data = snap.data();
  const city = str(data['city']);
  const state = str(data['state']);
  return {
    id: snap.id,
    name: str(data['name']) ?? `Arena ${snap.id}`,
    city: city && state ? `${city} · ${state}` : (city ?? state),
    planTier: planTier(data['planTier']),
    planStatus: str(data['planStatus']),
    courtsCount: num(data['courtsCount']),
    ratingAverage: num(data['ratingAverage']),
    reviewsCount: num(data['reviewsCount']),
    onlinePaymentEnabled: data['onlinePaymentEnabled'] === true,
    managerUserId: str(data['managerUserId']),
    unclaimed: data['unclaimed'] === true,
  };
}

function toCrm(snap: QueryDocumentSnapshot<DocumentData>): ArenaCrmEntry | null {
  const data = snap.data();
  if (!isCrmStatus(data['status'])) {
    return null;
  }
  const at = data['updatedAt'];
  return {
    status: data['status'],
    note: str(data['note']),
    updatedAtMs: at instanceof Timestamp ? at.toMillis() : null,
    updatedByName: str(data['updatedByName']),
  };
}

/**
 * Arenas da base — cadastradas e pré-cadastro. Leitura direta do Firestore (`arenas` é público
 * nas rules) e de uma vez só: são dezenas de docs, então a tela mostra o total real e filtra no
 * cliente, sem "Carregar mais". Ordenação por nome no cliente para não exigir índice.
 *
 * O status comercial vive em `arenaCrm/{arenaId}` (só a equipe da plataforma lê/grava), fora do
 * doc público da arena.
 */
@Injectable({ providedIn: 'root' })
export class ArenasRepository {
  async listAll(): Promise<ArenaRow[]> {
    const snap = await getDocs(collection(backofficeDb(), 'arenas'));
    return snap.docs.map(toRow).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async crmEntries(): Promise<Map<string, ArenaCrmEntry>> {
    const snap = await getDocs(collection(backofficeDb(), 'arenaCrm'));
    const out = new Map<string, ArenaCrmEntry>();
    for (const d of snap.docs) {
      const entry = toCrm(d);
      if (entry) out.set(d.id, entry);
    }
    return out;
  }

  async setCrmStatus(
    arenaId: string,
    status: ArenaCrmStatus,
    note: string | null,
    actor: { uid: string; name: string },
  ): Promise<void> {
    await setDoc(doc(backofficeDb(), 'arenaCrm', arenaId), {
      status,
      note: note?.trim() ? note.trim().slice(0, 500) : null,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedByName: actor.name.slice(0, 120),
    });
  }
}
