import {
  isKingOfCourtMatchType,
  kocFinalTable,
  kocHasQualifyingTie,
  kocQualifyingTieGroup,
  kocHasStarted,
  kocIsExpired,
  kocLiveOrder,
  kocPhaseLabel,
  kocPointsOf,
  kocRemainingLabel,
  kocRemainingSec,
  kocRoundStateFrom,
  kocTiedWith,
} from './koc';

/** Porta de `koc-engine.ts` (backend) e `koc_round_state.dart` (app). Os casos
 *  são os MESMOS dos testes de lá: se as três leituras divergirem, mesa do app,
 *  mesa do portal e telão mostram coisas diferentes na mesma quadra. */

const T0 = 1_700_000_000_000;

function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kocTeamIds: ['A', 'B', 'C', 'D'],
    kocConfig: { qualifiersPerRound: 2, durationSec: 900 },
    ...overrides,
  };
}

describe('isKingOfCourtMatchType', () => {
  it('reconhece os tipos gerados pela chave', () => {
    for (const type of ['koc_round', 'koc_semifinal', 'koc_final']) {
      expect(isKingOfCourtMatchType(type)).toBe(true);
    }
  });

  it('aceita caixa alta e espaço no lugar do underscore', () => {
    for (const raw of ['KOC_ROUND', 'Koc Final', '  koc_semifinal  ']) {
      expect(isKingOfCourtMatchType(raw)).toBe(true);
    }
  });

  it('blinda tipo KOTC futuro pelo prefixo', () => {
    expect(isKingOfCourtMatchType('koc_repescagem')).toBe(true);
  });

  it('trata todo tipo de duelo como duelo', () => {
    for (const raw of ['final', 'semifinal', 'WB', 'LB', 'group', '']) {
      expect(isKingOfCourtMatchType(raw)).toBe(false);
    }
  });

  it('exige a fronteira do prefixo', () => {
    expect(isKingOfCourtMatchType('kocround')).toBe(false);
  });
});

describe('kocPhaseLabel', () => {
  it('a classificatória leva o número da rodada', () => {
    // Numa quadra só elas acontecem em sequência: o número responde "qual é a minha".
    expect(kocPhaseLabel('koc_round', 3)).toBe('Classificatória · Rodada 3');
  });

  it('semifinal e final não levam número', () => {
    expect(kocPhaseLabel('koc_semifinal', 5)).toBe('Semifinal');
    expect(kocPhaseLabel('koc_final', 7)).toBe('Final');
  });
});

describe('kocRoundStateFrom', () => {
  it('lê elenco, trono, fila e pontos', () => {
    const round = kocRoundStateFrom(
      doc({
        kocState: {
          kingTeamId: 'A',
          challengerTeamId: 'C',
          queue: ['D', 'B'],
          points: { A: 2, B: 0, C: 1, D: 0 },
          rallies: 3,
          servingTeamId: 'C',
        },
        kocRallySeq: 3,
      }),
    );
    expect(round.teamIds).toEqual(['A', 'B', 'C', 'D']);
    expect(round.kingTeamId).toBe('A');
    expect(round.queue).toEqual(['D', 'B']);
    expect(kocPointsOf(round, 'A')).toBe(2);
    expect(round.rallies).toBe(3);
    // `rallySeq` é o que vai em `expectedSeq` no próximo rally.
    expect(round.rallySeq).toBe(3);
  });

  it('rodada sem relógio é rodada que não começou', () => {
    expect(kocHasStarted(kocRoundStateFrom(doc()))).toBe(false);
  });

  it('campo corrompido vira vazio, não exceção', () => {
    // A mesa não pode ficar sem tela por um campo torto.
    const round = kocRoundStateFrom({
      kocTeamIds: ['A', '', 42, 'B'],
      kocState: 'lixo',
      kocClock: [1, 2],
      kocStandings: 'lixo',
    });
    expect(round.teamIds).toEqual(['A', 'B']);
    expect(round.kingTeamId).toBe('');
    expect(round.clock).toBeNull();
    expect(round.standings).toEqual([]);
  });

  it('lê a tabela final ordenada por colocação', () => {
    const round = kocRoundStateFrom(
      doc({
        kocStandings: [
          { teamId: 'D', place: 2, points: 1, crowns: 1 },
          { teamId: 'A', place: 1, points: 2, crowns: 1 },
        ],
      }),
    );
    expect(round.standings.map((s) => s.teamId)).toEqual(['A', 'D']);
  });
});

describe('relógio', () => {
  it('conta para trás até endsAtMs, sem recalcular prazo', () => {
    const round = kocRoundStateFrom(doc({ kocClock: { endsAtMs: T0 + 900_000, durationSec: 900 } }));
    expect(kocRemainingSec(round.clock!, T0)).toBe(900);
    expect(kocRemainingSec(round.clock!, T0 + 600_000)).toBe(300);
  });

  it('não passa de zero e acusa o estouro', () => {
    const round = kocRoundStateFrom(doc({ kocClock: { endsAtMs: T0, durationSec: 900 } }));
    expect(kocRemainingSec(round.clock!, T0 + 60_000)).toBe(0);
    expect(kocIsExpired(round.clock!, T0)).toBe(true);
  });

  it('em pausa o tempo congela onde parou', () => {
    const round = kocRoundStateFrom(
      doc({ kocClock: { endsAtMs: T0 + 900_000, durationSec: 900, pausedAtMs: T0 + 300_000 } }),
    );
    // Dez minutos de mundo real depois, ainda faltam 600s.
    expect(kocRemainingSec(round.clock!, T0 + 900_000)).toBe(600);
  });

  it('formata o que a mesa lê de relance', () => {
    const round = kocRoundStateFrom(doc({ kocClock: { endsAtMs: T0 + 725_000, durationSec: 900 } }));
    expect(kocRemainingLabel(round.clock!, T0)).toBe('12:05');
  });
});

