import { Injectable } from '@angular/core';
import {
  collection,
  endAt,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  startAt as startAtCursor,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { sportLabel as catalogSportLabel } from '@nexago/sports';
import { backofficeDb } from '../../data/firebase';

/** `encerradas`: inscrições fechadas (`closed`) e o evento ainda não começou — ver `statusFrom`. */
export type TournamentStatus = 'inscricoes' | 'encerradas' | 'andamento' | 'concluido' | 'cancelado';

export interface TournamentRow {
  id: string;
  name: string;
  sport: string | null;
  status: TournamentStatus;
  /** `linkOnly` não aparece na listagem pública do site. */
  visibility: string | null;
  startAt: Date | null;
  place: string | null;
  categoriesCount: number;
  capacity: number | null;
  managerId: string | null;
}

export interface TournamentPage {
  rows: TournamentRow[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

const PAGE_SIZE = 40;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return value instanceof Date ? value : null;
}

/** Mesma normalização do portal do organizador (`statusFromRaw`).
 *
 *  `closed` só diz que as inscrições fecharam — pode ser dias antes do evento, e continua assim
 *  quando o torneio é adiado. Só vira "Em andamento" a partir do dia do início; sem `startAt` fica
 *  como antes. Exportada para teste. */
export function statusFrom(raw: string, startAt: Date | null, now: Date = new Date()): TournamentStatus {
  const v = raw.toLowerCase().trim();
  if (v.includes('cancel')) {
    return 'cancelado';
  }
  if (v.includes('complet') || v.includes('conclu')) {
    return 'concluido';
  }
  if (v === 'closed') {
    return startAt && startOfDay(startAt) > startOfDay(now) ? 'encerradas' : 'andamento';
  }
  if (v.includes('andamento') || v.includes('progress') || v === 'live') {
    return 'andamento';
  }
  return 'inscricoes';
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Rótulo do esporte pelo catálogo (`@nexago/sports`); ausente → `null`. */
export function sportLabel(raw: string | null): string | null {
  return catalogSportLabel(raw);
}

function toRow(doc: QueryDocumentSnapshot<DocumentData>): TournamentRow {
  const data = doc.data();
  const startAt = toDate(data['startAt']);
  const categories = Array.isArray(data['categories']) ? data['categories'] : [];
  const capacityFromCategories = categories.reduce((sum: number, raw: unknown) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    return sum + (num(c['maxTeams']) ?? num(c['spotsTotal']) ?? 0);
  }, 0);

  return {
    id: doc.id,
    name: str(data['name']) ?? `Torneio ${doc.id}`,
    sport: sportLabel(str(data['sport'])),
    status: statusFrom(str(data['listingStatus']) ?? str(data['status']) ?? '', startAt),
    visibility: str(data['visibility']),
    startAt,
    place: str(data['city']) ?? str(data['location']),
    categoriesCount: categories.length,
    capacity: num(data['capacity']) ?? (capacityFromCategories > 0 ? capacityFromCategories : null),
    managerId: str(data['managerId']),
  };
}

/**
 * Torneios cadastrados. `tournaments` é público nas rules, então a leitura é
 * direta do Firestore.
 *
 * A listagem ordena por `startAt` desc — **torneios sem data de início não
 * entram**, porque o Firestore exclui docs sem o campo do orderBy. A busca por
 * nome usa outra ordenação e alcança esses casos.
 */
@Injectable({ providedIn: 'root' })
export class TournamentsRepository {
  async listTournaments(
    term: string,
    cursor: QueryDocumentSnapshot<DocumentData> | null,
  ): Promise<TournamentPage> {
    const tournaments = collection(backofficeDb(), 'tournaments');
    const trimmed = term.trim();

    // \uf8ff fecha o intervalo do prefixo (último caractere da faixa de uso privado).
    const constraints = trimmed
      ? [orderBy('name'), startAtCursor(trimmed), endAt(`${trimmed}\uf8ff`), limit(PAGE_SIZE)]
      : cursor
        ? [orderBy('startAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)]
        : [orderBy('startAt', 'desc'), limit(PAGE_SIZE)];

    const snap = await getDocs(query(tournaments, ...constraints));
    return {
      rows: snap.docs.map(toRow),
      cursor: snap.docs.length > 0 ? (snap.docs[snap.docs.length - 1] ?? null) : null,
      hasMore: !trimmed && snap.docs.length === PAGE_SIZE,
    };
  }
}
