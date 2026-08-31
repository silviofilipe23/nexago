import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

const INVITES_COLLECTION = 'tournamentRegistrationInvites';

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

/** Pedido de cancelamento ao organizador — só existe em inscrição JÁ PAGA. A
 *  plataforma não estorna: aprovado, o organizador deleta a inscrição (o doc some)
 *  e a devolução do valor é combinada fora da plataforma. */
export interface RegistrationCancellationRequest {
  status: 'pending' | 'declined';
  reason: string;
  responseNote: string;
}

/** Uma troca de atleta já feita na inscrição (`substitutionHistory`), gravada
 *  pelo backend no aceite do convite de substituição. */
export interface RegistrationSubstitutionEntry {
  outName: string;
  inName: string;
  at: Date | null;
}

function substitutionHistoryFromDoc(v: unknown): RegistrationSubstitutionEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      outName: optionalStr(item['outName']) ?? 'Atleta',
      inName: optionalStr(item['inName']) ?? 'Atleta',
      at: toDate(item['at']),
    }));
}

export interface AthleteTournamentRegistration {
  id: string;
  tournamentId: string;
  categoryId: string;
  teamId: string | null;
  partnerPending: boolean;
  isPaid: boolean;
  waitlist: boolean;
  cancellationRequest: RegistrationCancellationRequest | null;
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
  /** Categoria de EQUIPE nomeada (trio+): nome dado pelo capitão. `null` = dupla. */
  teamName: string | null;
  /** Tamanho do elenco (3–5) em categoria de equipe; `null` = dupla clássica. */
  teamSize: number | null;
  /** Capitão da equipe (quem criou a inscrição e convida os demais). */
  captainUid: string | null;
  /** Uniforme por atleta nas categorias de equipe (`uniformByUid.{uid}`). */
  uniformByUid: Record<string, RegistrationUniformSlot>;
  /** Trocas de atleta já concluídas nesta inscrição, mais antiga primeiro. */
  substitutionHistory: RegistrationSubstitutionEntry[];
  /** Quando a vaga é liberada se ninguém pagar (prazo de garantia). `null` em inscrição sem
   *  prazo: anterior à regra, criada pelo organizador, em fila ou torneio com o prazo desligado. */
  holdExpiresAt: Date | null;
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

/** Doc antigo (sem o campo) ou status desconhecido contam como "sem pedido". */
function cancellationRequestFromDoc(v: unknown): RegistrationCancellationRequest | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const data = v as Record<string, unknown>;
  const status = data['status'];
  if (status !== 'pending' && status !== 'declined') return null;
  return {
    status,
    reason: typeof data['reason'] === 'string' ? data['reason'] : '',
    responseNote: typeof data['responseNote'] === 'string' ? data['responseNote'] : '',
  };
}

