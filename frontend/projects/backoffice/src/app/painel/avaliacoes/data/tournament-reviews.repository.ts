import { Injectable } from '@angular/core';
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { backofficeDb } from '../../data/firebase';
import {
  adminReviewFromData,
  chunkIds,
  profileNameFromData,
  summaryFromData,
  type AdminReview,
  type ReviewSummary,
} from './tournament-reviews';

/** Leituras da tela de Avaliações. Uma leitura por abertura (o backoffice não usa listener).
 *  `tournamentReviews` só é liberado a `admin`/`superAdmin` pela rule — não o guard do cliente. */
@Injectable({ providedIn: 'root' })
export class TournamentReviewsAdminRepository {
  /** Todos os resumos. Conjunto pequeno: ordena no cliente, sem índice. */
  async listSummaries(): Promise<ReviewSummary[]> {
    const snap = await getDocs(collection(backofficeDb(), 'tournamentReviewSummaries'));
    return snap.docs.flatMap((d) => {
      const summary = summaryFromData(d.id, d.data());
      return summary ? [summary] : [];
    });
  }

  async getSummary(tournamentId: string): Promise<ReviewSummary | null> {
    const snap = await getDoc(doc(backofficeDb(), 'tournamentReviewSummaries', tournamentId));
    return snap.exists() ? summaryFromData(snap.id, snap.data()) : null;
  }

  /** Igualdade num campo só: índice automático. */
  async listReviews(tournamentId: string): Promise<AdminReview[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'tournamentReviews'), where('tournamentId', '==', tournamentId)));
    return snap.docs.flatMap((d) => {
      const review = adminReviewFromData(d.id, d.data());
      return review ? [review] : [];
    });
  }

  /** Nomes em `public_profiles`, em lotes paralelos (memória firestore-chunked-in-serial-latency).
   *  Quem não tem nome fica fora do mapa: quem chama usa `fallbackName`. */
  async profileNames(uids: readonly string[]): Promise<Map<string, string>> {
    const db = backofficeDb();
    const snaps = await Promise.all(
      chunkIds(uids).map((chunk) => getDocs(query(collection(db, 'public_profiles'), where(documentId(), 'in', chunk)))),
    );
    const names = new Map<string, string>();
    for (const snap of snaps) {
      for (const d of snap.docs) {
        const name = profileNameFromData(d.data());
        if (name) names.set(d.id, name);
      }
    }
    return names;
  }
}
