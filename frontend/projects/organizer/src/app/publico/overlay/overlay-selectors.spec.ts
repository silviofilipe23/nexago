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
    teamsPerCourt: 4,
    roundsPerBracket: 1,
    configuredDurationSec: 600,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 1,
    qualifierSlots: [],
    batteryLabel: 1,
    phases: null,
    maxTeamsPerRound: 5,
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

  it('rodada KOTC ao vivo vira a faixa com a rodada inteira, do fundo da fila até o rei', () => {
    const view = overlayViewOf(
      kocMatch(
        kocRound({
          teamIds: ['a', 'b', 'c', 'd'],
          kingTeamId: 'd',
          challengerTeamId: 'c',
          queue: ['b', 'a'],
          points: { a: 1, b: 2, c: 4, d: 7 },
          clock: { endsAtMs: NOW + 836_000, durationSec: 900, pausedAtMs: null },
        }),
        { matchNumber: 9 },
      ),
      NOW,
      7,
    ) as OverlayKocView;

    expect(view.kind).toBe('koc');
    expect(view.roundTitle).toBe('Classificatória · Rodada 1/7');
    expect(view.bar.blocks.map((b) => b.teamId)).toEqual(['a', 'b', 'c', 'd']);
    expect(view.bar.blocks.map((b) => b.role)).toEqual(['queue', 'queue', 'challenger', 'king']);
    expect(view.bar.blocks.map((b) => b.points)).toEqual([1, 2, 4, 7]);
    expect(view.bar.clock).toEqual({ label: '13:56', paused: false });
  });

  it('com mais de uma bateria, a faixa do OBS diz a chave em vez do número global', () => {
    const view = overlayViewOf(
      kocMatch(
        kocRound({
          teamIds: ['a', 'b', 'c', 'd'],
          kingTeamId: 'd',
          challengerTeamId: 'c',
          queue: ['b', 'a'],
          roundLabel: 9,
          batteryLabel: 3,
          poolId: 'C4',
        }),
        { matchNumber: 9 },
      ),
      NOW,
      7,
    ) as OverlayKocView;

    expect(view.roundTitle).toBe('Classificatória · Chave 4 · Bateria 3');
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

describe('overlayViewOf · partida de games', () => {
  const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'super_tiebreak', superTiebreakTo: 10 } as const;
  const games = (o: Partial<TournamentMatch>) => match({ status: 'in_progress', scoringProfile: BT, servingTeamId: 'ta', ...o });

  it('número grande = ponto do game; coluna do set ao vivo = games', () => {
    const view = overlayViewOf(games({ sets: [{ a: 6, b: 4 }, { a: 5, b: 4 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 } }), NOW) as OverlayDuelView;
    expect(view.gameA).toBe('40');
    expect(view.gameB).toBe('15');
    expect(view.setsA).toBe(1);
    expect(view.statusLabel).toBe('Set 2 · até 6 games');
    expect(view.setColumns.at(-1)).toEqual({ index: 1, label: 'SET 2', a: 5, b: 4, active: true });
    expect(view.alert).toEqual({ side: 'A', kind: 'match' });
  });

  it('tie-break e super tie-break no rótulo', () => {
    const tb = overlayViewOf(games({ sets: [{ a: 6, b: 6 }], currentSetIndex: 0, currentGame: { a: 2, b: 1 } }), NOW) as OverlayDuelView;
    expect(tb.statusLabel).toBe('Tie-break');
    expect(tb.gameA).toBe('2');
    const stb = overlayViewOf(games({ sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 0, b: 0 }], currentSetIndex: 2, currentGame: { a: 7, b: 5 } }), NOW) as OverlayDuelView;
    expect(stb.statusLabel).toBe('Super tie-break');
  });

  it('set único de games ainda mostra a coluna do set (os games)', () => {
    const view = overlayViewOf(games({ bestOf: 1, sets: [{ a: 3, b: 2 }], currentSetIndex: 0, currentGame: { a: 0, b: 1 } }), NOW) as OverlayDuelView;
    expect(view.showSets).toBeTrue();
    expect(view.setColumns).toEqual([{ index: 0, label: 'SET 1', a: 3, b: 2, active: true }]);
  });

  it('super tie-break encerrado mostra os pontos dele na coluna', () => {
    const view = overlayViewOf(games({ status: 'completed', winnerSide: 1, sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 1, b: 0, tb: { a: 10, b: 8 } }] }), NOW) as OverlayDuelView;
    expect(view.setColumns.map((c) => [c.a, c.b])).toEqual([[6, 4], [3, 6], [10, 8]]);
  });

  it('partida de pontos no set decisivo de MD3: "Tie-break"', () => {
    const view = overlayViewOf(match({ status: 'in_progress', sets: [{ a: 21, b: 15 }, { a: 18, b: 21 }, { a: 5, b: 3 }], currentSetIndex: 2 }), NOW) as OverlayDuelView;
    expect(view.statusLabel).toBe('Tie-break');
  });

  it('partida de pontos: sem game e rótulo de sempre', () => {
    const view = overlayViewOf(match({ status: 'in_progress', sets: [{ a: 21, b: 15 }, { a: 14, b: 11 }], currentSetIndex: 1 }), NOW) as OverlayDuelView;
    expect(view.gameA).toBeNull();
    expect(view.statusLabel).toBe('Set 2 · até 21');
    expect(view.setColumns.at(-1)).toEqual({ index: 1, label: 'SET 2', a: null, b: null, active: true });
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

  it('usa o título da rodada KOTC já mapeado — numerado por roundLabel, não pelo matchNumber global', () => {
    // `roundLabelOf` (matches-repository) é quem monta este texto, e monta para
    // TODA rodada KOTC: a faixa só o repassa.
    const band = overlayBandOf(
      kocMatch(kocRound({ roundLabel: 3 }), {
        round: 'Classificatória · Rodada 3',
        matchNumber: 9,
        court: 'Quadra 1',
      }),
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
