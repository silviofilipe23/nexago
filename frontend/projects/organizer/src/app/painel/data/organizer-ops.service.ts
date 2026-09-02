import { httpsCallable } from 'firebase/functions';
import { organizerFunctions } from './functions';

/** Write-paths do organizador — mesmos Cloud Functions onCall que o app Flutter chama
 *  (`organizer_category_ops_service.dart`, `organizer_match_schedule_service.dart`,
 *  `organizer_tournament_ops_repository.dart`). Toda operação de escrita crítica passa pelo
 *  servidor (validação autoritativa + ACL via `assertCanManageTournament`); o painel nunca
 *  escreve partidas/inscrições direto no Firestore. */

function call<T = Record<string, unknown>>(name: string, payload: Record<string, unknown>): Promise<T> {
  const callable = httpsCallable(organizerFunctions(), name);
  return callable(payload).then((r) => (r.data ?? {}) as T);
}

// ── Chave / categoria (organizer-category-ops.ts) ─────────────────────────────

export interface GenerateBracketParams {
  tournamentId: string;
  categoryId: string;
  format: 'groups_knockout' | 'single_elimination' | 'double_elimination';
  seeds?: string[];
  groupsPreview?: Array<{ id: string; teamIds: string[] }>;
  bracketConfig?: Record<string, unknown>;
  force?: boolean;
}

export function generateCategoryBracket(params: GenerateBracketParams): Promise<{ matchCount: number; format: string }> {
  const { tournamentId, categoryId, format, seeds, groupsPreview, bracketConfig, force } = params;
  return call('generateCategoryBracket', {
    tournamentId: tournamentId.trim(),
    categoryId: categoryId.trim(),
    format,
    ...(seeds ? { seeds } : {}),
    ...(groupsPreview ? { groupsPreview } : {}),
    ...(bracketConfig ? { bracketConfig } : {}),
    ...(force ? { force: true } : {}),
  });
}

/** `athleteUid` confirma só a parte deste atleta da dupla/equipe — `outcome: 'partial'` quando
 *  o restante ainda falta; sem `outcome`, o time fechou e a inscrição inteira ficou paga. Sem
 *  `athleteUid`, comportamento de sempre: confirma a inscrição inteira de uma vez. */
export function confirmRegistrationPayment(
  registrationId: string,
  athleteUid?: string,
): Promise<{ ok?: boolean; outcome?: 'partial' }> {
  return call('organizerConfirmRegistrationPayment', {
    registrationId: registrationId.trim(),
    ...(athleteUid ? { athleteUid: athleteUid.trim() } : {}),
  });
}

/** Desfaz a baixa manual de pagamento (o organizador confirmou na dupla errada, ou o atleta
 *  errado). O servidor recusa pagamento recebido pela plataforma e devolve ao estado anterior
 *  — `outcome` diz qual: pendente, a conferir, fila ou o pagamento que já constava. Com
 *  `athleteUid`, desfaz só a confirmação manual daquele atleta (estado parcial, sem afetar o
 *  resto da dupla/equipe); sem ele, reverte a inscrição inteira como sempre. */
export function revertRegistrationPayment(
  registrationId: string,
  athleteUid?: string,
): Promise<{ ok?: boolean; outcome?: 'pending' | 'toVerify' | 'waitlist' | 'paid' }> {
  return call('organizerRevertRegistrationPayment', {
    registrationId: registrationId.trim(),
    ...(athleteUid ? { athleteUid: athleteUid.trim() } : {}),
  });
}

export function moveToWaitlist(registrationId: string): Promise<unknown> {
  return call('organizerMoveToWaitlist', { registrationId: registrationId.trim() });
}

export interface TeamRegistrationUniform {
  sizeTop?: string;
  sizeShorts?: string;
  jerseyNumber?: number;
  jerseyName?: string;
}

export interface CreateTeamRegistrationResult {
  registrationId: string;
  teamId: string;
  /** A dupla fechou sobre uma reserva que um dos atletas já tinha, em vez de nascer do zero. */
  merged: boolean;
  waitlist: boolean;
}

/** Inscreve uma dupla que não conseguiu se inscrever sozinha (prazo estourado, convite nunca
 *  aceito, pagamento travado). O servidor decide se cria a dupla ou aproveita uma reserva
 *  existente — e continua barrando nível, idade e dupla repetida na categoria. */
export function createTeamRegistration(params: {
  tournamentId: string;
  categoryId: string;
  athleteUids: readonly string[];
  markAsPaid: boolean;
  /** Uniforme por uid — obrigatório quando a categoria exige; o servidor valida os tamanhos. */
  uniforms?: Record<string, TeamRegistrationUniform>;
  /** Nome da equipe (trio+). Omitido na dupla. */
  teamName?: string | null;
}): Promise<CreateTeamRegistrationResult> {
  const teamName = params.teamName?.trim() ?? '';
  return call<CreateTeamRegistrationResult>('organizerCreateTeamRegistration', {
    tournamentId: params.tournamentId.trim(),
    categoryId: params.categoryId.trim(),
    athleteUids: params.athleteUids.map((uid) => uid.trim()).filter((uid) => uid.length > 0),
    markAsPaid: params.markAsPaid,
    uniforms: params.uniforms ?? {},
    ...(teamName ? { teamName } : {}),
  });
}

