import type { KocRoundState } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import {
  overlayBandOf,
  overlayCornerOf,
  overlayTeamIdsOf,
  overlayViewOf,
  type OverlayDuelView,
  type OverlayKocView,
} from './overlay-selectors';

const NOW = Date.UTC(2026, 8, 22, 18, 0, 0);

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Dupla A',
    team2Label: 'Dupla B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [],
    courtId: 'Q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

function kocRound(overrides: Partial<KocRoundState>): KocRoundState {
  return {
    teamIds: ['k', 'c', 'q'],
    kingTeamId: 'k',
    challengerTeamId: 'c',
    queue: ['q'],
    points: {},
    rallies: 0,
    servingTeamId: '',
    clock: null,
    standings: [],
    qualifiersPerRound: 2,
    configuredDurationSec: 600,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 1,
    qualifierSlots: [],
    ...overrides,
  };
}

/** Rodada KOTC: os dois lados do duelo vêm VAZIOS no doc — o elenco vive em `koc`. */
function kocMatch(round: KocRoundState, overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return match({
    status: 'in_progress',
    matchType: 'koc_qualifier',
    teamAId: '',
    teamBId: '',
    team1Label: '',
    team2Label: '',
    koc: round,
    ...overrides,
  });
}

describe('overlayViewOf', () => {
  it('não pinta nada quando a partida não existe', () => {
    expect(overlayViewOf(null, NOW)).toBeNull();
  });

  it('não pinta nada quando a partida foi cancelada', () => {
    expect(overlayViewOf(match({ status: 'canceled' }), NOW)).toBeNull();
  });

  it('duelo ao vivo mostra os pontos do set corrente e só os sets já fechados', () => {
    const view = overlayViewOf(
      match({
        status: 'in_progress',
        sets: [
          { a: 21, b: 15 },
          { a: 14, b: 11 },
        ],
        currentSetIndex: 1,
      }),
      NOW,
    ) as OverlayDuelView;

    expect(view.kind).toBe('duel');
    expect(view.phase).toBe('live');
    expect(view.pointsA).toBe(14);
    expect(view.pointsB).toBe(11);
    expect(view.setsA).toBe(1);
    expect(view.setsB).toBe(0);
  });

  it('partida encerrada mostra o placar do último set, não traço', () => {
    const view = overlayViewOf(
      match({ status: 'completed', bestOf: 1, sets: [{ a: 19, b: 21 }] }),
      NOW,
    ) as OverlayDuelView;

    expect(view.phase).toBe('final');
    expect(view.pointsA).toBe(19);
    expect(view.pointsB).toBe(21);
  });

  it('partida que ainda não começou não inventa pontos', () => {
    const view = overlayViewOf(match({ status: 'scheduled', sets: [] }), NOW) as OverlayDuelView;

    expect(view.phase).toBe('pregame');
    expect(view.pointsA).toBeNull();
    expect(view.pointsB).toBeNull();
  });

  it('monta os dois lados do duelo com id, rótulo e quem está sacando', () => {
    const view = overlayViewOf(
      match({
        status: 'in_progress',
        sets: [{ a: 3, b: 2 }],
        currentSetIndex: 0,
        servingTeamId: 'tb',
      }),
      NOW,
    ) as OverlayDuelView;

    expect(view.a).toEqual({ teamId: 'ta', label: 'Dupla A', serving: false });
    expect(view.b).toEqual({ teamId: 'tb', label: 'Dupla B', serving: true });
  });

  it('não acende o saque dos dois lados quando os slots ainda não têm dupla', () => {
    const view = overlayViewOf(
      match({ status: 'scheduled', teamAId: '', teamBId: '', servingTeamId: '' }),
      NOW,
    ) as OverlayDuelView;

    expect(view.a.serving).toBeFalse();
    expect(view.b.serving).toBeFalse();
  });

  it('esconde a coluna de sets na partida de set único, que nunca sai de 0-0', () => {
    const single = overlayViewOf(
      match({ status: 'in_progress', bestOf: 1, sets: [{ a: 12, b: 9 }], currentSetIndex: 0 }),
      NOW,
    ) as OverlayDuelView;
    const md3 = overlayViewOf(
      match({ status: 'in_progress', bestOf: 3, sets: [{ a: 12, b: 9 }], currentSetIndex: 0 }),
      NOW,
    ) as OverlayDuelView;

    expect(single.showSets).toBeFalse();
    expect(md3.showSets).toBeTrue();
  });

  it('acusa MATCH POINT no lado que pode fechar a partida', () => {
    const view = overlayViewOf(
      match({
        status: 'in_progress',
        bestOf: 3,
        sets: [
          { a: 21, b: 15 },
          { a: 20, b: 10 },
        ],
        currentSetIndex: 1,
      }),
      NOW,
    ) as OverlayDuelView;

    expect(view.alert).toEqual({ side: 'A', kind: 'match' });
  });

  it('acusa SET POINT quando o ponto fecha só o set', () => {
    const view = overlayViewOf(
      match({ status: 'in_progress', bestOf: 3, sets: [{ a: 20, b: 10 }], currentSetIndex: 0 }),
      NOW,
    ) as OverlayDuelView;

    expect(view.alert).toEqual({ side: 'A', kind: 'set' });
  });

  it('rodada KOTC ao vivo mostra rei × desafiante com pontos, saque e relógio', () => {
    const view = overlayViewOf(
      kocMatch(
        kocRound({
          points: { k: 7, c: 4, q: 2 },
          servingTeamId: 'c',
          clock: { endsAtMs: NOW + 125_000, durationSec: 600, pausedAtMs: null },
        }),
      ),
      NOW,
    ) as OverlayKocView;

    expect(view.kind).toBe('koc');
    expect(view.king).toEqual({ teamId: 'k', label: '', serving: false });
    expect(view.challenger).toEqual({ teamId: 'c', label: '', serving: true });
    expect(view.kingPoints).toBe(7);
    expect(view.challengerPoints).toBe(4);
    expect(view.clock).toEqual({ label: '2:05', paused: false });
  });

  it('congela o relógio do KOTC quando a rodada está pausada', () => {
    const view = overlayViewOf(
      kocMatch(
        kocRound({
          clock: { endsAtMs: NOW + 125_000, durationSec: 600, pausedAtMs: NOW - 5_000 },
        }),
      ),
      NOW + 60_000,
    ) as OverlayKocView;

    expect(view.clock).toEqual({ label: '2:10', paused: true });
  });

  it('não pinta a rodada KOTC que ainda não tem rei e desafiante', () => {
    // `kocRoundStateFrom` NUNCA devolve null: rodada sem `kocState` no doc vira um estado com
    // ids vazios. Sem esta regra, a rodada agendada desenharia duas linhas em branco com 0 ponto.
    const view = overlayViewOf(
      kocMatch(kocRound({ kingTeamId: '', challengerTeamId: '' }), { status: 'scheduled' }),
      NOW,
    );

    expect(view).toBeNull();
  });

  it('não pinta nada numa partida KOTC sem estado de rodada', () => {
    expect(overlayViewOf(kocMatch(kocRound({}), { koc: null }), NOW)).toBeNull();
  });
});

