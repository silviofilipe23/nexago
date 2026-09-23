import type { KocRoundState } from '../../painel/data/koc';
import type { KocRallyEntry } from '../../painel/data/koc';
import { kocBarOf, kocRoundTitleOf } from './overlay-koc-bar';

const NOW = Date.UTC(2026, 8, 22, 18, 0, 0);

function round(overrides: Partial<KocRoundState>): KocRoundState {
  return {
    teamIds: ['a', 'b', 'c', 'd', 'e'],
    kingTeamId: 'e',
    challengerTeamId: 'd',
    queue: ['c', 'b', 'a'],
    points: {},
    rallies: 0,
    servingTeamId: '',
    clock: null,
    standings: [],
    qualifiersPerRound: 2,
    teamsPerCourt: 4,
    roundsPerBracket: 1,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 3,
    qualifierSlots: [],
    ...overrides,
  };
}

describe('kocBarOf', () => {
  it('vai da fila mais atrás até o rei, com o próximo a entrar colado no desafiante', () => {
    const bar = kocBarOf(round({ points: { a: 1, b: 2, c: 3, d: 4, e: 5 } }), NOW, 0);

    expect(bar.blocks.map((b) => b.teamId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(bar.blocks.map((b) => b.role)).toEqual([
      'queue',
      'queue',
      'queue',
      'challenger',
      'king',
    ]);
    expect(bar.blocks.map((b) => b.points)).toEqual([1, 2, 3, 4, 5]);
  });

  it('marca como próximo a entrar só o primeiro da fila', () => {
    const bar = kocBarOf(round({}), NOW, 0);

    expect(bar.blocks.filter((b) => b.nextUp).map((b) => b.teamId)).toEqual(['c']);
  });

  it('funciona na rodada mínima de três duplas', () => {
    const bar = kocBarOf(
      round({ teamIds: ['a', 'b', 'c'], kingTeamId: 'c', challengerTeamId: 'b', queue: ['a'] }),
      NOW,
      0,
    );

    expect(bar.blocks.map((b) => b.teamId)).toEqual(['a', 'b', 'c']);
    expect(bar.blocks[0].nextUp).toBeTrue();
  });
});

function rallies(...winners: KocRallyEntry['winner'][]): KocRallyEntry[] {
  return winners.map((winner, i) => ({ seq: i + 1, winner, teamId: '', atMs: null }));
}

describe('kocBarOf — sequência do rei', () => {
  it('conta as defesas seguidas do rei', () => {
    const bar = kocBarOf(
      round({ rallyLog: rallies('challenger', 'king', 'king', 'king', 'king') }),
      NOW,
      0,
    );

    expect(bar.streak).toBe(4);
  });

  it('coroação zera a sequência', () => {
    const bar = kocBarOf(
      round({ rallyLog: rallies('king', 'king', 'king', 'king', 'challenger') }),
      NOW,
      0,
    );

    expect(bar.streak).toBeNull();
  });

  it('erro de saque do desafiante não quebra a sequência nem conta como defesa', () => {
    const bar = kocBarOf(
      round({ rallyLog: rallies('king', 'king', 'serve_fault', 'king', 'king') }),
      NOW,
      0,
    );

    expect(bar.streak).toBe(4);
  });

  it('não acende o selo antes de três defesas seguidas', () => {
    const bar = kocBarOf(round({ rallyLog: rallies('challenger', 'king', 'king') }), NOW, 0);

    expect(bar.streak).toBeNull();
  });
});

describe('kocBarOf — relógio', () => {
  it('conta para trás o prazo que o servidor gravou', () => {
    const bar = kocBarOf(
      round({ clock: { endsAtMs: NOW + 836_000, durationSec: 900, pausedAtMs: null } }),
      NOW,
      0,
    );

    expect(bar.clock).toEqual({ label: '13:56', paused: false });
  });

  it('congela onde parou quando a rodada está pausada', () => {
    const bar = kocBarOf(
      round({ clock: { endsAtMs: NOW + 836_000, durationSec: 900, pausedAtMs: NOW } }),
      NOW + 120_000,
      0,
    );

    expect(bar.clock).toEqual({ label: '13:56', paused: true });
  });
});

describe('kocRoundTitleOf', () => {
  it('numera a rodada dentro do total da fase', () => {
    expect(kocRoundTitleOf('koc_round', 3, 9, 7)).toBe('Classificatória · Rodada 3/7');
  });

  it('omite o total quando não foi possível contar as rodadas', () => {
    expect(kocRoundTitleOf('koc_round', 3, 9, 0)).toBe('Classificatória · Rodada 3');
  });

  it('final e semifinal não levam numeração', () => {
    expect(kocRoundTitleOf('koc_final', 0, 4, 7)).toBe('Final');
    expect(kocRoundTitleOf('koc_semifinal', 0, 4, 7)).toBe('Semifinal');
  });
});
