import { Injectable, inject } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';
import {
  recordPointTransaction,
  updateMatchFields,
  watchLiveMatch,
  watchPointEvents,
  type LiveMatch,
  type LivePointEvent,
  type ScoreSet,
} from '@nexago/live-scoring';
import { athleteFirestore, athleteLiveScoringContext, athleteProjectId } from '../data/firestore';
import { submitMatchResult, updateLiveMatchScore, validateMatchResult } from '../data/match-ops.service';
import { fetchMyStaffTournaments, staffRoleForTournament, type TournamentStaffRole } from '../data/tournament-staff-repository';
import { fetchTournament } from '../data/tournaments-repository';
import { AuthService } from '../auth/auth.service';
import { EMPTY_TEAM_NAMES, fetchTeamNamesFor, type MesaTeamNames } from './mesa-team-names';

/** Cabeçalho da mesa: de que torneio e categoria é esta partida. */
export interface MesaHeaderInfo {
  tournamentName: string | null;
  categoryName: string | null;
}

export const EMPTY_HEADER: MesaHeaderInfo = { tournamentName: null, categoryName: null };

/** Tudo que a mesa lê e escreve, num lugar só: o componente não fala com o Firestore nem com os
 *  callables direto. Serve pra duas coisas — manter a tela sem detalhe de infra e permitir um
 *  duplo em teste (assinar `onSnapshot` no construtor derruba o Karma, ver `SandRankCard`).
 *
 *  As escritas são as MESMAS do portal do organizador (motor `@nexago/live-scoring` + callables
 *  autorizados por `assertCanScoreTournament`). */
@Injectable({ providedIn: 'root' })
export class MesaLiveGateway {
  private readonly scoring = athleteLiveScoringContext();
  private readonly auth = inject(AuthService);

  /** `false` quando o Firebase não está configurado — a tela mostra estado vazio em vez de
   *  quebrar (mesma guarda das outras telas do portal). */
  get available(): boolean {
    return this.scoring != null;
  }

  watchMatch(matchId: string, onChange: (m: LiveMatch | null) => void, onError: () => void): Unsubscribe {
    const ctx = this.scoring;
    if (!ctx) {
      onError();
      return () => undefined;
    }
    return watchLiveMatch(ctx, matchId, onChange, onError);
  }

  watchEvents(matchId: string, onChange: (events: LivePointEvent[]) => void): Unsubscribe {
    const ctx = this.scoring;
    if (!ctx) return () => undefined;
    return watchPointEvents(ctx, matchId, onChange);
  }

  recordPoint(params: { matchId: string; matchUpdate: Record<string, unknown>; pointEvent: Record<string, unknown> }): Promise<void> {
    const ctx = this.scoring;
    if (!ctx) return Promise.reject(new Error('Firebase não configurado.'));
    return recordPointTransaction(ctx, params);
  }

  updateFields(matchId: string, fields: Record<string, unknown>): Promise<void> {
    const ctx = this.scoring;
    if (!ctx) return Promise.reject(new Error('Firebase não configurado.'));
    return updateMatchFields(ctx, matchId, fields);
  }

  /** START explícito da mesa: placar agregado zerado — o servidor marca In Progress,
   *  `matchStartedAt` e o torneio como ao vivo. */
  start(matchId: string): Promise<unknown> {
    return updateLiveMatchScore({ matchId, setsA: 0, setsB: 0, currentGamesA: 0, currentGamesB: 0 });
  }

  submitSets(matchId: string, sets: readonly ScoreSet[], bestOf: number): Promise<{ completed?: boolean }> {
    return submitMatchResult({ matchId, sets: sets.map((s) => ({ a: s.a, b: s.b })), bestOf });
  }

  validate(matchId: string): Promise<unknown> {
    return validateMatchResult(matchId);
  }

  async teamNames(teamIds: readonly string[]): Promise<MesaTeamNames> {
    const db = athleteFirestore();
    const projectId = athleteProjectId();
    if (!db || !projectId) return EMPTY_TEAM_NAMES;
    return fetchTeamNamesFor(db, projectId, teamIds);
  }

  /** Cargo do usuário NESTE torneio (`null` = dono, que não tem espelho de staff, ou ninguém).
   *  A tela usa pra não oferecer o que as rules negam — trocar o formato é do gestor/dono. */
  async myStaffRole(tournamentId: string): Promise<TournamentStaffRole | null> {
    const db = athleteFirestore();
    const uid = this.auth.user()?.uid;
    if (!db || !uid || !tournamentId) return null;
    try {
      return staffRoleForTournament(await fetchMyStaffTournaments(db, uid), tournamentId);
    } catch {
      return null;
    }
  }

  /** Nome do torneio e da categoria pro cabeçalho ("Masculino A · Semifinal" / "Etapa Rio ·
   *  Quadra 3"). Uma leitura por partida aberta; falha vira cabeçalho sem torneio, não erro. */
  async header(tournamentId: string, categoryId: string | null): Promise<MesaHeaderInfo> {
    const db = athleteFirestore();
    if (!db || !tournamentId) return EMPTY_HEADER;
    try {
      const t = await fetchTournament(db, tournamentId);
      if (!t) return EMPTY_HEADER;
      const category = categoryId ? (t.categories.find((c) => c.id === categoryId)?.categoryName ?? null) : null;
      return { tournamentName: t.name, categoryName: category };
    } catch {
      return EMPTY_HEADER;
    }
  }
}