/** `description` é obrigatória: a inscrição é deletada, então esse texto é a única
 *  explicação que o atleta recebe por perder a vaga. */
export function removeFromCategory(registrationId: string, description: string): Promise<unknown> {
  return call('organizerRemoveFromCategory', {
    registrationId: registrationId.trim(),
    description: description.trim(),
  });
}

export function resendRegistrationPayment(registrationId: string): Promise<unknown> {
  return call('resendRegistrationPayment', { registrationId: registrationId.trim() });
}

/** Promove o nível de um atleta do torneio (Task 8 do plano de calibração) — mesma callable
 *  `setAthleteLevel` do backoffice, aqui autorizada pelo caminho ORGANIZER (Task 3):
 *  `tournamentId` prova que o caller é dono do torneio, `sportCode` tem que ser o esporte
 *  DESSE torneio (o servidor rejeita divergência) e o atleta precisa ter inscrição ativa nele.
 *  O servidor também garante a direção (só sobe) — a UI só evita oferecer o que já sabe que
 *  vai falhar. */
export function promoteAthleteLevel(params: { uid: string; sportCode: string; level: string; tournamentId: string }): Promise<unknown> {
  return call('setAthleteLevel', {
    uid: params.uid.trim(),
    sportCode: params.sportCode.trim(),
    level: params.level.trim(),
    tournamentId: params.tournamentId.trim(),
  });
}

/** Responde ao pedido de cancelamento do atleta. Aprovar remove a inscrição e libera
 *  a vaga; a plataforma NÃO estorna — a devolução é combinada fora dela. */
export function respondCancellationRequest(
  registrationId: string,
  approve: boolean,
  note = '',
): Promise<unknown> {
  return call('respondRegistrationCancellationRequest', {
    registrationId: registrationId.trim(),
    approve,
    note: note.trim(),
  });
}

export function sendCategoryCommunication(params: {
  tournamentId: string;
  categoryId: string;
  message: string;
  audience: string;
  sendPush?: boolean;
}): Promise<{
  pushCount?: number;
  pushNoChannel?: number;
  pushFailed?: number;
  whatsappLinks?: Array<{ teamId: string; links: string[] }>;
}> {
  return call('sendCategoryCommunication', {
    tournamentId: params.tournamentId.trim(),
    categoryId: params.categoryId.trim(),
    message: params.message.trim(),
    audience: params.audience.trim(),
    sendPush: params.sendPush ?? true,
  });
}

// ── Partidas: placar e agendamento (organizer-match-ops.ts) ───────────────────

export interface MatchSetInput {
  a: number;
  b: number;
}

export function submitMatchResult(params: { matchId: string; sets: MatchSetInput[]; bestOf?: number }): Promise<{ ok?: boolean; completed?: boolean; winnerId?: string }> {
  return call('submitMatchResult', {
    matchId: params.matchId.trim(),
    sets: params.sets,
    ...(params.bestOf != null ? { bestOf: params.bestOf } : {}),
  });
}

export function validateMatchResult(matchId: string): Promise<unknown> {
  return call('validateMatchResult', { matchId: matchId.trim() });
}

/** Placar agregado de transmissão (`liveScore`) — só a CF pode gravá-lo (fora das allowlists
 *  das rules). Com tudo zerado é o START explícito da mesa: o servidor seta `In Progress` +
 *  `matchStartedAt` e recalcula `tournaments.liveMatchesNow`, então a partida aparece "ao
 *  vivo" pros atletas antes do primeiro ponto. */
export function updateLiveMatchScore(params: { matchId: string; setsA: number; setsB: number; currentGamesA: number; currentGamesB: number }): Promise<{ ok?: boolean }> {
  return call('updateLiveMatchScore', {
    matchId: params.matchId.trim(),
    setsA: params.setsA,
    setsB: params.setsB,
    currentGamesA: params.currentGamesA,
    currentGamesB: params.currentGamesB,
  });
}

/** Operação inversa do START da mesa: devolve a partida para `Scheduled`, limpa o placar
 *  ao vivo (incluindo o histórico ponto a ponto) e tira do contador `liveMatchesNow`. O
 *  agendamento e o check-in ficam intactos — é "tirar do ao vivo", não desagendar. O servidor
 *  recusa partida já encerrada, porque a chave e o ranking já avançaram. */
