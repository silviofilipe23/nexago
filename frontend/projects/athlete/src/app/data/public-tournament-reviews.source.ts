import { Injectable } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';
import { athleteFirestore } from './firestore';
import type { OrganizerReputation, PublicReviewSummary } from './tournament-reviews';
import { fetchOrganizerName, watchOrganizerReputation, watchPublicReviewSummary } from './tournament-reviews-repository';

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

  fetchOrganizerName(organizerId: string): Promise<string | null> {
    const db = athleteFirestore();
    return db ? fetchOrganizerName(db, organizerId) : Promise.resolve(null);
  }
}