/** `uniformByUid` das categorias de equipe — cada entrada com o shape dos slots. */
function uniformByUidFromDoc(data: Record<string, unknown>): Record<string, RegistrationUniformSlot> {
  const raw = data['uniformByUid'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, RegistrationUniformSlot> = {};
  for (const [uid, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    out[uid] = {
      sizeTop: optionalStr(e['sizeTop']),
      sizeShorts: optionalStr(e['sizeShorts']),
      jerseyNumber: optionalNum(e['jerseyNumber']),
      jerseyName: optionalStr(e['jerseyName']),
    };
  }
  return out;
}

function registrationFromDoc(id: string, data: Record<string, unknown>): AthleteTournamentRegistration {
  const teamSizeRaw = optionalNum(data['teamSize']);
  return {
    id,
    tournamentId: typeof data['tournamentId'] === 'string' ? data['tournamentId'] : '',
    categoryId: typeof data['categoryId'] === 'string' ? data['categoryId'] : '',
    teamId: optionalStr(data['teamId']),
    partnerPending: data['partnerPending'] === true,
    isPaid: data['isPaid'] === true,
    waitlist: data['waitlist'] === true,
    cancellationRequest: cancellationRequestFromDoc(data['cancellationRequest']),
    sharePaidUids: stringList(data['sharePaidUids']),
    declaredPaidAt: toDate(data['declaredPaidAt']),
    paymentVerifiedByOrganizer: data['paymentVerifiedByOrganizer'] === true,
    player1Id: optionalStr(data['player1Id']),
    participantUids: stringList(data['participantUids']),
    lgpdAcceptedUids: stringList(data['lgpdAcceptedUids']),
    uniformPlayer1: uniformSlotFromDoc(data, 'Player1'),
    uniformPlayer2: uniformSlotFromDoc(data, 'Player2'),
    teamName: optionalStr(data['teamName']),
    teamSize: teamSizeRaw != null && teamSizeRaw >= 3 && teamSizeRaw <= 5 ? teamSizeRaw : null,
    captainUid: optionalStr(data['captainUid']),
    uniformByUid: uniformByUidFromDoc(data),
    substitutionHistory: substitutionHistoryFromDoc(data['substitutionHistory']),
    holdExpiresAt: toDate(data['holdExpiresAt']),
  };
}

function myRegistrationsQuery(db: Firestore, projectId: string, uid: string) {
  return query(
    collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'),
    where('participantUids', 'array-contains', uid),
  );
}

export async function fetchMyRegistrations(db: Firestore, projectId: string, uid: string): Promise<AthleteTournamentRegistration[]> {
  const snap = await getDocs(myRegistrationsQuery(db, projectId, uid));
  return snap.docs.map((d) => registrationFromDoc(d.id, d.data() as Record<string, unknown>));
}

/** Minhas inscrições AO VIVO. Diferente de {@link watchRegistration}, que observa um doc: quando
 *  o parceiro aceita o convite, a inscrição pode TROCAR de doc — `acceptTournamentPartnerInvite`
 *  preenche a reserva solo de um dos dois e **apaga** a do outro (`tx.delete(releaseRegRef)`), pra
 *  a dupla ocupar uma vaga só. Um listener de doc veria só "sumiu"; a query segue a inscrição
 *  que passou a me incluir em `participantUids`. */
export function watchMyRegistrations(
  db: Firestore,
  projectId: string,
  uid: string,
  onChange: (registrations: AthleteTournamentRegistration[]) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    myRegistrationsQuery(db, projectId, uid),
    (snap) => onChange(snap.docs.map((d) => registrationFromDoc(d.id, d.data() as Record<string, unknown>))),
    () => onError?.(),
  );
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
  /** Convite para EQUIPE nomeada (trio+) — traz o nome e o tamanho do elenco. */
  isTeamInvite: boolean;
  teamName: string | null;
  teamSize: number | null;
  /** Convite de SUBSTITUIÇÃO: o convidado entraria no lugar de `replacedName`. */
  isSubstitutionInvite: boolean;
  replacedName: string | null;
}

/** Par `(id, data)` que `getDocs` e `onSnapshot` entregam igual — o mapeamento e o corte de
 *  expirados vivem num lugar só, servindo os dois. */
export interface RawInviteDoc {
  id: string;
  data: Record<string, unknown>;
}

function rawDocsOf(snap: QuerySnapshot<DocumentData>): RawInviteDoc[] {
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

/** Convites recebidos, já filtrando os expirados (o Firestore não faz isso sozinho —
 *  `expiresAt` é só um campo, quem decide "expirado" é o client, mesma regra do Flutter). */
export function partnerInvitesFromDocs(docs: readonly RawInviteDoc[], now = Date.now()): TournamentPartnerInvite[] {
  return docs
    .map(({ id, data }) => {
      const teamSize = optionalNum(data['teamSize']);
      return {
        id,
        tournamentId: typeof data['tournamentId'] === 'string' ? data['tournamentId'] : '',
        categoryId: typeof data['categoryId'] === 'string' ? data['categoryId'] : '',
        inviterUid: typeof data['inviterUid'] === 'string' ? data['inviterUid'] : '',
        inviterName: optionalStr(data['inviterName']) ?? 'Atleta',
        createdAt: toDate(data['createdAt']),
        expiresAt: toDate(data['expiresAt']),
        isTeamInvite: data['isTeamInvite'] === true,
        teamName: optionalStr(data['teamName']),
        teamSize: teamSize != null && teamSize >= 3 && teamSize <= 5 ? teamSize : null,
        isSubstitutionInvite: data['isSubstitutionInvite'] === true,
        replacedName: optionalStr(data['replacedName']),
      };
    })
    .filter((invite) => invite.expiresAt == null || invite.expiresAt.getTime() > now);
}

/** Convites pendentes recebidos, AO VIVO. Quem cria o convite é o parceiro, do outro lado —
 *  numa busca única ele só apareceria no próximo carregamento da tela (era preciso recarregar
 *  pra descobrir que foi convidado). Espelha `watchPendingForInvitee` (Flutter). */
export function watchMyPendingPartnerInvites(
  db: Firestore,
  uid: string,
  onChange: (invites: TournamentPartnerInvite[]) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, INVITES_COLLECTION), where('inviteeUid', '==', uid), where('status', '==', 'pending')),
    (snap) => onChange(partnerInvitesFromDocs(rawDocsOf(snap))),
    () => onError?.(),
  );
}

