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

/**
 * O que a linha da lista mostra além do Auth: foto e apelido (para saber quem
 * é quem) e o nível do esporte principal do atleta.
 */
export interface AthleteRowSummary {
  sportCode: string | null;
  level: string | null;
  photoUrl: string | null;
  nickname: string | null;
}

/** Situação da conta na base — espelho de `functions/src/athlete-base-model.ts`. */
export type AthleteBaseStatus = 'active' | 'incomplete' | 'never_signed_in' | 'inactive' | 'disabled' | 'review_bot';

/**
 * Robô das lojas (revisão e pre-launch report da Google Play) — espelho de `isReviewBot` em
 * `functions/src/athlete-base-model.ts`. `nome.12345@gmail.com` só conta enquanto o cadastro
 * está incompleto; o domínio do Test Lab é sempre robô.
 */
export function isReviewBot(email: string | null | undefined, profileComplete: boolean): boolean {
  const value = (email ?? '').trim().toLowerCase();
  if (!value) return false;
  if (value.endsWith('@cloudtestlabaccounts.com')) return true;
  return !profileComplete && /^[a-z]+\.\d{5}@gmail\.com$/.test(value);
}

export interface AthleteBaseRow extends BackofficeUser {
  nickname: string | null;
  photoUrl: string | null;
  createdAtMs: number | null;
  lastSignInMs: number | null;
  lastSeenMs: number | null;
  profileComplete: boolean;
  isAthlete: boolean;
  inactive: { reason: string | null; markedAtMs: number | null; markedByName: string | null } | null;
  sportCode: string | null;
  level: string | null;
  status: AthleteBaseStatus;
}

export interface AthleteBaseSummary {
  accounts: number;
  athletes: number;
  /** Cadastro completo + já entrou + não marcado inativo. */
  active: number;
  incomplete: number;
  neverSignedIn: number;
  inactive: number;
  disabled: number;
  /** Robôs das lojas, fora de todos os outros números. Ausente em callable antigo. */
  reviewBots?: number;
  activeSeenLast30d: number;
  activeByMonth: { month: string; count: number }[];
}

export interface AthleteBase {
  generatedAtMs: number;
  summary: AthleteBaseSummary;
  rows: AthleteBaseRow[];
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

  /**
   * A base inteira numa chamada (Auth + `users` + marcas de inativa), já com a situação de cada
   * conta. Sem `includeRows` volta só o resumo — é o que o dashboard usa.
   */
  async athleteBase(includeRows: boolean): Promise<AthleteBase> {
    const callable = httpsCallable<{ includeRows: boolean }, AthleteBase>(
      backofficeFunctions(),
      'getBackofficeAthleteBase',
    );
    const result = await callable({ includeRows });
    return {
      generatedAtMs: result.data.generatedAtMs,
      summary: result.data.summary,
      rows: Array.isArray(result.data.rows) ? result.data.rows : [],
    };
  }

  /** Marca/desmarca a conta como inativa — não bloqueia login nem apaga dado. */
  async setInactive(
    uid: string,
    inactive: boolean,
    reason: string | null,
  ): Promise<{ inactive: boolean; reason: string | null; byName: string }> {
    const callable = httpsCallable<
      Record<string, unknown>,
      { inactive: boolean; reason: string | null; byName: string }
    >(backofficeFunctions(), 'setAthleteInactive');
    const result = await callable({ uid, inactive, ...(reason?.trim() ? { reason: reason.trim() } : {}) });
    return result.data;
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
