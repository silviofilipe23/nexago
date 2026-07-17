import { collection, doc, getDocs, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

/** Inscrições do atleta em torneios (`artifacts/{projectId}/public/data/inscriptions`) e
 *  convites de parceiro pendentes (`tournamentRegistrationInvites`, top-level) — espelha
 *  `MyTournamentRegistrationsRepository` (Flutter). Escrita é 100% via Cloud Functions
 *  (`sendTournamentPartnerInvite`/`acceptTournamentPartnerInvite`/`cancelTournamentPartnerInvite`
 *  etc.) — não há escrita direta em nenhuma dessas coleções. */

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export interface AthleteTournamentRegistration {
  id: string;
  tournamentId: string;
  categoryId: string;
  teamId: string | null;
  partnerPending: boolean;
  isPaid: boolean;
  waitlist: boolean;
  /** Uids que já pagaram a própria parcela (pagamento em dupla dividido). */
  sharePaidUids: string[];
}

function registrationFromDoc(id: string, data: Record<string, unknown>): AthleteTournamentRegistration {
  return {
    id,
    tournamentId: typeof data['tournamentId'] === 'string' ? data['tournamentId'] : '',
    categoryId: typeof data['categoryId'] === 'string' ? data['categoryId'] : '',
    teamId: optionalStr(data['teamId']),
    partnerPending: data['partnerPending'] === true,
    isPaid: data['isPaid'] === true,
    waitlist: data['waitlist'] === true,
    sharePaidUids: Array.isArray(data['sharePaidUids']) ? data['sharePaidUids'].filter((u): u is string => typeof u === 'string') : [],
  };
}

export async function fetchMyRegistrations(db: Firestore, projectId: string, uid: string): Promise<AthleteTournamentRegistration[]> {
  const snap = await getDocs(
    query(collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'), where('participantUids', 'array-contains', uid)),
  );
  return snap.docs.map((d) => registrationFromDoc(d.id, d.data() as Record<string, unknown>));
}

/** Observa a inscrição ao vivo (`isPaid`/`sharePaidUids`) — espelha o listener do app na tela
 *  de PIX. Erros do listener são ignorados (o caller segue com o estado que já tinha). */
export function watchRegistration(db: Firestore, projectId: string, registrationId: string, cb: (registration: AthleteTournamentRegistration | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'artifacts', projectId, 'public', 'data', 'inscriptions', registrationId),
    (snap) => cb(snap.exists() ? registrationFromDoc(snap.id, snap.data() as Record<string, unknown>) : null),
    () => undefined,
  );
}

export interface TournamentPartnerInvite {
  id: string;
  tournamentId: string;
  categoryId: string;
  inviterUid: string;
  inviterName: string;
  createdAt: Date | null;
  expiresAt: Date | null;
}

/** Convites pendentes recebidos, já filtrando os expirados (o Firestore não faz isso sozinho —
 *  `expiresAt` é só um campo, quem decide "expirado" é o client, mesma regra do Flutter). */
export async function fetchMyPendingPartnerInvites(db: Firestore, uid: string): Promise<TournamentPartnerInvite[]> {
  const snap = await getDocs(
    query(collection(db, 'tournamentRegistrationInvites'), where('inviteeUid', '==', uid), where('status', '==', 'pending')),
  );
  const now = Date.now();
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        tournamentId: typeof data['tournamentId'] === 'string' ? data['tournamentId'] : '',
        categoryId: typeof data['categoryId'] === 'string' ? data['categoryId'] : '',
        inviterUid: typeof data['inviterUid'] === 'string' ? data['inviterUid'] : '',
        inviterName: optionalStr(data['inviterName']) ?? 'Atleta',
        createdAt: toDate(data['createdAt']),
        expiresAt: toDate(data['expiresAt']),
      };
    })
    .filter((invite) => invite.expiresAt == null || invite.expiresAt.getTime() > now);
}

export async function fetchMyRegistrationForCategory(db: Firestore, projectId: string, uid: string, tournamentId: string, categoryId: string): Promise<AthleteTournamentRegistration | null> {
  const all = await fetchMyRegistrations(db, projectId, uid);
  return all.find((r) => r.tournamentId === tournamentId && r.categoryId === categoryId) ?? null;
}

export interface UniformInput {
  sizeTop?: string;
  sizeShorts?: string;
  jerseyNumber?: number;
  jerseyName?: string;
}

export class TournamentRegistrationError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'TournamentRegistrationError';
  }

  /** Já existe convite pendente válido (`functions/already-exists` → HTTP 409). */
  get isPendingInviteConflict(): boolean {
    return this.code === 'already-exists';
  }
}

function stripFirebaseMessage(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return (
    raw
      .trim()
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(functions\/[^)]+\)\.?\s*$/i, '')
      .trim() || null
  );
}