export interface SentPartnerInvite {
  id: string;
  inviteeUid: string;
  inviteeName: string;
  expiresAt: Date | null;
}

export function sentInvitesFromDocs(docs: readonly RawInviteDoc[], now = Date.now()): SentPartnerInvite[] {
  return docs
    .map(({ id, data }) => ({
      id,
      inviteeUid: typeof data['inviteeUid'] === 'string' ? data['inviteeUid'] : '',
      inviteeName: optionalStr(data['inviteeName']) ?? 'Atleta',
      expiresAt: toDate(data['expiresAt']),
    }))
    .filter((invite) => invite.expiresAt == null || invite.expiresAt.getTime() > now);
}

/** Convites pendentes que EU enviei nesta categoria — pra mostrar "aguardando resposta"
 *  em vez de voltar pra busca vazia depois de convidar (ou ao recarregar a página). O
 *  atleta pode convidar mais de uma pessoa: o primeiro aceite marca os outros como stale
 *  (`markStaleInvitesAfterAccept` no backend), então listamos todos os pendentes. Ao vivo
 *  pelo mesmo motivo do lado recebido: a resposta do parceiro chega sem gesto meu. */
export function watchMySentPendingInvites(
  db: Firestore,
  uid: string,
  tournamentId: string,
  categoryId: string,
  onChange: (invites: SentPartnerInvite[]) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, INVITES_COLLECTION),
      where('inviterUid', '==', uid),
      where('tournamentId', '==', tournamentId),
      where('categoryId', '==', categoryId),
      where('status', '==', 'pending'),
    ),
    (snap) => onChange(sentInvitesFromDocs(rawDocsOf(snap))),
    () => onError?.(),
  );
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

/** Cria a EQUIPE nomeada + inscrição do capitão numa categoria de equipe
 *  (trio/quarteto/quinteto). O elenco fecha por convites
 *  (`sendPartnerInvite`/`acceptPartnerInvite`, mesmo callable da dupla — o
 *  backend ramifica pela categoria). */
