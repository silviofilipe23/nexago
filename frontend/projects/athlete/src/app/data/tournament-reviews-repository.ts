import { collection, doc, getDoc, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  inviteFromData,
  myReviewFromData,
  organizerBrandNameFromData,
  organizerNameFromData,
  organizerReputationFromData,
  publicSummaryFromData,
  type MyTournamentReview,
  type OrganizerReputation,
  type PublicReviewSummary,
  type TournamentReviewAspects,
  type TournamentReviewInvite,
} from './tournament-reviews';

export function watchPendingTournamentReviewInvites(
  db: Firestore,
  uid: string,
  onChange: (invites: TournamentReviewInvite[]) => void,
  onError?: () => void,
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'tournamentReviewInvites'), where('status', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => inviteFromData(d.id, d.data())).filter((i): i is TournamentReviewInvite => i != null)),
    () => onError?.(),
  );
}

export function watchTournamentReviewInvite(
  db: Firestore,
  uid: string,
  tournamentId: string,
  onChange: (invite: TournamentReviewInvite | null) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid, 'tournamentReviewInvites', tournamentId),
    (snap) => onChange(snap.exists() ? inviteFromData(snap.id, snap.data()) : null),
    () => onError?.(),
  );
}

/** Só depois de o convite dizer `submitted`: a rule nega a leitura de doc inexistente. */
export async function fetchMyTournamentReview(db: Firestore, uid: string, tournamentId: string): Promise<MyTournamentReview | null> {
  const snap = await getDoc(doc(db, 'tournamentReviews', `${tournamentId}_${uid}`));
  return snap.exists() ? myReviewFromData(snap.data()) : null;
}

/** Só a `message` deste erro vai para a tela. */
export class TournamentReviewError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = 'TournamentReviewError';
  }
}

function stripFirebaseMessage(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().replace(/^Firebase:\s*/i, '').replace(/\s*\(functions\/[^)]+\)\.?\s*$/i, '').trim() || null;
}

export function tournamentReviewErrorMessage(err: unknown): string {
  if (err instanceof TournamentReviewError) return err.message;
  const fb = err as { code?: unknown; message?: unknown } | null;
  const code = typeof fb?.code === 'string' ? fb.code.replace(/^functions\//, '') : '';
  const detail = stripFirebaseMessage(typeof fb?.message === 'string' ? fb.message : null);
  switch (code) {
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo para avaliar.';
    // Callable ainda não deployada: o SDK devolve "not-found" cru, que não diz nada ao atleta.
    case 'not-found':
      return 'A avaliação ainda não está disponível. Tente de novo em instantes.';
    case 'permission-denied':
      return detail ?? 'Você não participou deste torneio.';
    case 'failed-precondition':
      return detail ?? 'A avaliação deste torneio foi encerrada.';
    case 'invalid-argument':
      return detail ?? 'Revise a nota e o comentário.';
    default:
      return 'O serviço não respondeu. Sua avaliação continua aqui.';
  }
}

export interface SubmitTournamentReviewInput {
  readonly tournamentId: string;
  readonly overall: number;
  readonly aspects: TournamentReviewAspects;
  readonly comment: string;
}

/** `created` só é `true` na 1ª avaliação — é quando o XP é pago. */
export async function submitTournamentReview(functions: Functions, input: SubmitTournamentReviewInput): Promise<{ created: boolean }> {
  const comment = input.comment.trim();
  try {
    const result = await httpsCallable<Record<string, unknown>, { ok?: boolean; created?: boolean }>(functions, 'submitTournamentReview')({
      tournamentId: input.tournamentId,
      overall: input.overall,
      aspects: input.aspects,
      comment: comment.length > 0 ? comment : null,
    });
    return { created: result.data?.created === true };
  } catch (err) {
    const code = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : null;
    throw new TournamentReviewError(tournamentReviewErrorMessage(err), code);
  }
}

/** Resumo público do torneio, ao vivo — `null` até o job abrir a janela de avaliação. */
export function watchPublicReviewSummary(
  db: Firestore,
  tournamentId: string,
  onChange: (summary: PublicReviewSummary | null) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournamentReviewSummaries', tournamentId),
    (snap) => onChange(snap.exists() ? publicSummaryFromData(snap.data()) : null),
    () => onError?.(),
  );
}

/** Reputação pública do organizador, ao vivo. */
export function watchOrganizerReputation(
  db: Firestore,
  organizerId: string,
  onChange: (reputation: OrganizerReputation | null) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'organizerReputation', organizerId),
    (snap) => onChange(snap.exists() ? organizerReputationFromData(snap.data()) : null),
    () => onError?.(),
  );
}

/** Nome do organizador: a marca (`organizerPublicProfiles`) e, sem ela, `public_profiles` — conta
 *  só de organizador não tem nome lá. Leituras públicas; falha vira `null`: sem linha. */
export async function fetchOrganizerName(db: Firestore, organizerId: string): Promise<string | null> {
  const brand = await getDoc(doc(db, 'organizerPublicProfiles', organizerId)).then(
    (snap) => organizerBrandNameFromData(snap.data()),
    () => null,
  );
  if (brand) return brand;
  try {
    const snap = await getDoc(doc(db, 'public_profiles', organizerId));
    return snap.exists() ? organizerNameFromData(snap.data()) : null;
  } catch {
    return null;
  }
}
