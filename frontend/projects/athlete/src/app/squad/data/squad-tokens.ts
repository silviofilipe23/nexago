import { InjectionToken } from '@angular/core';
import { athleteFirestore } from '../../data/firestore';
import { fetchAllTournaments, type TournamentSummary } from '../../data/tournaments-repository';

/** Relógio das telas do Squad (os specs fixam a data). */
export const SQUAD_NOW = new InjectionToken<() => Date>('SQUAD_NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** Torneios da listagem pública para o card "Torneios pra divulgar". Sem Firebase, lista vazia. */
export const SQUAD_TOURNAMENTS = new InjectionToken<() => Promise<TournamentSummary[]>>('SQUAD_TOURNAMENTS', {
  providedIn: 'root',
  factory: () => async () => {
    const db = athleteFirestore();
    return db ? fetchAllTournaments(db) : [];
  },
});