/** Mesmo padrão de `arena-bookings-repository.mapCallableError` — extrai a mensagem PT
 *  do HttpsError (não o "Conflict" cru do HTTP 409). */
function mapCallableError(err: unknown): TournamentRegistrationError {
  const fb = err as { code?: string; message?: string };
  const code = (fb.code ?? '').replace(/^functions\//, '');
  const detail = stripFirebaseMessage(fb.message);
  switch (code) {
    case 'unauthenticated':
      return new TournamentRegistrationError('Faça login para continuar.', code);
    case 'permission-denied':
      return new TournamentRegistrationError(detail ?? 'Sem permissão para esta operação.', code);
    case 'not-found':
      return new TournamentRegistrationError(detail ?? 'Registro não encontrado.', code);
    case 'invalid-argument':
      return new TournamentRegistrationError(detail ?? 'Dados inválidos.', code);
    case 'failed-precondition':
      return new TournamentRegistrationError(detail ?? 'Não foi possível concluir a operação.', code);
    case 'already-exists':
      return new TournamentRegistrationError(
        detail ?? 'Já existe um convite pendente para este parceiro.',
        code,
      );
    case 'internal':
      return new TournamentRegistrationError(detail ?? 'Erro no servidor. Tente novamente.', code);
    default:
      return new TournamentRegistrationError(detail ?? 'Não foi possível concluir a operação.', code || null);
  }
}

/** Cria a inscrição sozinho (`partnerPending: true`, sem doc em `teams` ainda) — precisa
 *  convidar um parceiro depois (`sendPartnerInvite`) pra virar dupla de verdade. */
export async function registerSolo(functions: Functions, tournamentId: string, categoryId: string, uniform?: UniformInput): Promise<{ registrationId: string }> {
  try {
    const result = await httpsCallable<Record<string, unknown>, { registrationId: string }>(functions, 'registerSoloTournament')({
      tournamentId,
      categoryId,
      ...(uniform ? { uniform } : {}),
    });
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}

export async function sendPartnerInvite(
  functions: Functions,
  params: { tournamentId: string; categoryId: string; inviteeUid: string; inviteeName: string; inviterName: string; inviterUniform?: UniformInput },
): Promise<{ inviteId: string }> {
  try {
    const result = await httpsCallable<typeof params, { inviteId: string }>(functions, 'sendTournamentPartnerInvite')(params);
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}

export async function setRegistrationUniform(functions: Functions, registrationId: string, uniform: UniformInput): Promise<void> {
  try {
    await httpsCallable(functions, 'setRegistrationUniform')({ registrationId, uniform });
  } catch (err) {
    throw mapCallableError(err);
  }
}

export interface PixPaymentResult {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amountReais: number;
}

export async function createRegistrationPixPayment(functions: Functions, registrationId: string, amountType: 'share' | 'full', cpfCnpj: string): Promise<PixPaymentResult> {
  try {
    const result = await httpsCallable<Record<string, unknown>, PixPaymentResult>(functions, 'createTournamentRegistrationPixPayment')({
      registrationId,
      amountType,
      cpfCnpj,
    });
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}

export async function cancelPendingRegistrationPix(functions: Functions, registrationId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'cancelPendingTournamentRegistrationPix')({ registrationId });
  } catch (err) {
    throw mapCallableError(err);
  }
}

export async function confirmFreeRegistration(functions: Functions, registrationId: string): Promise<{ isPaid: boolean }> {
  try {
    const result = await httpsCallable<Record<string, unknown>, { isPaid: boolean; alreadyConfirmed: boolean }>(functions, 'confirmFreeTournamentRegistration')({
      registrationId,
    });
    return { isPaid: result.data.isPaid };
  } catch (err) {
    throw mapCallableError(err);
  }
}

export async function reserveDirectOrganizerRegistration(functions: Functions, registrationId: string): Promise<{ bothAthletesReserved: boolean }> {
  try {
    const result = await httpsCallable<Record<string, unknown>, { reserved: boolean; bothAthletesReserved: boolean }>(functions, 'reserveDirectOrganizerRegistration')({
      registrationId,
    });
    return { bothAthletesReserved: result.data.bothAthletesReserved };
  } catch (err) {
    throw mapCallableError(err);
  }
}

export async function acceptPartnerInvite(functions: Functions, inviteId: string, inviteeUniform?: UniformInput): Promise<void> {
  try {
    await httpsCallable(functions, 'acceptTournamentPartnerInvite')({ inviteId, ...(inviteeUniform ? { inviteeUniform } : {}) });
  } catch (err) {
    throw mapCallableError(err);
  }
}

export async function declinePartnerInvite(functions: Functions, inviteId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'cancelTournamentPartnerInvite')({ inviteId, asDecline: true });
  } catch (err) {
    throw mapCallableError(err);
  }
}
