import { collection, documentId, getCountFromServer, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';
import { chunkIds, fetchTeamsByIds, teamNamesFrom } from './teams-repository';

/** `artifacts/{projectId}/public/data/inscriptions` (mesma coleção que o athlete lê em
 *  `tournament-registrations-repository.ts`) — o doc real só guarda `participantUids`/`teamId`
 *  (uids) e `isPaid`/`waitlist` (booleanos); não existe nome de dupla nem status de pagamento em
 *  texto no schema. O painel precisa dos dois em texto, então resolve nomes via `teams`
 *  (`teamName`) e `public_profiles` (`nickname`/`fullName`) — mesmo join que
 *  `tournament-brackets.component.ts` faz no athlete — e deriva `paymentStatus` a partir dos
 *  booleanos reais (`isPaid`/`waitlist`). */

/** Espelha `ORGANIZER_DIRECT_PAYMENT_METHOD` das Cloud Functions
 *  (`organizer-category-ops-payments.ts`): marca a baixa lançada pelo organizador. */
const ORGANIZER_DIRECT_PAYMENT_METHOD = 'organizer_direct';

export interface InscriptionParticipant {
  uid: string;
  name: string;
  photoUrl: string | null;
  /** `sportOnboarding.levelsBySport` do perfil — nível declarado por esporte. Quem consome
   *  resolve o esporte do torneio (`team-level-score.ts`); a repository não interpreta. */
  levelsBySport: Record<string, string>;
  /** `level`/`nivel` — nível global de docs antigos, fallback quando falta o do esporte. */
  legacyLevel: string | null;
}

/** Uniforme escolhido por UM dos atletas da inscrição, cru do doc (`sizeTopPlayer1`,
 *  `jerseyNumberPlayer2`, …) — o mesmo formato que o portal do atleta lê em
 *  `tournament-registrations-repository.ts`. */
export interface InscriptionUniformSlot {
  sizeTop: string | null;
  sizeShorts: string | null;
  jerseyNumber: number | null;
  jerseyName: string | null;
}

export const EMPTY_INSCRIPTION_UNIFORM: InscriptionUniformSlot = {
  sizeTop: null,
  sizeShorts: null,
  jerseyNumber: null,
  jerseyName: null,
};

export interface TournamentInscription {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  teamId: string | null; // id da dupla em `teams` — usado nos seeds da geração de chave
  teamName: string; // nome da dupla/equipe ou jogadores
  /** O nome que a equipe REALMENTE cadastrou (`teamName` do doc em `teams`); `null` quando o
   *  rótulo acima foi derivado dos nomes dos atletas. Quem precisa distinguir os dois casos
   *  (a exportação da lista) não consegue fazer isso olhando só para `teamName`. */
  customTeamName: string | null;
  /** Atletas da inscrição (1 solo / 2 dupla) — para avatares na lista. A ORDEM é o slot de
   *  uniforme: índice 0 = `…Player1`, índice 1 = `…Player2` (ver `resolveParticipantUids`). */
  participants: InscriptionParticipant[];
  participantNames: string[];
  paymentStatus: string; // raw (paid/toVerify/waitlist/pending)
  paid: boolean;
  /** Os atletas declararam ter pago direto no Pix do organizador e ninguém conferiu ainda.
   *  `isPaid` já é `true` nesse estado — a vaga vale —, mas nenhum webhook viu o dinheiro. */
  needsVerification: boolean;
  /** A baixa do pagamento foi lançada pelo organizador (`paymentMethod: organizer_direct`),
   *  e não recebida pela plataforma. É a única que ele pode reverter: dinheiro que entrou
   *  pelo Pix do app existe numa conta e sai por estorno, não por edição de doc. */
  paidByOrganizer: boolean;
  /** Quantos atletas da inscrição já quitaram a própria parte (`sharePaidUids`) — em pagamento
   *  pelo app é dinheiro recebido; no modo direto é declaração do atleta. Serve pra explicar
   *  por que a inscrição está parada em "Pendente". */
  sharePaidCount: number;
  /** Uids da inscrição que já quitaram a própria parte, restrito a quem está em `participants`. */
  sharePaidUids: string[];
  /** Uids cuja parte foi confirmada MANUALMENTE pelo organizador (em vez de declarada pelo
   *  próprio atleta) — só essa confirmação pode ser desfeita por atleta. */
  organizerConfirmedShareUids: string[];
  partnerPending: boolean; // inscrição solo aguardando parceiro — não entra na chave
  /** Uids que aceitaram o termo de uso de imagem/LGPD na inscrição (docs antigos: vazio). */
  lgpdAcceptedUids: string[];
  /** Uniforme de cada slot; casa com `participants[0]`/`participants[1]`. */
  uniformPlayer1: InscriptionUniformSlot;
  uniformPlayer2: InscriptionUniformSlot;
  /** Categoria de equipe (trio+): uniforme por atleta, chaveado pelo uid. */
  uniformByUid: Record<string, InscriptionUniformSlot>;
  /** Tamanho do elenco da categoria de equipe (3–5); `null` = dupla clássica. */
  teamSize: number | null;
  /** Capitão da equipe nomeada (quem criou e convida); `null` fora de equipe. */
  captainUid: string | null;
  /** Pedido de cancelamento aberto pelo atleta (inscrição paga), quando houver. */
  cancellationRequest: InscriptionCancellationRequest | null;
  createdAt: Date | null;
}

/** Pedido de cancelamento — só o atleta abre, e só em inscrição JÁ PAGA. Aprovado,
 *  a inscrição é deletada; por isso só existem estes dois estados. A plataforma não
 *  estorna: a devolução é combinada fora dela. */
export interface InscriptionCancellationRequest {
  status: 'pending' | 'declined';
  reason: string;
  responseNote: string;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

interface RawInscription {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  teamId: string | null;
  participantUids: string[];
  /** Só existe em inscrição criada por `registerSoloTournament`; aceitar convite sem solo prévio
   *  cria o doc sem ele — daí `participantUids[0]` ser o fallback pra saber o slot. */
  player1Id: string | null;
  isPaid: boolean;
  waitlist: boolean;
  partnerPending: boolean;
  sharePaidUids: string[];
  /** Uids cuja parte foi confirmada manualmente pelo organizador — subconjunto de `sharePaidUids`. */
  organizerConfirmedShareUids: string[];
  /** Gravado por `reserveDirectOrganizerRegistration` quando a dupla fecha a declaração. */
  declaredPaidAt: Date | null;
  /** Gravado por `organizerConfirmRegistrationPayment` — a baixa manual do organizador. */
  paymentVerifiedByOrganizer: boolean;
  /** `organizer_direct` = baixa manual; ausente = pagamento recebido pela plataforma. */
  paymentMethod: string | null;
  lgpdAcceptedUids: string[];
  uniformPlayer1: InscriptionUniformSlot;
  uniformPlayer2: InscriptionUniformSlot;
  uniformByUid: Record<string, InscriptionUniformSlot>;
  teamSize: number | null;
  captainUid: string | null;
  cancellationRequest: InscriptionCancellationRequest | null;
  createdAt: Date | null;
}

/** Doc antigo (sem o campo) ou status desconhecido contam como "sem pedido". */
function cancellationRequestFromDoc(v: unknown): InscriptionCancellationRequest | null {
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

interface ProfileDisplay {
  /** `null` = perfil sem nenhum nome preenchido. O fallback ('Atleta') é de quem exibe: o
   *  rótulo da dupla precisa distinguir "sem nome" pra não virar "Atleta / Atleta". */
  name: string | null;
  photoUrl: string | null;
  levelsBySport: Record<string, string>;
  legacyLevel: string | null;
}

/** `sportOnboarding.levelsBySport` — só as entradas string, ignorando lixo de docs antigos. */
function levelsBySportOf(data: Record<string, unknown>): Record<string, string> {
  const onboarding = data['sportOnboarding'] as Record<string, unknown> | undefined;
  const raw = onboarding?.['levelsBySport'];
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [sportCode, value] of Object.entries(raw as Record<string, unknown>)) {
    const level = optionalStr(value);
    if (level) out[sportCode] = level;
  }
  return out;
}

function optionalNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function uniformSlotFromDoc(data: Record<string, unknown>, slot: 'Player1' | 'Player2'): InscriptionUniformSlot {
  return {
    sizeTop: optionalStr(data[`sizeTop${slot}`]),
    sizeShorts: optionalStr(data[`sizeShorts${slot}`]),
    jerseyNumber: optionalNum(data[`jerseyNumber${slot}`]),
    jerseyName: optionalStr(data[`jerseyName${slot}`]),
  };
}

/** `uniformByUid` das categorias de equipe — cada entrada com o mesmo shape dos slots. */
function uniformByUidFromDoc(data: Record<string, unknown>): Record<string, InscriptionUniformSlot> {
  const raw = data['uniformByUid'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, InscriptionUniformSlot> = {};
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

/** `teamSize` 3–5 = categoria de equipe; qualquer outra coisa é dupla (`null`). */
function teamSizeFromDoc(data: Record<string, unknown>): number | null {
  const raw = data['teamSize'];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 3 && n <= 5 ? n : null;
}

function rawFromDoc(id: string, data: Record<string, unknown>): RawInscription {
  return {
    id,
    tournamentId: optionalStr(data['tournamentId']) ?? '',
    categoryId: optionalStr(data['categoryId']),
    teamId: optionalStr(data['teamId']),
    participantUids: Array.isArray(data['participantUids'])
      ? data['participantUids'].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [],
    player1Id: optionalStr(data['player1Id']),
    isPaid: data['isPaid'] === true,
    waitlist: data['waitlist'] === true,
    partnerPending: data['partnerPending'] === true,
    sharePaidUids: Array.isArray(data['sharePaidUids'])
      ? data['sharePaidUids'].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [],
    organizerConfirmedShareUids: Array.isArray(data['organizerConfirmedShareUids'])
      ? data['organizerConfirmedShareUids'].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [],
    declaredPaidAt: toDate(data['declaredPaidAt']),
    paymentVerifiedByOrganizer: data['paymentVerifiedByOrganizer'] === true,
    paymentMethod: optionalStr(data['paymentMethod'])?.toLowerCase() ?? null,
    lgpdAcceptedUids: Array.isArray(data['lgpdAcceptedUids'])
      ? data['lgpdAcceptedUids'].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [],
    uniformPlayer1: uniformSlotFromDoc(data, 'Player1'),
    uniformPlayer2: uniformSlotFromDoc(data, 'Player2'),
    uniformByUid: uniformByUidFromDoc(data),
    teamSize: teamSizeFromDoc(data),
    captainUid: optionalStr(data['captainUid']),
    cancellationRequest: cancellationRequestFromDoc(data['cancellationRequest']),
    createdAt: toDate(data['createdAt']),
  };
}

async function fetchDisplayProfiles(db: Firestore, uids: readonly string[]): Promise<Map<string, ProfileDisplay>> {
  const result = new Map<string, ProfileDisplay>();
  const chunks = chunkIds(uids);
  if (chunks.length === 0) return result;
  const snaps = await Promise.all(
    chunks.map((chunk) => getDocs(query(collection(db, 'public_profiles'), where(documentId(), 'in', chunk)))),
  );
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const photoUrl =
        optionalStr(data['profilePhotoUrl']) ??
        optionalStr(data['avatarUrl']) ??
        optionalStr(data['photoURL']) ??
        optionalStr(data['photoUrl']);
      result.set(d.id, {
        name: optionalStr(data['nickname']) ?? optionalStr(data['fullName']) ?? optionalStr(data['name']),
        photoUrl,
        levelsBySport: levelsBySportOf(data),
        legacyLevel: optionalStr(data['level']) ?? optionalStr(data['nivel']),
      });
    }
  }
  return result;
}

/** Só quem tem nome — mesmo contrato que `teamNamesFrom` espera (uid ausente = sem nome). */
function profileNamesFrom(profiles: ReadonlyMap<string, ProfileDisplay>): Map<string, string> {
  const names = new Map<string, string>();
  for (const [uid, profile] of profiles) if (profile.name) names.set(uid, profile.name);
  return names;
}

/** Uids da inscrição NA ORDEM DOS SLOTS de uniforme: quem está no slot 1 é `player1Id` quando o
 *  doc o tem, senão `participantUids[0]` — mesma regra que o portal do atleta usa pra achar o
 *  próprio uniforme (`registration-progress.ts`). Sem `participantUids` (docs antigos), cai na
 *  dupla em `teams`, onde `player1Id` já é o slot 1. */
function resolveParticipantUids(
  raw: RawInscription,
  teamPlayers: { player1Id: string; player2Id: string } | null,
): string[] {
  if (raw.participantUids.length > 0) {
    const uids = [...new Set(raw.participantUids)];
    const p1 = raw.player1Id;
    if (p1 && uids.includes(p1)) return [p1, ...uids.filter((uid) => uid !== p1)];
    return uids;
  }
  if (!teamPlayers) return [];
  return [teamPlayers.player1Id, teamPlayers.player2Id].filter((id) => id.length > 0);
}

/** Só o total de inscrições do torneio — agregação server-side, sem baixar os docs nem fazer
 *  os joins de nome que o `listInscriptions` faz. Usado onde a tela só mostra o número
 *  (ex.: lista de etapas da liga). */
export async function countInscriptions(tournamentId: string): Promise<number> {
  const db = organizerFirestore();
  const projectId = environment.firebase.projectId;
  if (!projectId) return 0;

  const snap = await getCountFromServer(
    query(collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'), where('tournamentId', '==', tournamentId)),
  );
  return snap.data().count;
}

export async function listInscriptions(tournamentId: string): Promise<TournamentInscription[]> {
  const db = organizerFirestore();
  const projectId = environment.firebase.projectId;
  if (!projectId) return [];

  const snap = await getDocs(
    query(collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'), where('tournamentId', '==', tournamentId)),
  );
  const rows = snap.docs.map((d) => rawFromDoc(d.id, d.data() as Record<string, unknown>));

  const teamIds = rows.map((r) => r.teamId).filter((id): id is string => id != null);
  const teams = await fetchTeamsByIds(db, projectId, teamIds);

  const allUids = new Set<string>();
  for (const r of rows) {
    for (const uid of resolveParticipantUids(r, r.teamId ? teams.get(r.teamId) ?? null : null)) {
      allUids.add(uid);
    }
  }
  // Os jogadores do time entram na MESMA busca de perfis: o rótulo da dupla sai desses mesmos
  // nomes, e pedi-los à parte custava uma segunda varredura inteira de `public_profiles`.
  for (const team of teams.values()) {
    if (team.player1Id) allUids.add(team.player1Id);
    if (team.player2Id) allUids.add(team.player2Id);
  }
  const profiles = await fetchDisplayProfiles(db, [...allUids]);
  const teamNames = teamNamesFrom(teams, profileNamesFrom(profiles));

  return rows.map((r) => {
    const team = r.teamId ? teams.get(r.teamId) ?? null : null;
    const uids = resolveParticipantUids(r, team);
    const participants: InscriptionParticipant[] = uids.map((uid) => {
      const profile = profiles.get(uid);
      return {
        uid,
        name: profile?.name ?? 'Atleta',
        photoUrl: profile?.photoUrl ?? null,
        levelsBySport: profile?.levelsBySport ?? {},
        legacyLevel: profile?.legacyLevel ?? null,
      };
    });
    const participantNames = participants.map((p) => p.name);
    const teamName =
      (r.teamId ? teamNames.get(r.teamId) : null) ??
      (participantNames.length > 0 ? participantNames.join(' / ') : 'Inscrição');
    // `declaredPaidAt` (e não `paymentChannel === 'directOrganizer'`) é a âncora de propósito:
    // inscrições diretas anteriores a este fluxo não entram retroativamente numa fila de
    // conferência que ninguém vai fazer. `toVerify` ocupa exatamente o lugar de `paid` —
    // a precedência sobre `waitlist` continua a mesma de antes.
    const needsVerification = r.declaredPaidAt != null && !r.paymentVerifiedByOrganizer;
    const paymentStatus = needsVerification ? 'toVerify' : r.isPaid ? 'paid' : r.waitlist ? 'waitlist' : 'pending';
    return {
      id: r.id,
      tournamentId: r.tournamentId,
      categoryId: r.categoryId,
      teamId: r.teamId,
      teamName,
      customTeamName: team?.teamName ?? null,
      participants,
      participantNames,
      paymentStatus,
      paid: r.isPaid,
      paidByOrganizer: r.paymentMethod === ORGANIZER_DIRECT_PAYMENT_METHOD,
      needsVerification,
      sharePaidCount: r.sharePaidUids.filter((uid) => uids.includes(uid)).length,
      sharePaidUids: r.sharePaidUids.filter((uid) => uids.includes(uid)),
      organizerConfirmedShareUids: r.organizerConfirmedShareUids.filter((uid) => uids.includes(uid)),
      partnerPending: r.partnerPending,
      lgpdAcceptedUids: r.lgpdAcceptedUids,
      uniformPlayer1: r.uniformPlayer1,
      uniformPlayer2: r.uniformPlayer2,
      uniformByUid: r.uniformByUid,
      teamSize: r.teamSize,
      captainUid: r.captainUid,
      cancellationRequest: r.cancellationRequest,
      createdAt: r.createdAt,
    };
  });
}