describe('tabela ao vivo', () => {
  function withPoints(points: Record<string, number>, qualifiers = 2) {
    return kocRoundStateFrom(
      doc({
        kocConfig: { qualifiersPerRound: qualifiers, durationSec: 900 },
        kocState: { kingTeamId: 'A', challengerTeamId: 'B', queue: ['C', 'D'], points, rallies: 4 },
      }),
    );
  }

  it('ordena por pontos, com a ordem de entrada desempatando', () => {
    expect(kocLiveOrder(withPoints({ A: 1, B: 3, C: 1, D: 0 }))).toEqual(['B', 'A', 'C', 'D']);
  });

  it('aponta quem está empatado em pontos', () => {
    const round = withPoints({ A: 1, B: 3, C: 1, D: 0 });
    expect(kocTiedWith(round, 'A')).toEqual(['C']);
    expect(kocTiedWith(round, 'B')).toEqual([]);
  });

  it('acusa o empate que atravessa o corte', () => {
    // A e C empatam em 1 disputando a 2ª vaga: bola de ouro devida.
    expect(kocHasQualifyingTie(withPoints({ A: 1, B: 3, C: 1, D: 0 }))).toBe(true);
  });

  it('empate abaixo do corte não é bola de ouro', () => {
    // C e D empatam em 0 por 3º e 4º: não muda quem classifica.
    expect(kocHasQualifyingTie(withPoints({ A: 2, B: 3, C: 0, D: 0 }))).toBe(false);
  });

  it('sem corte a decidir, não há empate a resolver', () => {
    expect(kocHasQualifyingTie(withPoints({ A: 0, B: 0, C: 0, D: 0 }, 4))).toBe(false);
  });
});

/** A mesa fica aberta em leitura depois do apito, e é esta tabela que ela
 *  mostra. Mesmos casos de `KocRoundState.finalTable` no app. */
describe('kocFinalTable', () => {
  it('usa as posições gravadas no encerramento', () => {
    const round = kocRoundStateFrom(
      doc({
        kocState: { points: { A: 1, B: 4, C: 2, D: 0 }, rallies: 7 },
        kocStandings: [
          { teamId: 'B', place: 1, points: 4, crowns: 2 },
          { teamId: 'C', place: 2, points: 2, crowns: 1 },
          { teamId: 'A', place: 3, points: 1, crowns: 1 },
          { teamId: 'D', place: 4, points: 0, crowns: 0 },
        ],
      }),
    );
    expect(kocFinalTable(round).map((r) => r.teamId)).toEqual(['B', 'C', 'A', 'D']);
    expect(kocFinalTable(round)[0].crowns).toBe(2);
  });

  it('sem standings gravadas, cai na ordem por pontos', () => {
    // Rodada encerrada por um caminho antigo: a mesa mostra a ordem ao vivo em
    // vez de uma tabela vazia.
    const round = kocRoundStateFrom(
      doc({ kocState: { points: { A: 1, B: 4, C: 2, D: 0 }, rallies: 7 } }),
    );
    expect(kocFinalTable(round).map((r) => r.teamId)).toEqual(['B', 'C', 'A', 'D']);
    expect(kocFinalTable(round).map((r) => r.place)).toEqual([1, 2, 3, 4]);
  });
});

/** Quem joga a bola de ouro. Espelha `kocQualifyingTies` do servidor, que é
 *  quem valida o desempate. */
describe('kocQualifyingTieGroup', () => {
  function withPoints(points: Record<string, number>, qualifiers = 2) {
    return kocRoundStateFrom(
      doc({
        kocConfig: { qualifiersPerRound: qualifiers, durationSec: 900 },
        kocState: { kingTeamId: 'A', challengerTeamId: 'B', queue: ['C', 'D'], points, rallies: 4 },
      }),
    );
  }

  it('devolve todas as empatadas na pontuação da vaga', () => {
    // Um rally só já produz isto: A abre 1 e as outras três disputam a 2ª vaga.
    expect(kocQualifyingTieGroup(withPoints({ A: 1, B: 0, C: 0, D: 0 }))).toEqual(['B', 'C', 'D']);
  });

  it('empate abaixo do corte não é bola de ouro', () => {
    expect(kocQualifyingTieGroup(withPoints({ A: 2, B: 3, C: 0, D: 0 }))).toEqual([]);
  });

  it('sem corte a decidir, não há bola de ouro', () => {
    expect(kocQualifyingTieGroup(withPoints({ A: 0, B: 0, C: 0, D: 0 }, 4))).toEqual([]);
  });
});
