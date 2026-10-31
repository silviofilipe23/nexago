import type { TournamentMatch } from '../data/matches-repository';
import { ledChipOf, ledCourtParts, ledLeftSideOf, ledNameLines, ledPausaOf, ledSwapCountOf } from './telao-led-solo';

const NOW = Date.UTC(2026, 9, 30, 18, 0, 0);

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'A',
    team2Label: 'B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'in_progress',
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
  } as TournamentMatch;
}

/** Partida da mesa ponto a ponto: sets fechados + o set corrente dentro de `sets[]`. */
function mesa(sets: Array<[number, number]>): TournamentMatch {
  return match({ sets: sets.map(([a, b]) => ({ a, b })), currentSetIndex: sets.length - 1 });
}

const NAMES = { A: 'Emerson / Enzo', B: 'Felipe / Thiago' };
const PLAYERS = { A: ['Emerson Silva', 'Enzo Lima'], B: ['Felipe Souza', 'Thiago Reis'] };

describe('telao-led-solo', () => {
  describe('troca de lado', () => {
    it('começa com A à esquerda', () => {
      expect(ledLeftSideOf(mesa([[0, 0]]))).toBe('A');
      expect(ledLeftSideOf(mesa([[4, 2]]))).toBe('A');
    });

    it('troca a cada 7 pontos somados no set de 21 — e destroca nos 14', () => {
      expect(ledLeftSideOf(mesa([[4, 3]]))).toBe('B');
      expect(ledLeftSideOf(mesa([[8, 5]]))).toBe('B');
      expect(ledLeftSideOf(mesa([[8, 6]]))).toBe('A');
    });

    it('desfazer o ponto da troca desfaz a troca (sai do placar)', () => {
      expect(ledLeftSideOf(mesa([[4, 3]]))).toBe('B');
      expect(ledLeftSideOf(mesa([[4, 2]]))).toBe('A');
    });

    it('vira o lado na virada de set, como a mesa sugere ao abrir o set seguinte', () => {
      // Set 1 fechado em 21-15 (36 pontos → 5 trocas) e set 2 zerado: 1 troca pela virada.
      expect(ledSwapCountOf(mesa([[21, 15], [0, 0]]))).toBe(1);
      expect(ledLeftSideOf(mesa([[21, 15], [0, 0]]))).toBe('B');
    });

    it('decisivo de 15 troca a cada 5', () => {
      const m = mesa([[21, 18], [17, 21], [3, 2]]);
      // set 3 (índice 2) + 1 troca por 5 pontos = 3 → B à esquerda.
      expect(ledSwapCountOf(m)).toBe(3);
      expect(ledLeftSideOf(m)).toBe('B');
    });

    it('o ponto que fecha a partida não troca ninguém de lado', () => {
      // 21-14 = 35 pontos: o 35º fecha o jogo; o painel fica como estava no 34º.
      const fim = match({ status: 'completed', sets: [{ a: 21, b: 19 }, { a: 21, b: 14 }], winnerSide: 1 });
      expect(ledSwapCountOf(fim)).toBe(1 + 4);
    });

    it('sem regra de troca por pontos (games), só vira na virada de set', () => {
      const games = match({
        scoringProfile: { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'full', superTiebreakTo: 10 },
        sets: [{ a: 3, b: 4 }],
        currentSetIndex: 0,
      });
      expect(ledLeftSideOf(games)).toBe('A');
    });
  });

  describe('selo do centro', () => {
    it('ao vivo mostra o alvo do set', () => {
      expect(ledChipOf(mesa([[5, 4]]), 'A')).toEqual({ kind: 'alvo', label: 'Set até', value: '21' });
      expect(ledChipOf(mesa([[21, 18], [17, 21], [1, 0]]), 'A')).toEqual({ kind: 'alvo', label: 'Set até', value: '15' });
    });

    it('no ponto da troca avisa TROCA DE LADO', () => {
      expect(ledChipOf(mesa([[4, 3]]), 'B')?.kind).toBe('troca');
    });

    it('encerrada: fim de jogo', () => {
      expect(ledChipOf(match({ status: 'completed', sets: [{ a: 21, b: 10 }] }), 'A')?.kind).toBe('fim');
    });
  });

  describe('pausa', () => {
    const tempo = (o: Partial<NonNullable<TournamentMatch['technicalTimeout']>> = {}) => ({
      side: 'B' as const,
      teamId: 'tb',
      startedAt: new Date(NOW - 38_000),
      durationSec: 60,
      setIndex: 1,
      scoreA: 14,
      scoreB: 12,
      ...o,
    });

    it('pedido de tempo: a dupla que pediu e o que falta', () => {
      const m = { ...mesa([[21, 18], [14, 12]]), technicalTimeout: tempo() };
      expect(ledPausaOf(m, NOW, NAMES, PLAYERS)).toEqual(
        jasmine.objectContaining({ kind: 'tempo', title: 'Pedido de tempo', who: 'Felipe / Thiago', clock: '00:22' }),
      );
    });

    it('ponto marcado depois da chamada encerra o tempo', () => {
      const m = { ...mesa([[21, 18], [15, 12]]), technicalTimeout: tempo() };
      expect(ledPausaOf(m, NOW, NAMES, PLAYERS)).toBeNull();
    });

    it('sai alguns segundos depois de zerar', () => {
      const m = { ...mesa([[21, 18], [14, 12]]), technicalTimeout: tempo({ startedAt: new Date(NOW - 120_000) }) };
      expect(ledPausaOf(m, NOW, NAMES, PLAYERS)).toBeNull();
    });

    it('atendimento médico vence o pedido de tempo e fica até a mesa encerrar', () => {
      const m = {
        ...mesa([[3, 2]]),
        medicalTimeout: { side: 'A' as const, teamId: 'ta', playerSlot: 2 as const, playerName: '', startedAt: new Date(NOW - 600_000), durationSec: 300, setIndex: 0 },
      };
      expect(ledPausaOf(m, NOW, NAMES, PLAYERS)).toEqual(
        jasmine.objectContaining({ kind: 'medico', title: 'Tempo médico', who: 'Enzo Lima', clock: '00:00' }),
      );
    });

    it('fora do ao vivo não há pausa', () => {
      const m = { ...mesa([[14, 12]]), status: 'completed' as const, technicalTimeout: tempo({ setIndex: 0 }) };
      expect(ledPausaOf(m, NOW, NAMES, PLAYERS)).toBeNull();
    });
  });

  it('nome no card: um atleta por linha; nome de equipe quebra em duas linhas equilibradas', () => {
    expect(ledNameLines('Emerson / Enzo')).toEqual(['Emerson', 'Enzo']);
    expect(ledNameLines('Os Imbatíveis da Praia')).toEqual(['Os Imbatíveis', 'da Praia']);
    expect(ledNameLines('Tubarões')).toEqual(['Tubarões']);
  });

  it('separa o número da quadra pro destaque', () => {
    expect(ledCourtParts('Quadra 1')).toEqual({ label: 'Quadra', number: '1' });
    expect(ledCourtParts('Central')).toEqual({ label: 'Central', number: '' });
  });
});