describe('overlayCornerOf', () => {
  it('cai no canto superior esquerdo quando a URL não pede canto', () => {
    expect(overlayCornerOf(null)).toBe('tl');
  });

  it('respeita o canto pedido na URL', () => {
    expect(overlayCornerOf('br')).toBe('br');
  });

  it('ignora canto desconhecido em vez de quebrar a transmissão', () => {
    expect(overlayCornerOf('meio')).toBe('tl');
  });
});

describe('overlayBandOf', () => {
  it('junta evento, categoria, fase e quadra do duelo', () => {
    const band = overlayBandOf(match({ round: 'Semifinal', court: 'Quadra 2' }), {
      tournamentName: 'Copa VH',
      categoryName: 'Feminina B',
    });

    expect(band).toBe('Copa VH · Feminina B · Semifinal · Quadra 2');
  });

  it('usa o título da rodada KOTC, numerada por roundLabel e não pelo matchNumber global', () => {
    const band = overlayBandOf(
      kocMatch(kocRound({ roundLabel: 3 }), { round: null, matchNumber: 9, court: 'Quadra 1' }),
      { tournamentName: 'Copa VH', categoryName: null },
    );

    expect(band).toBe('Copa VH · Classificatória · Rodada 3 · Quadra 1');
  });

  it('omite os pedaços que ainda não existem', () => {
    const band = overlayBandOf(match({ round: null, court: null }), {
      tournamentName: null,
      categoryName: null,
    });

    expect(band).toBe('');
  });
});

describe('overlayTeamIdsOf', () => {
  it('colhe as duas duplas do duelo', () => {
    expect(overlayTeamIdsOf(match({ teamAId: 'ta', teamBId: 'tb' }))).toEqual(['ta', 'tb']);
  });

  it('colhe o elenco inteiro da rodada KOTC, que não vive em teamAId/teamBId', () => {
    const ids = overlayTeamIdsOf(kocMatch(kocRound({ teamIds: ['k', 'c', 'q'] })));

    expect(ids).toEqual(['k', 'c', 'q']);
  });

  it('descarta slot ainda sem dupla', () => {
    expect(overlayTeamIdsOf(match({ teamAId: 'ta', teamBId: '' }))).toEqual(['ta']);
  });
});
