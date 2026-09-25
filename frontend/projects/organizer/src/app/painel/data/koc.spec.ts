import {
  isKingOfCourtMatchType,
  kocCardTitle,
  kocMatchPhaseLabel,
  kocFinalTable,
  kocHasQualifyingTie,
  kocQualifyingTieGroup,
  kocHasStarted,
  kocIsExpired,
  kocLiveOrder,
  kocLogLines,
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

describe('rótulo da rodada com baterias', () => {
  it('sem bateria continua dizendo o que sempre disse', () => {
    expect(kocPhaseLabel('koc_round', 3)).toBe('Classificatória · Rodada 3');
    expect(kocPhaseLabel('koc_final', 1)).toBe('Final');
  });

  it('com bateria, diz a CHAVE e a bateria — "Rodada 9" não responde nada na areia', () => {
    expect(kocPhaseLabel('koc_round', 9, { poolId: 'C4', batteryLabel: 3 }))
      .toBe('Classificatória · Chave 4 · Bateria 3');
  });

  it('chave de uma bateria só não vira "Bateria 1"', () => {
    expect(kocPhaseLabel('koc_round', 2, { poolId: 'C2', batteryLabel: 1 }))
      .toBe('Classificatória · Rodada 2');
  });

  it('a semifinal de chave única não repete a chave — "Bateria 2" já é único', () => {
    expect(kocPhaseLabel('koc_semifinal', 2, { poolId: 'C1', batteryLabel: 2, bracketsInPhase: 1 }))
      .toBe('Semifinal · Bateria 2');
  });

  it('a semifinal de DUAS chaves diz a chave — senão as duas quadras exibem a mesma coisa', () => {
    // 12 duplas com teto 6 caem numa semi de duas chaves de 4 com duas
    // baterias: C1 e C2 jogam a bateria 2 ao mesmo tempo, em quadras
    // diferentes, e o telão, o overlay e os dois painéis de LED mostravam
    // "SEMIFINAL · BATERIA 2" nos dois.
    expect(kocPhaseLabel('koc_semifinal', 2, { poolId: 'C1', batteryLabel: 2, bracketsInPhase: 2 }))
      .toBe('Semifinal · Chave 1 · Bateria 2');
    expect(kocPhaseLabel('koc_semifinal', 2, { poolId: 'C2', batteryLabel: 2, bracketsInPhase: 2 }))
      .toBe('Semifinal · Chave 2 · Bateria 2');
  });

  it('classificatória de chave única também não exibe "Chave 1"', () => {
    expect(kocPhaseLabel('koc_round', 2, { poolId: 'C1', batteryLabel: 2, bracketsInPhase: 1 }))
      .toBe('Classificatória · Bateria 2');
  });

  it('sem saber quantas chaves a fase tem (chave antiga), mantém o que sempre mostrou', () => {
    expect(kocPhaseLabel('koc_round', 9, { poolId: 'C4', batteryLabel: 3 }))
      .toBe('Classificatória · Chave 4 · Bateria 3');
  });
});

describe('kocMatchPhaseLabel · o rótulo das duas mesas', () => {
  /** A rodada como a mesa a recebe: campos que importam pro rótulo. */
  function koc(overrides: Record<string, unknown> = {}) {
    return { roundLabel: 2, batteryLabel: 3, poolId: 'C4', bracketsInPhase: 4, ...overrides } as Parameters<
      typeof kocMatchPhaseLabel
    >[1];
  }

  it('mesa da rodada (og-mesa-koc): `TournamentMatch` + `m.koc` — a chave vem da RODADA', () => {
    // `TournamentMatch` não tem `poolId` (só a rodada tem). É o que
    // `phaseLabel()` passa, e o telão da mesma quadra diz esta string.
    const detail = kocMatchPhaseLabel({ matchType: 'koc_round', matchNumber: 9 }, koc());

    expect(detail).toBe('Classificatória · Chave 4 · Bateria 3');
  });

  it('cabeçalho da mesa ao vivo: `LiveMatch` (com poolId, matchNumber GLOBAL) + a rodada da linha', () => {
    // O que `headerSubtitle()` passa. Tem que dar a MESMA string da mesa
    // acima: as duas telas ficam abertas ao mesmo tempo, uma dentro da outra.
    const detail = kocMatchPhaseLabel({ matchType: 'koc_round', matchNumber: 9, poolId: 'C4' }, koc());

    expect(detail).toBe('Classificatória · Chave 4 · Bateria 3');
  });

  it('prefere `roundLabel` (índice na fase) ao `matchNumber` global', () => {
    const detail = kocMatchPhaseLabel(
      { matchType: 'koc_round', matchNumber: 9, poolId: 'C2' },
      koc({ roundLabel: 2, batteryLabel: 1, bracketsInPhase: 4 }),
    );

    expect(detail).toBe('Classificatória · Rodada 2');
  });

  it('sem a rodada em mãos (linha ainda não carregou), cai no número global e não inventa chave', () => {
    const detail = kocMatchPhaseLabel({ matchType: 'koc_round', matchNumber: 9, poolId: 'C4' }, null);

    expect(detail).toBe('Classificatória · Rodada 9');
  });

  it('semifinal de duas chaves também se identifica na mesa', () => {
    const detail = kocMatchPhaseLabel(
      { matchType: 'koc_semifinal', matchNumber: 13, poolId: 'C2' },
      koc({ roundLabel: 2, batteryLabel: 2, poolId: 'C2', bracketsInPhase: 2 }),
    );

    expect(detail).toBe('Semifinal · Chave 2 · Bateria 2');
  });
});

describe('kocRoundStateFrom · chaves da fase', () => {
  const plan = [
    { bracketSizes: [4, 4, 4], roundsPerBracket: 2, qualifiersPerRound: 1, durationSec: 900 },
    { bracketSizes: [3, 3], roundsPerBracket: 2, qualifiersPerRound: 1, durationSec: 900 },
    { bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900 },
  ];

  it('conta as chaves da fase DESTA rodada, não as da primeira', () => {
    expect(kocRoundStateFrom(doc({ kocPhase: 1, kocConfig: { phases: plan } })).bracketsInPhase).toBe(3);
    expect(kocRoundStateFrom(doc({ kocPhase: 2, kocConfig: { phases: plan } })).bracketsInPhase).toBe(2);
    expect(kocRoundStateFrom(doc({ kocPhase: 3, kocConfig: { phases: plan } })).bracketsInPhase).toBe(1);
  });

  it('cai no `round` quando o doc não tem `kocPhase` — o gerador grava os dois', () => {
    expect(kocRoundStateFrom(doc({ round: 2, kocConfig: { phases: plan } })).bracketsInPhase).toBe(2);
  });

  it('chave publicada antes do plano fica em 0 — desconhecido, não "uma chave só"', () => {
    expect(kocRoundStateFrom(doc({ kocPhase: 1 })).bracketsInPhase).toBe(0);
  });
});

describe('kocCardTitle', () => {
  it('usa o round já mapeado — que `roundLabelOf` sempre monta pra rodada KOTC', () => {
    expect(
      kocCardTitle({ matchType: 'koc_round', round: 'Classificatória · Chave 2 · Bateria 3' }),
    ).toBe('Classificatória · Chave 2 · Bateria 3');
  });

  it('duelo não tem título KOTC', () => {
    expect(kocCardTitle({ matchType: 'Final', round: 'Final' })).toBeNull();
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

describe('kocLogLines', () => {
  it('reconstrói quem pontuou e quem coroou, do mais recente ao mais antigo', () => {
    // A no trono, B desafia, C/D na fila.
    // 1) A defende → C entra. 2) C coroa → D entra. 3) C defende.
    const round = kocRoundStateFrom(
      doc({
        kocTeamIds: ['A', 'B', 'C', 'D'],
        kocRallies: [
          { seq: 1, winner: 'king', atMs: 1_000 },
          { seq: 2, winner: 'challenger', atMs: 2_000 },
          { seq: 3, winner: 'king', atMs: 3_000 },
        ],
      }),
    );
    const lines = kocLogLines(round);
    expect(lines.map((l) => ({ teamId: l.teamId, kind: l.kind }))).toEqual([
      { teamId: 'C', kind: 'point' },
      { teamId: 'C', kind: 'crown' },
      { teamId: 'A', kind: 'point' },
    ]);
    expect(lines[0]?.atMs).toBe(3_000);
  });
});

describe('kocRoundStateFrom · snapshot da config', () => {
  it('guarda duplas por quadra e rodadas por chave como estavam na geração', () => {
    const round = kocRoundStateFrom({
      kocTeamIds: ['a', 'b', 'c', 'd'],
      kocConfig: { teamsPerCourt: 5, roundsPerBracket: 2, qualifiersPerRound: 1, durationSec: 1200 },
    });
    expect(round.teamsPerCourt).toBe(5);
    expect(round.roundsPerBracket).toBe(2);
  });

  it('chave gerada antes do campo existir lê como 1 — não como indefinido', () => {
    // É esse default que faz a comparação com a categoria acusar a diferença
    // em vez de passar batido.
    const round = kocRoundStateFrom({
      kocTeamIds: ['a', 'b', 'c'],
      kocConfig: { teamsPerCourt: 4, qualifiersPerRound: 2, durationSec: 900 },
    });
    expect(round.roundsPerBracket).toBe(1);
    expect(round.teamsPerCourt).toBe(4);
  });
});

describe('KocRoundState · plano congelado na rodada', () => {
  it('lê a bateria e o plano gravados na geração', () => {
    const state = kocRoundStateFrom({
      kocState: { teamIds: ['a', 'b', 'c'] },
      kocRoundLabel: 7,
      kocBatteryLabel: 3,
      poolId: 'C4',
      kocConfig: {
        durationSec: 900,
        teamsPerCourt: 6,
        roundsPerBracket: 4,
        qualifiersPerRound: 1,
        maxTeamsPerRound: 6,
        phases: [
          { bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900 },
          { bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900 },
          { bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900 },
        ],
      },
    });
    expect(state.batteryLabel).toBe(3);
    expect(state.poolId).toBe('C4');
    expect(state.phases?.length).toBe(3);
    expect(state.maxTeamsPerRound).toBe(6);
  });

  it('rodada antiga sem plano continua legível', () => {
    const state = kocRoundStateFrom({
      kocState: { teamIds: ['a', 'b', 'c'] },
      kocConfig: { durationSec: 900, teamsPerCourt: 4, roundsPerBracket: 1, qualifiersPerRound: 2 },
    });
    expect(state.phases).toBeNull();
    expect(state.batteryLabel).toBe(1);
    expect(state.maxTeamsPerRound).toBe(5);
  });
});

describe('KocRoundState · origem da config congelada', () => {
  it('lê a origem que a geração carimbou', () => {
    const state = kocRoundStateFrom({
      kocState: { teamIds: ['a', 'b', 'c'] },
      kocConfig: {
        durationSec: 900,
        teamsPerCourt: 3,
        roundsPerBracket: 1,
        qualifiersPerRound: 2,
        source: { teamsPerCourt: 4, roundsPerBracket: 1, qualifiersPerRound: 2, hasPlan: false },
      },
    });
    expect(state.configSource).toEqual({
      teamsPerCourt: 4, roundsPerBracket: 1, qualifiersPerRound: 2, hasPlan: false,
    });
  });

  it('chave publicada antes da origem existir devolve null — não um palpite', () => {
    const state = kocRoundStateFrom({
      kocState: { teamIds: ['a', 'b', 'c'] },
      kocConfig: { durationSec: 900, teamsPerCourt: 4, roundsPerBracket: 1, qualifiersPerRound: 2 },
    });
    expect(state.configSource).toBeNull();
  });
});
