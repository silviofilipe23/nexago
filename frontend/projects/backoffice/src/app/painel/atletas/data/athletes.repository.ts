import { Injectable } from '@angular/core';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../data/firebase';
import type { BackofficeUser } from '../../organizadores/data/organizers.repository';

export interface UserPage {
  rows: BackofficeUser[];
  nextPageToken: string | null;
}

interface ListResponse {
  users?: unknown;
  nextPageToken?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toUser(raw: unknown): BackofficeUser | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const uid = str(row['uid']);
  if (!uid) {
    return null;
  }
  return {
    uid,
    email: str(row['email']),
    displayName: str(row['displayName']),
    fullName: str(row['fullName']),
    roles: Array.isArray(row['roles'])
      ? (row['roles'] as unknown[]).filter((r): r is string => typeof r === 'string')
      : [],
    disabled: row['disabled'] === true,
    emailVerified: row['emailVerified'] === true,
  };
}

/**
 * Contas de atleta no backoffice.
 *
 * O status PRO vive em `athlete_profiles/{uid}.isPro` (escrito por `setAthletePro`,
 * que também grava o claim `athletePro`) — por isso a lista do Auth é cruzada com
 * uma leitura do Firestore.
 */
@Injectable({ providedIn: 'root' })
export class AthletesRepository {
  /** Página de contas: com `term` faz busca, sem `term` percorre o Auth em ordem. */
  async listUsers(term: string, pageToken: string | null, maxResults = 25): Promise<UserPage> {
    const callable = httpsCallable<Record<string, unknown>, ListResponse>(
      backofficeFunctions(),
      'listBackofficeUsers',
    );
    const result = await callable({
      maxResults,
      ...(term.trim() ? { search: term.trim() } : {}),
      ...(pageToken ? { pageToken } : {}),
    });
    const raw = result.data?.users;
    return {
      rows: Array.isArray(raw) ? raw.map(toUser).filter((u): u is BackofficeUser => u != null) : [],
      nextPageToken: str(result.data?.nextPageToken),
    };
  }

  /** UIDs com PRO ativo — uma leitura só, usada para marcar as linhas. */
  async proUids(): Promise<Set<string>> {
    const snap = await getDocs(
      query(collection(backofficeDb(), 'athlete_profiles'), where('isPro', '==', true)),
    );
    return new Set(snap.docs.map((doc) => doc.id));
  }

  /**
   * Liga/desliga o PRO. `expiresAt` em segundos (epoch); sem data, o PRO fica
   * sem prazo e o backend registra a ativação.
   */
  async setPro(uid: string, isPro: boolean, expiresAt?: number): Promise<void> {
    const callable = httpsCallable<Record<string, unknown>, unknown>(
      backofficeFunctions(),
      'setAthletePro',
    );
    await callable({ uid, isPro, ...(isPro && expiresAt ? { expiresAt } : {}) });
  }
}
