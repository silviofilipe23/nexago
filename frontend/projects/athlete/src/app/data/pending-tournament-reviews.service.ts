import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { athleteFirestore } from './firestore';
import { watchPendingTournamentReviewInvites } from './tournament-reviews-repository';
import { openPendingReviews, type TournamentReviewInvite } from './tournament-reviews';

/** Convites de avaliação pendentes do atleta, ao vivo — o card do painel some sozinho quando o
 *  servidor vira o convite para `submitted`. */
@Injectable({ providedIn: 'root' })
export class PendingTournamentReviewsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = athleteFirestore();
  private readonly invites = signal<readonly TournamentReviewInvite[]>([]);

  readonly pending = computed(() => openPendingReviews(this.invites(), new Date()));

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const db = this.firestore;
      if (!uid || !db) {
        this.invites.set([]);
        return;
      }
      onCleanup(
        watchPendingTournamentReviewInvites(
          db,
          uid,
          (items) => this.invites.set(items),
          () => this.invites.set([]),
        ),
      );
    });
  }
}
