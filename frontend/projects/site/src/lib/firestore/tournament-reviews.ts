import { doc, getDoc } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';
import {
  organizerNameFromData,
  organizerReputationFromData,
  publicSummaryFromData,
  type OrganizerReputation,
  type PublicReviewSummary,
} from '../tournament-reviews';

/** Docs públicos (`read: if true`). Uma leitura por visita — o lite não tem listener. Falha
 *  vira `null`: a página do torneio segue normal, só sem selo, seção ou linha do organizador. */

export async function getPublicReviewSummary(tournamentId: string): Promise<PublicReviewSummary | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'tournamentReviewSummaries', tournamentId));
    return snap.exists() ? publicSummaryFromData(snap.data()) : null;
  } catch (err) {
    console.error('[tournament-reviews] getPublicReviewSummary failed:', err);
    return null;
  }
}

export async function getOrganizerReputation(organizerId: string): Promise<OrganizerReputation | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'organizerReputation', organizerId));
    return snap.exists() ? organizerReputationFromData(snap.data()) : null;
  } catch (err) {
    console.error('[tournament-reviews] getOrganizerReputation failed:', err);
    return null;
  }
}

export async function getOrganizerName(organizerId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'public_profiles', organizerId));
    return snap.exists() ? organizerNameFromData(snap.data()) : null;
  } catch (err) {
    console.error('[tournament-reviews] getOrganizerName failed:', err);
    return null;
  }
}
