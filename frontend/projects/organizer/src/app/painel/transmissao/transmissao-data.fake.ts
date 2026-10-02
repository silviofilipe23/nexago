import { signal } from '@angular/core';
import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl, type BroadcastInterview } from '../data/broadcast-control';
import type { BroadcastControlPatch } from '../data/broadcast-control-repository';
import { EMPTY_INTERVIEW_QUEUE, type InterviewQueue } from '../data/interview-queue';
import type { TournamentMatch } from '../data/matches-repository';
import type { RankingParticipant } from '../data/ranking-positions';
import type { OrganizerTournament } from '../data/tournament.model';
import type { AthleteDetails } from './interview-card';
import type { TransmissaoDataService } from './transmissao-data.service';
import type { TeamRoster } from './transmissao-selectors';

/** Dublê da `TransmissaoDataService` para os specs da tela Transmissão.
 *
 *  `implements Pick<…>` amarra o formato ao serviço REAL: campo renomeado ou com tipo novo lá
 *  quebra a compilação aqui, em vez de os specs seguirem verdes descrevendo um serviço que não
 *  existe mais (o furo do `teamLabels` no gateway do overlay). */

export function torneio(formats: string[]): OrganizerTournament {
  return {
    id: 't1',
    name: 'Copa VH',
    categories: formats.map((f, i) => ({ id: `cat${i + 1}`, name: i === 0 ? 'Feminina B' : `C${i}`, bracketFormat: f })),
    courts: [
      { id: 'q1', name: 'Quadra 1', order: 1 },
      { id: 'q2', name: 'Quadra 2', order: 2 },
    ],
    sponsors: [{ id: 's1', name: 'Loja Areia', logoUrl: '' }],
  } as unknown as OrganizerTournament;
}

export const PARTIDA = {
  id: 'm1',
  tournamentId: 't1',
  categoryId: 'cat1',
  courtId: 'q1',
  status: 'in_progress',
  matchType: 'knockout',
  teamAId: 'ta',
  teamBId: 'tb',
  team1Label: 'Ana / Bia',
  team2Label: 'Carla / Dani',
  matchStartedAt: new Date(),
  scheduledAt: null,
  sets: [],
} as unknown as TournamentMatch;

export const ROSTERS = new Map<string, TeamRoster>([
  ['ta', { teamName: null, members: [{ uid: 'u1', name: 'Ana Souza', photoUrl: null }, { uid: 'u2', name: 'Bia Lima', photoUrl: null }] }],
  ['tb', { teamName: null, members: [{ uid: 'u3', name: 'Carla Dias', photoUrl: null }, { uid: 'u4', name: 'Dani Ávila', photoUrl: null }] }],
]);

type FakedMembers =
  | 'tournamentId'
  | 'tournament'
  | 'matches'
  | 'control'
  | 'queue'
  | 'rosters'
  | 'details'
  | 'athleteRanking'
  | 'teamRanking'
  | 'saveError'
  | 'save'
  | 'saveQueue'
  | 'saveAir'
  | 'ensureRanking';

export class FakeTransmissaoData implements Pick<TransmissaoDataService, FakedMembers> {
  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(torneio(['single_elimination']));
  readonly matches = signal<TournamentMatch[]>([PARTIDA]);
  readonly control = signal<BroadcastControl>({ ...DEFAULT_BROADCAST_CONTROL, courtId: 'q1' });
  readonly queue = signal<InterviewQueue>(EMPTY_INTERVIEW_QUEUE);
  readonly rosters = signal<ReadonlyMap<string, TeamRoster>>(ROSTERS);
  readonly details = signal<ReadonlyMap<string, AthleteDetails>>(
    new Map([['u1', { city: 'Goiânia', state: 'GO', levelsBySport: {}, legacyLevel: null }]]),
  );
  readonly athleteRanking = signal<readonly RankingParticipant[]>([]);
  readonly teamRanking = signal<readonly RankingParticipant[]>([]);
  readonly saveError = signal(false);

  readonly saved: BroadcastControlPatch[] = [];
  readonly savedQueues: InterviewQueue[] = [];
  readonly aired: { interview: BroadcastInterview | null; queue: InterviewQueue | null }[] = [];
  rankingRequests = 0;

  save(patch: BroadcastControlPatch): Promise<void> {
    this.saved.push(patch);
    return Promise.resolve();
  }

  /** Como o real: aplica na tela na hora. */
  saveQueue(queue: InterviewQueue): Promise<void> {
    this.queue.set(queue);
    this.savedQueues.push(queue);
    return Promise.resolve();
  }

  /** Como o real com a volta do snapshot: a tarja aparece no controle. */
  saveAir(interview: BroadcastInterview | null, queue: InterviewQueue | null): Promise<void> {
    if (queue) this.queue.set(queue);
    this.control.update((c) => ({ ...c, interview }));
    this.aired.push({ interview, queue });
    return Promise.resolve();
  }

  ensureRanking(): void {
    this.rankingRequests++;
  }
}