export function revertMatchToScheduled(matchId: string): Promise<{ ok?: boolean }> {
  return call('revertMatchToScheduled', { matchId: matchId.trim() });
}

export function declareMatchWalkover(params: { matchId: string; winnerTeamId: string; loserStatus?: string }): Promise<unknown> {
  return call('declareMatchWalkover', {
    matchId: params.matchId.trim(),
    winnerTeamId: params.winnerTeamId.trim(),
    loserStatus: params.loserStatus ?? 'wo',
  });
}

export interface ScheduleWarning {
  type: string;
  message: string;
}

export function scheduleMatch(params: { matchId: string; courtId: string; scheduleTime: Date; scheduleEndTime: Date; dayKey?: string }): Promise<{ ok?: boolean; warnings?: ScheduleWarning[] }> {
  return call('scheduleMatch', {
    matchId: params.matchId.trim(),
    courtId: params.courtId.trim(),
    scheduleTime: params.scheduleTime.toISOString(),
    scheduleEndTime: params.scheduleEndTime.toISOString(),
    dayKey: params.dayKey?.trim() || dayKeyFromDate(params.scheduleTime),
  });
}

export function unscheduleMatch(matchId: string): Promise<unknown> {
  return call('unscheduleMatch', { matchId: matchId.trim() });
}

/** Liga/desliga `matchOps.dynamicRescheduleEnabled` do torneio — mesma callable que o app
 *  organizador chama (`organizer_match_schedule_service.dart`). Config persistida, não um
 *  parâmetro de uma execução do auto-agendamento. */
export function updateMatchOpsSettings(params: {
  tournamentId: string;
  dynamicRescheduleEnabled: boolean;
}): Promise<{ ok?: boolean; dynamicRescheduleEnabled?: boolean }> {
  return call('updateMatchOpsSettings', {
    tournamentId: params.tournamentId.trim(),
    dynamicRescheduleEnabled: params.dynamicRescheduleEnabled,
  });
}

export interface AutoScheduleSlot {
  matchId: string;
  courtId: string;
  /** ISO 8601 em UTC. */
  start: string;
  end: string;
}

export interface AutoScheduleSkip {
  matchId: string;
  reason: string;
}

export interface AutoScheduleResult {
  ok?: boolean;
  preview?: boolean;
  /** Slots calculados (preview e apply calculam a mesma grade). */
  slots?: AutoScheduleSlot[];
  /** Rejeitados na gravação por quadra ocupada ou descanso insuficiente. */
  skipped?: AutoScheduleSkip[];
  count?: number;
  /** Quantos foram realmente gravados — 0 em preview. */
  applied?: number;
  [key: string]: unknown;
}

export interface AutoScheduleParams {
  tournamentId: string;
  dayKey: string;
  preview?: boolean;
  avoidAthleteConflict?: boolean;
  respectBracketDeps?: boolean;
  dayStart?: string;
  courtIds?: readonly string[];
  categoryId?: string | null;
}

/** Payload da callable, isolado da chamada pra ser testável — é o contrato com
 *  `autoScheduleTournamentDay` em functions/src/organizer-match-ops.ts.
 *  `courtIds` vazio = todas as quadras; `categoryId` vazio = torneio inteiro
 *  (ambos omitidos, que é o que o app Flutter manda hoje). */
export function autoSchedulePayload(params: AutoScheduleParams): Record<string, unknown> {
  const courtIds = (params.courtIds ?? []).map((id) => id.trim()).filter(Boolean);
  const categoryId = params.categoryId?.trim() ?? '';
  return {
    tournamentId: params.tournamentId.trim(),
    dayKey: params.dayKey.trim(),
    preview: params.preview ?? true,
    avoidAthleteConflict: params.avoidAthleteConflict ?? true,
    respectBracketDeps: params.respectBracketDeps ?? true,
    ...(params.dayStart?.trim() ? { dayStart: params.dayStart.trim() } : {}),
    ...(courtIds.length > 0 ? { courtIds } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
}

export function autoScheduleTournamentDay(params: AutoScheduleParams): Promise<AutoScheduleResult> {
  return call('autoScheduleTournamentDay', autoSchedulePayload(params));
}

// ── Torneio (organizer-category-ops.ts / escrita direta permitida ao manager) ─

export function closeTournamentRegistrations(tournamentId: string): Promise<unknown> {
  return call('closeTournamentRegistrations', { tournamentId: tournamentId.trim() });
}

export function cancelTournament(tournamentId: string, opts?: { force?: boolean }): Promise<unknown> {
  return call('cancelTournament', {
    tournamentId: tournamentId.trim(),
    ...(opts?.force ? { force: true } : {}),
  });
}

/** Fuso canônico dos eventos (America/Sao_Paulo) — espelha `dayKeyFromEventDate`
 *  (`functions/src/event-timezone.ts`): YYYY-MM-DD na parede SP. */
export function dayKeyFromDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
