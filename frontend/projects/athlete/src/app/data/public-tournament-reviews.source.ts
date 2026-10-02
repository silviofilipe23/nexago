import { Injectable } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';
import { athleteFirestore } from './firestore';
import type { OrganizerNameLookup } from './organizer-name-lookup';
import type { OrganizerReputation, PublicReviewSummary } from './tournament-reviews';
import { watchOrganizerReputation, watchPublicReviewSummary } from './tournament-reviews-repository';

/** Leituras públicas da avaliação: resumo do torneio, reputação e nome do organizador. Existe só
 *  para o `TournamentLiveStore` ser testável sem Firestore de verdade (mesmo papel do
 *  `TournamentReviewSubmitter`). Erro de leitura vira `null` — a página segue sem o selo. */
@Injectable({ providedIn: 'root' })
export class PublicTournamentReviewsSource {
  watchSummary(tournamentId: string, onChange: (summary: PublicReviewSummary | null) => void): Unsubscribe {
    const db = athleteFirestore();
    if (!db) return () => undefined;
    return watchPublicReviewSummary(db, tournamentId, onChange, () => onChange(null));
  }

  watchReputation(organizerId: string, onChange: (reputation: OrganizerReputation | null) => void): Unsubscribe {
    const db = athleteFirestore();
    if (!db) return () => undefined;
    return watchOrganizerReputation(db, organizerId, onChange, () => onChange(null));
  }

  /** Sob demanda: a leitura do nome não precisa pesar na carga inicial do portal. */
  fetchOrganizerName(organizerId: string): Promise<OrganizerNameLookup | null> {
    const db = athleteFirestore();
    if (!db) return Promise.resolve(null);
    return import('./organizer-name-lookup').then((m) => m.lookupOrganizerName(db, organizerId)).catch(() => null);
  }
}