export async function createTeamRegistration(
  functions: Functions,
  params: { tournamentId: string; categoryId: string; teamName: string; uniform?: UniformInput; lgpdAccepted?: boolean },
): Promise<{ registrationId: string; teamId: string }> {
  try {
    const result = await httpsCallable<Record<string, unknown>, { registrationId: string; teamId: string }>(
      functions,
      'createTournamentTeamRegistration',
    )({
      tournamentId: params.tournamentId,
      categoryId: params.categoryId,
      teamName: params.teamName,
      ...(params.uniform ? { uniform: params.uniform } : {}),
      ...(params.lgpdAccepted ? { lgpdAccepted: true } : {}),
    });
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Integrante (não capitão) sai da equipe enquanto a própria cota não foi paga.
 *  A vaga reabre e o capitão é avisado para convidar outro atleta. */
export async function leaveTeamRegistration(functions: Functions, registrationId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'leaveTournamentTeamRegistration')({ registrationId });
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Resultado do envio: além do id, o backend diz se o CONVIDADO já passa no gate
 *  de perfil de torneio (cadastro/WhatsApp/cidade). Pendência não bloqueia o
 *  envio — mas sem repassar isso o convidante espera um aceite impossível.
 *  Campos opcionais: backend antigo (sem eles) conta como pronto. */
export interface PartnerInviteSendResult {
  inviteId: string;
  inviteeProfileReady?: boolean;
  /** Rótulos PT do que falta (ex.: "WhatsApp", "cidade"). */
  inviteeMissingSteps?: string[];
}

export async function sendPartnerInvite(
  functions: Functions,
  params: { tournamentId: string; categoryId: string; inviteeUid: string; inviteeName: string; inviterName: string; inviterUniform?: UniformInput; lgpdAccepted?: boolean },
): Promise<PartnerInviteSendResult> {
  try {
    const result = await httpsCallable<typeof params, PartnerInviteSendResult>(functions, 'sendTournamentPartnerInvite')(params);
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Convite de substituição: `inviteeUid` entraria no lugar de `replacedUid` na
 *  inscrição. Permitido até a publicação das chaves da categoria. */
export async function sendSubstitutionInvite(
  functions: Functions,
  params: {
    registrationId: string;
    replacedUid: string;
    replacedName: string;
    inviteeUid: string;
    inviteeName: string;
    inviterName: string;
  },
): Promise<{ inviteId: string }> {
  try {
    const result = await httpsCallable<typeof params, { inviteId: string }>(
      functions,
      'sendTournamentSubstitutionInvite',
    )(params);
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

/** `amountType: 'full'` declara a inscrição inteira de uma vez — é o caminho do solo garantir a
 *  vaga pagando o valor integral (o parceiro que aceitar o convite depois entra sem taxa). */
export async function reserveDirectOrganizerRegistration(
  functions: Functions,
  registrationId: string,
  amountType: 'share' | 'full' = 'share',
): Promise<{ bothAthletesReserved: boolean }> {
  try {
    const result = await httpsCallable<Record<string, unknown>, { reserved: boolean; bothAthletesReserved: boolean }>(functions, 'reserveDirectOrganizerRegistration')({
      registrationId,
      ...(amountType === 'full' ? { amountType } : {}),
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

/** Pede ao organizador o cancelamento de uma inscrição JÁ PAGA. A plataforma não
 *  estorna nada: aprovado, o organizador libera a vaga e a devolução do valor é
 *  combinada entre os dois fora da plataforma. */
export async function requestRegistrationCancellation(
  functions: Functions,
  registrationId: string,
  reason: string,
): Promise<void> {
  try {
    await httpsCallable(functions, 'requestRegistrationCancellation')({ registrationId, reason });
  } catch (err) {
    throw mapCallableError(err);
  }
}

export interface OrganizerContact {
  name: string;
  whatsappPhone: string;
  email: string;
}

/** Contato do organizador do torneio (só para atleta inscrito) — é o canal do acerto
 *  do reembolso, que acontece fora da plataforma. */
export async function fetchTournamentOrganizerContact(functions: Functions, tournamentId: string): Promise<OrganizerContact> {
  try {
    const result = await httpsCallable<Record<string, unknown>, { contact: OrganizerContact }>(
      functions,
      'getTournamentOrganizerContact',
    )({ tournamentId });
    return result.data.contact;
  } catch (err) {
    throw mapCallableError(err);
  }
}
