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

export function confirmRegistrationPayment(registrationId: string): Promise<unknown> {
  return call('organizerConfirmRegistrationPayment', { registrationId: registrationId.trim() });
}

export function moveToWaitlist(registrationId: string): Promise<unknown> {
  return call('organizerMoveToWaitlist', { registrationId: registrationId.trim() });
}

export function removeFromCategory(registrationId: string): Promise<unknown> {
  return call('organizerRemoveFromCategory', { registrationId: registrationId.trim() });
}

export function resendRegistrationPayment(registrationId: string): Promise<unknown> {
  return call('resendRegistrationPayment', { registrationId: registrationId.trim() });
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

export interface AutoScheduleResult {
  ok?: boolean;
  applied?: boolean;
  slots?: Array<Record<string, unknown>>;
  skipped?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function autoScheduleTournamentDay(params: {
  tournamentId: string;
  dayKey: string;
  preview?: boolean;
  avoidAthleteConflict?: boolean;
  respectBracketDeps?: boolean;
  dayStart?: string;
}): Promise<AutoScheduleResult> {
  return call('autoScheduleTournamentDay', {
    tournamentId: params.tournamentId.trim(),
    dayKey: params.dayKey.trim(),
    preview: params.preview ?? true,
    avoidAthleteConflict: params.avoidAthleteConflict ?? true,
    respectBracketDeps: params.respectBracketDeps ?? true,
    ...(params.dayStart?.trim() ? { dayStart: params.dayStart.trim() } : {}),
  });
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
