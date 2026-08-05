import { Injectable } from '@angular/core';
import {
  collection,
  endAt,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  startAt,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { backofficeDb } from '../../data/firebase';

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
}

export interface ArenaPage {
  rows: ArenaRow[];
  /** Último doc da página, usado como cursor do "carregar mais". */
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

const PAGE_SIZE = 40;
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

function toRow(doc: QueryDocumentSnapshot<DocumentData>): ArenaRow {
  const data = doc.data();
  const city = str(data['city']);
  const state = str(data['state']);
  return {
    id: doc.id,
    name: str(data['name']) ?? `Arena ${doc.id}`,
    city: city && state ? `${city} · ${state}` : (city ?? state),
    planTier: planTier(data['planTier']),
    planStatus: str(data['planStatus']),
    courtsCount: num(data['courtsCount']),
    ratingAverage: num(data['ratingAverage']),
    reviewsCount: num(data['reviewsCount']),
    onlinePaymentEnabled: data['onlinePaymentEnabled'] === true,
    managerUserId: str(data['managerUserId']),
  };
}

/**
 * Arenas cadastradas. Leitura direta do Firestore — `arenas` é público nas
 * rules e o doc não tem campo de aprovação/suspensão, então a tela só mostra o
 * que existe de fato (plano, quadras, avaliação, pagamento online).
 */
@Injectable({ providedIn: 'root' })
export class ArenasRepository {
  /**
   * Página ordenada por nome. Com `term`, faz busca por **prefixo do nome**
   * (é o que dá para fazer sem índice novo — não há campo de keywords em arenas).
   */
  async listArenas(term: string, cursor: QueryDocumentSnapshot<DocumentData> | null): Promise<ArenaPage> {
    const arenas = collection(backofficeDb(), 'arenas');
    const trimmed = term.trim();

    // \uf8ff é o último caractere da faixa de uso privado: fecha o intervalo do prefixo.
    const constraints = trimmed
      ? [orderBy('name'), startAt(trimmed), endAt(`${trimmed}\uf8ff`), limit(PAGE_SIZE)]
      : cursor
        ? [orderBy('name'), startAfter(cursor), limit(PAGE_SIZE)]
        : [orderBy('name'), limit(PAGE_SIZE)];

    const snap = await getDocs(query(arenas, ...constraints));
    return {
      rows: snap.docs.map(toRow),
      cursor: snap.docs.length > 0 ? (snap.docs[snap.docs.length - 1] ?? null) : null,
      hasMore: !trimmed && snap.docs.length === PAGE_SIZE,
    };
  }
}
