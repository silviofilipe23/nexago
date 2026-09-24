import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { KocRoundState } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import type { TelaoTeamDisplay } from './telao-data.service';
import { TelaoKocModeComponent } from './telao-koc-mode.component';

/** `phaseLine` não tinha spec nenhuma — nem de função pura, nem de componente. É exatamente o
 *  tipo de rótulo que quebra silencioso: nenhum teste falha, e só se percebe olhando o telão no
 *  meio do evento. Ver a seção "Fix round 1/5" em task-10-report.md. */

const NOW = Date.UTC(2026, 8, 24, 18, 0, 0);

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['k', 'c', 'q'],
    kingTeamId: 'k',
    challengerTeamId: 'c',
    queue: ['q'],
    points: { k: 4, c: 2, q: 1 },
    rallies: 0,
    servingTeamId: '',
    clock: { endsAtMs: NOW + 600_000, durationSec: 900, pausedAtMs: null },
    standings: [],
    qualifiersPerRound: 1,
    teamsPerCourt: 4,
    roundsPerBracket: 2,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 3,
    qualifierSlots: [],
    batteryLabel: 1,
    phases: null,
    maxTeamsPerRound: 5,
    ...overrides,
  };
}

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: 'Quadra 2',
    status: 'in_progress',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q2',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 3,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: new Date(NOW),
    matchEndedAt: null,
    koc: round(),
    ...overrides,
  };
}

function team(a: string, b: string): TelaoTeamDisplay {
  return {
    label: `${a} / ${b}`,
    short: a,
    sub: null,
    players: [
      { initials: a.slice(0, 2).toUpperCase(), photoUrl: null },
      { initials: b.slice(0, 2).toUpperCase(), photoUrl: null },
    ],
    playerNames: [a, b],
  };
}

const TEAMS = new Map<string, TelaoTeamDisplay>([
  ['k', team('Van', 'Aye')],
  ['c', team('Bro', 'Dau')],
  ['q', team('Sor', 'Ham')],
]);

async function mount(overrides: Partial<TournamentMatch> = {}, roundTotal = 0) {
  const fixture = TestBed.createComponent(TelaoKocModeComponent);
  fixture.componentRef.setInput('match', match(overrides));
  fixture.componentRef.setInput('nowMs', NOW);
  fixture.componentRef.setInput('teamsById', TEAMS);
  fixture.componentRef.setInput('roundTotal', roundTotal);
  await fixture.whenStable();
  return fixture;
}

function phaseLineText(fixture: { nativeElement: unknown }): string {
  const el = (fixture.nativeElement as HTMLElement).querySelector('.og-koc-event-sub');
  return (el?.textContent ?? '').trim();
}

describe('TelaoKocModeComponent · phaseLine', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TelaoKocModeComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('sem bateria, o telão continua numerando "Rodada N DE total" como sempre', async () => {
    const fixture = await mount({}, 7);

    expect(phaseLineText(fixture)).toBe('CLASSIFICATÓRIA · RODADA 3 DE 7');
  });

  it('com mais de uma bateria, o telão diz a chave em vez de repetir o total', async () => {
    const fixture = await mount({ koc: round({ roundLabel: 9, batteryLabel: 3, poolId: 'C4' }) }, 12);

    // A bateria já localiza a rodada: "DE 12" não aparece mais, seria a mesma
    // resposta duas vezes.
    expect(phaseLineText(fixture)).toBe('CLASSIFICATÓRIA · CHAVE 4 · BATERIA 3');
  });

  it('semifinal com bateria não leva chave — uma fase com uma chave só já é única', async () => {
    const fixture = await mount(
      { matchType: 'koc_semifinal', koc: round({ roundLabel: 2, batteryLabel: 2, poolId: 'C1' }) },
      0,
    );

    expect(phaseLineText(fixture)).toBe('SEMIFINAL · BATERIA 2');
  });
});
