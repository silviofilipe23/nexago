import { Injectable } from '@angular/core';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
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

/** Nível declarado de um atleta em um esporte, como o backoffice exibe. */
export interface AthleteSportLevel {
  sportCode: string;
  /** Código gravado no perfil (pode ser legado); `null` quando não há entrada. */
  level: string | null;
  label: string | null;
  /** Esporte com escada de rating — só nesses o rating é realinhado. */
  rated: boolean;
}

export interface AthleteLevelHistoryEntry {
  id: string;
  sportCode: string | null;
  fromLevel: string | null;
  toLevel: string | null;
  reason: string | null;
  note: string | null;
  actorLabel: string | null;
  createdAtMs: number | null;
}

export interface AthleteLevelState {
  primarySportId: string | null;
  sports: AthleteSportLevel[];
  history: AthleteLevelHistoryEntry[];
}

export interface AthleteLevelChange {
  applied: boolean;
  sportCode: string;
  fromLevel: string | null;
  toLevel: string;
  direction: 'seed' | 'up' | 'down' | 'same';
  ratingRealigned: boolean;
  notified: boolean;
}

/** Resumo do nível para a coluna da lista (esporte principal do atleta). */
export interface AthleteLevelSummary {
  sportCode: string | null;
  level: string | null;
}

/** Limite do operador `in` do Firestore — a página da lista tem 25 linhas. */
const IN_QUERY_LIMIT = 30;

function levelsBySportOf(raw: unknown): Record<string, string> {
  const onboarding = raw as { levelsBySport?: unknown; primarySportId?: unknown } | undefined;
  const bySport = onboarding?.levelsBySport;
  const out: Record<string, string> = {};
  if (bySport && typeof bySport === 'object') {
    for (const [sport, level] of Object.entries(bySport as Record<string, unknown>)) {
      if (typeof level === 'string' && level.trim()) {
        out[sport] = level.trim();
      }
    }
  }
  return out;
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

  /**
   * Nível do esporte principal de cada linha, para a coluna da lista.
   *
   * Lê o espelho `public_profiles` (sem PII, legível por qualquer autenticado)
   * em vez de `users` — são poucas leituras por página e não depende do claim
   * `admin`. O espelho tem alguns segundos de atraso: depois de uma troca, a
   * linha é atualizada com a resposta do callable, não por releitura.
   */
  async levelSummaries(uids: readonly string[]): Promise<Map<string, AthleteLevelSummary>> {
    const out = new Map<string, AthleteLevelSummary>();
    for (let i = 0; i < uids.length; i += IN_QUERY_LIMIT) {
      const chunk = uids.slice(i, i + IN_QUERY_LIMIT);
      if (chunk.length === 0) {
        continue;
      }
      const snap = await getDocs(
        query(collection(backofficeDb(), 'public_profiles'), where(documentId(), 'in', [...chunk])),
      );
      for (const doc of snap.docs) {
        const onboarding = doc.get('sportOnboarding') as
          | { primarySportId?: unknown }
          | undefined;
        const bySport = levelsBySportOf(onboarding);
        const primary =
          typeof onboarding?.primarySportId === 'string' ? onboarding.primarySportId : '';
        // Sem esporte principal, o único esporte declarado ainda diz algo;
        // com vários, a coluna fica vazia e o diálogo mostra a lista completa.
        const sports = Object.keys(bySport);
        const sportCode = bySport[primary] ? primary : sports.length === 1 ? sports[0]! : null;
        out.set(doc.id, {
          sportCode,
          level: sportCode ? (bySport[sportCode] ?? null) : null,
        });
      }
    }
    return out;
  }

  /** Níveis declarados + histórico recente, do doc canônico (`users/{uid}`). */
  async levelState(uid: string): Promise<AthleteLevelState> {
    const callable = httpsCallable<{ uid: string }, AthleteLevelState>(
      backofficeFunctions(),
      'getAthleteLevelState',
    );
    const result = await callable({ uid });
    return {
      primarySportId: result.data?.primarySportId ?? null,
      sports: Array.isArray(result.data?.sports) ? result.data.sports : [],
      history: Array.isArray(result.data?.history) ? result.data.history : [],
    };
  }

  /**
   * Troca o nível declarado — inclusive para BAIXO, o que nenhum cliente
   * consegue fazer (as rules só deixam subir). O motivo é obrigatório e fica na
   * auditoria; o realinhamento do rating é decidido no servidor.
   */
  async setLevel(
    uid: string,
    sportCode: string,
    level: string,
    reason: string,
  ): Promise<AthleteLevelChange> {
    const callable = httpsCallable<Record<string, unknown>, AthleteLevelChange>(
      backofficeFunctions(),
      'setAthleteLevel',
    );
    const result = await callable({ uid, sportCode, level, reason });
    return result.data;
  }
}
