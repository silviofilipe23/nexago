import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { organizerFirestore } from './firestore';
import {
  anonymousReviewFromData,
  reputationFromData,
  summaryFromData,
  type AnonymousReview,
  type OrganizerReputation,
  type TournamentReviewSummary,
} from './tournament-reviews';

/** Resumo ao vivo — `null` até o job abrir a janela do torneio. */
export function watchTournamentReviewSummary(
  tournamentId: string,
  onChange: (summary: TournamentReviewSummary | null) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(organizerFirestore(), 'tournamentReviewSummaries', tournamentId),
    (snap) => onChange(snap.exists() ? summaryFromData(snap.id, snap.data()) : null),
    () => onError(),
  );
}

/** Só com `count >= 3` no resumo: abaixo disso a rule nega a leitura. A ordem (`shuffleKey`)
 *  é aplicada em `commentCards`, sem `orderBy` — nada de índice. */
export function watchAnonymousReviews(
  tournamentId: string,
  onChange: (reviews: AnonymousReview[]) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    collection(organizerFirestore(), 'tournaments', tournamentId, 'anonymousReviews'),
    (snap) =>
      onChange(
        snap.docs.flatMap((d) => {
          const review = anonymousReviewFromData(d.id, d.data());
          return review ? [review] : [];
        }),
      ),
    () => onError(),
  );
}

export function watchOrganizerReputation(
  uid: string,
  onChange: (reputation: OrganizerReputation | null) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(organizerFirestore(), 'organizerReputation', uid),
    (snap) => onChange(snap.exists() ? reputationFromData(snap.data()) : null),
    () => onError(),
  );
}

/** Os resumos dos torneios em que `uid` é o dono. Igualdade num campo só: sem índice composto. */
export function watchOrganizerReviewSummaries(
  uid: string,
  onChange: (summaries: TournamentReviewSummary[]) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(organizerFirestore(), 'tournamentReviewSummaries'), where('organizerId', '==', uid)),
    (snap) =>
      onChange(
        snap.docs.flatMap((d) => {
          const summary = summaryFromData(d.id, d.data());
          return summary ? [summary] : [];
        }),
      ),
    () => onError(),
  );
}
