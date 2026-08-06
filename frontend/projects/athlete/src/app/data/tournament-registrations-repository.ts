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

/** Uniforme de um dos dois atletas, cru do doc (`sizeTopPlayer1`, `sizeTopPlayer2`, …). */
export interface RegistrationUniformSlot {
  sizeTop: string | null;
  sizeShorts: string | null;
  jerseyNumber: number | null;
  jerseyName: string | null;
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
  /** Momento em que a dupla fechou a declaração de pagamento direto com o organizador
   *  (`reserveDirectOrganizerRegistration`). Ausente em inscrição paga pelo app e nas diretas
   *  anteriores a esse fluxo — que por isso não aparecem como "aguardando conferência". */
  declaredPaidAt: Date | null;
  /** O organizador deu baixa no recebimento (`organizerConfirmRegistrationPayment`). */
  paymentVerifiedByOrganizer: boolean;
  /** Só existe em inscrição criada por `registerSoloTournament`; o caminho "aceitar convite sem
   *  solo prévio" cria o doc sem ele — daí `participantUids` ser o fallback pra saber o slot. */
  player1Id: string | null;
  /** Ordem é significativa: índice 0 = player1, índice 1 = player2. */
  participantUids: string[];
  /** Uids que aceitaram o termo de uso de imagem/LGPD (docs antigos: vazio). */
  lgpdAcceptedUids: string[];
  uniformPlayer1: RegistrationUniformSlot;
  uniformPlayer2: RegistrationUniformSlot;
}

export const EMPTY_UNIFORM_SLOT: RegistrationUniformSlot = {
  sizeTop: null,
  sizeShorts: null,
  jerseyNumber: null,
  jerseyName: null,
};

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string') : [];
}

function optionalNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function uniformSlotFromDoc(data: Record<string, unknown>, slot: 'Player1' | 'Player2'): RegistrationUniformSlot {
  return {
    sizeTop: optionalStr(data[`sizeTop${slot}`]),
    sizeShorts: optionalStr(data[`sizeShorts${slot}`]),
    jerseyNumber: optionalNum(data[`jerseyNumber${slot}`]),
    jerseyName: optionalStr(data[`jerseyName${slot}`]),
  };
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
    sharePaidUids: stringList(data['sharePaidUids']),
    declaredPaidAt: toDate(data['declaredPaidAt']),
    paymentVerifiedByOrganizer: data['paymentVerifiedByOrganizer'] === true,
    player1Id: optionalStr(data['player1Id']),
    participantUids: stringList(data['participantUids']),
    lgpdAcceptedUids: stringList(data['lgpdAcceptedUids']),
    uniformPlayer1: uniformSlotFromDoc(data, 'Player1'),
    uniformPlayer2: uniformSlotFromDoc(data, 'Player2'),
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

export interface SentPartnerInvite {
  id: string;
  inviteeUid: string;
  inviteeName: string;
  expiresAt: Date | null;
}

/** Convites pendentes que EU enviei nesta categoria — pra mostrar "aguardando resposta"
 *  em vez de voltar pra busca vazia depois de convidar (ou ao recarregar a página). O
 *  atleta pode convidar mais de uma pessoa: o primeiro aceite marca os outros como stale
 *  (`markStaleInvitesAfterAccept` no backend), então listamos todos os pendentes. */
export async function fetchMySentPendingInvites(
  db: Firestore,
  uid: string,
  tournamentId: string,
  categoryId: string,
): Promise<SentPartnerInvite[]> {
  const snap = await getDocs(
    query(
      collection(db, 'tournamentRegistrationInvites'),
      where('inviterUid', '==', uid),
      where('tournamentId', '==', tournamentId),
      where('categoryId', '==', categoryId),
      where('status', '==', 'pending'),
    ),
  );
  const now = Date.now();
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        inviteeUid: typeof data['inviteeUid'] === 'string' ? data['inviteeUid'] : '',
        inviteeName: optionalStr(data['inviteeName']) ?? 'Atleta',
        expiresAt: toDate(data['expiresAt']),
      };
    })
    .filter((invite) => invite.expiresAt == null || invite.expiresAt.getTime() > now);
}

/** Cancela um convite que EU enviei (o backend também aceita o convidado recusar via
 *  `declinePartnerInvite` — aqui é o lado do convidador desistindo). */
export async function cancelSentPartnerInvite(functions: Functions, inviteId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'cancelTournamentPartnerInvite')({ inviteId });
  } catch (err) {
    throw mapCallableError(err);
  }
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
 *  convidar um parceiro depois (`sendPartnerInvite`) pra virar dupla de verdade.
 *  `lgpdAccepted` registra o aceite do termo de uso de imagem/LGPD na inscrição
 *  (a UI só habilita o CTA com o checkbox marcado). */
export async function registerSolo(
  functions: Functions,
  tournamentId: string,
  categoryId: string,
  uniform?: UniformInput,
  opts?: { lgpdAccepted?: boolean },
): Promise<{ registrationId: string }> {
  try {
    const result = await httpsCallable<Record<string, unknown>, { registrationId: string }>(functions, 'registerSoloTournament')({
      tournamentId,
      categoryId,
      ...(uniform ? { uniform } : {}),
      ...(opts?.lgpdAccepted ? { lgpdAccepted: true } : {}),
    });
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}

export async function sendPartnerInvite(
  functions: Functions,
  params: { tournamentId: string; categoryId: string; inviteeUid: string; inviteeName: string; inviterName: string; inviterUniform?: UniformInput; lgpdAccepted?: boolean },
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

export async function acceptPartnerInvite(
  functions: Functions,
  inviteId: string,
  inviteeUniform?: UniformInput,
  opts?: { lgpdAccepted?: boolean },
): Promise<void> {
  try {
    await httpsCallable(functions, 'acceptTournamentPartnerInvite')({
      inviteId,
      ...(inviteeUniform ? { inviteeUniform } : {}),
      ...(opts?.lgpdAccepted ? { lgpdAccepted: true } : {}),
    });
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

/** Inscrição cancelável pelo próprio atleta: nenhum pagamento registrado (nem a dupla
 *  confirmada, nem parcela de um dos dois) — espelha o guard da callable. */
export function registrationCancellable(r: Pick<AthleteTournamentRegistration, 'isPaid' | 'sharePaidUids'>): boolean {
  return !r.isPaid && r.sharePaidUids.length === 0;
}

/** Cancela a inscrição do próprio atleta — só sem NENHUM pagamento (o backend bloqueia
 *  paga/meio-paga com `failed-precondition`, cancela PIX aberto no Asaas e derruba
 *  convites/equipe junto). */
export async function cancelMyRegistration(functions: Functions, registrationId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'cancelTournamentRegistration')({ registrationId });
  } catch (err) {
    throw mapCallableError(err);
  }
}
